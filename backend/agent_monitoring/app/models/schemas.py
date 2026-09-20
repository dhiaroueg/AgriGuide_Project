"""Schémas d'entrée / sortie de l'agent Monitoring."""
from typing import Optional

from pydantic import BaseModel, Field


class LocationInput(BaseModel):
    latitude: float
    longitude: float
    label: Optional[str] = None


class CropContext(BaseModel):
    crop_name: str
    hectares: float = Field(gt=0)
    growth_stage: Optional[str] = None
    soil_type: Optional[str] = None
    water_sensitivity: Optional[str] = None  # low | moderate | high


class AnalyzeRequest(BaseModel):
    """Contexte ferme réel fourni par le frontend (auth + décision business)."""

    farmer_name: str
    location: LocationInput
    crops: list[CropContext] = Field(min_length=1)
    hardware_inventory: list[str] = Field(default_factory=list)
    terrain_id: Optional[str] = None


class WeatherSummary(BaseModel):
    location_label: Optional[str] = None
    today_max_temp_c: Optional[float] = None
    today_min_temp_c: Optional[float] = None
    current_temp_c: Optional[float] = None
    precipitation_sum_mm: Optional[float] = None
    precipitation_probability_pct: Optional[float] = None
    max_wind_speed_kmh: Optional[float] = None
    conditions_label: Optional[str] = None
    note: Optional[str] = None


class CropAlert(BaseModel):
    crop: str
    risk: str  # low | medium | high
    message: str
    action: str


class AnalysisResult(BaseModel):
    has_alert: bool
    alert_message: Optional[str] = None
    daily_advice: str
    water_saving_technique: str
    tasks: list[str] = Field(default_factory=list)
    crop_alerts: list[CropAlert] = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
    farmer_name: str
    location: Optional[str] = None
    terrain_id: Optional[str] = None
    crops: list[CropContext]
    weather_summary: WeatherSummary
    analysis: AnalysisResult
