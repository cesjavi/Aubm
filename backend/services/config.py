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
    TAVILY_API_KEY: Optional[str] = None

    # Infrastructure (DigitalOcean)
    DO_API_TOKEN: Optional[str] = None
    DO_INFERENCE_KEY: Optional[str] = None
    DO_AGENT_ACCESS_KEY: Optional[str] = None
    DO_AGENT_ENDPOINT: Optional[str] = None
    DO_REGION: str = "nyc3"

    # App Config
    TASK_QUEUE_EMBEDDED_WORKER: bool = True
    TASK_QUEUE_HEARTBEAT_ENABLED: bool = True
    TASK_EXECUTION_MODE: str = "queue"  # direct | queue
    TASK_QUEUE_IDLE_POLL_SECONDS: int = 60
    OUTPUT_LANGUAGE: str = "en"
    PORT: int = 8000
    SENTRY_DSN: Optional[str] = None
    ENABLE_AMD: bool = True
    
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
        "groq":        {"enabled": True,  "default_model": "qwen/qwen3-32b",           "temperature": 0.7, "max_tokens": 4096},
        "openai":      {"enabled": True,  "default_model": "qwen3-coder-flash",        "temperature": 0.7, "max_tokens": 4096},
        "openrouter":  {"enabled": True,  "default_model": "google/gemini-2.0-flash",  "temperature": 0.7, "max_tokens": 8192},
        "gemini":      {"enabled": True,  "default_model": "gemini-2.0-flash",         "temperature": 0.7, "max_tokens": 8192},
        "amd":         {"enabled": True,  "default_model": "qwen3-coder-flash",                       "temperature": 0.7, "max_tokens": 4096, "base_url": "https://inference.do-ai.run/v1"},
        "ollama":      {"enabled": True,  "default_model": "qwen2.5",                  "temperature": 0.7, "base_url": "http://localhost:11434"},
        "model_pricing": {
            "amd:qwen3-coder-flash": {"input_per_1k": 0.0006, "output_per_1k": 0.0018},
            "groq:qwen/qwen3-32b": {"input_per_1k": 0.00059, "output_per_1k": 0.00079},
            "openai:qwen3-coder-flash": {"input_per_1k": 0.0006, "output_per_1k": 0.0018},
            "gemini:gemini-2.0-flash": {"input_per_1k": 0.0001, "output_per_1k": 0.0004},
            "gemini:gemini-1.5-pro": {"input_per_1k": 0.00125, "output_per_1k": 0.00375}
        }
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

config_service = ConfigService()
