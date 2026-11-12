from pathlib import Path
from flask import Blueprint, request, jsonify, current_app, send_file
from werkzeug.utils import secure_filename

from app.models import db
from app.models.document import UploadedDocument
from app.utils.security import validate_file_content, compute_sha256, generate_secure_storage_name

documents_bp = Blueprint('documents', __name__, url_prefix='/api/documents')

@documents_bp.route('/upload', methods=['POST'])
def upload_document():
    if 'file' not in request.files:
        return jsonify({'error': 'Bad Request', 'message': 'No file field present in multipart payload.'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'Bad Request', 'message': 'No file selected.'}), 400

    raw_filename = secure_filename(file.filename)
    file_bytes = file.read()
    file_size = len(file_bytes)

    # Check maximum file size
    max_length = current_app.config.get('MAX_CONTENT_LENGTH', 10 * 1024 * 1024)
    if file_size > max_length:
        return jsonify({
            'error': 'Payload Too Large',
            'message': f'File exceeds maximum size limit of {max_length // (1024 * 1024)} MB.'
        }), 413

    # Validate header magic bytes
    is_valid, mime_or_err, ext = validate_file_content(file_bytes, raw_filename)
    if not is_valid:
        return jsonify({'error': 'Invalid File Format', 'message': mime_or_err}), 400

    sha256_hash = compute_sha256(file_bytes)
    doc_id, stored_filename = generate_secure_storage_name(ext)

    # Save file to uploads folder
    upload_dir = Path(current_app.config['UPLOAD_FOLDER'])
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_path = upload_dir / stored_filename
    with open(stored_path, 'wb') as f:
        f.write(file_bytes)

    # Persist in SQLite
    doc_record = UploadedDocument(
        id=doc_id,
        original_filename=raw_filename,
        stored_filename=stored_filename,
        mime_type=mime_or_err,
        file_size_bytes=file_size,
        sha256_hash=sha256_hash,
    )
    db.session.add(doc_record)
    db.session.commit()

    return jsonify({
        'status': 'success',
        'message': 'Document uploaded and validated successfully.',
        'document': {
            **doc_record.to_dict(),
            'preview_url': f'/api/documents/{doc_id}/file',
        }
    }), 201

@documents_bp.route('/<doc_id>', methods=['GET'])
def get_document(doc_id):
    doc_record = db.session.get(UploadedDocument, doc_id)
    if not doc_record:
        return jsonify({'error': 'Not Found', 'message': 'Document not found.'}), 404

    return jsonify({
        'status': 'success',
        'document': {
            **doc_record.to_dict(),
            'preview_url': f'/api/documents/{doc_id}/file',
        }
    }), 200

@documents_bp.route('/<doc_id>/file', methods=['GET'])
def get_document_file(doc_id):
    doc_record = db.session.get(UploadedDocument, doc_id)
    if not doc_record:
        return jsonify({'error': 'Not Found', 'message': 'Document not found.'}), 404

    upload_dir = Path(current_app.config['UPLOAD_FOLDER'])
    file_path = upload_dir / doc_record.stored_filename
    if not file_path.exists():
        return jsonify({'error': 'Not Found', 'message': 'File missing from storage.'}), 404

    return send_file(str(file_path), mimetype=doc_record.mime_type)
