"""Hydration of persisted verification audits into full report payloads.

The verification engine produces a rich result, but only a compact audit row is
persisted.  This service rebuilds the report from SQLite so that a report can be
reopened after a browser refresh without ever re-running Gemini or PayPal.

A key integrity rule lives here: an audit whose evidence is incomplete must
never be presented as VERIFIED.  The stored verdict is preserved verbatim and a
separate ``display_verdict`` is derived for presentation.
"""

import json

from app.models import db
from app.models.document import UploadedDocument
from app.models.extracted_terms import ExtractedTerms
from app.models.subscription import PlanSnapshot
from app.models.verification import VerificationAudit
from app.services.paypal_service import PayPalClient

SOURCE_LABEL_DOCUMENT = 'Uploaded Document • Gemini Extraction'
SOURCE_LABEL_MANUAL = 'Manual Demo Input – Not AI Extracted'
SOURCE_TYPE_DOCUMENT = 'DOCUMENT_UPLOAD'
SOURCE_TYPE_MANUAL = 'MANUAL_DEMO'

# Field names whose evidence is required before a document audit may be
# presented as VERIFIED.  These are the terms the verdict actually rests on.
EVIDENCE_CRITICAL_FIELDS = (
    'regular_price',
    'billing_frequency',
    'currency',
)


def _load_json(raw, default):
    if not raw:
        return default
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return default
    return parsed if isinstance(parsed, type(default)) else default


def _evidence_payload(terms):
    """Returns (flat_quotes, evidence_by_field) from a persisted terms row."""
    if not terms or not terms.evidence_quotes_json:
        return [], {}
    parsed = _load_json(terms.evidence_quotes_json, {})
    if isinstance(parsed, dict):
        quotes = parsed.get('evidence_quotes') or []
        by_field = parsed.get('evidence_by_field') or {}
    else:
        quotes = parsed if isinstance(parsed, list) else []
        by_field = {}
    if not isinstance(quotes, list):
        quotes = []
    if not isinstance(by_field, dict):
        by_field = {}
    return quotes, by_field


def _flatten_evidence(evidence_by_field):
    flattened = []
    for field_name, field_quotes in evidence_by_field.items():
        values = field_quotes if isinstance(field_quotes, list) else [field_quotes]
        for quote in values:
            text = str(quote or '').strip()
            if text:
                flattened.append({'field_name': field_name, 'quote': text})
    return flattened


def _paypal_plan_terms(plan_id):
    snapshot = db.session.get(PlanSnapshot, plan_id) if plan_id else None
    if not snapshot:
        return {}
    raw = _load_json(snapshot.raw_response_json, {})
    if raw:
        try:
            return PayPalClient()._format_plan_details(raw)
        except Exception:
            pass
    return {
        'id': snapshot.plan_id,
        'product_id': snapshot.product_id,
        'name': snapshot.name,
        'status': snapshot.status,
        'currency': snapshot.currency,
        'regular_price': snapshot.regular_price,
        'billing_frequency': snapshot.billing_frequency,
        'introductory_price': None,
        'introductory_cycles': None,
        'trial_days': None,
        'setup_fee': None,
        'frequency_interval': None,
        'billing_cycles': [],
    }


def assess_evidence(fields, evidence_by_field, source_type):
    """Reports whether the quotations actually cover the audited findings."""
    if source_type == SOURCE_TYPE_MANUAL:
        return {
            'status': 'NOT_APPLICABLE',
            'complete': False,
            'matched_fields_without_evidence': [],
            'message': 'Manual demo input carries no document quotations. Test-only comparison.',
        }
    critical_missing = []
    quoted_names = {name for name, quotes in evidence_by_field.items() if quotes}
    for field in fields:
        if field.get('comparison_status') != 'MATCH':
            continue
        field_name = field.get('field_name')
        if field_name in EVIDENCE_CRITICAL_FIELDS and field_name not in quoted_names:
            critical_missing.append(field_name)
    if critical_missing:
        return {
            'status': 'INCOMPLETE',
            'complete': False,
            'matched_fields_without_evidence': critical_missing,
            'message': (
                'No source quotation backs: '
                + ', '.join(name.replace('_', ' ') for name in critical_missing)
                + '. The audit cannot be presented as VERIFIED.'
            ),
        }
    return {
        'status': 'COMPLETE',
        'complete': True,
        'matched_fields_without_evidence': [],
        'message': 'Every matched financial term is backed by a stored quotation.',
    }


def build_audit_report(audit):
    """Rebuilds a full report payload from persisted audit data only."""
    if not isinstance(audit, VerificationAudit):
        return None
    document = db.session.get(UploadedDocument, audit.document_id) if audit.document_id else None
    terms = (
        ExtractedTerms.query.filter_by(document_id=audit.document_id).first()
        if audit.document_id
        else None
    )
    fields = _load_json(audit.field_diffs_json, [])
    quotes, evidence_by_field = _evidence_payload(terms)
    source_type = SOURCE_TYPE_DOCUMENT if audit.document_id else SOURCE_TYPE_MANUAL
    evidence = assess_evidence(fields, evidence_by_field, source_type)
    shown_verdict = audit.verdict
    downgraded = False
    if audit.verdict == 'VERIFIED' and evidence['status'] == 'INCOMPLETE':
        shown_verdict = 'REQUIRES REVIEW'
        downgraded = True

    advertised_terms = terms.to_dict() if terms else {
        'product_name': SOURCE_LABEL_MANUAL,
        'currency': next(
            (field.get('actual_value') for field in fields if field.get('field_name') == 'currency'),
            None,
        ),
        'regular_price': next(
            (field.get('advertised_value') for field in fields if field.get('field_name') == 'regular_price'),
            'UNKNOWN',
        ),
        'billing_frequency': 'UNKNOWN',
        'evidence_quotes': [],
        'evidence_by_field': {},
    }
    plan_terms = _paypal_plan_terms(audit.paypal_plan_id)
    supporting_evidence = sorted({item['quote'] for item in _flatten_evidence(evidence_by_field)})

    return {
        'audit_id': audit.id,
        'verification_id': audit.id,
        'document_id': audit.document_id,
        'source_type': source_type,
        'source_label': SOURCE_LABEL_DOCUMENT if terms else SOURCE_LABEL_MANUAL,
        'source_file': document.original_filename if document else None,
        'ai_model': terms.ai_model if terms else None,
        'confidence_score': terms.confidence_score if terms else None,
        'verdict': shown_verdict,
        'stored_verdict': audit.verdict,
        'verdict_downgraded': downgraded,
        'evidence_status': evidence['status'],
        'evidence_complete': evidence['complete'],
        'evidence_message': evidence['message'],
        'matched_fields_without_evidence': evidence['matched_fields_without_evidence'],
        'paypal_plan_id': audit.paypal_plan_id,
        'plan_fingerprint': audit.plan_fingerprint,
        'fields': fields,
        'supporting_evidence': supporting_evidence,
        'evidence_by_field': evidence_by_field,
        'financial_impact': {
            'status': 'CALCULATED' if audit.financial_delta_first_year is not None else 'REQUIRES REVIEW',
            'difference_amount': audit.financial_delta_first_year,
        },
        'currency': (terms.currency if terms else None) or plan_terms.get('currency'),
        'advertised_terms': advertised_terms,
        'paypal_plan_terms': plan_terms,
        'verification_timestamp': audit.created_at.isoformat(),
        'created_at': audit.created_at.isoformat(),
    }


def build_audit_summary(audit):
    """Compact row for report indexes and dashboard tables."""
    report = build_audit_report(audit)
    if not report:
        return None
    return {
        'audit_id': report['audit_id'],
        'document_id': report['document_id'],
        'source_type': report['source_type'],
        'source_label': report['source_label'],
        'source_file': report['source_file'],
        'product': report['advertised_terms'].get('product_name') or report['paypal_plan_terms'].get('name'),
        'paypal_plan_id': report['paypal_plan_id'],
        'verdict': report['verdict'],
        'stored_verdict': report['stored_verdict'],
        'verdict_downgraded': report['verdict_downgraded'],
        'evidence_status': report['evidence_status'],
        'evidence_quote_count': len(report['supporting_evidence']),
        'field_count': len(report['fields']),
        'financial_delta': report['financial_impact']['difference_amount'],
        'currency': report['currency'],
        'created_at': report['created_at'],
    }
