# 🤖 Aubm

### Enterprise-Grade AI Agent Orchestration & Collaboration Platform

Aubm (Automated Unified Business Machines) is a sophisticated platform designed to orchestrate multiple autonomous AI agents to complete complex projects. Featuring **Human-in-the-Loop** supervision, **Dynamic DAG** task execution, and **Semantic RAG** context injection.

---

## 🚀 Key Features

- **Multi-Provider Support**: Seamless integration with OpenAI, AMD (inference.do-ai.run), Groq, Gemini, Qwen, Ollama, and OpenRouter.
- **Autonomous Orchestration**: Intelligent task prioritization and execution based on dependencies (DAG).
- **Human-in-the-Loop**: Approval-based workflow ensuring quality and safety.
- **Semantic Backpropagation**: Context from completed tasks is automatically injected into subsequent tasks.
- **Real-time Monitoring**: SSE-powered live logs and progress tracking.
- **Project Wizard**: AI-driven project creation and task decomposition.
- **Operational Safety**: Automatic recovery of stale runs and comprehensive health monitoring.

---

## 🛠️ Tech Stack

- **Frontend**: React + Vite + TypeScript (Styled with Vanilla CSS for maximum performance)
- **Backend**: FastAPI (Python 3.10+)
- **Database**: Supabase (Postgres + Auth + Real-time)
- **Deployment**: Optimized for Vercel (Serverless Backend + Static Frontend)

---

## 🏗️ Project Structure

```bash
aubm/
├── backend/            # FastAPI Application & AI Core
│   ├── agents/         # LLM Provider Implementations
│   ├── routers/        # API Endpoints (Runner, Orchestrator)
│   ├── services/       # Business Logic (Queue, RAG, Guards)
│   └── main.py         # App Entrypoint
├── frontend/           # React Application
│   ├── src/            # Components, Hooks, Context, Services
│   └── vite.config.ts  # Vite Configuration
└── database/           # Supabase Schema & Migrations
```

---

## ⚙️ Getting Started

### 1. Database Setup (Supabase)
1. Create a new project in [Supabase](https://supabase.com).
2. Go to the **SQL Editor** and execute the content of `backend/schema.sql`.
3. Enable **Auth** with your preferred providers (Email/Password by default).

### 2. Backend Installation
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

Create a `.env` file in `/backend`:
```env
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=optional_key
GROQ_API_KEY=optional_key
# See SPEC.md for all available providers
```

Run the server:
```bash
uvicorn main:app --reload --port 8000
```

### 3. Frontend Installation
```bash
cd frontend
npm install
```

Create a `.env` file in `/frontend`:
```env
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Run the development server:
```bash
npm run dev
```

---

## 📈 Operational Modes

- **Embedded Worker**: Runs the task queue within the FastAPI process (set `TASK_QUEUE_EMBEDDED_WORKER=true`).
- **Standalone Worker**: For high-load environments, run the worker in a separate process:
  ```bash
  cd backend
  python worker.py
  ```

---

## 📄 Documentation

For detailed technical architecture, refer to:
- [SPEC.md](./SPEC.md) - Deep technical specifications.
- [ROADMAP.md](./ROADMAP.md) - Future development goals.
- [docs/](./docs/) - Extended guides and manuals.
