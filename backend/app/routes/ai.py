import logging
import json
import uuid
import threading
from datetime import datetime, timezone
from pathlib import Path
from flask import Blueprint, request, jsonify, current_app

from app.models import db
from app.models.document import UploadedDocument
from app.models.extracted_terms import ExtractedTerms, GeminiExtractionJob
from app.services.gemini_service import (
    extract_terms_with_gemini,
    start_gemini_background_extraction,
    get_gemini_background_interaction,
    classify_gemini_interaction_failure,
    gemini_interaction_http_status,
    gemini_error_details,
    SubscriptionExtractionSchema,
    GeminiConfigurationError,
    GeminiExtractionError,
)

ai_bp = Blueprint('ai', __name__, url_prefix='/api/ai')
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
_submission_locks = {}
_submission_locks_guard = threading.Lock()


def _document_submission_lock(document_id):
    with _submission_locks_guard:
        return _submission_locks.setdefault(document_id, threading.Lock())


def _persist_extracted_terms(doc_record, extracted_result):
    terms_record = ExtractedTerms.query.filter_by(document_id=doc_record.id).first()
    if not terms_record:
        terms_record = ExtractedTerms(id=str(uuid.uuid4()), document_id=doc_record.id)
        db.session.add(terms_record)

    terms_record.product_name = extracted_result.get('product_name')
    terms_record.currency = extracted_result.get('currency') or 'XXX'
    terms_record.introductory_price = extracted_result.get('introductory_price')
    terms_record.introductory_cycles = extracted_result.get('introductory_cycles')
    terms_record.regular_price = extracted_result.get('regular_price') or 'UNKNOWN'
    terms_record.billing_frequency = extracted_result.get('billing_frequency') or 'UNKNOWN'
    terms_record.frequency_interval = extracted_result.get('frequency_interval')
    terms_record.trial_duration_days = extracted_result.get('trial_duration_days')
    terms_record.setup_fee = extracted_result.get('setup_fee')
    terms_record.auto_renewal = extracted_result.get('auto_renewal')
    terms_record.confidence_score = extracted_result['confidence_score']
    terms_record.evidence_quotes_json = json.dumps({
        'evidence_quotes': extracted_result.get('evidence_quotes', []),
        'evidence_by_field': extracted_result.get('evidence_by_field', {}),
        'billing_options': extracted_result.get('billing_options', []),
        'monthly_equivalent': extracted_result.get('monthly_equivalent'),
    })
    terms_record.uncertainty_flags_json = json.dumps(extracted_result.get('uncertainty_flags', []))
    terms_record.ai_model = extracted_result.get('ai_model') or current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
    db.session.commit()
    return terms_record


def _gemini_error_response(error):
    messages = {
        'AUTHENTICATION_FAILED': 'Gemini authentication failed.',
        'PERMISSION_DENIED': 'Gemini access was denied for this credential or project.',
        'QUOTA_OR_RATE_LIMIT': 'Gemini quota or rate limit was reached.',
        'MODEL_UNAVAILABLE': 'The configured Gemini model is unavailable for this credential or endpoint.',
        'NETWORK_TIMEOUT': 'Gemini request timed out.',
        'PROVIDER_TIMEOUT': 'Gemini did not complete generation before the provider deadline.',
        'NETWORK_ERROR': 'Gemini network connection failed.',
        'PROVIDER_ERROR': 'Gemini returned an unusable provider response.',
        'INVALID_RESPONSE': 'Gemini returned an unusable response.',
        'PROVIDER_EXECUTION_FAILED': 'Gemini could not complete extraction. Check model availability, quota, and provider execution status, then retry.',
        'PROVIDER_CANCELLED': 'Gemini cancelled the extraction before completion. Retry the upload.',
        'JOB_EXPIRED': 'Extraction status could not be confirmed before the configured job lifetime. Automatic retry is blocked because the prior provider operation may still be running.',
    }
    status_codes = {
        'AUTHENTICATION_FAILED': 401,
        'PERMISSION_DENIED': 403,
        'QUOTA_OR_RATE_LIMIT': 429,
        'MODEL_UNAVAILABLE': 503,
        'NETWORK_TIMEOUT': 504,
        'PROVIDER_TIMEOUT': 504,
        'NETWORK_ERROR': 502,
        'PROVIDER_ERROR': 502,
        'INVALID_RESPONSE': 502,
        'JOB_EXPIRED': 504,
    }
    response = {
        'error': 'Extraction Failed',
        'category': error.category,
        'message': messages.get(error.category, 'Gemini extraction failed.'),
    }
    if error.provider_code:
        response['provider_code'] = error.provider_code
    if error.provider_http_status:
        response['provider_http_status'] = error.provider_http_status
    return jsonify(response), status_codes.get(error.category, 502)


def _job_error_response(job):
    error = GeminiExtractionError(
        job.error_category or 'PROVIDER_EXECUTION_FAILED',
        job.provider_error_code,
        job.provider_http_status,
    )
    response, status_code = _gemini_error_response(error)
    payload = response.get_json()
    payload.update({
        'status': 'FAILED',
        'job_id': job.id,
        'terminal_at': job.terminal_at.isoformat() if job.terminal_at else None,
        'retry_allowed': job.error_category not in {'JOB_EXPIRED', 'NOT_CONFIGURED'} and bool(job.interaction_id),
    })
    return jsonify(payload), status_code


def _mark_job_failed(job, category, provider_code=None, provider_http_status=None):
    job.status = 'FAILED'
    job.error_category = category
    job.provider_error_code = provider_code or job.provider_error_code
    job.provider_http_status = provider_http_status or job.provider_http_status
    job.terminal_at = datetime.now(timezone.utc)
    job.updated_at = job.terminal_at
    db.session.commit()


def _job_expired(job):
    maximum_lifetime = max(1, int(current_app.config.get('GEMINI_JOB_MAX_LIFETIME_SECONDS', 900)))
    created_at = job.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - created_at).total_seconds() >= maximum_lifetime


def _expire_stale_job(job):
    _mark_job_failed(job, 'JOB_EXPIRED')
    logger.warning(
        'Gemini extraction job expired job_id=%s provider_code=%s http_status=%s job_elapsed_ms=%d',
        job.id,
        job.provider_error_code or 'UNKNOWN',
        job.provider_http_status or 'UNKNOWN',
        _job_elapsed_ms(job),
    )
    return _job_error_response(job)


def _submit_job(doc_record, file_path, allow_terminal_retry=False):
    with _document_submission_lock(doc_record.id):
        active_job = GeminiExtractionJob.query.filter_by(
            document_id=doc_record.id,
            status='IN_PROGRESS',
        ).order_by(GeminiExtractionJob.created_at.desc()).first()
        if active_job:
            if _job_expired(active_job):
                _mark_job_failed(active_job, 'JOB_EXPIRED')
                return _job_error_response(active_job)
            return jsonify({'status': 'IN_PROGRESS', 'job_id': active_job.id}), 202

        latest_job = GeminiExtractionJob.query.filter_by(
            document_id=doc_record.id,
        ).order_by(GeminiExtractionJob.created_at.desc()).first()
        if latest_job:
            if latest_job.status == 'FAILED' and not allow_terminal_retry:
                return _job_error_response(latest_job)
            if latest_job.status == 'COMPLETED':
                terms_record = ExtractedTerms.query.filter_by(document_id=doc_record.id).first()
                if terms_record:
                    return jsonify({'status': 'COMPLETED', 'terms': terms_record.to_dict()}), 200

        try:
            started = start_gemini_background_extraction(
                file_path=file_path,
                mime_type=doc_record.mime_type,
                api_key=current_app.config.get('GEMINI_API_KEY'),
                model_name=current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash'),
            )
            job = GeminiExtractionJob(
                id=str(uuid.uuid4()),
                document_id=doc_record.id,
                interaction_id=started['interaction_id'],
                status='IN_PROGRESS',
            )
            db.session.add(job)
            db.session.commit()
            return jsonify({
                'status': 'IN_PROGRESS',
                'job_id': job.id,
                'max_lifetime_seconds': max(1, int(current_app.config.get('GEMINI_JOB_MAX_LIFETIME_SECONDS', 900))),
            }), 202
        except GeminiConfigurationError as error:
            db.session.rollback()
            logger.warning('Gemini extraction unavailable category=NOT_CONFIGURED')
            return jsonify({'error': 'Gemini Not Configured', 'message': str(error)}), 503
        except GeminiExtractionError as error:
            db.session.rollback()
            return _gemini_error_response(error)
        except Exception as error:
            db.session.rollback()
            category, provider_code, provider_http_status = gemini_error_details(error)
            logger.warning(
                'Gemini background submission failed category=%s provider_code=%s http_status=%s',
                category,
                provider_code or 'UNKNOWN',
                provider_http_status or 'UNKNOWN',
            )
            return _gemini_error_response(GeminiExtractionError(category, provider_code, provider_http_status))

@ai_bp.route('/extract-terms', methods=['POST'])
def extract_terms():
    data = request.get_json(silent=True) or {}
    document_id = data.get('document_id')

    if not document_id:
        return jsonify({
            'error': 'Bad Request',
            'message': 'Field document_id is required.'
        }), 400

    doc_record = db.session.get(UploadedDocument, document_id)
    if not doc_record:
        return jsonify({
            'error': 'Not Found',
            'message': f'Document {document_id} does not exist.'
        }), 404

    upload_dir = Path(current_app.config['UPLOAD_FOLDER'])
    file_path = upload_dir / doc_record.stored_filename
    if not file_path.exists():
        return jsonify({
            'error': 'Not Found',
            'message': 'Underlying file missing from storage repository.'
        }), 404

    if current_app.testing:
        try:
            extracted_result = extract_terms_with_gemini(
                file_path=file_path,
                mime_type=doc_record.mime_type,
                api_key=current_app.config.get('GEMINI_API_KEY'),
                model_name=current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash'),
                allow_local_demo=True,
            )
            terms_record = _persist_extracted_terms(doc_record, extracted_result)
            return jsonify({
                'status': 'success',
                'message': 'Subscription terms extracted successfully via Gemini.',
                'terms': terms_record.to_dict(),
            }), 200
        except Exception:
            db.session.rollback()
            logger.warning('Gemini test extraction failed category=PROVIDER_ERROR')
            return jsonify({'error': 'Extraction Failed', 'category': 'PROVIDER_ERROR'}), 502

    return _submit_job(doc_record, file_path)


@ai_bp.route('/extract-terms/<job_id>/retry', methods=['POST'])
def retry_extraction_job(job_id):
    previous_job = db.session.get(GeminiExtractionJob, job_id)
    if not previous_job:
        return jsonify({'error': 'Not Found', 'message': 'Extraction job not found.'}), 404
    if previous_job.status != 'FAILED' or previous_job.error_category == 'JOB_EXPIRED' or not previous_job.interaction_id:
        return jsonify({
            'error': 'Retry Not Safe',
            'message': 'Retry is available only after Gemini has confirmed a terminal extraction failure.',
            'category': 'RETRY_NOT_SAFE',
        }), 409
    doc_record = db.session.get(UploadedDocument, previous_job.document_id)
    file_path = Path(current_app.config['UPLOAD_FOLDER']) / doc_record.stored_filename
    if not file_path.exists():
        return jsonify({'error': 'Not Found', 'message': 'Underlying file missing from storage repository.'}), 404
    active_job = GeminiExtractionJob.query.filter_by(document_id=doc_record.id, status='IN_PROGRESS').first()
    if active_job:
        if _job_expired(active_job):
            _mark_job_failed(active_job, 'JOB_EXPIRED')
            return jsonify({
                'error': 'Retry Not Safe',
                'message': 'The previous provider operation did not reach a confirmed terminal result.',
                'category': 'RETRY_NOT_SAFE',
            }), 409
        return jsonify({
            'status': 'IN_PROGRESS',
            'job_id': active_job.id,
            'max_lifetime_seconds': max(1, int(current_app.config.get('GEMINI_JOB_MAX_LIFETIME_SECONDS', 900))),
        }), 202
    return _submit_job(doc_record, file_path, allow_terminal_retry=True)


@ai_bp.route('/extract-terms/<job_id>', methods=['GET'])
def get_extraction_job(job_id):
    job = db.session.get(GeminiExtractionJob, job_id)
    if not job:
        return jsonify({'error': 'Not Found', 'message': 'Extraction job not found.'}), 404

    if job.status == 'COMPLETED':
        terms_record = ExtractedTerms.query.filter_by(document_id=job.document_id).first()
        if terms_record:
            return jsonify({'status': 'COMPLETED', 'terms': terms_record.to_dict()}), 200
        _mark_job_failed(job, 'PERSISTENCE_ERROR')
        return _job_error_response(job)
    if job.status == 'FAILED':
        return _job_error_response(job)

    if _job_expired(job):
        return _expire_stale_job(job)

    try:
        interaction = get_gemini_background_interaction(
            interaction_id=job.interaction_id,
            api_key=current_app.config.get('GEMINI_API_KEY'),
            model_name=current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash'),
        )
    except GeminiConfigurationError:
        job.error_category = 'NOT_CONFIGURED'
        job.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        logger.warning(
            'Gemini extraction poll unavailable category=NOT_CONFIGURED job_elapsed_ms=%d',
            _job_elapsed_ms(job),
        )
        if _job_expired(job):
            return _expire_stale_job(job)
        return jsonify({'status': 'IN_PROGRESS', 'category': job.error_category}), 202
    except GeminiExtractionError as error:
        job.error_category = error.category
        job.provider_error_code = error.provider_code or job.provider_error_code
        job.provider_http_status = error.provider_http_status or job.provider_http_status
        job.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        logger.warning(
            'Gemini extraction poll unavailable category=%s provider_code=%s http_status=%s job_elapsed_ms=%d',
            error.category,
            error.provider_code or 'UNKNOWN',
            error.provider_http_status or 'UNKNOWN',
            _job_elapsed_ms(job),
        )
        if _job_expired(job):
            return _expire_stale_job(job)
        return jsonify({'status': 'IN_PROGRESS', 'category': error.category}), 202

    interaction_status = str(getattr(interaction, 'status', '') or '').lower()
    if interaction_status == 'in_progress':
        return jsonify({'status': 'IN_PROGRESS'}), 202
    if interaction_status != 'completed':
        category, provider_code = classify_gemini_interaction_failure(interaction)
        job.status = 'FAILED'
        job.error_category = category
        job.provider_error_code = provider_code
        job.provider_http_status = gemini_interaction_http_status(interaction)
        job.terminal_at = datetime.now(timezone.utc)
        job.updated_at = job.terminal_at
        db.session.commit()
        logger.warning(
            'Gemini interaction ended without output status=%s category=%s provider_code=%s http_status=%s job_elapsed_ms=%d',
            interaction_status or 'UNKNOWN',
            category,
            provider_code or 'UNKNOWN',
            job.provider_http_status or 'UNKNOWN',
            _job_elapsed_ms(job),
        )
        return _gemini_error_response(GeminiExtractionError(category, provider_code))

    try:
        extracted_result = SubscriptionExtractionSchema.model_validate_json(
            interaction.output_text
        ).model_dump()
        extracted_result['ai_model'] = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
        terms_record = _persist_extracted_terms(
            db.session.get(UploadedDocument, job.document_id),
            extracted_result,
        )
        job.status = 'COMPLETED'
        job.terminal_at = datetime.now(timezone.utc)
        job.updated_at = job.terminal_at
        db.session.commit()
    except Exception:
        db.session.rollback()
        job = db.session.get(GeminiExtractionJob, job_id)
        job.status = 'FAILED'
        job.error_category = 'INVALID_RESPONSE'
        job.terminal_at = datetime.now(timezone.utc)
        job.updated_at = job.terminal_at
        db.session.commit()
        logger.warning(
            'Gemini extraction result rejected category=INVALID_RESPONSE job_elapsed_ms=%d',
            _job_elapsed_ms(job),
        )
        return jsonify({'status': 'FAILED', 'category': job.error_category}), 502

    logger.info('Gemini extraction completed job_elapsed_ms=%d', _job_elapsed_ms(job))
    return jsonify({'status': 'COMPLETED', 'terms': terms_record.to_dict()}), 200


def _job_elapsed_ms(job):
    created_at = job.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return max(0, int((datetime.now(timezone.utc) - created_at).total_seconds() * 1000))
