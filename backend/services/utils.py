import asyncio
import logging

logger = logging.getLogger("uvicorn")

def log_async_task_result(task: asyncio.Task, label: str) -> None:
    """
    Callback for asyncio tasks to log their completion status and exceptions.
    """
    if task.cancelled():
        logger.warning("%s was cancelled", label)
        return

    try:
        exc = task.exception()
        if exc:
            logger.error(
                "%s failed: %s", 
                label, 
                exc, 
                exc_info=(type(exc), exc, exc.__traceback__)
            )
    except asyncio.InvalidStateError:
        logger.error("%s task is not yet finished", label)
    except Exception as exc:
        logger.error("Error while checking %s result: %s", label, exc)
