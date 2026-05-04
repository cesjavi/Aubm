from fastapi import APIRouter, HTTPException, BackgroundTasks
from services.supabase_service import supabase
from services.agent_runner_service import AgentRunnerService
import logging

router = APIRouter()
logger = logging.getLogger("uvicorn")

@router.post("/{task_id}/run")
async def run_task(task_id: str, background_tasks: BackgroundTasks):
    """
    Triggers the execution of a specific task.
    """
    # 1. Fetch task data
    task_res = supabase.table("tasks").select("*, project:projects(*)").eq("id", task_id).single().execute()
    if not task_res.data:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = task_res.data
    
    # 2. Check if agent is assigned
    agent_id = task.get("assigned_agent_id")
    if not agent_id:
        raise HTTPException(status_code=400, detail="No agent assigned to this task")
    
    # 3. Fetch agent data
    agent_res = supabase.table("agents").select("*").eq("id", agent_id).single().execute()
    if not agent_res.data:
        raise HTTPException(status_code=404, detail="Assigned agent not found")
    
    agent_data = agent_res.data
    
    # 4. Update task status to in_progress
    supabase.table("tasks").update({"status": "in_progress"}).eq("id", task_id).execute()
    
    # 5. Run in background
    background_tasks.add_task(AgentRunnerService.execute_agent_logic, task, agent_data)
    
    return {"message": "Task execution started", "task_id": task_id}
