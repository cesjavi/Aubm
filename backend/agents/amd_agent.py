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
        
        self.client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url=self.provider_config.get("base_url", "https://inference.do-ai.run/v1")
        )
        self.temperature = self.provider_config.get("temperature", 0.7)
        self.max_tokens = self.provider_config.get("max_tokens", 4096)

    async def run(self, task_description: str, context: List[Dict[str, Any]], use_tools: bool = False, extra_context: str = "") -> Dict[str, Any]:
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=self._build_chat_messages(task_description, context, extra_context),
                response_format={"type": "json_object"},
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )

            return self._result("amd", response.choices[0].message.content or "")
        except Exception as e:
            return {
                "agent_name": self.name,
                "provider": "amd",
                "status": "error",
                "error": str(e)
            }
