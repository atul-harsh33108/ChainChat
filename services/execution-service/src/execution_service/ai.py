from typing import Any, Protocol

import httpx

from src.execution_service.config import settings

# OpenRouter free model identifiers.
# Verify current IDs at https://openrouter.ai/models if a request 404s.
GEMMA_FREE = "google/gemma-4-31b-it:free"
NEMOTRON_FREE = "nvidia/nemotron-3-ultra-550b-a55b:free"
DEFAULT_MODEL = GEMMA_FREE


class AIProvider(Protocol):
    """Async contract for LLM completion providers."""

    model_key: str

    async def complete(self, prompt: str, system: str | None = None, **kwargs: Any) -> str:
        ...


class OpenRouterProvider:
    """OpenAI-compatible provider backed by OpenRouter.

    OpenRouter exposes an OpenAI-compatible ``/chat/completions`` endpoint, so a
    single request/response shape works for every model in its catalogue
    (Google Gemma, NVIDIA Nemotron, OpenAI, Anthropic, etc.). The API key is
    read from ``settings.openai_api_key`` — set ``OPENAI_API_KEY`` to your
    OpenRouter key.
    """

    model_key = "openrouter"
    base_url = "https://openrouter.ai/api/v1"

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.openai_api_key
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                # Optional attribution headers recommended by OpenRouter.
                "HTTP-Referer": "http://localhost:5173",
                "X-Title": "ChainChat",
            },
            timeout=60.0,
        )

    async def complete(self, prompt: str, system: str | None = None, **kwargs: Any) -> str:
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload: dict[str, Any] = {
            "model": kwargs.get("model") or DEFAULT_MODEL,
            "messages": messages,
            "temperature": kwargs.get("temperature", 0.7),
            "max_tokens": kwargs.get("max_tokens", 2048),
        }

        response = await self.client.post("/chat/completions", json=payload)
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


# Every provider key routes through OpenRouter's OpenAI-compatible endpoint.
# The actual model is chosen per execution step via ``model_key`` (e.g.
# "google/gemma-4-31b-it:free" or "nvidia/nemotron-3-ultra-550b-a55b:free").
_registry: dict[str, type] = {
    "openrouter": OpenRouterProvider,
    "openai": OpenRouterProvider,
    "anthropic": OpenRouterProvider,
    "google": OpenRouterProvider,
    "nvidia": OpenRouterProvider,
}


def get_provider(provider: str) -> AIProvider:
    provider_cls = _registry.get(provider)
    if provider_cls is None:
        raise ValueError(f"Unsupported provider: {provider}")
    return provider_cls()
