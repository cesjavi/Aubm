from services.config import settings

def getDefaultProvider() -> str:
    if settings.ENABLE_AMD:
        return "amd"
    if settings.OPENAI_API_KEY:
        return "openai"
    return "amd"

def getDefaultModel(provider: str) -> str:
    if provider == "amd":
        return "qwen3-coder-flash"
    if provider == "groq":
        return "qwen/qwen3-32b"
    if provider == "openai":
        return "qwen3-coder-flash"
    return "qwen3-coder-flash"
