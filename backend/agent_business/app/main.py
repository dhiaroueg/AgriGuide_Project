from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Repo-root .env (MISTRAL_API_KEY, MARKET_DATA_DIR, …)
def _repo_env_path() -> Path | None:
    """Locate the repository .env locally without breaking the Docker image."""
    for parent in Path(__file__).resolve().parents:
        candidate = parent / ".env"
        if candidate.is_file():
            return candidate
    return None


_REPO_ENV = _repo_env_path()
if _REPO_ENV is not None:
    load_dotenv(_REPO_ENV)
load_dotenv()  # also allow backend/agent_business/.env overrides

# Import after configuration loading: business modules read environment values
# during initialization.
from app.routers.business import router as business_router

app = FastAPI(title="AgriAdvisor — Agent Business", version="0.2.0")

# Dev only : le frontend (Vite) tourne sur un port différent de ce service.
# À restreindre à l'origine réelle du frontend une fois déployé.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(business_router)


@app.get("/health")
def health():
    from app.market_intelligence.provider import market_pipeline_status

    return {
        "status": "ok",
        "agent": "business",
        "market": market_pipeline_status(),
    }
