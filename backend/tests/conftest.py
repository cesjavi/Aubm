import pytest
from unittest.mock import MagicMock, patch
import os
import sys

# Ensure backend directory is in path
backend_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

# Mock environment variables before importing app
os.environ["SUPABASE_URL"] = "https://mock.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "mock-key"

with patch("supabase.create_client") as mock_create:
    mock_client = MagicMock()
    mock_create.return_value = mock_client
    from main import app

from fastapi.testclient import TestClient

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

@pytest.fixture
def mock_supabase():
    with patch("services.supabase_service.supabase") as mock:
        yield mock

@pytest.fixture
def mock_project_service():
    with patch("services.project_service.project_service") as mock:
        yield mock
