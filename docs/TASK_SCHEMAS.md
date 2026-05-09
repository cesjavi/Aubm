# Task Output Schemas

Aubm now applies lightweight task-schema validation before approval and final reporting.

The backend classifies tasks by title, description, and project context. When a task matches one of the structured categories, the agent prompt asks for valid JSON and `quality_review.schema_review` records validation results.

## Schema Types

### `factual_research`

Used for research, market, pricing, revenue, release, source, evidence, and audit tasks.

Required fields:

- `summary`
- `findings`

Expected shape:

```json
{
  "summary": "string",
  "findings": [
    {
      "claim": "string",
      "source_url": "string or null",
      "confidence": "low | medium | high"
    }
  ],
  "unknowns": ["string"]
}
```

### `comparison`

Used for competitor, comparison, matrix, benchmark, and SWOT tasks.

Required fields:

- `summary`
- `entities`

Expected shape:

```json
{
  "summary": "string",
  "entities": [
    {
      "name": "string",
      "category": "string",
      "strengths": ["string"],
      "weaknesses": ["string"],
      "source_url": "string or null"
    }
  ],
  "differentiators": ["string"],
  "gaps": ["string"]
}
```

### `roadmap`

Used for roadmap, recommendation, priority, timeline, and planning tasks.

Required fields:

- `summary`
- `recommendations`

### `workflow_design`

Used for workflow, process, design, architecture, implementation, and controls tasks.

Required fields:

- `summary`
- `steps`

## Approval Behavior

If a structured task does not return JSON matching its required top-level fields, approval is blocked by the existing task quality gate.

For `factual_research` and `comparison`, each finding/entity should include a valid `source_url`. Missing source URLs block approval because those outputs are used for evidence-sensitive reporting.

Structured findings, comparison entities, recommendations, and risks are extracted into `public.task_claims` when `database/add_task_claims.sql` has been applied. If that table is missing, task execution continues and the backend logs a warning.

Extracted claims include:

- `entity_key`: a normalized ASCII/lowercase key for entity matching.
- `claim_hash`: a normalized per-project hash for duplicate suppression.

When `database/add_entity_aliases.sql` has been applied, `project_entity_aliases` can map multiple normalized aliases to one canonical `entity_key` before claim hashes are calculated. This improves deduplication for equivalent entity names such as legal suffix variants.

Final reports include an evidence summary when normalized claims are available: claim counts, sourced claim counts, source coverage, entity coverage, and sourced claim excerpts. The same normalized evidence is available through `GET /projects/{project_id}/evidence`. The remaining roadmap step is claim-only report generation for evidence-sensitive sections.
