import os
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    
    # AI Providers
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
    GROQ_API_KEY: Optional[str] = os.getenv("GROQ_API_KEY")
    GEMINI_API_KEY: Optional[str] = os.getenv("GEMINI_API_KEY")
    ANTHROPIC_API_KEY: Optional[str] = os.getenv("ANTHROPIC_API_KEY")
    AMD_API_KEY: Optional[str] = os.getenv("AMD_API_KEY")
    
    # App Config
    TASK_QUEUE_EMBEDDED_WORKER: bool = os.getenv("TASK_QUEUE_EMBEDDED_WORKER", "true").lower() == "true"
    OUTPUT_LANGUAGE: str = os.getenv("OUTPUT_LANGUAGE", "en")
    PORT: int = int(os.getenv("PORT", 8000))
    
    class Config:
        env_file = ".env"

settings = Settings()
