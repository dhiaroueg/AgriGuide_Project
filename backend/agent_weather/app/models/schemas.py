from pydantic import BaseModel
from typing import Optional, Literal


class Coordinate(BaseModel):
    lat: float
    lon: float


class WeatherRequest(BaseModel):
    point: Coordinate
    location_label: Optional[str] = None
    forecast_days: int = 16
    past_days: int = 0
    history_days: int = 0
    models: Optional[str] = "best_match"
    wind_speed_unit: Literal["kmh", "ms", "mph", "kn"] = "kmh"
    temperature_unit: Literal["celsius", "fahrenheit"] = "fahrenheit"


class CurrentWeather(BaseModel):
    time: Optional[str] = None
    temperature_2m: Optional[float] = None
    apparent_temperature: Optional[float] = None
    relative_humidity_2m: Optional[int] = None
    dew_point_2m: Optional[float] = None
    precipitation: Optional[float] = None
    precipitation_probability: Optional[int] = None
    weather_code: Optional[int] = None
    weather_label: Optional[str] = None
    wind_speed_10m: Optional[float] = None
    wind_direction_10m: Optional[int] = None
    wind_gusts_10m: Optional[float] = None
    wind_compass: Optional[str] = None
    surface_pressure: Optional[float] = None
    uv_index: Optional[float] = None
    uv_label: Optional[str] = None
    cloud_cover: Optional[int] = None
    visibility: Optional[float] = None
    soil_temperature_0cm: Optional[float] = None
    soil_moisture_0cm: Optional[float] = None


class AtmosphereMetrics(BaseModel):
    dew_point_c: Optional[float] = None
    dew_point_f: Optional[float] = None
    pressure_hpa: Optional[float] = None
    pressure_inhg: Optional[float] = None
    visibility_km: Optional[float] = None
    visibility_mi: Optional[float] = None
    cloud_cover_pct: Optional[int] = None
    ceiling_m: Optional[float] = None


class SoilMetrics(BaseModel):
    depth_0_1cm_temp_c: Optional[float] = None
    depth_0_1cm_temp_f: Optional[float] = None
    depth_0_1cm_moisture_m3m3: Optional[float] = None
    depth_1_3cm_temp_c: Optional[float] = None
    depth_1_3cm_temp_f: Optional[float] = None
    depth_1_3cm_moisture_m3m3: Optional[float] = None
    depth_3_9cm_temp_c: Optional[float] = None
    depth_3_9cm_temp_f: Optional[float] = None
    depth_3_9cm_moisture_m3m3: Optional[float] = None
    depth_9_27cm_temp_c: Optional[float] = None
    depth_9_27cm_temp_f: Optional[float] = None
    depth_9_27cm_moisture_m3m3: Optional[float] = None
    soil_texture_note: Optional[str] = None


class SolarMetrics(BaseModel):
    uv_index: Optional[float] = None
    uv_clear_sky: Optional[float] = None
    shortwave_radiation_wm2: Optional[float] = None
    direct_radiation_wm2: Optional[float] = None
    diffuse_radiation_wm2: Optional[float] = None
    global_tilted_irradiance_wm2: Optional[float] = None
    sunrise_local: Optional[str] = None
    sunset_local: Optional[str] = None
    sunshine_duration_h: Optional[float] = None
    day_length_h: Optional[float] = None


class HourlyForecastPoint(BaseModel):
    time: str
    temp_c: Optional[float] = None
    temp_f: Optional[float] = None
    feels_like_c: Optional[float] = None
    feels_like_f: Optional[float] = None
    humidity_pct: Optional[int] = None
    precip_mm: Optional[float] = None
    precip_in: Optional[float] = None
    precip_prob_pct: Optional[int] = None
    weather_code: Optional[int] = None
    weather_label: Optional[str] = None
    wind_speed_kmh: Optional[float] = None
    wind_gusts_kmh: Optional[float] = None
    wind_dir_deg: Optional[int] = None
    wind_compass: Optional[str] = None
    uv_index: Optional[float] = None
    cloud_cover_pct: Optional[int] = None
    solar_radiation_wm2: Optional[float] = None
    soil_temp_f: Optional[float] = None


class DailyForecastPoint(BaseModel):
    date: str
    weekday_label: Optional[str] = None
    day_month_label: Optional[str] = None
    temp_max_c: Optional[float] = None
    temp_max_f: Optional[float] = None
    temp_min_c: Optional[float] = None
    temp_min_f: Optional[float] = None
    precip_sum_mm: Optional[float] = None
    precip_sum_in: Optional[float] = None
    precip_prob_max_pct: Optional[int] = None
    wind_speed_max_kmh: Optional[float] = None
    wind_gusts_max_kmh: Optional[float] = None
    dominant_wind_dir_deg: Optional[int] = None
    dominant_wind_compass: Optional[str] = None
    sunrise_local: Optional[str] = None
    sunset_local: Optional[str] = None
    weather_code: Optional[int] = None
    weather_label: Optional[str] = None
    uv_index_max: Optional[float] = None
    et0_mm: Optional[float] = None


class TrendSeries(BaseModel):
    variable: str
    points: list[dict]
    source: Literal["forecast", "forecast+archive", "fallback", "unavailable"]


class CalendarDay(BaseModel):
    date: str
    dow: int
    week_of_year: Optional[int] = None
    variable: str
    primary_value: Optional[float] = None
    secondary_value: Optional[float] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    weather_code: Optional[int] = None
    weather_label: Optional[str] = None
    anomaly_pct: Optional[float] = None


class DecisionSignal(BaseModel):
    id: str
    title: str
    value: str
    detail: str
    tone: Literal["neutral", "good", "warning", "critical"] = "neutral"


class WeatherDashboardResponse(BaseModel):
    location_label: Optional[str] = None
    latitude: float
    longitude: float
    elevation_m: Optional[float] = None
    timezone: str
    units: dict
    source: Literal["open-meteo", "fallback", "unavailable"]
    warning: Optional[str] = None
    current: CurrentWeather
    atmosphere: AtmosphereMetrics
    soil: SoilMetrics
    solar: SolarMetrics
    hourly: list[HourlyForecastPoint]
    daily: list[DailyForecastPoint]
    trends: dict[str, TrendSeries]
    calendar_month: dict
    decision_signals: list[DecisionSignal] = []
