"""
Hedging Advisor & Forward Contract Strategy Calculation Service.
"""
from __future__ import annotations

from app.models.schemas import (
    HedgingRecommendationRequest,
    HedgingRecommendationResponse,
    HedgingTranche,
)
from app.services.market_ticker_service import COMMODITIES_DB, get_live_quote, require_execution_eligible_data


def calculate_hedging_recommendation(
    req: HedgingRecommendationRequest,
) -> HedgingRecommendationResponse:
    """Calculates forward contract hedging tranches, target profit lock-in, and execution triggers."""
    symbol = req.commodity_symbol.upper()
    require_execution_eligible_data()
    meta = COMMODITIES_DB[symbol]
    market_price = get_live_quote(symbol)["price_eur_ton"]
    
    target_price = round(req.break_even_cost_eur_ton * (1.0 + req.target_margin_pct / 100.0), 2)
    
    # 1. Tranche Strategy Calculation
    # Tranche 1: Immediate Execution / Anchor (30% of crop)
    t1_vol_pct = 30.0
    t1_vol_tons = round(req.total_volume_tons * (t1_vol_pct / 100.0), 1)
    t1_price = max(market_price, round(req.break_even_cost_eur_ton * 1.10, 2))
    t1_status = "EXECUTE_NOW" if market_price >= req.break_even_cost_eur_ton * 1.10 else "SET_LIMIT_ORDER"
    t1_action = f"Engager {t1_vol_tons} t ({t1_vol_pct}%) immédiatement au cours actuel de {market_price} €/t pour sécuriser vos coûts de structure."

    # Tranche 2: Target Profit Lock (40% of crop)
    t2_vol_pct = 40.0
    t2_vol_tons = round(req.total_volume_tons * (t2_vol_pct / 100.0), 1)
    t2_price = round(max(target_price, market_price * 1.05), 2)
    t2_status = "SET_LIMIT_ORDER"
    t2_action = f"Placer un ordre de vente à terme limite sur le contrat {meta['name']} à {t2_price} €/t pour débloquer votre marge de {req.target_margin_pct}%."

    # Tranche 3: Peak Rally Optimization (30% of crop)
    t3_vol_pct = 30.0
    t3_vol_tons = round(req.total_volume_tons * (t3_vol_pct / 100.0), 1)
    t3_price = round(market_price * 1.12, 2)
    t3_status = "WAIT_RALLY"
    t3_action = f"Conserver {t3_vol_tons} t ({t3_vol_pct}%) pour capturer les pics de marché en fin de campagne ou ventes physiques directes au comptant."

    tranches = [
        HedgingTranche(
            tranche_num=1,
            target_price_eur_ton=t1_price,
            volume_to_hedge_pct=t1_vol_pct,
            volume_tons=t1_vol_tons,
            estimated_revenue_eur=round(t1_vol_tons * t1_price, 2),
            estimated_profit_eur=round(t1_vol_tons * (t1_price - req.break_even_cost_eur_ton), 2),
            recommendation_status=t1_status,
            action_message=t1_action,
        ),
        HedgingTranche(
            tranche_num=2,
            target_price_eur_ton=t2_price,
            volume_to_hedge_pct=t2_vol_pct,
            volume_tons=t2_vol_tons,
            estimated_revenue_eur=round(t2_vol_tons * t2_price, 2),
            estimated_profit_eur=round(t2_vol_tons * (t2_price - req.break_even_cost_eur_ton), 2),
            recommendation_status=t2_status,
            action_message=t2_action,
        ),
        HedgingTranche(
            tranche_num=3,
            target_price_eur_ton=t3_price,
            volume_to_hedge_pct=t3_vol_pct,
            volume_tons=t3_vol_tons,
            estimated_revenue_eur=round(t3_vol_tons * t3_price, 2),
            estimated_profit_eur=round(t3_vol_tons * (t3_price - req.break_even_cost_eur_ton), 2),
            recommendation_status=t3_status,
            action_message=t3_action,
        ),
    ]

    total_hedged_pct = t1_vol_pct + t2_vol_pct
    total_hedged_tons = t1_vol_tons + t2_vol_tons
    total_revenue = sum(t.estimated_revenue_eur for t in tranches)
    total_profit = sum(t.estimated_profit_eur for t in tranches)

    # Strategy Summary Message
    if market_price >= target_price:
        summary = f"Le cours actuel ({market_price} €/t) dépasse votre objectif de rentabilité ({target_price} €/t). Nous vous recommandons d'engager 70% de votre récolte dès aujourd'hui."
    else:
        gap = round(target_price - market_price, 2)
        summary = f"Le marché est actuellement à {market_price} €/t (à {gap} €/t de votre cible). Verrouillez 30% en premier palier de sécurité et placez des ordres limites pour le solde."

    return HedgingRecommendationResponse(
        commodity_name=meta["name"],
        total_volume_tons=req.total_volume_tons,
        break_even_cost_eur_ton=req.break_even_cost_eur_ton,
        target_selling_price_eur_ton=target_price,
        current_market_price_eur_ton=market_price,
        hedged_volume_pct_recommended=total_hedged_pct,
        total_hedged_volume_tons=total_hedged_tons,
        total_estimated_revenue_eur=round(total_revenue, 2),
        total_estimated_profit_eur=round(total_profit, 2),
        strategy_summary=summary,
        tranches=tranches,
    )
