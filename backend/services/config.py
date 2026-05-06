import os
from pydantic_settings import BaseSettings
from typing import Optional, Dict, Any
from supabase import create_client, Client

class Settings(BaseSettings):
    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    
    # AI Providers
    OPENAI_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    AMD_API_KEY: Optional[str] = None
    
    # App Config
    TASK_QUEUE_EMBEDDED_WORKER: bool = True
    OUTPUT_LANGUAGE: str = "en"
    PORT: int = 8000
    SENTRY_DSN: Optional[str] = None
    
    model_config = {
        "env_file": ".env",
        "extra": "ignore"
    }

settings = Settings()

class ConfigService:
    """
    Manages application-wide settings stored in Supabase with local fallback defaults.
    Borrowed from AgentCollab for enhanced flexibility.
    """
    _cache: Dict[str, Any] = {}
    _supabase: Client = None

    @classmethod
    def _get_supabase(cls):
        if not cls._supabase:
            if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
                return None
            cls._supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        return cls._supabase

    # Defaults used when DB has no config entry for a provider
    _DEFAULTS: Dict[str, Any] = {
        "groq":        {"enabled": True,  "default_model": "llama-3.3-70b-versatile", "temperature": 0.7, "max_tokens": 4096},
        "openai":      {"enabled": True,  "default_model": "gpt-4o",                   "temperature": 0.7, "max_tokens": 4096},
        "openrouter":  {"enabled": True,  "default_model": "google/gemini-2.0-flash",  "temperature": 0.7, "max_tokens": 8192},
        "gemini":      {"enabled": True,  "default_model": "gemini-2.0-flash",         "temperature": 0.7, "max_tokens": 8192},
        "amd":         {"enabled": True,  "default_model": "gpt-4o",                   "temperature": 0.7, "max_tokens": 4096, "base_url": "https://inference.do-ai.run/v1"},
        "ollama":      {"enabled": True,  "default_model": "llama3.1:8b",              "temperature": 0.7, "base_url": "http://localhost:11434"},
    }

    @classmethod
    def get_provider_config(cls, provider: str) -> Dict[str, Any]:
        """Returns config for a provider from cache, DB, then defaults."""
        cache_key = f"provider:{provider}"
        if cache_key in cls._cache:
            return cls._cache[cache_key]
        
        db = cls._get_supabase()
        if db:
            try:
                resp = db.table("app_config").select("*").eq("key", provider).execute()
                if resp.data and len(resp.data) > 0:
                    cls._cache[cache_key] = resp.data[0]["value"]
                    return cls._cache[cache_key]
            except Exception:
                pass # Fall through to defaults

        result = cls._DEFAULTS.get(provider, {})
        cls._cache[cache_key] = result
        return result

    @classmethod
    def get_global_setting(cls, key: str, default: Any = None) -> Any:
        cache_key = f"global:{key}"
        if cache_key in cls._cache:
            return cls._cache[cache_key]
        
        db = cls._get_supabase()
        if db:
            try:
                resp = db.table("app_config").select("*").eq("key", key).execute()
                if resp.data and len(resp.data) > 0:
                    cls._cache[cache_key] = resp.data[0]["value"]
                    return cls._cache[cache_key]
            except Exception:
                pass

        return default

    @classmethod
    def invalidate_cache(cls) -> None:
        cls._cache.clear()

config_service = ConfigService()
