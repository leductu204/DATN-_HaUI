from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    database_url: str = "sqlite:///./app.db"

    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3:4b"

    comfy_base_url: str = "http://127.0.0.1:8188"
    comfy_timeout_seconds: float = 300.0


settings = Settings()
