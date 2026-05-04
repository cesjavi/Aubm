from .file_generator import FileGeneratorTool
from .decomposer import DecompositionTool
from .sre import SRETool
from .browser import BrowserTool
from .sandbox import CodeSandboxTool
from .visuals import VisualsTool
from typing import Any, Dict, List

class ToolRegistry:
    def __init__(self):
        self.browser = BrowserTool()
        self.sandbox = CodeSandboxTool()
        self.file_gen = FileGeneratorTool()
        self.decomposer = DecompositionTool()
        self.sre = SRETool()
        self.visuals = VisualsTool()
        self.tools = {
            "web_search": {
                "func": self.browser.google_search,
                "description": "Searches the web for a given query and returns the results."
            },
            "extract_url": {
                "func": self.browser.search_and_extract,
                "description": "Extracts text content from a specific URL."
            },
            "execute_python": {
                "func": self.sandbox.execute_python,
                "description": "Executes Python code and returns the output."
            },
            "generate_pdf": {
                "func": self.file_gen.generate_pdf,
                "description": "Generates a PDF document."
            },
            "generate_excel": {
                "func": self.file_gen.generate_excel,
                "description": "Generates an Excel spreadsheet from structured data."
            },
            "create_subtasks": {
                "func": self.decomposer.create_subtasks,
                "description": "Breaks down a goal into a list of actionable tasks."
            },
            "generate_chart": {
                "func": self.visuals.generate_chart,
                "description": "Generates a chart image (bar, line, pie) from a JSON config."
            },
            "generate_illustration": {
                "func": self.visuals.generate_illustration,
                "description": "Generates an AI illustration or drawing based on a text prompt."
            },
            "get_system_health": {
                "func": self.sre.get_system_health,
                "description": "Returns system health metrics (CPU, Memory, Disk)."
            },
            "check_service_status": {
                "func": self.sre.check_service_status,
                "description": "Checks if a specific service or process is running."
            },
            "run_patch_command": {
                "func": self.sre.run_patch_command,
                "description": "Executes a safe system patch command (e.g., git pull, npm install)."
            }
        }

    def get_tool_definitions(self) -> List[Dict[str, Any]]:
        """
        Returns OpenAI-style tool definitions.
        """
        return [
            {
                "type": "function",
                "function": {
                    "name": "web_search",
                    "description": "Search the web for information",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "The search query"}
                        },
                        "required": ["query"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "extract_url",
                    "description": "Extract text content from a URL",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "url": {"type": "string", "description": "The URL to extract from"}
                        },
                        "required": ["url"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "execute_python",
                    "description": "Execute Python code to perform calculations, data analysis, or logic verification.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "code": {"type": "string", "description": "The Python code to execute"}
                        },
                        "required": ["code"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "generate_pdf",
                    "description": "Create a professional PDF report",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string", "description": "The title of the report"},
                            "content": {"type": "string", "description": "The text content of the report"}
                        },
                        "required": ["title", "content"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "generate_excel",
                    "description": "Create an Excel spreadsheet from data",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "data": {
                                "type": "array", 
                                "items": {"type": "object"},
                                "description": "List of rows as objects"
                            }
                        },
                        "required": ["data"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "create_subtasks",
                    "description": "Break down a complex goal into smaller, actionable tasks for other agents.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "project_id": {"type": "string", "description": "The current project UUID"},
                            "tasks": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "title": {"type": "string", "description": "Clear title of the subtask"},
                                        "description": {"type": "string", "description": "Detailed instructions for the next agent"},
                                        "assigned_agent_id": {"type": "string", "description": "The UUID of the agent to handle this task"}
                                    },
                                    "required": ["title", "description", "assigned_agent_id"]
                                }
                            }
                        },
                        "required": ["project_id", "tasks"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "generate_chart",
                    "description": "Generate a visual chart image (bar, line, pie, etc.) using QuickChart.io.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "chart_type": {"type": "string", "enum": ["bar", "line", "pie", "doughnut"], "description": "Type of chart"},
                            "chart_config": {"type": "string", "description": "The JSON configuration for QuickChart (e.g., {type: 'bar', data: {...}})"}
                        },
                        "required": ["chart_type", "chart_config"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "generate_illustration",
                    "description": "Generate an AI illustration or drawing based on a prompt using Pollinations.ai.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "prompt": {"type": "string", "description": "Detailed description of the illustration to generate"}
                        },
                        "required": ["prompt"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_system_health",
                    "description": "Monitor server vital signs like CPU usage, memory availability, and disk space.",
                    "parameters": {
                        "type": "object",
                        "properties": {}
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "check_service_status",
                    "description": "Verify if a critical service or process is currently active on the host.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "service_name": {"type": "string", "description": "The name of the process or service to check"}
                        },
                        "required": ["service_name"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "run_patch_command",
                    "description": "Apply a system patch or update. Limited to safe commands like 'git pull' or 'npm install'.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "command": {"type": "string", "description": "The restricted command to execute"}
                        },
                        "required": ["command"]
                    }
                }
            }
        ]

    async def call_tool(self, name: str, arguments: Dict[str, Any]) -> Any:
        """
        Executes a tool by name with provided arguments.
        """
        if name not in self.tools:
            raise ValueError(f"Tool {name} not found")
        
        func = self.tools[name]["func"]
        return await func(**arguments)

tool_registry = ToolRegistry()
