from .base import BaseAgent
from typing import Dict, Any, List
import openai
import json
from services.config import settings
from tools.registry import tool_registry

class OpenAIAgent(BaseAgent):
    def __init__(self, name: str, role: str, model: str = "gpt-4o", system_prompt: str = None):
        super().__init__(name, role, model, system_prompt)
        self.client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def run(self, task_description: str, context: List[Dict[str, Any]], use_tools: bool = False, extra_context: str = "") -> Dict[str, Any]:
        formatted_context = self._format_context(context)
        
        full_prompt = f"""
Task: {task_description}

{formatted_context}

{extra_context}

Please provide your output as a JSON object.
"""

        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": full_prompt}
        ]

        tools = tool_registry.get_tool_definitions() if use_tools else None

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            tools=tools,
            tool_choice="auto" if use_tools else None,
            response_format={"type": "json_object"}
        )

        message = response.choices[0].message

        # Handle tool calls
        if message.tool_calls:
            messages.append(message)
            for tool_call in message.tool_calls:
                tool_name = tool_call.function.name
                tool_args = json.loads(tool_call.function.arguments)
                
                # Execute tool
                tool_result = await tool_registry.call_tool(tool_name, tool_args)
                
                messages.append({
                    "tool_call_id": tool_call.id,
                    "role": "tool",
                    "name": tool_name,
                    "content": str(tool_result),
                })
            
            # Second call after tool execution
            final_response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                response_format={"type": "json_object"}
            )
            content = final_response.choices[0].message.content
        else:
            content = message.content

        return {
            "agent_name": self.name,
            "model": self.model,
            "raw_output": content,
            "data": json.loads(content) if content else {}
        }
