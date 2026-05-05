from fastapi import APIRouter, HTTPException, BackgroundTasks
from services.supabase_service import supabase
from services.agent_runner_service import AgentRunnerService
import logging

router = APIRouter()
logger = logging.getLogger("uvicorn")

def update_task_status(task_id: str, status: str):
    result = (
        supabase.table("tasks")
        .update({"status": status})
        .eq("id", task_id)
        .select("id,project_id,status")
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Task not found or status was not updated")

    project_id = result.data.get("project_id")
    if project_id:
        task_result = (
            supabase.table("tasks")
            .select("id,status")
            .eq("project_id", project_id)
            .execute()
        )
        tasks = task_result.data or []
        if status == "done" and tasks and all(task.get("status") == "done" for task in tasks):
            supabase.table("projects").update({"status": "completed"}).eq("id", project_id).execute()
        elif status != "done":
            supabase.table("projects").update({"status": "active"}).eq("id", project_id).execute()

    return result.data

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

@router.post("/{task_id}/approve")
async def approve_task(task_id: str):
    task = update_task_status(task_id, "done")
    return {"message": "Task approved", "task": task}

@router.post("/{task_id}/reject")
async def reject_task(task_id: str):
    task = update_task_status(task_id, "todo")
    return {"message": "Task rejected", "task": task}
