from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import json

class BaseAgent(ABC):
    def __init__(self, name: str, role: str, model: str, system_prompt: Optional[str] = None):
        self.name = name
        self.role = role
        self.model = model
        self.system_prompt = system_prompt or f"You are {name}, acting as a {role}."

    @abstractmethod
    async def run(self, task_description: str, context: List[Dict[str, Any]], use_tools: bool = False, extra_context: str = "") -> Dict[str, Any]:
        """
        Executes a task given its description and previous context.
        Returns a dictionary containing the output data.
        """
        pass

    def _format_context(self, context: List[Dict[str, Any]]) -> str:
        """Helper to format previous task outputs for the current agent."""
        if not context:
            return "No previous context available."
        
        formatted = "Previous tasks context:\n"
        for item in context:
            formatted += f"- Task: {item.get('title')}\n  Output: {json.dumps(item.get('output_data', {}))}\n"
        return formatted
