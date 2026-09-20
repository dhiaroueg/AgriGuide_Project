"""Chargement de la configuration de l'agent depuis les variables d'environnement (.env).

Centralise les paramètres : clés API (Mistral, recherche web), URL/collection Qdrant, etc.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_APP_DIR = Path(__file__).resolve().parent.parent.parent  # backend/agent_regulation/
_REPO_ROOT = _APP_DIR.parent.parent


class Settings(BaseSettings):
    """Paramètres de configuration de l'application, lus depuis `.env`."""

    # Racine du repo puis .env local — chemins absolus pour rester correct
    # quel que soit le CWD d'où uvicorn est lancé.
    model_config = SettingsConfigDict(
        env_file=(str(_REPO_ROOT / ".env"), str(_APP_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mistral_api_key: str
    mistral_model: str = "open-mistral-7b"
    qdrant_url: str
    qdrant_api_key: str = ""
    qdrant_collection_name: str
    web_search_api_key: str = ""
    vectorstore_path: str = "data/vectorstore"

    @field_validator(
        "mistral_api_key",
        "qdrant_url",
        "qdrant_api_key",
        "qdrant_collection_name",
        "web_search_api_key",
        "vectorstore_path",
        mode="before",
    )
    @classmethod
    def strip_strings(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value


@lru_cache
def get_settings() -> Settings:
    """Retourne l'instance (mise en cache) de configuration de l'application."""
    # Une variable d'environnement OS vide écraserait sinon la valeur du .env.
    for key in (
        "MISTRAL_API_KEY",
        "QDRANT_URL",
        "QDRANT_API_KEY",
        "QDRANT_COLLECTION_NAME",
        "WEB_SEARCH_API_KEY",
    ):
        if os.environ.get(key) == "":
            del os.environ[key]

    settings = Settings()
    if not settings.mistral_api_key:
        raise ValueError(
            "MISTRAL_API_KEY est vide. Renseignez-la dans backend/agent_regulation/.env "
            "ou dans le .env à la racine du repo."
        )

    # Expose la clé au process pour les libs qui la lisent via os.environ
    # (ex. langchain_mistralai secret_from_env).
    os.environ["MISTRAL_API_KEY"] = settings.mistral_api_key
    return settings
