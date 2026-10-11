from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from environment variables (12-factor)."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="MUSIC_", extra="ignore")

    app_env: str = "local"
    database_url: str = "sqlite:///./data/musicplayer.db"
    storage_dir: Path = Path("./data/songs")
    cors_origins: list[str] = ["http://localhost:5173"]
    max_upload_bytes: int = 100 * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
