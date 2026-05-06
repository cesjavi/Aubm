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
    task_text = f"{task.get('title', '')}\n{task.get('description', '')}".lower()
    strict_mode = any(re.search(pattern, task_text, re.IGNORECASE) for pattern in STRICT_TASK_PATTERNS)

    base = [
        "Output quality rules:",
        "- Never use placeholder names like Competitor A, Dashboard B, Product C, or Our Company.",
        "- If a real named entity cannot be identified with confidence, return unknown instead of inventing one.",
        "- Keep the output strictly within the requested scope.",
        "- Do not include generic filler sections that were not requested.",
        "- Use clean UTF-8/ASCII friendly text. Do not output corrupted characters.",
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


def validate_output(task: dict, result: dict) -> dict:
    raw_text = _stringify_payload(result.get("raw_output"))
    data_text = _stringify_payload(result.get("data"))
    combined = "\n".join(part for part in [raw_text, data_text] if part).strip()

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
        fail_reasons.append("Output contains placeholder or invented entity names.")
        must_fix.append("Replace placeholders with real named entities or unknown.")

    if "■" in combined:
        encoding_issues.append("Found corrupted character '■'.")

    if encoding_issues:
        fail_reasons.append("Output contains encoding corruption.")
        must_fix.append("Remove corrupted characters and normalize text encoding.")

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
        fail_reasons.append("Output contains sensitive factual claims without source URLs.")
        must_fix.append("Add source_url for pricing, revenue, market share, version, or benchmark claims.")

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
        fail_reasons.append("Output contains duplicated claims or repeated sections.")
        must_fix.append("Remove repeated claims and consolidate overlapping sections.")

    score = 100
    if placeholder_entities:
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

    approved = score >= 80 and not fail_reasons
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
    cleaned = text.replace("■", "-")
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
            excluded.append(line.strip())
            continue
        if any(re.search(pattern, lowered, re.IGNORECASE) for pattern in GENERIC_FILLER_PATTERNS):
            excluded.append(line.strip())
            continue
        kept_lines.append(line)
    return "\n".join(kept_lines).strip(), excluded
