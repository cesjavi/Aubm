from .base import BaseAgent
from typing import Dict, Any, List
from google import genai
from services.config import settings, config_service

class GeminiAgent(BaseAgent):
    """
    Agent implementation for Google Gemini using the new google-genai SDK.
    """
    def __init__(self, name: str, role: str, model: str = "gemini-2.0-flash", system_prompt: str = None):
        super().__init__(name, role, model, system_prompt)
        
        # Load dynamic config
        self.provider_config = config_service.get_provider_config("gemini")
        api_key = self.provider_config.get("api_key") or settings.GEMINI_API_KEY
        
        self.client = genai.Client(api_key=api_key)
        self.temperature = self.provider_config.get("temperature", 0.7)

    async def run(self, task_description: str, context: List[Dict[str, Any]], use_tools: bool = False, extra_context: str = "") -> Dict[str, Any]:
        full_prompt = f"""
System Instruction: {self.system_prompt}

{self._build_json_prompt(task_description, context, extra_context)}
"""

        # Gemini 2.0 Flash is very fast.
        response = await self.client.aio.models.generate(
            model=self.model,
            contents=full_prompt,
            config={
                "temperature": self.temperature,
                "response_mime_type": "application/json",
            }
        )

        return self._result("gemini", response.text or "")
