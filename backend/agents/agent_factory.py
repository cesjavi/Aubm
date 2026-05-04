from typing import Dict, Any, Type
from .base import BaseAgent
from .openai_agent import OpenAIAgent
from .amd_agent import AMDAgent

# Map of providers to their respective classes
PROVIDER_MAP: Dict[str, Type[BaseAgent]] = {
    "openai": OpenAIAgent,
    "amd": AMDAgent,
    # "groq": GroqAgent,  # To be implemented
}

class AgentFactory:
    @staticmethod
    def get_agent(provider: str, name: str, role: str, model: str, system_prompt: str = None) -> BaseAgent:
        """
        Instantiates the appropriate agent based on the provider string.
        """
        provider = provider.lower()
        agent_class = PROVIDER_MAP.get(provider)
        
        if not agent_class:
            # Default to OpenAI if provider not found, or raise error
            raise ValueError(f"Unsupported agent provider: {provider}")
            
        return agent_class(name=name, role=role, model=model, system_prompt=system_prompt)
