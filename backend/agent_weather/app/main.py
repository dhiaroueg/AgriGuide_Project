from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers.weather import router as weather_router

app = FastAPI(
    title="AgriMent — Agent Weather (dashboard météo)",
    description="Dashboard météo complet à 4 onglets + prévisions 24h/15j + tendances + calendrier. Data: Open-Meteo (sans clé).",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

app.include_router(weather_router, prefix="/api/v1")


@app.get("/", tags=["meta"])
def index() -> dict:
    return {
        "name": "agent_weather",
        "health": "/api/v1/weather/health",
        "dashboard_endpoint": "POST /api/v1/weather/dashboard",
        "apis_used": [
            "Open-Meteo Forecast  (sans clé) : /v1/forecast",
            "Open-Meteo Archive   (sans clé) : /v1/archive",
            "Open-Meteo Elevation (sans clé) : /v1/elevation",
        ],
    }
