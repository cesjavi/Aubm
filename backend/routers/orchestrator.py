from fastapi import APIRouter, BackgroundTasks, HTTPException
from services.orchestrator_service import orchestrator_service
from pydantic import BaseModel

router = APIRouter()

class DebateRequest(BaseModel):

    task_id: str
    agent_a_id: str
    agent_b_id: str

@router.post("/debate")
async def start_debate(request: DebateRequest, background_tasks: BackgroundTasks):
    """
    Starts a debate between two agents for a specific task.
    """
    background_tasks.add_task(
        orchestrator_service.run_debate, 
        request.task_id, 
        request.agent_a_id, 
        request.agent_b_id
    )
    return {"message": "Debate started in background"}


@router.post("/projects/{project_id}/run")
async def run_project_orchestrator(project_id: str, background_tasks: BackgroundTasks):
    """
    Runs all queued tasks for a project in priority order.
    """
    background_tasks.add_task(orchestrator_service.run_project, project_id)
    return {"message": "Project orchestrator started", "project_id": project_id}
