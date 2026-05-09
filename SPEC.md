# Aubm Technical Specification

Target stack: FastAPI + React/TypeScript + Supabase.

This document describes the current product architecture and the contracts that matter for development. For status and sequencing, see [ROADMAP.md](./ROADMAP.md).

## 1. Architecture

Aubm uses Supabase as the source of truth for users, projects, agents, tasks, templates, and execution records.

```text
backend/
  main.py                    FastAPI entrypoint
  worker.py                  Polling worker scaffold for queued tasks
  agents/                    LLM provider adapters
  routers/
    agent_runner.py          Task run, approve, reject, approve-all
    orchestrator.py          Debate, project run, report, PDF export
  services/
    orchestrator_service.py  Project orchestration and report building
    agent_runner_service.py  Task execution and task_runs persistence
    task_queue.py            Lightweight queued-task helper
    output_quality.py        Heuristic output quality checks
    semantic_backprop.py     Prior completed-output context builder
  tools/                     Tool registry and tool implementations

frontend/
  src/components/            Dashboard, project detail, marketplace, settings, monitoring
  src/services/              Supabase, runtime config, LLM defaults, UI mode
  src/context/               Auth context

database/
  schema.sql                 Baseline schema
  *.sql                      Idempotent migrations and seed files
```

## 2. Database

### Core Tables

| Table | Purpose |
| --- | --- |
| `profiles` | User metadata and role: `user`, `manager`, `admin`. |
| `projects` | Project containers with owner, context, status, visibility. |
| `agents` | Deployed agents owned by users or global templates. |
| `agent_templates` | Marketplace agent templates. |
| `tasks` | Units of work with status, priority, assigned agent, output data. |
| `task_runs` | Execution history, status, errors, duration. |
| `agent_logs` | Execution traces. |
| `task_dependencies` | Task dependency edges. |
| `audit_logs` | Governance trail. Coverage is partial and should be expanded. |
| `task_feedback` | Like/dislike feedback for future optimization. |
| `worker_heartbeats` | Background worker status and processing counters. |

### Status Values

Projects:

```text
active, archived, completed
```

Tasks:

```text
todo, queued, in_progress, awaiting_approval, done, failed, cancelled
```

Task runs:

```text
queued, running, completed, failed, cancelled
```

Completed projects are locked by frontend controls and backend mutation checks. Reports remain available.

## 3. Backend Contracts

### Task Execution

`POST /tasks/{task_id}/run`

Optional query:

```text
use_queue=true
```

1. Load task and assigned agent.
2. Reject execution if the parent project is completed.
3. If `use_queue=true` or `TASK_EXECUTION_MODE=queue`, set task to `queued` for worker execution.
4. Otherwise set task to `in_progress` and execute through `AgentRunnerService`.
5. Write `task_runs`, `agent_logs`, and task output.
6. Set task to `awaiting_approval` or `failed`.

### Task Review

```text
POST /tasks/{task_id}/approve
POST /tasks/{task_id}/reject
POST /tasks/project/{project_id}/approve-all
```

Approval runs output quality checks before moving a task to `done`. Rejection moves the task back to `todo`. These mutations are blocked when the project is completed.

### Project Orchestration

`POST /orchestrator/projects/{project_id}/run`

Runs `todo` and `failed` tasks in priority order and assigns available agents when needed. If the project has no tasks, it can decompose the project into tasks. Completed projects are not mutable and cannot be orchestrated again.

Queue mode:

- `TASK_EXECUTION_MODE=queue`, or
- `POST /orchestrator/projects/{project_id}/run?use_queue=true`

In queue mode, runnable tasks are assigned and moved to `queued` for `backend/worker.py`.

### Reports

```text
GET /orchestrator/projects/{project_id}/final-report?variant=full|brief|pessimistic
GET /orchestrator/projects/{project_id}/final-report.pdf?variant=full|brief|pessimistic
```

Reports are built from approved task output. Full report generation marks the project completed.

### Queue Worker

`backend/worker.py` polls `tasks.status = 'queued'` through `TaskQueueService`.

Current state:

- Worker scaffold exists.
- `queued` task status is supported by schema/migration.
- Task and project run endpoints can opt into queue mode.
- Workers claim tasks through `claim_next_queued_task`, an atomic Postgres function using `FOR UPDATE SKIP LOCKED`.
- Queue attempts, delayed retry time, and terminal failure text are stored on `tasks`.
- Worker heartbeat, active worker count, queue depth, delayed retry count, and stale lease metrics are exposed in Monitoring.

## 4. Frontend

### Primary Views

- Dashboard: project cards, search, filters, status/progress sorting.
- New Project: wizard available in Guided and Expert modes.
- Project Detail: task management, guided workflow, reports, roadmap modal.
- Marketplace: agent template search and deploy.
- Agents: custom agent management.
- Debate: two-agent review flow.
- Monitoring: backend-first health summary with Supabase fallback.
- Voice Control: browser speech navigation/status.
- Spatial View: DAG-style task visualization.
- Settings: provider defaults, UI mode, user role management.

### UI Modes

Guided:

- Simplified navigation and workflows.
- Project wizard steps: Basics, Context, Sources, Review.

Expert:

- Advanced tools and settings.
- Project wizard steps: Basics, Context, Sources, Access, Review.

## 5. Security

- Supabase Auth is used for authentication.
- Email/password is the visible login method in the current UI.
- Google/GitHub OAuth buttons are hidden. If OAuth is enabled in Supabase, follow `docs/AUTH_MODEL.md` before exposing OAuth buttons again.
- RLS policies protect project ownership, tasks, agents, templates, and profiles.
- Admin profile checks use a SECURITY DEFINER helper to avoid recursive RLS policies.
- Manager role is supported in profile constraints and admin tooling.

## 6. Current Gaps

- Audit log coverage is incomplete.
- Real-time logs are persisted, but true SSE/WebSocket streaming is not complete.
- Cost control exists only as provider token configuration, not persisted budget enforcement.
- Structured task schemas and `task_claims` evidence extraction exist for common task types. Extracted claims include normalized entity keys and claim hashes. Final reports include normalized evidence summaries, but they are not yet built exclusively from normalized evidence.
- Worker queue has atomic leasing, retry backoff, and heartbeat monitoring. Queue mode remains opt-in until it is made the default execution path.

## 7. Validation

Frontend:

```powershell
cd frontend
npm run lint
npm run build
```

Backend syntax spot checks:

```powershell
python -m py_compile backend\worker.py backend\services\task_queue.py
python -m py_compile backend\routers\agent_runner.py backend\routers\orchestrator.py
```
