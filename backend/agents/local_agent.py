from .base import BaseAgent
from typing import Dict, Any, List
import httpx
from services.config import config_service

class LocalAgent(BaseAgent):
    """
    Agent implementation for Local LLMs (Ollama).
    """
    def __init__(self, name: str, role: str, model: str = "llama3.1:8b", system_prompt: str = None):
        super().__init__(name, role, model, system_prompt)
        
        # Load dynamic config
        self.provider_config = config_service.get_provider_config("ollama")
        self.base_url = self.provider_config.get("base_url", "http://localhost:11434")
        self.temperature = self.provider_config.get("temperature", 0.7)

    async def run(self, task_description: str, context: List[Dict[str, Any]], use_tools: bool = False, extra_context: str = "") -> Dict[str, Any]:
        full_prompt = f"""
System Instructions: {self.system_prompt}

{self._build_json_prompt(task_description, context, extra_context)}
"""

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": full_prompt,
                        "stream": False,
                        "format": "json",
                        "options": {
                            "temperature": self.temperature
                        }
                    }
                )
                response.raise_for_status()
                result = response.json()
                return self._result("local", result.get("response", "{}"))
            except Exception as e:
                return {
                    "agent_name": self.name,
                    "provider": "local",
                    "status": "error",
                    "error": f"Ollama connection failed: {str(e)}"
                }
