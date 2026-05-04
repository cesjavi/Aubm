import logging
from typing import Optional, List
from .supabase_service import supabase

logger = logging.getLogger(__name__)

class TaskQueueService:
    @staticmethod
    async def queue_task(task_id: str):
        """
        Marks a task as 'queued' in the database.
        """
        try:
            result = supabase.table("tasks").update({"status": "queued"}).eq("id", task_id).execute()
            return result
        except Exception as e:
            logger.error(f"Error queueing task {task_id}: {e}")
            return None

    @staticmethod
    async def get_next_queued_task():
        """
        Fetches the next available task from the queue.
        """
        try:
            # Fetch one task that is in 'queued' status, ordered by priority and created_at
            result = supabase.table("tasks") \
                .select("*") \
                .eq("status", "queued") \
                .order("priority", desc=True) \
                .order("created_at") \
                .limit(1) \
                .execute()
            
            if result.data:
                return result.data[0]
            return None
        except Exception as e:
            logger.error(f"Error fetching next queued task: {e}")
            return None

    @staticmethod
    async def mark_in_progress(task_id: str):
        """
        Marks a task as 'in_progress'.
        """
        return supabase.table("tasks").update({"status": "in_progress"}).eq("id", task_id).execute()
