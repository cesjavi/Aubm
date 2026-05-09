# Aubm Stability Audit

Date: May 7, 2026

Status: Functional prototype with production hardening in progress.

This audit intentionally uses conservative wording. Earlier docs overstated several capabilities as complete when they were scaffolded or partial.

## Architecture

The system uses:

- FastAPI backend with provider-specific agent adapters.
- React/Vite frontend.
- Supabase for auth, Postgres data, RLS, and direct frontend reads.
- Queue worker support through either an embedded FastAPI worker or standalone worker processes.

## Stable Areas

- Project dashboard with search, filters, sorting, and progress cards.
- Project creation wizard in Guided and Expert modes.
- Agent marketplace template deployment.
- Custom agent creation.
- Task creation, assignment, dependencies, review, approval, rejection, and retry.
- Final report variants and PDF export.
- Completed project locking in the UI and backend mutation routes.
- Monitoring summary endpoint with frontend fallback.
- Sentry-compatible backend and frontend initialization.

## Partial Areas

### Audit Logging

`audit_logs` schema and service exist, but coverage is not complete. The system should log every:

- LLM call.
- Task status mutation.
- Approval/rejection.
- Retry.
- Report generation.
- Marketplace deployment.
- Admin role change.

Current backend coverage includes task run creation, status transitions during agent execution, queue retry/terminal failure, task approval/rejection, debate start/completion/failure, project queueing, decomposition, and final report generation. The `database/add_audit_mutation_triggers.sql` migration adds table-level coverage for direct project, task, agent, and profile mutations. Remaining risk is that trigger metadata is intentionally compact; high-risk flows should still move behind backend APIs for stricter validation and richer audit context.

### Async Worker

`backend/worker.py` and `TaskQueueService` exist. The task schema supports `queued`, workers claim tasks through an atomic Postgres lease function, retry with exponential backoff, and report worker heartbeat metrics in Monitoring. Queue mode can start an embedded worker from FastAPI or use standalone worker processes.

Remaining risk:

- Queue mode is implemented but still opt-in through `TASK_EXECUTION_MODE=queue` or `use_queue=true`; direct execution remains the default for local development.

### Real-Time Logs

Execution logs are persisted to `agent_logs`. `GET /tasks/logs/stream` exposes a backend Server-Sent Events stream, requires a Supabase access token, supports optional `project_id` or `task_id` filters, and only returns logs for projects visible to the authenticated user. The Agent Console uses it when `VITE_API_URL` is configured, falling back to Supabase polling/realtime otherwise. Remaining risk: EventSource sends the token as a query parameter because browser EventSource cannot set custom headers; deploy behind HTTPS and avoid logging query strings.

### Cost Control

Project budget tables and estimated usage events are implemented. `AgentRunnerService` estimates prompt/completion tokens, blocks execution before the provider call when configured project budgets would be exceeded, and records estimated usage after successful runs. Budget status is available through `GET /projects/{project_id}/budget`, and budgets can be configured through `PUT /projects/{project_id}/budget`. Remaining risk: usage is estimated locally and pricing is only applied when `app_config.model_pricing` is configured, so this is not billing-grade reconciliation.

### Structured Task Schemas

`backend/services/task_schemas.py` classifies common factual, comparison, roadmap, and workflow tasks. Matching tasks receive JSON-schema-like prompt instructions, and approval is blocked when required top-level fields are missing. `backend/services/evidence_service.py` extracts structured findings and entities into `task_claims` when the claim migration exists. Extracted claims include normalized entity keys and per-project claim hashes for duplicate suppression. When `project_entity_aliases` exists, aliases are applied before hash generation so equivalent entity names can dedupe to one canonical key.

Final reports now include an evidence summary from `task_claims`: normalized claim count, sourced claim count, source coverage, entity coverage, and sourced claims. `GET /projects/{project_id}/evidence` exposes the same normalized claims and summaries for inspection. Remaining risk: reports still also render curated task output. They do not yet require every included factual statement to come from `task_claims`, and alias merging is still heuristic rather than curated.

### SSO

Supabase can support OAuth externally, but Google/GitHub buttons are intentionally hidden in the current UI. The intended enterprise auth model is documented in [AUTH_MODEL.md](./AUTH_MODEL.md). Do not describe Google/GitHub SSO as enabled until a deployment explicitly configures providers and verifies redirects, role defaults, profile creation, and audit behavior.

## Database Risks

- Existing Supabase projects must apply migrations, not only `schema.sql`.
- PostgREST schema cache must be reloaded after schema changes.
- Some RLS files are layered; setup order matters.
- `task_dependencies` must exist for persistent dependency links.

## Required Existing-Project Migrations

Common migrations:

```text
database/add_task_run_duration.sql
database/add_task_queued_status.sql
database/add_task_queue_leasing.sql
database/add_task_queue_retry_backoff.sql
database/add_worker_heartbeats.sql
database/add_audit_mutation_triggers.sql
database/add_task_claims.sql
database/add_entity_aliases.sql
database/add_profile_manager_role.sql
database/fix_profiles_rls_final.sql
database/fix_profiles_recursion.sql
database/add_team_permissions.sql
database/marketplace.sql
```

## Recommended Next Work

1. Add team management UI and team-aware API paths.
2. Add explicit OAuth UI gates if Google/GitHub sign-in is reintroduced.
3. Expand audit logging coverage.
4. Move final reports toward claim-only generation for evidence-sensitive sections.
5. Add alias management UX/API, curated competitor taxonomy, and source normalization.
6. Add endpoint-level tests for completed-project locking.
7. Promote queue execution to the default after soak testing.

## Verdict

Aubm is usable for supervised multi-agent project workflows, but it should not be described as fully enterprise-ready until queue safety, audit coverage, evidence integrity, and auth policy are hardened.
