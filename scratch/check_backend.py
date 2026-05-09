import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

try:
    print("Testing service initialization...")
    from backend.services.orchestrator_service import orchestrator_service
    from backend.services.config import settings
    print(f"Orchestrator Service initialized. Worker ID: {settings.AUBM_WORKER_ID}")
    print(f"Task Execution Mode: {settings.TASK_EXECUTION_MODE}")
    print(f"Embedded Worker Enabled: {settings.TASK_QUEUE_EMBEDDED_WORKER}")
    
    print("Testing router import...")
    from backend.routers import orchestrator
    print("Orchestrator Router imported successfully.")
    
except Exception as e:
    import traceback
    traceback.print_exc()
    sys.exit(1)
