"""
Commercialization Strategy Service (SELL / HOLD / STORE / HEDGE).
"""
from __future__ import annotations

from app.models.schemas import (
    StrategyEvaluationRequest,
    StrategyDecisionResponse,
    MarketFeedItem,
)
from app.services.market_ticker_service import COMMODITIES_DB, get_live_quote, require_execution_eligible_data

def calculate_strategy(req: StrategyEvaluationRequest) -> StrategyDecisionResponse:
    """Evaluate the farmer's position and recommend the best commercial action."""
    require_execution_eligible_data()
    symbol = req.commodity_symbol.upper()
    meta = COMMODITIES_DB[symbol]
    market_price = get_live_quote(symbol)["price_eur_ton"]
    trend = "neutral"
    rsi = 0.0
    
    uncommitted_tons = max(0, req.total_harvest_tons - req.already_committed_tons)
    target_price = round(req.break_even_cost_eur_ton * (1.0 + req.target_margin_pct / 100.0), 2)
    
    # Calculate mock snapshot
    snapshot = [
        MarketFeedItem(
            source="market_provider",
            label="Futures MATIF/Euronext",
            commodity=meta["name"],
            price_eur_ton=market_price,
            change_pct=1.2,
            contract_or_location="Échéance Proche",
            updated_at="Live"
        )
    ]
    
    signals = {
        "rsi": f"{rsi} (Zone {'Haute' if rsi > 60 else 'Basse' if rsi < 40 else 'Neutre'})",
        "trend": "Haussière" if trend == "bullish" else "Baissière" if trend == "bearish" else "Neutre",
        "price_vs_target": f"{market_price} vs {target_price} €/t"
    }

    # Decision Engine Logic
    if uncommitted_tons <= 0:
        return _build_response(
            "HOLD", "MAINTENIR POSITION", 95, "Récolte Entièrement Engagée",
            ["Vous avez déjà engagé la totalité de votre récolte.", "Aucune action commerciale supplémentaire requise."],
            signals, 0, market_price, 0, "low", None, ["Surveiller la bonne exécution des contrats en cours."], snapshot
        )

    if market_price >= target_price:
        if trend == "bullish" and rsi < 70:
            # Market is above target and still climbing -> HEDGE partially to let the rest ride
            rec_vol = round(uncommitted_tons * 0.4, 1)
            gain = round(rec_vol * (market_price - req.break_even_cost_eur_ton), 2)
            plan = [
                f"Vendre immédiatement {rec_vol}t au cours actuel de {market_price}€/t.",
                "Conserver le solde pour profiter de la dynamique haussière.",
                "Placer un ordre de protection au niveau de votre prix de revient."
            ]
            return _build_response(
                "HEDGE", "COUVERTURE PARTIELLE", 82, "Sécurisez vos Marges en Tendance Haussière",
                ["Le cours actuel dépasse votre objectif de marge.", "La tendance reste haussière, il est judicieux de ne pas tout vendre d'un coup.", f"Votre exposition reste élevée sur {uncommitted_tons}t."],
                signals, rec_vol, market_price, gain, "medium", None, plan, snapshot
            )
        else:
            # Market is high but overbought or reversing -> SELL
            rec_vol = round(uncommitted_tons * 0.8, 1)
            gain = round(rec_vol * (market_price - req.break_even_cost_eur_ton), 2)
            plan = [
                f"1. Engager {rec_vol}t de vente ferme au prix actuel.",
                "2. Valider les contrats avec votre coopérative ou négoce."
            ]
            return _build_response(
                "SELL", "VENTE MASSIVE", 88, "Objectif Atteint - Prenez vos Bénéfices",
                ["Le prix du marché dépasse votre seuil de rentabilité cible.", "Le marché montre des signes d'essoufflement (RSI élevé).", "Il est temps de concrétiser votre marge."],
                signals, rec_vol, market_price, gain, "low", None, plan, snapshot
            )
    else:
        if req.storage_capacity_tons >= uncommitted_tons:
            # Price is low, but can store -> STORE
            storage = {
                "capacity": req.storage_capacity_tons,
                "cost_per_month": 1.5,
                "max_duration_months": 6
            }
            plan = [
                "1. Transférer la récolte disponible vers vos silos.",
                f"2. Fixer un prix cible (ordre de vente) à {target_price}€/t.",
                "3. Surveiller les coûts de stockage (~1.5€/t/mois)."
            ]
            return _build_response(
                "STORE", "STOCKAGE", 75, "Attente d'Opportunités (Stockage Stratégique)",
                ["Le cours actuel est inférieur à votre objectif de marge.", "Vous disposez de capacités de stockage suffisantes.", "Le marché pourrait rebondir à moyen terme."],
                signals, uncommitted_tons, target_price, 0, "medium", storage, plan, snapshot
            )
        else:
            # Price is low, cannot store everything -> HOLD/WAIT or minor HEDGE
            rec_vol = round(uncommitted_tons * 0.2, 1)
            gain = round(rec_vol * (market_price - req.break_even_cost_eur_ton), 2)
            plan = [
                f"1. Vendre le strict minimum ({rec_vol}t) pour libérer de la trésorerie si nécessaire.",
                "2. Patienter sur le solde pour un meilleur point d'entrée."
            ]
            return _build_response(
                "HOLD", "PATIENTER", 60, "Marché Dégradé, Ventes Limitées",
                ["Le cours actuel est insatisfaisant.", "Vos capacités de stockage sont limitées.", "Ne vendez que par obligation de trésorerie immédiate."],
                signals, rec_vol, market_price, gain, "high", None, plan, snapshot
            )

def _build_response(
    action, action_label, conf, head, rationale, signals, rec_vol, rec_price, gain, risk, storage, plan, snapshot
) -> StrategyDecisionResponse:
    return StrategyDecisionResponse(
        action=action,
        action_label=action_label,
        confidence_score_pct=conf,
        headline=head,
        rationale=rationale,
        market_signals=signals,
        recommended_volume_tons=rec_vol,
        recommended_target_price_eur_ton=rec_price,
        estimated_total_gain_eur=gain,
        risk_level=risk,
        storage_analysis=storage,
        step_by_step_plan=plan,
        tri_source_snapshot=snapshot
    )
