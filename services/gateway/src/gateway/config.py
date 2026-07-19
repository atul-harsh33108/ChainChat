from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "ChainChat Gateway"
    debug: bool = False
    redis_url: str = "redis://localhost:6379/0"
    clerk_jwks_url: str = ""
    auth_service_url: str = "http://localhost:8001"
    workflow_service_url: str = "http://localhost:8002"
    execution_service_url: str = "http://localhost:8003"
    billing_service_url: str = "http://localhost:8004"
    notification_service_url: str = "http://localhost:8005"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
