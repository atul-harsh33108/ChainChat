from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "ChainChat Billing Service"
    debug: bool = False
    database_url: str = "postgresql+asyncpg://chainchat:chainchat@localhost:5432/chainchat?options=-c%20search_path=billing"
    redis_url: str = "redis://localhost:6379/0"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_id: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
