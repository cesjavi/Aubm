import re
import logging
from typing import List, Dict, Any
from services.supabase_service import supabase

logger = logging.getLogger("uvicorn")

class SemanticBackpropService:
    """
    Ensures numerical consistency across agent tasks by extracting 'Canonical Numbers'
    from previous task outputs.
    """

    @staticmethod
    async def get_project_context(project_id: str, current_task_id: str) -> str:
        """
        Fetches and extracts canonical figures from all completed sibling tasks.
        """
        try:
            resp = supabase.table("tasks") \
                .select("title, output_data") \
                .eq("project_id", project_id) \
                .eq("status", "done") \
                .neq("id", current_task_id) \
                .execute()
            
            if not resp.data:
                return ""

            canonical_blocks = []
            topic_blocks = []

            for task in resp.data:
                output = task.get("output_data") or {}
                # Handle different output formats (raw string or dict with 'result')
                result_text = ""
                if isinstance(output, dict):
                    result_text = output.get("result", "") or output.get("raw_output", "")
                elif isinstance(output, str):
                    result_text = output

                if not result_text:
                    continue

                # Extract financial and numerical lines
                lines = result_text.splitlines()
                financial_lines = []
                
                # Keywords that often indicate a 'canonical' number
                keywords = [
                    "$", "%", "USD", "MRR", "ARR", "ROI", "cost", "budget", 
                    "revenue", "price", "fee", "estimate", "total", "quota"
                ]

                for line in lines:
                    if any(k.lower() in line.lower() for k in keywords):
                        if len(line.strip()) > 5: # Ignore very short lines
                            financial_lines.append(line.strip())

                if financial_lines:
                    # De-duplicate similar lines
                    seen = set()
                    unique_fin = []
                    for fl in financial_lines:
                        key = fl[:50]
                        if key not in seen:
                            seen.add(key)
                            unique_fin.append(fl)

                    canonical_blocks.append(
                        f"Source Task: **{task['title']}**\n" +
                        "\n".join(f"  • {fl}" for fl in unique_fin[:8])
                    )

                # Also track what topics were covered to avoid repetition
                topic_blocks.append(f"- **{task['title']}**: (Covered in previous step)")

            if not canonical_blocks and not topic_blocks:
                return ""

            context = "\n---\n"
            if canonical_blocks:
                context += (
                    "### ⚠️ CANONICAL FIGURES — PREVIOUSLY ESTABLISHED\n"
                    "> **MANDATORY RULE**: The following numbers and figures were established by agents\n"
                    "> responsible for those domains. You MUST use these exact values if you reference them.\n"
                    "> DO NOT re-calculate or propose alternative values for these specific items.\n\n"
                )
                context += "\n\n".join(canonical_blocks) + "\n\n"
            
            if topic_blocks:
                context += (
                    "### 📋 PREVIOUSLY COVERED TOPICS\n"
                    "> Do not repeat the analysis of these topics. Focus only on your specific task.\n"
                )
                context += "\n".join(topic_blocks) + "\n"

            return context

        except Exception as e:
            logger.error(f"Semantic Backprop failed: {e}")
            return ""

semantic_backprop = SemanticBackpropService()
