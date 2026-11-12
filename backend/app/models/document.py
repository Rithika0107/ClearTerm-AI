from datetime import datetime, timezone
from app.models import db

def utc_now():
    return datetime.now(timezone.utc)

class UploadedDocument(db.Model):
    __tablename__ = 'uploaded_documents'

    id = db.Column(db.String(36), primary_key=True) # UUID
    original_filename = db.Column(db.String(255), nullable=False)
    stored_filename = db.Column(db.String(255), nullable=False, unique=True)
    mime_type = db.Column(db.String(100), nullable=False)
    file_size_bytes = db.Column(db.Integer, nullable=False)
    sha256_hash = db.Column(db.String(64), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False, index=True)

    extracted_terms = db.relationship('ExtractedTerms', backref='document', uselist=False, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'original_filename': self.original_filename,
            'mime_type': self.mime_type,
            'file_size_bytes': self.file_size_bytes,
            'sha256_hash': self.sha256_hash,
            'created_at': self.created_at.isoformat(),
        }
