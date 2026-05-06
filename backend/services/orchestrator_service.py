from services.supabase_service import supabase
from agents.agent_factory import AgentFactory
import json
import logging
from services.config import settings
from services.agent_runner_service import AgentRunnerService
from services.output_quality import clean_report_text, dedupe_lines, filter_report_sections, report_text_from_output

logger = logging.getLogger("uvicorn")

def _humanize_key(key: str) -> str:
    return key.replace("_", " ").replace("-", " ").strip().title()

def _format_value_for_report(value, level: int = 0) -> list[str]:
    if value is None:
        return ["Not specified."]

    if isinstance(value, (str, int, float, bool)):
        return [str(value)]

    if isinstance(value, list):
        lines: list[str] = []
        for item in value:
            if isinstance(item, dict):
                item_lines = _format_value_for_report(item, level + 1)
                if item_lines:
                    lines.append(f"- {item_lines[0]}")
                    lines.extend(f"  {line}" for line in item_lines[1:])
            elif isinstance(item, list):
                nested = _format_value_for_report(item, level + 1)
                lines.extend(f"- {line}" for line in nested)
            else:
                lines.append(f"- {item}")
        return lines or ["No items."]

    if isinstance(value, dict):
        lines: list[str] = []
        for key, item in value.items():
            title = _humanize_key(str(key))
            if isinstance(item, dict):
                lines.append(f"{title}:")
                lines.extend(f"  {line}" for line in _format_value_for_report(item, level + 1))
            elif isinstance(item, list):
                lines.append(f"{title}:")
                lines.extend(f"  {line}" for line in _format_value_for_report(item, level + 1))
            else:
                lines.append(f"{title}: {item}")
        return lines or ["No details."]

    return [str(value)]

def _format_output_for_report(output_data) -> str:
    if not output_data:
        return "No approved output was saved for this task."

    if isinstance(output_data, dict):
        primary = (
            output_data.get("data")
            or output_data.get("final")
            or output_data.get("raw_output")
            or output_data
        )
    else:
        primary = output_data

    if isinstance(primary, str):
        return clean_report_text(dedupe_lines(primary))

    return clean_report_text(dedupe_lines("\n".join(_format_value_for_report(primary))))


def _has_usable_output(output_data) -> bool:
    if not output_data:
        return False
    if isinstance(output_data, dict):
        if output_data.get("error"):
            return False
        primary = output_data.get("data")
        if primary in (None, "", [], {}):
            return False
    return True

def _output_text(output_data) -> str:
    return _format_output_for_report(output_data).lower()

def _build_report_charts(tasks: list[dict]) -> dict:
    total = len(tasks)
    done = sum(1 for task in tasks if task.get("status") == "done")
    failed = sum(1 for task in tasks if task.get("status") == "failed")
    pending = max(total - done - failed, 0)

    priority_counts: dict[str, int] = {}
    for task in tasks:
        priority = str(task.get("priority") if task.get("priority") is not None else 0)
        priority_counts[priority] = priority_counts.get(priority, 0) + 1

    categories = {
        "Market": ("market", "competitor", "customer", "segment", "demand"),
        "Product": ("product", "mvp", "feature", "design", "scope"),
        "Revenue": ("revenue", "price", "pricing", "margin", "commission"),
        "Operations": ("operation", "process", "logistic", "support", "fulfillment"),
        "Risk": ("risk", "threat", "failure", "weak", "mitigation")
    }
    category_counts = {name: 0 for name in categories}
    risk_mentions = 0

    for task in tasks:
        text = f"{task.get('title', '')} {task.get('description', '')} {_output_text(task.get('output_data'))}"
        risk_mentions += sum(text.count(term) for term in categories["Risk"])
        for category, terms in categories.items():
            if any(term in text for term in terms):
                category_counts[category] += 1

    opportunity_score = 85 if total and done == total else round((done / total) * 85) if total else 0
    risk_score = min(95, 35 + risk_mentions * 3)
    readiness_score = round((done / total) * 100) if total else 0

    return {
        "status": [
            {"label": "Approved", "value": done},
            {"label": "Pending", "value": pending},
            {"label": "Failed", "value": failed}
        ],
        "priorities": [
            {"label": f"Priority {key}", "value": value}
            for key, value in sorted(priority_counts.items(), key=lambda item: int(item[0]) if item[0].isdigit() else 0, reverse=True)
        ],
        "categories": [
            {"label": label, "value": value}
            for label, value in category_counts.items()
        ],
        "scores": [
            {"label": "Readiness", "value": readiness_score},
            {"label": "Opportunity", "value": opportunity_score},
            {"label": "Risk", "value": risk_score}
        ]
    }

REPORT_VARIANTS = {
    "full": {
        "title": "Final Report",
        "agent_terms": [],
        "fallback_heading": "Approved Work Summary",
        "prompt": ""
    },
    "brief": {
        "title": "Short Brief",
        "agent_terms": ["brief", "summary", "writer"],
        "fallback_heading": "Short Brief",
        "prompt": (
            "Create a concise executive brief from the approved project work. "
            "Use plain English, no JSON, no code blocks. Include: objective, main findings, recommended next steps, and key risks. "
            "Keep it short and decision-oriented. Do not invent entities, metrics, or placeholders."
        )
    },
    "pessimistic": {
        "title": "Pessimistic Analysis",
        "agent_terms": ["pessimistic", "risk", "critic", "reviewer"],
        "fallback_heading": "Pessimistic Analysis",
        "prompt": (
            "Create a skeptical, downside-focused analysis from the approved project work. "
            "Use plain English, no JSON, no code blocks. Focus on what can fail, weak assumptions, operational risks, market risks, "
            "financial risks, execution gaps, and mitigation priorities. Do not invent entities, metrics, or placeholders."
        )
    }
}

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
            agent_a_data = supabase.table("agents").select("*").eq("id", agent_a_id).single().execute().data
            agent_b_data = supabase.table("agents").select("*").eq("id", agent_b_id).single().execute().data
            
            if not task or not agent_a_data or not agent_b_data:
                raise ValueError("Task or agents not found for debate.")

            # Update status to in_progress
            supabase.table("tasks").update({"status": "in_progress"}).eq("id", task_id).execute()
            
            # 2. Agent A generates initial response
            initial_res, _ = await AgentRunnerService.run_agent_task(
                task, 
                agent_a_data, 
                start_action="debate_initial_start",
                start_content=f"Debate Step 1: {agent_a_data['name']} generating initial proposal.",
                complete_action="debate_initial_complete",
                update_task=False
            )
            
            # 3. Agent B reviews and critiques
            # We temporarily modify the task description for this run
            task_critique = task.copy()
            task_critique["description"] = f"Review the following output for the task: '{task['description']}'. Provide constructive critique and identify errors.\n\nOutput: {json.dumps(initial_res['data'])}"
            
            critique_res, _ = await AgentRunnerService.run_agent_task(
                task_critique, 
                agent_b_data, 
                start_action="debate_critique_start",
                start_content=f"Debate Step 2: {agent_b_data['name']} critiquing the proposal.",
                complete_action="debate_critique_complete",
                update_task=False
            )
            
            # 4. Agent A refines based on critique
            task_refinement = task.copy()
            task_refinement["description"] = f"Refine your initial output for the task: '{task['description']}' based on this critique: {json.dumps(critique_res['data'])}"
            
            final_res, _ = await AgentRunnerService.run_agent_task(
                task_refinement, 
                agent_a_data, 
                start_action="debate_refinement_start",
                start_content=f"Debate Step 3: {agent_a_data['name']} refining proposal based on feedback.",
                complete_action="debate_refinement_complete",
                update_task=False
            )
            
            # 5. Save consolidated result and mark for approval
            consolidated_output = {
                "agent_name": agent_a_data["name"],
                "provider": agent_a_data["api_provider"],
                "model": agent_a_data["model"],
                "is_debate": True,
                "data": final_res["data"],
                "debate_history": {
                    "initial": initial_res["data"],
                    "critique": critique_res["data"],
                    "final": final_res["data"]
                }
            }
            
            supabase.table("tasks").update({
                "status": "awaiting_approval",
                "output_data": consolidated_output
            }).eq("id", task_id).execute()
            
            logger.info(f"Debate completed for task {task_id}")
            
        except Exception as e:
            logger.error(f"Debate failed: {str(e)}")
            supabase.table("tasks").update({
                "status": "failed",
                "output_data": {"error": str(e)}
            }).eq("id", task_id).execute()
            
            # LOG ERROR TO AGENT CONSOLE
            supabase.table("agent_logs").insert({
                "task_id": task_id,
                "action": "debate_failed",
                "content": f"DEBATE ERROR: {str(e)}"
            }).execute()

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

        # Check if ANY tasks exist for this project (regardless of status) to avoid re-decomposing
        all_tasks_res = supabase.table("tasks").select("id", count="exact").eq("project_id", project_id).limit(1).execute()
        has_any_tasks = all_tasks_res.count > 0 if all_tasks_res.count is not None else len(all_tasks_res.data) > 0

        # Automatic Decomposition: Only if no tasks exist AT ALL
        if not has_any_tasks:
            logger.info(f"No tasks found for project {project_id}. Triggering auto-decomposition.")
            await self.decompose_project(project_id)
            # Re-fetch tasks after decomposition
            tasks = (
                supabase.table("tasks")
                .select("*")
                .eq("project_id", project_id)
                .in_("status", ["todo", "failed"])
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

    def _select_report_agent(self, project: dict, variant: str):
        config = REPORT_VARIANTS.get(variant, REPORT_VARIANTS["full"])
        terms = config["agent_terms"]
        if not terms:
            return None

        owner_id = project.get("owner_id")
        agents = supabase.table("agents").select("*").execute().data or []
        available_agents = [
            agent for agent in agents
            if agent.get("user_id") in (None, owner_id)
        ]

        return next(
            (
                agent for agent in available_agents
                if any(term in f"{agent.get('name', '')} {agent.get('role', '')}".lower() for term in terms)
            ),
            available_agents[0] if available_agents else None
        )

    async def _generate_report_variant_with_agent(self, project: dict, report: str, variant: str):
        agent_data = self._select_report_agent(project, variant)
        if not agent_data:
            return None

        config = REPORT_VARIANTS[variant]
        agent = AgentFactory.get_agent(
            provider=agent_data["api_provider"],
            name=agent_data["name"],
            role=agent_data["role"],
            model=agent_data["model"],
            system_prompt=agent_data.get("system_prompt")
        )
        result = await agent.run(f"{config['prompt']}\n\nApproved project material:\n{report}", [])
        if result.get("status") == "error":
            raise RuntimeError(result.get("error") or "Report agent returned an error.")

        data = result.get("data")
        if isinstance(data, dict):
            for key in ("brief", "analysis", "report", "summary", "content"):
                if isinstance(data.get(key), str):
                    return data[key]
            return "\n".join(_format_value_for_report(data))
        if isinstance(data, str):
            return data
        return result.get("raw_output")

    def _build_fallback_variant(self, project: dict, tasks: list[dict], variant: str):
        config = REPORT_VARIANTS[variant]
        lines = [
            f"# {config['title']}: {project['name']}",
            "",
            "## Project Brief",
            project.get("description") or "No project description provided.",
            "",
            f"## {config['fallback_heading']}"
        ]

        if variant == "brief":
            lines.extend([
                f"All {len(tasks)} approved tasks have been consolidated.",
                "The project is ready for decision review based on the approved task outputs.",
                "",
                "Recommended next steps:",
                "- Validate the highest-impact assumptions with real users or customers.",
                "- Prioritize the smallest launch scope that proves demand.",
                "- Convert approved outputs into an execution backlog with owners and dates."
            ])
            return "\n".join(lines)

        if variant == "pessimistic":
            lines.extend([
                "This project can still fail even with all tasks approved.",
                "",
                "Primary downside risks:",
                "- Approved task outputs may be internally consistent but unvalidated by the market.",
                "- Revenue, conversion, operational, and adoption assumptions may be too optimistic.",
                "- Execution scope can expand faster than the team can deliver.",
                "- Competitors can respond with pricing, distribution, or trust advantages.",
                "",
                "Mitigation priorities:",
                "- Validate demand before building broad feature scope.",
                "- Stress-test unit economics and support costs.",
                "- Define kill criteria before committing more resources."
            ])
            return "\n".join(lines)

        return None

    def _quality_approved_tasks(self, tasks: list[dict]) -> tuple[list[dict], list[dict]]:
        approved: list[dict] = []
        excluded: list[dict] = []
        for task in tasks:
            output_data = task.get("output_data") or {}
            if not _has_usable_output(output_data):
                excluded.append({
                    "title": task.get("title", "Untitled task"),
                    "reasons": ["Task has no usable approved output."]
                })
                continue
            quality_review = output_data.get("quality_review") if isinstance(output_data, dict) else None
            if quality_review and not quality_review.get("approved", False):
                excluded.append({
                    "title": task.get("title", "Untitled task"),
                    "reasons": quality_review.get("fail_reasons") or ["Failed quality review."]
                })
                continue
            approved.append(task)
        return approved, excluded

    def _curate_task_output(self, output_data) -> tuple[str, list[str]]:
        text = report_text_from_output(output_data)
        text = clean_report_text(dedupe_lines(text))
        text, excluded_lines = filter_report_sections(text)
        return text or "No approved output was saved for this task.", excluded_lines

    async def build_final_report(self, project_id: str, variant: str = "full"):
        variant = variant if variant in REPORT_VARIANTS else "full"
        project = supabase.table("projects").select("*").eq("id", project_id).single().execute().data
        if not project:
            raise ValueError(f"Project not found: {project_id}")

        tasks = (
            supabase.table("tasks")
            .select("title,description,status,priority,output_data,created_at")
            .eq("project_id", project_id)
            .order("priority", desc=True)
            .order("created_at", desc=False)
            .execute()
            .data
            or []
        )

        if not tasks:
            raise ValueError("Project has no tasks to summarize.")

        incomplete = [task for task in tasks if task.get("status") != "done"]
        if incomplete:
            raise ValueError(f"Final report is available after all tasks are approved. Pending tasks: {len(incomplete)}")

        curated_tasks, excluded_tasks = self._quality_approved_tasks(tasks)
        if not curated_tasks:
            raise ValueError("No approved task outputs passed quality validation for final reporting.")

        # 0. Header and Description
        report_title = REPORT_VARIANTS[variant]["title"]
        lines = [
            f"# {report_title}: {project['name']}",
            "",
            "## Project Overview",
            project.get("description") or "No description provided.",
            ""
        ]

        # Add Context if exists
        if project.get("context"):
            lines.extend(["## Context", project["context"], ""])

        lines.extend(["## Execution Summary", ""])
        
        # We will add the tabular summary later in the UI or via charts, 
        # but for the text report, we include the approved work summary.
        lines.extend(["## Approved Work Summary", ""])

        report_exclusions: list[str] = []
        for index, task in enumerate(curated_tasks, start=1):
            curated_text, excluded_lines = self._curate_task_output(task.get("output_data"))
            report_exclusions.extend(excluded_lines)
            lines.extend([
                f"### {index}. {task['title']}",
                task.get("description") or "No task description provided.",
                "",
                curated_text,
                ""
            ])

        if excluded_tasks or report_exclusions:
            lines.extend(["## Excluded Content", ""])
            for excluded in excluded_tasks:
                lines.append(f"- Excluded task output: {excluded['title']} ({'; '.join(excluded['reasons'])})")
            for excluded_line in list(dict.fromkeys(report_exclusions))[:10]:
                if excluded_line:
                    lines.append(f"- {excluded_line}")
            lines.append("")

        # Final Conclusion Generation
        conclusion = (
            "Based on the approved task outputs, the project has successfully established a foundational framework. "
            "The key findings suggest a viable path forward by focusing on the identified entry wedge and "
            "mitigating primary risks through phased execution."
        )

        if variant == "full":
            try:
                # Use the 'Brief Writer' or any available agent to summarize a conclusion
                agent_data = self._select_report_agent(project, "brief")
                if agent_data:
                    agent = AgentFactory.get_agent(
                        provider=agent_data["api_provider"],
                        name=agent_data["name"],
                        role=agent_data["role"],
                        model=agent_data["model"],
                        system_prompt="You write a 2-3 sentence strategic conclusion and 3 actionable next steps for a project report. Never introduce placeholders or unsupported facts."
                    )
                    report_so_far = "\n".join(lines)
                    res = await agent.run(f"Based on this project report, write a final strategic conclusion and 3 next steps:\n\n{report_so_far}", [])
                    if res.get("status") != "error":
                        data = res.get("data")
                        if isinstance(data, str):
                            conclusion = data
                        elif isinstance(data, dict):
                            conclusion = data.get("conclusion") or data.get("content") or str(data)
            except Exception as exc:
                logger.warning(f"Failed to generate dynamic conclusion: {exc}")

        lines.extend([
            "## Strategic Conclusion",
            conclusion,
            "",
            "## Completion Status",
            f"{len(tasks)} tasks reached done status. {len(curated_tasks)} task outputs passed final quality validation. {len(excluded_tasks)} task outputs were excluded from the final report."
        ])

        supabase.table("projects").update({"status": "completed"}).eq("id", project_id).execute()
        report = "\n".join(lines)

        if variant != "full":
            try:
                generated = await self._generate_report_variant_with_agent(project, report, variant)
                report = generated or self._build_fallback_variant(project, tasks, variant) or report
            except Exception as exc:
                logger.warning(f"Report variant generation failed: {exc}")
                report = self._build_fallback_variant(project, tasks, variant) or report

        return {
            "project_id": project_id,
            "project_name": project["name"],
            "task_count": len(curated_tasks),
            "variant": variant,
            "report": clean_report_text(dedupe_lines(report)),
            "charts": _build_report_charts(curated_tasks)
        }

    async def decompose_project(self, project_id: str):
        """
        Uses a Planner agent to decompose a project into discrete tasks.
        """
        project = supabase.table("projects").select("*").eq("id", project_id).single().execute().data
        owner_id = project.get("owner_id")
        
        # Find a Planner agent, prioritizing Groq as requested
        agents = supabase.table("agents").select("*").execute().data or []
        
        # 1. Try to find an existing Groq Planner
        planner_agent_data = next(
            (a for a in agents if "Planner" in a["name"] and a.get("api_provider") == "groq"),
            None
        )
        
        # 2. If not found, try any Planner
        if not planner_agent_data:
            planner_agent_data = next(
                (a for a in agents if "Planner" in a["name"] and a.get("user_id") in (None, owner_id)),
                next((a for a in agents if a.get("user_id") in (None, owner_id)), None)
            )

        # 3. If still no agent, or it's OpenAI but we want Groq, create a temporary one
        if not planner_agent_data or (planner_agent_data.get("api_provider") == "openai" and not settings.OPENAI_API_KEY):
            logger.info("Using default Groq Planner for decomposition.")
            planner = AgentFactory.get_agent(
                provider="groq",
                name="System Planner",
                role="Project Decomposer",
                model="llama-3.3-70b-versatile",
                system_prompt="You decompose goals into clear, ordered implementation tasks."
            )
        else:
            planner = AgentFactory.get_agent(
                provider=planner_agent_data["api_provider"],
                name=planner_agent_data["name"],
                role=planner_agent_data["role"],
                model=planner_agent_data["model"],
                system_prompt=planner_agent_data.get("system_prompt")
            )

        prompt = f"""Decompose the following project into 3-5 clear, actionable implementation tasks.
Project Name: {project['name']}
Description: {project['description']}
Context: {project.get('context', 'None')}

### Output Requirements:
You MUST return a valid JSON array of objects. Each object represents a task.
Do not include any conversational text, markdown formatting outside of the JSON, or explanations.

### JSON Schema:
[
  {{
    "title": "string (The name of the task)",
    "description": "string (Detailed instructions for the agent)",
    "priority": "integer (1-5, where 5 is highest priority)"
  }}
]

IMPORTANT: Return a flat array. Do not wrap it in a parent 'tasks' object.
Do not use placeholder names or generic filler tasks. Every task title must be concrete and directly relevant to the stated project.
"""

        try:
            result = await planner.run(prompt, [])
            tasks_data = result.get("data")

            # Handle common LLM wrapping patterns
            if isinstance(tasks_data, dict):
                if "tasks" in tasks_data and isinstance(tasks_data["tasks"], list):
                    tasks_data = tasks_data["tasks"]
                else:
                    tasks_data = [tasks_data]
            
            if not isinstance(tasks_data, list):
                raise ValueError(f"Agent returned invalid format: {type(tasks_data)}. Expected list or dict.")

            # Filter out invalid tasks
            valid_tasks = [
                t for t in tasks_data 
                if isinstance(t, dict) and t.get("title")
            ]

            if not valid_tasks:
                raise ValueError("No valid tasks extracted from agent output.")

            # Insert tasks
            from .project_service import project_service
            await project_service.add_tasks_to_project(project_id, valid_tasks)
            logger.info(f"Auto-decomposed project {project_id} into {len(valid_tasks)} tasks.")
        except Exception as e:
            logger.error(f"Project decomposition failed: {e}")

    def _resolve_agent(self, task: dict, available_agents: list[dict]):
        assigned_agent_id = task.get("assigned_agent_id")
        if assigned_agent_id:
            return next((agent for agent in available_agents if agent["id"] == assigned_agent_id), None)
        return available_agents[0] if available_agents else None

    async def _run_task(self, task: dict, agent_data: dict):
        await AgentRunnerService.run_agent_task(
            task,
            agent_data,
            start_action="orchestrator_execution_start",
            start_content=f"Orchestrator assigned {agent_data['name']} to task: {task['title']}",
            complete_action="orchestrator_execution_complete",
            complete_content="Task completed and is awaiting approval."
        )

orchestrator_service = OrchestratorService()
