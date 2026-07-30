from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings


def strip_libpq_options(value: str) -> str:
    """Drop the libpq-only ``?options=-c search_path=...`` query parameter.

    asyncpg's ``connect()`` has no ``options`` keyword, so leaving it in the URL
    raises ``TypeError``. Every table already declares its schema explicitly via
    ``__table_args__`` (and the migrations use ``schema=``), so no search_path is
    needed.
    """
    parts = urlsplit(value)
    if not parts.query:
        return value
    kept = [(key, val) for key, val in parse_qsl(parts.query) if key != "options"]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(kept), parts.fragment))


class Settings(BaseSettings):
    app_name: str = "ChainChat Execution Service"
    debug: bool = False
    database_url: str = "postgresql+asyncpg://chainchat:chainchat@localhost:5432/chainchat"
    redis_url: str = "redis://localhost:6379/0"
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    @field_validator("database_url")
    @classmethod
    def _clean_database_url(cls, value: str) -> str:
        return strip_libpq_options(value)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
