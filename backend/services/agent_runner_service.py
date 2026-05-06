import logging
from datetime import datetime, timezone
from services.supabase_service import supabase
from services.audit_service import audit_service
from agents.agent_factory import AgentFactory
from services.semantic_backprop import semantic_backprop
from services.output_quality import build_quality_instructions, validate_output

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
        complete_content: str = "Agent successfully completed the task and produced output.",
        update_task: bool = True
    ) -> tuple[dict, str]:
        task_id = task["id"]
        project_id = task["project_id"]
        run_id = None

        if update_task:
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

            import time
            import hashlib
            
            # Simple in-memory cache for the session (could be persistent later)
            if not hasattr(AgentRunnerService, "_task_cache"):
                AgentRunnerService._task_cache = {}

            # 1. Create a cache key based on task, agent (model + system prompt), and context
            cache_input = f"{task['id']}-{agent_data['model']}-{agent_data.get('system_prompt', '')}-{task.get('description')}-{str(context)}-{extra_context}"
            cache_key = hashlib.md5(cache_input.encode()).hexdigest()
            
            # 2. Check Cache
            if cache_key in AgentRunnerService._task_cache:
                logger.info(f"Cache hit for task {task_id}. Skipping LLM call.")
                cached_result = AgentRunnerService._task_cache[cache_key]
                
                # Still log the "start" for UI consistency
                agent_name = agent_data.get('name', 'Agent')
                log_msg = start_content or f"Agent {agent_name} resuming task"
                supabase.table("agent_logs").insert({
                    "task_id": task_id,
                    "run_id": run_id,
                    "action": start_action,
                    "content": f"[CACHE HIT] {log_msg}"
                }).execute()
                
                if update_task:
                    supabase.table("tasks").update({
                        "status": "awaiting_approval",
                        "output_data": cached_result
                    }).eq("id", task_id).execute()
                
                return cached_result, run_id

            # 3. Log Start
            supabase.table("agent_logs").insert({
                "task_id": task_id,
                "run_id": run_id,
                "action": start_action,
                "content": start_content or f"Agent {agent_data['name']} starting task: {task['title']}"
            }).execute()

            # 4. Execute Run with timing
            start_time = time.time()
            task_instructions = task.get("description") or task["title"]
            task_instructions = f"{task_instructions}\n\n{build_quality_instructions(task)}"
            result = await agent.run(task_instructions, context, extra_context=extra_context)
            duration = time.time() - start_time

            if result.get("status") == "error":
                raise RuntimeError(result.get("error") or "Agent returned an error result.")

            # 5. Security Sanitization (Defense in Depth)
            raw_out = str(result.get("raw_output", ""))
            suspicious_patterns = ["rm -rf", "mkfs", "dd if=", "curl", "wget", "chmod 777", "> /dev/sda"]
            for pattern in suspicious_patterns:
                if pattern in raw_out:
                    logger.warning(f"SECURITY: Suspicious pattern '{pattern}' detected in agent output for task {task_id}.")
                    result["security_warning"] = f"Output sanitized: suspicious pattern '{pattern}' detected."
                    # We don't block yet, but we flag it.

            quality_review = validate_output(task, result)
            result["quality_review"] = quality_review

            # 6. Save to Cache
            AgentRunnerService._task_cache[cache_key] = result

            if update_task:
                supabase.table("tasks").update({
                    "status": "awaiting_approval",
                    "output_data": result
                }).eq("id", task_id).execute()

            # 7. Update Run Status
            supabase.table("task_runs").update({
                "status": "completed",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "duration_seconds": round(duration, 2)
            }).eq("id", run_id).execute()

            # 8. Log Completion with Metrics
            supabase.table("agent_logs").insert({
                "task_id": task_id,
                "run_id": run_id,
                "action": complete_action,
                "content": f"{complete_content} (Execution time: {duration:.2f}s)"
            }).execute()

            if not quality_review["approved"]:
                supabase.table("agent_logs").insert({
                    "task_id": task_id,
                    "run_id": run_id,
                    "action": "quality_review_failed",
                    "content": f"Quality review failed: {', '.join(quality_review['fail_reasons'])}"
                }).execute()

            return result, run_id

        except Exception as e:
            logger.error(f"Error executing task {task_id}: {str(e)}")
            if run_id:
                supabase.table("task_runs").update({
                    "status": "failed",
                    "finished_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", run_id).execute()
            
            if update_task:
                supabase.table("tasks").update({
                    "status": "failed",
                    "output_data": {"error": str(e)}
                }).eq("id", task_id).execute()

            # LOG ERROR TO AGENT CONSOLE
            supabase.table("agent_logs").insert({
                "task_id": task_id,
                "run_id": run_id,
                "action": "execution_failed",
                "content": f"ERROR: {str(e)}"
            }).execute()

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
