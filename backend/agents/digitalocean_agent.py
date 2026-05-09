from .base import BaseAgent
from typing import Dict, Any, List
import openai
from services.config import settings, config_service

class DigitalOceanAgent(BaseAgent):
    """
    Agent provider using DigitalOcean's Gradient Inference API.
    Supports both Serverless Inference and dedicated Agent Inference endpoints.
    """
    def __init__(self, name: str, role: str, model: str = "qwen3-coder-flash", system_prompt: str = None):
        super().__init__(name, role, model, system_prompt)
        
        # Load dynamic config
        self.provider_config = config_service.get_provider_config("digitalocean")
        
        # Priority: Agent Access Key -> Inference Key -> AMD Key -> DO Token
        api_key = (
            self.provider_config.get("agent_access_key") or 
            settings.DO_AGENT_ACCESS_KEY or 
            self.provider_config.get("api_key") or 
            settings.DO_INFERENCE_KEY or 
            settings.AMD_API_KEY or
            settings.DO_API_TOKEN
        )
        
        # Priority: Agent Endpoint -> Default Serverless Endpoint
        base_url = (
            self.provider_config.get("base_url") or 
            settings.DO_AGENT_ENDPOINT or 
            "https://inference.do-ai.run/v1"
        )
        
        # Ensure base_url has the correct suffix if it's a raw agent URL
        if ".agents.do-ai.run" in base_url and not base_url.endswith("/v1"):
            base_url = f"{base_url.rstrip('/')}/v1"
        elif "api.digitalocean.com" not in base_url and "do-ai.run" not in base_url:
             # Fallback logic for potentially missing /v1 in custom domains
             if not base_url.endswith("/v1"):
                 base_url = f"{base_url.rstrip('/')}/v1"

        self.client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url=base_url
        )
        self.is_agent_endpoint = "agents.do-ai.run" in base_url or settings.DO_AGENT_ENDPOINT is not None
        self.temperature = self.provider_config.get("temperature", 0.7)
        self.max_tokens = self.provider_config.get("max_tokens", 4096)

    async def run(self, task_description: str, context: List[Dict[str, Any]], use_tools: bool = False, extra_context: str = "") -> Dict[str, Any]:
        # DigitalOcean Agent Inference requires ?agent=true
        extra_query = {"agent": "true"} if self.is_agent_endpoint else {}
        
        return await self._run_openai_compatible(
            provider="digitalocean",
            create_fn=self.client.chat.completions.create,
            task_description=task_description,
            context=context,
            use_tools=use_tools,
            extra_context=extra_context,
            extra_query=extra_query
        )
