import uuid
import json
from flask import Blueprint, request, jsonify, current_app

from app.models import db
from app.models.document import UploadedDocument
from app.models.extracted_terms import ExtractedTerms
from app.models.subscription import PlanSnapshot
from app.models.verification import VerificationAudit
from app.services.paypal_service import PayPalClient, PayPalAPIError
from app.services.verification_service import (
    FinancialVerificationEngine,
    normalize_currency,
    parse_nonnegative_integer,
    parse_positive_integer,
)

integrity_bp = Blueprint('integrity', __name__, url_prefix='/api/integrity')


def _manual_integer(data, field_name, positive=False):
    value = data.get(field_name)
    if value is None or value == '' or (isinstance(value, str) and value.strip().upper() in {'UNKNOWN', 'UNSTATED'}):
        return None
    parsed = parse_positive_integer(value) if positive else parse_nonnegative_integer(value)
    if parsed is None:
        raise ValueError(f'{field_name} must be a valid {"positive" if positive else "non-negative"} integer or UNKNOWN.')
    return parsed


def _manual_amount(data, field_name, required=False):
    value = data.get(field_name)
    if value is None or value == '':
        if required:
            return 'UNKNOWN'
        return None
    if not isinstance(value, str):
        raise ValueError(f'{field_name} must be entered as text or left blank.')
    return value.strip() or ('UNKNOWN' if required else None)

@integrity_bp.route('/verify', methods=['POST'])
def verify_terms():
    data = request.get_json(silent=True) or {}
    document_id = data.get('document_id')
    plan_id = data.get('plan_id')

    if not document_id or not plan_id:
        return jsonify({
            'error': 'Bad Request',
            'message': 'Both document_id and plan_id are required fields.'
        }), 400

    # 1. Retrieve Extracted Terms
    extracted = ExtractedTerms.query.filter_by(document_id=document_id).first()
    if not extracted:
        return jsonify({
            'error': 'Not Found',
            'message': f'Extracted terms for document {document_id} not found. Please run extraction first.'
        }), 404

    advertised_terms = extracted.to_dict()

    # 2. Retrieve PayPal Plan Configuration
    client = PayPalClient(
        client_id=current_app.config.get('PAYPAL_CLIENT_ID'),
        client_secret=current_app.config.get('PAYPAL_CLIENT_SECRET'),
        base_url=current_app.config.get('PAYPAL_BASE_URL')
    )

    paypal_plan = None
    plan_changed = False
    stored_snapshot = db.session.get(PlanSnapshot, plan_id)

    # Attempt live retrieval if credentials configured
    if client.is_configured:
        try:
            paypal_plan = client.get_plan_details(plan_id)
            current_fp, canonical_dict = PayPalClient.compute_canonical_fingerprint(paypal_plan)

            # Check if plan changed compared to stored snapshot
            if stored_snapshot:
                if stored_snapshot.fingerprint != current_fp:
                    plan_changed = True
                    # Update stored snapshot with new configuration
                    stored_snapshot.fingerprint = current_fp
                    stored_snapshot.status = paypal_plan.get('status', stored_snapshot.status)
                    stored_snapshot.regular_price = paypal_plan.get('regular_price')
                    stored_snapshot.currency = paypal_plan.get('currency')
                    stored_snapshot.billing_frequency = paypal_plan.get('billing_frequency')
                    stored_snapshot.canonical_json = json.dumps(canonical_dict)
                    stored_snapshot.raw_response_json = json.dumps(paypal_plan.get('raw_plan', {}))
            else:
                # Store initial snapshot
                stored_snapshot = PlanSnapshot(
                    plan_id=plan_id,
                    product_id=paypal_plan.get('product_id', ''),
                    name=paypal_plan.get('name', ''),
                    status=paypal_plan.get('status', 'ACTIVE'),
                    currency=paypal_plan.get('currency'),
                    regular_price=paypal_plan.get('regular_price'),
                    billing_frequency=paypal_plan.get('billing_frequency'),
                    fingerprint=current_fp,
                    canonical_json=json.dumps(canonical_dict),
                    raw_response_json=json.dumps(paypal_plan.get('raw_plan', {}))
                )
                db.session.add(stored_snapshot)
        except PayPalAPIError as e:
            # A persisted snapshot is the deterministic fallback when a live
            # refresh is unavailable. Never discard a stored audit solely
            # because the remote lookup failed.
            if not stored_snapshot:
                if e.status_code in (400, 404):
                    return jsonify({
                        'error': 'Not Found',
                        'message': f'PayPal Plan {plan_id} not found in database or PayPal Sandbox.'
                    }), 404
                return jsonify({'error': 'PayPal API Error', 'message': str(e)}), e.status_code
        except Exception:
            # Fall back to stored snapshot if network fails
            paypal_plan = None

    # If live retrieval was not possible, use persisted SQLite snapshot
    if not paypal_plan and stored_snapshot:
        raw_json = json.loads(stored_snapshot.raw_response_json) if stored_snapshot.raw_response_json else {}
        paypal_plan = client._format_plan_details(raw_json) if raw_json else {
            'id': stored_snapshot.plan_id,
            'product_id': stored_snapshot.product_id,
            'name': stored_snapshot.name,
            'status': stored_snapshot.status,
            'currency': stored_snapshot.currency,
            'regular_price': stored_snapshot.regular_price,
            'billing_frequency': stored_snapshot.billing_frequency,
            'introductory_price': None,
            'introductory_cycles': None,
            'trial_days': None,
            'setup_fee': None,
            'billing_cycles': [],
        }

    # If plan is neither in SQLite nor accessible from PayPal
    if not paypal_plan:
        return jsonify({
            'error': 'Not Found',
            'message': f'PayPal Plan {plan_id} not found in database or PayPal Sandbox.'
        }), 404

    # 3. Compute Current Canonical Fingerprint
    current_fingerprint, _ = PayPalClient.compute_canonical_fingerprint(paypal_plan)

    # 4. Execute Deterministic Verification Engine
    audit_result = FinancialVerificationEngine.verify(
        advertised_terms=advertised_terms,
        paypal_plan=paypal_plan,
        supporting_evidence=advertised_terms.get('evidence_quotes', [])
    )

    # 5. Persist Verification Result in SQLite
    audit_id = f"AUD-{uuid.uuid4().hex[:8].upper()}"
    financial_delta = (
        audit_result.get('financial_impact', {}).get('difference_amount')
        if audit_result.get('financial_impact')
        else None
    )

    audit_record = VerificationAudit(
        id=audit_id,
        document_id=document_id,
        paypal_plan_id=plan_id,
        plan_fingerprint=current_fingerprint,
        verdict=audit_result['final_verdict'],
        field_diffs_json=json.dumps(audit_result['fields']),
        financial_delta_first_year=financial_delta
    )
    db.session.add(audit_record)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'audit_id': audit_id,
        'document_id': document_id,
        'paypal_plan_id': plan_id,
        'plan_fingerprint': current_fingerprint,
        'plan_changed': plan_changed,
        'verdict': audit_result['final_verdict'],
        'fields': audit_result['fields'],
        'matched_fields': audit_result['matched_fields'],
        'mismatched_fields': audit_result['mismatched_fields'],
        'review_fields': audit_result['review_fields'],
        'uncertainty_flags': audit_result['uncertainty_flags'],
        'financial_impact': audit_result['financial_impact'],
        'verification_timestamp': audit_result['verification_timestamp'],
        'verification_id': audit_id,
        'advertised_terms': advertised_terms,
        'paypal_plan_terms': paypal_plan,
        'supporting_evidence': advertised_terms.get('evidence_quotes', []),
        'financial_difference': audit_result['financial_impact'].get('difference_amount') if audit_result.get('financial_impact') else None,
        'currency': paypal_plan.get('currency') or advertised_terms.get('currency'),
    }), 200


@integrity_bp.route('/verify-manual', methods=['POST'])
def verify_manual_terms():
    data = request.get_json(silent=True) or {}
    allowed_fields = {
        'plan_id', 'product_name', 'currency', 'introductory_price',
        'introductory_cycles', 'regular_price', 'billing_frequency',
        'frequency_interval', 'trial_duration_days', 'setup_fee',
    }
    if set(data) - allowed_fields:
        return jsonify({
            'error': 'Bad Request',
            'message': 'Manual demo accepts financial terms only; evidence, confidence and extraction fields are not accepted.',
        }), 400

    plan_id = data.get('plan_id')
    if not isinstance(plan_id, str) or not plan_id.startswith('P-') or len(plan_id) > 64:
        return jsonify({'error': 'Bad Request', 'message': 'A valid PayPal plan ID is required.'}), 400

    currency = str(data.get('currency') or '').strip().upper()
    if currency != 'XXX' and not normalize_currency(currency):
        return jsonify({'error': 'Bad Request', 'message': 'Enter a valid ISO 4217 currency code or XXX.'}), 400

    frequency = str(data.get('billing_frequency') or 'UNKNOWN').strip().upper()
    if frequency not in {'DAY', 'WEEK', 'MONTH', 'YEAR', 'UNKNOWN'}:
        return jsonify({'error': 'Bad Request', 'message': 'Billing frequency must be DAY, WEEK, MONTH, YEAR or UNKNOWN.'}), 400

    try:
        advertised_terms = {
            'product_name': str(data.get('product_name') or 'Manual Demo Offer').strip(),
            'currency': currency,
            'introductory_price': _manual_amount(data, 'introductory_price'),
            'introductory_cycles': _manual_integer(data, 'introductory_cycles', positive=True),
            'regular_price': _manual_amount(data, 'regular_price', required=True),
            'billing_frequency': frequency,
            'frequency_interval': _manual_integer(data, 'frequency_interval', positive=True),
            'trial_duration_days': _manual_integer(data, 'trial_duration_days'),
            'setup_fee': _manual_amount(data, 'setup_fee'),
            'evidence_quotes': [],
            'evidence_by_field': {},
            'uncertainty_flags': [],
            'source_type': 'MANUAL_DEMO',
        }
    except ValueError as error:
        return jsonify({'error': 'Bad Request', 'message': str(error)}), 400

    client = PayPalClient(
        client_id=current_app.config.get('PAYPAL_CLIENT_ID'),
        client_secret=current_app.config.get('PAYPAL_CLIENT_SECRET'),
        base_url=current_app.config.get('PAYPAL_BASE_URL'),
    )
    if (
        not client.is_configured
        or current_app.config.get('PAYPAL_MODE') != 'sandbox'
        or client.base_url != 'https://api-m.sandbox.paypal.com'
    ):
        return jsonify({'error': 'Sandbox Required', 'message': 'Manual demo verification requires configured PayPal Sandbox access.'}), 503

    try:
        paypal_plan = client.get_plan_details(plan_id)
    except PayPalAPIError as error:
        return jsonify({'error': 'PayPal API Error', 'message': str(error)}), error.status_code
    except Exception:
        return jsonify({'error': 'PayPal Unavailable', 'message': 'Unable to retrieve the actual PayPal Sandbox plan.'}), 502

    fingerprint, _ = PayPalClient.compute_canonical_fingerprint(paypal_plan)
    result = FinancialVerificationEngine.verify(advertised_terms, paypal_plan)
    audit_id = f"AUD-{uuid.uuid4().hex[:8].upper()}"
    source_label = 'Manual Demo Input – Not AI Extracted'
    advertised_terms['source_label'] = source_label
    audit = VerificationAudit(
        id=audit_id,
        document_id=None,
        paypal_plan_id=plan_id,
        plan_fingerprint=fingerprint,
        verdict=result['final_verdict'],
        field_diffs_json=json.dumps(result['fields']),
        financial_delta_first_year=result.get('financial_impact', {}).get('difference_amount'),
    )
    db.session.add(audit)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'source_type': 'MANUAL_DEMO',
        'source_label': source_label,
        'audit_id': audit_id,
        'verification_id': audit_id,
        'document_id': None,
        'paypal_plan_id': plan_id,
        'plan_fingerprint': fingerprint,
        'verdict': result['final_verdict'],
        'fields': result['fields'],
        'matched_fields': result['matched_fields'],
        'mismatched_fields': result['mismatched_fields'],
        'review_fields': result['review_fields'],
        'uncertainty_flags': result['uncertainty_flags'],
        'financial_impact': result['financial_impact'],
        'verification_timestamp': result['verification_timestamp'],
        'advertised_terms': advertised_terms,
        'paypal_plan_terms': paypal_plan,
        'supporting_evidence': [],
        'currency': paypal_plan.get('currency') or advertised_terms.get('currency'),
    }), 200


@integrity_bp.route('/audits', methods=['GET'])
def list_audits():
    """Read-only index of persisted verification audits.

    Reports are rebuilt from SQLite, so an audit survives a browser refresh and
    never needs a new Gemini or PayPal call to be viewed.
    """
    from app.services.audit_report_service import build_audit_summary

    limit = min(max(request.args.get('limit', 50, type=int), 1), 200)
    audits = VerificationAudit.query.order_by(
        VerificationAudit.created_at.desc()
    ).limit(limit).all()
    summaries = [item for item in (build_audit_summary(audit) for audit in audits) if item]
    return jsonify({
        'status': 'success',
        'source': 'sqlite',
        'total': len(summaries),
        'audits': summaries,
    }), 200


@integrity_bp.route('/audits/<audit_id>', methods=['GET'])
def get_audit_report(audit_id):
    """Full persisted report for one audit, including stored quotations."""
    from app.services.audit_report_service import build_audit_report

    audit = db.session.get(VerificationAudit, audit_id)
    if not audit:
        return jsonify({'error': 'Not Found', 'message': f'Audit {audit_id} does not exist.'}), 404
    return jsonify({
        'status': 'success',
        'source': 'sqlite',
        'report': build_audit_report(audit),
    }), 200
