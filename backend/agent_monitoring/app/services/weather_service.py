"""Client Open-Meteo pour le briefing quotidien."""
from __future__ import annotations

import requests

from app.config import settings
from app.models.schemas import WeatherSummary

# Codes WMO Open-Meteo → libellé FR court
_WMO_LABELS: dict[int, str] = {
    0: "Ciel dégagé",
    1: "Peu nuageux",
    2: "Partiellement nuageux",
    3: "Couvert",
    45: "Brouillard",
    48: "Brouillard givrant",
    51: "Bruine légère",
    53: "Bruine",
    55: "Bruine dense",
    61: "Pluie faible",
    63: "Pluie modérée",
    65: "Pluie forte",
    71: "Neige faible",
    80: "Averses",
    81: "Averses modérées",
    82: "Averses fortes",
    95: "Orage",
    96: "Orage avec grêle",
    99: "Orage violent",
}


def _conditions_label(weather_code: int | None) -> str | None:
    if weather_code is None:
        return None
    return _WMO_LABELS.get(weather_code, f"Code météo {weather_code}")


def fetch_weather_summary(
    latitude: float,
    longitude: float,
    location_label: str | None = None,
) -> WeatherSummary:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": [
            "temperature_2m",
            "relative_humidity_2m",
            "precipitation",
            "weather_code",
            "wind_speed_10m",
        ],
        "daily": [
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_sum",
            "precipitation_probability_max",
            "wind_speed_10m_max",
            "weather_code",
        ],
        "forecast_days": 1,
        "timezone": "auto",
        "wind_speed_unit": "kmh",
        "temperature_unit": "celsius",
    }
    try:
        response = requests.get(settings.open_meteo_base, params=params, timeout=10)
        if response.status_code != 200:
            return WeatherSummary(
                location_label=location_label,
                note=f"Open-Meteo indisponible (HTTP {response.status_code}).",
            )
        payload = response.json()
        current = payload.get("current") or {}
        daily = payload.get("daily") or {}
        weather_code = current.get("weather_code")
        if weather_code is None:
            weather_code = (daily.get("weather_code") or [None])[0]
        return WeatherSummary(
            location_label=location_label,
            today_max_temp_c=(daily.get("temperature_2m_max") or [None])[0],
            today_min_temp_c=(daily.get("temperature_2m_min") or [None])[0],
            current_temp_c=current.get("temperature_2m"),
            precipitation_sum_mm=(daily.get("precipitation_sum") or [None])[0],
            precipitation_probability_pct=(daily.get("precipitation_probability_max") or [None])[0],
            max_wind_speed_kmh=current.get("wind_speed_10m")
            or (daily.get("wind_speed_10m_max") or [None])[0],
            conditions_label=_conditions_label(weather_code),
        )
    except Exception as exc:  # noqa: BLE001
        return WeatherSummary(
            location_label=location_label,
            note=f"Météo indisponible: {exc}",
        )
