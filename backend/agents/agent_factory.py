from typing import Dict, Type
from .base import BaseAgent
from .openai_agent import OpenAIAgent
from .amd_agent import AMDAgent
from .groq_agent import GroqAgent
from .gemini_agent import GeminiAgent
from .local_agent import LocalAgent
from .digitalocean_agent import DigitalOceanAgent
from services.config import settings

# Map of providers to their respective classes
PROVIDER_MAP: Dict[str, Type[BaseAgent]] = {
    "openai": OpenAIAgent,
    "amd": AMDAgent,
    "groq": GroqAgent,
    "gemini": GeminiAgent,
    "local": LocalAgent,
    "ollama": LocalAgent,
    "digitalocean": DigitalOceanAgent
}

class AgentFactory:
    @staticmethod
    def get_agent(provider: str, name: str, role: str, model: str, system_prompt: str = None) -> BaseAgent:
        """
        Instantiates the appropriate agent based on the provider string.
        Includes a fallback to Groq if OpenAI is requested but no key is provided.
        """
        provider = provider.lower()

        # Model Mapping: Ensure cross-provider compatibility
        if provider == "amd":
            if "gpt-4" in model or "gpt-3.5" in model:
                model = "llama3.3-70b-instruct"
        elif provider == "groq":
            if "gpt-4" in model or "gpt-3.5" in model:
                model = "llama-3.3-70b-versatile"
        # Fallback Logic: OpenAI -> AMD -> Groq
        if provider == "openai" and not settings.OPENAI_API_KEY:
            if settings.ENABLE_AMD and settings.AMD_API_KEY:
                provider = "amd"
                model = "llama3.3-70b-instruct"
            elif settings.GROQ_API_KEY:
                provider = "groq"
                model = "llama-3.3-70b-versatile"

        # Explicit AMD Disable Switch
        if provider == "amd" and not settings.ENABLE_AMD:
            if settings.GROQ_API_KEY:
                provider = "groq"
                model = "llama-3.3-70b-versatile"
            else:
                raise ValueError("AMD is disabled and no Groq fallback available.")

        agent_class = PROVIDER_MAP.get(provider)
        
        if not agent_class:
            raise ValueError(f"Unsupported agent provider: {provider}")
            
        return agent_class(name=name, role=role, model=model, system_prompt=system_prompt)
