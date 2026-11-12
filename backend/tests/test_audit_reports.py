import json

import pytest
from app import create_app
from app.config import Config
from app.models import db
from app.models.document import UploadedDocument
from app.models.extracted_terms import ExtractedTerms
from app.models.subscription import PlanSnapshot
from app.models.verification import VerificationAudit
from app.models.webhook_event import WebhookEvent


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    RATELIMIT_ENABLED = False
    PAYPAL_MODE = 'sandbox'
    PAYPAL_BASE_URL = 'https://api-m.sandbox.paypal.com'


@pytest.fixture
def client(tmp_path):
    class TempConfig(TestConfig):
        UPLOAD_FOLDER = tmp_path / 'uploads'

    app = create_app(TempConfig)
    with app.app_context():
        yield app.test_client()


FIELD_WITH_QUOTE = {
    'field_name': 'regular_price',
    'label': 'Regular / Renewal Price',
    'advertised_value': '14.99',
    'actual_value': '14.99',
    'comparison_status': 'MATCH',
    'explanation': 'Regular / Renewal Price matches at 14.99 USD.',
    'evidence': None,
}
def _seed_document(document_id='DOC-EVIDENCE-1', with_evidence=True):
    db.session.add(UploadedDocument(
        id=document_id,
        original_filename='cloudsync-promo.pdf',
        stored_filename=document_id + '.pdf',
        mime_type='application/pdf',
        file_size_bytes=2048,
        sha256_hash='a' * 64,
    ))
    evidence_by_field = (
        {'regular_price': ['Small print: standard rate of $14.99 billed monthly.'],
         'billing_frequency': ['Billed monthly.'],
         'currency': ['All prices in USD.']}
        if with_evidence else {}
    )
    db.session.add(ExtractedTerms(
        id='TERMS-' + document_id,
        document_id=document_id,
        product_name='CloudSync Enterprise Tier',
        currency='USD',
        introductory_price='9.99',
        introductory_cycles=3,
        regular_price='14.99',
        billing_frequency='MONTH',
        frequency_interval=1,
        trial_duration_days=14,
        setup_fee='0.00',
        confidence_score=0.97,
        evidence_quotes_json=json.dumps({
            'evidence_quotes': ['Small print: standard rate of $14.99 billed monthly.'],
            'evidence_by_field': evidence_by_field,
        }),
        uncertainty_flags_json=json.dumps([]),
        ai_model='gemini-2.5-flash',
    ))
    db.session.commit()
    return document_id


def _seed_audit(audit_id, document_id, verdict='VERIFIED', delta=None, plan_id='P-AUDIT-1'):
    db.session.add(VerificationAudit(
        id=audit_id,
        document_id=document_id,
        paypal_plan_id=plan_id,
        plan_fingerprint='f' * 64,
        verdict=verdict,
        field_diffs_json=json.dumps([FIELD_WITH_QUOTE]),
        financial_delta_first_year=delta,
    ))
    db.session.commit()
    return audit_id


def _seed_plan(plan_id='P-EXPOSURE', currency='USD', price='24.99'):
    db.session.add(PlanSnapshot(
        plan_id=plan_id,
        product_id='PROD-' + plan_id,
        name='Plan ' + plan_id,
        status='ACTIVE',
        currency=currency,
        regular_price=price,
        billing_frequency='MONTH',
        fingerprint='d' * 64,
        canonical_json=json.dumps({}),
        raw_response_json=json.dumps({'id': plan_id}),
    ))
    db.session.commit()
def test_audit_index_lists_persisted_audits_with_source_labels(client):
    document_id = _seed_document()
    _seed_audit('AUD-INDEX-1', document_id, delta='0.00')

    response = client.get('/api/integrity/audits')

    assert response.status_code == 200
    payload = response.get_json()
    assert payload['source'] == 'sqlite'
    assert payload['total'] == 1
    row = payload['audits'][0]
    assert row['audit_id'] == 'AUD-INDEX-1'
    assert row['source_type'] == 'DOCUMENT_UPLOAD'
    assert row['source_label'] == 'Uploaded Document • Gemini Extraction'
    assert row['evidence_quote_count'] == 3
    assert row['verdict'] == 'VERIFIED'


def test_audit_report_returns_stored_quotations(client):
    document_id = _seed_document()
    _seed_audit('AUD-REPORT-1', document_id, delta='0.00')

    response = client.get('/api/integrity/audits/AUD-REPORT-1')

    assert response.status_code == 200
    report = response.get_json()['report']
    assert report['audit_id'] == 'AUD-REPORT-1'
    assert report['source_file'] == 'cloudsync-promo.pdf'
    assert 'Small print: standard rate of $14.99 billed monthly.' in report['supporting_evidence']
    assert report['evidence_status'] == 'COMPLETE'
    assert report['evidence_complete'] is True
    assert report['ai_model'] == 'gemini-2.5-flash'
    assert report['fields'][0]['field_name'] == 'regular_price'


def test_unknown_audit_report_returns_404(client):
    response = client.get('/api/integrity/audits/AUD-DOES-NOT-EXIST')

    assert response.status_code == 404
    assert response.get_json()['error'] == 'Not Found'


def test_verified_audit_without_quotations_is_never_presented_as_verified(client):
    document_id = _seed_document('DOC-NO-EVIDENCE', with_evidence=False)
    _seed_audit('AUD-NO-EVIDENCE', document_id, delta='0.00')

    response = client.get('/api/integrity/audits/AUD-NO-EVIDENCE')

    assert response.status_code == 200
    report = response.get_json()['report']
    assert report['stored_verdict'] == 'VERIFIED'
    assert report['verdict'] == 'REQUIRES REVIEW'
    assert report['verdict_downgraded'] is True
    assert report['evidence_status'] == 'INCOMPLETE'
    # Only fields the audit actually evaluated can be probed for evidence.
    assert report['matched_fields_without_evidence'] == ['regular_price']
    assert 'regular price' in report['evidence_message']


def test_manual_demo_audit_is_labelled_and_keeps_its_decimal_verdict(client):
    db.session.add(VerificationAudit(
        id='AUD-MANUAL-LABEL',
        document_id=None,
        paypal_plan_id='P-MANUAL-1',
        plan_fingerprint='b' * 64,
        verdict='VERIFIED',
        field_diffs_json=json.dumps([FIELD_WITH_QUOTE]),
        financial_delta_first_year='0.00',
    ))
    db.session.commit()

    report = client.get('/api/integrity/audits/AUD-MANUAL-LABEL').get_json()['report']

    assert report['source_type'] == 'MANUAL_DEMO'
    assert report['source_label'] == 'Manual Demo Input – Not AI Extracted'
    assert report['evidence_status'] == 'NOT_APPLICABLE'
    assert report['verdict'] == 'VERIFIED'
    assert report['verdict_downgraded'] is False
def test_evidence_explorer_exposes_persisted_quotations_and_source_labels(client):
    document_id = _seed_document()
    _seed_audit('AUD-EVIDENCE-1', document_id, verdict='MISMATCH DETECTED', delta='90.00')

    payload = client.get('/api/evidence').get_json()

    records = {}
    for record in payload['records']:
        records.setdefault(record['category'], record)
    promo = records['PROMO_ADVERTISEMENT']
    assert promo['source_label'] == 'Uploaded Document • Gemini Extraction'
    assert promo['evidence_by_field']['regular_price'] == [
        'Small print: standard rate of $14.99 billed monthly.'
    ]
    assert promo['verdict'] == 'MISMATCH DETECTED'
    assert promo['audit_id'] == 'AUD-EVIDENCE-1'
    assert promo['plan_linked'] == 'P-AUDIT-1'

    audit = records['VERIFICATION_AUDIT']
    assert audit['source_type'] == 'DOCUMENT_UPLOAD'
    assert 'Small print: standard rate of $14.99 billed monthly.' in audit['evidence_quotes']


def test_extracted_document_without_audit_is_never_reported_as_verified(client):
    _seed_document('DOC-UNAUDITED')

    payload = client.get('/api/evidence').get_json()

    promo = next(
        record for record in payload['records']
        if record['category'] == 'PROMO_ADVERTISEMENT'
    )
    # No audit means the quotations were never assessed, so the record must
    # never read as verified or as evidence-complete.
    assert promo['verdict'] == 'REQUIRES REVIEW'
    assert promo['audit_id'] is None
    assert promo['evidence_status'] == 'UNAUDITED'
    assert payload['counts']['verified'] == 0


def test_plan_snapshots_are_reported_as_not_audited(client):
    _seed_plan('P-SNAPSHOT-ONLY')

    payload = client.get('/api/evidence').get_json()

    snapshot = next(
        record for record in payload['records']
        if record['category'] == 'PLAN_SNAPSHOT'
    )
    assert snapshot['verdict'] == 'NOT AUDITED'
    assert snapshot['source_label'] == 'PayPal Sandbox Plan Snapshot'


def test_dashboard_sums_stored_decimals_per_currency(client):
    _seed_plan('P-EXPOSURE')
    for index, delta in enumerate(('90.00', '-10.00', None)):
        db.session.add(VerificationAudit(
            id='AUD-EXPOSURE-' + str(index),
            document_id=None,
            paypal_plan_id='P-EXPOSURE',
            plan_fingerprint='e' * 64,
            verdict='MISMATCH DETECTED',
            field_diffs_json=json.dumps([FIELD_WITH_QUOTE]),
            financial_delta_first_year=delta,
        ))
    db.session.commit()

    payload = client.get('/api/dashboard').get_json()

    assert payload['counts']['total'] == 3
    assert payload['counts']['manual_demo_audits'] == 3
    assert payload['counts']['document_audits'] == 0
    assert payload['counts']['document_verified'] == 0
    assert payload['trend'] == []
    exposure = payload['financial_exposure'][0]
    assert exposure['currency'] == 'USD'
    assert exposure['net_difference'] == '80.00'
    assert exposure['total_overcharge'] == '90.00'
    assert exposure['audits_with_figures'] == 2
    assert payload['recent_audits'][0]['source_label'] == 'Manual Demo Input – Not AI Extracted'


def test_dashboard_reports_document_and_manual_sources_separately(client):
    document_id = _seed_document()
    _seed_audit('AUD-SOURCE-DOC', document_id)
    db.session.add(VerificationAudit(
        id='AUD-SOURCE-MANUAL',
        document_id=None,
        paypal_plan_id='P-SOURCE-MANUAL',
        plan_fingerprint='f' * 64,
        verdict='REQUIRES REVIEW',
        field_diffs_json=json.dumps([]),
    ))
    db.session.commit()

    payload = client.get('/api/dashboard').get_json()

    assert payload['counts']['document_audits'] == 1
    assert payload['counts']['manual_demo_audits'] == 1
    assert payload['counts']['document_verified'] == 1
    assert len(payload['trend']) == 1
    sources = {row['audit_id']: row['source_type'] for row in payload['recent_audits']}
    assert sources['AUD-SOURCE-DOC'] == 'DOCUMENT_UPLOAD'
    assert sources['AUD-SOURCE-MANUAL'] == 'MANUAL_DEMO'


def test_persisted_plan_snapshots_endpoint_makes_no_provider_call(client):
    _seed_plan('P-PERSISTED')

    payload = client.get('/api/paypal/plans-snapshots').get_json()

    assert payload['source'] == 'sqlite'
    assert payload['plans'][0]['id'] == 'P-PERSISTED'
    assert payload['plans'][0]['currency'] == 'USD'


def test_webhook_log_lists_only_persisted_verified_events(client):
    db.session.add(WebhookEvent(
        transmission_id='TX-LOGGED',
        event_id='WH-LOGGED',
        event_type='BILLING.SUBSCRIPTION.ACTIVATED',
        summary='Subscription activated',
        raw_payload_json=json.dumps({'id': 'WH-LOGGED'}),
    ))
    db.session.commit()

    payload = client.get('/api/paypal/webhooks').get_json()

    assert payload['signature_verified_only'] is True
    assert payload['events'][0]['transmission_id'] == 'TX-LOGGED'
    assert payload['events'][0]['event_type'] == 'BILLING.SUBSCRIPTION.ACTIVATED'
