# Aubm Roadmap

This document tracks the practical evolution of Aubm from a working multi-agent orchestrator into an enterprise-ready operating layer. Status is intentionally conservative:

- Completed: implemented and visible in the product or backend.
- Partial: scaffolded or implemented in a limited form, but not production-complete.
- Next: planned work with no complete implementation yet.

## Phase 1: Core Foundation (Completed)
- [x] Autonomous Agent Execution: Multi-provider support for configured LLM providers.
- [x] Project Orchestration: Project-level task execution with dependency-aware planning support.
- [x] Human-in-the-Loop: Approval and rejection workflows for agent outputs.
- [x] Project Context Injection: Project descriptions, context, notes, files, and links are passed into planning/execution.
- [x] Final Reporting: Full, brief, pessimistic, and PDF report flows.

## Phase 2: Collaboration and Operator Workflow (Completed)
- [x] Multi-Agent Debates: Agents can cross-review and refine task output before human review.
- [x] Agent Marketplace: Deploy reusable agent templates into a user's workspace.
- [x] Voice Interaction: Browser voice APIs can control navigation and read project/task status.
- [x] Spatial Dashboard: Layered project/task visualization for DAG-style inspection.
- [x] Guided and Expert Creation Wizard: Step-by-step project creation with explanations.
- [x] Project Roadmap View: Read-only roadmap modal inferred from task status, priority, and dependencies.

## Phase 3: Production Operations (Completed)
- [x] Operations Monitoring: Backend health endpoint and frontend monitoring dashboard with Supabase fallback.
- [x] Deployment Hardening: Dockerized backend/runtime profile and production CORS configuration.
- [x] Error Tracking Hooks: Sentry-compatible backend and frontend initialization.
- [x] Performance Budgeting: Frontend code splitting and bundle-size-aware build output.
- [x] Completed Project Locking: Completed projects are read-only in the UI and guarded by backend mutation checks.

## Phase 4: Security, Governance, and Data Quality (Partial)
- [x] Row-Level Security: Core Supabase RLS policies for projects, tasks, agents, profiles, marketplace templates, and admin access.
- [x] Admin and Manager Roles: Profile role support includes user, manager, and admin.
- [x] Profile Role Protection: Final profile RLS migration uses non-recursive admin checks and a trigger to block non-admin role escalation.
- [x] Audit Log Schema: Audit table and service exist.
- [/] Audit Log Coverage: Backend task runs, queue retries, approvals, debates, decomposition, and report generation write audit events; a trigger migration covers direct project, task, agent, and profile mutations.
- [/] Team Permissions: `teams`, `team_members`, project `team_id`, owner-or-team RLS policies, and team-aware evidence reads are available through migration; frontend/backend workflows still need full team-aware UX/API coverage.
- [x] SSO State: Google/GitHub buttons remain hidden by default, and the enterprise auth model is documented in `docs/AUTH_MODEL.md`.

## Phase 5: Async Execution and Scale (Complete)
- [x] Worker Scaffold: `backend/worker.py` and `TaskQueueService` exist.
- [x] Queued Task Status: `tasks.status` now supports `queued` for background workers.
- [x] Queue Safety: Workers claim queued tasks through an atomic Postgres lease function.
- [x] Worker Observability: Worker heartbeats, queue depth, stale leases, and active worker counts are visible in Monitoring.
- [x] Retry Policy: Queue attempts, exponential backoff, delayed retries, and terminal failure reasons are stored.
- [x] Worker Integration: Task and project run endpoints can route work to the queue with `TASK_EXECUTION_MODE=queue` or `use_queue=true`.
- [x] Queue Default: Sync execution is now fallback; queue mode is default in development and production.

## Phase 6: Evidence and Entity Integrity (Complete)
- [x] Strict JSON Task Schemas: Backend classifies structured task types, prompts for JSON, and blocks approval when required fields are missing.
- [x] Semantic Deduplication: Extracted claims use normalized text hashes and embedding-based semantic merging to avoid duplicates per project.
- [x] Mandatory `source_url` per Claim: Structured factual/comparison outputs require source URLs and extracted claims are stored in `task_claims`; approval is blocked if sources are missing for sensitive schemas.
- [x] Entity Normalization Layer: `task_claims` stores normalized `entity_key` values; new `EvidenceView` component provides a unified UI for semantic findings and entity intelligence.
- [x] Evidence-Aware Final Report: Final reports now consume consolidated claims from `task_claims` using semantic merging for high-accuracy strategic conclusions.

## Phase 7: Intelligence and Memory (Next)
- [x] Vectorized Long-Term Memory: Cross-project semantic retrieval over approved outputs and source material; implemented via `project_memory` and `match_project_memory` RPC.
- [x] Self-Optimizing Agents: Meta-prompting loops based on human feedback and task quality outcomes; rejections trigger intelligent analysis to generate 'Lessons Learned' for retries.
- [x] Cost Control: Project budgets, estimated usage events, and pre-run execution blocking are implemented; provider-native token usage tracking ensures billing-grade pricing reconciliation.
- [x] Real-Time Logs: Backend SSE stream for `agent_logs`, frontend console integration, project/task stream filters, and Supabase-token authorization are implemented.
- [x] Collaborative Editing: Manual output editing and human review sessions for generated outputs; implemented via `PATCH /tasks/{id}/output`.

## Phase 8: Enterprise Multi-Tenancy & Governance (Complete)
- [x] Team Management UI: Full interface for creating teams, inviting members, and assigning roles (admin, editor, viewer).
- [x] Team-Aware Project Creation: Select team workspaces during project setup to enable shared context and RLS-enforced collaboration.
- [x] Audit Explorer: Searchable and filterable UI for system-wide audit logs, including metadata inspection and deep links.
- [x] Bulk Audit Export: Download audit logs as CSV for compliance and external reporting.
- [x] Role-Based Marketplace: Teams can publish and share internal agent templates within their own workspace; implemented via `team_id` on templates and AgentsView sharing.

---

*Last updated: May 7, 2026*
