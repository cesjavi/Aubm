from services.config import settings

def getDefaultProvider() -> str:
    if settings.ENABLE_AMD:
        return "amd"
    if settings.GROQ_API_KEY:
        return "groq"
    if settings.OPENAI_API_KEY:
        return "openai"
    return "groq" # Fallback

def getDefaultModel(provider: str) -> str:
    if provider == "amd":
        return "llama3.3-70b-instruct"
    if provider == "groq":
        return "llama-3.3-70b-versatile"
    if provider == "openai":
        return "gpt-4o"
    return "llama-3.3-70b-versatile"
