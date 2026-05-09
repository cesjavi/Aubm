from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from services.supabase_service import supabase
from services.agent_runner_service import AgentRunnerService
from services.config import settings
from services.audit_service import audit_service
from services.output_quality import report_text_from_output, validate_output
from services.task_queue import TaskQueueService
from services.memory_service import memory_service
from services.project_service import project_service
from services.utils import log_async_task_result
import asyncio
import json
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
    
    # If not approved in DB, re-validate with current (potentially relaxed) rules
    if not quality_review or not quality_review.get("approved"):
        current_review = validate_output(task, output_data)
        if not current_review.get("approved"):
            reasons = current_review.get("fail_reasons") or ["Task output failed quality validation."]
            raise HTTPException(status_code=400, detail=f"Task output failed quality review: {'; '.join(reasons)}")
        
        # If it's now approved by current rules, we allow it to proceed
        return


def _assert_task_project_is_mutable(task: dict):
    project_id = task.get("project_id")
    if project_id:
        project_service.ensure_project_is_mutable(project_id)

def update_task_status(task_id: str, status: str):
    task_res = supabase.table("tasks").select("project_id").eq("id", task_id).single().execute()
    if not task_res.data:
        raise HTTPException(status_code=404, detail="Task not found")
    _assert_task_project_is_mutable(task_res.data)

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
        if status == "done" and tasks and all(t.get("status") == "done" for t in tasks):
            supabase.table("projects").update({"status": "completed"}).eq("id", project_id).execute()
        elif status != "done":
            supabase.table("projects").update({"status": "active"}).eq("id", project_id).execute()

    return task_data


def _sse_event(event: str, data: dict, event_id: str | None = None) -> str:
    lines = []
    if event_id:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event}")
    payload = json.dumps(data, default=str)
    for line in payload.splitlines() or ["{}"]:
        lines.append(f"data: {line}")
    return "\n".join(lines) + "\n\n"


def _project_task_ids(project_id: str) -> list[str]:
    rows = (
        supabase.table("tasks")
        .select("id")
        .eq("project_id", project_id)
        .execute()
        .data
        or []
    )
    return [row["id"] for row in rows if row.get("id")]


def _user_id_from_access_token(access_token: str | None) -> str:
    if not access_token:
        raise HTTPException(status_code=401, detail="Missing access token")
    try:
        auth_user = supabase.auth.get_user(access_token)
        user = getattr(auth_user, "user", None)
        user_id = getattr(user, "id", None)
        if not user_id and isinstance(auth_user, dict):
            user_id = auth_user.get("user", {}).get("id")
    except Exception as exc:
        logger.warning("Could not validate log stream access token: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid access token") from exc
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid access token")
    return user_id


def _team_ids_for_user(user_id: str) -> list[str]:
    try:
        rows = (
            supabase.table("team_members")
            .select("team_id")
            .eq("user_id", user_id)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        logger.warning("Team membership lookup unavailable for log stream: %s", exc)
        return []
    return [row["team_id"] for row in rows if row.get("team_id")]


def _project_ids_for_user(user_id: str) -> list[str]:
    project_ids: set[str] = set()

    owned = (
        supabase.table("projects")
        .select("id")
        .eq("owner_id", user_id)
        .execute()
        .data
        or []
    )
    project_ids.update(row["id"] for row in owned if row.get("id"))

    public = (
        supabase.table("projects")
        .select("id")
        .eq("is_public", True)
        .execute()
        .data
        or []
    )
    project_ids.update(row["id"] for row in public if row.get("id"))

    team_ids = _team_ids_for_user(user_id)
    if team_ids:
        team_projects = (
            supabase.table("projects")
            .select("id")
            .in_("team_id", team_ids)
            .execute()
            .data
            or []
        )
        project_ids.update(row["id"] for row in team_projects if row.get("id"))

    return list(project_ids)


def _can_view_project_for_user(project_id: str, user_id: str) -> bool:
    if not project_id:
        return False
    if project_id in _project_ids_for_user(user_id):
        return True
    return False


def _authorized_task_ids(user_id: str, project_id: str | None = None, task_id: str | None = None) -> list[str]:
    if task_id:
        task = supabase.table("tasks").select("id,project_id").eq("id", task_id).single().execute().data
        if not task or not _can_view_project_for_user(task.get("project_id"), user_id):
            raise HTTPException(status_code=403, detail="Task logs are not visible to this user")
        return [task_id]

    if project_id:
        if not _can_view_project_for_user(project_id, user_id):
            raise HTTPException(status_code=403, detail="Project logs are not visible to this user")
        return _project_task_ids(project_id)

    project_ids = _project_ids_for_user(user_id)
    if not project_ids:
        return []
    rows = (
        supabase.table("tasks")
        .select("id")
        .in_("project_id", project_ids)
        .execute()
        .data
        or []
    )
    return [row["id"] for row in rows if row.get("id")]


def _fetch_recent_logs(
    limit: int = 50,
    after_created_at: str | None = None,
    *,
    task_ids: list[str],
) -> list[dict]:
    if not task_ids:
        return []
    query = (
        supabase.table("agent_logs")
        .select("id,task_id,run_id,action,content,metadata,created_at")
        .order("created_at", desc=after_created_at is None)
        .limit(limit)
        .in_("task_id", task_ids)
    )
    if after_created_at:
        query = query.gt("created_at", after_created_at)
    rows = query.execute().data or []
    return rows if after_created_at else list(reversed(rows))


@router.get("/logs/stream")
async def stream_agent_logs(
    request: Request,
    limit: int = 50,
    project_id: str | None = None,
    task_id: str | None = None,
    access_token: str | None = None,
):
    """
    Streams agent log inserts as Server-Sent Events.
    """
    if project_id and task_id:
        raise HTTPException(status_code=400, detail="Use either project_id or task_id, not both.")
    user_id = _user_id_from_access_token(access_token)
    task_ids = _authorized_task_ids(user_id, project_id=project_id, task_id=task_id)

    async def event_generator():
        last_created_at = None
        sent_ids: set[str] = set()
        yield _sse_event("ready", {
            "message": "Agent log stream connected",
            "project_id": project_id,
            "task_id": task_id,
            "user_id": user_id,
        })

        while not await request.is_disconnected():
            try:
                rows = _fetch_recent_logs(
                    limit=max(1, min(limit, 100)),
                    after_created_at=last_created_at,
                    task_ids=task_ids,
                )
                for row in rows:
                    row_id = row.get("id")
                    if row_id in sent_ids:
                        continue
                    sent_ids.add(row_id)
                    if len(sent_ids) > 500:
                        sent_ids = set(list(sent_ids)[-250:])
                    last_created_at = row.get("created_at") or last_created_at
                    yield _sse_event("log", row, row_id)
            except Exception as exc:
                logger.warning("Agent log SSE stream failed to fetch logs: %s", exc)
                yield _sse_event("error", {"message": str(exc)})

            yield ": keep-alive\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{task_id}/run")
async def run_task(task_id: str, background_tasks: BackgroundTasks, use_queue: bool | None = None):
    """
    Triggers the execution of a specific task.
    """
    # 1. Fetch task data
    task_res = supabase.table("tasks").select("*, project:projects(*)").eq("id", task_id).single().execute()
    if not task_res.data:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = task_res.data
    _assert_task_project_is_mutable(task)
    
    # 2. Check if agent is assigned
    agent_id = task.get("assigned_agent_id")
    if not agent_id:
        raise HTTPException(status_code=400, detail="No agent assigned to this task")
    
    # 3. Fetch agent data
    agent_res = supabase.table("agents").select("*").eq("id", agent_id).single().execute()
    if not agent_res.data:
        raise HTTPException(status_code=404, detail="Assigned agent not found")
    
    agent_data = agent_res.data

    should_queue = use_queue if use_queue is not None else False
    if should_queue:
        queued = await TaskQueueService.queue_task(task_id)
        if not queued or not queued.data:
            raise HTTPException(status_code=500, detail="Task could not be queued")
        await audit_service.log_action(
            user_id=task.get("project", {}).get("owner_id"),
            action="task_queued",
            agent_id=agent_id,
            task_id=task_id,
            metadata={"project_id": task.get("project_id"), "source": "task_run_endpoint"},
        )
        return {"message": "Task queued for worker execution", "task_id": task_id, "mode": "queue"}
    
    # 4. Update task status to in_progress
    supabase.table("tasks").update({"status": "in_progress"}).eq("id", task_id).execute()
    await audit_service.log_action(
        user_id=task.get("project", {}).get("owner_id"),
        action="task_run_started",
        agent_id=agent_id,
        task_id=task_id,
        metadata={"project_id": task.get("project_id"), "mode": "direct"},
    )
    
    # 5. Run in background
    runner_task = asyncio.create_task(AgentRunnerService.execute_agent_logic(task, agent_data))
    runner_task.add_done_callback(lambda current: log_async_task_result(current, f"run_task({task_id})"))
    
    return {"message": "Task execution started", "task_id": task_id}

@router.patch("/{task_id}/output")
async def update_task_output(task_id: str, payload: dict):
    """
    Updates the output_data of a task. Allows for manual human corrections.
    """
    if "output_data" not in payload:
        raise HTTPException(status_code=400, detail="Missing output_data in payload")
    
    # Verify task existence and project state
    task_res = supabase.table("tasks").select("id, project_id").eq("id", task_id).single().execute()
    if not task_res.data:
        raise HTTPException(status_code=404, detail="Task not found")
    _assert_task_project_is_mutable(task_res.data)

    result = supabase.table("tasks").update({
        "output_data": payload["output_data"]
    }).eq("id", task_id).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update task output")
        
    await audit_service.log_action(
        user_id=None,
        action="task_output_manually_edited",
        task_id=task_id,
        metadata={"project_id": task_res.data["project_id"]}
    )

    return {"message": "Task output updated", "task": result.data[0]}

@router.post("/{task_id}/approve")
async def approve_task(task_id: str, background_tasks: BackgroundTasks):
    task_res = supabase.table("tasks").select("*").eq("id", task_id).single().execute()
    if not task_res.data:
        raise HTTPException(status_code=404, detail="Task not found")
    _assert_task_project_is_mutable(task_res.data)
    _assert_task_quality(task_res.data)
    task = update_task_status(task_id, "done")
    
    # Index for Long-Term Memory
    background_tasks.add_task(memory_service.index_task_output, task)
    
    await audit_service.log_action(
        user_id=None,
        action="task_approved",
        agent_id=task.get("assigned_agent_id"),
        task_id=task_id,
        metadata={"project_id": task.get("project_id")},
    )
    return {"message": "Task approved", "task": task}

@router.post("/{task_id}/reject")
async def reject_task(task_id: str, background_tasks: BackgroundTasks, feedback: str | None = None):
    task = update_task_status(task_id, "todo")
    
    # Trigger Self-Optimization Loop
    background_tasks.add_task(
        memory_service.analyze_rejection, 
        task_id=task_id, 
        feedback=feedback
    )
    
    await audit_service.log_action(
        user_id=None,
        action="task_rejected",
        agent_id=task.get("assigned_agent_id"),
        task_id=task_id,
        metadata={"project_id": task.get("project_id")},
    )
    return {"message": "Task rejected", "task": task}

@router.post("/project/{project_id}/approve-all")
async def approve_all_tasks(project_id: str, background_tasks: BackgroundTasks):
    """
    Approves all tasks in a project that are awaiting approval.
    """
    project_service.ensure_project_is_mutable(project_id)
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
        except HTTPException as exc:
            blocked.append({
                "task_id": task["id"],
                "title": task.get("title", "Untitled Task"),
                "reason": exc.detail
            })

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
        
        # Index all approved tasks for Long-Term Memory
        for approved_task in result_data:
            background_tasks.add_task(memory_service.index_task_output, approved_task)
    
    # 2. Check if all tasks in project are now done
    task_result = (
        supabase.table("tasks")
        .select("status")
        .eq("project_id", project_id)
        .execute()
    )
    tasks = task_result.data or []
    if tasks and all(t.get("status") == "done" for t in tasks):
        supabase.table("projects").update({"status": "completed"}).eq("id", project_id).execute()

    await audit_service.log_action(
        user_id=None,
        action="tasks_approved_bulk",
        metadata={
            "project_id": project_id,
            "approved_count": len(result_data),
            "blocked_count": len(blocked),
        },
    )
    
    return {
        "message": f"Approved {len(result_data)} tasks. {len(blocked)} tasks were blocked due to quality issues.",
        "count": len(result_data),
        "blocked": blocked
    }
