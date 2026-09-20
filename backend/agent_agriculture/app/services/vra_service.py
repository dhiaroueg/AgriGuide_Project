"""
Variable Rate Application (VRA) Fertilizer Modulation Service.

Generates precision nitrogen prescription maps divided into satellite NDVI vigor zones.
Outputs ISOBUS TaskData metadata and CSV files for tractor sprayers.
"""
from __future__ import annotations

import json
from app.models.schemas import VraPrescriptionRequest, VraPrescriptionResponse, VraZonePrescription


def generate_vra_prescription(req: VraPrescriptionRequest) -> VraPrescriptionResponse:
    """Generates a zone-by-zone nitrogen prescription map and tractor export files."""
    base_budget = req.total_n_budget_kg_ha
    area = req.area_ha
    strategy = req.strategy

    # 1. Modulation coefficients according to strategy
    if strategy == "soil_potential":
        # Save N in rich zones, boost medium zones
        mod_high = 0.85
        mod_mid = 1.00
        mod_low = 0.75
    elif strategy == "protein_optimization":
        # Maximum N in high vigor zones for high protein content
        mod_high = 1.15
        mod_mid = 0.95
        mod_low = 0.70
    else:  # "ndvi_proportional" (default)
        # Proportional modulation
        mod_high = 1.10
        mod_mid = 1.00
        mod_low = 0.75

    dose_high = round(base_budget * mod_high, 1)
    dose_mid = round(base_budget * mod_mid, 1)
    dose_low = round(base_budget * mod_low, 1)

    # 2. Zone area distribution (40% High, 45% Mid, 15% Low)
    ha_high = round(area * 0.40, 2)
    ha_mid = round(area * 0.45, 2)
    ha_low = round(area * 0.15, 2)

    tot_n_high = round(dose_high * ha_high, 1)
    tot_n_mid = round(dose_mid * ha_mid, 1)
    tot_n_low = round(dose_low * ha_low, 1)

    zones = [
        VraZonePrescription(
            zone_id="Z1_HIGH",
            label="Zone Haute Vigueur (NDVI > 0.70)",
            ndvi_range="0.70 - 0.90",
            area_pct=40.0,
            area_ha=ha_high,
            prescribed_n_dose_kg_ha=dose_high,
            total_n_zone_kg=tot_n_high,
            color_hex="#22c55e",
        ),
        VraZonePrescription(
            zone_id="Z2_MID",
            label="Zone Vigueur Moyenne (NDVI 0.50 - 0.70)",
            ndvi_range="0.50 - 0.70",
            area_pct=45.0,
            area_ha=ha_mid,
            prescribed_n_dose_kg_ha=dose_mid,
            total_n_zone_kg=tot_n_mid,
            color_hex="#eab308",
        ),
        VraZonePrescription(
            zone_id="Z3_LOW",
            label="Zone Faible Vigueur / Stress (NDVI < 0.50)",
            ndvi_range="0.20 - 0.50",
            area_pct=15.0,
            area_ha=ha_low,
            prescribed_n_dose_kg_ha=dose_low,
            total_n_zone_kg=tot_n_low,
            color_hex="#ef4444",
        ),
    ]

    # 3. Overall Savings Calculation
    total_n_modulated = tot_n_high + tot_n_mid + tot_n_low
    total_n_flat = round(base_budget * area, 1)
    n_saved_total = round(max(0.0, total_n_flat - total_n_modulated), 1)

    avg_modulated_dose = round(total_n_modulated / area, 1) if area > 0 else base_budget
    savings_eur = round(n_saved_total * req.fertilizer_unit_cost_eur_kg, 2)
    savings_pct = round((n_saved_total / total_n_flat) * 100.0, 1) if total_n_flat > 0 else 0.0

    # 4. Generate ISOBUS TaskData JSON metadata
    isobus_payload = {
        "ISO11783_TaskData": {
            "VersionMajor": 4,
            "VersionMinor": 2,
            "ManagementSoftwareManufacturer": "AgriGuide AgTech",
            "ManagementSoftwareVersion": "2.4.0",
            "Task": {
                "TaskDesignator": f"Modulation_Azote_{req.crop_type}",
                "Customer": "Exploitation Agricole",
                "Farm": "Parcelle Principale",
                "CulturalPractice": req.crop_type,
                "TargetYield_q_ha": req.target_yield_q_ha,
                "PrescriptionGrid": [
                    {
                        "ZoneID": z.zone_id,
                        "Label": z.label,
                        "RateKgPerHa": z.prescribed_n_dose_kg_ha,
                        "AreaHa": z.area_ha,
                        "ColorHex": z.color_hex,
                    }
                    for z in zones
                ],
            },
        }
    }
    isobus_json_str = json.dumps(isobus_payload, indent=2, ensure_ascii=False)

    # 5. Generate CSV Prescription String
    csv_lines = [
        "Zone_ID;Designation;NDVI_Min_Max;Surface_ha;Dose_Prescrite_kgN_ha;Quantite_Totale_kgN",
        f"Z1_HIGH;Zone Haute Vigueur;0.70-0.90;{ha_high};{dose_high};{tot_n_high}",
        f"Z2_MID;Zone Vigueur Moyenne;0.50-0.70;{ha_mid};{dose_mid};{tot_n_mid}",
        f"Z3_LOW;Zone Faible Vigueur;0.20-0.50;{ha_low};{dose_low};{tot_n_low}",
        f"TOTAL;Bilan Parcelle Modulation;-;{area};{avg_modulated_dose};{total_n_modulated}",
    ]
    csv_prescription_str = "\n".join(csv_lines)

    return VraPrescriptionResponse(
        crop_type=req.crop_type,
        area_ha=area,
        strategy=strategy,
        base_n_budget_kg_ha=base_budget,
        modulated_avg_n_dose_kg_ha=avg_modulated_dose,
        n_saved_total_kg=n_saved_total,
        savings_eur=savings_eur,
        savings_pct=savings_pct,
        zones=zones,
        isobus_task_data_json=isobus_json_str,
        csv_prescription=csv_prescription_str,
    )
