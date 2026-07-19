from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "ChainChat Notification Service"
    debug: bool = False
    database_url: str = "postgresql+asyncpg://chainchat:chainchat@localhost:5432/chainchat?options=-c%20search_path=notification"
    redis_url: str = "redis://localhost:6379/0"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
