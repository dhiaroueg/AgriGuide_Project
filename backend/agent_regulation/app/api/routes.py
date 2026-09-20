"""Routes FastAPI exposées par l'agent de régulation.

Expose les endpoints permettant d'interroger l'agent (questions réglementaires,
recherche d'aides, remplissage/révision de documents) et de consulter/mettre à
jour les aides financières mises en cache en base (table `subsidies`).
"""

import app.boot_encoding  # noqa: F401

from fastapi import APIRouter, HTTPException

from app.agent.regulation_agent import RegulationAgent
from app.schemas.chat import ChatRequest, ChatResponse
from app.schemas.subsidy import Subsidy, SubsidyListResponse, SubsidySyncResult
from app.services import subsidy_store_service
from app.services.subsidy_sync_service import sync_subsidies

router = APIRouter()
_agent: RegulationAgent | None = None


def _get_agent() -> RegulationAgent:
    """Instancie l'agent à la première requête (après chargement du .env)."""
    global _agent
    if _agent is None:
        try:
            _agent = RegulationAgent()
        except ValueError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    return _agent


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    """Répond à une question de réglementation agricole via le RAG hybride."""
    try:
        answer = _get_agent().answer(
            request.question,
            history=request.history or None,
            memories=request.memories or None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        # Renvoie une erreur HTTP propre (avec en-têtes CORS) plutôt qu'un 500
        # non géré que le navigateur affiche souvent comme une erreur CORS.
        raise HTTPException(
            status_code=502,
            detail=f"Échec de l'appel à l'agent Régulation : {exc}",
        ) from exc
    return ChatResponse(answer=answer)


@router.get("/subsidies", response_model=SubsidyListResponse)
def list_subsidies(limit: int = 4) -> SubsidyListResponse:
    """Aides financières actives, triées par échéance la plus proche (cache
    PostgreSQL — pas de recherche web à chaque appel, voir `subsidy_store_service`)."""
    try:
        rows = subsidy_store_service.list_active_subsidies(limit=limit)
        return SubsidyListResponse(subsidies=[Subsidy(**row) for row in rows])
    except Exception:
        # PostgreSQL indisponible en dev : retourne une liste vide plutôt qu'un 500.
        return SubsidyListResponse(subsidies=[])


@router.post("/subsidies/sync", response_model=SubsidySyncResult)
def trigger_subsidies_sync() -> SubsidySyncResult:
    """Déclenche manuellement une synchronisation des aides (Subsidy Search ->
    table `subsidies`). Pas encore planifiée automatiquement (voir
    `subsidy_sync_service` pour brancher un scheduler plus tard)."""
    return sync_subsidies()
