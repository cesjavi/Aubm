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

    async def _run_openai_compatible(
        self, 
        provider: str, 
        create_fn, 
        task_description: str, 
        context: List[Dict[str, Any]], 
        use_tools: bool = False, 
        extra_context: str = "",
        **extra_kwargs
    ) -> Dict[str, Any]:
        """
        Unified runner for OpenAI-compatible APIs (OpenAI, Groq, etc.)
        """
        from tools.registry import tool_registry
        
        messages = self._build_chat_messages(task_description, context, extra_context)
        
        is_reasoning_model = "gpt-oss-" in self.model or self.model.startswith("o1-") or self.model.startswith("o3-")
        
        kwargs = {
            "model": self.model,
            "messages": messages,
            **extra_kwargs
        }

        # Handle temperature/max_tokens based on model type
        if is_reasoning_model:
            # Reasoning models prefer temperature 1.0 or none
            kwargs["temperature"] = extra_kwargs.get("temperature", 1.0)
            # Use max_completion_tokens if provided, otherwise default to max_tokens logic but renamed
            if "max_completion_tokens" not in kwargs:
                kwargs["max_completion_tokens"] = getattr(self, "max_tokens", 4096)
            # Standard max_tokens is often forbidden in reasoning models
            kwargs.pop("max_tokens", None)
        else:
            kwargs["temperature"] = getattr(self, "temperature", 0.7)
            kwargs["max_tokens"] = getattr(self, "max_tokens", 4096)
        
        if use_tools:
            # Note: Many reasoning models don't support tools yet, but we'll include if requested
            kwargs["tools"] = tool_registry.get_tool_definitions()
            kwargs["tool_choice"] = "auto"

        response = await create_fn(**kwargs)
        message = response.choices[0].message

        # Handle tool calls
        if message.tool_calls:
            messages.append(message)
            await self._append_tool_results(messages, message.tool_calls, tool_registry)
            
            # Second call after tool execution
            # Remove tools from second call to force a final answer
            kwargs.pop("tools", None)
            kwargs.pop("tool_choice", None)
            
            final_response = await create_fn(**kwargs)
            content = final_response.choices[0].message.content
        else:
            content = message.content

        return self._result(provider, content or "")

    def _result(self, provider: str, content: str) -> Dict[str, Any]:
        return {
            "agent_name": self.name,
            "provider": provider,
            "model": self.model,
            "raw_output": content,
            "data": self._parse_json_output(content)
        }
