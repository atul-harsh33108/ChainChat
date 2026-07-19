from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "ChainChat Execution Service"
    debug: bool = False
    database_url: str = "postgresql+asyncpg://chainchat:chainchat@localhost:5432/chainchat?options=-c%20search_path=execution"
    redis_url: str = "redis://localhost:6379/0"
    openai_api_key: str = ""
    anthropic_api_key: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
