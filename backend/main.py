from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
import asyncio
import logging
import os
import json
from pathlib import Path
from dotenv import load_dotenv
import sentry_sdk
from services.config import settings
from worker import AubmWorker


def _load_app_version() -> str:
    version_file = Path(__file__).resolve().parent.parent / "VERSION"
    if version_file.exists():
        value = version_file.read_text(encoding="utf-8").strip()
        if value:
            return value
    return os.getenv("APP_VERSION", "0.7.0")


# Load environment variables
load_dotenv()
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
APP_VERSION = _load_app_version()
logger = logging.getLogger("aubm.api")
embedded_worker: AubmWorker | None = None
embedded_worker_task: asyncio.Task | None = None

# Sentry Initialization
SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )

app = FastAPI(
    title="Aubm API",
    description="Enterprise-Grade AI Agent Orchestration & Collaboration Platform",
    version=APP_VERSION
)

# CORS Configuration
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if allowed_origins != ["*"] else ["*"],
    allow_origin_regex=os.getenv("ALLOWED_ORIGIN_REGEX"),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _log_embedded_worker_result(task: asyncio.Task) -> None:
    if task.cancelled():
        return

    exc = task.exception()
    if exc:
        logger.error(
            "Embedded worker stopped unexpectedly",
            exc_info=(type(exc), exc, exc.__traceback__),
        )


@app.on_event("startup")
async def start_embedded_worker() -> None:
    global embedded_worker, embedded_worker_task

    if settings.TASK_EXECUTION_MODE != "queue" or not settings.TASK_QUEUE_EMBEDDED_WORKER:
        return

    if embedded_worker_task and not embedded_worker_task.done():
        return

    embedded_worker = AubmWorker()
    embedded_worker_task = asyncio.create_task(embedded_worker.start())
    embedded_worker_task.add_done_callback(_log_embedded_worker_result)
    logger.info("Embedded task worker started: %s", embedded_worker.worker_id)


@app.on_event("shutdown")
async def stop_embedded_worker() -> None:
    global embedded_worker, embedded_worker_task

    if not embedded_worker or not embedded_worker_task:
        return

    embedded_worker.stop()
    try:
        await asyncio.wait_for(embedded_worker_task, timeout=10)
        await embedded_worker.heartbeat("stopping")
    except asyncio.TimeoutError:
        embedded_worker_task.cancel()
        logger.warning("Embedded task worker did not stop before timeout")
    finally:
        embedded_worker = None
        embedded_worker_task = None


@app.get("/")
async def root():
    index_path = FRONTEND_DIST / "index.html"
    if index_path.exists():
        return FileResponse(index_path)

    return {
        "status": "online",
        "message": "Aubm API is operational",
        "version": APP_VERSION
    }

# Placeholder for routers
from routers import agent_runner, orchestrator, monitoring

app.include_router(agent_runner.router, prefix="/tasks", tags=["Tasks"])
app.include_router(orchestrator.router, prefix="/orchestrator", tags=["Orchestration"])
app.include_router(monitoring.router, prefix="/monitoring", tags=["Monitoring"])

@app.get("/runtime-config.js", include_in_schema=False)
async def runtime_config():
    config = {
        "apiUrl": os.getenv("VITE_API_URL", ""),
        "supabaseUrl": os.getenv("VITE_SUPABASE_URL", os.getenv("SUPABASE_URL", "")),
        "supabaseAnonKey": os.getenv("VITE_SUPABASE_ANON_KEY", os.getenv("SUPABASE_ANON_KEY", "")),
        "sentryDsn": os.getenv("VITE_SENTRY_DSN", os.getenv("SENTRY_DSN", "")),
        "appVersion": APP_VERSION,
    }
    return Response(
        content=f"window.__AUBM_CONFIG__ = {json.dumps(config)};",
        media_type="application/javascript",
    )

@app.get("/{path:path}", include_in_schema=False)
async def serve_frontend(path: str):
    if not FRONTEND_DIST.exists():
        return await root()

    requested_path = FRONTEND_DIST / path
    if requested_path.is_file():
        return FileResponse(requested_path)

    index_path = FRONTEND_DIST / "index.html"
    if index_path.exists():
        return FileResponse(index_path)

    return await root()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.PORT, reload=True)
