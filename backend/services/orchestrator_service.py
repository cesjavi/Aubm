from services.supabase_service import supabase
from agents.agent_factory import AgentFactory
from datetime import datetime, timezone
import json
import logging

logger = logging.getLogger("uvicorn")

class OrchestratorService:
    """
    Handles complex multi-agent workflows like Debates and Peer Reviews.
    """
    
    async def run_debate(self, task_id: str, agent_a_id: str, agent_b_id: str):
        """
        Executes a debate between two agents for a specific task.
        """
        try:
            # 1. Fetch task and agents
            task = supabase.table("tasks").select("*").eq("id", task_id).single().execute().data
            agent_a = supabase.table("agents").select("*").eq("id", agent_a_id).single().execute().data
            agent_b = supabase.table("agents").select("*").eq("id", agent_b_id).single().execute().data
            
            # 2. Agent A generates initial response
            inst_a = AgentFactory.get_agent(agent_a["api_provider"], agent_a["name"], agent_a["role"], agent_a["model"])
            initial_res = await inst_a.run(task["description"], [])
            
            # 3. Agent B reviews and critiques
            inst_b = AgentFactory.get_agent(agent_b["api_provider"], agent_b["name"], agent_b["role"], agent_b["model"])
            critique_prompt = f"Review the following output for the task: '{task['description']}'. Provide constructive critique and identify errors.\n\nOutput: {json.dumps(initial_res['data'])}"
            critique_res = await inst_b.run(critique_prompt, [])
            
            # 4. Agent A refines based on critique
            refinement_prompt = f"Refine your initial output for the task: '{task['description']}' based on this critique: {json.dumps(critique_res['data'])}"
            final_res = await inst_a.run(refinement_prompt, [])
            
            # 5. Save final result
            supabase.table("tasks").update({
                "status": "done",
                "output_data": {
                    "initial": initial_res["data"],
                    "critique": critique_res["data"],
                    "final": final_res["data"]
                }
            }).eq("id", task_id).execute()
            
            logger.info(f"Debate completed for task {task_id}")
            
        except Exception as e:
            logger.error(f"Debate failed: {str(e)}")
            supabase.table("tasks").update({"status": "failed"}).eq("id", task_id).execute()

    async def run_project(self, project_id: str):
        """
        Runs queued tasks in a project sequentially. Unassigned tasks are assigned
        to the first available project-owner or global agent.
        """
        project = supabase.table("projects").select("*").eq("id", project_id).single().execute().data
        if not project:
            raise ValueError(f"Project not found: {project_id}")

        owner_id = project.get("owner_id")
        tasks = (
            supabase.table("tasks")
            .select("*")
            .eq("project_id", project_id)
            .eq("status", "todo")
            .order("priority", desc=True)
            .order("created_at", desc=False)
            .execute()
            .data
            or []
        )

        # Automatic Decomposition: If no tasks exist, try to decompose the project first
        if not tasks:
            logger.info(f"No tasks found for project {project_id}. Triggering auto-decomposition.")
            await self.decompose_project(project_id)
            # Re-fetch tasks after decomposition
            tasks = (
                supabase.table("tasks")
                .select("*")
                .eq("project_id", project_id)
                .eq("status", "todo")
                .order("priority", desc=True)
                .order("created_at", desc=False)
                .execute()
                .data
                or []
            )

        agents = supabase.table("agents").select("*").execute().data or []
        available_agents = [
            agent for agent in agents
            if agent.get("user_id") in (None, owner_id)
        ]

        completed = 0
        failed = 0

        for task in tasks:
            try:
                agent_data = self._resolve_agent(task, available_agents)
                if not agent_data:
                    raise ValueError("No available agent for task")

                if not task.get("assigned_agent_id"):
                    supabase.table("tasks").update({
                        "assigned_agent_id": agent_data["id"]
                    }).eq("id", task["id"]).execute()
                    task["assigned_agent_id"] = agent_data["id"]

                await self._run_task(task, agent_data)
                completed += 1
            except Exception as exc:
                failed += 1
                logger.error(f"Project orchestration task failed: {str(exc)}")
                supabase.table("tasks").update({
                    "status": "failed",
                    "output_data": {"error": str(exc)}
                }).eq("id", task["id"]).execute()

        return {
            "project_id": project_id,
            "queued_tasks": len(tasks),
            "completed": completed,
            "failed": failed,
        }

    async def decompose_project(self, project_id: str):
        """
        Uses a Planner agent to decompose a project into discrete tasks.
        """
        project = supabase.table("projects").select("*").eq("id", project_id).single().execute().data
        owner_id = project.get("owner_id")
        
        # Find a Planner agent
        agents = supabase.table("agents").select("*").execute().data or []
        planner_agent_data = next(
            (a for a in agents if "Planner" in a["name"] and a.get("user_id") in (None, owner_id)),
            next((a for a in agents if a.get("user_id") in (None, owner_id)), None)
        )
        
        if not planner_agent_data:
            logger.warning("No Planner agent found for decomposition.")
            return

        planner = AgentFactory.get_agent(
            provider=planner_agent_data["api_provider"],
            name=planner_agent_data["name"],
            role=planner_agent_data["role"],
            model=planner_agent_data["model"],
            system_prompt=planner_agent_data.get("system_prompt")
        )

        prompt = f"""Decompose the following project into 3-5 clear, actionable tasks.
Project Name: {project['name']}
Description: {project['description']}
Context: {project.get('context', 'None')}

Return ONLY a JSON array of objects with 'title', 'description', and 'priority' (integer 1-5).
Example: [{{"title": "Task 1", "description": "...", "priority": 3}}]"""

        try:
            result = await planner.run(prompt, [])
            # Some cleaning might be needed if agent returns markdown
            content = result["data"]
            if isinstance(content, str):
                if "```json" in content:
                    content = content.split("```json")[1].split("```")[0].strip()
                elif "```" in content:
                    content = content.split("```")[1].split("```")[0].strip()
                tasks_data = json.loads(content)
            else:
                tasks_data = content

            # Insert tasks
            from .project_service import project_service
            await project_service.add_tasks_to_project(project_id, tasks_data)
            logger.info(f"Auto-decomposed project {project_id} into {len(tasks_data)} tasks.")
        except Exception as e:
            logger.error(f"Project decomposition failed: {e}")

    def _resolve_agent(self, task: dict, available_agents: list[dict]):
        assigned_agent_id = task.get("assigned_agent_id")
        if assigned_agent_id:
            return next((agent for agent in available_agents if agent["id"] == assigned_agent_id), None)
        return available_agents[0] if available_agents else None

    async def _run_task(self, task: dict, agent_data: dict):
        task_id = task["id"]
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

            context_res = (
                supabase.table("tasks")
                .select("title, output_data")
                .eq("project_id", task["project_id"])
                .eq("status", "done")
                .execute()
            )
            context = context_res.data or []

            supabase.table("agent_logs").insert({
                "task_id": task_id,
                "run_id": run_id,
                "action": "orchestrator_execution_start",
                "content": f"Orchestrator assigned {agent_data['name']} to task: {task['title']}"
            }).execute()

            result = await agent.run(task.get("description") or task["title"], context)

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
                "action": "orchestrator_execution_complete",
                "content": "Task completed and is awaiting approval."
            }).execute()
        except Exception:
            if run_id:
                supabase.table("task_runs").update({
                    "status": "failed",
                    "finished_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", run_id).execute()
            raise

orchestrator_service = OrchestratorService()
