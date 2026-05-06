from fastapi import APIRouter, HTTPException, BackgroundTasks
from services.supabase_service import supabase
from services.agent_runner_service import AgentRunnerService
from services.output_quality import report_text_from_output
import logging

router = APIRouter()
logger = logging.getLogger("uvicorn")


def _assert_task_quality(task: dict):
    output_data = task.get("output_data") or {}
    if not isinstance(output_data, dict):
        raise HTTPException(status_code=400, detail="Task output is missing or malformed.")
    if output_data.get("error"):
        raise HTTPException(status_code=400, detail=f"Task execution failed: {output_data['error']}")
    rendered = report_text_from_output(output_data).strip()
    if not rendered or rendered in ("{}", "[]"):
        raise HTTPException(status_code=400, detail="Task has no usable output to approve.")
    quality_review = output_data.get("quality_review")
    if not quality_review:
        raise HTTPException(status_code=400, detail="Task output is missing quality validation.")
    if quality_review.get("approved"):
        return
    reasons = quality_review.get("fail_reasons") or ["Task output failed quality validation."]
    raise HTTPException(status_code=400, detail=f"Task output failed quality review: {'; '.join(reasons)}")

def update_task_status(task_id: str, status: str):
    result = (
        supabase.table("tasks")
        .update({"status": status})
        .eq("id", task_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Task not found or status was not updated")

    task_data = result.data[0]

    project_id = task_data.get("project_id")
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

    return task_data

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
    task_res = supabase.table("tasks").select("*").eq("id", task_id).single().execute()
    if not task_res.data:
        raise HTTPException(status_code=404, detail="Task not found")
    _assert_task_quality(task_res.data)
    task = update_task_status(task_id, "done")
    return {"message": "Task approved", "task": task}

@router.post("/{task_id}/reject")
async def reject_task(task_id: str):
    task = update_task_status(task_id, "todo")
    return {"message": "Task rejected", "task": task}
@router.post("/project/{project_id}/approve-all")
async def approve_all_tasks(project_id: str):
    """
    Approves all tasks in a project that are awaiting approval.
    """
    waiting_tasks = (
        supabase.table("tasks")
        .select("*")
        .eq("project_id", project_id)
        .eq("status", "awaiting_approval")
        .execute()
        .data
        or []
    )
    blocked = []
    approvable_ids = []
    for task in waiting_tasks:
        try:
            _assert_task_quality(task)
            approvable_ids.append(task["id"])
        except HTTPException:
            blocked.append(task["title"])

    # 1. Update tasks
    result_data = []
    if approvable_ids:
        result = (
            supabase.table("tasks")
            .update({"status": "done"})
            .eq("project_id", project_id)
            .in_("id", approvable_ids)
            .execute()
        )
        result_data = result.data or []
    
    # 2. Check if all tasks in project are now done
    task_result = (
        supabase.table("tasks")
        .select("status")
        .eq("project_id", project_id)
        .execute()
    )
    tasks = task_result.data or []
    if tasks and all(task.get("status") == "done" for task in tasks):
        supabase.table("projects").update({"status": "completed"}).eq("id", project_id).execute()
    
    return {
        "message": f"Approved {len(result_data)} tasks",
        "count": len(result_data),
        "blocked": blocked
    }
