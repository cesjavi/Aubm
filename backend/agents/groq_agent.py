import logging
from .base import BaseAgent
from typing import Dict, Any, List
import groq
from services.config import settings, config_service
from tools.registry import tool_registry

logger = logging.getLogger("uvicorn")

class GroqAgent(BaseAgent):
    """
    Agent implementation for Groq.
    """
    def __init__(self, name: str, role: str, model: str = "llama-3.3-70b-versatile", system_prompt: str = None):
        super().__init__(name, role, model, system_prompt)
        
        # Load dynamic config
        self.provider_config = config_service.get_provider_config("groq")
        api_key = self.provider_config.get("api_key") or settings.GROQ_API_KEY
        
        self.client = groq.AsyncGroq(api_key=api_key)
        self.temperature = self.provider_config.get("temperature", 0.7)
        self.max_tokens = self.provider_config.get("max_tokens", 4096)

    async def run(self, task_description: str, context: List[Dict[str, Any]], use_tools: bool = False, extra_context: str = "") -> Dict[str, Any]:
        messages = self._build_chat_messages(task_description, context, extra_context)

        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens
        }
        
        if use_tools:
            kwargs["tools"] = tool_registry.get_tool_definitions()
            kwargs["tool_choice"] = "auto"

        response = await self.client.chat.completions.create(**kwargs)
        message = response.choices[0].message

        # Handle tool calls
        if message.tool_calls:
            messages.append(message)
            await self._append_tool_results(messages, message.tool_calls, tool_registry)
            
            final_response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )
            content = final_response.choices[0].message.content
        else:
            content = message.content or ""

        return self._result("groq", content)
