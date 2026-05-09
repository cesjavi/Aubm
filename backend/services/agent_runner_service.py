import logging
from datetime import datetime, timezone
from services.supabase_service import supabase
from services.audit_service import audit_service
from services.budget_service import BudgetExceededError, budget_service
from services.evidence_service import evidence_service
from agents.agent_factory import AgentFactory
from services.semantic_backprop import semantic_backprop
from services.output_quality import build_quality_instructions, validate_output
from services.memory_service import memory_service

logger = logging.getLogger("agent_runner_service")

def _update_task_run(run_id: str, payload: dict):
    try:
        return supabase.table("task_runs").update(payload).eq("id", run_id).execute()
    except Exception as exc:
        if "duration_seconds" in payload and "duration_seconds" in str(exc) and "schema cache" in str(exc):
            fallback_payload = {key: value for key, value in payload.items() if key != "duration_seconds"}
            logger.warning("task_runs.duration_seconds is missing in Supabase schema; retrying run update without duration.")
            return supabase.table("task_runs").update(fallback_payload).eq("id", run_id).execute()
        raise

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
            await audit_service.log_action(
                user_id=None,
                action="task_status_changed",
                agent_id=agent_data.get("id"),
                task_id=task_id,
                metadata={"project_id": project_id, "status": "in_progress"},
            )

        try:
            run_res = supabase.table("task_runs").insert({
                "task_id": task_id,
                "agent_id": agent_data["id"],
                "status": "running"
            }).execute()
            run_id = run_res.data[0]["id"]
            await audit_service.log_action(
                user_id=None,
                action="task_run_created",
                agent_id=agent_data.get("id"),
                task_id=task_id,
                metadata={"project_id": project_id, "run_id": run_id, "status": "running"},
            )

            # Emergency Model Override for decommissioned Groq models
            model_to_use = agent_data["model"]
            if "llama3-70b-8192" in model_to_use:
                model_to_use = "llama-3.3-70b-versatile"
                logger.warning(f"Overriding decommissioned model {agent_data['model']} with {model_to_use}")

            agent = AgentFactory.get_agent(
                provider=agent_data["api_provider"],
                name=agent_data["name"],
                role=agent_data["role"],
                model=model_to_use,
                system_prompt=agent_data.get("system_prompt")
            )

            context_res = supabase.table("tasks").select("title, output_data") \
                .eq("project_id", project_id) \
                .eq("status", "done") \
                .execute()
            context = context_res.data if context_res.data else []

            project_data = task.get("project")
            if not isinstance(project_data, dict):
                project_res = (
                    supabase.table("projects")
                    .select("name,description,context")
                    .eq("id", project_id)
                    .single()
                    .execute()
                )
                project_data = project_res.data if project_res and project_res.data else {}
            quality_task = {**task, "project": project_data}

            extra_context = ""
            if include_semantic_context:
                extra_context = await semantic_backprop.get_project_context(project_id, task_id)
                # Fetch Long-Term Memory (Cross-project)
                memories = await memory_service.search_memory(
                    query=task.get("description") or task["title"],
                    limit=3,
                    threshold=0.72
                )
                if memories:
                    memory_header = "\n\n### RELEVANT HISTORICAL CONTEXT (CROSS-PROJECT)\n"
                    memory_blocks = []
                    for m in memories:
                        memory_blocks.append(f"- Memory: {m['content']}")
                    extra_context += memory_header + "\n".join(memory_blocks)
                
                # Fetch Self-Optimization Lessons for this specific task
                lessons_res = supabase.table("project_memory") \
                    .select("content") \
                    .eq("task_id", task_id) \
                    .eq("memory_type", "self_optimization_lesson") \
                    .order("created_at", desc=True) \
                    .limit(1) \
                    .execute()
                
                if lessons_res.data:
                    lesson = lessons_res.data[0]["content"]
                    extra_context += f"\n\n### CRITICAL LESSON FROM PREVIOUS ATTEMPT\n{lesson}\n"

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
                claims_count = await evidence_service.replace_task_claims(task, cached_result)
                
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
                    await audit_service.log_action(
                        user_id=None,
                        action="task_status_changed",
                        agent_id=agent_data.get("id"),
                        task_id=task_id,
                        metadata={
                            "project_id": project_id,
                            "run_id": run_id,
                            "status": "awaiting_approval",
                            "cache_hit": True,
                            "claims_count": claims_count,
                        },
                    )

                _update_task_run(run_id, {
                    "status": "completed",
                    "finished_at": datetime.now(timezone.utc).isoformat()
                })
                
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
            task_instructions = f"{task_instructions}\n\n{build_quality_instructions(quality_task)}"
            prompt_tokens = budget_service.estimate_prompt_tokens(
                task_instructions=task_instructions,
                context=context,
                extra_context=extra_context,
                system_prompt=agent_data.get("system_prompt"),
            )
            max_completion_tokens = int(getattr(agent, "max_tokens", 0) or 0)
            estimated_preflight_cost = budget_service.estimate_cost(
                agent_data.get("api_provider"),
                agent_data.get("model"),
                prompt_tokens,
                max_completion_tokens,
            )
            budget_service.check_before_run(
                project_id=project_id,
                estimated_tokens=prompt_tokens + max_completion_tokens,
                estimated_cost=estimated_preflight_cost,
            )
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

            quality_review = validate_output(quality_task, result)
            result["quality_review"] = quality_review
            claims_count = await evidence_service.replace_task_claims(task, result)
            
            # Use actual usage if provided by agent, otherwise fallback to estimation
            usage = result.get("usage") or {}
            actual_prompt_tokens = usage.get("prompt_tokens") or prompt_tokens
            actual_completion_tokens = usage.get("completion_tokens") or budget_service.estimate_completion_tokens(result)
            
            actual_cost = budget_service.estimate_cost(
                agent_data.get("api_provider"),
                agent_data.get("model"),
                actual_prompt_tokens,
                actual_completion_tokens,
            )
            
            budget_service.record_usage(
                project_id=project_id,
                task_id=task_id,
                run_id=run_id,
                agent_id=agent_data.get("id"),
                provider=agent_data.get("api_provider"),
                model=agent_data.get("model"),
                prompt_tokens=actual_prompt_tokens,
                completion_tokens=actual_completion_tokens,
                estimated_cost=actual_cost,
                metadata={"duration_seconds": round(duration, 2), "claims_count": claims_count, "usage_source": "api" if result.get("usage") else "estimation"},
            )

            # 6. Save to Cache
            AgentRunnerService._task_cache[cache_key] = result

            if update_task:
                supabase.table("tasks").update({
                    "status": "awaiting_approval",
                    "output_data": result
                }).eq("id", task_id).execute()
                await audit_service.log_action(
                    user_id=None,
                    action="task_status_changed",
                    agent_id=agent_data.get("id"),
                    task_id=task_id,
                    metadata={
                        "project_id": project_id,
                        "run_id": run_id,
                        "status": "awaiting_approval",
                        "quality_approved": quality_review["approved"],
                        "claims_count": claims_count,
                        "estimated_tokens": actual_prompt_tokens + actual_completion_tokens,
                        "estimated_cost": float(actual_cost),
                    },
                )

            # 7. Update Run Status
            _update_task_run(run_id, {
                "status": "completed",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "duration_seconds": round(duration, 2)
            })

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
                await audit_service.log_action(
                    user_id=None,
                    action="task_quality_review_failed",
                    agent_id=agent_data.get("id"),
                    task_id=task_id,
                    metadata={
                        "project_id": project_id,
                        "run_id": run_id,
                        "fail_reasons": quality_review.get("fail_reasons", []),
                    },
                )

            return result, run_id

        except BudgetExceededError as e:
            logger.warning(f"Budget blocked task {task_id}: {str(e)}")
            if run_id:
                _update_task_run(run_id, {
                    "status": "cancelled",
                    "error_message": str(e),
                    "finished_at": datetime.now(timezone.utc).isoformat()
                })

            if update_task:
                supabase.table("tasks").update({
                    "status": "failed",
                    "output_data": {"error": str(e), "budget_blocked": True}
                }).eq("id", task_id).execute()
                await audit_service.log_action(
                    user_id=None,
                    action="task_budget_blocked",
                    agent_id=agent_data.get("id"),
                    task_id=task_id,
                    metadata={"project_id": project_id, "run_id": run_id, "error": str(e)},
                )

            supabase.table("agent_logs").insert({
                "task_id": task_id,
                "run_id": run_id,
                "action": "budget_blocked",
                "content": f"Budget blocked execution: {str(e)}"
            }).execute()

            raise e

        except Exception as e:
            logger.error(f"Error executing task {task_id}: {str(e)}")
            if run_id:
                _update_task_run(run_id, {
                    "status": "failed",
                    "finished_at": datetime.now(timezone.utc).isoformat()
                })
            
            if update_task:
                supabase.table("tasks").update({
                    "status": "failed",
                    "output_data": {"error": str(e)}
                }).eq("id", task_id).execute()
                await audit_service.log_action(
                    user_id=None,
                    action="task_status_changed",
                    agent_id=agent_data.get("id"),
                    task_id=task_id,
                    metadata={
                        "project_id": project_id,
                        "run_id": run_id,
                        "status": "failed",
                        "error": str(e),
                    },
                )

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
