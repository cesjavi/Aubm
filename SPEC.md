# 🛠️ Aubm — Technical Specification

> **Target Stack**: FastAPI (Python) + React/TypeScript (Vite) + Supabase (Postgres + Auth)

This document provides a comprehensive technical blueprint for recreating Aubm.

---

## 1. System Architecture

Aubm follows a decoupled architecture with a centralized database (Supabase) acting as the source of truth and coordination layer.

### Directory Structure
```
aubm/
├── backend/                  # Python 3.10+
│   ├── main.py              # Application entrypoint & CRUD API
│   ├── worker.py            # Standalone task queue worker
│   ├── schema.sql           # Full DDL for Supabase
│   ├── agents/              # Provider-specific implementations
│   │   ├── base.py          # Abstract BaseAgent class
│   │   ├── agent_factory.py # Factory for creating agent instances
│   │   └── {provider}_agent.py
│   ├── routers/             # Functional endpoint grouping
│   │   ├── agent_runner.py  # Task execution logic
│   │   └── orchestrator.py  # Multi-task project flow
│   └── services/            # Core business logic
│       ├── config.py        # Configuration management
│       ├── task_queue.py    # Background processing loop
│       └── semantic_backprop.py # RAG context builder
├── frontend/                # React + Vite + TS
│   ├── src/
│   │   ├── components/      # UI Modular components
│   │   ├── services/        # API communication layer
│   │   ├── context/         # Auth & Global state
│   │   └── i18n/            # Multi-language support
│   └── vite.config.ts
└── database/                # Migrations & Seed data
```

---

## 2. Database Schema (Supabase/Postgres)

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | User extensions | `id (uuid)`, `role`, `full_name`, `avatar_url` |
| `projects` | Project containers | `id`, `name`, `description`, `context`, `owner_id`, `status` |
| `agents` | AI Identities | `id`, `name`, `role`, `api_provider`, `model`, `system_prompt` |
| `tasks` | Units of work | `id`, `project_id`, `assigned_agent_id`, `status`, `output_data` |
| `task_runs` | Execution history | `id`, `task_id`, `agent_id`, `status`, `error_message` |
| `agent_logs` | Execution traces | `id`, `task_id`, `action`, `content`, `metadata` |
| `app_config` | Global settings | `key`, `value` (JSONB) |

### Status Enums
- **Tasks**: `todo`, `in_progress`, `awaiting_approval`, `done`, `failed`, `cancelled`.
- **Task Runs**: `queued`, `running`, `completed`, `failed`, `cancelled`.
- **Profiles**: `user`, `manager`, `admin`.

---

## 3. Backend Logic

### Agent Execution Flow
1. **Request**: `POST /tasks/{id}/run`
2. **Initialization**: Fetch task, agent, and project data.
3. **Context Building**: `semantic_backprop` fetches outputs from previous tasks in the same project.
4. **Agent Factory**: Instantiates the correct `BaseAgent` subclass (e.g., `GroqAgent`).
5. **Execution**:
    - LLM call with dynamic prompt.
    - Real-time logging to `agent_logs` via SSE.
6. **Guardrails**:
    - `output_cleaner`: Strips markdown artifacts.
    - `language_guard`: Ensures output matches `app_config["output_language"]`.
7. **Persistence**: Updates `task.output_data` and sets status to `awaiting_approval`.

### Orchestration Engine
- Processes a project's task list as a Directed Acyclic Graph (DAG).
- Respects `is_critical` and `priority` fields.
- Auto-assigns available agents from the `agents` pool if no agent is pre-assigned.

### Tool System (Phase 2)
- **Tool Registry**: A central registry where tools are defined and permissioned.
- **Browser Tool**: Uses Playwright for headless browsing and content extraction.
- **Sandbox Tool**: Executes code in a restricted environment.
- **Integration**: Tools are exposed to agents via the OpenAI function-calling/tool-calling schema.

---

## 4. Frontend Design System

- **Styling**: Vanilla CSS with modern variables (HSL colors, glassmorphism).
- **Icons**: Lucide React.
- **State Management**: React Context + Hooks.
- **Features**:
    - Kanban Board for task management.
    - Real-time streaming console for agent thoughts.
    - Interactive Project Wizard for quick setup.
    - Analytics dashboard for project performance.

---

## 5. Deployment Guide

### Vercel Integration
The project is designed to run seamlessly on Vercel:
- **Frontend**: Standard Vite build.
- **Backend**: Python Serverless Functions.
- **Database**: External Supabase instance.

### Local Setup
1. **DB**: Apply `schema.sql` to Supabase.
2. **Backend**: `pip install -r requirements.txt` & `uvicorn main:app`.
3. **Frontend**: `npm install` & `npm run dev`.

---

## 6. Key Dependencies

### Backend
- `fastapi`, `supabase`, `openai`, `groq`, `google-genai`, `playwright`, `folium`.

### Frontend
- `react`, `lucide-react`, `framer-motion` (for animations), `i18next`.

---

## 7. Security (RLS)
- **Projects**: Only visible to owner or if `is_public=true`.
- **Config**: Only writable by users with `role='admin'`.
- **Agents**: Writable by `manager` or `admin`.
- **Tasks**: Protected by project-level RLS.

---
*End of Specification*
