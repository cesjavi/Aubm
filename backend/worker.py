import asyncio
import logging
import os
import signal
import socket
import uuid
from services.task_queue import TaskQueueService
from services.supabase_service import supabase
from services.agent_runner_service import AgentRunnerService
from services.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("worker")

class AubmWorker:
    def __init__(self):
        self.running = True
        suffix = uuid.uuid4().hex[:8]
        self.worker_id = os.getenv("AUBM_WORKER_ID") or f"{socket.gethostname()}-{suffix}"
        self.lease_seconds = int(os.getenv("AUBM_WORKER_LEASE_SECONDS", "300"))
        self.max_attempts = int(os.getenv("AUBM_WORKER_MAX_ATTEMPTS", "3"))
        self.retry_delay_seconds = int(os.getenv("AUBM_WORKER_RETRY_DELAY_SECONDS", "30"))
        self.processed_count = 0
        self.failed_count = 0

    async def heartbeat(self, status: str, current_task_id: str | None = None):
        if not settings.TASK_QUEUE_HEARTBEAT_ENABLED:
            return
            
        await TaskQueueService.heartbeat(
            self.worker_id,
            status=status,
            current_task_id=current_task_id,
            processed_count=self.processed_count,
            failed_count=self.failed_count,
            metadata={
                "lease_seconds": self.lease_seconds,
                "max_attempts": self.max_attempts,
                "retry_delay_seconds": self.retry_delay_seconds,
            },
        )

    async def _heartbeat_loop(self):
        """Separate loop to send heartbeat at a fixed interval."""
        while self.running:
            try:
                # We use a longer interval for regular heartbeats
                await self.heartbeat("idle")
            except Exception as e:
                logger.warning("Background heartbeat failed: %s", e)
            await asyncio.sleep(30) # Regular heartbeat every 30 seconds

    async def start(self):
        mode_suffix = "" if settings.TASK_QUEUE_HEARTBEAT_ENABLED else " (HEARTBEAT DISABLED)"
        logger.info(f"Aubm Background Worker started{mode_suffix}: {self.worker_id}")
        
        # Start the background heartbeat task if enabled
        heartbeat_task = None
        if settings.TASK_QUEUE_HEARTBEAT_ENABLED:
            heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        
        try:
            while self.running:
                task = await TaskQueueService.claim_next_queued_task(
                    self.worker_id,
                    lease_seconds=self.lease_seconds,
                    max_attempts=self.max_attempts,
                )
                
                if task:
                    task_id = task['id']
                    logger.info("Processing task: %s", task_id)
                    await self.heartbeat("processing", task_id)
                    
                    try:
                        # Fetch agent data for this task
                        agent_id = task.get("assigned_agent_id")
                        if not agent_id:
                            raise RuntimeError("No agent assigned to queued task")

                        agent_res = supabase.table("agents").select("*").eq("id", agent_id).single().execute()
                        if agent_res.data:
                            await AgentRunnerService.execute_agent_logic(task, agent_res.data)
                            await TaskQueueService.clear_lease(task_id)
                            self.processed_count += 1
                            await self.heartbeat("idle")
                            logger.info("Task %s completed successfully.", task_id)
                        else:
                            raise RuntimeError(f"Assigned agent not found: {agent_id}")
                    except Exception as e:
                        logger.error("Failed to process task %s: %s", task_id, e)
                        self.failed_count += 1
                        await TaskQueueService.mark_attempt_failed(
                            task,
                            str(e),
                            self.max_attempts,
                            self.retry_delay_seconds,
                        )
                        await self.heartbeat("error")
                else:
                    # No tasks, sleep for a bit (10s)
                    await asyncio.sleep(10)
        finally:
            if heartbeat_task:
                heartbeat_task.cancel()
            await self.heartbeat("stopping")

    def stop(self):
        logger.info("Stopping worker...")
        self.running = False

async def main():
    worker = AubmWorker()
    
    # Handle shutdown signals
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, worker.stop)
        except NotImplementedError:
            signal.signal(sig, lambda *_: worker.stop())

    await worker.start()
    await worker.heartbeat("stopping")

if __name__ == "__main__":
    asyncio.run(main())
