import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from .supabase_service import supabase
from .audit_service import audit_service

logger = logging.getLogger(__name__)

class TaskQueueService:
    @staticmethod
    async def queue_task(task_id: str):
        """
        Marks a task as 'queued' in the database.
        """
        try:
            result = supabase.table("tasks").update({
                "status": "queued",
                "queued_at": datetime.now(timezone.utc).isoformat(),
                "leased_at": None,
                "lease_expires_at": None,
                "next_attempt_at": datetime.now(timezone.utc).isoformat(),
                "queue_worker_id": None,
                "last_error": None,
                "output_data": None,
            }).eq("id", task_id).execute()
            return result
        except Exception as e:
            logger.error(f"Error queueing task {task_id}: {e}")
            return None

    @staticmethod
    async def claim_next_queued_task(worker_id: str, lease_seconds: int = 300, max_attempts: int = 3):
        """
        Atomically claims the next available queued task.
        """
        try:
            result = supabase.rpc("claim_next_queued_task", {
                "worker_id": worker_id,
                "lease_seconds": lease_seconds,
                "max_attempts": max_attempts,
            }).execute()

            if result.data:
                return result.data[0]
            return None
        except Exception as e:
            logger.error(f"Error claiming next queued task: {e}")
            return None

    @staticmethod
    async def get_next_queued_task():
        """
        Backwards-compatible alias for callers that do not pass a worker id.
        """
        return await TaskQueueService.claim_next_queued_task("worker-legacy")

    @staticmethod
    async def mark_in_progress(task_id: str):
        """
        Marks a task as 'in_progress'.
        """
        return supabase.table("tasks").update({"status": "in_progress"}).eq("id", task_id).execute()

    @staticmethod
    async def clear_lease(task_id: str):
        """
        Clears queue lease metadata after a worker finishes a task.
        """
        return supabase.table("tasks").update({
            "leased_at": None,
            "lease_expires_at": None,
            "queue_worker_id": None,
        }).eq("id", task_id).execute()

    @staticmethod
    async def mark_failed(task_id: str, error: str):
        """
        Stores terminal queue failure metadata.
        """
        return supabase.table("tasks").update({
            "status": "failed",
            "last_error": error,
            "leased_at": None,
            "lease_expires_at": None,
            "queue_worker_id": None,
            "output_data": {"error": error},
        }).eq("id", task_id).execute()

    @staticmethod
    async def mark_attempt_failed(task: dict, error: str, max_attempts: int, base_delay_seconds: int):
        """
        Requeues a task with exponential backoff until max attempts is reached.
        """
        task_id = task["id"]
        attempts = int(task.get("queue_attempts") or 0)

        if attempts >= max_attempts:
            result = await TaskQueueService.mark_failed(task_id, error)
            await audit_service.log_action(
                user_id=None,
                action="task_queue_terminal_failure",
                agent_id=task.get("assigned_agent_id"),
                task_id=task_id,
                metadata={
                    "project_id": task.get("project_id"),
                    "attempts": attempts,
                    "max_attempts": max_attempts,
                    "error": error,
                },
            )
            return result

        delay_seconds = max(base_delay_seconds, 1) * (2 ** max(attempts - 1, 0))
        next_attempt_at = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)

        result = supabase.table("tasks").update({
            "status": "queued",
            "last_error": error,
            "leased_at": None,
            "lease_expires_at": None,
            "next_attempt_at": next_attempt_at.isoformat(),
            "queue_worker_id": None,
            "output_data": {"error": error, "retrying": True, "next_attempt_at": next_attempt_at.isoformat()},
        }).eq("id", task_id).execute()
        await audit_service.log_action(
            user_id=None,
            action="task_queue_retry_scheduled",
            agent_id=task.get("assigned_agent_id"),
            task_id=task_id,
            metadata={
                "project_id": task.get("project_id"),
                "attempts": attempts,
                "max_attempts": max_attempts,
                "next_attempt_at": next_attempt_at.isoformat(),
                "error": error,
            },
        )
        return result

    @staticmethod
    async def heartbeat(
        worker_id: str,
        *,
        status: str,
        current_task_id: str | None = None,
        processed_count: int = 0,
        failed_count: int = 0,
        metadata: dict[str, Any] | None = None,
    ):
        """
        Upserts worker heartbeat data for operational monitoring.
        """
        try:
            return supabase.table("worker_heartbeats").upsert({
                "worker_id": worker_id,
                "status": status,
                "current_task_id": current_task_id,
                "processed_count": processed_count,
                "failed_count": failed_count,
                "metadata": metadata or {},
                "last_seen_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception as e:
            logger.warning(f"Could not update worker heartbeat for {worker_id}: {e}")
            return None
