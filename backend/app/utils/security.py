import hashlib
import uuid
from pathlib import Path
from typing import Tuple, Optional

# Magic byte signatures for authorized document formats
MAGIC_SIGNATURES = {
    'png': b'\x89PNG\r\n\x1a\n',
    'jpg': b'\xff\xd8\xff',
    'jpeg': b'\xff\xd8\xff',
    'webp': b'RIFF', # WEBP begins with RIFF....WEBP
    'pdf': b'%PDF-',
}

def compute_sha256(file_bytes: bytes) -> str:
    """Computes standard hex SHA-256 hash of file content."""
    hasher = hashlib.sha256()
    hasher.update(file_bytes)
    return hasher.hexdigest()

def validate_file_content(file_bytes: bytes, original_filename: str) -> Tuple[bool, str, Optional[str]]:
    """
    Validates file extension, length, and true binary header magic bytes.
    Returns (is_valid, error_message_or_mime, extension).
    """
    if not file_bytes:
        return False, "Uploaded file is empty (0 bytes).", None

    ext = Path(original_filename).suffix.lower().lstrip('.')
    if ext not in MAGIC_SIGNATURES and ext != 'jpeg':
        return False, f"Unsupported file extension .{ext}. Allowed: PDF, PNG, JPG, WEBP.", None

    # Check magic bytes
    if ext == 'png':
        if not file_bytes.startswith(MAGIC_SIGNATURES['png']):
            return False, "File content header does not match valid PNG format.", None
        return True, "image/png", "png"

    elif ext in ('jpg', 'jpeg'):
        if not file_bytes.startswith(MAGIC_SIGNATURES['jpg']):
            return False, "File content header does not match valid JPEG format.", None
        return True, "image/jpeg", "jpg"

    elif ext == 'webp':
        if not (file_bytes.startswith(b'RIFF') and len(file_bytes) > 12 and file_bytes[8:12] == b'WEBP'):
            return False, "File content header does not match valid WEBP format.", None
        return True, "image/webp", "webp"

    elif ext == 'pdf':
        if not file_bytes.startswith(MAGIC_SIGNATURES['pdf']):
            return False, "File content header does not match valid PDF format.", None
        return True, "application/pdf", "pdf"

    return False, "Unrecognized binary header format.", None

def generate_secure_storage_name(extension: str) -> Tuple[str, str]:
    """Generates a UUID string and safe filename to store on disk."""
    doc_id = str(uuid.uuid4())
    stored_name = f"{doc_id}.{extension}"
    return doc_id, stored_name
