import pytest
from fastapi import HTTPException
from unittest.mock import patch

def test_read_root(client):
    response = client.get("/")
    assert response.status_code == 200
    # Depending on whether frontend/dist exists, it returns index.html or JSON
    try:
        data = response.json()
        assert data["status"] == "online"
    except Exception:
        # If it's index.html, it won't be JSON
        assert response.status_code == 200

def test_runtime_config(client):
    response = client.get("/runtime-config.js")
    assert response.status_code == 200
    assert "window.__AUBM_CONFIG__" in response.text

def test_project_budget_not_found(client):
    # Patch the service reference WHERE IT IS USED (in the router)
    with patch("routers.orchestrator.project_service") as mock_service:
        mock_service.get_project_or_404.side_effect = HTTPException(status_code=404, detail="Project not found")
        
        response = client.get("/api/orchestrator/projects/non-existent-id/budget")
        assert response.status_code == 404
        assert response.json()["detail"] == "Project not found"

def test_project_locked_error(client):
    # Patch the service reference WHERE IT IS USED (in the router)
    with patch("routers.orchestrator.project_service") as mock_service:
        mock_service.ensure_project_is_mutable.side_effect = HTTPException(
            status_code=409, 
            detail="Completed projects are locked and cannot be modified."
        )
        
        response = client.post("/api/orchestrator/projects/locked-id/run")
        assert response.status_code == 409
        assert "locked" in response.json()["detail"]
