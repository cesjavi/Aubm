---
title: Aubm
sdk: docker
app_port: 7860
license: mit
short_description: Automated Business Machines
---

# Aubm

Enterprise-grade AI agent orchestration and collaboration platform.

Aubm turns complex goals into supervised multi-agent workflows: projects, context, agents, tasks, dependencies, human approvals, reports, and operational monitoring in one workspace.

## Key Features

- Multi-provider LLM support through backend provider adapters.
- Project wizard for Guided and Expert creation flows.
- Agent marketplace for deploying reusable specialist agents.
- Task orchestration with priorities, dependencies, retries, and human approval.
- Multi-agent debate for cross-reviewing task outputs.
- Final reports: full report, short brief, pessimistic analysis, and PDF export.
- Project roadmap view inferred from task status, priority, and dependencies.
- Completed project locking: completed projects become read-only in the UI and backend mutation endpoints.
- Monitoring dashboard with backend health and Supabase fallback metrics.
- Voice control and spatial task visualization for expert workflows.
- Sentry-compatible error tracking hooks for backend and frontend.

See [ROADMAP.md](./ROADMAP.md) for the current implementation status. The roadmap is intentionally conservative and separates completed, partial, in-progress, and next work.

## Tech Stack

- Frontend: React + Vite + TypeScript + vanilla CSS.
- Backend: FastAPI on Python 3.10+.
- Database/Auth: Supabase Postgres + Supabase Auth.
- Deployment: Docker, Hugging Face Spaces, and Vercel configuration.

## Project Structure

```text
aubm/
  backend/            FastAPI app, agents, routers, services, worker
  database/           Supabase schema and migrations
  docs/               Operating guide, audit notes, task plan, sales one-pager
  frontend/           React/Vite app
  ROADMAP.md          Current product roadmap and status
  SPEC.md             Technical specification
```

## Database Setup

For a fresh Supabase project, apply:

```text
database/schema.sql
database/seed.sql
database/phase3_updates.sql
database/marketplace.sql
database/enterprise_security.sql
database/agent_ownership.sql
database/task_owner_policies.sql
database/default_agents.sql
```

For existing projects, also apply any migration that matches your current error or missing capability:

```text
database/add_task_run_duration.sql
database/add_task_queued_status.sql
database/add_task_queue_leasing.sql
database/add_task_queue_retry_backoff.sql
database/add_worker_heartbeats.sql
database/add_audit_mutation_triggers.sql
database/add_profile_manager_role.sql
database/fix_profiles_recursion.sql
```

After schema changes, reload PostgREST when the migration includes:

```sql
NOTIFY pgrst, 'reload schema';
```

## Backend Setup

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Create `backend/.env`:

```env
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=optional_key
GROQ_API_KEY=optional_key
GEMINI_API_KEY=optional_key
AMD_API_KEY=optional_key
TAVILY_API_KEY=optional_key
SENTRY_DSN=optional_dsn
```

## Frontend Setup

```powershell
cd frontend
npm install
npm run dev
```

Create `frontend/.env`:

```env
VITE_API_URL=http://127.0.0.1:8000
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_SENTRY_DSN=optional_dsn
```

Validation:

```powershell
cd frontend
npm run lint
npm run build
```

## Worker

A lightweight worker scaffold exists:

```powershell
cd backend
python worker.py
```

The worker uses `tasks.status = 'queued'` and atomically claims jobs with `claim_next_queued_task`. Existing databases must apply:

```text
database/add_task_queued_status.sql
database/add_task_queue_leasing.sql
database/add_task_queue_retry_backoff.sql
database/add_worker_heartbeats.sql
database/add_audit_mutation_triggers.sql
```

Worker retry behavior can be tuned with:

```env
AUBM_WORKER_MAX_ATTEMPTS=3
AUBM_WORKER_RETRY_DELAY_SECONDS=30
```

To route task/project execution through the worker, set:

```env
TASK_EXECUTION_MODE=queue
```

With `TASK_QUEUE_EMBEDDED_WORKER=true` (the default), the FastAPI process starts an embedded worker when queue mode is enabled. Set `TASK_QUEUE_EMBEDDED_WORKER=false` when running separate worker processes with `python worker.py`.

Without queue mode, execution remains direct/background for local development. Individual calls can opt into queue mode with `?use_queue=true`.

## Hugging Face Spaces

This repo can run as a Docker Space. Create a Hugging Face Space with SDK `Docker`, push this repo, and configure secrets:

```env
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
GROQ_API_KEY=optional_key
OPENAI_API_KEY=optional_key
GEMINI_API_KEY=optional_key
AMD_API_KEY=optional_key
TAVILY_API_KEY=optional_key
SENTRY_DSN=optional_dsn
```

`VITE_API_URL` can stay empty on Spaces when the frontend and FastAPI backend share the same origin.

## Documentation

- [SPEC.md](./SPEC.md): Technical architecture and contracts.
- [ROADMAP.md](./ROADMAP.md): Current implementation status and next work.
- [docs/OPERATING_GUIDE.md](./docs/OPERATING_GUIDE.md): Operational usage and setup.
- [docs/MIGRATION_GUIDE.md](./docs/MIGRATION_GUIDE.md): Existing Supabase project migrations.
- [docs/TASKS.md](./docs/TASKS.md): Implementation task tracker.
- [docs/AUDIT.md](./docs/AUDIT.md): Stability and risk audit.
