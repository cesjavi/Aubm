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
- [x] Audit Log Schema: Audit table and service exist.
- [/] Audit Log Coverage: Backend task runs, queue retries, approvals, debates, decomposition, and report generation write audit events; a trigger migration covers direct project, task, agent, and profile mutations.
- [ ] Team Permissions: Replace broad owner/admin assumptions with explicit workspace/team membership where needed.
- [ ] SSO State: Supabase may support OAuth externally, but Google/GitHub buttons are hidden in the UI; document the intended enterprise auth model before marking complete.

## Phase 5: Async Execution and Scale (In Progress)
- [x] Worker Scaffold: `backend/worker.py` and `TaskQueueService` exist.
- [x] Queued Task Status: `tasks.status` now supports `queued` for background workers.
- [x] Queue Safety: Workers claim queued tasks through an atomic Postgres lease function.
- [x] Worker Observability: Worker heartbeats, queue depth, stale leases, and active worker counts are visible in Monitoring.
- [x] Retry Policy: Queue attempts, exponential backoff, delayed retries, and terminal failure reasons are stored.
- [x] Worker Integration: Task and project run endpoints can route work to the queue with `TASK_EXECUTION_MODE=queue` or `use_queue=true`; queue mode starts an embedded worker by default and also supports standalone workers.
- [ ] Queue Default: Make queue execution the default after a longer soak period in development and deployed environments.

## Phase 6: Evidence and Entity Integrity (Next)
- [ ] Strict JSON Task Schemas: Enforce structured outputs per task type instead of free-form text.
- [ ] Mandatory `source_url` per Claim: Require evidence links for competitor, pricing, release, benchmark, and market claims.
- [ ] Entity Normalization Layer: Canonicalize entity names, merge aliases, and separate direct competitors from adjacent tools before final reporting.
- [ ] Semantic Deduplication: Collapse equivalent claims written differently across tasks.
- [ ] Evidence-Aware Final Report: Build the final report from normalized entities and validated claims only.

## Phase 7: Intelligence and Memory (Next)
- [ ] Vectorized Long-Term Memory: Cross-project semantic retrieval over approved outputs and source material.
- [ ] Self-Optimizing Agents: Meta-prompting loops based on human feedback and task quality outcomes.
- [ ] Cost Control: Persist token/cost budgets per project and block execution when limits are exceeded.
- [ ] Real-Time Logs: Add a true SSE/WebSocket log stream for agent execution events.
- [ ] Collaborative Editing: Add shared human editing/review sessions for generated outputs.

---

*Last updated: May 7, 2026*
