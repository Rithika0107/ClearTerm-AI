from datetime import datetime, timezone
import json
from app.models import db

def utc_now():
    return datetime.now(timezone.utc)

class PlanSnapshot(db.Model):
    __tablename__ = 'plan_snapshots'

    plan_id = db.Column(db.String(64), primary_key=True) # PayPal Plan ID (e.g. P-8Y2908182)
    product_id = db.Column(db.String(64), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(32), nullable=False)
    currency = db.Column(db.String(3), nullable=True)
    regular_price = db.Column(db.String(32), nullable=True)
    billing_frequency = db.Column(db.String(32), nullable=True)
    fingerprint = db.Column(db.String(64), nullable=False, index=True) # Canonical SHA-256
    canonical_json = db.Column(db.Text, nullable=False)
    raw_response_json = db.Column(db.Text, nullable=False)
    retrieved_at = db.Column(db.DateTime, default=utc_now, nullable=False, index=True)

    def to_dict(self):
        return {
            'plan_id': self.plan_id,
            'product_id': self.product_id,
            'name': self.name,
            'status': self.status,
            'currency': self.currency,
            'regular_price': self.regular_price,
            'billing_frequency': self.billing_frequency,
            'fingerprint': self.fingerprint,
            'retrieved_at': self.retrieved_at.isoformat(),
            'canonical_terms': json.loads(self.canonical_json) if self.canonical_json else {},
        }

class SubscriptionRecord(db.Model):
    __tablename__ = 'subscription_records'

    id = db.Column(db.String(64), primary_key=True) # PayPal Subscription ID (e.g. I-BW83J928190)
    paypal_plan_id = db.Column(db.String(64), nullable=False, index=True)
    customer_reference = db.Column(db.String(255), nullable=True)
    billing_amount = db.Column(db.String(32), nullable=False)
    currency = db.Column(db.String(3), nullable=False)
    status = db.Column(db.String(32), nullable=False, index=True) # APPROVAL_PENDING, APPROVED, ACTIVE, SUSPENDED, CANCELLED
    approved_fingerprint = db.Column(db.String(64), nullable=False)
    consent_recorded_at = db.Column(db.DateTime, nullable=True)
    next_billing_time = db.Column(db.DateTime, nullable=True)
    last_verified_at = db.Column(db.DateTime, default=utc_now, nullable=False)
    last_payment_status = db.Column(db.String(32), nullable=True)
    last_payment_event_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False, index=True)

    def to_dict(self):
        return {
            'id': self.id,
            'paypal_plan_id': self.paypal_plan_id,
            'customer_reference': self.customer_reference,
            'billing_amount': self.billing_amount,
            'currency': self.currency,
            'status': self.status,
            'approved_fingerprint': self.approved_fingerprint,
            'consent_recorded_at': self.consent_recorded_at.isoformat() if self.consent_recorded_at else None,
            'next_billing_time': self.next_billing_time.isoformat() if self.next_billing_time else None,
            'last_verified_at': self.last_verified_at.isoformat(),
            'last_payment_status': self.last_payment_status,
            'last_payment_event_at': self.last_payment_event_at.isoformat() if self.last_payment_event_at else None,
            'created_at': self.created_at.isoformat(),
        }
