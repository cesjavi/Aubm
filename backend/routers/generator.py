from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import List, Optional
import json
import logging
import groq
from services.supabase_service import supabase
from services.config import settings, config_service
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger("aubm.generator")

def _parse_json_output(content: str):
    """Robust JSON parsing from LLM output."""
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
            object_start = content.find("{")
            end = content.rfind("}")
            clean = content[object_start:end + 1] if object_start != -1 and end != -1 else content
        return json.loads(clean)
    except Exception:
        return {"name": "Generation Failed", "description": content, "context": ""}

@router.post("/generate-project")
async def generate_project(
    prompt: str = Form(...),
    files: List[UploadFile] = File(None)
):
    """
    Generates a project structure from a natural language prompt and reference files.
    """
    logger.info("Generating project structure for prompt: %s", prompt[:50])
    
    # 1. Extract context from files
    file_contexts = []
    if files:
        for file in files:
            content = await file.read()
            try:
                text = content.decode("utf-8")
                file_contexts.append(f"File: {file.filename}\nContent:\n{text}")
            except Exception as e:
                logger.warning("Could not decode file %s: %s", file.filename, e)

    full_context = "\n\n".join(file_contexts)
    
    # 2. Prepare LLM prompt
    system_prompt = """
    You are an expert Project Architect for the Aubm platform.
    Your goal is to take a user prompt and reference documents to create a structured project definition.
    
    Return ONLY a valid JSON object with the following keys:
    {
      "name": "Short Professional Name",
      "description": "High level summary",
      "context": "Detailed constraints, objectives, and requirements extracted from docs.",
      "sources": [{"kind": "note", "label": "Analysis Note", "content": "..."}]
    }
    """
    
    user_message = f"User Prompt: {prompt}\n\nReference Context:\n{full_context}"
    
    try:
        # 3. Call Groq
        provider_config = config_service.get_provider_config("groq")
        api_key = provider_config.get("api_key") or settings.GROQ_API_KEY
        
        if not api_key:
            logger.error("GROQ_API_KEY is missing in settings and config")
            raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")

        client = groq.AsyncGroq(api_key=api_key)
        
        # Use llama-3.3-70b-versatile to match GroqAgent.py
        model_name = provider_config.get("default_model") or "llama-3.3-70b-versatile"
        logger.info("Calling Groq with model: %s (Key: %s...)", model_name, api_key[:8] if api_key else "None")

        response = await client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            temperature=0.3,
            max_tokens=2048
        )
        
        response_text = response.choices[0].message.content
        logger.info("Groq raw response received (%d chars)", len(response_text) if response_text else 0)
        data = _parse_json_output(response_text)
        return data
        
    except Exception as e:
        logger.exception("Project generation failed")
        error_type = type(e).__name__
        error_msg = str(e)
        if "401" in error_msg:
            error_msg = "Invalid API Key - Please check your Groq Dashboard and .env"
        raise HTTPException(status_code=500, detail=f"AI Error ({error_type}): {error_msg}")
