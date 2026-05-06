# Aubm Operating Guide

## What Aubm Does

Aubm is an AI agent orchestration platform. Users sign in with Supabase Auth, deploy or configure agents, assign them to tasks, run autonomous executions, review outputs, and monitor system health from a React dashboard.

The application has three main layers:

- `frontend/`: React + Vite dashboard for authentication, marketplace, debates, voice control, spatial task visualization, and monitoring.
- `backend/`: FastAPI API for task execution, multi-agent debate orchestration, tool calling, and monitoring.
- `database/`: Supabase SQL schema, seed data, RLS policies, marketplace tables, audit logs, teams, and migrations.

## Core Runtime Flow

1. A user signs in through Supabase Auth.
2. The frontend reads templates, agents, projects, and tasks from Supabase.
3. A user deploys an agent from the marketplace into `public.agents`.
4. A task references an assigned agent through `tasks.assigned_agent_id`.
5. `POST /tasks/{task_id}/run` starts backend execution.
6. The backend loads the task, assigned agent, and previous completed task outputs.
7. `AgentFactory` creates the right provider implementation, currently `OpenAIAgent` or `AMDAgent`.
8. The agent produces JSON output.
9. The backend writes output to `tasks.output_data`, moves the task to `awaiting_approval`, records `task_runs`, `agent_logs`, and `audit_logs`.
10. A human reviews, edits, approves, or gives feedback through the frontend.

## Main Features

### Dashboard

Shows project cards and high-level workflow progress. It is currently a static dashboard scaffold, ready to be connected to live project data.

### Agent Marketplace

Reads `agent_templates` from Supabase and deploys selected templates into `agents`.

Required database support:

- `agents.user_id`
- Insert policy allowing authenticated users to create agents where `auth.uid() = user_id`

Apply:

```sql
-- database/agent_ownership.sql
```

### Custom Agents

The `Agents` screen lets users create custom agents directly.

Each agent has:

- Name
- Role
- LLM provider
- Model
- System prompt

The currently wired backend providers are:

- `openai`
- `amd`

Settings stores the frontend default provider/model in browser local storage. Provider API keys are never stored in the frontend; they must stay in `backend/.env`.

### Agent Debate

Uses the backend endpoint:

```text
POST /orchestrator/debate
```

The flow is:

1. Agent A generates an initial answer.
2. Agent B critiques the answer.
3. Agent A refines the output.
4. The final debate result is saved to `tasks.output_data`.

### Voice Control

Uses browser Web Speech APIs.

Supported commands include:

- `dashboard`
- `marketplace`
- `debate`
- `settings`
- `new project`
- `status`

The `status` command reads project/task counts from Supabase and speaks the result.

### Spatial View

Shows a layered task DAG-style visualization. It reads recent tasks from Supabase and falls back to demo nodes if no tasks are available.

### Monitoring

Uses:

```text
GET /monitoring/summary
```

The endpoint reports:

- API status
- Database status
- Project count
- Task count
- Agent count
- Task run count
- Failed tasks
- Tasks awaiting approval

If the backend endpoint is unavailable, the frontend falls back to direct Supabase count queries.

## Backend Setup

From `backend/`:

```powershell
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Required `backend/.env` values:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
AMD_API_KEY=...
```

Optional provider keys:

```env
GROQ_API_KEY=...
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...
```

## Frontend Setup

From `frontend/`:

```powershell
npm install
npm run dev
```

Required `frontend/.env` values:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=http://127.0.0.1:8000
```

Build check:

```powershell
npm run build
```

## Database Setup Order

Apply SQL files in this order for a fresh Supabase project:

1. `database/schema.sql`
2. `database/seed.sql`
3. `database/phase3_updates.sql`
4. `database/marketplace.sql`
5. `database/enterprise_security.sql`
6. `database/agent_ownership.sql`
7. `database/task_owner_policies.sql`
8. `database/default_agents.sql`

For an existing Supabase project where marketplace deploy fails with missing `user_id`, apply only:

```sql
-- database/agent_ownership.sql
```

Then reload the frontend with a hard refresh.

## Important Tables

- `profiles`: User metadata and role.
- `projects`: Project containers.
- `agents`: Deployed AI agents.
- `agent_templates`: Marketplace templates.
- `tasks`: Work units assigned to agents.
- `task_runs`: Execution history.
- `agent_logs`: Agent execution traces.
- `audit_logs`: Governance and compliance trail.
- `task_feedback`: Like/dislike feedback for future tuning.
- `teams` and `team_members`: Enterprise team permissions.

## Tool System

The backend exposes tools to agents through `tools/registry.py`.

Available tools include:

- Web extraction with Playwright.
- Python code execution.
- PDF generation.
- Excel generation.
- Project decomposition.
- System health checks.
- Restricted patch commands.

## Current Roadmap State

Completed:

- Core backend and frontend foundation.
- Supabase auth and schema.
- Agent execution.
- Multi-agent debate.
- Marketplace.
- Voice control.
- Spatial task viewer.
- Operations monitoring.

In progress:

- Production operations hardening.
- Error tracking.
- Docker/runtime packaging.
- Frontend bundle splitting.
- Production CORS allowlist.

## Common Errors

### `403 Forbidden` on `POST /rest/v1/agents`

Cause: RLS policy does not allow insert.

Fix: Apply `database/agent_ownership.sql`.

### `Could not find the 'user_id' column of 'agents' in the schema cache`

Cause: `agents.user_id` is missing or PostgREST schema cache has not reloaded.

Fix:

```sql
ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';
```

Then hard refresh the frontend.

### `OTS parsing error`

Cause: A CSS URL was incorrectly used as a font file.

Fix: Use Google Fonts through `@import`, already applied in `frontend/src/styles/variables.css`.

### Frontend chunk-size warning

Vite currently warns that the JS chunk is larger than 500 KB. This is not a runtime error. The Phase 5 roadmap includes bundle splitting.

## Development Rules

- Keep frontend display text in English.
- Keep documentation in English.
- Keep database migrations idempotent when possible.
- Never commit real secrets from `.env`.
- Prefer applying database changes through separate migration files instead of editing only `schema.sql`.
