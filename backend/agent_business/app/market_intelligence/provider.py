"""
Unified market-price provider used by market_study.

Pipeline:
1. Reference baseline (€/kg + yield) — IPPAP has indices, not absolute prices
2. Real Agreste IPPAP 6-month index trend → tendance ∈ [-1, 1]
3. FranceAgriMer RAG + Mistral when Chroma index + MISTRAL_API_KEY are available
"""

from __future__ import annotations

import os
from functools import lru_cache

from app.market_intelligence.crop_aliases import normalize_culture_key
from app.market_intelligence.paths import list_market_pdfs, resolve_market_data_dir
from app.market_intelligence.price_trends import (
    compute_price_trend,
    pct_change_to_tendance,
)
from app.market_intelligence.historical_yields import get_historical_yield
from app.market_intelligence.reference_baselines import get_baseline
from app.market_intelligence.market_quotes import get_latest_quote, quotes_status

_TENDANCE_LABEL = {
    "hausse": 0.5,
    "stable": 0.0,
    "baisse": -0.5,
    "inconnue": 0.0,
}


def _env_flag(name: str) -> str | None:
    raw = os.environ.get(name)
    if raw is None:
        return None
    return raw.strip().lower()


def _rag_enabled() -> bool:
    """
    Auto-on when Chroma + Mistral are usable.
    Force off with MARKET_RAG_ENABLED=0 ; force on with =1.
    """
    flag = _env_flag("MARKET_RAG_ENABLED")
    if flag in {"0", "false", "no", "off"}:
        return False
    if flag in {"1", "true", "yes", "on"}:
        return True
    # Auto
    if not os.environ.get("MISTRAL_API_KEY"):
        return False
    try:
        from app.market_intelligence.rag.retriever import chroma_available

        return chroma_available()
    except Exception:
        return False


@lru_cache(maxsize=64)
def _optional_rag_score(culture: str) -> dict | None:
    if not _rag_enabled():
        return None
    try:
        from app.market_intelligence.rag.rank_crops import score_crop

        return score_crop(culture)
    except Exception as exc:
        print(f"[market_intelligence] RAG scoring skipped for {culture}: {exc}")
        return None


def market_pipeline_status() -> dict:
    """Diagnostic helper for /health or operators."""
    data_dir = resolve_market_data_dir()
    pdfs = list_market_pdfs(data_dir) if data_dir else []
    chroma_ok = False
    try:
        from app.market_intelligence.rag.retriever import chroma_available

        chroma_ok = chroma_available()
    except Exception:
        chroma_ok = False
    return {
        "data_dir": str(data_dir) if data_dir else None,
        "pdf_count": len(pdfs),
        "pdfs": [p.name for p in pdfs],
        "vector_store_ready": chroma_ok,
        "chroma_ready": chroma_ok,  # compat alias
        "mistral_configured": bool(os.environ.get("MISTRAL_API_KEY")),
        "rag_active": _rag_enabled(),
        "market_quotes": quotes_status(),
    }


def get_market_price(culture: str) -> dict:
    """
    Return the dict shape expected by market_study:
      prix_moyen_eur_par_kg, rendement_moyen_kg_par_ha, tendance, source
    plus enrichment keys (Agreste + optional RAG).
    """
    key = normalize_culture_key(culture)
    baseline = get_baseline(key)
    quote = get_latest_quote(key)
    historical_yield = get_historical_yield(key)
    trend = compute_price_trend(key)

    tendance = 0.0
    source_parts = ["barème de référence (prix absolu)"]
    price_is_fallback = True
    price_date = None
    if quote:
        baseline["prix_moyen_eur_par_kg"] = quote["price_eur_kg"]
        price_is_fallback = False
        price_date = quote["date"]
        source_parts = [f"{quote['source']} ({quote['market']}, {quote['region']}, {quote['stade']}, {quote['date']})"]
        if not quote["fresh"]:
            source_parts.append(f"cotation ancienne ({quote['age_days']} jours)")
    yield_kg_ha = baseline["rendement_moyen_kg_par_ha"]
    yield_std_kg_ha = None
    yield_is_fallback = True
    if historical_yield:
        yield_kg_ha = historical_yield["yield_kg_ha"]
        yield_std_kg_ha = historical_yield["std_kg_ha"]
        yield_is_fallback = False
        source_parts.append(historical_yield["source"])
    else:
        source_parts.append("barème de référence (rendement)")
    enrichment: dict = {
        "indice_pct_change": None,
        "latest_index": None,
        "produit_agreste": None,
        "justification": None,
        "market_score": None,
        "tendance_label": "inconnue",
        "demande": None,
        "concurrence": None,
    }

    if trend and trend.get("pct_change") is not None:
        tendance = pct_change_to_tendance(trend["pct_change"])
        enrichment["indice_pct_change"] = trend["pct_change"]
        enrichment["latest_index"] = trend.get("latest_index")
        enrichment["produit_agreste"] = trend.get("produit_label")
        enrichment["tendance_label"] = (
            "hausse" if tendance > 0.1 else "baisse" if tendance < -0.1 else "stable"
        )
        source_parts = [
            f"Agreste IPPAP ({trend.get('produit_label', key)}, "
            f"indice {trend['pct_change']}% / 6 mois)"
        ] + source_parts
    elif trend:
        enrichment["latest_index"] = trend.get("latest_index")
        enrichment["produit_agreste"] = trend.get("produit_label")
        source_parts = [
            f"Agreste IPPAP ({trend.get('produit_label', key)}, tendance indisponible)"
        ] + source_parts
    else:
        source_parts = ["Agreste IPPAP (aucune série trouvée)"] + source_parts

    rag = _optional_rag_score(key)
    if rag:
        enrichment["justification"] = rag.get("justification")
        # The LLM may summarize demand/competition, but its score is not used
        # or exposed as an input to deterministic scenario ranking.
        enrichment["market_score"] = None
        enrichment["demande"] = rag.get("demande")
        enrichment["concurrence"] = rag.get("concurrence")
        label = str(rag.get("tendance_prix") or "inconnue").lower()
        enrichment["tendance_label"] = label
        if trend is None or trend.get("pct_change") is None:
            tendance = _TENDANCE_LABEL.get(label, 0.0)
        # Soft blend: if RAG strongly disagrees with a weak CSV signal, nudge.
        sources = rag.get("stats", {}).get("sources") or []
        if sources:
            source_parts.append("FranceAgriMer RAG: " + ", ".join(sources[:3]))
        else:
            source_parts.append("FranceAgriMer RAG + Mistral")
    else:
        status = market_pipeline_status()
        if status["pdf_count"] and not status["chroma_ready"]:
            source_parts.append(
                "FranceAgriMer PDFs présents mais index Chroma absent "
                "(lancer: python -m app.market_intelligence.rag.ingest)"
            )

    return {
        "prix_moyen_eur_par_kg": baseline["prix_moyen_eur_par_kg"],
        "prix_fallback": price_is_fallback,
        "prix_date": price_date,
        "rendement_moyen_kg_par_ha": yield_kg_ha,
        "rendement_std_kg_par_ha": yield_std_kg_ha,
        "rendement_fallback": yield_is_fallback,
        "tendance": tendance,
        "source": " + ".join(source_parts),
        **enrichment,
    }
