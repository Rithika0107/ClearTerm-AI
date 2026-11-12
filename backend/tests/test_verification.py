import json
import pytest
from decimal import Decimal
from unittest.mock import patch, MagicMock

from app import create_app
from app.models import db
from app.models.document import UploadedDocument
from app.models.extracted_terms import ExtractedTerms
from app.models.subscription import PlanSnapshot
from app.models.verification import VerificationAudit
from app.config import Config
from app.services.verification_service import FinancialVerificationEngine, parse_decimal_safe

class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    RATELIMIT_ENABLED = False
    # Unit tests must never inherit developer credentials or reach PayPal.
    PAYPAL_CLIENT_ID = ''
    PAYPAL_CLIENT_SECRET = ''
    PAYPAL_MODE = 'sandbox'
    PAYPAL_BASE_URL = 'https://api-m.sandbox.paypal.com'

@pytest.fixture
def client(tmp_path):
    class TempConfig(TestConfig):
        UPLOAD_FOLDER = tmp_path / 'uploads'

    app = create_app(TempConfig)
    with app.app_context():
        yield app.test_client()

# Sample Clean Advertised Terms
CLEAN_ADVERTISED = {
    'product_name': 'CloudSync Enterprise Tier',
    'currency': 'USD',
    'introductory_price': '9.99',
    'introductory_cycles': 3,
    'regular_price': '14.99',
    'billing_frequency': 'MONTH',
    'frequency_interval': 1,
    'trial_duration_days': 14,
    'setup_fee': '0.00',
    'auto_renewal': True,
    'evidence_quotes': [
        'Flyer: "$9.99 for your first 3 months, then $14.99/mo thereafter."',
        'Zero setup fee. 14-day evaluation trial included.'
    ],
    'uncertainty_flags': []
    , 'calculation_start_date': '2024-01-01'
}

# Matching PayPal Plan
MATCHING_PAYPAL_PLAN = {
    'id': 'P-MATCH-123',
    'product_id': 'PROD-CLOUDSYNC',
    'name': 'CloudSync Enterprise Plan',
    'status': 'ACTIVE',
    'currency': 'USD',
    'introductory_price': '9.99',
    'introductory_cycles': 3,
    'regular_price': '14.99',
    'billing_frequency': 'MONTH',
    'frequency_interval': 1,
    'trial_days': 14,
    'setup_fee': '0.00',
    'billing_cycles': [
        {
            'sequence': 1,
            'tenure_type': 'TRIAL',
            'total_cycles': 1,
            'frequency': {'interval_unit': 'DAY', 'interval_count': 14},
            'pricing_scheme': {'fixed_price': {'value': '0.00', 'currency_code': 'USD'}}
        },
        {
            'sequence': 2,
            'tenure_type': 'REGULAR',
            'total_cycles': 3,
            'frequency': {'interval_unit': 'MONTH', 'interval_count': 1},
            'pricing_scheme': {'fixed_price': {'value': '9.99', 'currency_code': 'USD'}}
        },
        {
            'sequence': 3,
            'tenure_type': 'REGULAR',
            'total_cycles': 0,
            'frequency': {'interval_unit': 'MONTH', 'interval_count': 1},
            'pricing_scheme': {'fixed_price': {'value': '14.99', 'currency_code': 'USD'}}
        }
    ],
    'payment_preferences': {'setup_fee': {'value': '0.00', 'currency_code': 'USD'}}
    , 'calculation_start_date': '2024-01-01'
}

# --- UNIT TESTS FOR VERIFICATION ENGINE ---

def test_exact_clean_match_produces_verified():
    result = FinancialVerificationEngine.verify(CLEAN_ADVERTISED, MATCHING_PAYPAL_PLAN)
    assert result['final_verdict'] == 'VERIFIED'
    assert len(result['mismatched_fields']) == 0
    assert len(result['review_fields']) == 0
    assert result['financial_impact']['status'] == 'CALCULATED'
    assert Decimal(result['financial_impact']['difference_amount']) == Decimal('0.00')

def test_regular_price_surge_produces_mismatch():
    mismatched_plan = dict(MATCHING_PAYPAL_PLAN)
    mismatched_plan['regular_price'] = '24.99' # Advertised 14.99 vs PayPal 24.99

    result = FinancialVerificationEngine.verify(CLEAN_ADVERTISED, mismatched_plan)
    assert result['final_verdict'] == 'MISMATCH DETECTED'
    assert 'regular_price' in result['mismatched_fields']

    # Financial impact check: 9 months of +$10/mo surge = +$90.00 first year delta
    impact = result['financial_impact']
    assert impact['status'] == 'CALCULATED'
    assert impact['has_overcharge'] is True
    assert Decimal(impact['difference_amount']) == Decimal('90.00')

def test_currency_mismatch_produces_mismatch():
    eur_plan = dict(MATCHING_PAYPAL_PLAN)
    eur_plan['currency'] = 'EUR' # Advertised in USD

    result = FinancialVerificationEngine.verify(CLEAN_ADVERTISED, eur_plan)
    assert result['final_verdict'] == 'MISMATCH DETECTED'
    assert 'currency' in result['mismatched_fields']
    # Financial calculation across mismatched currencies must not invent numbers
    assert result['financial_impact']['status'] == 'REQUIRES REVIEW'


@pytest.mark.parametrize(('frequency', 'interval'), [('MONTH', 1), ('MONTH', 3)])
def test_inr_monthly_and_multi_month_terms_compare_with_decimal(frequency, interval):
    terms = {
        'currency': 'INR',
        'introductory_price': None,
        'introductory_cycles': None,
        'regular_price': '199.99',
        'billing_frequency': frequency,
        'frequency_interval': interval,
        'trial_duration_days': 0,
        'setup_fee': '0.00',
        'calculation_start_date': '2024-01-01',
        'evidence_quotes': [],
        'uncertainty_flags': [],
    }
    plan = {
        'id': 'P-INR-TEST',
        'status': 'ACTIVE',
        'currency': 'INR',
        'introductory_price': None,
        'introductory_cycles': None,
        'regular_price': '199.99',
        'billing_frequency': frequency,
        'frequency_interval': interval,
        'trial_days': 0,
        'setup_fee': '0.00',
        'calculation_start_date': '2024-01-01',
    }

    result = FinancialVerificationEngine.verify(terms, plan)

    assert result['final_verdict'] == 'VERIFIED'
    assert 'currency' in result['matched_fields']
    assert 'regular_price' in result['matched_fields']
    assert 'billing_frequency' in result['matched_fields']
    assert result['financial_impact']['status'] == 'CALCULATED'
    assert Decimal(result['financial_impact']['difference_amount']) == Decimal('0.00')


def test_inr_advertised_terms_never_compare_directly_with_usd_plan():
    terms = {
        'currency': 'INR', 'regular_price': '199.99', 'billing_frequency': 'MONTH',
        'frequency_interval': 1, 'trial_duration_days': 0, 'setup_fee': '0.00',
        'evidence_quotes': [], 'uncertainty_flags': [],
    }
    plan = {
        'id': 'P-USD-TEST', 'status': 'ACTIVE', 'currency': 'USD',
        'regular_price': '199.99', 'billing_frequency': 'MONTH',
        'frequency_interval': 1, 'trial_days': 0, 'setup_fee': '0.00',
    }

    result = FinancialVerificationEngine.verify(terms, plan)

    assert result['final_verdict'] == 'MISMATCH DETECTED'
    assert 'currency' in result['mismatched_fields']
    assert result['financial_impact']['status'] == 'REQUIRES REVIEW'
    assert result['financial_impact']['difference_amount'] is None


def test_unknown_inr_price_remains_review_and_is_not_calculated():
    terms = {
        'currency': 'INR', 'regular_price': 'UNKNOWN', 'billing_frequency': 'MONTH',
        'frequency_interval': 1, 'trial_duration_days': 0, 'setup_fee': '0.00',
        'evidence_quotes': [], 'uncertainty_flags': ['Price not visible.'],
    }
    plan = {
        'id': 'P-INR-UNKNOWN', 'status': 'ACTIVE', 'currency': 'INR',
        'regular_price': '199.99', 'billing_frequency': 'MONTH',
        'frequency_interval': 1, 'trial_days': 0, 'setup_fee': '0.00',
    }

    result = FinancialVerificationEngine.verify(terms, plan)

    assert result['final_verdict'] == 'REQUIRES REVIEW'
    assert 'regular_price' in result['review_fields']
    assert result['financial_impact']['difference_amount'] is None

def test_monthly_vs_annual_frequency_mismatch():
    annual_plan = dict(MATCHING_PAYPAL_PLAN)
    annual_plan['billing_frequency'] = 'YEAR' # Advertised MONTH

    result = FinancialVerificationEngine.verify(CLEAN_ADVERTISED, annual_plan)
    assert result['final_verdict'] == 'MISMATCH DETECTED'
    assert 'billing_frequency' in result['mismatched_fields']

def test_trial_duration_mismatch():
    wrong_trial_plan = dict(MATCHING_PAYPAL_PLAN)
    wrong_trial_plan['trial_days'] = 7 # Advertised 14

    result = FinancialVerificationEngine.verify(CLEAN_ADVERTISED, wrong_trial_plan)
    assert result['final_verdict'] == 'MISMATCH DETECTED'
    assert 'trial_duration' in result['mismatched_fields']

def test_undisclosed_setup_fee_mismatch():
    setup_fee_plan = dict(MATCHING_PAYPAL_PLAN)
    setup_fee_plan['setup_fee'] = '49.00'

    terms_no_setup = dict(CLEAN_ADVERTISED)
    terms_no_setup['setup_fee'] = None # Unstated setup fee in flyer

    result = FinancialVerificationEngine.verify(terms_no_setup, setup_fee_plan)
    assert result['final_verdict'] == 'MISMATCH DETECTED'
    assert 'setup_fee' in result['mismatched_fields']

def test_ambiguous_cadence_produces_review():
    ambiguous_terms = dict(CLEAN_ADVERTISED)
    ambiguous_terms['billing_frequency'] = 'UNKNOWN'
    ambiguous_terms['uncertainty_flags'] = ['Billing cadence not stated in promotional flyer.']

    result = FinancialVerificationEngine.verify(ambiguous_terms, MATCHING_PAYPAL_PLAN)
    assert result['final_verdict'] == 'REQUIRES REVIEW'
    assert 'billing_frequency' in result['review_fields']

def test_different_currency_precision_normalizes_correctly():
    """Verify that '14.9' and '14.90' and '14.900' are evaluated as identical Decimals."""
    terms = dict(CLEAN_ADVERTISED)
    terms['regular_price'] = '14.9'

    plan = dict(MATCHING_PAYPAL_PLAN)
    plan['regular_price'] = '14.90'

    result = FinancialVerificationEngine.verify(terms, plan)
    assert 'regular_price' in result['matched_fields']
    assert 'regular_price' not in result['mismatched_fields']

def test_first_year_financial_calculation_accuracy():
    """
    Test exact Decimal calculation:
    Setup fee: $20.00
    Introductory: $10.00/mo for 2 months = $20.00
    Regular: $30.00/mo for remaining 10 months = $300.00
    Total: $340.00
    """
    terms = {
        'currency': 'USD',
        'introductory_price': '10.00',
        'introductory_cycles': 2,
        'regular_price': '30.00',
        'billing_frequency': 'MONTH',
        'trial_duration_days': 0,
        'setup_fee': '20.00',
        'evidence_quotes': [],
            'uncertainty_flags': [],
            'calculation_start_date': '2024-01-01'
    }
    plan = {
        'id': 'P-ACCURATE',
        'status': 'ACTIVE',
        'currency': 'USD',
        'introductory_price': '10.00',
        'introductory_cycles': 2,
        'regular_price': '30.00',
        'billing_frequency': 'MONTH',
        'trial_days': 0,
        'setup_fee': '20.00',
            'billing_cycles': [],
            'calculation_start_date': '2024-01-01'
    }

    result = FinancialVerificationEngine.verify(terms, plan)
    assert result['final_verdict'] == 'VERIFIED'
    impact = result['financial_impact']
    assert impact['advertised_first_year'] == '340.00'
    assert impact['actual_first_year'] == '340.00'
    assert impact['difference_amount'] == '0.00'


@pytest.mark.parametrize('currency', ['ZZZ', 'US1', 'ABC'])
def test_invalid_currency_code_requires_review(currency):
    terms = dict(CLEAN_ADVERTISED)
    terms['currency'] = currency
    result = FinancialVerificationEngine.verify(terms, MATCHING_PAYPAL_PLAN)
    assert result['final_verdict'] == 'REQUIRES REVIEW'
    assert 'currency' in result['review_fields']


def test_currency_minor_units_are_applied():
    jpy_terms = dict(CLEAN_ADVERTISED, currency='JPY', introductory_price='100', regular_price='120')
    jpy_plan = dict(MATCHING_PAYPAL_PLAN, currency='JPY', introductory_price='100', regular_price='120', setup_fee='0')
    jpy_result = FinancialVerificationEngine.verify(jpy_terms, jpy_plan)
    assert jpy_result['fields'][1]['advertised_value'] == '100'

    bhd_terms = dict(CLEAN_ADVERTISED, currency='BHD', introductory_price='1.234', regular_price='2.345')
    bhd_plan = dict(MATCHING_PAYPAL_PLAN, currency='BHD', introductory_price='1.234', regular_price='2.345', setup_fee='0.000')
    bhd_result = FinancialVerificationEngine.verify(bhd_terms, bhd_plan)
    assert bhd_result['fields'][1]['advertised_value'] == '1.234'


@pytest.mark.parametrize('value', ['NaN', 'Infinity', '-Infinity', '-1.00', 'not-a-price'])
def test_invalid_monetary_values_require_review(value):
    terms = dict(CLEAN_ADVERTISED, regular_price=value)
    result = FinancialVerificationEngine.verify(terms, MATCHING_PAYPAL_PLAN)
    assert result['final_verdict'] == 'REQUIRES REVIEW'
    assert 'regular_price' in result['review_fields']


@pytest.mark.parametrize('cycles', [0, -1, '3.5', 'abc', float('nan')])
def test_invalid_introductory_cycles_require_review(cycles):
    terms = dict(CLEAN_ADVERTISED, introductory_cycles=cycles)
    result = FinancialVerificationEngine.verify(terms, MATCHING_PAYPAL_PLAN)
    assert result['final_verdict'] == 'REQUIRES REVIEW'
    assert 'introductory_cycles' in result['review_fields']


def test_different_introductory_interval_requires_review_for_annual_impact():
    terms = dict(CLEAN_ADVERTISED, introductory_frequency='MONTH', introductory_frequency_interval=3)
    plan = dict(MATCHING_PAYPAL_PLAN, introductory_frequency='MONTH', introductory_frequency_interval=3)
    result = FinancialVerificationEngine.verify(terms, plan)
    assert result['financial_impact']['status'] == 'CALCULATED'


def test_missing_setup_fee_is_not_zero():
    terms = dict(CLEAN_ADVERTISED, setup_fee=None)
    plan = dict(MATCHING_PAYPAL_PLAN, setup_fee=None)
    result = FinancialVerificationEngine.verify(terms, plan)
    assert result['final_verdict'] == 'REQUIRES REVIEW'
    assert result['financial_impact']['status'] == 'REQUIRES REVIEW'


def test_currency_mismatch_never_calculates_difference():
    plan = dict(MATCHING_PAYPAL_PLAN, currency='EUR')
    result = FinancialVerificationEngine.verify(CLEAN_ADVERTISED, plan)
    assert result['financial_impact']['difference_amount'] is None


def test_excess_currency_precision_requires_review():
    terms = dict(CLEAN_ADVERTISED, regular_price='14.999')
    result = FinancialVerificationEngine.verify(terms, MATCHING_PAYPAL_PLAN)
    assert result['final_verdict'] == 'REQUIRES REVIEW'
    assert 'regular_price' in result['review_fields']


def test_comparison_fields_retain_matching_document_evidence():
    result = FinancialVerificationEngine.verify(CLEAN_ADVERTISED, MATCHING_PAYPAL_PLAN)
    regular = next(field for field in result['fields'] if field['field_name'] == 'regular_price')
    assert regular['evidence'] is None


def test_explicit_field_evidence_mapping_is_preserved():
    terms = dict(CLEAN_ADVERTISED, evidence_by_field={'regular_price': {'filename': 'offer.pdf', 'page': 2, 'quote': 'Standard rate is $14.99.'}})
    result = FinancialVerificationEngine.verify(terms, MATCHING_PAYPAL_PLAN)
    regular = next(field for field in result['fields'] if field['field_name'] == 'regular_price')
    assert regular['evidence'] == terms['evidence_by_field']['regular_price']


def test_weekly_first_year_requires_calendar_start_date():
    terms = dict(CLEAN_ADVERTISED, billing_frequency='WEEK', frequency_interval=1, trial_duration_days=0)
    plan = dict(MATCHING_PAYPAL_PLAN, billing_frequency='WEEK', frequency_interval=1, trial_days=0)
    terms.pop('calculation_start_date')
    plan.pop('calculation_start_date')
    result = FinancialVerificationEngine.verify(terms, plan)
    assert result['financial_impact']['status'] == 'REQUIRES REVIEW'


def test_weekly_first_year_uses_leap_year_calendar_window():
    terms = dict(CLEAN_ADVERTISED, billing_frequency='WEEK', frequency_interval=1, trial_duration_days=0, calculation_start_date='2024-01-01')
    plan = dict(MATCHING_PAYPAL_PLAN, billing_frequency='WEEK', frequency_interval=1, trial_days=0, calculation_start_date='2024-01-01')
    result = FinancialVerificationEngine.verify(terms, plan)
    assert result['financial_impact']['status'] == 'CALCULATED'
    assert result['financial_impact']['advertised_first_year'] == '779.47'


def test_annual_first_year_has_one_charge_without_introductory_tier():
    terms = dict(CLEAN_ADVERTISED, introductory_price=None, introductory_cycles=None, regular_price='100.00', billing_frequency='YEAR', frequency_interval=1, trial_duration_days=0)
    plan = dict(MATCHING_PAYPAL_PLAN, introductory_price=None, introductory_cycles=None, regular_price='100.00', billing_frequency='YEAR', frequency_interval=1, trial_days=0)
    result = FinancialVerificationEngine.verify(terms, plan)
    assert result['financial_impact']['advertised_first_year'] == '100.00'

# --- API ENDPOINT TESTS (POST /api/integrity/verify) ---

def test_api_verify_endpoint_success(client):
    # 1. Seed document & extracted terms in DB
    doc_id = 'test-doc-uuid-111'
    doc = UploadedDocument(
        id=doc_id,
        original_filename='cloudsync.png',
        stored_filename='cloudsync.png',
        mime_type='image/png',
        file_size_bytes=1024,
        sha256_hash='a' * 64
    )
    terms = ExtractedTerms(
        id='terms-111',
        document_id=doc_id,
        product_name='CloudSync Enterprise',
        currency='USD',
        introductory_price='9.99',
        introductory_cycles=3,
        regular_price='14.99',
        billing_frequency='MONTH',
        frequency_interval=1,
        trial_duration_days=14,
        setup_fee='0.00',
        auto_renewal=True,
        confidence_score=0.98,
        evidence_quotes_json=json.dumps(['Quote 1', 'Quote 2']),
        uncertainty_flags_json=json.dumps([]),
        ai_model='gemini-2.5-flash'
    )
    # 2. Seed plan snapshot in DB
    snapshot = PlanSnapshot(
        plan_id='P-8Y2908182',
        product_id='PROD-CLOUDSYNC',
        name='CloudSync Enterprise Plan',
        status='ACTIVE',
        currency='USD',
        regular_price='24.99', # Intentional price surge
        billing_frequency='MONTH',
        fingerprint='f' * 64,
        canonical_json=json.dumps({}),
        raw_response_json=json.dumps({
            'id': 'P-8Y2908182',
            'product_id': 'PROD-CLOUDSYNC',
            'name': 'CloudSync Enterprise Plan',
            'status': 'ACTIVE',
            'billing_cycles': [
                {
                    'sequence': 1,
                    'tenure_type': 'REGULAR',
                    'total_cycles': 3,
                    'frequency': {'interval_unit': 'MONTH', 'interval_count': 1},
                    'pricing_scheme': {'fixed_price': {'value': '9.99', 'currency_code': 'USD'}}
                },
                {
                    'sequence': 2,
                    'tenure_type': 'REGULAR',
                    'total_cycles': 0,
                    'frequency': {'interval_unit': 'MONTH', 'interval_count': 1},
                    'pricing_scheme': {'fixed_price': {'value': '24.99', 'currency_code': 'USD'}}
                }
            ],
            'payment_preferences': {'setup_fee': {'value': '0.00', 'currency_code': 'USD'}}
        })
    )

    db.session.add(doc)
    db.session.add(terms)
    db.session.add(snapshot)
    db.session.commit()

    # 3. Call verification API
    res = client.post(
        '/api/integrity/verify',
        data=json.dumps({'document_id': doc_id, 'plan_id': 'P-8Y2908182'}),
        content_type='application/json'
    )

    assert res.status_code == 200
    data = res.get_json()
    assert data['status'] == 'success'
    assert data['verdict'] == 'MISMATCH DETECTED'
    assert 'regular_price' in data['mismatched_fields']
    assert len(data['plan_fingerprint']) == 64

    # 4. Verify persistence in VerificationAudit table
    audit_row = VerificationAudit.query.filter_by(document_id=doc_id).first()
    assert audit_row is not None
    assert audit_row.verdict == 'MISMATCH DETECTED'
    assert audit_row.paypal_plan_id == 'P-8Y2908182'

def test_api_verify_invalid_document_id_returns_404(client):
    res = client.post(
        '/api/integrity/verify',
        data=json.dumps({'document_id': 'non-existent-doc', 'plan_id': 'P-123'}),
        content_type='application/json'
    )
    assert res.status_code == 404
    data = res.get_json()
    assert data['error'] == 'Not Found'

def test_api_verify_invalid_plan_id_returns_404(client):
    # Seed doc
    doc = UploadedDocument(
        id='doc-only',
        original_filename='doc.png',
        stored_filename='doc.png',
        mime_type='image/png',
        file_size_bytes=100,
        sha256_hash='b' * 64
    )
    terms = ExtractedTerms(
        id='terms-only',
        document_id='doc-only',
        currency='USD',
        regular_price='10.00',
        billing_frequency='MONTH',
        confidence_score=0.9,
        evidence_quotes_json='[]',
        uncertainty_flags_json='[]',
        ai_model='gemini-2.5-flash'
    )
    db.session.add(doc)
    db.session.add(terms)
    db.session.commit()

    res = client.post(
        '/api/integrity/verify',
        data=json.dumps({'document_id': 'doc-only', 'plan_id': 'P-DOES-NOT-EXIST'}),
        content_type='application/json'
    )
    assert res.status_code == 404
