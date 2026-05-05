from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
import os
import json
from pathlib import Path
from dotenv import load_dotenv
import sentry_sdk

# Load environment variables
load_dotenv()
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

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
    version="0.1.0"
)

# CORS Configuration
allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    index_path = FRONTEND_DIST / "index.html"
    if index_path.exists():
        return FileResponse(index_path)

    return {
        "status": "online",
        "message": "Aubm API is operational",
        "version": "0.1.0"
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
    from services.config import settings
    uvicorn.run("main:app", host="0.0.0.0", port=settings.PORT, reload=True)
