from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
import sentry_sdk

# Load environment variables
load_dotenv()

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

if __name__ == "__main__":
    import uvicorn
    from services.config import settings
    uvicorn.run("main:app", host="0.0.0.0", port=settings.PORT, reload=True)
