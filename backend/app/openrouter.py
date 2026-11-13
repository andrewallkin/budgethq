"""Shared OpenRouter client. The API key is the one each user stores in Settings."""

from openai import OpenAI

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_MODEL = "google/gemini-2.5-flash"


def openrouter_client(api_key: str) -> OpenAI:
    return OpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=api_key,
        timeout=120.0,
        max_retries=2,
    )
