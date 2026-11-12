import time
import json
import pytest
from unittest.mock import patch, MagicMock
import requests

from app import create_app
from app.models import db
from app.models.document import UploadedDocument
from app.models.subscription import PlanSnapshot, SubscriptionRecord
from app.models.verification import VerificationAudit
from app.models.extracted_terms import ExtractedTerms
from app.models.webhook_event import WebhookEvent
from app.config import Config
from app.services.paypal_service import (
    PayPalClient,
    PayPalConfigurationError,
    PayPalAuthError,
    PayPalAPIError,
    PayPalTimeoutError,
)
from app.services.verification_service import is_paypal_subscription_currency_supported

class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    RATELIMIT_ENABLED = False
    PAYPAL_MODE = 'sandbox'
    PAYPAL_CLIENT_ID = 'test_client_id_1234'
    PAYPAL_CLIENT_SECRET = 'test_client_secret_5678'
    PAYPAL_BASE_URL = 'https://api-m.sandbox.paypal.com'

@pytest.fixture
def client(tmp_path):
    class TempConfig(TestConfig):
        UPLOAD_FOLDER = tmp_path / 'uploads'

    app = create_app(TempConfig)
    with app.app_context():
        yield app.test_client()


def _create_test_document(document_id='DOC-TEST-UPLOADED'):
    db.session.add(UploadedDocument(
        id=document_id,
        original_filename='manual-test-offer.pdf',
        stored_filename=f'{document_id}.pdf',
        mime_type='application/pdf',
        file_size_bytes=1,
        sha256_hash='a' * 64,
    ))
    db.session.flush()
    return document_id


def _add_eligible_extracted_terms(document_id, currency='USD', regular_price='24.99'):
    quote = f'Subscription renews monthly for {regular_price} {currency}.'
    db.session.add(ExtractedTerms(
        id=f'TERMS-{document_id}', document_id=document_id,
        product_name='Uploaded QA offer', currency=currency, regular_price=regular_price,
        billing_frequency='MONTH', frequency_interval=1, confidence_score=0.99,
        evidence_quotes_json=json.dumps({
            'evidence_quotes': [quote],
            'evidence_by_field': {name: [quote] for name in ('regular_price', 'billing_frequency', 'currency')},
        }), uncertainty_flags_json='[]', ai_model='test-fixture',
    ))


def _eligible_fields_json(currency='USD', regular_price='24.99'):
    return json.dumps([
        {'field_name': 'regular_price', 'comparison_status': 'MATCH', 'advertised_value': regular_price, 'actual_value': regular_price},
        {'field_name': 'billing_frequency', 'comparison_status': 'MATCH', 'advertised_value': 'MONTH', 'actual_value': 'MONTH'},
        {'field_name': 'currency', 'comparison_status': 'MATCH', 'advertised_value': currency, 'actual_value': currency},
    ])

# Sample PayPal Plan JSON for deterministic fingerprint testing
SAMPLE_PAYPAL_PLAN = {
    'id': 'P-8Y2908182',
    'product_id': 'PROD-CLOUDSYNC',
    'name': 'CloudSync Enterprise Plan',
    'status': 'ACTIVE',
    'description': 'CloudSync Enterprise Tier with 3-month intro discount',
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
    'payment_preferences': {
        'setup_fee': {'value': '0.00', 'currency_code': 'USD'},
        'auto_bill_outstanding': True,
    }
}

# --- UNIT TESTS FOR PAYPAL SERVICE ---

def test_oauth_token_acquisition_and_caching():
    paypal = PayPalClient(client_id='mock_id', client_secret='mock_secret')

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        'access_token': 'A21_MOCK_BEARER_TOKEN_999',
        'token_type': 'Bearer',
        'expires_in': 32400
    }

    with patch('requests.post', return_value=mock_resp) as mock_post:
        # First call fetches from API
        token1 = paypal.get_access_token()
        assert token1 == 'A21_MOCK_BEARER_TOKEN_999'
        assert mock_post.call_count == 1

        # Second immediate call uses in-memory cache without HTTP call
        token2 = paypal.get_access_token()
        assert token2 == 'A21_MOCK_BEARER_TOKEN_999'
        assert mock_post.call_count == 1

def test_oauth_token_auto_refresh_on_expiry():
    paypal = PayPalClient(client_id='mock_id', client_secret='mock_secret')

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        'access_token': 'NEW_REFRESHED_TOKEN_111',
        'expires_in': 3600
    }

    with patch('requests.post', return_value=mock_resp):
        # Seed an expired token
        paypal._cached_token = 'OLD_EXPIRED_TOKEN'
        paypal._token_expires_at = time.time() - 100 # expired

        fresh_token = paypal.get_access_token()
        assert fresh_token == 'NEW_REFRESHED_TOKEN_111'

def test_oauth_authentication_failure():
    paypal = PayPalClient(client_id='bad_id', client_secret='bad_secret')

    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.json.return_value = {
        'error': 'invalid_client',
        'error_description': 'Client Authentication failed'
    }

    with patch('requests.post', return_value=mock_resp):
        with pytest.raises(PayPalAuthError) as exc_info:
            paypal.get_access_token()
        assert 'invalid_client' in str(exc_info.value) or 'Client Authentication failed' in str(exc_info.value)

def test_oauth_timeout_handling():
    paypal = PayPalClient(client_id='id', client_secret='secret')
    with patch('requests.post', side_effect=requests.exceptions.Timeout("Connection timed out")):
        with pytest.raises(PayPalTimeoutError):
            paypal.get_access_token()

def test_oauth_malformed_response():
    paypal = PayPalClient(client_id='id', client_secret='secret')
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {'not_a_token': 123} # Missing access_token

    with patch('requests.post', return_value=mock_resp):
        with pytest.raises(PayPalAuthError):
            paypal.get_access_token()

def test_unconfigured_credentials_raises_error():
    paypal = PayPalClient(client_id='', client_secret='')
    with pytest.raises(PayPalConfigurationError):
        paypal.get_access_token()


def test_usd_remains_paypal_subscription_currency_and_inr_does_not():
    assert is_paypal_subscription_currency_supported('USD') is True
    assert is_paypal_subscription_currency_supported('INR') is False


def test_manual_demo_terms_use_decimal_engine_without_ai_evidence_and_cannot_checkout(client):
    actual_plan = PayPalClient()._format_plan_details(SAMPLE_PAYPAL_PLAN)
    manual_terms = {
        'plan_id': actual_plan['id'],
        'product_name': 'Manual QA offer',
        'currency': 'USD',
        'introductory_price': '9.99',
        'introductory_cycles': '3',
        'regular_price': '24.99',
        'billing_frequency': 'MONTH',
        'frequency_interval': '1',
        'trial_duration_days': '0',
        'setup_fee': '0.00',
    }

    with patch.object(PayPalClient, 'get_plan_details', return_value=actual_plan) as get_plan:
        response = client.post('/api/integrity/verify-manual', json=manual_terms)

    assert response.status_code == 200
    result = response.get_json()
    assert result['source_type'] == 'MANUAL_DEMO'
    assert result['source_label'] == 'Manual Demo Input – Not AI Extracted'
    assert result['verdict'] == 'VERIFIED'
    assert result['advertised_terms']['evidence_quotes'] == []
    assert result['advertised_terms']['evidence_by_field'] == {}
    assert 'confidence_score' not in result['advertised_terms']
    assert result['supporting_evidence'] == []
    get_plan.assert_called_once_with(actual_plan['id'])

    audit = db.session.get(VerificationAudit, result['audit_id'])
    assert audit.document_id is None
    with patch.object(PayPalClient, 'get_plan_details') as checkout_plan, \
         patch.object(PayPalClient, 'create_subscription') as create_subscription:
        checkout = client.post('/api/paypal/subscriptions/create', json={
            'plan_id': actual_plan['id'],
            'verification_id': audit.id,
            'consent': True,
        })

    assert checkout.status_code == 409
    assert checkout.get_json()['error'] == 'Manual Demo Checkout Blocked'
    checkout_plan.assert_not_called()
    create_subscription.assert_not_called()


def test_manual_demo_rejects_extraction_metadata(client):
    with patch.object(PayPalClient, 'get_plan_details') as get_plan:
        response = client.post('/api/integrity/verify-manual', json={
            'plan_id': 'P-MANUAL',
            'currency': 'USD',
            'regular_price': '19.99',
            'billing_frequency': 'MONTH',
            'frequency_interval': '1',
            'confidence_score': 1.0,
            'evidence_quotes': ['fabricated citation'],
        })

    assert response.status_code == 400
    assert 'confidence' in response.get_json()['message'] or 'evidence' in response.get_json()['message']
    get_plan.assert_not_called()


def test_inr_verified_audit_cannot_create_unsupported_paypal_subscription(client):
    raw_plan = {
        'id': 'P-INR-UNSUPPORTED',
        'product_id': 'PROD-INR-TEST',
        'name': 'INR plan not supported by PayPal subscriptions',
        'status': 'ACTIVE',
        'billing_cycles': [{
            'sequence': 1,
            'tenure_type': 'REGULAR',
            'total_cycles': 0,
            'frequency': {'interval_unit': 'MONTH', 'interval_count': 1},
            'pricing_scheme': {'fixed_price': {'value': '199.99', 'currency_code': 'INR'}},
        }],
        'payment_preferences': {'setup_fee': {'value': '0.00', 'currency_code': 'INR'}},
    }
    fingerprint, _ = PayPalClient.compute_canonical_fingerprint(raw_plan)
    document_id = _create_test_document()
    _add_eligible_extracted_terms(document_id, currency='INR', regular_price='199.99')
    audit = VerificationAudit(
        id='AUD-INR-UNSUPPORTED',
        document_id=document_id,
        paypal_plan_id=raw_plan['id'],
        plan_fingerprint=fingerprint,
        verdict='VERIFIED',
        field_diffs_json=_eligible_fields_json('INR', '199.99'),
    )
    db.session.add(audit)
    db.session.commit()

    with patch.object(PayPalClient, 'get_plan_details', return_value=PayPalClient()._format_plan_details(raw_plan)), \
         patch.object(PayPalClient, 'create_subscription') as create_subscription:
        response = client.post('/api/paypal/subscriptions/create', json={
            'plan_id': raw_plan['id'],
            'verification_id': audit.id,
            'consent': True,
        })

    assert response.status_code == 409
    assert response.get_json()['error'] == 'Unsupported Currency'
    create_subscription.assert_not_called()


def _verified_audit_for_plan(plan):
    fingerprint, _ = PayPalClient.compute_canonical_fingerprint(plan)
    document_id = _create_test_document()
    _add_eligible_extracted_terms(document_id)
    audit = VerificationAudit(
        id='AUD-SUBSCRIPTION-SUCCESS',
        document_id=document_id,
        paypal_plan_id=plan['id'],
        plan_fingerprint=fingerprint,
        verdict='VERIFIED',
        field_diffs_json=_eligible_fields_json(),
    )
    db.session.add(audit)
    db.session.commit()
    return audit


def test_verified_usd_checkout_creates_pending_subscription_with_server_return_urls(client):
    plan = PayPalClient()._format_plan_details(SAMPLE_PAYPAL_PLAN)
    audit = _verified_audit_for_plan(plan)
    provider_creation = {
        'id': 'I-SANDBOX-PENDING',
        'status': 'APPROVAL_PENDING',
        'links': [{'rel': 'approve', 'href': 'https://www.sandbox.paypal.com/checkoutnow?token=redacted'}],
    }

    with patch.object(PayPalClient, 'get_plan_details', return_value=plan), \
         patch.object(PayPalClient, 'create_subscription', return_value=provider_creation) as create_call:
        response = client.post('/api/paypal/subscriptions/create', json={
            'plan_id': plan['id'],
            'verification_id': audit.id,
            'consent': True,
            'application_context': {'return_url': 'https://attacker.invalid/return'},
        })

    assert response.status_code == 201
    record = db.session.get(SubscriptionRecord, 'I-SANDBOX-PENDING')
    assert record.status == 'APPROVAL_PENDING'
    assert record.status != 'ACTIVE'
    assert record.currency == 'USD'
    assert response.get_json()['approval_url'].startswith('https://www.sandbox.paypal.com/')
    context = create_call.call_args.args[1]
    assert context['return_url'] == TestConfig.PAYPAL_RETURN_URL
    assert context['cancel_url'] == TestConfig.PAYPAL_CANCEL_URL
    assert context['return_url'] != 'https://attacker.invalid/return'


def test_checkout_rejects_stored_verified_audit_with_missing_critical_evidence(client):
    plan = PayPalClient()._format_plan_details(SAMPLE_PAYPAL_PLAN)
    audit = _verified_audit_for_plan(plan)
    audit.field_diffs_json = json.dumps([{
        'field_name': 'regular_price', 'comparison_status': 'MATCH',
        'advertised_value': '24.99', 'actual_value': '24.99',
    }])
    terms = ExtractedTerms.query.filter_by(document_id=audit.document_id).first()
    terms.evidence_quotes_json = json.dumps({'evidence_quotes': [], 'evidence_by_field': {}})
    db.session.commit()

    with patch.object(PayPalClient, 'get_plan_details') as get_plan, \
         patch.object(PayPalClient, 'create_subscription') as create_subscription:
        response = client.post('/api/paypal/subscriptions/create', json={
            'plan_id': plan['id'], 'verification_id': audit.id, 'consent': True,
        })

    assert response.status_code == 409
    assert response.get_json()['error'] == 'Verification Required'
    get_plan.assert_not_called()
    create_subscription.assert_not_called()


def test_failed_paypal_checkout_does_not_create_local_subscription(client):
    plan = PayPalClient()._format_plan_details(SAMPLE_PAYPAL_PLAN)
    audit = _verified_audit_for_plan(plan)

    with patch.object(PayPalClient, 'get_plan_details', return_value=plan), \
         patch.object(PayPalClient, 'create_subscription', side_effect=PayPalAPIError('Sandbox request rejected.', 422)):
        response = client.post('/api/paypal/subscriptions/create', json={
            'plan_id': plan['id'],
            'verification_id': audit.id,
            'consent': True,
        })

    assert response.status_code == 422
    assert SubscriptionRecord.query.count() == 0


def test_subscription_creation_is_rejected_outside_sandbox(tmp_path):
    class LiveConfig(TestConfig):
        PAYPAL_MODE = 'live'
        PAYPAL_BASE_URL = 'https://api-m.paypal.com'
        UPLOAD_FOLDER = tmp_path / 'uploads'

    app = create_app(LiveConfig)
    with app.app_context():
        plan = dict(SAMPLE_PAYPAL_PLAN)
        fingerprint, _ = PayPalClient.compute_canonical_fingerprint(plan)
        document_id = _create_test_document()
        _add_eligible_extracted_terms(document_id)
        audit = VerificationAudit(
            id='AUD-LIVE-BLOCKED',
            document_id=document_id,
            paypal_plan_id=plan['id'],
            plan_fingerprint=fingerprint,
            verdict='VERIFIED',
            field_diffs_json=_eligible_fields_json(),
        )
        db.session.add(audit)
        db.session.commit()

        with patch.object(PayPalClient, 'get_plan_details') as get_plan, \
             patch.object(PayPalClient, 'create_subscription') as create_subscription:
            response = app.test_client().post('/api/paypal/subscriptions/create', json={
                'plan_id': plan['id'],
                'verification_id': audit.id,
                'consent': True,
            })

        assert response.status_code == 503
        assert response.get_json()['error'] == 'Sandbox Required'
        get_plan.assert_not_called()
        create_subscription.assert_not_called()


def test_subscription_status_is_refreshed_from_paypal_without_marking_paid(client):
    record = SubscriptionRecord(
        id='I-STATUS-TEST',
        paypal_plan_id='P-STATUS-TEST',
        billing_amount='19.99',
        currency='USD',
        status='APPROVAL_PENDING',
        approved_fingerprint='f' * 64,
    )
    db.session.add(record)
    db.session.commit()
    provider_data = {
        'id': record.id,
        'plan_id': record.paypal_plan_id,
        'status': 'APPROVED',
        'billing_info': {'next_billing_time': '2026-12-11T00:00:00Z'},
    }

    with patch.object(PayPalClient, 'get_subscription', return_value=provider_data):
        response = client.get(f'/api/paypal/subscriptions/{record.id}')

    assert response.status_code == 200
    assert response.get_json()['subscription']['status'] == 'APPROVED'
    assert response.get_json()['provider_status']['status'] == 'APPROVED'
    assert db.session.get(SubscriptionRecord, record.id).status == 'APPROVED'
    assert 'paid' not in response.get_json()['subscription']


def test_monitoring_refresh_uses_actual_paypal_status(client):
    record = SubscriptionRecord(
        id='I-MONITOR-REFRESH',
        paypal_plan_id='P-MONITOR-REFRESH',
        billing_amount='19.99',
        currency='USD',
        status='APPROVAL_PENDING',
        approved_fingerprint='b' * 64,
    )
    db.session.add(record)
    db.session.commit()
    provider_data = {'id': record.id, 'plan_id': record.paypal_plan_id, 'status': 'SUSPENDED'}

    with patch.object(PayPalClient, 'get_subscription', return_value=provider_data) as get_subscription:
        response = client.get('/api/paypal/subscriptions?refresh=true')

    assert response.status_code == 200
    assert response.get_json()['refreshed_from_paypal'] is True
    assert response.get_json()['sync_failures'] == 0
    assert response.get_json()['subscriptions'][0]['status'] == 'SUSPENDED'
    get_subscription.assert_called_once_with(record.id)


def test_webhook_invalid_signature_is_rejected_and_not_persisted(client):
    event = {'id': 'WH-EVENT-INVALID', 'event_type': 'BILLING.SUBSCRIPTION.ACTIVATED', 'resource': {'id': 'I-NOT-ACTIVE'}}
    with patch.object(PayPalClient, 'verify_webhook_signature', return_value=False) as verify:
        response = client.post(
            '/api/paypal/webhooks',
            json=event,
            headers={'PAYPAL-TRANSMISSION-ID': 'WH-TRANSMISSION-INVALID'},
        )

    assert response.status_code == 401
    verify.assert_called_once()
    assert WebhookEvent.query.count() == 0


def test_webhook_signature_verification_uses_paypal_verification_api():
    client = PayPalClient(client_id='client-id', client_secret='client-secret')
    event = {'id': 'WH-REAL-SHAPE', 'event_type': 'BILLING.SUBSCRIPTION.ACTIVATED', 'resource': {'id': 'I-SUB'}}
    response = MagicMock(status_code=200)
    response.json.return_value = {'verification_status': 'SUCCESS'}
    headers = {
        'PAYPAL-AUTH-ALGO': 'SHA256withRSA',
        'PAYPAL-CERT-URL': 'https://api-m.sandbox.paypal.com/cert',
        'PAYPAL-TRANSMISSION-ID': 'TX-SIGNED',
        'PAYPAL-TRANSMISSION-SIG': 'signed-value',
        'PAYPAL-TRANSMISSION-TIME': '2026-11-12T00:00:00Z',
    }

    with patch.object(client, '_authenticated_request', return_value=response) as request:
        assert client.verify_webhook_signature(headers, event, 'WEBHOOK-SANDBOX-ID') is True

    request.assert_called_once_with('POST', '/v1/notifications/verify-webhook-signature', json={
        'auth_algo': 'SHA256withRSA',
        'cert_url': 'https://api-m.sandbox.paypal.com/cert',
        'transmission_id': 'TX-SIGNED',
        'transmission_sig': 'signed-value',
        'transmission_time': '2026-11-12T00:00:00Z',
        'webhook_id': 'WEBHOOK-SANDBOX-ID',
        'webhook_event': event,
    })


def test_webhook_signature_verification_fails_closed_without_webhook_id():
    client = PayPalClient(client_id='client-id', client_secret='client-secret')
    with patch.object(client, '_authenticated_request') as request:
        assert client.verify_webhook_signature({}, {'id': 'WH-NO-ID'}, '') is False
    request.assert_not_called()


@pytest.mark.parametrize(('event', 'headers'), [
    ({'id': 'WH-MISSING-TRANSMISSION', 'event_type': 'BILLING.SUBSCRIPTION.CREATED', 'resource': {}}, {}),
    ({'event_type': 'BILLING.SUBSCRIPTION.CREATED', 'resource': {}}, {'PAYPAL-TRANSMISSION-ID': 'WH-MISSING-EVENT'}),
])
def test_webhook_missing_required_ids_is_rejected_before_signature_check(client, event, headers):
    with patch.object(PayPalClient, 'verify_webhook_signature') as verify:
        response = client.post('/api/paypal/webhooks', json=event, headers=headers)

    assert response.status_code == 400
    verify.assert_not_called()
    assert WebhookEvent.query.count() == 0


def test_verified_duplicate_webhook_event_is_not_processed_twice(client):
    record = SubscriptionRecord(
        id='I-WEBHOOK-DUPLICATE',
        paypal_plan_id='P-WEBHOOK-DUPLICATE',
        billing_amount='19.99',
        currency='USD',
        status='APPROVAL_PENDING',
        approved_fingerprint='e' * 64,
    )
    db.session.add(record)
    db.session.commit()
    event = {
        'id': 'WH-EVENT-DUPLICATE',
        'event_type': 'BILLING.SUBSCRIPTION.ACTIVATED',
        'resource': {'id': record.id, 'status': 'ACTIVE'},
    }

    with patch.object(PayPalClient, 'verify_webhook_signature', return_value=True) as verify:
        first = client.post('/api/paypal/webhooks', json=event, headers={'PAYPAL-TRANSMISSION-ID': 'WH-TX-FIRST'})
        second = client.post('/api/paypal/webhooks', json=event, headers={'PAYPAL-TRANSMISSION-ID': 'WH-TX-RETRY'})

    assert first.status_code == 200
    assert first.get_json()['status'] == 'accepted'
    assert second.status_code == 200
    assert second.get_json()['status'] == 'duplicate'
    assert verify.call_count == 2
    assert WebhookEvent.query.count() == 1
    assert db.session.get(SubscriptionRecord, record.id).status == 'ACTIVE'


def test_payment_completed_webhook_never_promotes_or_marks_paid(client):
    record = SubscriptionRecord(
        id='I-PAYMENT-EVENT',
        paypal_plan_id='P-PAYMENT-EVENT',
        billing_amount='19.99',
        currency='USD',
        status='APPROVED',
        approved_fingerprint='d' * 64,
    )
    db.session.add(record)
    db.session.commit()
    event = {
        'id': 'WH-PAYMENT-COMPLETED',
        'event_type': 'PAYMENT.SALE.COMPLETED',
        'resource': {'billing_agreement_id': record.id, 'status': 'COMPLETED'},
    }

    with patch.object(PayPalClient, 'verify_webhook_signature', return_value=True):
        response = client.post('/api/paypal/webhooks', json=event, headers={'PAYPAL-TRANSMISSION-ID': 'WH-TX-PAYMENT'})

    assert response.status_code == 200
    assert db.session.get(SubscriptionRecord, record.id).status == 'APPROVED'
    assert 'paid' not in db.session.get(SubscriptionRecord, record.id).to_dict()


def test_verified_cancellation_webhook_updates_actual_lifecycle_status(client):
    record = SubscriptionRecord(
        id='I-CANCEL-EVENT',
        paypal_plan_id='P-CANCEL-EVENT',
        billing_amount='19.99',
        currency='USD',
        status='ACTIVE',
        approved_fingerprint='c' * 64,
    )
    db.session.add(record)
    db.session.commit()
    event = {
        'id': 'WH-SUBSCRIPTION-CANCELLED',
        'event_type': 'BILLING.SUBSCRIPTION.CANCELLED',
        'resource': {'id': record.id},
    }

    with patch.object(PayPalClient, 'verify_webhook_signature', return_value=True):
        response = client.post('/api/paypal/webhooks', json=event, headers={'PAYPAL-TRANSMISSION-ID': 'WH-TX-CANCELLED'})

    assert response.status_code == 200
    assert db.session.get(SubscriptionRecord, record.id).status == 'CANCELLED'


@pytest.mark.parametrize(('event_type', 'provider_status', 'expected_status'), [
    ('BILLING.SUBSCRIPTION.CREATED', 'APPROVAL_PENDING', 'APPROVAL_PENDING'),
    ('BILLING.SUBSCRIPTION.UPDATED', 'SUSPENDED', 'SUSPENDED'),
    ('BILLING.SUBSCRIPTION.EXPIRED', None, 'EXPIRED'),
])
def test_verified_subscription_lifecycle_webhook_updates_status(client, event_type, provider_status, expected_status):
    record = SubscriptionRecord(
        id=f'I-{event_type.rsplit(".", 1)[-1]}',
        paypal_plan_id='P-LIFECYCLE-EVENT',
        billing_amount='19.99',
        currency='USD',
        status='APPROVAL_PENDING',
        approved_fingerprint='a' * 64,
    )
    db.session.add(record)
    db.session.commit()
    resource = {'id': record.id}
    if provider_status:
        resource['status'] = provider_status
    event = {'id': f'WH-{event_type.rsplit(".", 1)[-1]}', 'event_type': event_type, 'resource': resource}

    with patch.object(PayPalClient, 'verify_webhook_signature', return_value=True):
        response = client.post('/api/paypal/webhooks', json=event, headers={'PAYPAL-TRANSMISSION-ID': f'TX-{record.id}'})

    assert response.status_code == 200
    assert db.session.get(SubscriptionRecord, record.id).status == expected_status


def test_subscription_payment_failed_event_is_persisted_without_false_status_transition(client):
    record = SubscriptionRecord(
        id='I-PAYMENT-FAILED',
        paypal_plan_id='P-PAYMENT-FAILED',
        billing_amount='19.99',
        currency='USD',
        status='ACTIVE',
        approved_fingerprint='9' * 64,
    )
    db.session.add(record)
    db.session.commit()
    event = {
        'id': 'WH-SUBSCRIPTION-PAYMENT-FAILED',
        'event_type': 'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
        'resource': {'subscription_id': record.id, 'status': 'PAYMENT_FAILED'},
    }

    with patch.object(PayPalClient, 'verify_webhook_signature', return_value=True):
        response = client.post('/api/paypal/webhooks', json=event, headers={'PAYPAL-TRANSMISSION-ID': 'TX-PAYMENT-FAILED'})

    assert response.status_code == 200
    stored_event = WebhookEvent.query.filter_by(event_id=event['id']).one()
    assert stored_event.event_type == 'BILLING.SUBSCRIPTION.PAYMENT.FAILED'
    updated = db.session.get(SubscriptionRecord, record.id)
    assert updated.status == 'ACTIVE'
    assert updated.last_payment_status == 'FAILED'
    assert updated.last_payment_event_at is not None

def test_plan_formatter_keeps_missing_financial_fields_unknown():
    raw_plan = {
        'id': 'P-MISSING-FIELDS',
        'billing_cycles': [{
            'sequence': 1,
            'tenure_type': 'REGULAR',
            'total_cycles': None,
            'frequency': {'interval_unit': None, 'interval_count': None},
            'pricing_scheme': {'fixed_price': {}},
        }],
    }
    normalized = PayPalClient()._format_plan_details(raw_plan)

    assert normalized['trial_days'] == 0
    assert normalized['trial_configuration']['present'] is False
    assert normalized['setup_fee'] is None
    assert normalized['setup_fee_currency'] is None
    assert normalized['regular_price'] is None
    _, canonical = PayPalClient.compute_canonical_fingerprint(raw_plan)
    assert canonical['setup_fee'] == 'UNKNOWN'
    assert canonical['setup_fee_currency'] == 'UNKNOWN'
    assert canonical['billing_cycles'][0] == {
        'sequence': 1,
        'tenure_type': 'REGULAR',
        'total_cycles': 'UNKNOWN',
        'interval_unit': 'UNKNOWN',
        'interval_count': 'UNKNOWN',
        'price_value': 'UNKNOWN',
        'currency': 'UNKNOWN',
    }
    _, canonical_without_cycles = PayPalClient.compute_canonical_fingerprint({'id': 'P-NO-CYCLES'})
    assert canonical_without_cycles['billing_cycles'] == 'UNKNOWN'
    assert canonical_without_cycles['product_id'] == 'UNKNOWN'
    assert canonical_without_cycles['status'] == 'UNKNOWN'


def test_subscription_creation_blocked_when_plan_fingerprint_changed(client):
    """Backend must reject checkout when the live PayPal plan has changed since verification."""
    plan = PayPalClient()._format_plan_details(SAMPLE_PAYPAL_PLAN)
    fingerprint, _ = PayPalClient.compute_canonical_fingerprint(SAMPLE_PAYPAL_PLAN)

    document_id = _create_test_document('DOC-FP-MISMATCH')
    _add_eligible_extracted_terms(document_id)
    # Store the audit with the original fingerprint
    audit = VerificationAudit(
        id='AUD-FP-CHANGED',
        document_id=document_id,
        paypal_plan_id=SAMPLE_PAYPAL_PLAN['id'],
        plan_fingerprint=fingerprint,
        verdict='VERIFIED',
        field_diffs_json=_eligible_fields_json(),
    )
    db.session.add(audit)
    db.session.commit()

    # Simulate the plan changing after verification (price increase)
    modified_plan = json.loads(json.dumps(SAMPLE_PAYPAL_PLAN))
    modified_plan['billing_cycles'][1]['pricing_scheme']['fixed_price']['value'] = '34.99'
    modified_formatted = PayPalClient()._format_plan_details(modified_plan)

    with patch.object(PayPalClient, 'get_plan_details', return_value=modified_formatted), \
         patch.object(PayPalClient, 'create_subscription') as create_subscription:
        response = client.post('/api/paypal/subscriptions/create', json={
            'plan_id': SAMPLE_PAYPAL_PLAN['id'],
            'verification_id': audit.id,
            'consent': True,
        })

    assert response.status_code == 409
    assert response.get_json()['error'] == 'Plan Changed'
    create_subscription.assert_not_called()


@pytest.mark.parametrize('verdict', ['MISMATCH DETECTED', 'REQUIRES REVIEW'])
def test_subscription_creation_is_blocked_for_nonverified_audits(client, verdict):
    audit = VerificationAudit(
        id=f'AUD-{verdict.replace(" ", "-")}',
        document_id=None,
        paypal_plan_id='P-TEST-NO-CHECKOUT',
        plan_fingerprint='a' * 64,
        verdict=verdict,
        field_diffs_json='[]',
    )
    db.session.add(audit)
    db.session.commit()

    with patch.object(PayPalClient, 'create_subscription') as create_subscription:
        response = client.post('/api/paypal/subscriptions/create', json={
            'plan_id': audit.paypal_plan_id,
            'verification_id': audit.id,
            'consent': True,
        })

    assert response.status_code == 409
    assert response.get_json()['error'] == 'Verification Required'
    create_subscription.assert_not_called()

def test_plan_formatter_does_not_approximate_month_trial_to_days():
    normalized = PayPalClient()._format_plan_details({
        'id': 'P-MONTH-TRIAL',
        'billing_cycles': [{
            'sequence': 1,
            'tenure_type': 'TRIAL',
            'total_cycles': 1,
            'frequency': {'interval_unit': 'MONTH', 'interval_count': 1},
            'pricing_scheme': {'fixed_price': {'value': '0.00', 'currency_code': 'USD'}},
        }],
    })

    assert normalized['trial_days'] is None
    assert normalized['trial_configuration']['present'] is True
    assert normalized['trial_configuration']['cycles'][0]['interval_unit'] == 'MONTH'

# --- FINGERPRINTING TESTS ---

def test_canonical_fingerprint_consistency():
    """Verify that calling fingerprinting on the same plan always produces the exact same SHA-256 hash."""
    fp1, canonical1 = PayPalClient.compute_canonical_fingerprint(SAMPLE_PAYPAL_PLAN)
    fp2, canonical2 = PayPalClient.compute_canonical_fingerprint(SAMPLE_PAYPAL_PLAN)

    assert fp1 == fp2
    assert len(fp1) == 64
    assert canonical1['setup_fee'] == '0.00'
    assert len(canonical1['billing_cycles']) == 2

def test_fingerprint_changes_when_billing_price_changes():
    """Verify that altering regular renewal price changes the canonical SHA-256 fingerprint."""
    fp_original, _ = PayPalClient.compute_canonical_fingerprint(SAMPLE_PAYPAL_PLAN)

    # Modify pricing in second cycle
    modified_plan = json.loads(json.dumps(SAMPLE_PAYPAL_PLAN))
    modified_plan['billing_cycles'][1]['pricing_scheme']['fixed_price']['value'] = '14.99'

    fp_modified, _ = PayPalClient.compute_canonical_fingerprint(modified_plan)
    assert fp_original != fp_modified

def test_fingerprint_ignores_transient_metadata():
    """Verify that changing transient metadata like links, description, or create_time does NOT alter the fingerprint."""
    fp_original, _ = PayPalClient.compute_canonical_fingerprint(SAMPLE_PAYPAL_PLAN)

    metadata_changed_plan = json.loads(json.dumps(SAMPLE_PAYPAL_PLAN))
    metadata_changed_plan['description'] = 'Some completely different promotional text'
    metadata_changed_plan['links'] = [{'href': 'https://example.com/approve', 'rel': 'approve'}]
    metadata_changed_plan['create_time'] = '2026-11-09T18:00:00Z'

    fp_after, _ = PayPalClient.compute_canonical_fingerprint(metadata_changed_plan)
    assert fp_original == fp_after

# --- API ROUTE TESTS (MOCKED) ---

def test_get_connection_status_endpoint(client):
    with patch.object(PayPalClient, 'get_access_token', return_value='mock_token'):
        res = client.get('/api/paypal/status')
        assert res.status_code == 200
        data = res.get_json()
        assert data['configured'] is True
        assert data['connected'] is True
        assert data['status'] == 'CONNECTED'
        # Crucial security rule: never expose secret or raw access token
        assert 'client_secret' not in data
        assert 'access_token' not in data

def test_get_products_endpoint(client):
    mock_products_resp = MagicMock()
    mock_products_resp.status_code = 200
    mock_products_resp.json.return_value = {
        'products': [
            {
                'id': 'PROD-CLOUDSYNC',
                'name': 'CloudSync Enterprise',
                'description': 'Enterprise cloud storage',
                'type': 'SERVICE',
                'category': 'SOFTWARE',
            }
        ],
        'total_items': 1,
        'total_pages': 1,
    }

    with patch.object(PayPalClient, 'get_access_token', return_value='mock_token'), \
         patch('requests.request', return_value=mock_products_resp):
        res = client.get('/api/paypal/products')
        assert res.status_code == 200
        data = res.get_json()
        assert data['status'] == 'success'
        assert len(data['products']) == 1
        assert data['products'][0]['id'] == 'PROD-CLOUDSYNC'

def test_get_plan_details_and_fingerprint_persistence(client):
    mock_plan_resp = MagicMock()
    mock_plan_resp.status_code = 200
    mock_plan_resp.json.return_value = SAMPLE_PAYPAL_PLAN

    with patch.object(PayPalClient, 'get_access_token', return_value='mock_token'), \
         patch('requests.request', return_value=mock_plan_resp):
        res = client.get('/api/paypal/plans/P-8Y2908182')
        assert res.status_code == 200
        data = res.get_json()
        assert data['status'] == 'success'
        plan = data['plan']
        assert plan['id'] == 'P-8Y2908182'
        assert plan['fingerprint'] is not None
        assert len(plan['fingerprint']) == 64

        # Verify snapshot stored in SQLite
        snapshot = PlanSnapshot.query.filter_by(plan_id='P-8Y2908182').first()
        assert snapshot is not None
        assert snapshot.fingerprint == plan['fingerprint']
        assert snapshot.product_id == 'PROD-CLOUDSYNC'
