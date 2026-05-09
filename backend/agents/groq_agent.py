import logging
from .base import BaseAgent
from typing import Dict, Any, List
import groq
import json
from services.config import settings, config_service
from tools.registry import tool_registry

logger = logging.getLogger("uvicorn")

GROQ_ROTATION_POOL = [
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-120b",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "qwen/qwen3-32b",
    "openai/gpt-oss-20b",
    "groq/compound",
    "llama-3.1-8b-instant"
]

class GroqAgent(BaseAgent):
    """
    Agent implementation for Groq with automatic model rotation for rate limits.
    """
    def __init__(self, name: str, role: str, model: str = "llama-3.3-70b-versatile", system_prompt: str = None):
        # Auto-migrate decommissioned models
        if "llama-3.1-70b" in model or "llama3-70b-8192" in model:
            model = "llama-3.3-70b-versatile"
            
        super().__init__(name, role, model, system_prompt)
        
        # Load dynamic config
        self.provider_config = config_service.get_provider_config("groq")
        api_key = self.provider_config.get("api_key") or settings.GROQ_API_KEY
        
        self.client = groq.AsyncGroq(api_key=api_key)
        self.temperature = self.provider_config.get("temperature", 0.7)
        self.max_tokens = self.provider_config.get("max_tokens", 4096)
        self.reasoning_effort = self.provider_config.get("reasoning_effort", "medium")

    def _format_context(self, context: List[Dict[str, Any]]) -> str:
        """Extremely aggressive truncation for Groq TPM limits."""
        if not context:
            return "No previous context available."
        
        # Only take the last 3 tasks to save tokens
        recent_context = context[-3:]
        
        formatted = "Previous tasks context (EXTREMELY TRUNCATED for Groq):\n"
        for item in recent_context:
            output_raw = json.dumps(item.get('output_data', {}))
            # 800 chars is roughly 200 tokens.
            if len(output_raw) > 800:
                output_raw = output_raw[:800] + "... [TRUNCATED]"
            
            formatted += f"- Task: {item.get('title')}\n  Output: {output_raw}\n"
        return formatted

    async def run(self, task_description: str, context: List[Dict[str, Any]], use_tools: bool = False, extra_context: str = "") -> Dict[str, Any]:
        # Very limited semantic context
        if len(extra_context) > 1000:
            extra_context = extra_context[:1000] + "... [TRUNCATED]"
            
        try:
            return await self._execute_run(task_description, context, use_tools, extra_context)
        except groq.RateLimitError as e:
            logger.warning(f"Rate limit reached for {self.model} (429). Attempting model rotation...")
            
            # Find current model index in pool
            try:
                current_idx = GROQ_ROTATION_POOL.index(self.model)
            except ValueError:
                current_idx = -1
            
            # Try the next model in the pool
            next_idx = (current_idx + 1) % len(GROQ_ROTATION_POOL)
            fallback_model = GROQ_ROTATION_POOL[next_idx]
            
            logger.info(f"Rotating from {self.model} to {fallback_model}")
            self.model = fallback_model
            
            # Retry once with fallback model
            return await self._execute_run(task_description, context, use_tools, extra_context)

    async def _execute_run(self, task_description: str, context: List[Dict[str, Any]], use_tools: bool = False, extra_context: str = "") -> Dict[str, Any]:
        extra_kwargs = {}
        if "gpt-oss-" in self.model:
            extra_kwargs["reasoning_effort"] = self.reasoning_effort
            
        return await self._run_openai_compatible(
            provider="groq",
            create_fn=self.client.chat.completions.create,
            task_description=task_description,
            context=context,
            use_tools=use_tools,
            extra_context=extra_context,
            **extra_kwargs
        )
