from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.models.schemas import WeatherDashboardResponse, WeatherRequest
from app.services.weather_service import build_dashboard

router = APIRouter(prefix="/weather", tags=["weather"])
_scheme = HTTPBearer(auto_error=False)


def _optional_auth(creds: HTTPAuthorizationCredentials | None = Depends(_scheme)) -> str | None:
    if creds is None:
        return None
    tok = creds.credentials
    if tok == settings.dev_bypass_token:
        return "dev"
    if settings.jwt_secret_key and tok == settings.jwt_secret_key:
        return "static"
    return None


@router.post("/dashboard", response_model=WeatherDashboardResponse)
async def post_dashboard(
    req: WeatherRequest,
    _actor: str | None = Depends(_optional_auth),
) -> WeatherDashboardResponse:
    if not (-90 <= req.point.lat <= 90 and -180 <= req.point.lon <= 180):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Coordonnées GPS hors limites.",
        )
    return await build_dashboard(req)


@router.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "service": "agent_weather"}
