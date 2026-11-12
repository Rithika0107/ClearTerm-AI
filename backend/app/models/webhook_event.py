from datetime import datetime, timezone
from app.models import db

def utc_now():
    return datetime.now(timezone.utc)

class WebhookEvent(db.Model):
    __tablename__ = 'webhook_events'

    transmission_id = db.Column(db.String(128), primary_key=True) # Unique transmission ID from PayPal
    event_id = db.Column(db.String(128), nullable=True)
    event_type = db.Column(db.String(128), nullable=False, index=True)
    summary = db.Column(db.String(255), nullable=True)
    raw_payload_json = db.Column(db.Text, nullable=False)
    processed_at = db.Column(db.DateTime, default=utc_now, nullable=False, index=True)

    def to_dict(self):
        return {
            'transmission_id': self.transmission_id,
            'event_id': self.event_id,
            'event_type': self.event_type,
            'summary': self.summary,
            'processed_at': self.processed_at.isoformat(),
        }
