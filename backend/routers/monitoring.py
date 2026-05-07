from datetime import datetime, timedelta, timezone
from fastapi import APIRouter
from services.supabase_service import supabase

router = APIRouter()


def _count_table(table_name: str) -> int:
    response = supabase.table(table_name).select("id", count="exact").limit(1).execute()
    return response.count or 0


def _count_tasks_by_status(status: str) -> int:
    return (
        supabase.table("tasks")
        .select("id", count="exact")
        .eq("status", status)
        .limit(1)
        .execute()
        .count
        or 0
    )


@router.get("/summary")
async def monitoring_summary():
    """
    Lightweight operational summary for dashboards and uptime checks.
    """
    checks = {
        "api": "ok",
        "database": "ok",
        "workers": "checking",
    }

    counts = {
        "projects": 0,
        "tasks": 0,
        "agents": 0,
        "task_runs": 0,
        "failed_tasks": 0,
        "pending_reviews": 0,
        "queued_tasks": 0,
        "in_progress_tasks": 0,
        "stale_leases": 0,
        "delayed_retries": 0,
        "active_workers": 0,
    }

    try:
        counts["projects"] = _count_table("projects")
        counts["tasks"] = _count_table("tasks")
        counts["agents"] = _count_table("agents")
        counts["task_runs"] = _count_table("task_runs")
        counts["failed_tasks"] = _count_tasks_by_status("failed")
        counts["pending_reviews"] = _count_tasks_by_status("awaiting_approval")
        counts["queued_tasks"] = _count_tasks_by_status("queued")
        counts["in_progress_tasks"] = _count_tasks_by_status("in_progress")

        now = datetime.now(timezone.utc)
        counts["stale_leases"] = (
            supabase.table("tasks")
            .select("id", count="exact")
            .eq("status", "in_progress")
            .lt("lease_expires_at", now.isoformat())
            .limit(1)
            .execute()
            .count
            or 0
        )
        counts["delayed_retries"] = (
            supabase.table("tasks")
            .select("id", count="exact")
            .eq("status", "queued")
            .gt("next_attempt_at", now.isoformat())
            .limit(1)
            .execute()
            .count
            or 0
        )

        try:
            active_since = now - timedelta(minutes=2)
            counts["active_workers"] = (
                supabase.table("worker_heartbeats")
                .select("worker_id", count="exact")
                .gte("last_seen_at", active_since.isoformat())
                .neq("status", "stopping")
                .limit(1)
                .execute()
                .count
                or 0
            )
            checks["workers"] = "ok" if counts["active_workers"] > 0 or counts["queued_tasks"] == 0 else "warning"
        except Exception as exc:
            checks["workers"] = "unavailable"
            counts["active_workers"] = 0
            worker_error = str(exc)
        else:
            worker_error = None
    except Exception as exc:
        checks["database"] = "error"
        return {
            "status": "degraded",
            "checks": checks,
            "counts": counts,
            "error": str(exc),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    error = None
    if worker_error:
        error = f"Worker heartbeat table unavailable: {worker_error}"

    return {
        "status": "ok" if checks["workers"] in ("ok", "unavailable") and counts["stale_leases"] == 0 else "degraded",
        "checks": checks,
        "counts": counts,
        "error": error,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
