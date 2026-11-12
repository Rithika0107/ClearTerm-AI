import io
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
import pytest
import pymupdf
from pathlib import Path
from decimal import Decimal
from types import SimpleNamespace
from app import create_app
from app.models import db
from app.models.document import UploadedDocument
from app.models.extracted_terms import ExtractedTerms, GeminiExtractionJob
from app.config import Config
from app.services.gemini_service import (
    extract_terms_with_gemini,
    start_gemini_background_extraction,
    get_gemini_background_interaction,
    SubscriptionExtractionSchema,
    GeminiExtractionError,
    classify_gemini_provider_code,
    gemini_error_details,
)

class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    RATELIMIT_ENABLED = False
    GEMINI_API_KEY = ''

@pytest.fixture
def client(tmp_path):
    class TempFolderConfig(TestConfig):
        UPLOAD_FOLDER = tmp_path / 'uploads'

    app = create_app(TempFolderConfig)
    with app.app_context():
        yield app.test_client()

def test_document_upload_valid_png(client):
    # Valid PNG magic bytes header + dummy content
    png_bytes = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR' + (b'\x00' * 50)
    data = {
        'file': (io.BytesIO(png_bytes), 'promo_flyer.png')
    }
    response = client.post('/api/documents/upload', data=data, content_type='multipart/form-data')
    assert response.status_code == 201
    res_data = response.get_json()
    assert res_data['status'] == 'success'
    assert 'document' in res_data
    assert res_data['document']['original_filename'] == 'promo_flyer.png'
    assert res_data['document']['mime_type'] == 'image/png'
    assert len(res_data['document']['sha256_hash']) == 64

def test_document_upload_spoofed_content_rejected(client):
    # Non-PNG content with .png extension
    fake_bytes = b'NOT_A_REAL_PNG_FILE_JUST_PLAIN_TEXT'
    data = {
        'file': (io.BytesIO(fake_bytes), 'spoofed.png')
    }
    response = client.post('/api/documents/upload', data=data, content_type='multipart/form-data')
    assert response.status_code == 400
    res_data = response.get_json()
    assert res_data['error'] == 'Invalid File Format'

def test_document_upload_empty_file_rejected(client):
    data = {
        'file': (io.BytesIO(b''), 'empty.pdf')
    }
    response = client.post('/api/documents/upload', data=data, content_type='multipart/form-data')
    assert response.status_code == 400

def test_ai_extract_terms_workflow(client):
    # 1. Upload valid document
    png_bytes = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR' + (b'\x00' * 50)
    upload_res = client.post(
        '/api/documents/upload',
        data={'file': (io.BytesIO(png_bytes), 'cloudsync_flyer.png')},
        content_type='multipart/form-data'
    )
    assert upload_res.status_code == 201
    doc_id = upload_res.get_json()['document']['id']

    # 2. Extract terms
    extract_res = client.post(
        '/api/ai/extract-terms',
        data=json.dumps({'document_id': doc_id}),
        content_type='application/json'
    )
    assert extract_res.status_code == 200
    extract_data = extract_res.get_json()
    assert extract_data['status'] == 'success'
    terms = extract_data['terms']
    assert terms['currency'] == 'USD'
    assert terms['regular_price'] is not None
    assert terms['billing_frequency'] in ['MONTH', 'YEAR', 'WEEK', 'DAY', 'UNKNOWN']
    assert isinstance(terms['confidence_score'], float)
    assert len(terms['evidence_quotes']) > 0

    # 3. Verify SQLite persistence
    stored_term = ExtractedTerms.query.filter_by(document_id=doc_id).first()
    assert stored_term is not None
    assert stored_term.product_name == terms['product_name']


def _uploaded_jiohotstar_pdf():
    upload_dir = Path(__file__).resolve().parents[1] / 'uploads'
    for candidate in upload_dir.glob('*.pdf'):
        document = pymupdf.open(str(candidate))
        source_text = '\n'.join(page.get_text() for page in document)
        if 'hotstar.com/in/paywall' in source_text.lower():
            return candidate, source_text
    pytest.skip('The previously uploaded JioHotstar PDF is not available in this checkout.')


def test_jiohotstar_pdf_exposes_distinct_billing_intervals():
    _, source_text = _uploaded_jiohotstar_pdf()
    normalized_text = ' '.join(source_text.upper().split())

    assert '1 MONTH' in normalized_text
    assert '3 MONTHS' in normalized_text
    assert '1 Y' in normalized_text
    assert 'PER MONTH' in normalized_text


def test_extraction_job_endpoint_rejects_unknown_job(client):
    response = client.get('/api/ai/extract-terms/not-a-real-job')
    assert response.status_code == 404


@pytest.mark.parametrize(('provider_code', 'category'), [
    ('UNAUTHENTICATED', 'AUTHENTICATION_FAILED'),
    ('PERMISSION_DENIED', 'PERMISSION_DENIED'),
    ('NOT_FOUND', 'MODEL_UNAVAILABLE'),
    ('RESOURCE_EXHAUSTED', 'QUOTA_OR_RATE_LIMIT'),
    ('DEADLINE_EXCEEDED', 'PROVIDER_TIMEOUT'),
    ('UNAVAILABLE', 'NETWORK_ERROR'),
    ('OTHER_PROVIDER_FAILURE', 'PROVIDER_EXECUTION_FAILED'),
])
def test_gemini_provider_codes_are_classified_without_messages(provider_code, category):
    assert classify_gemini_provider_code(provider_code) == category


def test_gemini_http_timeout_preserves_sanitized_status_and_code():
    provider_error = SimpleNamespace(code=504, status='DEADLINE_EXCEEDED')
    assert gemini_error_details(provider_error) == ('PROVIDER_TIMEOUT', 'DEADLINE_EXCEEDED', 504)


def _create_uploaded_document(client, name='job_lifecycle.png'):
    response = client.post(
        '/api/documents/upload',
        data={'file': (io.BytesIO(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR' + b'\x00' * 50), name)},
        content_type='multipart/form-data',
    )
    assert response.status_code == 201
    return response.get_json()['document']['id']


def _create_job(document_id, job_id='JOB-LIFECYCLE', **kwargs):
    job = GeminiExtractionJob(
        id=job_id,
        document_id=document_id,
        interaction_id=kwargs.pop('interaction_id', f'provider-{job_id}'),
        status=kwargs.pop('status', 'IN_PROGRESS'),
        **kwargs,
    )
    db.session.add(job)
    db.session.commit()
    return job


def test_stale_job_is_persisted_terminal_without_polling(client):
    from unittest.mock import patch

    document_id = _create_uploaded_document(client, 'stale_job.png')
    job = _create_job(document_id, 'JOB-STALE')
    job.created_at = datetime.now(timezone.utc) - timedelta(seconds=30)
    db.session.commit()
    client.application.config['GEMINI_JOB_MAX_LIFETIME_SECONDS'] = 5

    with patch('app.routes.ai.get_gemini_background_interaction') as poll:
        response = client.get(f'/api/ai/extract-terms/{job.id}')

    assert response.status_code == 504
    assert response.get_json()['status'] == 'FAILED'
    assert response.get_json()['category'] == 'JOB_EXPIRED'
    assert response.get_json()['retry_allowed'] is False
    db.session.refresh(job)
    assert job.status == 'FAILED'
    assert job.error_category == 'JOB_EXPIRED'
    assert job.terminal_at is not None
    assert job.interaction_id == 'provider-JOB-STALE'
    poll.assert_not_called()


@pytest.mark.parametrize(('category', 'http_status'), [
    ('NETWORK_TIMEOUT', 504),
    ('PROVIDER_TIMEOUT', 504),
    ('NETWORK_ERROR', 502),
    ('QUOTA_OR_RATE_LIMIT', 429),
    ('AUTHENTICATION_FAILED', 401),
    ('PROVIDER_ERROR', 502),
])
def test_poll_request_failures_remain_pending_until_expiry(client, category, http_status):
    from unittest.mock import patch

    document_id = _create_uploaded_document(client, f'{category.lower()}.png')
    job = _create_job(document_id, f'JOB-{category}', provider_http_status=None)
    client.application.config['GEMINI_JOB_MAX_LIFETIME_SECONDS'] = 900
    transient_error = GeminiExtractionError(category, 'RESOURCE_EXHAUSTED' if category == 'QUOTA_OR_RATE_LIMIT' else None, http_status)

    with patch('app.routes.ai.get_gemini_background_interaction', side_effect=transient_error):
        response = client.get(f'/api/ai/extract-terms/{job.id}')

    assert response.status_code == 202
    assert response.get_json()['status'] == 'IN_PROGRESS'
    db.session.refresh(job)
    assert job.status == 'IN_PROGRESS'
    assert job.terminal_at is None
    assert job.interaction_id == f'provider-JOB-{category}'
    assert job.provider_http_status == http_status


def test_duplicate_extraction_submission_reuses_existing_operation(client):
    from unittest.mock import patch

    document_id = _create_uploaded_document(client, 'duplicate_job.png')
    client.application.testing = False
    app_config = client.application.config
    with client.application.app_context():
        doc = db.session.get(UploadedDocument, document_id)
        upload_path = Path(app_config['UPLOAD_FOLDER']) / doc.stored_filename

    with patch('app.routes.ai.start_gemini_background_extraction', return_value={'interaction_id': 'provider-one'} ) as submit:
        first = client.post('/api/ai/extract-terms', json={'document_id': document_id})
        second = client.post('/api/ai/extract-terms', json={'document_id': document_id})

    assert first.status_code == 202
    assert second.status_code == 202
    assert second.get_json()['job_id'] == first.get_json()['job_id']
    submit.assert_called_once_with(
        file_path=upload_path,
        mime_type='image/png',
        api_key=app_config.get('GEMINI_API_KEY'),
        model_name=app_config.get('GEMINI_MODEL', 'gemini-2.5-flash'),
    )


def test_operator_retry_requires_confirmed_terminal_failure_and_reuses_running_retry(client):
    from unittest.mock import patch

    document_id = _create_uploaded_document(client, 'retry_job.png')
    client.application.testing = False
    failed_job = _create_job(
        document_id,
        'JOB-RETRY-FAILED',
        status='FAILED',
        error_category='PROVIDER_TIMEOUT',
        provider_error_code='DEADLINE_EXCEEDED',
        terminal_at=datetime.now(timezone.utc),
    )
    with patch('app.routes.ai.start_gemini_background_extraction', return_value={'interaction_id': 'provider-retry-one'}) as submit:
        first = client.post(f'/api/ai/extract-terms/{failed_job.id}/retry')
        second = client.post(f'/api/ai/extract-terms/{failed_job.id}/retry')
    assert first.status_code == 202
    assert second.status_code == 202
    assert second.get_json()['job_id'] == first.get_json()['job_id']
    submit.assert_called_once()


def test_operator_retry_rejects_stale_unconfirmed_operation(client):
    from unittest.mock import patch

    document_id = _create_uploaded_document(client, 'unsafe_retry.png')
    stale_job = _create_job(
        document_id,
        'JOB-RETRY-STALE',
        status='FAILED',
        error_category='JOB_EXPIRED',
        terminal_at=datetime.now(timezone.utc),
    )
    client.application.testing = False
    with patch('app.routes.ai.start_gemini_background_extraction') as submit:
        response = client.post(f'/api/ai/extract-terms/{stale_job.id}/retry')
    assert response.status_code == 409
    assert response.get_json()['category'] == 'RETRY_NOT_SAFE'
    submit.assert_not_called()


def test_failed_gemini_interaction_returns_safe_quota_diagnostic(client):
    upload = client.post(
        '/api/documents/upload',
        data={'file': (io.BytesIO(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR' + b'\x00' * 50), 'quota_test.png')},
        content_type='multipart/form-data',
    )
    assert upload.status_code == 201
    document_id = upload.get_json()['document']['id']
    job = GeminiExtractionJob(
        id='JOB-RESOURCE-EXHAUSTED',
        document_id=document_id,
        interaction_id='interaction-safe-id',
        status='IN_PROGRESS',
    )
    db.session.add(job)
    db.session.commit()
    private_provider_message = 'This provider message must never be exposed.'
    failed_interaction = SimpleNamespace(
        status='failed',
        errors=[SimpleNamespace(code='RESOURCE_EXHAUSTED', message=private_provider_message)],
    )

    from unittest.mock import patch
    with patch('app.routes.ai.get_gemini_background_interaction', return_value=failed_interaction):
        response = client.get(f'/api/ai/extract-terms/{job.id}')

    assert response.status_code == 429
    data = response.get_json()
    assert data['category'] == 'QUOTA_OR_RATE_LIMIT'
    assert data['provider_code'] == 'RESOURCE_EXHAUSTED'
    assert data['message'] == 'Gemini quota or rate limit was reached.'
    assert private_provider_message not in response.get_data(as_text=True)
    db.session.refresh(job)
    assert job.status == 'FAILED'
    assert job.error_category == 'QUOTA_OR_RATE_LIMIT'
    assert job.provider_error_code == 'RESOURCE_EXHAUSTED'


@pytest.mark.skipif(
    os.getenv('GEMINI_LIVE_TEST') != '1' or not Config.GEMINI_API_KEY,
    reason='Set GEMINI_LIVE_TEST=1 with GEMINI_API_KEY configured to call Gemini using the real PDF.',
)
def test_jiohotstar_live_gemini_pdf_and_image_extract_inr(tmp_path):
    pdf_path, source_text = _uploaded_jiohotstar_pdf()
    normalized_source = ' '.join(source_text.upper().split())
    expected_totals = {
        ('MONTH', 1): {Decimal(value.replace(',', '')) for value in re.findall(r'1 MONTH\s+₹\s*([\d,]+)', normalized_source)},
        ('MONTH', 3): {Decimal(value.replace(',', '')) for value in re.findall(r'3 MONTHS\s+₹\s*([\d,]+)', normalized_source)},
    }
    assert expected_totals[('MONTH', 1)]
    assert expected_totals[('MONTH', 3)]
    with pymupdf.open(str(pdf_path)) as document:
        image_path = tmp_path / 'jiohotstar-page.png'
        document[0].get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False).save(str(image_path))

    extracted_results = []
    for source_path, mime_type in ((pdf_path, 'application/pdf'), (image_path, 'image/png')):
        try:
            started = start_gemini_background_extraction(
                file_path=source_path,
                mime_type=mime_type,
                model_name=Config.GEMINI_MODEL,
            )
        except GeminiExtractionError as error:
            pytest.skip(f'Live Gemini background submission unavailable for {mime_type} ({error.category}).')

        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            try:
                interaction = get_gemini_background_interaction(
                    started['interaction_id'],
                    model_name=Config.GEMINI_MODEL,
                )
            except GeminiExtractionError as error:
                pytest.skip(f'Live Gemini status polling unavailable ({error.category}).')
            interaction_status = str(getattr(interaction, 'status', '') or '').lower()
            if interaction_status == 'completed':
                break
            if interaction_status in {'failed', 'cancelled'}:
                pytest.skip(f'Live Gemini {mime_type} interaction ended with provider status {interaction_status}.')
            if interaction_status != 'in_progress':
                pytest.fail(f'Live Gemini interaction ended with status {interaction_status or "unknown"}.')
            time.sleep(2)
        else:
            pytest.skip(f'Live Gemini {mime_type} interaction did not complete within 180 seconds.')

        result = SubscriptionExtractionSchema.model_validate_json(interaction.output_text).model_dump()
        option_intervals = {
            (option['billing_frequency'], option['frequency_interval'])
            for option in result['billing_options']
        }
        assert result['currency'] == 'INR'
        assert ('MONTH', 1) in option_intervals
        assert ('MONTH', 3) in option_intervals
        assert ('YEAR', 1) in option_intervals
        for interval, expected_prices in expected_totals.items():
            actual_prices = {
                Decimal(option['total_price'])
                for option in result['billing_options']
                if (option['billing_frequency'], option['frequency_interval']) == interval
                and option['total_price'] != 'UNKNOWN'
            }
            assert expected_prices <= actual_prices
        assert all(
            option['total_price'] == 'UNKNOWN'
            for option in result['billing_options']
            if option['billing_frequency'] == 'YEAR'
        )
        assert result['auto_renewal'] is None
        assert result['evidence_by_field'].get('billing_frequency')
        assert all(option['evidence_quotes'] for option in result['billing_options'])
        extracted_results.append(result)

    assert [result['currency'] for result in extracted_results] == ['INR', 'INR']
