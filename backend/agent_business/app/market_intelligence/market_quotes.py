"""Dated, auditable market quotations used before reference price fallbacks."""
from __future__ import annotations

import os
from datetime import date
from functools import lru_cache
from pathlib import Path

import pandas as pd

from app.market_intelligence.crop_aliases import normalize_culture_key

REQUIRED_COLUMNS = {"culture", "date", "price_eur_kg", "source"}


def _paths() -> list[Path]:
    configured = os.getenv("BUSINESS_MARKET_QUOTES_CSV", "").strip()
    paths = [Path(configured)] if configured else []
    market_dir = os.getenv("MARKET_DATA_DIR", "").strip()
    if market_dir:
        paths.append(Path(market_dir) / "market_quotes.csv")
    paths.append(Path(__file__).resolve().parent / "data" / "market_quotes.csv")
    return paths


@lru_cache(maxsize=1)
def _load() -> tuple[pd.DataFrame | None, Path | None]:
    path = next((candidate for candidate in _paths() if candidate.is_file()), None)
    if path is None:
        return None, None
    try:
        frame = pd.read_csv(path, encoding="utf-8-sig", sep=None, engine="python")
    except Exception:
        return None, None
    if not REQUIRED_COLUMNS.issubset(frame.columns):
        return None, path
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce", utc=True).dt.date
    frame["price_eur_kg"] = pd.to_numeric(frame["price_eur_kg"], errors="coerce")
    frame["culture_key"] = frame["culture"].astype(str).map(normalize_culture_key)
    frame = frame.dropna(subset=["date", "price_eur_kg"])
    frame = frame[frame["price_eur_kg"] > 0]
    return (frame, path) if not frame.empty else (None, path)


def get_latest_quote(culture: str) -> dict | None:
    frame, path = _load()
    if frame is None or path is None:
        return None
    rows = frame[frame["culture_key"] == normalize_culture_key(culture)].sort_values("date")
    if rows.empty:
        return None
    row = rows.iloc[-1]
    quote_date = row["date"]
    age_days = max(0, (date.today() - quote_date).days)
    max_age = int(os.getenv("BUSINESS_MARKET_QUOTE_MAX_AGE_DAYS", "30"))
    return {
        "price_eur_kg": round(float(row["price_eur_kg"]), 4), "date": quote_date.isoformat(),
        "source": str(row["source"]), "market": str(row.get("market", "non précisé")),
        "region": str(row.get("region", "France")), "stade": str(row.get("stade", "non précisé")),
        "fresh": age_days <= max_age, "age_days": age_days,
    }


def quotes_status() -> dict:
    frame, path = _load()
    if frame is None or path is None:
        return {"available": False, "path": str(path) if path else None, "rows": 0}
    return {"available": True, "path": str(path), "rows": int(len(frame)),
            "latest_date": max(frame["date"]).isoformat(),
            "cultures": sorted(frame["culture_key"].unique().tolist())}
