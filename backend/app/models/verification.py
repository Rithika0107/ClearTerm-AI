from datetime import datetime, timezone
from app.models import db

def utc_now():
    return datetime.now(timezone.utc)

class VerificationAudit(db.Model):
    __tablename__ = 'verification_audits'

    id = db.Column(db.String(36), primary_key=True)
    document_id = db.Column(db.String(36), db.ForeignKey('uploaded_documents.id'), nullable=True, index=True)
    paypal_plan_id = db.Column(db.String(64), nullable=False, index=True)
    plan_fingerprint = db.Column(db.String(64), nullable=False) # SHA-256 canonical hash
    verdict = db.Column(db.String(32), nullable=False, index=True) # VERIFIED, MISMATCH DETECTED, REQUIRES REVIEW
    field_diffs_json = db.Column(db.Text, nullable=False) # JSON array of evaluated comparisons
    financial_delta_first_year = db.Column(db.String(32), nullable=True) # Computed Decimal delta
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False, index=True)

    def to_dict(self):
        import json
        return {
            'id': self.id,
            'document_id': self.document_id,
            'paypal_plan_id': self.paypal_plan_id,
            'plan_fingerprint': self.plan_fingerprint,
            'verdict': self.verdict,
            'field_diffs': json.loads(self.field_diffs_json) if self.field_diffs_json else [],
            'financial_delta_first_year': self.financial_delta_first_year,
            'created_at': self.created_at.isoformat(),
        }
