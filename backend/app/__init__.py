import os
from pathlib import Path
from flask import Flask, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from sqlalchemy import inspect

from app.config import Config
from app.models import db

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[Config.RATELIMIT_DEFAULT],
    storage_uri=Config.RATELIMIT_STORAGE_URI
)

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    app.logger.setLevel('INFO')

    # Ensure uploads and instance directories exist
    upload_dir = Path(app.config['UPLOAD_FOLDER'])
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    instance_dir = Path(app.instance_path)
    instance_dir.mkdir(parents=True, exist_ok=True)

    # Initialize extensions
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    limiter.init_app(app)
    db.init_app(app)

    with app.app_context():
        # Import models so SQLAlchemy creates all tables
        from app.models.document import UploadedDocument
        from app.models.extracted_terms import ExtractedTerms
        from app.models.verification import VerificationAudit
        from app.models.subscription import PlanSnapshot
        from app.models.subscription import SubscriptionRecord
        from app.models.webhook_event import WebhookEvent
        db.create_all()
        webhook_columns = {column['name'] for column in inspect(db.engine).get_columns('webhook_events')}
        if 'event_id' not in webhook_columns:
            with db.engine.begin() as connection:
                connection.exec_driver_sql('ALTER TABLE webhook_events ADD COLUMN event_id VARCHAR(128)')
        webhook_indexes = {index['name'] for index in inspect(db.engine).get_indexes('webhook_events')}
        if 'uq_webhook_events_event_id' not in webhook_indexes:
            with db.engine.begin() as connection:
                connection.exec_driver_sql(
                    'CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_events_event_id ON webhook_events (event_id)'
                )
        job_columns = {column['name'] for column in inspect(db.engine).get_columns('gemini_extraction_jobs')}
        if 'provider_error_code' not in job_columns:
            with db.engine.begin() as connection:
                connection.exec_driver_sql('ALTER TABLE gemini_extraction_jobs ADD COLUMN provider_error_code VARCHAR(64)')
        with db.engine.begin() as connection:
            if 'provider_http_status' not in job_columns:
                connection.exec_driver_sql('ALTER TABLE gemini_extraction_jobs ADD COLUMN provider_http_status INTEGER')
            if 'terminal_at' not in job_columns:
                connection.exec_driver_sql('ALTER TABLE gemini_extraction_jobs ADD COLUMN terminal_at DATETIME')
        subscription_columns = {column['name'] for column in inspect(db.engine).get_columns('subscription_records')}
        with db.engine.begin() as connection:
            if 'last_payment_status' not in subscription_columns:
                connection.exec_driver_sql('ALTER TABLE subscription_records ADD COLUMN last_payment_status VARCHAR(32)')
            if 'last_payment_event_at' not in subscription_columns:
                connection.exec_driver_sql('ALTER TABLE subscription_records ADD COLUMN last_payment_event_at DATETIME')

    # Register API Blueprints
    from app.routes.documents import documents_bp
    from app.routes.ai import ai_bp
    from app.routes.paypal import paypal_bp
    from app.routes.integrity import integrity_bp
    from app.routes.analytics import analytics_bp
    app.register_blueprint(documents_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(paypal_bp)
    app.register_blueprint(integrity_bp)
    app.register_blueprint(analytics_bp)

    # Health check route
    @app.route('/api/health', methods=['GET'])
    def health_check():
        paypal_configured = bool(
            app.config.get('PAYPAL_CLIENT_ID') and
            app.config.get('PAYPAL_CLIENT_SECRET')
        )
        gemini_configured = bool(app.config.get('GEMINI_API_KEY'))
        return jsonify({
            'status': 'healthy',
            'app': 'ClearTerm AI',
            'version': '1.0.0',
            'services': {
                'database': 'sqlite_connected',
                'gemini_model': app.config['GEMINI_MODEL'],
                'paypal_mode': app.config['PAYPAL_MODE'],
                'paypal': {
                    'configured': paypal_configured,
                    'status': 'CONFIGURED' if paypal_configured else 'NOT_CONFIGURED',
                },
                'gemini': {
                    'configured': gemini_configured,
                    'status': 'CONFIGURED' if gemini_configured else 'NOT_CONFIGURED',
                },
            }
        }), 200

    # Error Handlers
    @app.errorhandler(429)
    def ratelimit_handler(e):
        return jsonify({
            'error': 'Too Many Requests',
            'message': 'Rate limit exceeded. Please retry in a moment.'
        }), 429

    @app.errorhandler(404)
    def not_found_handler(e):
        return jsonify({
            'error': 'Not Found',
            'message': 'Requested API route does not exist.'
        }), 404

    @app.errorhandler(500)
    def internal_error_handler(e):
        return jsonify({
            'error': 'Internal Server Error',
            'message': 'An unexpected server error occurred.'
        }), 500

    return app
