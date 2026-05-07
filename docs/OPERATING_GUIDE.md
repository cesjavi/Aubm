# Aubm Operating Guide

## What Aubm Does

Aubm is an AI agent orchestration platform. Users sign in with Supabase Auth, create projects, provide context and sources, deploy or configure agents, run task workflows, review outputs, and produce reports.

The application has three main layers:

- `frontend/`: React + Vite dashboard for projects, marketplace, agents, debates, voice control, spatial view, monitoring, and settings.
- `backend/`: FastAPI API for task execution, project orchestration, report generation, debate orchestration, worker support, and monitoring.
- `database/`: Supabase schema, RLS policies, marketplace tables, audit tables, task dependencies, and migrations.

## Core Runtime Flow

1. User signs in with Supabase Auth.
2. User creates a project through the Guided or Expert wizard.
3. User optionally adds links, notes, or files as project context.
4. User deploys or creates agents.
5. User creates tasks manually or runs project orchestration to decompose the project.
6. Backend executes tasks through assigned agents.
7. Task output moves to `awaiting_approval`.
8. Human approves, rejects, retries, or reviews output.
9. Once tasks are approved, reports can be generated.
10. Full report generation marks the project `completed`; completed projects become read-only.

## UI Modes

Guided mode:

- Focused workflow.
- Project creation wizard: Basics, Context, Sources, Review.
- Guided project detail panel for agents, plan, review, and finalize.

Expert mode:

- Full navigation.
- Project creation wizard: Basics, Context, Sources, Access, Review.
- Advanced controls for dependencies, assignments, debate, voice, spatial view, monitoring, and settings.

## Main Features

### Dashboard

Shows project cards with status and task progress. Includes search, status filter, progress filter, sorting, refresh, and project deletion.

### Project Detail

Supports:

- Default agent generation.
- Manual task creation and editing.
- Agent assignment.
- Task dependency selection.
- Task filtering by status, including `queued`.
- Review, approve, reject, retry, and final report flows.
- Roadmap modal inferred from task status, priority, and dependencies.
- Read-only mode when the project is completed.

### Agent Marketplace

Reads `agent_templates` from Supabase and deploys selected templates into `agents`.

Required database support:

- `database/marketplace.sql`
- `database/agent_ownership.sql`

### Custom Agents

The `Agents` screen lets users create custom agents with name, role, provider, model, and system prompt. API keys stay in `backend/.env`, not in the frontend.

### Agent Debate

Endpoint:

```text
POST /orchestrator/debate
```

Flow:

1. Agent A generates an initial answer.
2. Agent B critiques it.
3. Agent A refines it.
4. Final debate result is saved to `tasks.output_data`.

### Monitoring

Endpoint:

```text
GET /monitoring/summary
```

The frontend falls back to direct Supabase counts if the backend endpoint is unavailable.

### Worker

The worker scaffold exists:

```powershell
cd backend
python worker.py
```

Existing databases must apply:

```sql
-- database/add_task_queued_status.sql
-- database/add_task_queue_leasing.sql
-- database/add_task_queue_retry_backoff.sql
-- database/add_worker_heartbeats.sql
```

To use the worker for task/project execution:

```env
TASK_EXECUTION_MODE=queue
```

By default, queue mode starts an embedded worker inside the FastAPI process:

```env
TASK_QUEUE_EMBEDDED_WORKER=true
```

For separate worker processes, disable the embedded worker and run `python worker.py` independently.

Or opt in per request:

```text
POST /tasks/{task_id}/run?use_queue=true
POST /orchestrator/projects/{project_id}/run?use_queue=true
```

## Backend Setup

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Required `backend/.env` values:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional provider and monitoring values:

```env
OPENAI_API_KEY=...
GROQ_API_KEY=...
GEMINI_API_KEY=...
AMD_API_KEY=...
TAVILY_API_KEY=...
SENTRY_DSN=...
```

## Frontend Setup

```powershell
cd frontend
npm install
npm run dev
```

Required `frontend/.env` values:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=http://127.0.0.1:8000
```

## Database Setup Order

Fresh project:

1. `database/schema.sql`
2. `database/seed.sql`
3. `database/phase3_updates.sql`
4. `database/marketplace.sql`
5. `database/enterprise_security.sql`
6. `database/agent_ownership.sql`
7. `database/task_owner_policies.sql`
8. `database/default_agents.sql`

Common existing-project migrations:

- `database/add_task_run_duration.sql`
- `database/add_task_queued_status.sql`
- `database/add_task_queue_leasing.sql`
- `database/add_task_queue_retry_backoff.sql`
- `database/add_worker_heartbeats.sql`
- `database/add_audit_mutation_triggers.sql`
- `database/add_profile_manager_role.sql`
- `database/fix_profiles_recursion.sql`

For a guided checklist, see [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md).

## Common Errors

### `Could not find the 'duration_seconds' column of 'task_runs' in the schema cache`

Apply:

```sql
-- database/add_task_run_duration.sql
```

### `new row for relation "tasks" violates check constraint`

If the value is `queued`, apply:

```sql
-- database/add_task_queued_status.sql
```

If the worker cannot find `claim_next_queued_task`, also apply:

```sql
-- database/add_task_queue_leasing.sql
```

If Monitoring cannot read worker heartbeat data, apply:

```sql
-- database/add_worker_heartbeats.sql
```

### Marketplace shows no templates

Apply:

```sql
-- database/marketplace.sql
```

### Recursive profiles policy error

Apply:

```sql
-- database/fix_profiles_recursion.sql
```

## Development Rules

- Keep application UI text in English.
- Keep technical documentation in English.
- Keep migrations idempotent when possible.
- Do not commit real secrets.
- Prefer separate migration files for database changes.
