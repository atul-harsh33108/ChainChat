from typing import Any, Protocol

import httpx
import structlog

from src.execution_service.config import settings

logger = structlog.get_logger()


class AIProvider(Protocol):
    """Async contract for LLM completion providers."""

    model_key: str

    async def complete(self, prompt: str, system: str | None = None, **kwargs: Any) -> str:
        ...


class OpenAIProvider:
    """OpenAI chat completions provider."""

    model_key = "openai"
    base_url = "https://api.openai.com/v1"

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.openai_api_key
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=60.0,
        )

    async def complete(self, prompt: str, system: str | None = None, **kwargs: Any) -> str:
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": kwargs.get("model", "gpt-4o-mini"),
            "messages": messages,
            "temperature": kwargs.get("temperature", 0.7),
            "max_tokens": kwargs.get("max_tokens", 2048),
        }

        response = await self.client.post("/chat/completions", json=payload)
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


class AnthropicProvider:
    """Anthropic messages provider."""

    model_key = "anthropic"
    base_url = "https://api.anthropic.com"

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.anthropic_api_key
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            timeout=60.0,
        )

    async def complete(self, prompt: str, system: str | None = None, **kwargs: Any) -> str:
        payload: dict[str, Any] = {
            "model": kwargs.get("model", "claude-3-5-sonnet-20241022"),
            "max_tokens": kwargs.get("max_tokens", 2048),
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            payload["system"] = system
        if "temperature" in kwargs:
            payload["temperature"] = kwargs["temperature"]

        response = await self.client.post("/v1/messages", json=payload)
        response.raise_for_status()
        data = response.json()
        return data["content"][0]["text"]


# Registry keyed by provider identifier. Model keys are passed to the provider itself.
_registry: dict[str, type] = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
}


def get_provider(provider: str) -> AIProvider:
    provider_cls = _registry.get(provider)
    if provider_cls is None:
        raise ValueError(f"Unsupported provider: {provider}")
    return provider_cls()
