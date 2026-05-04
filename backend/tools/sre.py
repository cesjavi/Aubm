import psutil
import os
import platform
from typing import Dict, Any
import logging

logger = logging.getLogger("uvicorn")

class SRETool:
    """
    A toolset for Site Reliability Engineering (SRE) agents to monitor and manage system health.
    """
    
    async def get_system_health(self) -> Dict[str, Any]:
        """
        Returns real-time system health metrics (CPU, RAM, Disk).
        """
        logger.info("SRETool: Gathering system health metrics")
        return {
            "cpu_percent": psutil.cpu_percent(interval=1),
            "memory": {
                "total": psutil.virtual_memory().total,
                "available": psutil.virtual_memory().available,
                "percent": psutil.virtual_memory().percent
            },
            "disk": {
                "total": psutil.disk_usage('/').total,
                "used": psutil.disk_usage('/').used,
                "percent": psutil.disk_usage('/').percent
            },
            "os": platform.system(),
            "uptime": self._get_uptime()
        }

    async def check_service_status(self, service_name: str) -> str:
        """
        Checks if a specific service/process is running.
        """
        logger.info(f"SRETool: Checking status of {service_name}")
        for proc in psutil.process_iter(['name']):
            if service_name.lower() in proc.info['name'].lower():
                return f"Service '{service_name}' is RUNNING."
        return f"Service '{service_name}' is NOT running."

    def _get_uptime(self) -> str:
        # Simple uptime calculation
        import time
        boot_time = psutil.boot_time()
        uptime_seconds = time.time() - boot_time
        return f"{int(uptime_seconds // 3600)}h {int((uptime_seconds % 3600) // 60)}m"

    async def run_patch_command(self, command: str) -> str:
        """
        Executes a restricted set of patching commands.
        """
        logger.warning(f"SRETool: Attempting to run patch command: {command}")
        
        # Restricted whitelist for security
        whitelist = ["npm install", "pip install", "git pull", "npm audit fix"]
        
        is_safe = any(command.startswith(safe) for safe in whitelist)
        if not is_safe:
            return f"Command '{command}' is not in the safety whitelist. Patch rejected."

        try:
            import subprocess
            result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=60)
            if result.returncode == 0:
                return f"Patch successful: {result.stdout}"
            return f"Patch failed: {result.stderr}"
        except Exception as e:
            return f"Error executing patch: {str(e)}"
