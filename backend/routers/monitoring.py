from datetime import datetime, timezone
from fastapi import APIRouter
from services.supabase_service import supabase

router = APIRouter()


def _count_table(table_name: str) -> int:
    response = supabase.table(table_name).select("id", count="exact").limit(1).execute()
    return response.count or 0


@router.get("/summary")
async def monitoring_summary():
    """
    Lightweight operational summary for dashboards and uptime checks.
    """
    checks = {
        "api": "ok",
        "database": "ok",
    }

    counts = {
        "projects": 0,
        "tasks": 0,
        "agents": 0,
        "task_runs": 0,
        "failed_tasks": 0,
        "pending_reviews": 0,
    }

    try:
        counts["projects"] = _count_table("projects")
        counts["tasks"] = _count_table("tasks")
        counts["agents"] = _count_table("agents")
        counts["task_runs"] = _count_table("task_runs")
        counts["failed_tasks"] = (
            supabase.table("tasks")
            .select("id", count="exact")
            .eq("status", "failed")
            .limit(1)
            .execute()
            .count
            or 0
        )
        counts["pending_reviews"] = (
            supabase.table("tasks")
            .select("id", count="exact")
            .eq("status", "awaiting_approval")
            .limit(1)
            .execute()
            .count
            or 0
        )
    except Exception as exc:
        checks["database"] = "error"
        return {
            "status": "degraded",
            "checks": checks,
            "counts": counts,
            "error": str(exc),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    return {
        "status": "ok",
        "checks": checks,
        "counts": counts,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
