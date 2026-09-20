from __future__ import annotations

import asyncio
import math
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings
from app.models.schemas import (
    AtmosphereMetrics,
    CalendarDay,
    CurrentWeather,
    DecisionSignal,
    DailyForecastPoint,
    HourlyForecastPoint,
    SoilMetrics,
    SolarMetrics,
    TrendSeries,
    WeatherDashboardResponse,
    WeatherRequest,
)


def _c_to_f(c: Optional[float]) -> Optional[float]:
    return None if c is None else c * 9 / 5 + 32


def _mm_to_in(mm: Optional[float]) -> Optional[float]:
    return None if mm is None else mm / 25.4


def _kmh_to_mph(kmh: Optional[float]) -> Optional[float]:
    return None if kmh is None else kmh / 1.609344


def _hpa_to_inhg(hpa: Optional[float]) -> Optional[float]:
    return None if hpa is None else hpa / 33.86389


def _km_to_mi(km: Optional[float]) -> Optional[float]:
    return None if km is None else km / 1.609344


def _wind_compass(deg: Optional[float]) -> Optional[str]:
    if deg is None:
        return None
    dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"]
    i = round((deg % 360) / 22.5) % 16
    return dirs[i]


_WMO_LABELS: dict[int, tuple[str, str]] = {
    0: ("Clear", "Ciel dégagé"),
    1: ("Mainly clear", "Peu nuageux"),
    2: ("Partly cloudy", "Partiellement nuageux"),
    3: ("Overcast", "Couvert"),
    45: ("Fog", "Brouillard"),
    48: ("Rime fog", "Brouillard givrant"),
    51: ("Light drizzle", "Bruine légère"),
    53: ("Drizzle", "Bruine"),
    55: ("Dense drizzle", "Bruine dense"),
    56: ("Freezing drizzle", "Bruine verglaçante"),
    61: ("Slight rain", "Pluie faible"),
    63: ("Rain", "Pluie modérée"),
    65: ("Heavy rain", "Pluie forte"),
    66: ("Freezing rain", "Pluie verglaçante"),
    71: ("Slight snow", "Neige faible"),
    73: ("Snow", "Neige modérée"),
    75: ("Heavy snow", "Neige forte"),
    77: ("Snow grains", "Neige en grains"),
    80: ("Rain showers", "Averses"),
    81: ("Moderate showers", "Averses modérées"),
    82: ("Violent showers", "Averses violentes"),
    85: ("Slight snow showers", "Averses de neige"),
    86: ("Heavy snow showers", "Averses neige fortes"),
    95: ("Thunderstorm", "Orage"),
    96: ("Thunderstorm + hail", "Orage + grêle"),
    99: ("Severe thunderstorm", "Orage violent"),
}


def _wmo_label(code: Optional[int], lang: str = "en") -> Optional[str]:
    if code is None:
        return None
    entry = _WMO_LABELS.get(code)
    if not entry:
        return f"WMO {code}"
    return entry[0] if lang == "en" else entry[1]


_UV_LEVELS = [
    (2.9, "Low"),
    (5.9, "Moderate"),
    (7.9, "High"),
    (10.9, "Very High"),
    (math.inf, "Extreme"),
]


def _uv_label(uv: Optional[float]) -> Optional[str]:
    if uv is None:
        return None
    for limit, name in _UV_LEVELS:
        if uv <= limit:
            return name
    return "Extreme"


_SOIL_MOISTURE_LEVELS = [
    (0.05, "Very dry"),
    (0.15, "Dry"),
    (0.28, "Moist"),
    (0.40, "Wet"),
    (math.inf, "Saturated"),
]


def _soil_moisture_note(moist_m3m3: Optional[float]) -> Optional[str]:
    if moist_m3m3 is None:
        return None
    for limit, label in _SOIL_MOISTURE_LEVELS:
        if moist_m3m3 <= limit:
            return label
    return "Saturated"


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=6))
async def _fetch(url: str, params: dict) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()


async def _get_elevation(lat: float, lon: float) -> Optional[float]:
    try:
        data = await _fetch(
            settings.open_meteo_elevation_base,
            {"latitude": lat, "longitude": lon},
        )
        heights = data.get("elevation") or []
        return heights[0] if heights else None
    except Exception:
        return None


def _current_from(raw: dict) -> CurrentWeather:
    cur = raw.get("current") or {}
    daily = raw.get("daily") or {}
    daily0_idx = 0

    wc = cur.get("weather_code")
    wc = wc if wc is not None else ((daily.get("weather_code") or [None])[daily0_idx])

    soil_t0 = ((raw.get("hourly") or {}).get("soil_temperature_0cm") or [None])[0]
    soil_m0 = ((raw.get("hourly") or {}).get("soil_moisture_0_1cm") or [None])[0]

    wind_dir = cur.get("wind_direction_10m")
    press_msl = cur.get("pressure_msl") or cur.get("surface_pressure")
    vis_m = cur.get("visibility")
    return CurrentWeather(
        time=cur.get("time"),
        temperature_2m=_c_to_f(cur.get("temperature_2m")),
        apparent_temperature=_c_to_f(cur.get("apparent_temperature")),
        relative_humidity_2m=cur.get("relative_humidity_2m"),
        dew_point_2m=_c_to_f(cur.get("dew_point_2m")),
        precipitation=_mm_to_in(cur.get("precipitation")),
        precipitation_probability=((daily.get("precipitation_probability_max") or [None])[daily0_idx]),
        weather_code=wc,
        weather_label=_wmo_label(wc, lang="en"),
        wind_speed_10m=_kmh_to_mph(cur.get("wind_speed_10m")),
        wind_direction_10m=wind_dir,
        wind_gusts_10m=_kmh_to_mph(cur.get("wind_gusts_10m")),
        wind_compass=_wind_compass(wind_dir),
        surface_pressure=press_msl,
        uv_index=cur.get("uv_index"),
        uv_label=_uv_label(cur.get("uv_index")),
        cloud_cover=cur.get("cloud_cover"),
        visibility=_km_to_mi((vis_m / 1000) if vis_m is not None else None),
        soil_temperature_0cm=_c_to_f(soil_t0),
        soil_moisture_0cm=soil_m0,
    )


def _atmosphere_from(raw: dict) -> AtmosphereMetrics:
    cur = raw.get("current") or {}
    press_hpa = cur.get("pressure_msl") or cur.get("surface_pressure")
    dew_c = cur.get("dew_point_2m")
    vis_m = cur.get("visibility")
    return AtmosphereMetrics(
        dew_point_c=dew_c,
        dew_point_f=_c_to_f(dew_c),
        pressure_hpa=press_hpa,
        pressure_inhg=_hpa_to_inhg(press_hpa),
        visibility_km=((vis_m / 1000) if vis_m is not None else None),
        visibility_mi=_km_to_mi((vis_m / 1000) if vis_m is not None else None),
        cloud_cover_pct=cur.get("cloud_cover"),
        ceiling_m=None,
    )


def _soil_from(raw: dict) -> SoilMetrics:
    h = raw.get("hourly") or {}

    def _g(lst, i=0):
        if not lst:
            return None
        if len(lst) <= i:
            return None
        return lst[i]

    st1 = _g(h.get("soil_temperature_0cm"))
    sm1 = _g(h.get("soil_moisture_0_1cm"))
    st2 = _g(h.get("soil_temperature_6cm"))
    sm2 = _g(h.get("soil_moisture_1_3cm"))
    st3 = _g(h.get("soil_temperature_18cm"))
    sm3 = _g(h.get("soil_moisture_3_9cm"))
    st4 = _g(h.get("soil_temperature_54cm"))
    sm4 = _g(h.get("soil_moisture_9_27cm"))

    return SoilMetrics(
        depth_0_1cm_temp_c=st1, depth_0_1cm_temp_f=_c_to_f(st1), depth_0_1cm_moisture_m3m3=sm1,
        depth_1_3cm_temp_c=st2, depth_1_3cm_temp_f=_c_to_f(st2), depth_1_3cm_moisture_m3m3=sm2,
        depth_3_9cm_temp_c=st3, depth_3_9cm_temp_f=_c_to_f(st3), depth_3_9cm_moisture_m3m3=sm3,
        depth_9_27cm_temp_c=st4, depth_9_27cm_temp_f=_c_to_f(st4), depth_9_27cm_moisture_m3m3=sm4,
        soil_texture_note=_soil_moisture_note(sm1),
    )


def _solar_from(raw: dict) -> SolarMetrics:
    cur = raw.get("current") or {}
    daily = raw.get("daily") or {}
    idx0 = 0
    sunrise = (daily.get("sunrise") or [None])[idx0]
    sunset = (daily.get("sunset") or [None])[idx0]
    duration_s = (daily.get("sunshine_duration") or [None])[idx0]
    duration_h = (duration_s / 3600) if duration_s is not None else None
    day_length_h = None
    if sunrise and sunset:
        try:
            s1 = datetime.fromisoformat(sunrise.replace("Z", "+00:00"))
            s2 = datetime.fromisoformat(sunset.replace("Z", "+00:00"))
            day_length_h = (s2 - s1).total_seconds() / 3600
        except Exception:
            pass
    return SolarMetrics(
        uv_index=cur.get("uv_index"),
        uv_clear_sky=cur.get("uv_index_clear_sky"),
        shortwave_radiation_wm2=cur.get("shortwave_radiation"),
        direct_radiation_wm2=cur.get("direct_radiation"),
        diffuse_radiation_wm2=cur.get("diffuse_radiation"),
        global_tilted_irradiance_wm2=None,
        sunrise_local=sunrise,
        sunset_local=sunset,
        sunshine_duration_h=duration_h,
        day_length_h=day_length_h,
    )


def _g(src: dict, key: str, i: int):
    lst = src.get(key)
    if not lst:
        return None
    if i >= len(lst):
        return None
    return lst[i]


def _hourly_from(raw: dict, n_hours: int = 25) -> list[HourlyForecastPoint]:
    h = raw.get("hourly") or {}
    times = h.get("time") or []
    out: list[HourlyForecastPoint] = []
    for i, t in enumerate(times):
        if i >= n_hours:
            break
        temp_c = _g(h, "temperature_2m", i)
        feels_c = _g(h, "apparent_temperature", i)
        precip_mm = _g(h, "precipitation", i)
        wc = _g(h, "weather_code", i)
        wind_kmh = _g(h, "wind_speed_10m", i)
        gusts = _g(h, "wind_gusts_10m", i)
        wdir = _g(h, "wind_direction_10m", i)
        uv = _g(h, "uv_index", i)
        cloud = _g(h, "cloud_cover", i)
        precip_prob = _g(h, "precipitation_probability", i)
        humid = _g(h, "relative_humidity_2m", i)
        out.append(HourlyForecastPoint(
            time=t,
            temp_c=temp_c, temp_f=_c_to_f(temp_c),
            feels_like_c=feels_c, feels_like_f=_c_to_f(feels_c),
            humidity_pct=humid,
            precip_mm=precip_mm, precip_in=_mm_to_in(precip_mm),
            precip_prob_pct=precip_prob,
            weather_code=wc, weather_label=_wmo_label(wc, "en"),
            wind_speed_kmh=wind_kmh, wind_gusts_kmh=gusts,
            wind_dir_deg=wdir, wind_compass=_wind_compass(wdir),
            uv_index=uv, cloud_cover_pct=cloud,
            solar_radiation_wm2=_g(h, "shortwave_radiation", i),
            soil_temp_f=_c_to_f(_g(h, "soil_temperature_0cm", i)),
        ))
    return out


_WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]


def _daily_from(raw: dict, days: int = 15) -> list[DailyForecastPoint]:
    d = raw.get("daily") or {}
    dates = d.get("time") or []
    out: list[DailyForecastPoint] = []
    for i, dt_str in enumerate(dates):
        if i >= days:
            break
        try:
            dt = datetime.strptime(dt_str, "%Y-%m-%d")
            wd = _WEEKDAYS_EN[dt.weekday()]
            dm = f"{_MONTHS_EN[dt.month-1]} {dt.day}"
        except Exception:
            wd, dm = None, None
        tmax_c = _g(d, "temperature_2m_max", i)
        tmin_c = _g(d, "temperature_2m_min", i)
        precip_mm = _g(d, "precipitation_sum", i)
        precip_prob = _g(d, "precipitation_probability_max", i)
        wind_kmh = _g(d, "wind_speed_10m_max", i)
        gusts = _g(d, "wind_gusts_10m_max", i)
        wdir = _g(d, "wind_direction_10m_dominant", i)
        wc = _g(d, "weather_code", i)
        uv = _g(d, "uv_index_max", i)
        et0 = _g(d, "et0_fao_evapotranspiration", i)
        sunrise = _g(d, "sunrise", i)
        sunset = _g(d, "sunset", i)
        out.append(DailyForecastPoint(
            date=dt_str, weekday_label=wd, day_month_label=dm,
            temp_max_c=tmax_c, temp_max_f=_c_to_f(tmax_c),
            temp_min_c=tmin_c, temp_min_f=_c_to_f(tmin_c),
            precip_sum_mm=precip_mm, precip_sum_in=_mm_to_in(precip_mm),
            precip_prob_max_pct=precip_prob,
            wind_speed_max_kmh=wind_kmh, wind_gusts_max_kmh=gusts,
            dominant_wind_dir_deg=wdir, dominant_wind_compass=_wind_compass(wdir),
            sunrise_local=sunrise, sunset_local=sunset,
            weather_code=wc, weather_label=_wmo_label(wc, "en"),
            uv_index_max=uv, et0_mm=et0,
        ))
    return out


def _trends_from(raw_forecast: dict, raw_archive: Optional[dict]) -> dict:
    trends: dict[str, TrendSeries] = {}
    h_fc = raw_forecast.get("hourly") or {}
    times_fc = h_fc.get("time") or []

    def _series(var_key: str, hours: int, source_label: str) -> TrendSeries:
        pts = []
        for i, t in enumerate(times_fc):
            if i >= hours:
                break
            val = _g(h_fc, var_key, i)
            if val is None:
                continue
            rec = {"time": t, "value": val}
            if var_key == "temperature_2m":
                rec["feels_like_f"] = _c_to_f(_g(h_fc, "apparent_temperature", i))
            pts.append(rec)
        return TrendSeries(variable=var_key, points=pts, source=source_label)

    s_24 = _series("temperature_2m", 25, "forecast")
    trends["24h_temp_f"] = TrendSeries(
        variable="temperature_f",
        points=[{"time": p["time"],
                 "value": _c_to_f(p["value"]),
                 "feels_like_f": p.get("feels_like_f")} for p in s_24.points],
        source=s_24.source,
    )

    s_24p = _series("precipitation_probability", 25, "forecast")
    trends["24h_precip_prob"] = s_24p.model_copy(update={"variable": "precipitation_probability_pct"})

    s_24h = _series("relative_humidity_2m", 49, "forecast")
    trends["48h_humidity_pct"] = s_24h.model_copy(update={"variable": "humidity_pct"})

    d_fc = raw_forecast.get("daily") or {}
    dates_fc = d_fc.get("time") or []
    for key, days in (("7d", 7), ("15d", 15)):
        points = []
        for i, dt in enumerate(dates_fc):
            if i >= days:
                break
            tmax = _g(d_fc, "temperature_2m_max", i)
            tmin = _g(d_fc, "temperature_2m_min", i)
            precip = _g(d_fc, "precipitation_sum", i)
            wind = _g(d_fc, "wind_speed_10m_max", i)
            uv = _g(d_fc, "uv_index_max", i)
            sw = _g(d_fc, "shortwave_radiation_sum", i)
            if all(x is None for x in (tmax, tmin, precip, wind, uv)):
                continue
            points.append({
                "date": dt,
                "temp_max_f": _c_to_f(tmax),
                "temp_min_f": _c_to_f(tmin),
                "precip_in": _mm_to_in(precip),
                "wind_kmh": wind,
                "uv_index": uv,
                "solar_mj_m2": sw,
            })
        trends[key] = TrendSeries(variable="daily_summary", points=points, source="forecast")

    points_30: list[dict] = []
    src = "forecast"
    if raw_archive:
        d_ar = raw_archive.get("daily") or {}
        dates_ar = d_ar.get("time") or []
        for i, dt in enumerate(dates_ar):
            tmax = _g(d_ar, "temperature_2m_max", i)
            tmin = _g(d_ar, "temperature_2m_min", i)
            precip = _g(d_ar, "precipitation_sum", i)
            if all(x is None for x in (tmax, tmin, precip)):
                continue
            points_30.append({
                "date": dt,
                "temp_max_f": _c_to_f(tmax),
                "temp_min_f": _c_to_f(tmin),
                "precip_in": _mm_to_in(precip),
                "wind_kmh": _g(d_ar, "wind_speed_10m_max", i),
                "solar_mj_m2": _g(d_ar, "shortwave_radiation_sum", i),
                "historical": True,
            })
        src = "forecast+archive"
    for i, dt in enumerate(dates_fc):
        tmax = _g(d_fc, "temperature_2m_max", i)
        tmin = _g(d_fc, "temperature_2m_min", i)
        if tmax is None and tmin is None:
            continue
        if any(p.get("date") == dt for p in points_30):
            continue
        points_30.append({
            "date": dt,
            "temp_max_f": _c_to_f(tmax),
            "temp_min_f": _c_to_f(tmin),
            "precip_in": _mm_to_in(_g(d_fc, "precipitation_sum", i)),
            "wind_kmh": _g(d_fc, "wind_speed_10m_max", i),
            "solar_mj_m2": _g(d_fc, "shortwave_radiation_sum", i),
            "historical": False,
        })
    points_30 = sorted(points_30, key=lambda p: p.get("date") or "")
    if len(points_30) > 31:
        points_30 = points_30[-31:]
    trends["30d"] = TrendSeries(variable="daily_summary", points=points_30, source=src)

    return trends


def _calendar_month_from(raw_forecast: dict, raw_archive: Optional[dict], variable: str = "precipitation") -> dict:
    now = datetime.now()
    days_recs: list[CalendarDay] = []
    archive_by_date: dict[str, dict] = {}
    if raw_archive:
        d_ar = raw_archive.get("daily") or {}
        for i, dt in enumerate(d_ar.get("time") or []):
            archive_by_date[dt] = {k: (_g(d_ar, k, i)) for k in [
                "precipitation_sum", "temperature_2m_max", "temperature_2m_min",
                "shortwave_radiation_sum", "weather_code", "wind_speed_10m_max",
            ]}

    forecast_by_date: dict[str, dict] = {}
    d_fc = raw_forecast.get("daily") or {}
    for i, dt in enumerate(d_fc.get("time") or []):
        forecast_by_date[dt] = {k: (_g(d_fc, k, i)) for k in [
            "precipitation_sum", "temperature_2m_max", "temperature_2m_min",
            "shortwave_radiation_sum", "weather_code", "wind_speed_10m_max",
        ]}

    day = datetime(now.year, now.month, 1)
    while day.month == now.month:
        key = day.strftime("%Y-%m-%d")
        src = forecast_by_date.get(key) or archive_by_date.get(key) or {}
        wc = src.get("weather_code")
        if variable == "precipitation":
            p_mm = src.get("precipitation_sum")
            p_in = _mm_to_in(p_mm) if isinstance(p_mm, (int, float)) else None
            tmax_f = _c_to_f(src.get("temperature_2m_max"))
            rec = CalendarDay(
                date=key, dow=day.weekday(), week_of_year=int(day.strftime("%W")),
                variable=variable, primary_value=p_in, secondary_value=tmax_f,
                min_value=_c_to_f(src.get("temperature_2m_min")), max_value=tmax_f,
                weather_code=wc, weather_label=_wmo_label(wc, "en"),
            )
        elif variable == "temperature":
            tmax = _c_to_f(src.get("temperature_2m_max"))
            tmin = _c_to_f(src.get("temperature_2m_min"))
            rec = CalendarDay(
                date=key, dow=day.weekday(), week_of_year=int(day.strftime("%W")),
                variable=variable, primary_value=tmax, secondary_value=tmin,
                min_value=tmin, max_value=tmax, weather_code=wc,
                weather_label=_wmo_label(wc, "en"),
            )
        elif variable == "solar":
            sw = src.get("shortwave_radiation_sum")
            tmax = _c_to_f(src.get("temperature_2m_max"))
            rec = CalendarDay(
                date=key, dow=day.weekday(), week_of_year=int(day.strftime("%W")),
                variable=variable, primary_value=sw, secondary_value=tmax,
                weather_code=wc, weather_label=_wmo_label(wc, "en"),
            )
        else:
            w = src.get("wind_speed_10m_max")
            tmax = _c_to_f(src.get("temperature_2m_max"))
            rec = CalendarDay(
                date=key, dow=day.weekday(), week_of_year=int(day.strftime("%W")),
                variable=variable, primary_value=w, secondary_value=tmax,
                weather_code=wc, weather_label=_wmo_label(wc, "en"),
            )
        days_recs.append(rec)
        day += timedelta(days=1)

    return {
        "variable": variable,
        "year": now.year,
        "month": now.month,
        "days": [r.model_dump() for r in days_recs],
    }


async def _optional_fetch(url: str, params: dict) -> Optional[dict]:
    try:
        return await _fetch(url, params)
    except Exception:
        return None


def _latest(values: list[object]) -> Optional[float]:
    for value in reversed(values):
        if isinstance(value, (int, float)):
            return float(value)
    return None


def _decision_signals(
    ensemble: Optional[dict],
    seasonal: Optional[dict],
    satellite: Optional[dict],
    flood: Optional[dict],
) -> list[DecisionSignal]:
    signals: list[DecisionSignal] = []

    ensemble_hourly = (ensemble or {}).get("hourly") or {}
    member_series = [
        values for key, values in ensemble_hourly.items()
        if key.startswith("temperature_2m_member") and isinstance(values, list)
    ]
    minima = [min((float(v) for v in values[:48] if isinstance(v, (int, float))), default=None) for values in member_series]
    minima = [value for value in minima if value is not None]
    if minima:
        frost_probability = round(sum(value <= 0 for value in minima) * 100 / len(minima))
        tone = "critical" if frost_probability >= 60 else "warning" if frost_probability >= 20 else "good"
        signals.append(DecisionSignal(
            id="frost-confidence",
            title="Confiance gel",
            value=f"{frost_probability}%",
            detail="des scénarios météo prévoient une température sous 0 °C dans les 48 h.",
            tone=tone,
        ))

    seasonal_daily = (seasonal or {}).get("daily") or {}
    rain = [float(value) for value in (seasonal_daily.get("precipitation_sum") or [])[:42] if isinstance(value, (int, float))]
    temps = [float(value) for value in (seasonal_daily.get("temperature_2m_mean") or [])[:42] if isinstance(value, (int, float))]
    if rain and temps:
        signals.append(DecisionSignal(
            id="seasonal-outlook",
            title="Tendance 6 semaines",
            value=f"{round(sum(rain))} mm prévus",
            detail=f"Température moyenne attendue : {sum(temps) / len(temps):.1f} °C. À lire comme une tendance régionale.",
            tone="neutral",
        ))

    radiation = _latest(((satellite or {}).get("hourly") or {}).get("shortwave_radiation") or [])
    if radiation is not None:
        signals.append(DecisionSignal(
            id="observed-radiation",
            title="Rayonnement observé",
            value=f"{round(radiation)} W/m²",
            detail="Dernière mesure satellite disponible sur la parcelle.",
            tone="good" if radiation >= 250 else "neutral",
        ))

    flood_daily = (flood or {}).get("daily") or {}
    median = _latest(flood_daily.get("river_discharge_median") or flood_daily.get("river_discharge") or [])
    high = _latest(flood_daily.get("river_discharge_p75") or [])
    if median is not None:
        elevated = high is not None and high > median * 1.5
        signals.append(DecisionSignal(
            id="river-watch",
            title="Vigilance cours d’eau",
            value="À surveiller" if elevated else "Situation stable",
            detail=(
                "L’incertitude sur le débit augmente à proximité de votre parcelle."
                if elevated
                else "Aucune hausse inhabituelle du débit n’est détectée à proximité."
            ),
            tone="warning" if elevated else "good",
        ))

    return signals


def _fallback_response(req: WeatherRequest, warning: str) -> WeatherDashboardResponse:
    now_utc = datetime.now(timezone.utc)
    location_label = req.location_label or f"({req.point.lat:.2f}°, {req.point.lon:.2f}°)"
    current = CurrentWeather(
        time=now_utc.isoformat(),
        temperature_2m=85.9,
        apparent_temperature=59.3,
        relative_humidity_2m=18,
        dew_point_2m=36.9,
        precipitation=0.0,
        precipitation_probability=15,
        weather_code=3,
        weather_label="Overcast",
        wind_speed_10m=6.9,
        wind_direction_10m=292,
        wind_gusts_10m=9.2,
        wind_compass="WNW",
        surface_pressure=1011.0,
        uv_index=0,
        uv_label="Low",
        cloud_cover=75,
        visibility=12.0,
        soil_temperature_0cm=98.9,
        soil_moisture_0cm=0.088,
    )
    hourly = []
    for i in range(0, 49):
        dt = now_utc + timedelta(hours=i)
        temp_f = round(85.9 - i * 0.5, 1) if i < 10 else (round(70 + (i - 10) * 0.25, 1) if i < 30 else round(85 - (i - 30) * 0.4, 1))
        hour = dt.astimezone().hour
        is_night = hour < 6 or hour >= 20
        wc = 0 if (i > 18 and not is_night) else (3 if not is_night else 0)
        hourly.append(HourlyForecastPoint(
            time=dt.isoformat(),
            temp_f=temp_f,
            precip_in=0.0,
            precip_prob_pct=10,
            weather_code=wc,
            weather_label="Clear" if wc == 0 else "Overcast",
            wind_speed_kmh=11 + (i % 6),
            uv_index=0 if is_night else min(10, max(0, (12 - abs(12 - hour)) * 0.8)),
            solar_radiation_wm2=0 if is_night else max(0, (12 - abs(12 - hour)) * 75),
            soil_temp_f=round(temp_f - 2.5, 1),
        ))
    daily = []
    for d in range(0, 15):
        dt = now_utc + timedelta(days=d)
        wd = _WEEKDAYS_EN[dt.weekday()]
        dm = f"{_MONTHS_EN[dt.month-1]} {dt.day}"
        is_rainy = d >= 3
        daily.append(DailyForecastPoint(
            date=dt.strftime("%Y-%m-%d"),
            weekday_label=wd, day_month_label=dm,
            temp_max_f=round(96 - d * 0.9, 0), temp_min_f=round(65 + d * 0.3, 0),
            precip_sum_in=0.0 if not is_rainy else round(0.05 + d * 0.03, 2),
            precip_prob_max_pct=1 if d < 2 else 51,
            wind_speed_max_kmh=12 + d,
            weather_code=0 if d < 2 else (2 if d == 2 else 61),
            weather_label="Sunny" if d < 2 else ("Partly cloudy" if d == 2 else ("Likely rain" if d == 3 else "Rainy")),
            uv_index_max=10 if d < 2 else 3,
        ))
    return WeatherDashboardResponse(
        location_label=location_label,
        latitude=req.point.lat,
        longitude=req.point.lon,
        elevation_m=None,
        timezone="auto",
        units={"temp": "fahrenheit", "wind": "mph", "precip": "inches"},
        source="fallback",
        warning=warning,
        current=current,
        atmosphere=AtmosphereMetrics(
            dew_point_c=2.7, dew_point_f=36.9,
            pressure_hpa=1011, pressure_inhg=29.85,
            visibility_km=19.3, visibility_mi=12.0,
            cloud_cover_pct=75, ceiling_m=None,
        ),
        soil=SoilMetrics(
            depth_0_1cm_temp_c=37.2, depth_0_1cm_temp_f=98.9,
            depth_0_1cm_moisture_m3m3=0.088,
            depth_1_3cm_temp_c=35.8, depth_1_3cm_temp_f=96.4,
            depth_1_3cm_moisture_m3m3=0.092,
            depth_3_9cm_temp_c=33.1, depth_3_9cm_temp_f=91.6,
            depth_3_9cm_moisture_m3m3=0.105,
            depth_9_27cm_temp_c=28.7, depth_9_27cm_temp_f=83.7,
            depth_9_27cm_moisture_m3m3=0.120,
            soil_texture_note="Moist",
        ),
        solar=SolarMetrics(
            uv_index=0, uv_clear_sky=0,
            shortwave_radiation_wm2=0, direct_radiation_wm2=0, diffuse_radiation_wm2=0,
            sunrise_local="06:35", sunset_local="20:05",
            sunshine_duration_h=3.5, day_length_h=13.5,
        ),
        hourly=hourly,
        daily=daily,
        trends={},
        calendar_month={"variable": "precipitation", "year": now_utc.year, "month": now_utc.month, "days": []},
    )


async def build_dashboard(req: WeatherRequest) -> WeatherDashboardResponse:
    fc_params = {
        "latitude": req.point.lat,
        "longitude": req.point.lon,
        "current": [
            "temperature_2m", "apparent_temperature", "relative_humidity_2m",
            "dew_point_2m", "precipitation", "weather_code",
            "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
            "pressure_msl", "surface_pressure", "cloud_cover",
            "uv_index", "uv_index_clear_sky",
            "shortwave_radiation", "direct_radiation", "diffuse_radiation",
            "visibility",
        ],
        "hourly": [
            "temperature_2m", "apparent_temperature", "relative_humidity_2m",
            "dew_point_2m", "precipitation", "precipitation_probability",
            "weather_code", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
            "uv_index", "cloud_cover",
            "soil_temperature_0cm", "soil_temperature_6cm",
            "soil_temperature_18cm", "soil_temperature_54cm",
            "soil_moisture_0_1cm", "soil_moisture_1_3cm",
            "soil_moisture_3_9cm", "soil_moisture_9_27cm",
            "shortwave_radiation", "direct_radiation",
        ],
        "daily": [
            "temperature_2m_max", "temperature_2m_min",
            "apparent_temperature_max", "apparent_temperature_min",
            "precipitation_sum", "precipitation_probability_max",
            "rain_sum", "snowfall_sum",
            "weather_code",
            "wind_speed_10m_max", "wind_direction_10m_dominant", "wind_gusts_10m_max",
            "sunrise", "sunset", "sunshine_duration", "daylight_duration",
            "uv_index_max", "uv_index_clear_sky_max",
            "et0_fao_evapotranspiration",
            "shortwave_radiation_sum",
        ],
        "forecast_days": min(max(req.forecast_days, 1), 16),
        "past_days": min(max(req.past_days, 0), 92),
        "models": req.models if req.models else "best_match",
        "timezone": "auto",
        "wind_speed_unit": "kmh",
        # Always request Celsius from Open-Meteo; we convert to °F in transform helpers.
        # Passing req.temperature_unit here caused double conversion when fahrenheit was requested.
        "temperature_unit": "celsius",
    }
    elevation_m = await _get_elevation(req.point.lat, req.point.lon)

    try:
        raw_fc = await _fetch(settings.open_meteo_base, fc_params)
    except httpx.HTTPError as e:
        return _fallback_response(req, warning=f"Open-Meteo Forecast indisponible: {e}")
    except Exception as e:
        return _fallback_response(req, warning=f"Erreur inattendue Forecast: {e}")

    raw_archive: Optional[dict] = None
    history_days = max(req.history_days, 23)
    try:
        today = datetime.now().date()
        start_date = today - timedelta(days=history_days)
        end_date = today - timedelta(days=1)
        ar_params = {
            "latitude": req.point.lat,
            "longitude": req.point.lon,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "daily": [
                "temperature_2m_max", "temperature_2m_min",
                "precipitation_sum", "weather_code",
                "wind_speed_10m_max", "shortwave_radiation_sum",
            ],
            "timezone": "auto",
        }
        raw_archive = await _fetch(settings.open_meteo_archive_base, ar_params)
    except Exception:
        raw_archive = None

    raw_ensemble, raw_seasonal, raw_satellite, raw_flood = await asyncio.gather(
        _optional_fetch(settings.open_meteo_ensemble_base, {
            "latitude": req.point.lat,
            "longitude": req.point.lon,
            "models": "ecmwf_ifs025_ensemble",
            "hourly": ["temperature_2m"],
            "forecast_days": 2,
            "temperature_unit": "celsius",
            "timezone": "auto",
        }),
        _optional_fetch(settings.open_meteo_seasonal_base, {
            "latitude": req.point.lat,
            "longitude": req.point.lon,
            "daily": ["temperature_2m_mean", "precipitation_sum"],
            "forecast_days": 42,
            "timezone": "auto",
        }),
        _optional_fetch(settings.open_meteo_satellite_base, {
            "latitude": req.point.lat,
            "longitude": req.point.lon,
            "hourly": ["shortwave_radiation"],
            "past_days": 1,
            "forecast_days": 1,
            "models": "satellite_radiation_seamless",
            "timezone": "auto",
        }),
        _optional_fetch(settings.open_meteo_flood_base, {
            "latitude": req.point.lat,
            "longitude": req.point.lon,
            "daily": ["river_discharge", "river_discharge_median", "river_discharge_p75"],
            "forecast_days": 14,
            "timezone": "auto",
        }),
    )

    location_label = req.location_label or f"({req.point.lat:.2f}°, {req.point.lon:.2f}°)"
    tz = raw_fc.get("timezone") or "UTC"
    warning = None
    daily_fc = (raw_fc.get("daily") or {}).get("temperature_2m_max") or []
    if any(v is None for v in daily_fc):
        warning = "Some trailing forecast days had no data yet (Open-Meteo forecast edge)."

    return WeatherDashboardResponse(
        location_label=location_label,
        latitude=req.point.lat,
        longitude=req.point.lon,
        elevation_m=elevation_m,
        timezone=tz,
        units={"temp": req.temperature_unit, "wind": req.wind_speed_unit, "precip": "mm+inches"},
        source="open-meteo",
        warning=warning,
        current=_current_from(raw_fc),
        atmosphere=_atmosphere_from(raw_fc),
        soil=_soil_from(raw_fc),
        solar=_solar_from(raw_fc),
        hourly=_hourly_from(raw_fc, n_hours=49),
        daily=_daily_from(raw_fc, days=15),
        trends=_trends_from(raw_fc, raw_archive),
        calendar_month=_calendar_month_from(raw_fc, raw_archive, variable="precipitation"),
        decision_signals=_decision_signals(raw_ensemble, raw_seasonal, raw_satellite, raw_flood),
    )
