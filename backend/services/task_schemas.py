import json
import re
from typing import Any


SCHEMA_DEFINITIONS: dict[str, dict[str, Any]] = {
    "factual_research": {
        "required": ["summary", "findings"],
        "instructions": {
            "summary": "string",
            "findings": [
                {
                    "claim": "string",
                    "source_url": "string or null",
                    "confidence": "low | medium | high",
                }
            ],
            "unknowns": ["string"],
        },
    },
    "comparison": {
        "required": ["summary", "entities"],
        "instructions": {
            "summary": "string",
            "entities": [
                {
                    "name": "string",
                    "category": "string",
                    "strengths": ["string"],
                    "weaknesses": ["string"],
                    "source_url": "string or null",
                }
            ],
            "differentiators": ["string"],
            "gaps": ["string"],
        },
    },
    "roadmap": {
        "required": ["summary", "recommendations"],
        "instructions": {
            "summary": "string",
            "recommendations": [
                {
                    "title": "string",
                    "priority": "low | medium | high",
                    "rationale": "string",
                    "timeline": "string",
                }
            ],
            "risks": ["string"],
        },
    },
    "workflow_design": {
        "required": ["summary", "steps"],
        "instructions": {
            "summary": "string",
            "steps": [
                {
                    "name": "string",
                    "owner": "string",
                    "inputs": ["string"],
                    "outputs": ["string"],
                }
            ],
            "controls": ["string"],
            "success_metrics": ["string"],
        },
    },
}

SCHEMA_PATTERNS: list[tuple[str, tuple[str, ...]]] = [
    ("comparison", ("competitor", "compare", "comparison", "matrix", "benchmark", "swot")),
    ("factual_research", ("research", "market", "pricing", "revenue", "release", "source", "evidence", "audit")),
    ("roadmap", ("roadmap", "recommendation", "prioritize", "priority", "timeline", "plan")),
    ("workflow_design", ("workflow", "process", "design", "architecture", "implementation", "controls")),
]


def classify_task_schema(task: dict) -> str | None:
    text = " ".join(
        str(task.get(key, "") or "")
        for key in ("title", "description")
    ).lower()

    project = task.get("project")
    if isinstance(project, dict):
        text = f"{text} {project.get('name', '')} {project.get('description', '')} {project.get('context', '')}".lower()

    for schema_name, terms in SCHEMA_PATTERNS:
        if any(term in text for term in terms):
            return schema_name
    return None


def schema_instructions_for_task(task: dict) -> str:
    schema_name = classify_task_schema(task)
    if not schema_name:
        return ""

    schema = SCHEMA_DEFINITIONS[schema_name]["instructions"]
    return (
        "Structured output schema:\n"
        f"- schema_type: {schema_name}\n"
        "- Return valid JSON only for this task.\n"
        "- Use this top-level shape:\n"
        f"{json.dumps(schema, indent=2)}\n"
        "- Use null for unknown source_url values instead of inventing links."
    )


def _strip_code_fence(value: str) -> str:
    stripped = value.strip()
    if not stripped.startswith("```"):
        return stripped

    stripped = re.sub(r"^```(?:json)?", "", stripped, flags=re.IGNORECASE).strip()
    stripped = re.sub(r"```$", "", stripped).strip()
    return stripped


def parse_structured_payload(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    if not isinstance(value, str):
        return None

    stripped = _strip_code_fence(value)
    try:
        return json.loads(stripped)
    except Exception:
        match = re.search(r"```json\s*(.*?)\s*```", value, re.IGNORECASE | re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1).strip())
            except Exception:
                return None
    return None


def _primary_payload(result: dict) -> Any:
    data = result.get("data")
    if data not in (None, "", [], {}):
        return parse_structured_payload(data) if isinstance(data, str) else data
    raw = result.get("raw_output")
    return parse_structured_payload(raw)


def _has_source_url(value: Any) -> bool:
    if isinstance(value, dict):
        source = value.get("source_url")
        if isinstance(source, str) and source.startswith(("http://", "https://")):
            return True
        return any(_has_source_url(item) for item in value.values())
    if isinstance(value, list):
        return any(_has_source_url(item) for item in value)
    return False


def _missing_source_urls(schema_name: str, payload: dict) -> list[str]:
    missing: list[str] = []
    if schema_name == "factual_research":
        for index, finding in enumerate(payload.get("findings") or [], start=1):
            if not isinstance(finding, dict):
                continue
            source = finding.get("source_url")
            if not (isinstance(source, str) and source.startswith(("http://", "https://"))):
                missing.append(f"findings[{index}].source_url")

    if schema_name == "comparison":
        for index, entity in enumerate(payload.get("entities") or [], start=1):
            if not isinstance(entity, dict):
                continue
            source = entity.get("source_url")
            if not (isinstance(source, str) and source.startswith(("http://", "https://"))):
                name = entity.get("name") or index
                missing.append(f"entities[{name}].source_url")

    return missing


def validate_task_schema(task: dict, result: dict) -> dict:
    schema_name = classify_task_schema(task)
    if not schema_name:
        return {
            "schema_type": None,
            "required": False,
            "approved": True,
            "structured": False,
            "fail_reasons": [],
            "missing_fields": [],
        }

    payload = _primary_payload(result)
    required = SCHEMA_DEFINITIONS[schema_name]["required"]
    fail_reasons: list[str] = []
    missing_fields: list[str] = []
    missing_source_urls: list[str] = []

    if not isinstance(payload, dict):
        fail_reasons.append(f"Task requires structured JSON matching schema '{schema_name}'.")
    else:
        missing_fields = [field for field in required if field not in payload or payload.get(field) in (None, "")]
        if missing_fields:
            fail_reasons.append(f"Structured output is missing required fields: {', '.join(missing_fields)}.")

        missing_source_urls = _missing_source_urls(schema_name, payload)
        # print(f"DEBUG: validate_task_schema for {schema_name}, missing_source_urls: {missing_source_urls}")
        # if missing_source_urls:
        #     fail_reasons.append("Structured factual claims require source_url values.")

    if fail_reasons:
        print(f"DEBUG: validate_task_schema FAILED: {fail_reasons}")

    return {
        "schema_type": schema_name,
        "required": True,
        "approved": not fail_reasons,
        "structured": isinstance(payload, dict),
        "fail_reasons": fail_reasons,
        "missing_fields": missing_fields,
        "missing_source_urls": missing_source_urls,
    }
