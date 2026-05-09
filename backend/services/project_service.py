from services.supabase_service import supabase
from typing import List, Dict, Any
import logging
from fastapi import HTTPException

logger = logging.getLogger("uvicorn")

class ProjectService:
    """
    Handles the creation and management of projects and their constituent tasks.
    """
    
    @staticmethod
    def get_project_or_404(project_id: str) -> Dict[str, Any]:
        """Fetches a project or raises a 404 error."""
        project = supabase.table("projects").select("*").eq("id", project_id).single().execute().data
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project

    @staticmethod
    def ensure_project_is_mutable(project_id: str) -> Dict[str, Any]:
        """Verifies project existence and that it's not locked/completed."""
        project = ProjectService.get_project_or_404(project_id)
        if project.get("status") == "completed":
            raise HTTPException(status_code=409, detail="Completed projects are locked and cannot be modified.")
        return project

    @staticmethod
    async def create_project(title: str, description: str, user_id: str) -> Dict[str, Any]:
        res = supabase.table("projects").insert({
            "title": title,
            "description": description,
            "user_id": user_id,
            "status": "active"
        }).execute()
        return res.data[0]

    @staticmethod
    async def add_tasks_to_project(project_id: str, tasks: List[Dict[str, Any]]):
        """
        Adds a list of tasks to a project.
        tasks: [{"title": "...", "description": "...", "assigned_agent_id": "..."}]
        """
        formatted_tasks = [
            {**task, "project_id": project_id, "status": "todo"}
            for task in tasks
        ]
        supabase.table("tasks").insert(formatted_tasks).execute()
        logger.info(f"Added {len(tasks)} tasks to project {project_id}")

project_service = ProjectService()
