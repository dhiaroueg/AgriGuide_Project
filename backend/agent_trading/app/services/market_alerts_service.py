"""Market alerts are disabled until they can be derived from auditable data."""
from __future__ import annotations

from app.models.schemas import MarketAlert


def get_market_alerts() -> list[MarketAlert]:
    return []
