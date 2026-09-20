"""
Soil Carbon Sequestration & Carbon Credit Calculation Service.

Implements IPCC / Label Bas-Carbone agricultural soil carbon storage methodology
based on tillage practices, cover cropping, organic amendments, and crop residues.
"""
from __future__ import annotations

from app.models.schemas import CarbonCalculationRequest, CarbonCalculationResponse

CARBON_PRICE_PER_TON_EUR = 40.0  # Current voluntary/certified carbon market average price per tCO2e


def calculate_carbon_credits(req: CarbonCalculationRequest) -> CarbonCalculationResponse:
    """Calculates soil carbon sequestration rate, total farm tCO2e/yr, and carbon credit potential."""
    
    # 1. Base sequestration per practice (t CO2e / ha / year)
    tillage_gains = {
        "semis_direct": 1.20,
        "travail_reduit": 0.65,
        "labour_conventionnel": 0.10,
    }
    
    cover_gains = {
        "couvert_permanent": 1.50,
        "couvert_intermediaire": 0.90,
        "aucun": 0.00,
    }
    
    amendment_gains = {
        "compost": 0.85,
        "fumier": 0.60,
        "aucun": 0.00,
    }
    
    residue_gains = {
        "restitution_sol": 0.55,
        "exportation_paille": -0.20,
    }
    
    base_tillage = tillage_gains.get(req.tillage_practice, 0.50)
    base_cover = cover_gains.get(req.cover_crop, 0.45)
    base_amendment = amendment_gains.get(req.organic_amendments, 0.30)
    base_residue = residue_gains.get(req.residue_management, 0.20)
    
    # 2. Clay & Soil Carbon Texture Multiplier (Clay stabilizes humus)
    clay_multiplier = 1.0
    if req.clay_pct is not None:
        if req.clay_pct > 35:
            clay_multiplier = 1.15  # Clay-rich soils retain more carbon
        elif req.clay_pct < 15:
            clay_multiplier = 0.88  # Sandy soils oxidize carbon faster
            
    # Calculate per hectare rate
    subtotal = base_tillage + base_cover + base_amendment + base_residue
    sequestration_rate = round(max(0.1, subtotal * clay_multiplier), 2)
    
    total_sequestration = round(sequestration_rate * req.area_ha, 2)
    estimated_revenue = round(total_sequestration * CARBON_PRICE_PER_TON_EUR, 2)
    
    # Breakdown by practice for the parcel
    breakdown = {
        "Travail du sol": round(base_tillage * clay_multiplier * req.area_ha, 2),
        "Couverts végétaux": round(base_cover * clay_multiplier * req.area_ha, 2),
        "Amendements organiques": round(base_amendment * clay_multiplier * req.area_ha, 2),
        "Restitution des résidus": round(base_residue * clay_multiplier * req.area_ha, 2),
    }
    
    # Practice score calculation (0% to 100%)
    max_possible_rate = (1.20 + 1.50 + 0.85 + 0.55) * 1.15  # ~4.7 tCO2e/ha/yr max
    score_pct = round(min(100.0, (sequestration_rate / max_possible_rate) * 100.0), 1)
    
    # Rating assignment
    if score_pct >= 80:
        rating = "A+ Excellent (Champion Bas-Carbone)"
    elif score_pct >= 60:
        rating = "A Très Bon"
    elif score_pct >= 40:
        rating = "B Bon"
    elif score_pct >= 25:
        rating = "C Moyen"
    else:
        rating = "D Améliorable"
        
    # Actionable recommendations
    recommendations = []
    if req.tillage_practice == "labour_conventionnel":
        recommendations.append("Passer en travail réduit ou semis direct pour réduire l'oxydation de la matière organique (+0.55 à +1.10 t CO2e/ha/an).")
    if req.cover_crop == "aucun":
        recommendations.append("Implanter des couverts végétaux d'interculture (légumineuses + graminées) (+0.90 t CO2e/ha/an).")
    if req.residue_management == "exportation_paille":
        recommendations.append("Restituer les pailles et résidus de récolte au sol plutôt que les exporter (+0.75 t CO2e/ha/an).")
    if req.organic_amendments == "aucun":
        recommendations.append("Apporter du compost ou fumier de ferme pour enrichir le complexe argilo-humique (+0.60 à +0.85 t CO2e/ha/an).")
        
    if not recommendations:
        recommendations.append("Vos pratiques actuelles sont optimales pour le stockage de carbone ! Conservez ce mode de conduite pour maintenir la certification Label Bas-Carbone.")
        
    certification_eligible = score_pct >= 40.0
    
    return CarbonCalculationResponse(
        area_ha=req.area_ha,
        sequestration_rate_t_co2e_ha_yr=sequestration_rate,
        total_sequestration_t_co2e_yr=total_sequestration,
        estimated_credit_value_eur_yr=estimated_revenue,
        credit_price_per_ton_eur=CARBON_PRICE_PER_TON_EUR,
        carbon_rating=rating,
        practices_score_pct=score_pct,
        breakdown_by_practice=breakdown,
        recommendations=recommendations,
        certification_eligible=certification_eligible,
    )
