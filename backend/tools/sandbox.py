import sys
import io
import contextlib
import logging

logger = logging.getLogger("uvicorn")

class CodeSandboxTool:
    """
    A tool that allows agents to execute Python code and see the output.
    """
    async def execute_python(self, code: str) -> str:
        """
        Executes the provided Python code and returns the stdout/stderr.
        """
        logger.info("CodeSandboxTool: Executing Python code")
        
        # Capture stdout and stderr
        stdout = io.StringIO()
        stderr = io.StringIO()
        
        try:
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                # Using a fresh globals dictionary for each execution
                exec_globals = {}
                exec(code, exec_globals)
            
            output = stdout.getvalue()
            errors = stderr.getvalue()
            
            if errors:
                return f"Output:\n{output}\nErrors:\n{errors}"
            return output if output else "Execution successful (no output)."
            
        except Exception as e:
            return f"Execution failed: {str(e)}"
        finally:
            stdout.close()
            stderr.close()
