from .base import BaseAgent
from typing import Dict, Any, List
import openai
from services.config import settings, config_service

class AMDAgent(BaseAgent):
    """
    Agent implementation for AMD Inference (inference.do-ai.run).
    Compatible with OpenAI's API format.
    """
    def __init__(self, name: str, role: str, model: str = "gpt-4o", system_prompt: str = None):
        super().__init__(name, role, model, system_prompt)
        
        self.provider_config = config_service.get_provider_config("amd")
        api_key = self.provider_config.get("api_key") or settings.AMD_API_KEY
        
        self.client = None
        if api_key:
            self.client = openai.AsyncOpenAI(
                api_key=api_key,
                base_url=self.provider_config.get("base_url", "https://inference.do-ai.run/v1")
            )
        self.temperature = self.provider_config.get("temperature", 0.7)
        self.max_tokens = self.provider_config.get("max_tokens", 4096)

    async def run(self, task_description: str, context: List[Dict[str, Any]], use_tools: bool = False, extra_context: str = "") -> Dict[str, Any]:
        if not self.client:
            return {
                "agent_name": self.name,
                "provider": "amd",
                "raw_output": "Error: AMD API Key not configured.",
                "data": {"error": "Missing credentials"}
            }
        return await self._run_openai_compatible(
            provider="amd",
            create_fn=self.client.chat.completions.create,
            task_description=task_description,
            context=context,
            use_tools=use_tools,
            extra_context=extra_context,
            response_format={"type": "json_object"}
        )
