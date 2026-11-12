from datetime import datetime, timezone
from app.models import db

def utc_now():
    return datetime.now(timezone.utc)

class ExtractedTerms(db.Model):
    __tablename__ = 'extracted_terms'

    id = db.Column(db.String(36), primary_key=True)
    document_id = db.Column(db.String(36), db.ForeignKey('uploaded_documents.id'), nullable=False, unique=True, index=True)
    product_name = db.Column(db.String(255), nullable=True)
    currency = db.Column(db.String(3), nullable=False, index=True) # ISO 4217 code
    introductory_price = db.Column(db.String(32), nullable=True) # Exact string representation
    introductory_cycles = db.Column(db.Integer, nullable=True)
    regular_price = db.Column(db.String(32), nullable=False) # Exact string representation
    billing_frequency = db.Column(db.String(32), nullable=False) # MONTH, YEAR, etc.
    frequency_interval = db.Column(db.Integer, nullable=True, default=1)
    trial_duration_days = db.Column(db.Integer, nullable=True)
    setup_fee = db.Column(db.String(32), nullable=True)
    auto_renewal = db.Column(db.Boolean, default=None)
    confidence_score = db.Column(db.Float, nullable=False)
    evidence_quotes_json = db.Column(db.Text, nullable=False) # JSON array of cited strings
    uncertainty_flags_json = db.Column(db.Text, nullable=False) # JSON array of warnings
    ai_model = db.Column(db.String(64), nullable=False)
    extracted_at = db.Column(db.DateTime, default=utc_now, nullable=False)

    def to_dict(self):
        import json
        evidence_payload = json.loads(self.evidence_quotes_json) if self.evidence_quotes_json else []
        if isinstance(evidence_payload, dict):
            evidence_quotes = evidence_payload.get('evidence_quotes', [])
            evidence_by_field = evidence_payload.get('evidence_by_field', {})
            billing_options = evidence_payload.get('billing_options', [])
            monthly_equivalent = evidence_payload.get('monthly_equivalent')
        else:
            evidence_quotes = evidence_payload
            evidence_by_field = {}
            billing_options = []
            monthly_equivalent = None
        return {
            'id': self.id,
            'document_id': self.document_id,
            'product_name': self.product_name,
            'currency': self.currency,
            'introductory_price': self.introductory_price,
            'introductory_cycles': self.introductory_cycles,
            'regular_price': self.regular_price,
            'billing_frequency': self.billing_frequency,
            'frequency_interval': self.frequency_interval,
            'trial_duration_days': self.trial_duration_days,
            'setup_fee': self.setup_fee,
            'auto_renewal': self.auto_renewal,
            'confidence_score': self.confidence_score,
            'evidence_quotes': evidence_quotes,
            'evidence_by_field': evidence_by_field,
            'billing_options': billing_options,
            'monthly_equivalent': monthly_equivalent,
            'uncertainty_flags': json.loads(self.uncertainty_flags_json) if self.uncertainty_flags_json else [],
            'ai_model': self.ai_model,
            'extracted_at': self.extracted_at.isoformat(),
        }


class GeminiExtractionJob(db.Model):
    __tablename__ = 'gemini_extraction_jobs'

    id = db.Column(db.String(36), primary_key=True)
    document_id = db.Column(db.String(36), db.ForeignKey('uploaded_documents.id'), nullable=False, index=True)
    interaction_id = db.Column(db.String(128), nullable=False, unique=True)
    status = db.Column(db.String(32), nullable=False, default='IN_PROGRESS', index=True)
    error_category = db.Column(db.String(64), nullable=True)
    provider_error_code = db.Column(db.String(64), nullable=True)
    provider_http_status = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now, nullable=False)
    terminal_at = db.Column(db.DateTime, nullable=True)
