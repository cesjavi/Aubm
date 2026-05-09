from .base import BaseAgent
from typing import Dict, Any, List
import openai
from services.config import settings, config_service
from tools.registry import tool_registry

class OpenAIAgent(BaseAgent):
    def __init__(self, name: str, role: str, model: str = "qwen3-coder-flash", system_prompt: str = None):
        super().__init__(name, role, model, system_prompt)
        
        # Load dynamic config
        self.provider_config = config_service.get_provider_config("openai")
        api_key = self.provider_config.get("api_key") or settings.OPENAI_API_KEY
        
        self.client = None
        if api_key:
            self.client = openai.AsyncOpenAI(api_key=api_key)
        self.temperature = self.provider_config.get("temperature", 0.7)
        self.max_tokens = self.provider_config.get("max_tokens", 4096)

    async def run(self, task_description: str, context: List[Dict[str, Any]], use_tools: bool = False, extra_context: str = "") -> Dict[str, Any]:
        if not self.client:
            return {
                "agent_name": self.name,
                "provider": "openai",
                "raw_output": "Error: OpenAI API Key not configured.",
                "data": {"error": "Missing credentials"}
            }
        return await self._run_openai_compatible(
            provider="openai",
            create_fn=self.client.chat.completions.create,
            task_description=task_description,
            context=context,
            use_tools=use_tools,
            extra_context=extra_context,
            response_format={"type": "json_object"}
        )
