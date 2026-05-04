import asyncio
import logging
import signal
from services.task_queue import TaskQueueService
from services.supabase_service import supabase
from services.agent_runner_service import AgentRunnerService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("worker")

class AubmWorker:
    def __init__(self):
        self.running = True

    async def start(self):
        logger.info("Aubm Background Worker started.")
        while self.running:
            task = await TaskQueueService.get_next_queued_task()
            
            if task:
                task_id = task['id']
                logger.info(f"Processing task: {task_id}")
                
                try:
                    # Fetch agent data for this task
                    agent_res = supabase.table("agents").select("*").eq("id", task["assigned_agent_id"]).single().execute()
                    if agent_res.data:
                        await AgentRunnerService.execute_agent_logic(task, agent_res.data)
                        logger.info(f"Task {task_id} completed successfully.")
                    else:
                        logger.error(f"No agent found for task {task_id}")
                except Exception as e:
                    logger.error(f"Failed to process task {task_id}: {e}")
            else:
                # No tasks, sleep for a bit
                await asyncio.sleep(5)

    def stop(self):
        logger.info("Stopping worker...")
        self.running = False

async def main():
    worker = AubmWorker()
    
    # Handle shutdown signals
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, worker.stop)

    await worker.start()

if __name__ == "__main__":
    asyncio.run(main())
