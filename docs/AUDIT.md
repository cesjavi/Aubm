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

Execution logs are persisted to `agent_logs`, but true SSE/WebSocket streaming is not implemented end to end.

### Cost Control

Provider token settings exist, but persistent per-project budgets and execution blocking are not implemented.

### SSO

Supabase can support OAuth externally, but Google/GitHub buttons are intentionally hidden in the current UI. Do not describe SSO as a complete product feature until the intended enterprise auth model is documented and tested.

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
database/add_profile_manager_role.sql
database/fix_profiles_recursion.sql
database/marketplace.sql
```

## Recommended Next Work

1. Expand audit logging coverage.
2. Add strict task output schemas.
3. Add evidence/source normalization before final reports.
4. Add endpoint-level tests for completed-project locking.
5. Promote queue execution to the default after soak testing.

## Verdict

Aubm is usable for supervised multi-agent project workflows, but it should not be described as fully enterprise-ready until queue safety, audit coverage, evidence integrity, and auth policy are hardened.
