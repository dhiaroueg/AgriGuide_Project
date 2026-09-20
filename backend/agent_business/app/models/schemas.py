"""
Modèles Pydantic de l'agent Business.

Alignés champ à champ sur database/schema.sql (business_scenarios,
farmer_decisions, decision_allocations) pour que la persistance en base
n'ait pas de mapping à réinventer.
"""

from __future__ import annotations
from datetime import date, datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Entrées (ce que l'agent Business reçoit)
# ---------------------------------------------------------------------------

class CropRecommendation(BaseModel):
    """Reflète une ligne de crop_recommendations produite par l'agent Agriculture."""
    rang: int
    culture: str
    score_compatibilite: float = Field(ge=0, le=100)
    cycle_jours: int = Field(gt=0)
    besoins_irrigation: dict
    besoins_engrais: dict
    besoins_pesticides: dict
    feature_importance: dict


class BusinessAdvisorRequest(BaseModel):
    """Input du endpoint POST /business/scenarios"""
    terrain_id: str
    terrain_ids: list[str] = Field(default_factory=list)
    superficie_disponible_ha: float = Field(gt=0)
    budget_input: float = Field(gt=0)
    date_plantation_prevue: date
    crop_recommendations: list[CropRecommendation] = Field(min_length=1)
    nb_scenarios: int = Field(default=3, ge=1, le=5)

    @field_validator("crop_recommendations")
    @classmethod
    def cultures_uniques(cls, values: list[CropRecommendation]) -> list[CropRecommendation]:
        keys = [value.culture.strip().lower() for value in values]
        if len(keys) != len(set(keys)):
            raise ValueError("Chaque culture ne peut apparaître qu'une fois")
        return values

    def resolved_terrain_ids(self) -> list[str]:
        ids = [value for value in self.terrain_ids if value]
        if self.terrain_id and self.terrain_id not in ids:
            ids.insert(0, self.terrain_id)
        return ids or ([self.terrain_id] if self.terrain_id else [])


# ---------------------------------------------------------------------------
# Sortie intermédiaire (résultats des services avant assemblage)
# ---------------------------------------------------------------------------

class EtudeMarche(BaseModel):
    prix_moyen_eur_par_kg: float
    rendement_estime_kg_par_ha: float
    tendance_prix: float  # -1 à 1
    date_recolte_estimee: date
    profit_brut_par_ha: float
    source: str
    # Enrichissement Agreste / RAG (optionnels, rétrocompatibles)
    indice_pct_change: Optional[float] = None
    latest_index: Optional[float] = None
    produit_agreste: Optional[str] = None
    justification_marche: Optional[str] = None
    market_score: Optional[float] = None
    tendance_label: Optional[str] = None
    demande: Optional[str] = None  # forte|moderee|faible|inconnue
    concurrence: Optional[str] = None
    rendement_std_kg_par_ha: Optional[float] = None
    rendement_fallback: bool = True
    prix_fallback: bool = True
    prix_date: Optional[str] = None



class EtudeRisque(BaseModel):
    risque_principal: str
    description: str
    probabilite: float = Field(ge=0, le=1)
    impact: float = Field(ge=0, le=1)
    risque_score_normalise: float = Field(ge=0, le=1)  # probabilite * impact
    solution_mitigation: str
    cout_mitigation_eur_par_ha: float
    raisons: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    donnees_reelles: bool = False


class IndicateursFinanciers(BaseModel):
    """Indicateurs calculés de façon déterministe, jamais par le LLM."""
    revenu_brut_estime_eur: float
    cout_total_estime_eur: float
    profit_estime_eur: float
    profit_margin_pct: float
    roi_pct: float
    prix_seuil_rentabilite_eur_par_kg: Optional[float] = None
    rendement_seuil_kg_par_ha: Optional[float] = None
    budget_suffisant: bool
    budget_gap_eur: float
    cout_production_eur_par_ha: float
    cout_mitigation_eur_par_ha: float
    cout_total_eur_par_ha: float
    source_cout: str
    cout_fallback: bool


class ConfianceDonnees(BaseModel):
    niveau: str  # low | medium | high
    score: float = Field(ge=0, le=1)
    raisons: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Explicabilité — détail des calculs, pour le bouton "Détails" côté frontend
# ---------------------------------------------------------------------------

class DetailCalculMetrique(BaseModel):
    """Explique comment une métrique du scénario a été obtenue : formule, valeurs
    intermédiaires utilisées, et sources des données d'entrée."""
    formule: str
    valeurs: dict
    sources: list[str]


class DetailCalculScenario(BaseModel):
    """Regroupe l'explication de chaque métrique affichée dans une carte scénario."""
    score_matching: DetailCalculMetrique
    surface_conseillee: DetailCalculMetrique
    rendement_estime: DetailCalculMetrique
    recolte_estimee: DetailCalculMetrique
    profit_estime: DetailCalculMetrique


# ---------------------------------------------------------------------------
# Sortie finale — reflète business_scenarios
# ---------------------------------------------------------------------------

class BusinessScenario(BaseModel):
    id: Optional[str] = None
    terrain_id: str
    budget_input: float
    culture: str
    quantite_par_ha: float
    profit_estime: float
    risque_score: float
    risque_description: str
    solution_risque: str
    matching_score: float = Field(ge=0, le=100)
    score_compatibilite: float = Field(ge=0, le=100)
    etude_marche: dict
    indicateurs_financiers: IndicateursFinanciers
    confiance_donnees: ConfianceDonnees
    raisons_risque: list[str] = Field(default_factory=list)
    superficie_max_financable_ha: float  # combien d'ha ce budget permet de couvrir
    superficie_conseillee_ha: float  # min(disponible, max_financable) — surface réellement recommandée
    detail_calcul: DetailCalculScenario
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BusinessAdvisorResponse(BaseModel):
    terrain_id: str
    budget_input: float
    scenarios: list[BusinessScenario]


# ---------------------------------------------------------------------------
# Human-in-the-loop — reflète farmer_decisions + decision_allocations
# ---------------------------------------------------------------------------

class AllocationChoisie(BaseModel):
    scenario_id: str
    culture: str
    hectares_alloues: float = Field(gt=0)

    @field_validator("hectares_alloues")
    @classmethod
    def hectares_positifs(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("hectares_alloues doit être positif")
        return v


class FarmerDecisionRequest(BaseModel):
    """Input du endpoint POST /business/decision (confirmation du farmer)"""
    terrain_id: str
    terrain_ids: list[str] = Field(default_factory=list)
    allocations: list[AllocationChoisie] = Field(min_length=1)
    superficie_disponible_ha: float = Field(gt=0)

    def resolved_terrain_ids(self) -> list[str]:
        ids = [value for value in self.terrain_ids if value]
        if self.terrain_id and self.terrain_id not in ids:
            ids.insert(0, self.terrain_id)
        return ids or ([self.terrain_id] if self.terrain_id else [])


class FarmerDecisionResponse(BaseModel):
    decision_id: str
    terrain_id: str
    statut: str  # 'confirmed'
    cout_final: float
    superficie_totale_allouee_ha: float
    allocations: list[dict]  # inclut date_maturite_prevue par culture
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
