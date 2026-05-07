# Aubm Frontend

React + Vite + TypeScript frontend for Aubm.

## Main Screens

- Dashboard: projects, search, filters, sorting, progress.
- New Project: Guided and Expert wizard.
- Project Detail: tasks, assignments, dependencies, reports, roadmap, completed-project lock state.
- Marketplace: search and deploy agent templates.
- Agents: create and manage custom agents.
- Debate: start multi-agent review flows.
- Voice Control: browser speech navigation and status.
- Spatial View: DAG-style task visualization.
- Monitoring: backend health and Supabase fallback metrics.
- Settings: UI mode, provider defaults, and admin role management.

## Setup

```powershell
npm install
npm run dev
```

Create `.env`:

```env
VITE_API_URL=http://127.0.0.1:8000
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_SENTRY_DSN=optional_dsn
```

## Validation

```powershell
npm run lint
npm run build
```

## Notes

- UI text should remain in English.
- Guided mode hides advanced surfaces.
- Expert mode exposes marketplace, debate, voice, spatial view, monitoring, and admin settings.
- Completed projects are read-only: reports and output review remain available, but task mutations are disabled.
