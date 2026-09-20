"""Market data access with mandatory, auditable upstream provenance.

The configured provider must expose ``MARKET_DATA_PROVIDER_URL/quotes/{symbol}``
and return: price_eur_ton, observed_at (ISO-8601 UTC), source_name,
source_url, and contract_or_location. No synthetic value is ever returned.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

from app.models.schemas import CommodityChartResponse, CommodityTicker

MAX_QUOTE_AGE_SECONDS = 24 * 60 * 60
FRANCEAGRIMER_MAX_QUOTE_AGE_SECONDS = 10 * 24 * 60 * 60
MARKET_DATA_PROVIDER_URL = os.getenv("MARKET_DATA_PROVIDER_URL", "").rstrip("/")
MARKET_DATA_PROVIDER_API_KEY = os.getenv("MARKET_DATA_PROVIDER_API_KEY", "")
TRADING_DATA_MODE = os.getenv("TRADING_DATA_MODE", "provider")
FRANCEAGRIMER_CACHE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "franceagrimer_physical_quotes.json")

COMMODITIES_DB: dict[str, dict[str, str]] = {
    "EBM": {"symbol": "EBM", "name": "Blé tendre Euronext / MATIF", "category": "cereals"},
    "EMA": {"symbol": "EMA", "name": "Maïs Euronext / MATIF", "category": "cereals"},
    "ECO": {"symbol": "ECO", "name": "Colza Euronext / MATIF", "category": "oilseeds"},
    "ETO": {"symbol": "ETO", "name": "Tournesol Saint-Nazaire", "category": "oilseeds"},
    "EOR": {"symbol": "EOR", "name": "Orge fourragère / brasserie", "category": "cereals"},
    "URE": {"symbol": "URE", "name": "Urée granulée 46% (FOB)", "category": "fertilizers"},
}


class MarketDataUnavailableError(RuntimeError):
    """Raised when a quote cannot be verified from the configured provider."""


def _require_symbol(symbol: str) -> dict[str, str]:
    try:
        return COMMODITIES_DB[symbol.upper()]
    except KeyError as exc:
        raise ValueError(f"Unknown commodity symbol: {symbol}") from exc


def _parse_observed_at(value: object) -> datetime:
    if not isinstance(value, str):
        raise MarketDataUnavailableError("Provider quote has no observed_at timestamp.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise MarketDataUnavailableError("Provider observed_at is not ISO-8601.") from exc
    if parsed.tzinfo is None:
        raise MarketDataUnavailableError("Provider observed_at must include a timezone.")
    return parsed.astimezone(timezone.utc)


def _fetch_quote(symbol: str) -> dict[str, Any]:
    if TRADING_DATA_MODE == "franceagrimer_physical":
        try:
            cache = json.loads(open(FRANCEAGRIMER_CACHE, encoding="utf-8").read())
            quote = cache["quotes"][symbol]
            return {**quote, "observed_at": cache["observed_at"], "source_name": cache["source_name"], "source_url": cache["source_url"]}
        except (OSError, KeyError, json.JSONDecodeError) as exc:
            raise MarketDataUnavailableError("FranceAgriMer cache is absent or does not cover this physical commodity.") from exc
    if not MARKET_DATA_PROVIDER_URL:
        raise MarketDataUnavailableError("MARKET_DATA_PROVIDER_URL is not configured.")
    request = urllib.request.Request(
        f"{MARKET_DATA_PROVIDER_URL}/quotes/{symbol}",
        headers={"Accept": "application/json", **({"Authorization": f"Bearer {MARKET_DATA_PROVIDER_API_KEY}"} if MARKET_DATA_PROVIDER_API_KEY else {})},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            quote = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as exc:
        raise MarketDataUnavailableError(f"Market-data provider request failed: {exc}") from exc
    if not isinstance(quote, dict):
        raise MarketDataUnavailableError("Provider quote must be a JSON object.")
    return quote


def _validated_quote(symbol: str) -> dict[str, Any]:
    quote = _fetch_quote(symbol)
    required = ("price_eur_ton", "observed_at", "source_name", "source_url", "contract_or_location")
    missing = [field for field in required if not quote.get(field)]
    if missing:
        raise MarketDataUnavailableError(f"Provider quote is missing provenance fields: {', '.join(missing)}.")
    try:
        quote["price_eur_ton"] = float(quote["price_eur_ton"])
        if quote["price_eur_ton"] <= 0:
            raise ValueError
    except (TypeError, ValueError) as exc:
        raise MarketDataUnavailableError("Provider price_eur_ton must be positive.") from exc
    observed_at = _parse_observed_at(quote["observed_at"])
    max_age = FRANCEAGRIMER_MAX_QUOTE_AGE_SECONDS if TRADING_DATA_MODE == "franceagrimer_physical" else MAX_QUOTE_AGE_SECONDS
    if (datetime.now(timezone.utc) - observed_at).total_seconds() > max_age:
        raise MarketDataUnavailableError("Provider quote is older than its permitted freshness window.")
    quote["observed_at"] = observed_at.isoformat()
    return quote


def get_live_quote(symbol: str) -> dict[str, Any]:
    _require_symbol(symbol)
    return _validated_quote(symbol.upper())


def require_execution_eligible_data() -> None:
    if TRADING_DATA_MODE == "franceagrimer_physical":
        raise MarketDataUnavailableError("FranceAgriMer physical weekly quotations cannot be used for execution recommendations.")


def get_all_tickers() -> list[CommodityTicker]:
    tickers: list[CommodityTicker] = []
    symbols = ("EBM", "EOR", "EMA") if TRADING_DATA_MODE == "franceagrimer_physical" else COMMODITIES_DB
    for symbol in symbols:
        meta = COMMODITIES_DB[symbol]
        quote = _validated_quote(symbol)
        try:
            previous_close = float(quote["previous_close_eur_ton"])
            if previous_close <= 0:
                raise ValueError
        except (KeyError, TypeError, ValueError):
            previous_close = None
        change = quote["price_eur_ton"] - previous_close if previous_close else 0.0
        tickers.append(CommodityTicker(
            symbol=symbol, name=meta["name"], category=meta["category"], unit="€/t",
            price_eur_ton=quote["price_eur_ton"], change_daily_eur=round(change, 2),
            change_daily_pct=round(change / previous_close * 100, 2) if previous_close else 0.0,
            high_52w_eur=quote["price_eur_ton"], low_52w_eur=quote["price_eur_ton"],
            trend="neutral", rsi_14=0.0, updated_at=quote["observed_at"],
            source_name=str(quote["source_name"]), source_url=str(quote["source_url"]),
            contract_or_location=str(quote["contract_or_location"]),
        ))
    return tickers


def get_commodity_chart(symbol: str, period_days: int = 30) -> CommodityChartResponse:
    _require_symbol(symbol)
    raise MarketDataUnavailableError(
        "Historical chart is disabled until the provider supplies auditable historical observations."
    )
