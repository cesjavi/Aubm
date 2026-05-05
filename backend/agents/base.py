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

    def _build_json_prompt(self, task_description: str, context: List[Dict[str, Any]], extra_context: str = "") -> str:
        return f"""
Task: {task_description}

{self._format_context(context)}

{extra_context}

Please provide your output as a JSON object.
"""

    def _build_chat_messages(self, task_description: str, context: List[Dict[str, Any]], extra_context: str = "") -> List[Dict[str, Any]]:
        return [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": self._build_json_prompt(task_description, context, extra_context)}
        ]

    def _parse_json_output(self, content: str) -> Any:
        """Parse strict JSON first, then tolerate fenced or prefixed JSON."""
        if not content:
            return {}

        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass

        try:
            if "```json" in content:
                clean = content.split("```json", 1)[1].split("```", 1)[0].strip()
            elif "```" in content:
                clean = content.split("```", 1)[1].split("```", 1)[0].strip()
            else:
                object_start, array_start = content.find("{"), content.find("[")
                starts = [index for index in (object_start, array_start) if index != -1]
                start = min(starts) if starts else -1
                if start == array_start:
                    end = content.rfind("]")
                else:
                    end = content.rfind("}")
                clean = content[start:end + 1] if start != -1 and end != -1 else content
            return json.loads(clean)
        except Exception:
            return {"raw_text": content}

    def _parse_tool_arguments(self, arguments: str | None) -> Dict[str, Any]:
        parsed = self._parse_json_output(arguments or "{}")
        return parsed if isinstance(parsed, dict) else {}

    async def _append_tool_results(self, messages: List[Dict[str, Any]], tool_calls: Any, tool_registry: Any) -> None:
        for tool_call in tool_calls or []:
            tool_name = tool_call.function.name
            tool_args = self._parse_tool_arguments(tool_call.function.arguments)
            tool_result = await tool_registry.call_tool(tool_name, tool_args)

            messages.append({
                "tool_call_id": tool_call.id,
                "role": "tool",
                "name": tool_name,
                "content": str(tool_result),
            })

    def _result(self, provider: str, content: str) -> Dict[str, Any]:
        return {
            "agent_name": self.name,
            "provider": provider,
            "model": self.model,
            "raw_output": content,
            "data": self._parse_json_output(content)
        }
