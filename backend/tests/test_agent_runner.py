import pytest
from unittest.mock import MagicMock, patch

def test_approve_all_tasks_with_blocked(client):
    # Patch references WHERE THEY ARE USED (in the router module)
    with patch("routers.agent_runner.project_service") as mock_project_service, \
         patch("routers.agent_runner.supabase") as mock_supabase, \
         patch("routers.agent_runner._assert_task_quality") as mock_quality:
         
        # 1. Setup mocks
        mock_project_service.ensure_project_is_mutable.return_value = {"id": "proj-1"}
        
        # Mock waiting tasks: one good, one bad
        mock_supabase.table().select().eq().eq().execute.return_value.data = [
            {"id": "task-good", "title": "Good Task", "output_data": {"quality_review": {"approved": True}}},
            {"id": "task-bad", "title": "Bad Task", "output_data": {"quality_review": {"approved": False, "fail_reasons": ["Poor quality"]}}}
        ]
        
        # Mock the update for the good task
        mock_supabase.table().update().eq().in_().execute.return_value.data = [
            {"id": "task-good", "status": "done"}
        ]
        
        # Mock the final check for all tasks done
        mock_supabase.table().select().eq().execute.return_value.data = [
            {"status": "done"},
            {"status": "todo"}
        ]

        # Setup quality check behavior
        def quality_side_effect(task):
            if task["id"] == "task-bad":
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail="Quality failed")
            return
        mock_quality.side_effect = quality_side_effect
        
        # 2. Call the endpoint
        response = client.post("/api/tasks/project/proj-1/approve-all")
        
        # 3. Assertions
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 1
        assert len(data["blocked"]) == 1
        assert data["blocked"][0]["task_id"] == "task-bad"
        assert "Quality failed" in data["blocked"][0]["reason"]
