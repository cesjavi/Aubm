import json
import re
from collections import OrderedDict
from typing import Any

PLACEHOLDER_PATTERNS = [
    r"\bCompetitor\s+[A-Z]\b",
    r"\bDashboard\s+[A-Z]\b",
    r"\bProduct\s+[A-Z]\b",
    r"\bCompany\s+[A-Z]\b",
    r"\bOur Company\b",
]

GENERIC_FILLER_PATTERNS = [
    r"\bsustainable products?\b",
    r"\bdigital marketing\b",
    r"\bcustomer segments?\b",
    r"\bdemographics\b",
    r"\bpsychographics\b",
    r"\bdistribution channels?\b",
]

SENSITIVE_FACT_PATTERNS = [
    r"\bmarket share\b",
    r"\brevenue\b",
    r"\barr\b",
    r"\bpricing\b",
    r"\bprice\b",
    r"\blatest release version\b",
    r"\bprofit\b",
]

RAW_DUMP_PATTERNS = [
    r"```(?:json)?",
    r'"raw_text"\s*:',
    r'"projectoverview"\s*:',
    r'"projectoverview"\s*:',
    r'"userstories"\s*:',
    r'"datamodel"\s*:',
]

LATAM_HINTS = [
    "mercadolibre",
    "mercado libre",
    "latam",
    "latin america",
    "argentina",
    "mexico",
    "brazil",
    "brasil",
    "chile",
    "colombia",
    "peru",
    "uruguay",
]

SEA_HINTS = [
    "indonesia",
    "yogyakarta",
    "bali",
    "southeast asia",
    "tokopedia",
    "shopee",
    "jakarta",
]

STRICT_TASK_PATTERNS = [
    r"\bresearch\b",
    r"\banaly[sz]e\b",
    r"\banalysis\b",
    r"\bcompetitor\b",
    r"\bpricing\b",
    r"\bmarket\b",
    r"\baudit\b",
    r"\breport\b",
    r"\bcompare\b",
]


def _stringify_payload(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=True)
    except Exception:
        return str(value)


def build_quality_instructions(task: dict) -> str:
    project_text = _project_text(task)
    task_text = f"{task.get('title', '')}\n{task.get('description', '')}\n{project_text}".lower()
    strict_mode = any(re.search(pattern, task_text, re.IGNORECASE) for pattern in STRICT_TASK_PATTERNS)

    base = [
        "Output quality rules:",
        "- Never use placeholder names like Competitor A, Dashboard B, Product C, or Our Company.",
        "- If a real named entity cannot be identified with confidence, return unknown instead of inventing one.",
        "- Keep the output strictly within the requested scope.",
        "- Stay aligned with the project's stated geography, competitors, and market context. Do not switch regions or industries unless the task explicitly requires it.",
        "- Do not include generic filler sections that were not requested.",
        "- Use clean UTF-8/ASCII friendly text. Do not output corrupted characters.",
        "- Do not return raw JSON dumps, code blocks, repository scaffolds, or intermediate planning artifacts unless the task explicitly asks for them.",
    ]

    if strict_mode:
        base.extend(
            [
                "- Return structured JSON where possible.",
                "- For factual claims about competitors, products, pricing, versions, revenue, market share, or benchmarks, include source_url when available.",
                "- Do not invent pricing, release versions, market share, revenue, ARR impact, or benchmarks.",
                "- If a sensitive fact cannot be verified, omit it or mark it unknown.",
            ]
        )

    return "\n".join(base)


def _project_text(task: dict) -> str:
    project = task.get("project")
    if isinstance(project, dict):
        return "\n".join(
            str(project.get(key, "") or "")
            for key in ("name", "description", "context")
        )
    return str(task.get("project_context") or "")


def _contains_any(text: str, terms: list[str]) -> bool:
    lowered = text.lower()
    return any(term in lowered for term in terms)


def _looks_like_raw_dump(text: str) -> bool:
    # Extremely relaxed check: Only flag as raw dump if it contains internal system keys 
    # that indicate it's a raw unformatted API response rather than a report.
    internal_keys = [r'"raw_text"\s*:', r'"internal_status"\s*:', r'"debug_info"\s*:']
    if any(re.search(pattern, text, re.IGNORECASE) for pattern in internal_keys):
        return True
    
    return False


def _is_context_drift(task_text: str, output_text: str) -> bool:
    task_lower = task_text.lower()
    output_lower = output_text.lower()

    if _contains_any(task_lower, LATAM_HINTS) and _contains_any(output_lower, SEA_HINTS):
        return True

    return False


def validate_output(task: dict, result: dict) -> dict:
    raw_text = _stringify_payload(result.get("raw_output"))
    data_text = _stringify_payload(result.get("data"))
    combined = "\n".join(part for part in [raw_text, data_text] if part).strip()
    task_text = "\n".join(
        [
            str(task.get("title", "") or ""),
            str(task.get("description", "") or ""),
            _project_text(task),
        ]
    )

    fail_reasons: list[str] = []
    must_fix: list[str] = []
    placeholder_entities: list[str] = []
    unsupported_claims: list[str] = []
    duplicate_claims: list[str] = []
    encoding_issues: list[str] = []

    if not combined:
        fail_reasons.append("Empty output.")

    for pattern in PLACEHOLDER_PATTERNS:
        matches = re.findall(pattern, combined, re.IGNORECASE)
        placeholder_entities.extend(matches)

    if placeholder_entities:
        # We don't add to fail_reasons anymore, just let the score reduction handle it
        pass

    if "■" in combined:
        encoding_issues.append("Found corrupted character '■'.")

    if encoding_issues:
        fail_reasons.append("Output contains encoding corruption.")
        must_fix.append("Remove corrupted characters and normalize text encoding.")

    if _looks_like_raw_dump(combined):
        fail_reasons.append("Output contains raw JSON/code dump instead of a usable task result.")
        must_fix.append("Convert intermediate JSON/code output into the requested final artifact.")

    if _is_context_drift(task_text, combined):
        fail_reasons.append("Output drifted away from the project's stated geography or market context.")
        must_fix.append("Regenerate the output using the project's explicit region, competitor set, and business context.")

    for pattern in GENERIC_FILLER_PATTERNS:
        if re.search(pattern, combined, re.IGNORECASE):
            unsupported_claims.append(pattern.replace("\\b", "").replace("?", ""))

    if unsupported_claims:
        fail_reasons.append("Output contains generic filler outside the likely project scope.")
        must_fix.append("Remove generic business-analysis filler not tied to the requested task.")

    has_source_url = bool(re.search(r"https?://", combined, re.IGNORECASE))
    for pattern in SENSITIVE_FACT_PATTERNS:
        if re.search(pattern, combined, re.IGNORECASE) and not has_source_url:
            unsupported_claims.append(f"Sensitive fact without source: {pattern}")

    if any(item.startswith("Sensitive fact without source:") for item in unsupported_claims):
        # We don't add to fail_reasons anymore, just let the score reduction handle it
        pass

    normalized_lines = []
    seen_lines: set[str] = set()
    for line in combined.splitlines():
        normalized = re.sub(r"\s+", " ", line).strip().lower()
        if len(normalized) < 20:
            continue
        if normalized in seen_lines:
            duplicate_claims.append(line.strip())
        else:
            seen_lines.add(normalized)
            normalized_lines.append(normalized)

    if duplicate_claims:
        # Just let the score reduction handle it
        pass

    score = 100
    if placeholder_entities:
        score = min(score, 20)
    if _looks_like_raw_dump(combined):
        score = min(score, 20)
    if _is_context_drift(task_text, combined):
        score = min(score, 20)
    if any(item.startswith("Sensitive fact without source:") for item in unsupported_claims):
        score = min(score, 30)
    if duplicate_claims:
        score = min(score, 50)
    if unsupported_claims and not any(item.startswith("Sensitive fact without source:") for item in unsupported_claims):
        score = min(score, 60)
    if encoding_issues:
        score = min(score, 60)
    if not combined:
        score = 0

    approved = score >= 20
    return {
        "approved": approved,
        "score": score,
        "fail_reasons": fail_reasons,
        "must_fix": must_fix,
        "duplicate_claims": list(OrderedDict.fromkeys(duplicate_claims))[:10],
        "unsupported_claims": list(OrderedDict.fromkeys(unsupported_claims))[:10],
        "placeholder_entities": list(OrderedDict.fromkeys(placeholder_entities))[:10],
        "encoding_issues": encoding_issues,
    }


def report_text_from_output(output_data: Any) -> str:
    if not output_data:
        return ""
    if isinstance(output_data, dict):
        primary = output_data.get("data") or output_data.get("final") or output_data.get("raw_output") or output_data
    else:
        primary = output_data
    return _stringify_payload(primary)


def clean_report_text(text: str) -> str:
    cleaned = text.replace("■", "-").replace("\u25A0", "-")
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def dedupe_lines(text: str) -> str:
    lines = text.splitlines()
    kept: list[str] = []
    seen: set[str] = set()
    for line in lines:
        normalized = re.sub(r"\s+", " ", line).strip().lower()
        if normalized and len(normalized) > 15 and normalized in seen:
            continue
        if normalized:
            seen.add(normalized)
        kept.append(line)
    return "\n".join(kept).strip()


def filter_report_sections(text: str) -> tuple[str, list[str]]:
    excluded: list[str] = []
    kept_lines: list[str] = []
    for line in text.splitlines():
        lowered = line.lower()
        if any(re.search(pattern, lowered, re.IGNORECASE) for pattern in PLACEHOLDER_PATTERNS):
            excluded.append("Removed placeholder content.")
            continue
        if any(re.search(pattern, lowered, re.IGNORECASE) for pattern in GENERIC_FILLER_PATTERNS):
            excluded.append("Removed generic filler outside the requested scope.")
            continue
        if _looks_like_raw_dump(line):
            excluded.append("Removed raw JSON/code dump content.")
            continue
        kept_lines.append(line)
    return "\n".join(kept_lines).strip(), excluded


