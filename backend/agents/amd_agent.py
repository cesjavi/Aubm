from .base import BaseAgent
from typing import Dict, Any, List
import openai
import json
from services.config import settings

class AMDAgent(BaseAgent):
    """
    Agent implementation for AMD Inference (inference.do-ai.run).
    Compatible with OpenAI's API format.
    """
    def __init__(self, name: str, role: str, model: str = "gpt-4o", system_prompt: str = None):
        super().__init__(name, role, model, system_prompt)
        # Using the provided AMD inference endpoint
        self.client = openai.AsyncOpenAI(
            api_key=settings.AMD_API_KEY,
            base_url="https://inference.do-ai.run/v1"
        )

    async def run(self, task_description: str, context: List[Dict[str, Any]]) -> Dict[str, Any]:
        formatted_context = self._format_context(context)
        
        full_prompt = f"""
Task: {task_description}

{formatted_context}

Please provide your output as a JSON object.
"""

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": full_prompt}
                ],
                response_format={"type": "json_object"}
            )

            content = response.choices[0].message.content
            return {
                "agent_name": self.name,
                "provider": "amd",
                "model": self.model,
                "raw_output": content,
                "data": json.loads(content) if content else {}
            }
        except Exception as e:
            return {
                "agent_name": self.name,
                "provider": "amd",
                "status": "error",
                "error": str(e)
            }
