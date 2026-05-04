import logging
from services.supabase_service import supabase
from services.audit_service import audit_service
from agents.agent_factory import AgentFactory
from services.semantic_backprop import semantic_backprop

logger = logging.getLogger("agent_runner_service")

class AgentRunnerService:
    @staticmethod
    async def execute_agent_logic(task: dict, agent_data: dict):
        task_id = task["id"]
        project_id = task["project_id"]
        try:
            # Create a new run record
            run_res = supabase.table("task_runs").insert({
                "task_id": task_id,
                "agent_id": agent_data["id"],
                "status": "running"
            }).execute()
            run_id = run_res.data[0]["id"]

            # Create agent instance
            agent = AgentFactory.get_agent(
                provider=agent_data["api_provider"],
                name=agent_data["name"],
                role=agent_data["role"],
                model=agent_data["model"],
                system_prompt=agent_data["system_prompt"]
            )
            
            # 1. Fetch raw context (for history)
            context_res = supabase.table("tasks").select("title, output_data") \
                .eq("project_id", project_id) \
                .eq("status", "done") \
                .execute()
            
            context = context_res.data if context_res.data else []

            # 2. Fetch specialized context (Canonical Numbers / Semantic Backprop)
            extra_context = await semantic_backprop.get_project_context(project_id, task_id)
            
            # Log start
            supabase.table("agent_logs").insert({
                "task_id": task_id,
                "run_id": run_id,
                "action": "execution_start",
                "content": f"Agent {agent_data['name']} starting task: {task['title']}"
            }).execute()

            # Run agent with both contexts
            result = await agent.run(task["description"], context, extra_context=extra_context)
            
            # Update task with results
            supabase.table("tasks").update({
                "status": "awaiting_approval",
                "output_data": result
            }).eq("id", task_id).execute()

            # Mark run as completed
            supabase.table("task_runs").update({
                "status": "completed"
            }).eq("id", run_id).execute()

            # Log completion
            supabase.table("agent_logs").insert({
                "task_id": task_id,
                "run_id": run_id,
                "action": "execution_complete",
                "content": "Agent successfully completed the task and produced output."
            }).execute()

            # Audit log
            await audit_service.log_action(
                user_id=None,
                action="agent_task_completed",
                agent_id=agent_data["id"],
                task_id=task_id,
                metadata={"model": agent_data["model"]}
            )
            
        except Exception as e:
            logger.error(f"Error executing task {task_id}: {str(e)}")
            supabase.table("tasks").update({
                "status": "failed",
                "output_data": {"error": str(e)}
            }).eq("id", task_id).execute()
            raise e
