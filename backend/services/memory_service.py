import logging
from typing import List, Dict, Any, Optional
from services.supabase_service import supabase
from services.embedding_service import embedding_service

logger = logging.getLogger("uvicorn")

class MemoryService:
    """
    Handles vectorized long-term memory for Aubm projects.
    Allows agents to retrieve context from past projects and approved work.
    """

    async def save_memory(
        self,
        project_id: str,
        content: str,
        task_id: Optional[str] = None,
        memory_type: str = "approved_output",
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Vectorizes content and saves it to project_memory.
        """
        try:
            if not content or len(content.strip()) < 10:
                return False

            embedding = await embedding_service.get_embedding(content)
            
            data = {
                "project_id": project_id,
                "task_id": task_id,
                "content": content,
                "embedding": embedding,
                "memory_type": memory_type,
                "metadata": metadata or {}
            }
            
            result = supabase.table("project_memory").insert(data).execute()
            return len(result.data) > 0
        except Exception as e:
            logger.error(f"Failed to save memory: {e}")
            return False

    async def search_memory(
        self,
        query: str,
        limit: int = 5,
        threshold: float = 0.7,
        project_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Performs semantic search across project memory.
        If project_id is provided, filters memory to that project only (short-term).
        If project_id is None, searches cross-project (long-term).
        """
        try:
            query_embedding = await embedding_service.get_embedding(query)
            
            # Use the match_project_memory RPC function defined in add_vector_memory.sql
            rpc_params = {
                "query_embedding": query_embedding,
                "match_threshold": threshold,
                "match_count": limit,
            }
            
            if project_id:
                rpc_params["filter_project_id"] = project_id

            result = supabase.rpc("match_project_memory", rpc_params).execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Failed to search memory: {e}")
            return []

    async def index_task_output(self, task: Dict[str, Any]) -> bool:
        """
        Specialized indexer for approved task outputs.
        """
        output_data = task.get("output_data")
        if not output_data:
            return False
            
        # Extract meaningful text from output
        content = ""
        if isinstance(output_data, str):
            content = output_data
        elif isinstance(output_data, dict):
            # Try to get the primary content
            content = (
                output_data.get("data") or 
                output_data.get("strategicConclusion") or 
                output_data.get("raw_output") or
                str(output_data)
            )
        
        if not content:
            return False

        return await self.save_memory(
            project_id=task.get("project_id"),
            task_id=task.get("id"),
            content=str(content),
            memory_type="approved_output",
            metadata={
                "task_title": task.get("title"),
                "agent_id": task.get("assigned_agent_id")
            }
        )

    async def analyze_rejection(self, task_id: str, feedback: Optional[str] = None):
        """
        Analyzes a task rejection to generate a 'Self-Optimization Lesson'.
        Triggered when a human rejects an agent's output.
        """
        try:
            # 1. Fetch task and its failed output
            task_res = supabase.table("tasks").select("*, projects(name, description)").eq("id", task_id).single().execute()
            if not task_res.data:
                return
            
            task = task_res.data
            output = task.get("output_data") or {}
            
            # 2. Get an analyst agent
            from agents.agent_factory import AgentFactory
            from services.llm_config import getDefaultProvider, getDefaultModel
            
            provider = getDefaultProvider()
            model = getDefaultModel(provider)
            
            analyst = AgentFactory.get_agent(
                provider=provider,
                name="Optimization Analyst",
                role="Self-Optimization Expert",
                model=model,
                system_prompt="You analyze task rejections. Your goal is to produce a single, concise 'Lesson Learned' that the next agent should follow to avoid repeating the mistake. Focus on the core reason for rejection."
            )
            
            # 3. Construct prompt for analysis
            analysis_prompt = f"""
            TASK: {task.get('title')}
            DESCRIPTION: {task.get('description')}
            
            REJECTED OUTPUT:
            {str(output)[:2000]}
            
            HUMAN FEEDBACK: {feedback or "No explicit feedback provided, but the output did not meet quality standards."}
            
            Provide a concise 'LESSON LEARNED' for the next agent. Start with 'Next time, you must...'
            """
            
            result = await analyst.run(analysis_prompt, [])
            lesson_text = result.get("raw_output") or result.get("data")
            
            if lesson_text:
                await self.save_memory(
                    project_id=task.get("project_id"),
                    task_id=task_id,
                    content=f"Optimization Lesson for '{task.get('title')}': {lesson_text}",
                    memory_type="self_optimization_lesson",
                    metadata={
                        "original_task_id": task_id,
                        "was_rejected": True,
                        "feedback": feedback
                    }
                )
                logger.info(f"Saved self-optimization lesson for task {task_id}")
                
        except Exception as e:
            logger.error(f"Failed to analyze rejection for task {task_id}: {e}")

memory_service = MemoryService()
