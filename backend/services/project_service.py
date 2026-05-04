from services.supabase_service import supabase
from typing import List, Dict, Any
import logging

logger = logging.getLogger("uvicorn")

class ProjectService:
    """
    Handles the creation and management of projects and their constituent tasks.
    """
    
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
