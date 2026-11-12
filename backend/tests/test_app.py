import pytest
from app import create_app
from app.models import db
from app.config import Config

class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    RATELIMIT_ENABLED = False

@pytest.fixture
def client():
    app = create_app(TestConfig)
    with app.app_context():
        yield app.test_client()

def test_health_check(client):
    response = client.get('/api/health')
    assert response.status_code == 200
    data = response.get_json()
    assert data['status'] == 'healthy'
    assert data['app'] == 'ClearTerm AI'
    assert 'services' in data
    assert data['services']['database'] == 'sqlite_connected'

def test_404_handler(client):
    response = client.get('/api/non-existent-endpoint')
    assert response.status_code == 404
    data = response.get_json()
    assert data['error'] == 'Not Found'
