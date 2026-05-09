import logging
from decimal import Decimal
from typing import Any

from services.config import config_service

logger = logging.getLogger("budget_service")


def _estimate_tokens(value: Any) -> int:
    text = str(value or "")
    if not text.strip():
        return 0
    return max(1, len(text) // 4)


def _safe_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value or "0"))
    except Exception:
        return Decimal("0")


class BudgetExceededError(RuntimeError):
    pass


class BudgetService:
    @staticmethod
    def estimate_prompt_tokens(
        *,
        task_instructions: str,
        context: list[dict],
        extra_context: str,
        system_prompt: str | None,
    ) -> int:
        return (
            _estimate_tokens(task_instructions)
            + _estimate_tokens(context)
            + _estimate_tokens(extra_context)
            + _estimate_tokens(system_prompt)
        )

    @staticmethod
    def estimate_completion_tokens(result: dict) -> int:
        if not isinstance(result, dict):
            return _estimate_tokens(result)
        return _estimate_tokens(result.get("raw_output") or result.get("data") or result)

    @staticmethod
    def estimate_cost(provider: str | None, model: str | None, prompt_tokens: int, completion_tokens: int) -> Decimal:
        pricing = config_service.get_global_setting("model_pricing", {}) or {}
        keys = [
            f"{provider}:{model}" if provider and model else None,
            str(model) if model else None,
            str(provider) if provider else None,
        ]
        price = next((pricing.get(key) for key in keys if key and key in pricing), None)
        if not isinstance(price, dict):
            return Decimal("0")

        input_per_1k = _safe_decimal(price.get("input_per_1k"))
        output_per_1k = _safe_decimal(price.get("output_per_1k"))
        return (
            (Decimal(prompt_tokens) / Decimal(1000)) * input_per_1k
            + (Decimal(completion_tokens) / Decimal(1000)) * output_per_1k
        ).quantize(Decimal("0.000001"))

    @staticmethod
    def _load_budget(project_id: str) -> dict | None:
        try:
            from services.supabase_service import supabase

            response = supabase.table("project_budgets").select("*").eq("project_id", project_id).execute()
            return response.data[0] if response.data else None
        except Exception as exc:
            logger.warning("Could not load project budget for %s: %s", project_id, exc)
            return None

    @staticmethod
    def _usage_totals(project_id: str) -> dict:
        try:
            from services.supabase_service import supabase

            rows = (
                supabase.table("project_usage_events")
                .select("total_tokens,estimated_cost")
                .eq("project_id", project_id)
                .execute()
                .data
                or []
            )
        except Exception as exc:
            logger.warning("Could not load project usage for %s: %s", project_id, exc)
            return {"total_tokens": 0, "estimated_cost": Decimal("0")}

        return {
            "total_tokens": sum(int(row.get("total_tokens") or 0) for row in rows),
            "estimated_cost": sum((_safe_decimal(row.get("estimated_cost")) for row in rows), Decimal("0")),
        }

    @classmethod
    def project_budget_status(cls, project_id: str) -> dict:
        budget = cls._load_budget(project_id)
        usage = cls._usage_totals(project_id)
        token_budget = int(budget["token_budget"]) if budget and budget.get("token_budget") is not None else None
        cost_budget = _safe_decimal(budget.get("cost_budget")) if budget and budget.get("cost_budget") is not None else None

        return {
            "project_id": project_id,
            "budget": budget,
            "usage": {
                "total_tokens": usage["total_tokens"],
                "estimated_cost": float(usage["estimated_cost"]),
            },
            "remaining": {
                "tokens": max(token_budget - usage["total_tokens"], 0) if token_budget is not None else None,
                "cost": float(max(cost_budget - usage["estimated_cost"], Decimal("0"))) if cost_budget is not None else None,
            },
        }

    @staticmethod
    def upsert_project_budget(
        *,
        project_id: str,
        enabled: bool = True,
        token_budget: int | None = None,
        cost_budget: float | None = None,
        currency: str = "USD",
    ) -> dict:
        try:
            from services.supabase_service import supabase

            payload = {
                "project_id": project_id,
                "enabled": enabled,
                "token_budget": token_budget,
                "cost_budget": cost_budget,
                "currency": currency or "USD",
            }
            response = supabase.table("project_budgets").upsert(payload, on_conflict="project_id").execute()
            return response.data[0] if response.data else payload
        except Exception as exc:
            logger.warning("Could not upsert project budget for %s: %s", project_id, exc)
            raise

    @classmethod
    def check_before_run(
        cls,
        *,
        project_id: str,
        estimated_tokens: int,
        estimated_cost: Decimal,
    ) -> dict:
        budget = cls._load_budget(project_id)
        if not budget or not budget.get("enabled", True):
            return {"allowed": True, "budget": budget, "usage": None}

        usage = cls._usage_totals(project_id)
        token_budget = budget.get("token_budget")
        if token_budget is not None and usage["total_tokens"] + estimated_tokens > int(token_budget):
            raise BudgetExceededError(
                f"Project token budget exceeded: {usage['total_tokens']} used + {estimated_tokens} estimated > {token_budget}."
            )

        cost_budget = budget.get("cost_budget")
        if cost_budget is not None and usage["estimated_cost"] + estimated_cost > _safe_decimal(cost_budget):
            raise BudgetExceededError(
                f"Project cost budget exceeded: {usage['estimated_cost']} used + {estimated_cost} estimated > {cost_budget}."
            )

        return {"allowed": True, "budget": budget, "usage": usage}

    @staticmethod
    def record_usage(
        *,
        project_id: str,
        task_id: str,
        run_id: str | None,
        agent_id: str | None,
        provider: str | None,
        model: str | None,
        prompt_tokens: int,
        completion_tokens: int,
        estimated_cost: Decimal,
        metadata: dict | None = None,
    ) -> None:
        try:
            from services.supabase_service import supabase

            supabase.table("project_usage_events").insert({
                "project_id": project_id,
                "task_id": task_id,
                "run_id": run_id,
                "agent_id": agent_id,
                "provider": provider,
                "model": model,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
                "estimated_cost": float(estimated_cost),
                "metadata": metadata or {},
            }).execute()
        except Exception as exc:
            logger.warning("Could not record project usage for task %s: %s", task_id, exc)


budget_service = BudgetService()
