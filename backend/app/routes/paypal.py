import json
from flask import Blueprint, request, jsonify, current_app
from datetime import datetime, timezone
from sqlalchemy.exc import IntegrityError
from app.models import db
from app.models.subscription import PlanSnapshot, SubscriptionRecord
from app.models.verification import VerificationAudit
from app.models.extracted_terms import ExtractedTerms
from app.models.webhook_event import WebhookEvent
from app.services.paypal_service import (
    PayPalClient,
    PayPalConfigurationError,
    PayPalAuthError,
    PayPalAPIError,
    PayPalTimeoutError,
)
from app.services.verification_service import is_paypal_subscription_currency_supported
from app.services.audit_report_service import build_audit_report

paypal_bp = Blueprint('paypal', __name__, url_prefix='/api/paypal')
PROVIDER_SUBSCRIPTION_STATUSES = {
    'APPROVAL_PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED', 'UNKNOWN',
}
SUBSCRIPTION_STATUS_EVENTS = {
    'BILLING.SUBSCRIPTION.CREATED',
    'BILLING.SUBSCRIPTION.ACTIVATED',
    'BILLING.SUBSCRIPTION.UPDATED',
    'BILLING.SUBSCRIPTION.CANCELLED',
    'BILLING.SUBSCRIPTION.SUSPENDED',
    'BILLING.SUBSCRIPTION.RE-ACTIVATED',
    'BILLING.SUBSCRIPTION.EXPIRED',
}
PAYMENT_EVENTS = {
    'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
    'PAYMENT.SALE.COMPLETED',
    'PAYMENT.SALE.DENIED',
    'PAYMENT.SALE.REFUNDED',
}

def get_client() -> PayPalClient:
    """Helper to instantiate PayPalClient with app config."""
    return PayPalClient(
        client_id=current_app.config.get('PAYPAL_CLIENT_ID'),
        client_secret=current_app.config.get('PAYPAL_CLIENT_SECRET'),
        base_url=current_app.config.get('PAYPAL_BASE_URL'),
    )


def _is_sandbox_client(client: PayPalClient) -> bool:
    return (
        current_app.config.get('PAYPAL_MODE') == 'sandbox'
        and client.base_url == 'https://api-m.sandbox.paypal.com'
    )


def _provider_status(value):
    normalized = str(value or '').strip().upper()
    return normalized if normalized in PROVIDER_SUBSCRIPTION_STATUSES else 'UNKNOWN'


def _parse_provider_datetime(value):
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace('Z', '+00:00'))
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _sync_subscription_record(record, provider_data):
    if provider_data.get('id') != record.id or provider_data.get('plan_id') != record.paypal_plan_id:
        raise ValueError('PayPal subscription identity did not match the stored record.')
    record.status = _provider_status(provider_data.get('status'))
    billing_info = provider_data.get('billing_info')
    if isinstance(billing_info, dict):
        next_billing_time = _parse_provider_datetime(billing_info.get('next_billing_time'))
        if next_billing_time:
            record.next_billing_time = next_billing_time
    record.last_verified_at = datetime.now(timezone.utc)
    db.session.commit()
    return {
        'id': provider_data.get('id'),
        'plan_id': provider_data.get('plan_id'),
        'status': record.status,
        'next_billing_time': record.next_billing_time.isoformat() if record.next_billing_time else None,
        'last_verified_at': record.last_verified_at.isoformat(),
    }

@paypal_bp.route('/status', methods=['GET'])
def get_connection_status():
    """Returns the verified Sandbox connection status without exposing secrets."""
    client = get_client()
    status_info = client.verify_connection()
    return jsonify(status_info), 200

@paypal_bp.route('/products', methods=['GET'])
def get_products():
    """
    Retrieves merchant catalog products from PayPal Sandbox.
    Handles pagination and clearly distinguishes unconfigured vs empty catalog vs errors.
    """
    client = get_client()
    if not client.is_configured:
        return jsonify({
            'status': 'unconfigured',
            'configured': False,
            'products': [],
            'total_items': 0,
            'message': 'PayPal Sandbox credentials (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET) are not configured in backend environment variables.',
        }), 200

    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)

    try:
        data = client.get_products(page=page, page_size=page_size)
        return jsonify({
            'status': 'success',
            'configured': True,
            **data
        }), 200
    except PayPalAuthError as e:
        return jsonify({
            'status': 'error',
            'error': 'PayPal Authentication Failed',
            'message': str(e),
            'products': [],
        }), 401
    except PayPalTimeoutError as e:
        return jsonify({
            'status': 'error',
            'error': 'Gateway Timeout',
            'message': str(e),
            'products': [],
        }), 504
    except PayPalAPIError as e:
        return jsonify({
            'status': 'error',
            'error': 'PayPal API Error',
            'message': str(e),
            'products': [],
        }), e.status_code
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': 'Internal Error',
            'message': str(e),
            'products': [],
        }), 500

@paypal_bp.route('/plans', methods=['GET'])
def get_plans():
    """
    Retrieves available subscription plans from PayPal Sandbox.
    Optionally filters by product_id query parameter.
    """
    client = get_client()
    if not client.is_configured:
        return jsonify({
            'status': 'unconfigured',
            'configured': False,
            'plans': [],
            'total_items': 0,
            'message': 'PayPal Sandbox credentials not configured.',
        }), 200

    product_id = request.args.get('product_id')
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)

    try:
        data = client.get_plans(product_id=product_id, page=page, page_size=page_size)
        return jsonify({
            'status': 'success',
            'configured': True,
            **data
        }), 200
    except PayPalAuthError as e:
        return jsonify({'error': 'Authentication Failed', 'message': str(e)}), 401
    except PayPalTimeoutError as e:
        return jsonify({'error': 'Gateway Timeout', 'message': str(e)}), 504
    except PayPalAPIError as e:
        return jsonify({'error': 'PayPal API Error', 'message': str(e)}), e.status_code
    except Exception as e:
        return jsonify({'error': 'Internal Error', 'message': str(e)}), 500

@paypal_bp.route('/plans/<plan_id>', methods=['GET'])
def get_plan_details(plan_id):
    """
    Retrieves full PayPal plan configuration, computes canonical SHA-256 fingerprint,
    and saves/updates the snapshot record in SQLite.
    """
    client = get_client()
    if not client.is_configured:
        return jsonify({
            'error': 'Not Configured',
            'message': 'PayPal Sandbox credentials are required to retrieve live plan configurations.',
        }), 503

    try:
        plan_details = client.get_plan_details(plan_id)
        fingerprint, canonical_dict = PayPalClient.compute_canonical_fingerprint(plan_details)

        # Upsert PlanSnapshot in SQLite
        snapshot = db.session.get(PlanSnapshot, plan_id)
        if not snapshot:
            snapshot = PlanSnapshot(
                plan_id=plan_id,
                product_id=plan_details.get('product_id', ''),
                name=plan_details.get('name', ''),
                status=plan_details.get('status', ''),
                currency=plan_details.get('currency'),
                regular_price=plan_details.get('regular_price'),
                billing_frequency=plan_details.get('billing_frequency'),
                fingerprint=fingerprint,
                canonical_json=json.dumps(canonical_dict),
                raw_response_json=json.dumps(plan_details.get('raw_plan', {})),
            )
            db.session.add(snapshot)
        else:
            snapshot.name = plan_details.get('name', snapshot.name)
            snapshot.status = plan_details.get('status', snapshot.status)
            snapshot.currency = plan_details.get('currency', snapshot.currency)
            snapshot.regular_price = plan_details.get('regular_price', snapshot.regular_price)
            snapshot.billing_frequency = plan_details.get('billing_frequency', snapshot.billing_frequency)
            snapshot.fingerprint = fingerprint
            snapshot.canonical_json = json.dumps(canonical_dict)
            snapshot.raw_response_json = json.dumps(plan_details.get('raw_plan', {}))

        db.session.commit()

        return jsonify({
            'status': 'success',
            'plan': {
                **plan_details,
                'fingerprint': fingerprint,
                'canonical_terms': canonical_dict,
                'persisted_in_db': True,
            }
        }), 200

    except PayPalAuthError as e:
        return jsonify({'error': 'Authentication Failed', 'message': str(e)}), 401
    except PayPalTimeoutError as e:
        return jsonify({'error': 'Gateway Timeout', 'message': str(e)}), 504
    except PayPalAPIError as e:
        return jsonify({'error': 'Plan Not Found or Unavailable', 'message': str(e)}), e.status_code
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Internal Error', 'message': str(e)}), 500


@paypal_bp.route('/subscriptions/create', methods=['POST'])
def create_subscription():
    data = request.get_json(silent=True) or {}
    plan_id, verification_id = data.get('plan_id'), data.get('verification_id')
    if not plan_id or not verification_id or data.get('consent') is not True:
        return jsonify({'error': 'Bad Request', 'message': 'plan_id, verification_id and explicit consent are required.'}), 400
    audit = db.session.get(VerificationAudit, verification_id)
    if not audit or audit.paypal_plan_id != plan_id or audit.verdict != 'VERIFIED':
        return jsonify({'error': 'Verification Required', 'message': 'Only a current VERIFIED audit may create a subscription.'}), 409
    if not audit.document_id:
        return jsonify({
            'error': 'Manual Demo Checkout Blocked',
            'message': 'Manual demo verification cannot be used to create a PayPal subscription. Upload and verify a genuine offer document first.',
        }), 409
    persisted_terms = ExtractedTerms.query.filter_by(document_id=audit.document_id).first()
    report = build_audit_report(audit)
    if (
        not persisted_terms
        or not report
        or report.get('source_type') != 'DOCUMENT_UPLOAD'
        or report.get('verdict') != 'VERIFIED'
        or report.get('evidence_complete') is not True
        or not report.get('fields')
        or not report.get('supporting_evidence')
    ):
        return jsonify({
            'error': 'Verification Required',
            'message': 'Checkout requires a current VERIFIED uploaded-document audit with complete persisted evidence.',
        }), 409
    client = get_client()
    if not client.is_configured:
        return jsonify({'error': 'Not Configured', 'message': 'PayPal Sandbox credentials are not configured.'}), 503
    if not _is_sandbox_client(client):
        return jsonify({'error': 'Sandbox Required', 'message': 'Subscription creation is restricted to PayPal Sandbox.'}), 503
    try:
        plan = client.get_plan_details(plan_id)
        if plan.get('status') != 'ACTIVE':
            return jsonify({'error': 'Plan Unavailable', 'message': 'Only an ACTIVE PayPal plan can be used for checkout.'}), 409
        fingerprint, _ = PayPalClient.compute_canonical_fingerprint(plan)
        if fingerprint != audit.plan_fingerprint:
            return jsonify({'error': 'Plan Changed', 'message': 'The PayPal plan changed since verification.', 'plan_fingerprint': fingerprint}), 409
        if not is_paypal_subscription_currency_supported(plan.get('currency')):
            currency = str(plan.get('currency') or '').strip().upper()
            return jsonify({
                'error': 'Unsupported Currency',
                'message': f'PayPal subscriptions do not support {currency or "an unknown currency"}.',
            }), 409
        application_context = {
            'return_url': current_app.config['PAYPAL_RETURN_URL'],
            'cancel_url': current_app.config['PAYPAL_CANCEL_URL'],
            'user_action': 'SUBSCRIBE_NOW',
        }
        paypal_response = client.create_subscription(plan_id, application_context)
        subscription_id = paypal_response.get('id')
        if not subscription_id:
            return jsonify({'error': 'PayPal API Error', 'message': 'PayPal did not return a subscription ID.'}), 502
        record = SubscriptionRecord(id=subscription_id, paypal_plan_id=plan_id, customer_reference=data.get('customer_reference'), billing_amount=plan.get('regular_price') or '', currency=plan.get('currency') or '', status=_provider_status(paypal_response.get('status')), approved_fingerprint=fingerprint, consent_recorded_at=datetime.now(timezone.utc))
        db.session.add(record)
        db.session.commit()
        approval_url = next((l.get('href') for l in paypal_response.get('links', []) if l.get('rel') == 'approve'), None)
        return jsonify({'status': 'success', 'subscription': record.to_dict(), 'approval_url': approval_url}), 201
    except PayPalAuthError as e:
        return jsonify({'error': 'Authentication Failed', 'message': str(e)}), 401
    except PayPalTimeoutError as e:
        return jsonify({'error': 'Gateway Timeout', 'message': str(e)}), 504
    except PayPalAPIError as e:
        db.session.rollback()
        return jsonify({'error': 'PayPal API Error', 'message': str(e)}), e.status_code


@paypal_bp.route('/subscriptions', methods=['GET'])
def list_subscriptions():
    records = SubscriptionRecord.query.order_by(SubscriptionRecord.created_at.desc()).limit(50).all()
    refresh = request.args.get('refresh', '').lower() == 'true'
    sync_failures = 0
    client = get_client() if refresh else None
    if refresh and (not client.is_configured or not _is_sandbox_client(client)):
        return jsonify({'error': 'Sandbox Unavailable', 'message': 'Live subscription refresh requires configured PayPal Sandbox credentials.'}), 503
    if refresh:
        for record in records:
            try:
                provider_data = client.get_subscription(record.id)
                _sync_subscription_record(record, provider_data)
            except Exception:
                db.session.rollback()
                sync_failures += 1
    return jsonify({
        'status': 'success',
        'refreshed_from_paypal': refresh,
        'sync_failures': sync_failures,
        'subscriptions': [record.to_dict() for record in records],
    }), 200


@paypal_bp.route('/subscriptions/<subscription_id>', methods=['GET'])
def get_subscription(subscription_id):
    record = db.session.get(SubscriptionRecord, subscription_id)
    if not record:
        return jsonify({'error': 'Not Found', 'message': 'Subscription record not found.'}), 404
    client = get_client()
    if not client.is_configured or not _is_sandbox_client(client):
        return jsonify({'error': 'Sandbox Unavailable', 'message': 'Live subscription status requires configured PayPal Sandbox credentials.'}), 503
    try:
        provider_data = client.get_subscription(record.id)
        provider_status = _sync_subscription_record(record, provider_data)
    except PayPalAPIError as error:
        return jsonify({'error': 'PayPal API Error', 'message': str(error)}), error.status_code
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'PayPal Status Unavailable', 'message': 'Unable to refresh this subscription from PayPal Sandbox.'}), 502
    return jsonify({'status': 'success', 'subscription': record.to_dict(), 'provider_status': provider_status}), 200


@paypal_bp.route('/webhooks', methods=['POST'])
def receive_webhook():
    body = request.get_json(silent=True) or {}
    transmission_id = request.headers.get('PAYPAL-TRANSMISSION-ID')
    event_id = body.get('id')
    if not transmission_id or not event_id:
        return jsonify({'error': 'Bad Request', 'message': 'PayPal transmission and event IDs are required.'}), 400
    client = get_client()
    if not client.is_configured or not _is_sandbox_client(client):
        return jsonify({'error': 'Sandbox Unavailable', 'message': 'Webhook verification requires configured PayPal Sandbox credentials.'}), 503
    try:
        signature_valid = client.verify_webhook_signature(
            request.headers,
            body,
            current_app.config.get('PAYPAL_WEBHOOK_ID', ''),
        )
    except Exception:
        return jsonify({'error': 'Verification Unavailable', 'message': 'PayPal could not verify the webhook signature.'}), 502
    if not signature_valid:
        return jsonify({'error': 'Unauthorized', 'message': 'Invalid PayPal webhook signature.'}), 401
    if db.session.get(WebhookEvent, transmission_id) or WebhookEvent.query.filter_by(event_id=event_id).first():
        return jsonify({'status': 'duplicate'}), 200
    event_type = body.get('event_type', '')
    resource = body.get('resource') or {}
    db.session.add(WebhookEvent(transmission_id=transmission_id, event_id=event_id, event_type=event_type, summary=body.get('summary'), raw_payload_json=json.dumps(body)))
    if event_type in SUBSCRIPTION_STATUS_EVENTS:
        subscription_id = resource.get('id')
    elif event_type == 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        subscription_id = resource.get('subscription_id') or resource.get('billing_agreement_id')
    else:
        subscription_id = resource.get('billing_agreement_id')
    record = db.session.get(SubscriptionRecord, subscription_id) if subscription_id else None
    if record and event_type in SUBSCRIPTION_STATUS_EVENTS:
        event_status = {
            'BILLING.SUBSCRIPTION.ACTIVATED': 'ACTIVE',
            'BILLING.SUBSCRIPTION.CANCELLED': 'CANCELLED',
            'BILLING.SUBSCRIPTION.EXPIRED': 'EXPIRED',
            'BILLING.SUBSCRIPTION.SUSPENDED': 'SUSPENDED',
            'BILLING.SUBSCRIPTION.RE-ACTIVATED': 'ACTIVE',
        }.get(event_type, _provider_status(resource.get('status')))
        record.status = event_status
        record.last_verified_at = datetime.now(timezone.utc)
    elif record and event_type in PAYMENT_EVENTS:
        record.last_verified_at = datetime.now(timezone.utc)
        payment_status = {
            'BILLING.SUBSCRIPTION.PAYMENT.FAILED': 'FAILED',
            'PAYMENT.SALE.COMPLETED': 'COMPLETED',
            'PAYMENT.SALE.DENIED': 'DENIED',
            'PAYMENT.SALE.REFUNDED': 'REFUNDED',
        }.get(event_type)
        if payment_status:
            record.last_payment_status = payment_status
            record.last_payment_event_at = record.last_verified_at
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({'status': 'duplicate'}), 200
    return jsonify({'status': 'accepted', 'event_type': event_type}), 200


@paypal_bp.route('/webhooks', methods=['GET'])
def list_webhook_events():
    """Persisted, signature-verified webhook deliveries. Read-only, no provider call."""
    limit = min(max(request.args.get('limit', 50, type=int), 1), 200)
    events = WebhookEvent.query.order_by(WebhookEvent.processed_at.desc()).limit(limit).all()
    return jsonify({
        'status': 'success',
        'source': 'sqlite',
        'signature_verified_only': True,
        'events': [event.to_dict() for event in events],
    }), 200


@paypal_bp.route('/plans-snapshots', methods=['GET'])
def list_plan_snapshots():
    """Persisted PayPal plan snapshots from SQLite.

    Lets the comparison workspace pick a real plan without issuing a new PayPal
    request. A live refresh still happens inside /api/integrity/verify when
    credentials are configured.
    """
    snapshots = PlanSnapshot.query.order_by(PlanSnapshot.retrieved_at.desc()).limit(100).all()
    return jsonify({
        'status': 'success',
        'source': 'sqlite',
        'plans': [
            {
                'id': snapshot.plan_id,
                'plan_id': snapshot.plan_id,
                'product_id': snapshot.product_id,
                'name': snapshot.name,
                'status': snapshot.status,
                'currency': snapshot.currency,
                'regular_price': snapshot.regular_price,
                'billing_frequency': snapshot.billing_frequency,
                'fingerprint': snapshot.fingerprint,
                'retrieved_at': snapshot.retrieved_at.isoformat(),
            }
            for snapshot in snapshots
        ],
    }), 200
