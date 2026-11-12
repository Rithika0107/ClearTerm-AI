import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'clearterm_dev_secret_key_2026')
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DATABASE_URL',
        f"sqlite:///{BASE_DIR / 'instance' / 'clear_term.db'}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Upload constraints
    UPLOAD_FOLDER = BASE_DIR / 'uploads'
    MAX_CONTENT_LENGTH = int(os.getenv('MAX_CONTENT_LENGTH', 10 * 1024 * 1024)) # 10 MB
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'pdf'}
    
    # Rate Limiting
    RATELIMIT_DEFAULT = os.getenv('RATELIMIT_DEFAULT', '100 per minute')
    RATELIMIT_STORAGE_URI = 'memory://'
    
    # Google Gemini
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
    GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')
    GEMINI_JOB_MAX_LIFETIME_SECONDS = int(os.getenv('GEMINI_JOB_MAX_LIFETIME_SECONDS', '900'))
    
    # PayPal Sandbox
    PAYPAL_MODE = os.getenv('PAYPAL_MODE', 'sandbox')
    PAYPAL_BASE_URL = 'https://api-m.sandbox.paypal.com' if PAYPAL_MODE == 'sandbox' else 'https://api-m.paypal.com'
    PAYPAL_CLIENT_ID = os.getenv('PAYPAL_CLIENT_ID', '')
    PAYPAL_CLIENT_SECRET = os.getenv('PAYPAL_CLIENT_SECRET', '')
    PAYPAL_WEBHOOK_ID = os.getenv('PAYPAL_WEBHOOK_ID', '')
    PAYPAL_RETURN_URL = os.getenv('PAYPAL_RETURN_URL', 'http://localhost:3000/app/consent?paypal=return')
    PAYPAL_CANCEL_URL = os.getenv('PAYPAL_CANCEL_URL', 'http://localhost:3000/app/consent?paypal=cancel')
