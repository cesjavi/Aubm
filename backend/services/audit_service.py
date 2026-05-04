from services.supabase_service import supabase
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger("uvicorn")

class AuditService:
    @staticmethod
    async def log_action(
        user_id: Optional[str],
        action: str,
        agent_id: Optional[str] = None,
        task_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Records an action in the audit_logs table.
        """
        try:
            data = {
                "user_id": user_id,
                "action": action,
                "agent_id": agent_id,
                "task_id": task_id,
                "metadata": metadata or {}
            }
            supabase.table("audit_logs").insert(data).execute()
        except Exception as e:
            logger.error(f"AuditService error: {str(e)}")

audit_service = AuditService()
