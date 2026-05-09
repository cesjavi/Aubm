from services.supabase_service import supabase
from agents.agent_factory import AgentFactory
import json
import logging
import re
from services.config import settings
from services.agent_runner_service import AgentRunnerService
from services.audit_service import audit_service
from services.evidence_service import evidence_service
from services.output_quality import clean_report_text, dedupe_lines, filter_report_sections, validate_output

logger = logging.getLogger("uvicorn")

NOISY_REPORT_KEYS = {
    "raw_text",
    "sampleBackendCode",
    "sampleUploadSnippet",
    "sampleSearchEndpoint",
    "sampleRedisCartHelper",
    "sampleWebhookHandler",
    "sampleStateMachine",
    "repositoryStructure",
    "wireframes",
    "dataModel",
    "userStories",
}

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
            if str(key) in NOISY_REPORT_KEYS:
                continue
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


def _extract_json_payload(text: str):
    if not text:
        return None
        
    stripped = text.strip()
    
    # 1. Try standard block extraction
    if stripped.startswith("```"):
        cleaned = stripped.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
        try:
            return json.loads(cleaned)
        except Exception:
            pass # Fallback to regex

    # 2. Try direct parsing
    try:
        return json.loads(stripped)
    except Exception:
        pass

    # 3. Robust Regex Search (find content between first { and last })
    # This is the "Repair Layer" for noisy LLM outputs
    try:
        # Search for anything starting with { and ending with }
        # across multiple lines
        match = re.search(r'(\{.*\})', stripped, re.DOTALL)
        if match:
            return json.loads(match.group(1))
    except Exception:
        pass

    # 4. Specific Markdown Block Search
    match = re.search(r"```json\s*(.*?)\s*```", text, re.IGNORECASE | re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except Exception:
            pass
            
    return None

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
        parsed = _extract_json_payload(primary)
        if parsed is not None:
            return clean_report_text(dedupe_lines("\n".join(_format_value_for_report(parsed))))
        return clean_report_text(dedupe_lines(primary))

    return clean_report_text(dedupe_lines("\n".join(_format_value_for_report(primary))))


def _is_empty_curated_text(text: str) -> bool:
    normalized = (text or "").strip().lower()
    return normalized in {
        "",
        "no approved output was saved for this task.",
        "{}",
        "[]",
    }


def _is_empty_report_variant(text: str | None) -> bool:
    normalized = clean_report_text(dedupe_lines(text or "")).strip()
    content_words = re.findall(r"[A-Za-z0-9_]+", normalized)
    lower = normalized.lower()
    return (
        len(content_words) < 20
        or lower in {"{}", "[]", "null", "none", "no details.", "not specified."}
        or lower.startswith("```")
    )


def _format_conclusion_payload(data: dict) -> str:
    conclusion = data.get("strategicConclusion") or data.get("conclusion") or data.get("content") or ""
    next_steps = data.get("nextSteps") or data.get("next_steps") or []

    lines: list[str] = []
    if isinstance(conclusion, str) and conclusion.strip():
        lines.append(conclusion.strip())

    usable_steps = [
        step.strip()
        for step in next_steps
        if isinstance(step, str) and step.strip()
    ] if isinstance(next_steps, list) else []

    if usable_steps:
        lines.append("")
        lines.append("Next steps:")
        for step in usable_steps[:5]:
            lines.append(f"- {step}")

    return "\n".join(lines).strip() or "\n".join(_format_value_for_report(data))


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
        text = f"{task.get('title', '')} {task.get('description', '')} {_output_text(task.get('output_data'))}".lower()
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

def _format_chart_rows(title: str, rows: list[dict]) -> list[str]:
    if not rows:
        return [f"### {title}", "No data available.", ""]

    lines = [f"### {title}"]
    lines.extend(f"- {row['label']}: {row['value']}" for row in rows)
    lines.append("")
    return lines

def _format_execution_summary(charts: dict, total_tasks: int, kept_task_count: int, excluded_count: int) -> list[str]:
    lines = [
        f"- Total tasks: {total_tasks}",
        f"- Included outputs: {kept_task_count}",
        f"- Excluded outputs: {excluded_count}",
        "",
    ]
    lines.extend(_format_chart_rows("Scores", charts.get("scores", [])))
    lines.extend(_format_chart_rows("Task Categories", charts.get("categories", [])))
    lines.extend(_format_chart_rows("Priorities", charts.get("priorities", [])))
    return lines





async def _format_evidence_summary(project_id: str, claims: list[dict]) -> list[str]:
    if not claims:
        return []

    # Get semantically merged claims for the "Strategic Findings" section
    merged_claims = await evidence_service.merge_project_claims(project_id, threshold=0.88)
    summary = evidence_service.summarize_claims(claims)
    
    lines = [
        "## Strategic Findings & Evidence",
        f"The analysis has consolidated **{summary['claim_count']}** unique data points into **{len(merged_claims)}** strategic findings.",
        f"Source coverage: **{summary['source_coverage']:.0%}** (Claims backed by external evidence).",
        "",
        "### Key Consolidated Findings",
    ]

    # Show merged claims with their confidence and sources
    for claim in merged_claims[:15]:
        text = claim.get("claim_text")
        entity = claim.get("entity_name")
        source = claim.get("source_url")
        confidence = claim.get("confidence", "unknown")
        merged_count = claim.get("merged_count", 1)
        
        prefix = f"**[{entity}]** " if entity else ""
        source_suffix = f" [Source: {source}]" if source else " [Internal Analysis]"
        repetition_suffix = f" (Verified by {merged_count} sources)" if merged_count > 1 else ""
        
        lines.append(f"- {prefix}{text}{repetition_suffix}{source_suffix}")

    if summary["by_entity"]:
        lines.append("")
        lines.append("### Entity Analysis Coverage")
        for entity, count in list(summary["by_entity"].items())[:8]:
            lines.append(f"- **{entity}**: {count} supporting claims identified.")
    
    lines.append("")
    return lines

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
    "presentation": {
        "title": "Presentation Slides",
        "agent_terms": ["brief", "writer", "summary"],
        "fallback_heading": "Presentation Outline",
        "prompt": (
            "Transform the approved project work into a high-impact presentation deck structure. "
            "For each slide, provide a Title and 3-4 concise bullet points. "
            "Use plain English, no JSON, no code blocks. "
            "Include: 1. Title Slide, 2. Objective, 3. Market/Problem Context, 4. Strategic Findings, 5. Proposed Solution/Roadmap, 6. Key Risks, 7. Final Recommendation. "
            "Focus on visual clarity and executive communication."
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
            await audit_service.log_action(
                user_id=None,
                action="debate_started",
                agent_id=agent_a_id,
                task_id=task_id,
                metadata={"agent_b_id": agent_b_id, "project_id": task.get("project_id")},
            )
            
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
            claims_count = await evidence_service.replace_task_claims(task, consolidated_output)
            await audit_service.log_action(
                user_id=None,
                action="debate_completed",
                agent_id=agent_a_id,
                task_id=task_id,
                metadata={"agent_b_id": agent_b_id, "project_id": task.get("project_id"), "claims_count": claims_count},
            )
            
            logger.info(f"Debate completed for task {task_id}")
            
        except Exception as e:
            logger.error(f"Debate failed: {str(e)}")
            supabase.table("tasks").update({
                "status": "failed",
                "output_data": {"error": str(e)}
            }).eq("id", task_id).execute()
            await audit_service.log_action(
                user_id=None,
                action="debate_failed",
                agent_id=agent_a_id,
                task_id=task_id,
                metadata={"agent_b_id": agent_b_id, "error": str(e)},
            )
            
            # LOG ERROR TO AGENT CONSOLE
            supabase.table("agent_logs").insert({
                "task_id": task_id,
                "action": "debate_failed",
                "content": f"DEBATE ERROR: {str(e)}"
            }).execute()

    async def _get_or_create_project_tasks(self, project_id: str) -> list[dict]:
        """Fetches tasks for a project, triggering decomposition if none exist."""
        tasks = (
            supabase.table("tasks")
            .select("*")
            .eq("project_id", project_id)
            .in_("status", ["todo", "failed", "queued"])
            .order("priority", desc=True)
            .order("created_at", desc=False)
            .execute()
            .data
            or []
        )

        if not tasks:
            # Check if ANY tasks exist (to avoid re-decomposing completed projects)
            all_tasks_res = supabase.table("tasks").select("id", count="exact").eq("project_id", project_id).limit(1).execute()
            has_any_tasks = all_tasks_res.count > 0 if all_tasks_res.count is not None else len(all_tasks_res.data) > 0
            
            if not has_any_tasks:
                logger.info(f"No tasks found for project {project_id}. Triggering auto-decomposition.")
                await self.decompose_project(project_id)
                # Re-fetch
                return (
                    supabase.table("tasks")
                    .select("*")
                    .eq("project_id", project_id)
                    .in_("status", ["todo", "failed", "queued"])
                    .order("priority", desc=True)
                    .order("created_at", desc=False)
                    .execute()
                    .data
                    or []
                )
        return tasks

    async def run_project(self, project_id: str):
        """
        Runs queued tasks in a project sequentially. Unassigned tasks are assigned
        to the first available project-owner or global agent.
        """
        project = supabase.table("projects").select("*").eq("id", project_id).single().execute().data
        if not project:
            raise ValueError(f"Project not found: {project_id}")

        owner_id = project.get("owner_id")
        tasks = await self._get_or_create_project_tasks(project_id)

        agents = supabase.table("agents").select("*").execute().data or []
        available_agents = [
            agent for agent in agents
            if agent.get("user_id") in (None, owner_id) or agent.get("id") in {t.get("assigned_agent_id") for t in tasks if t.get("assigned_agent_id")}
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

    async def queue_project(self, project_id: str):
        """
        Assigns available agents and queues runnable project tasks for worker execution.
        """
        from services.task_queue import TaskQueueService

        project = supabase.table("projects").select("*").eq("id", project_id).single().execute().data
        if not project:
            raise ValueError(f"Project not found: {project_id}")
        if project.get("status") == "completed":
            raise ValueError("Completed projects are locked and cannot be modified.")

        owner_id = project.get("owner_id")
        tasks = await self._get_or_create_project_tasks(project_id)

        agents = supabase.table("agents").select("*").execute().data or []
        assigned_ids = {t.get("assigned_agent_id") for t in tasks if t.get("assigned_agent_id")}
        available_agents = [
            agent for agent in agents
            if agent.get("user_id") in (None, owner_id) or agent.get("id") in assigned_ids
        ]

        queued = 0
        failed = 0
        skipped = 0

        for task in tasks:
            try:
                agent_data = self._resolve_agent(task, available_agents)
                if not agent_data:
                    raise ValueError("No available agent for task")

                if not task.get("assigned_agent_id"):
                    supabase.table("tasks").update({
                        "assigned_agent_id": agent_data["id"]
                    }).eq("id", task["id"]).execute()

                result = await TaskQueueService.queue_task(task["id"])
                if result and result.data:
                    queued += 1
                else:
                    skipped += 1
            except Exception as exc:
                failed += 1
                logger.error(f"Project queueing task failed: {str(exc)}")
                supabase.table("tasks").update({
                    "status": "failed",
                    "last_error": str(exc),
                    "output_data": {"error": str(exc)}
                }).eq("id", task["id"]).execute()
                await audit_service.log_action(
                    user_id=owner_id,
                    action="task_queue_failed",
                    task_id=task.get("id"),
                    metadata={"project_id": project_id, "error": str(exc)},
                )

        await audit_service.log_action(
            user_id=owner_id,
            action="project_queued",
            metadata={
                "project_id": project_id,
                "queued_tasks": queued,
                "failed": failed,
                "skipped": skipped,
            },
        )

        return {
            "project_id": project_id,
            "queued_tasks": queued,
            "failed": failed,
            "skipped": skipped,
            "mode": "queue",
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
                value = data.get(key)
                if isinstance(value, str) and not _is_empty_report_variant(value):
                    return value
            formatted = "\n".join(_format_value_for_report(data))
            return None if _is_empty_report_variant(formatted) else formatted
        if isinstance(data, str):
            return None if _is_empty_report_variant(data) else data
        raw_output = result.get("raw_output")
        return None if _is_empty_report_variant(raw_output) else raw_output

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

    def _quality_approved_tasks(self, tasks: list[dict], project: dict) -> tuple[list[dict], list[dict]]:
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
            task_with_project = {**task, "project": project}
            quality_review = output_data.get("quality_review") if isinstance(output_data, dict) else None
            if not quality_review and isinstance(output_data, dict):
                quality_review = validate_output(task_with_project, output_data)
            if quality_review and not quality_review.get("approved", False):
                excluded.append({
                    "title": task.get("title", "Untitled task"),
                    "reasons": quality_review.get("fail_reasons") or ["Failed quality review."]
                })
                continue
            approved.append(task)
        return approved, excluded

    def _curate_task_output(self, output_data) -> tuple[str, list[str]]:
        text = _format_output_for_report(output_data)
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

        curated_tasks, excluded_tasks = self._quality_approved_tasks(tasks, project)
        if not curated_tasks:
            # Fallback: if no tasks pass the strict quality review, include all 'done' tasks
            # so the user can at least see a draft report.
            logger.warning(f"Project {project_id}: No tasks passed quality review. Falling back to all tasks.")
            curated_tasks = tasks
        
        # Load raw claims for statistics, and we will use semantic merging inside _format_evidence_summary
        all_raw_claims = evidence_service.load_project_claims(project_id)
        merged_claims = await evidence_service.merge_project_claims(project_id)

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

        approved_work_lines = ["## Approved Work Summary", ""]

        report_exclusions: list[str] = []
        included_tasks: list[dict] = []
        kept_task_count = 0
        for task in curated_tasks:
            curated_text, excluded_lines = self._curate_task_output(task.get("output_data"))
            report_exclusions.extend(excluded_lines)
            if _is_empty_curated_text(curated_text):
                excluded_tasks.append({
                    "title": task.get("title", "Untitled task"),
                    "reasons": ["Task output became empty after quality filtering."]
                })
                continue
            kept_task_count += 1
            included_tasks.append(task)
            approved_work_lines.extend([
                f"### {kept_task_count}. {task['title']}",
                task.get("description") or "No task description provided.",
                "",
                curated_text,
                ""
            ])

        charts = _build_report_charts(included_tasks)
        lines.extend(["## Execution Summary", ""])
        lines.extend(_format_execution_summary(charts, len(tasks), kept_task_count, len(excluded_tasks)))
        
        # New Evidence-Aware Strategic Findings Section
        evidence_section = await _format_evidence_summary(project_id, all_raw_claims)
        lines.extend(evidence_section)
        
        lines.extend(approved_work_lines)

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
                        system_prompt=(
                            "You are a Senior Strategic Consultant. Your goal is to write a comprehensive, "
                            "professional strategic conclusion for a project report based on approved work. "
                            "Synthesize the findings, highlight critical success factors, identify remaining "
                            "operational or market risks, and provide 3-5 high-impact, actionable next steps. "
                            "The tone should be executive, insightful, and strictly based on provided facts. "
                            "Avoid generic filler or unsupported placeholders."
                        )
                    )
                    report_so_far = "\n".join(lines)
                    # Feed the strategic conclusion agent with the consolidated findings for maximum accuracy
                    evidence_context = "\n".join(evidence_section)
                    res = await agent.run(
                        f"Project: {project['name']}\n"
                        f"Consolidated Strategic Findings:\n{evidence_context}\n\n"
                        f"Full Report Context:\n{report_so_far}\n\n"
                        "Task: Write a final strategic conclusion and 3-5 next steps based on the findings above.", 
                        []
                    )
                    if res.get("status") != "error":
                        data = res.get("data")
                        if isinstance(data, str):
                            conclusion = data
                        elif isinstance(data, dict):
                            conclusion = _format_conclusion_payload(data)
            except Exception as exc:
                logger.warning(f"Failed to generate dynamic conclusion: {exc}")

        lines.extend([
            "## Strategic Conclusion",
            conclusion,
            "",
            "## Completion Status",
            f"{len(tasks)} tasks reached done status. {kept_task_count} task outputs were included in the final report. {len(excluded_tasks)} task outputs were excluded from the final report."
        ])

        supabase.table("projects").update({"status": "completed"}).eq("id", project_id).execute()
        report = "\n".join(lines)

        if variant != "full":
            try:
                generated = await self._generate_report_variant_with_agent(project, report, variant)
                fallback_report = self._build_fallback_variant(project, included_tasks or tasks, variant)
                report = generated if not _is_empty_report_variant(generated) else fallback_report or report
            except Exception as exc:
                logger.warning(f"Report variant generation failed: {exc}")
                report = self._build_fallback_variant(project, included_tasks or tasks, variant) or report

        await audit_service.log_action(
            user_id=project.get("owner_id"),
            action="final_report_generated",
            metadata={
                "project_id": project_id,
                "variant": variant,
                "task_count": kept_task_count,
                "excluded_task_count": len(excluded_tasks),
                "normalized_claim_count": len(merged_claims),
            },
        )

        return {
            "project_id": project_id,
            "project_name": project["name"],
            "task_count": kept_task_count,
            "variant": variant,
            "report": clean_report_text(dedupe_lines(report)),
            "charts": charts,
            "evidence": evidence_service.summarize_claims(merged_claims),
        }

    async def decompose_project(self, project_id: str, raise_errors: bool = False) -> int:
        """
        Uses alibaba-qwen3-32b on AMD to decompose a project into 5-8 tasks.
        Bypasses json_object mode to allow JSON array responses.
        """
        import json as _json
        import openai as _openai

        project = supabase.table("projects").select("*").eq("id", project_id).single().execute().data
        owner_id = project.get("owner_id")

        api_key = settings.AMD_API_KEY
        base_url = "https://inference.do-ai.run/v1"
        model = "alibaba-qwen3-32b"

        logger.info(f"Using AMD/{model} for project decomposition (direct API).")

        client = _openai.AsyncOpenAI(api_key=api_key, base_url=base_url)

        prompt = (
            f"Decompose the following project into 5-8 specific implementation tasks.\n\n"
            f"Project: {project['name']}\n"
            f"Description: {project['description']}\n"
            f"Context: {project.get('context', 'None')}\n\n"
            "Return ONLY a JSON array. No markdown, no explanation, no thinking.\n"
            'Example: [{"title": "Setup env", "description": "Install deps", "priority": 5}]'
        )

        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a project planner. Return ONLY a JSON array of task objects. Each object has title, description, and priority fields. No other text."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=4096
            )

            raw = response.choices[0].message.content or ""
            logger.info("--- PLANNER RAW OUTPUT ---")
            logger.info(raw[:2000])

            # Strip <think> tags
            cleaned = raw.strip()
            if "<think>" in cleaned:
                think_end = cleaned.find("</think>")
                if think_end != -1:
                    cleaned = cleaned[think_end + len("</think>"):].strip()

            # Strip markdown fences
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[-1] if "\n" in cleaned else cleaned[3:]
                if "```" in cleaned:
                    cleaned = cleaned.rsplit("```", 1)[0]
                cleaned = cleaned.strip()
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()

            tasks_data = _json.loads(cleaned)

            if isinstance(tasks_data, dict):
                if "tasks" in tasks_data and isinstance(tasks_data["tasks"], list):
                    tasks_data = tasks_data["tasks"]
                elif tasks_data.get("title"):
                    tasks_data = [tasks_data]

            if not isinstance(tasks_data, list):
                raise ValueError(f"Expected list, got {type(tasks_data)}")

            valid_tasks = [
                {
                    "title": t["title"],
                    "description": t.get("description", ""),
                    "priority": min(t.get("priority", 3), 5),
                    "status": "todo",
                }
                for t in tasks_data
                if isinstance(t, dict) and t.get("title")
            ]

            logger.info(f"Extracted {len(valid_tasks)} valid tasks from planner.")

            if not valid_tasks:
                raise ValueError("No valid tasks extracted.")

            from .project_service import project_service
            await project_service.add_tasks_to_project(project_id, valid_tasks)
            await audit_service.log_action(
                user_id=owner_id,
                action="project_decomposed",
                metadata={"project_id": project_id, "task_count": len(valid_tasks)},
            )
            logger.info(f"Auto-decomposed project {project_id} into {len(valid_tasks)} tasks.")
            return len(valid_tasks)
        except Exception as e:
            logger.error(f"Project decomposition failed: {e}")
            if raise_errors:
                raise
            return 0

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
