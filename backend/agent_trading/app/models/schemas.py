"""
Pydantic schemas for agent_trading (Bourse Agricole, Tri-Feed & Commercialization Strategy).
"""
from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Tri-Source Market Feeds & Analysis
# ---------------------------------------------------------------------------

class MarketFeedItem(BaseModel):
    source: Literal["yfinance", "alpha_vantage", "franceagrimer", "market_provider"]
    label: str           # e.g., "Futures Euronext", "Macro Commodities", "Marché Physique FOB"
    commodity: str       # "Blé Tendre", "Maïs", "Colza", "Tournesol", "Orge"
    price_eur_ton: float
    change_pct: float
    contract_or_location: str  # e.g. "Échéance Sep-2026", "Global Index", "FOB Rouen"
    updated_at: str


class CommodityTechnicalAnalysis(BaseModel):
    symbol: str
    commodity_name: str
    futures_price_eur_ton: float
    macro_price_eur_ton: float
    physical_fob_price_eur_ton: float
    basis_eur_ton: float               # Physical - Futures
    trend: Literal["bullish", "neutral", "bearish"]
    rsi_14: float                      # 0 to 100
    volatility_30d_pct: float          # e.g., 18.5%
    sma_20_eur_ton: float
    sma_50_eur_ton: float
    resistance_eur_ton: float
    support_eur_ton: float
    high_52w_eur: float
    low_52w_eur: float


class CommodityTicker(BaseModel):
    symbol: str
    name: str
    category: Literal["cereals", "oilseeds", "fertilizers"]
    unit: str
    price_eur_ton: float
    change_daily_eur: float
    change_daily_pct: float
    high_52w_eur: float
    low_52w_eur: float
    trend: Literal["bullish", "neutral", "bearish"]
    rsi_14: float
    updated_at: str
    source_name: str
    source_url: str
    contract_or_location: str


class PricePoint(BaseModel):
    date: str
    price_eur_ton: float
    volume_contracts: int


class CommodityChartResponse(BaseModel):
    symbol: str
    name: str
    unit: str
    current_price_eur_ton: float
    period: str
    history: list[PricePoint]


# ---------------------------------------------------------------------------
# Farmer Contracts & Position Exposure Ledger
# ---------------------------------------------------------------------------

class FarmerContract(BaseModel):
    contract_id: str
    commodity_symbol: str
    buyer_name: str         # e.g., "Coopérative Axéréal", "Négoce Soufflet"
    contract_type: Literal["prix_ferme", "prix_moyen", "a_terme_matif"]
    volume_tons: float
    contract_price_eur_ton: float
    delivery_date: str
    signed_at: str


class FarmerPositionSummary(BaseModel):
    commodity_symbol: str
    total_harvest_expected_tons: float
    total_committed_tons: float
    uncommitted_tons: float
    committed_ratio_pct: float         # e.g. 40% committed
    weighted_avg_price_eur_ton: float  # average committed price
    break_even_cost_eur_ton: float     # cost of production
    storage_capacity_tons: float       # available farm silo capacity
    storage_cost_eur_month_ton: float  # default ~1.50 €/t/month
    current_market_price_eur_ton: float
    unhedged_exposure_eur: float       # uncommitted_tons * current_market_price


# ---------------------------------------------------------------------------
# Commercialization Strategy (SELL / HOLD / STORE / HEDGE)
# ---------------------------------------------------------------------------

class StrategyEvaluationRequest(BaseModel):
    commodity_symbol: str = Field(default="EBM", description="Symbol e.g. EBM, EMA, ECO")
    total_harvest_tons: float = Field(..., gt=0, description="Volume total estimé de la récolte en tonnes")
    already_committed_tons: float = Field(default=0, ge=0, description="Volume déjà vendu ou engagé (t)")
    break_even_cost_eur_ton: float = Field(..., gt=0, description="Coût de revient / point mort (€/t)")
    storage_capacity_tons: float = Field(default=0, ge=0, description="Capacité de stockage en silo disponible (t)")
    target_margin_pct: float = Field(default=15.0, ge=0, description="Marge nette souhaitée (%)")


class StrategyDecisionResponse(BaseModel):
    action: Literal["SELL", "HOLD", "STORE", "HEDGE"]
    action_label: str
    confidence_score_pct: int          # e.g. 88%
    headline: str
    rationale: list[str]
    market_signals: dict[str, str]     # e.g. {"rsi": "64 (Zone Haute)", "trend": "Haussière", "basis": "+3.50 €/t (FOB Rouen)"}
    recommended_volume_tons: float
    recommended_target_price_eur_ton: float
    estimated_total_gain_eur: float
    risk_level: Literal["low", "medium", "high"]
    storage_analysis: Optional[dict[str, str | float]] = None
    step_by_step_plan: list[str]
    tri_source_snapshot: list[MarketFeedItem]


class HedgingRecommendationRequest(BaseModel):
    commodity_symbol: str = Field(default="EBM")
    total_volume_tons: float = Field(..., gt=0)
    break_even_cost_eur_ton: float = Field(..., gt=0)
    target_margin_pct: float = Field(default=15.0, ge=0)


class HedgingTranche(BaseModel):
    tranche_num: int
    target_price_eur_ton: float
    volume_to_hedge_pct: float
    volume_tons: float
    estimated_revenue_eur: float
    estimated_profit_eur: float
    recommendation_status: Literal["EXECUTE_NOW", "SET_LIMIT_ORDER", "WAIT_RALLY"]
    action_message: str


class HedgingRecommendationResponse(BaseModel):
    commodity_name: str
    total_volume_tons: float
    break_even_cost_eur_ton: float
    target_selling_price_eur_ton: float
    current_market_price_eur_ton: float
    hedged_volume_pct_recommended: float
    total_hedged_volume_tons: float
    total_estimated_revenue_eur: float
    total_estimated_profit_eur: float
    strategy_summary: str
    tranches: list[HedgingTranche]


class MarketAlert(BaseModel):
    alert_id: str
    symbol: str
    commodity_name: str
    severity: Literal["high", "medium", "info"]
    title: str
    message: str
    action_recommended: str
    confidence_score: int = Field(default=0, description="Confidence score 0-100")
    reasons: list[str] = Field(default_factory=list, description="List of reasons for the alert")
    created_at: str
