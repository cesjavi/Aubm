import logging
import hashlib
import re
import unicodedata
from typing import Any

from services.task_schemas import parse_structured_payload

logger = logging.getLogger("evidence_service")


def _primary_payload(output_data: dict) -> Any:
    data = output_data.get("data")
    if data not in (None, "", [], {}):
        return parse_structured_payload(data) if isinstance(data, str) else data
    return parse_structured_payload(output_data.get("raw_output"))


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def normalize_entity_key(value: Any) -> str | None:
    text = _clean_text(value)
    if not text:
        return None
    normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    normalized = normalized.lower()
    normalized = re.sub(r"\b(inc|llc|ltd|corp|corporation|company|co|sa|s\.a\.)\b", "", normalized)
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized or None


def normalize_claim_text(value: Any) -> str:
    text = unicodedata.normalize("NFKD", _clean_text(value)).encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def claim_hash(
    project_id: str | None,
    claim_text: str,
    entity_name: str | None = None,
    entity_key: str | None = None,
) -> str:
    key = "|".join([
        project_id or "",
        entity_key or normalize_entity_key(entity_name) or "",
        normalize_claim_text(claim_text),
    ])
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _claim_row(
    *,
    project_id: str | None,
    task_id: str | None,
    claim_text: str,
    claim_type: str,
    entity_name: str | None = None,
    source_url: str | None = None,
    confidence: str = "unknown",
    metadata: dict | None = None,
    alias_map: dict[str, str] | None = None,
) -> dict:
    raw_entity_key = normalize_entity_key(entity_name)
    entity_key = (alias_map or {}).get(raw_entity_key or "", raw_entity_key)
    return {
        "project_id": project_id,
        "task_id": task_id,
        "claim_text": claim_text,
        "claim_type": claim_type,
        "entity_name": entity_name,
        "entity_key": entity_key,
        "claim_hash": claim_hash(project_id, claim_text, entity_name, entity_key),
        "source_url": source_url,
        "confidence": confidence,
        "metadata": metadata or {},
    }


class EvidenceService:
    @staticmethod
    def load_alias_map(project_id: str | None) -> dict[str, str]:
        if not project_id:
            return {}
        try:
            from services.supabase_service import supabase

            rows = (
                supabase.table("project_entity_aliases")
                .select("alias_key,canonical_key")
                .eq("project_id", project_id)
                .execute()
                .data
                or []
            )
        except Exception as exc:
            logger.warning("Could not load entity aliases for project %s: %s", project_id, exc)
            return {}

        aliases: dict[str, str] = {}
        for row in rows:
            alias_key = row.get("alias_key")
            canonical_key = row.get("canonical_key")
            if alias_key and canonical_key:
                aliases[alias_key] = canonical_key
        return aliases

    @staticmethod
    def load_project_claims(project_id: str) -> list[dict]:
        try:
            from services.supabase_service import supabase

            return (
                supabase.table("task_claims")
                .select("claim_text,claim_type,entity_name,entity_key,source_url,confidence,task_id,created_at")
                .eq("project_id", project_id)
                .order("created_at", desc=False)
                .execute()
                .data
                or []
            )
        except Exception as exc:
            logger.warning("Could not load task claims for project %s: %s", project_id, exc)
            return []

    @staticmethod
    def summarize_claims(claims: list[dict]) -> dict:
        by_type: dict[str, int] = {}
        by_entity: dict[str, int] = {}
        sourced_count = 0

        for claim in claims:
            claim_type = claim.get("claim_type") or "unknown"
            by_type[claim_type] = by_type.get(claim_type, 0) + 1

            entity = claim.get("entity_name") or claim.get("entity_key") or "Unassigned"
            by_entity[entity] = by_entity.get(entity, 0) + 1

            source_url = claim.get("source_url")
            if isinstance(source_url, str) and source_url.startswith(("http://", "https://")):
                sourced_count += 1

        total_count = len(claims)
        return {
            "claim_count": total_count,
            "sourced_claim_count": sourced_count,
            "unsourced_claim_count": max(total_count - sourced_count, 0),
            "source_coverage": round(sourced_count / total_count, 4) if total_count else 0,
            "by_type": dict(sorted(by_type.items())),
            "by_entity": dict(sorted(by_entity.items(), key=lambda item: item[1], reverse=True)),
        }

    @staticmethod
    def extract_claims(task: dict, output_data: dict) -> list[dict]:
        payload = _primary_payload(output_data)
        if not isinstance(payload, dict):
            return []

        project_id = task.get("project_id")
        task_id = task.get("id")
        alias_map = EvidenceService.load_alias_map(project_id)
        claims: list[dict] = []

        for finding in payload.get("findings") or []:
            if not isinstance(finding, dict):
                continue
            claim_text = _clean_text(finding.get("claim"))
            if not claim_text:
                continue
            claims.append(_claim_row(
                project_id=project_id,
                task_id=task_id,
                claim_text=claim_text,
                claim_type="finding",
                entity_name=_clean_text(finding.get("entity")) or None,
                source_url=_clean_text(finding.get("source_url")) or None,
                confidence=finding.get("confidence") if finding.get("confidence") in ("low", "medium", "high") else "unknown",
                metadata={"schema_source": "findings"},
                alias_map=alias_map,
            ))

        for entity in payload.get("entities") or []:
            if not isinstance(entity, dict):
                continue
            entity_name = _clean_text(entity.get("name"))
            source_url = _clean_text(entity.get("source_url")) or None
            for key, claim_type in (("strengths", "entity_strength"), ("weaknesses", "entity_weakness")):
                for item in entity.get(key) or []:
                    claim_text = _clean_text(item)
                    if not claim_text:
                        continue
                    claims.append(_claim_row(
                        project_id=project_id,
                        task_id=task_id,
                        claim_text=claim_text,
                        claim_type=claim_type,
                        entity_name=entity_name or None,
                        source_url=source_url,
                        confidence="unknown",
                        metadata={"schema_source": f"entities.{key}", "category": entity.get("category")},
                        alias_map=alias_map,
                    ))

        for recommendation in payload.get("recommendations") or []:
            if not isinstance(recommendation, dict):
                continue
            claim_text = _clean_text(recommendation.get("title") or recommendation.get("rationale"))
            if not claim_text:
                continue
            claims.append(_claim_row(
                project_id=project_id,
                task_id=task_id,
                claim_text=claim_text,
                claim_type="recommendation",
                metadata=recommendation,
            ))

        for risk in payload.get("risks") or []:
            claim_text = _clean_text(risk)
            if not claim_text:
                continue
            claims.append(_claim_row(
                project_id=project_id,
                task_id=task_id,
                claim_text=claim_text,
                claim_type="risk",
                metadata={"schema_source": "risks"},
            ))

        deduped: dict[str, dict] = {}
        for claim in claims:
            deduped.setdefault(claim["claim_hash"], claim)
        return list(deduped.values())

    @staticmethod
    async def replace_task_claims(task: dict, output_data: dict) -> int:
        task_id = task.get("id")
        if not task_id:
            return 0

        claims = EvidenceService.extract_claims(task, output_data)
        try:
            from services.supabase_service import supabase

            supabase.table("task_claims").delete().eq("task_id", task_id).execute()
            if claims:
                # Use insert since we already deleted by task_id and deduped claims in extract_claims.
                # This avoids 'there is no unique or exclusion constraint matching the ON CONFLICT specification' error.
                supabase.table("task_claims").insert(claims).execute()
            return len(claims)
        except Exception as exc:
            logger.warning("Could not persist task claims for %s: %s", task_id, exc)
            return 0

    @staticmethod
    async def merge_project_claims(project_id: str, threshold: float = 0.88) -> list[dict]:
        """
        Groups similar claims within a project and returns a consolidated set.
        """
        from services.embedding_service import embedding_service
        
        claims = EvidenceService.load_project_claims(project_id)
        if len(claims) < 2:
            return claims

        # Extract texts for embedding
        texts = [c["claim_text"] for c in claims]
        embeddings = await embedding_service.get_embeddings(texts)
        if not embeddings:
            return claims

        merged: list[dict] = []
        used_indices: set[int] = set()

        for i in range(len(claims)):
            if i in used_indices:
                continue
            
            base_claim = claims[i].copy()
            used_indices.add(i)
            
            # Look for matches in the rest of the claims
            for j in range(i + 1, len(claims)):
                if j in used_indices:
                    continue
                
                similarity = embedding_service.cosine_similarity(embeddings[i], embeddings[j])
                if similarity >= threshold:
                    used_indices.add(j)
                    # Merge logic: Append sources, keep longest text, etc.
                    other_claim = claims[j]
                    if len(other_claim["claim_text"]) > len(base_claim["claim_text"]):
                        base_claim["claim_text"] = other_claim["claim_text"]
                    
                    # Consolidate sources (metadata)
                    if other_claim.get("source_url") and not base_claim.get("source_url"):
                        base_claim["source_url"] = other_claim["source_url"]
                    
                    # Track that this claim was merged
                    if "merged_count" not in base_claim:
                        base_claim["merged_count"] = 1
                    base_claim["merged_count"] += 1

            merged.append(base_claim)

        return merged


evidence_service = EvidenceService()
