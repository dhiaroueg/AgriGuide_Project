from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

_APP_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_APP_DIR.parent.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    open_meteo_base: str = "https://api.open-meteo.com/v1/forecast"
    open_meteo_archive_base: str = "https://archive-api.open-meteo.com/v1/archive"
    open_meteo_elevation_base: str = "https://api.open-meteo.com/v1/elevation"
    open_meteo_ensemble_base: str = "https://ensemble-api.open-meteo.com/v1/ensemble"
    open_meteo_seasonal_base: str = "https://seasonal-api.open-meteo.com/v1/seasonal"
    open_meteo_satellite_base: str = "https://satellite-api.open-meteo.com/v1/archive"
    open_meteo_flood_base: str = "https://flood-api.open-meteo.com/v1/flood"

    dev_bypass_token: str = "00000000-0000-0000-0000-000000000000"
    jwt_secret_key: str = "changeme-generate-a-long-random-secret"

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]


settings = Settings()
