"""
Service Scenario Generator — orchestre market_study + risk_study + scoring
pour produire les N scénarios finaux (3 par défaut), triés par matching_score.

C'est ce service que le endpoint FastAPI appelle directement.
"""

from datetime import date
import uuid

from app.models.schemas import (
    BusinessAdvisorRequest,
    BusinessScenario,
    ConfianceDonnees,
    CropRecommendation,
    DetailCalculMetrique,
    DetailCalculScenario,
)
from app.services.financial_service import (
    compute_financial_indicators,
    estimate_production_cost,
)
from app.services.market_study import estimer_marche
from app.services.risk_study import evaluer_risque
from app.services.scoring import (
    POIDS_BUDGET_FIT,
    POIDS_COMPATIBILITE,
    POIDS_PROFIT,
    POIDS_RISQUE,
    CandidatScoring,
    ScoreDetail,
    calculer_matching_scores_detailles,
)


def _construire_candidat(
    crop: CropRecommendation,
    date_plantation: date,
    budget_input: float,
) -> tuple[CandidatScoring, dict]:
    """
    Calcule toutes les données intermédiaires pour une culture, et retourne :
    - le candidat prêt pour le scoring
    - un dict de données brutes réutilisées pour construire le scénario final
      ET le détail de calcul explicable
    """
    etude_marche = estimer_marche(crop, date_plantation)
    cout_estime = estimate_production_cost(crop)
    etude_risque = evaluer_risque(crop, etude_marche, cout_estime)

    cout_production_par_ha = cout_estime.cost_per_ha
    cout_total_par_ha = cout_production_par_ha + etude_risque.cout_mitigation_eur_par_ha

    profit_net_par_ha = etude_marche.profit_brut_par_ha - cout_total_par_ha
    superficie_max_financable_ha = round(budget_input / cout_total_par_ha, 2)

    candidat = CandidatScoring(
        culture=crop.culture,
        profit_net_par_ha=profit_net_par_ha,
        risque_normalise=etude_risque.risque_score_normalise,
        superficie_max_financable_ha=superficie_max_financable_ha,
        compatibilite=crop.score_compatibilite / 100.0,
    )

    donnees_brutes = {
        "etude_marche": etude_marche,
        "etude_risque": etude_risque,
        "cycle_jours": crop.cycle_jours,
        "date_plantation": date_plantation,
        "cout_production_par_ha": cout_production_par_ha,
        "cout_estime": cout_estime,
        "score_compatibilite": crop.score_compatibilite,
        "cout_total_par_ha": cout_total_par_ha,
        "profit_net_par_ha": profit_net_par_ha,
        "superficie_max_financable_ha": superficie_max_financable_ha,
    }

    return candidat, donnees_brutes


def _construire_detail_calcul(
    culture: str,
    donnees: dict,
    score_detail: ScoreDetail,
    superficie_disponible_ha: float,
    superficie_conseillee_ha: float,
    profit_estime: float,
) -> DetailCalculScenario:
    """Construit l'explication pas-à-pas de chaque métrique affichée pour ce scénario."""
    etude_marche = donnees["etude_marche"]
    etude_risque = donnees["etude_risque"]

    score_matching = DetailCalculMetrique(
        formule=(
            "score = w1 * profit_normalisé + w2 * (1 - risque_normalisé) "
            "+ w3 * fit_budget + w4 * compatibilité Agriculture, "
            "puis ramené sur 100. Normalisation min-max du profit net/ha sur toutes les "
            "cultures candidates. Calcul déterministe (le LLM n'intervient pas ici)."
        ),
        valeurs={
            "poids_profit_w1": POIDS_PROFIT,
            "poids_risque_w2": POIDS_RISQUE,
            "poids_budget_w3": POIDS_BUDGET_FIT,
            "poids_compatibilite_w4": POIDS_COMPATIBILITE,
            "profit_normalise": score_detail.profit_normalise,
            "risque_normalise": score_detail.risque_normalise,
            "fit_budget": score_detail.fit_budget,
            "compatibilite_agriculture": score_detail.compatibilite,
            "matching_score": score_detail.score,
        },
        sources=["Formule interne AgriAdvisor — backend/agent_business/app/services/scoring.py"],
    )

    surface_conseillee = DetailCalculMetrique(
        formule=(
            "superficie_max_financable_ha = budget_input / cout_total_par_ha ; "
            "superficie_conseillee_ha = min(superficie_disponible_ha, superficie_max_financable_ha)"
        ),
        valeurs={
            "budget_input_eur": donnees.get("budget_input"),
            "cout_production_eur_par_ha": donnees["cout_production_par_ha"],
            "cout_mitigation_eur_par_ha": etude_risque.cout_mitigation_eur_par_ha,
            "cout_total_eur_par_ha": donnees["cout_total_par_ha"],
            "superficie_max_financable_ha": donnees["superficie_max_financable_ha"],
            "superficie_disponible_ha": superficie_disponible_ha,
            "superficie_conseillee_ha": superficie_conseillee_ha,
        },
        sources=[
            donnees["cout_estime"].source,
            "Budget renseigné par l'agriculteur (budget_input)",
        ],
    )

    rendement_estime = DetailCalculMetrique(
        formule="rendement_estime_kg_par_ha = rendement moyen historique de la culture (source marché).",
        valeurs={
            "culture": culture,
            "rendement_estime_kg_par_ha": etude_marche.rendement_estime_kg_par_ha,
        },
        sources=[etude_marche.source],
    )

    recolte_estimee = DetailCalculMetrique(
        formule="date_recolte_estimee = date_plantation_prevue + cycle_jours (cycle propre à la culture)",
        valeurs={
            "date_plantation_prevue": donnees["date_plantation"].isoformat(),
            "cycle_jours": donnees["cycle_jours"],
            "date_recolte_estimee": etude_marche.date_recolte_estimee.isoformat(),
        },
        sources=["crop_recommendations de l'agent Agriculture (cycle_jours par culture)"],
    )

    profit_estime_detail = DetailCalculMetrique(
        formule=(
            "profit_brut_par_ha = rendement_estime_kg_par_ha * prix_ajusté ; "
            "profit_net_par_ha = profit_brut_par_ha - (cout_production_par_ha + cout_mitigation_eur_par_ha) ; "
            "profit_estime = profit_net_par_ha * superficie_conseillee_ha"
        ),
        valeurs={
            "prix_moyen_eur_par_kg_ajuste": etude_marche.prix_moyen_eur_par_kg,
            "tendance_prix": etude_marche.tendance_prix,
            "rendement_estime_kg_par_ha": etude_marche.rendement_estime_kg_par_ha,
            "profit_brut_eur_par_ha": etude_marche.profit_brut_par_ha,
            "cout_total_eur_par_ha": donnees["cout_total_par_ha"],
            "profit_net_eur_par_ha": donnees["profit_net_par_ha"],
            "superficie_conseillee_ha": superficie_conseillee_ha,
            "profit_estime_eur": profit_estime,
        },
        sources=[
            etude_marche.source,
            donnees["cout_estime"].source,
            "Étude de risque déterministe Agriculture + marché + qualité des données",
        ],
    )
    if etude_marche.indice_pct_change is not None:
        profit_estime_detail.valeurs["indice_agreste_pct_6m"] = etude_marche.indice_pct_change
    if etude_marche.justification_marche:
        profit_estime_detail.valeurs["justification_marche"] = etude_marche.justification_marche
    if etude_marche.demande:
        profit_estime_detail.valeurs["demande"] = etude_marche.demande
    if etude_marche.concurrence:
        profit_estime_detail.valeurs["concurrence"] = etude_marche.concurrence
    return DetailCalculScenario(
        score_matching=score_matching,
        surface_conseillee=surface_conseillee,
        rendement_estime=rendement_estime,
        recolte_estimee=recolte_estimee,
        profit_estime=profit_estime_detail,
    )


def generer_scenarios(request: BusinessAdvisorRequest) -> list[BusinessScenario]:
    candidats: list[CandidatScoring] = []
    donnees_par_culture: dict[str, dict] = {}

    for crop in request.crop_recommendations:
        candidat, donnees = _construire_candidat(
            crop, request.date_plantation_prevue, request.budget_input
        )
        donnees["budget_input"] = request.budget_input
        candidats.append(candidat)
        donnees_par_culture[crop.culture] = donnees

    scores_detailles = calculer_matching_scores_detailles(candidats, request.superficie_disponible_ha)

    # Tri par matching_score décroissant, on garde les N meilleurs
    cultures_triees = sorted(scores_detailles.items(), key=lambda x: x[1].score, reverse=True)
    top_cultures = cultures_triees[: request.nb_scenarios]

    scenarios: list[BusinessScenario] = []
    for culture, score_detail in top_cultures:
        donnees = donnees_par_culture[culture]
        etude_marche = donnees["etude_marche"]
        etude_risque = donnees["etude_risque"]

        superficie_conseillee_ha = round(
            min(request.superficie_disponible_ha, donnees["superficie_max_financable_ha"]), 2
        )
        profit_estime = round(donnees["profit_net_par_ha"] * superficie_conseillee_ha, 2)
        indicateurs = compute_financial_indicators(
            area_ha=superficie_conseillee_ha,
            available_area_ha=request.superficie_disponible_ha,
            yield_kg_ha=etude_marche.rendement_estime_kg_par_ha,
            price_eur_kg=etude_marche.prix_moyen_eur_par_kg,
            production_cost_eur_ha=donnees["cout_production_par_ha"],
            mitigation_cost_eur_ha=etude_risque.cout_mitigation_eur_par_ha,
            budget_eur=request.budget_input,
            cost_source=donnees["cout_estime"].source,
            cost_fallback=donnees["cout_estime"].is_fallback,
        )

        confidence_score = donnees["cout_estime"].confidence
        confidence_reasons = list(donnees["cout_estime"].reasons)
        if etude_marche.indice_pct_change is not None:
            confidence_score += 0.08
            confidence_reasons.append("Tendance récente issue d'Agreste IPPAP.")
        else:
            confidence_reasons.append("Aucune série Agreste spécifique trouvée.")
        if not etude_marche.rendement_fallback:
            confidence_score += 0.12
            confidence_reasons.append("Rendement calculé depuis l'historique FAOSTAT.")
        else:
            confidence_reasons.append("Rendement issu du barème de référence.")
        if etude_marche.prix_fallback:
            confidence_score = min(confidence_score, 0.45)
            confidence_reasons.append(
                "Prix absolu indisponible : barème de secours utilisé. Ajoutez une cotation RNM/FranceAgriMer datée avant toute décision."
            )
        elif etude_marche.prix_date:
            confidence_score += 0.16
            confidence_reasons.append(f"Prix issu d'une cotation datée du {etude_marche.prix_date}.")
        confidence_score = round(min(1.0, confidence_score), 2)
        confidence_level = (
            "high" if confidence_score >= 0.75 else "medium" if confidence_score >= 0.5 else "low"
        )

        detail_calcul = _construire_detail_calcul(
            culture=culture,
            donnees=donnees,
            score_detail=score_detail,
            superficie_disponible_ha=request.superficie_disponible_ha,
            superficie_conseillee_ha=superficie_conseillee_ha,
            profit_estime=profit_estime,
        )

        scenarios.append(
            BusinessScenario(
                id=str(uuid.uuid4()),
                terrain_id=request.terrain_id,
                budget_input=request.budget_input,
                culture=culture,
                quantite_par_ha=etude_marche.rendement_estime_kg_par_ha,
                profit_estime=indicateurs.profit_estime_eur,
                risque_score=etude_risque.risque_score_normalise,
                risque_description=f"{etude_risque.risque_principal} — {etude_risque.description}",
                solution_risque=etude_risque.solution_mitigation,
                matching_score=score_detail.score,
                score_compatibilite=donnees["score_compatibilite"],
                etude_marche=etude_marche.model_dump(mode="json"),
                indicateurs_financiers=indicateurs,
                confiance_donnees=ConfianceDonnees(
                    niveau=confidence_level,
                    score=confidence_score,
                    raisons=confidence_reasons,
                ),
                raisons_risque=etude_risque.raisons,
                superficie_max_financable_ha=donnees["superficie_max_financable_ha"],
                superficie_conseillee_ha=superficie_conseillee_ha,
                detail_calcul=detail_calcul,
            )
        )

    return scenarios
