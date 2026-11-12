import json
from collections import defaultdict
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify

from app.models import db
from app.models.document import UploadedDocument
from app.models.extracted_terms import ExtractedTerms
from app.models.subscription import PlanSnapshot
from app.models.verification import VerificationAudit
from app.models.webhook_event import WebhookEvent
from app.services.audit_report_service import (
    SOURCE_LABEL_DOCUMENT,
    SOURCE_LABEL_MANUAL,
    SOURCE_TYPE_DOCUMENT,
    SOURCE_TYPE_MANUAL,
    build_audit_report,
)
from app.services.verification_service import format_money

analytics_bp = Blueprint('analytics', __name__, url_prefix='/api')

SOURCE_LABEL_PROMO = SOURCE_LABEL_DOCUMENT
SOURCE_LABEL_PLAN = 'PayPal Sandbox Plan Snapshot'
SOURCE_LABEL_WEBHOOK = 'Verified PayPal Webhook'


def _load_json(raw, default):
    if not raw:
        return default
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return default
    return parsed if isinstance(parsed, type(default)) else default


def _audit_fields(audit):
    fields = _load_json(audit.field_diffs_json, [])
    return fields if isinstance(fields, list) else []


def _field_summary(audit):
    for field in _audit_fields(audit):
        if field.get('comparison_status') in {'MISMATCH', 'REVIEW'}:
            return field.get('explanation') or field.get('label') or 'Review required.'
    return 'All evaluated terms matched.'


def _stored_extraction_evidence(terms):
    payload = _load_json(terms.evidence_quotes_json, {}) if terms else {}
    if isinstance(payload, dict):
        quotes = payload.get('evidence_quotes') or []
        by_field = payload.get('evidence_by_field') or {}
    else:
        quotes, by_field = payload, {}
    return (
        quotes if isinstance(quotes, list) else [],
        by_field if isinstance(by_field, dict) else {},
    )


def _currency_maps():
    terms_by_document = {terms.document_id: terms for terms in ExtractedTerms.query.all()}
    snapshots_by_plan = {snapshot.plan_id: snapshot for snapshot in PlanSnapshot.query.all()}
    return terms_by_document, snapshots_by_plan


def _audit_currency(audit, terms_by_document, snapshots_by_plan):
    if audit.document_id:
        terms = terms_by_document.get(audit.document_id)
        if terms and terms.currency:
            return terms.currency
    snapshot = snapshots_by_plan.get(audit.paypal_plan_id)
    return snapshot.currency if snapshot and snapshot.currency else None
def _financial_exposure(audits, terms_by_document, snapshots_by_plan):
    """Sums stored Decimals per currency; currencies are never mixed."""
    totals = defaultdict(lambda: {
        'net': Decimal('0'),
        'overcharge': Decimal('0'),
        'audits': 0,
        'overcharged_audits': 0,
    })
    for audit in audits:
        if audit.financial_delta_first_year is None:
            continue
        currency = _audit_currency(audit, terms_by_document, snapshots_by_plan)
        if not currency:
            continue
        try:
            delta = Decimal(str(audit.financial_delta_first_year))
        except (InvalidOperation, ValueError):
            continue
        if not delta.is_finite():
            continue
        bucket = totals[currency]
        bucket['net'] += delta
        bucket['audits'] += 1
        if delta > 0:
            bucket['overcharge'] += delta
            bucket['overcharged_audits'] += 1
    rows = []
    for currency, bucket in sorted(totals.items()):
        rows.append({
            'currency': currency,
            'net_difference': format_money(bucket['net'], currency) or str(bucket['net']),
            'total_overcharge': format_money(bucket['overcharge'], currency) or str(bucket['overcharge']),
            'audits_with_figures': bucket['audits'],
            'overcharged_audits': bucket['overcharged_audits'],
        })
    return rows


@analytics_bp.get('/dashboard')
def dashboard():
    audits = VerificationAudit.query.order_by(VerificationAudit.created_at.desc()).all()
    terms_by_document, snapshots_by_plan = _currency_maps()
    counts = {
        'total': len(audits),
        'verified': sum(a.verdict == 'VERIFIED' for a in audits),
        'mismatches': sum(a.verdict == 'MISMATCH DETECTED' for a in audits),
        'reviews': sum(a.verdict == 'REQUIRES REVIEW' for a in audits),
        'document_audits': sum(a.document_id is not None for a in audits),
        'manual_demo_audits': sum(a.document_id is None for a in audits),
    }
    document_audits = [audit for audit in audits if audit.document_id is not None]
    counts.update({
        'document_verified': sum(a.verdict == 'VERIFIED' for a in document_audits),
        'document_mismatches': sum(a.verdict == 'MISMATCH DETECTED' for a in document_audits),
        'document_reviews': sum(a.verdict == 'REQUIRES REVIEW' for a in document_audits),
    })

    trend = {}
    for audit in reversed(document_audits):
        day = audit.created_at.date().isoformat()
        bucket = trend.setdefault(
            day, {'date': day, 'verified': 0, 'mismatches': 0, 'reviews': 0, 'total': 0}
        )
        bucket['total'] += 1
        if audit.verdict == 'VERIFIED':
            bucket['verified'] += 1
        elif audit.verdict == 'MISMATCH DETECTED':
            bucket['mismatches'] += 1
        elif audit.verdict == 'REQUIRES REVIEW':
            bucket['reviews'] += 1

    recent = []
    for audit in audits[:10]:
        report = build_audit_report(audit)
        terms = terms_by_document.get(audit.document_id) if audit.document_id else None
        manual_demo = audit.document_id is None
        recent.append({
            'id': audit.id,
            'audit_id': audit.id,
            'product': (terms.product_name if terms else None)
                or (SOURCE_LABEL_MANUAL if manual_demo else None),
            'advertised_price': terms.regular_price if terms else report['advertised_terms'].get('regular_price'),
            'paypal_plan_id': audit.paypal_plan_id,
            'verdict': report['verdict'],
            'stored_verdict': report['stored_verdict'],
            'verdict_downgraded': report['verdict_downgraded'],
            'discrepancy': _field_summary(audit),
            'source_file': report['source_file'],
            'source_type': report['source_type'],
            'source_label': report['source_label'],
            'evidence_status': report['evidence_status'],
            'evidence_quote_count': len(report['supporting_evidence']),
            'financial_delta': report['financial_impact']['difference_amount'],
            'currency': report['currency'],
            'created_at': audit.created_at.isoformat(),
        })

    return jsonify({
        'status': 'success',
        'source': 'sqlite',
        'counts': counts,
        'trend': list(trend.values()),
        'financial_exposure': _financial_exposure(audits, terms_by_document, snapshots_by_plan),
        'recent_audits': recent,
    })
@analytics_bp.get('/evidence')
def evidence():
    """Every persisted evidence record with its real quotations and source label.

    A record is presented as VERIFIED only when a stored audit reached that
    verdict *and* the stored quotations actually back the matched terms.
    """
    records = []
    for terms in ExtractedTerms.query.order_by(ExtractedTerms.extracted_at.desc()).all():
        document = db.session.get(UploadedDocument, terms.document_id)
        if not document:
            continue
        quotes, by_field = _stored_extraction_evidence(terms)
        latest = VerificationAudit.query.filter_by(
            document_id=terms.document_id
        ).order_by(VerificationAudit.created_at.desc()).first()
        if latest:
            report = build_audit_report(latest)
            verdict = report['verdict']
            audit_id = report['audit_id']
            evidence_status = report['evidence_status']
            evidence_message = report['evidence_message']
            field_results = report['fields']
            plan_linked = latest.paypal_plan_id
        else:
            verdict = 'REQUIRES REVIEW'
            audit_id = None
            # No audit exists, so the quotations were never assessed. Claiming
            # "complete" here would imply a verification that never happened.
            evidence_status = 'UNAUDITED'
            evidence_message = 'No verification audit exists for this extraction, so its quotations have not been assessed.'
            field_results = []
            plan_linked = None
        records.append({
            'id': 'DOC-' + terms.document_id,
            'category': 'PROMO_ADVERTISEMENT',
            'title': terms.product_name or document.original_filename,
            'extracted_terms': terms.regular_price,
            'source_file': document.original_filename,
            'source_label': SOURCE_LABEL_PROMO,
            'date': terms.extracted_at.isoformat(),
            'plan_linked': plan_linked,
            'audit_id': audit_id,
            'verdict': verdict,
            'source': 'sqlite',
            'source_type': SOURCE_TYPE_DOCUMENT,
            'evidence_quotes': quotes,
            'evidence_by_field': by_field,
            'evidence_status': evidence_status,
            'evidence_message': evidence_message,
            'confidence_score': terms.confidence_score,
            'ai_model': terms.ai_model,
            'uncertainty_flags': _load_json(terms.uncertainty_flags_json, []),
            'field_results': field_results,
            'currency': terms.currency,
        })

    for snapshot in PlanSnapshot.query.order_by(PlanSnapshot.retrieved_at.desc()).all():
        records.append({
            'id': 'PLAN-' + snapshot.plan_id,
            'category': 'PLAN_SNAPSHOT',
            'title': snapshot.name or snapshot.plan_id,
            'extracted_terms': snapshot.regular_price,
            'source_file': 'PayPal Sandbox plan snapshot',
            'source_label': SOURCE_LABEL_PLAN,
            'date': snapshot.retrieved_at.isoformat(),
            'plan_linked': snapshot.plan_id,
            'audit_id': None,
            'verdict': 'NOT AUDITED',
            'source': 'sqlite',
            'source_type': 'PAYPAL_PLAN',
            'evidence_quotes': [],
            'evidence_by_field': {},
            'evidence_status': 'NOT_APPLICABLE',
            'evidence_message': 'A plan snapshot is provider configuration, not advertised evidence.',
            'field_results': [],
            'currency': snapshot.currency,
            'billing_frequency': snapshot.billing_frequency,
            'fingerprint': snapshot.fingerprint,
        })

    for audit in VerificationAudit.query.order_by(VerificationAudit.created_at.desc()).all():
        report = build_audit_report(audit)
        records.append({
            'id': audit.id,
            'category': 'VERIFICATION_AUDIT',
            'title': report['advertised_terms'].get('product_name')
                or report['paypal_plan_terms'].get('name')
                or 'Verification audit ' + audit.id,
            'extracted_terms': _field_summary(audit),
            'source_file': report['source_file'],
            'source_label': report['source_label'],
            'date': audit.created_at.isoformat(),
            'plan_linked': audit.paypal_plan_id,
            'audit_id': audit.id,
            'verdict': report['verdict'],
            'source': 'sqlite',
            'source_type': report['source_type'],
            'evidence_quotes': report['supporting_evidence'],
            'evidence_by_field': report['evidence_by_field'],
            'evidence_status': report['evidence_status'],
            'evidence_message': report['evidence_message'],
            'field_results': report['fields'],
            'currency': report['currency'],
            'financial_delta': report['financial_impact']['difference_amount'],
            'confidence_score': report['confidence_score'],
            'ai_model': report['ai_model'],
        })

    for event in WebhookEvent.query.order_by(WebhookEvent.processed_at.desc()).all():
        records.append({
            'id': event.transmission_id,
            'category': 'WEBHOOK_EVENT',
            'title': event.event_type,
            'extracted_terms': event.summary,
            'source_file': 'PayPal webhook payload (signature verified)',
            'source_label': SOURCE_LABEL_WEBHOOK,
            'date': event.processed_at.isoformat(),
            'plan_linked': None,
            'audit_id': None,
            'verdict': 'RECORDED',
            'source': 'sqlite',
            'source_type': 'PAYPAL_WEBHOOK',
            'evidence_quotes': [],
            'evidence_by_field': {},
            'evidence_status': 'NOT_APPLICABLE',
            'evidence_message': 'Webhook deliveries are lifecycle events, not financial evidence.',
            'field_results': [],
            'event_id': event.event_id,
        })

    category_counts = defaultdict(int)
    for record in records:
        category_counts[record['category']] += 1

    return jsonify({
        'status': 'success',
        'source': 'sqlite',
        'counts': {
            'records': len(records),
            'by_category': dict(category_counts),
            'verified': sum(record['verdict'] == 'VERIFIED' for record in records),
            'with_quotations': sum(bool(record['evidence_quotes']) for record in records),
        },
        'records': records,
    })
