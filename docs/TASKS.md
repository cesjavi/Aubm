# Aubm Implementation Tasks

This file tracks implementation work against [ROADMAP.md](../ROADMAP.md) and [SPEC.md](../SPEC.md). Status is conservative.

Legend:

- `[x]` Completed
- `[/]` Partial or in progress
- `[ ]` Pending

## Completed Foundation

- [x] Create backend, frontend, and database directories.
- [x] Implement FastAPI backend entrypoint.
- [x] Implement React/Vite frontend shell.
- [x] Add Supabase Auth integration.
- [x] Add baseline Supabase schema and RLS policies.
- [x] Implement provider-based agent factory.
- [x] Implement project dashboard.
- [x] Implement project detail task list and task forms.
- [x] Implement task approval and rejection.
- [x] Implement final report, brief, pessimistic analysis, and PDF export.
- [x] Implement completed-project locking in frontend and backend mutation endpoints.

## Product Workflow

- [x] Add Guided and Expert UI modes.
- [x] Add project creation wizard for Guided mode.
- [x] Add project creation wizard for Expert mode.
- [x] Add project source inputs: links, notes, and file references.
- [x] Add dashboard search, filters, and sorting.
- [x] Add project roadmap modal inferred from tasks.
- [x] Add retry handling for failed/error-output tasks.
- [x] Add legal example projects.
- [x] Add dashboard card alignment fixes.

## Agents and Marketplace

- [x] Add custom agent management UI.
- [x] Add marketplace table and seed templates.
- [x] Add marketplace search and deploy flow.
- [x] Prevent duplicate template deploys per user where possible.
- [x] Add default agents flow.
- [ ] Add richer marketplace categories, filters, and template detail pages.

## Security and Roles

- [x] Add profile roles: `user`, `manager`, `admin`.
- [x] Add admin user management support for manager role.
- [x] Hide Google/GitHub auth buttons in the current login UI.
- [x] Fix recursive profile admin policies with SECURITY DEFINER helper.
- [x] Add final profile RLS hardening with owner/admin policies and role-protection trigger.
- [/] Expand audit logging coverage across all LLM and workflow events.
- [x] Add audit events for task run, queue, retry, approval, debate, decomposition, and report generation paths.
- [x] Add audit trigger migration for direct project, task, agent, and profile mutations.
- [ ] Move direct frontend mutations behind backend APIs where stricter authorization or validation is required.
- [x] Add team permission migration with teams, team members, project team ownership, and project/task RLS helpers.
- [x] Extend team permission migration to make `task_claims` visible through project access when the evidence table exists.
- [ ] Add team management UI and team-aware project assignment flows.
- [x] Define enterprise auth policy before exposing OAuth buttons again.
- [ ] Replace broad team/security claims with tested team membership flows.

## Queue and Scale

- [x] Add `backend/worker.py` scaffold.
- [x] Add `backend/services/task_queue.py`.
- [x] Add `queued` status support to `tasks`.
- [x] Add `database/add_task_queued_status.sql`.
- [x] Add queue leasing metadata and `claim_next_queued_task`.
- [x] Update worker to use atomic task claiming.
- [x] Add worker heartbeat table and monitoring counts.
- [x] Show queued, running, active workers, and stale leases in Monitoring.
- [x] Add retry delay/backoff with `next_attempt_at`.
- [x] Show delayed retries in Monitoring.
- [x] Add queue execution mode to task and project run endpoints.
- [x] Start an embedded worker from FastAPI when queue mode is enabled.
- [x] Store queue attempts and terminal failure reason.
- [ ] Make queue execution the default after worker retry/backoff is hardened.

## Data Quality and Evidence

- [x] Add heuristic output guardrails.
- [x] Add final-report filtering for low-quality or placeholder sections.
- [/] Require source URLs heuristically for sensitive factual claims.
- [/] Add strict JSON task schemas per task type.
- [x] Add task schema classifier, prompt instructions, and approval gate for structured outputs.
- [x] Add claim table or normalized evidence model.
- [/] Add mandatory `source_url` for competitor, pricing, benchmark, release, market, and revenue claims.
- [x] Extract structured findings/entities into `task_claims`.
- [/] Add entity normalization and alias merging.
- [x] Add normalized `entity_key` for extracted task claims.
- [x] Add project-scoped entity alias table and canonicalize extracted claim entity keys before hashing.
- [ ] Add alias management UX/API and curated competitor taxonomy.
- [/] Add semantic deduplication.
- [x] Add normalized claim hashes to dedupe repeated extracted claims per project.
- [/] Build evidence-aware final report from validated claims only.
- [x] Add normalized evidence summary to final reports from `task_claims`.
- [x] Add project evidence API with normalized claims, source coverage, and entity/type summaries.

## Intelligence and Memory

- [x] Add project budget and usage tables.
- [x] Add budget service with estimated token/cost accounting and pre-run blocking.
- [x] Add project budget API endpoints.
- [x] Prevent queued budget-blocked tasks from retrying as transient worker failures.
- [ ] Replace estimated usage with provider-native token usage where available.
- [ ] Add billing-grade pricing reconciliation.
- [x] Add backend SSE stream for agent logs.
- [x] Connect Agent Console to backend SSE stream with Supabase polling/realtime fallback.
- [x] Add project/task-scoped log stream filtering.
- [x] Add auth-aware log stream subscriptions.

## Documentation

- [x] Update ROADMAP.md with conservative status.
- [x] Update README.md.
- [x] Update SPEC.md.
- [x] Update operating guide.
- [x] Update task tracker.
- [x] Add a migration guide for existing Supabase projects.
- [x] Add enterprise authentication model documentation.
- [ ] Add API endpoint reference.
