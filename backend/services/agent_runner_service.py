import logging
from datetime import datetime, timezone
from services.supabase_service import supabase
from services.audit_service import audit_service
from agents.agent_factory import AgentFactory
from services.semantic_backprop import semantic_backprop

logger = logging.getLogger("agent_runner_service")

class AgentRunnerService:
    @staticmethod
    async def run_agent_task(
        task: dict,
        agent_data: dict,
        *,
        include_semantic_context: bool = False,
        start_action: str = "execution_start",
        start_content: str | None = None,
        complete_action: str = "execution_complete",
        complete_content: str = "Agent successfully completed the task and produced output."
    ) -> tuple[dict, str]:
        task_id = task["id"]
        project_id = task["project_id"]
        run_id = None

        supabase.table("tasks").update({"status": "in_progress"}).eq("id", task_id).execute()

        try:
            run_res = supabase.table("task_runs").insert({
                "task_id": task_id,
                "agent_id": agent_data["id"],
                "status": "running"
            }).execute()
            run_id = run_res.data[0]["id"]

            agent = AgentFactory.get_agent(
                provider=agent_data["api_provider"],
                name=agent_data["name"],
                role=agent_data["role"],
                model=agent_data["model"],
                system_prompt=agent_data.get("system_prompt")
            )

            context_res = supabase.table("tasks").select("title, output_data") \
                .eq("project_id", project_id) \
                .eq("status", "done") \
                .execute()
            context = context_res.data if context_res.data else []

            extra_context = ""
            if include_semantic_context:
                extra_context = await semantic_backprop.get_project_context(project_id, task_id)

            supabase.table("agent_logs").insert({
                "task_id": task_id,
                "run_id": run_id,
                "action": start_action,
                "content": start_content or f"Agent {agent_data['name']} starting task: {task['title']}"
            }).execute()

            result = await agent.run(task.get("description") or task["title"], context, extra_context=extra_context)
            if result.get("status") == "error":
                raise RuntimeError(result.get("error") or "Agent returned an error result.")

            supabase.table("tasks").update({
                "status": "awaiting_approval",
                "output_data": result
            }).eq("id", task_id).execute()

            supabase.table("task_runs").update({
                "status": "completed",
                "finished_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", run_id).execute()

            supabase.table("agent_logs").insert({
                "task_id": task_id,
                "run_id": run_id,
                "action": complete_action,
                "content": complete_content
            }).execute()

            return result, run_id

        except Exception as e:
            logger.error(f"Error executing task {task_id}: {str(e)}")
            if run_id:
                supabase.table("task_runs").update({
                    "status": "failed",
                    "finished_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", run_id).execute()
            supabase.table("tasks").update({
                "status": "failed",
                "output_data": {"error": str(e)}
            }).eq("id", task_id).execute()
            raise e

    @staticmethod
    async def execute_agent_logic(task: dict, agent_data: dict):
        task_id = task["id"]
        try:
            await AgentRunnerService.run_agent_task(
                task,
                agent_data,
                include_semantic_context=True
            )

            await audit_service.log_action(
                user_id=None,
                action="agent_task_completed",
                agent_id=agent_data["id"],
                task_id=task_id,
                metadata={"model": agent_data["model"]}
            )

        except Exception:
            raise
