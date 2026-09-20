"""
FastAPI application for agent_trading (Bourse Agricole & Vente à Terme).
Running on Port 8007.
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.models.schemas import (
    CommodityTicker,
    CommodityChartResponse,
    HedgingRecommendationRequest,
    HedgingRecommendationResponse,
    MarketAlert,
    StrategyEvaluationRequest,
    StrategyDecisionResponse,
)
from app.services import market_ticker_service, hedging_advisor_service, market_alerts_service, commercialization_service
from app.services.market_ticker_service import MarketDataUnavailableError

app = FastAPI(
    title="AgriGuide Agent Trading (Bourse Agricole & Vente à Terme)",
    description="Cotations Euronext/MATIF, signaux de vente à terme et couverture des risques de marché.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"agent": "agent_trading", "status": "online", "port": 8007}


@app.get("/trading/tickers", response_model=list[CommodityTicker])
def get_tickers():
    """Return real-time commodity tickers for Euronext / MATIF."""
    try:
        return market_ticker_service.get_all_tickers()
    except MarketDataUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/trading/chart/{commodity_symbol}", response_model=CommodityChartResponse)
def get_commodity_chart(commodity_symbol: str, period_days: int = 30):
    """Return historical price chart series for a given commodity symbol (e.g. EBM, EMA, ECO)."""
    try:
        return market_ticker_service.get_commodity_chart(commodity_symbol, period_days)
    except MarketDataUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/trading/hedge/recommendation", response_model=HedgingRecommendationResponse)
def calculate_hedging(req: HedgingRecommendationRequest):
    """Calculate forward contract hedging tranches based on break-even cost and harvest volume."""
    try:
        return hedging_advisor_service.calculate_hedging_recommendation(req)
    except MarketDataUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Erreur calcul stratégie de vente : {exc}") from exc


@app.post("/trading/strategy", response_model=StrategyDecisionResponse)
def evaluate_strategy(req: StrategyEvaluationRequest):
    """Evaluate farmer commercial position and recommend SELL/HOLD/STORE/HEDGE strategy."""
    try:
        return commercialization_service.calculate_strategy(req)
    except MarketDataUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Erreur évaluation stratégie : {exc}") from exc


@app.get("/trading/alerts", response_model=list[MarketAlert])
def get_alerts():
    """Return active trading signals and market opportunity alerts."""
    return market_alerts_service.get_market_alerts()
