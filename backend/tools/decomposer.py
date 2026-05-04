from services.project_service import project_service
from typing import List, Dict, Any
import logging

logger = logging.getLogger("uvicorn")

class DecompositionTool:
    """
    A tool that allows agents to break down complex goals into actionable tasks.
    """
    async def create_subtasks(self, project_id: str, tasks: List[Dict[str, Any]]) -> str:
        """
        Takes a list of task definitions and adds them to the database for the given project.
        """
        logger.info(f"DecompositionTool: Creating {len(tasks)} subtasks for project {project_id}")
        try:
            await project_service.add_tasks_to_project(project_id, tasks)
            return f"Successfully created {len(tasks)} subtasks."
        except Exception as e:
            return f"Failed to create subtasks: {str(e)}"
