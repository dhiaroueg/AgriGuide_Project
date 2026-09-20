"""
Orchestrator router — the "agent" from the project's architecture doc.
Currently a fixed parallel-then-sequential flow rather than a true
tool-calling agent loop (documented MVP simplification, same as the
standalone prototype this was ported from): same data contracts, easy
to swap in real agentic tool-selection later without changing any
service module.
"""
import asyncio

import psycopg2
from fastapi import APIRouter, Depends, HTTPException

from app.models.schemas import (
    ParcelRequest,
    ParcelResolution,
    NeighborCropContext,
    AnalyzeRequest,
    AnalyzeResponse,
    CropRecommendationOut,
    Coordinate,
    SoilData,
    WeatherData,
    VegetationData,
    DLCropObservation,
    YieldEstimate,
    NdviHeatmapResponse,
    ChatRequest,
    ChatResponse,
    SatelliteTimelineRequest,
    SatelliteTimelineResponse,
    CarbonCalculationRequest,
    CarbonCalculationResponse,
    VraPrescriptionRequest,
    VraPrescriptionResponse,
)
from app.services import (
    parcel_service,
    soil_service,
    weather_service,
    satellite_service,
    satellite_timeline_service,
    ml_service,
    agro_calc_service,
    yield_service,
    rag_service,
    synthesis_service,
    dl_service,
    persistence_service,
    relief3d_service,
    chatbot_service,
    carbon_service,
    vra_service,
)
from app.security import get_optional_user_id

router = APIRouter(prefix="/agriculture", tags=["agriculture"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    user_id: str | None = Depends(get_optional_user_id),
):
    """Floating chat widget — RAG + optional parcel snapshot + logged-in user profile from DB."""
    if not (req.question or "").strip():
        raise HTTPException(status_code=400, detail="Question vide.")

    user_profile = None
    if user_id:
        try:
            user_profile = await asyncio.to_thread(persistence_service.get_user_chat_profile, user_id)
        except Exception:  # noqa: BLE001 — profile is optional context; chat must still answer
            user_profile = None

    try:
        return await chatbot_service.answer_question(
            question=req.question.strip(),
            history=req.history,
            parcel_context=req.parcel_context,
            user_profile=user_profile,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Assistant indisponible : {exc}") from exc


@router.post("/relief/grid")
async def get_relief_grid(geometry: dict):
    """Return the terrain mesh data and satellite indices for the 3D viewer."""
    if not geometry or "type" not in geometry or "coordinates" not in geometry:
        raise HTTPException(status_code=400, detail="Géométrie GeoJSON de parcelle manquante ou invalide.")
    try:
        return await relief3d_service.build_relief_grid(geometry)
    except Exception as exc:  # noqa: BLE001 - external data sources may fail independently
        raise HTTPException(status_code=502, detail=f"Relief 3D indisponible : {exc}") from exc


@router.post("/relief/orthophoto")
async def get_relief_orthophoto(geometry: dict):
    """Return an IGN orthophoto data URL for the selected 3D texture."""
    if not geometry or "type" not in geometry or "coordinates" not in geometry:
        raise HTTPException(status_code=400, detail="Géométrie GeoJSON de parcelle manquante ou invalide.")
    try:
        return {"image_base64": await asyncio.to_thread(relief3d_service.build_orthophoto_data_url, geometry)}
    except Exception as exc:  # noqa: BLE001 - IGN availability is exposed to the UI
        raise HTTPException(status_code=502, detail=f"Orthophoto IGN indisponible : {exc}") from exc


@router.post("/parcel/resolve", response_model=ParcelResolution)
async def resolve_parcel_only(req: ParcelRequest):
    return await parcel_service.resolve_parcel(req)


@router.post("/parcel/neighbors", response_model=NeighborCropContext)
async def get_neighbors(req: ParcelRequest, radius_m: float = 800):
    parcel = await parcel_service.resolve_parcel(req)
    centroid = parcel.centroid or req.point
    return await parcel_service.get_neighboring_crop_context(
        centroid, radius_m=radius_m, exclude_parcel_id=parcel.rpg_id_parcel
    )


@router.post("/parcel/ndvi_heatmap", response_model=NdviHeatmapResponse)
async def ndvi_heatmap(req: ParcelRequest):
    """Backs the map frontend's legacy NDVI heatmap toggle."""
    parcel = await parcel_service.resolve_parcel(req)
    if not parcel.resolved or not parcel.geometry:
        raise HTTPException(
            status_code=422,
            detail=parcel.warning or "Impossible de résoudre une limite de parcelle pour la carte NDVI.",
        )
    result = await satellite_service.get_ndvi_heatmap_png(parcel.geometry)
    if result.get("warning") and not result.get("image_base64"):
        raise HTTPException(status_code=502, detail=result["warning"])
    return NdviHeatmapResponse(**result)


@router.post("/parcel/satellite_timeline", response_model=SatelliteTimelineResponse)
async def get_satellite_timeline(req: SatelliteTimelineRequest):
    """
    Multi-temporal Sentinel-2 satellite analysis: NDVI (biomass),
    NDWI (water stress), RGB (true color), 12-month temporal timeline,
    and year-over-year (N vs N-1) comparison.
    """
    if not req.geometry or "type" not in req.geometry:
        raise HTTPException(status_code=400, detail="Géométrie GeoJSON de parcelle manquante ou invalide.")
    try:
        return await asyncio.to_thread(satellite_timeline_service.build_satellite_timeline, req)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Analyse satellite multi-temporelle indisponible : {exc}") from exc


def _besoins_for_crop(
    crop: str,
    soil: SoilData,
    weather: WeatherData,
    yield_objective_q_ha: float | None,
    dl_observation: DLCropObservation | None = None,
):
    """Runs the agro-calc formulas for one candidate crop so every entry in the top-5 list carries real fertilizer/irrigation numbers."""
    estimate = agro_calc_service.estimate_fertilizer_and_irrigation(
        crop, soil, weather, yield_objective_q_ha, dl_observation
    )
    besoins_irrigation = {
        "irrigation_need_mm": estimate.irrigation_need_mm,
        "irrigation_window_days": estimate.irrigation_window_days,
        "total_et0_mm": estimate.total_et0_mm,
        "total_effective_precip_mm": estimate.total_effective_precip_mm,
        "note": estimate.irrigation_method_note,
    }
    besoins_engrais = {
        "n_dose_kg_ha": estimate.n_dose_kg_ha,
        "n_besoins_kg_ha": estimate.n_besoins_kg_ha,
        "n_fournitures_kg_ha": estimate.n_fournitures_kg_ha,
        "n_dl_credit_kg_ha": estimate.n_dl_credit_kg_ha,
        "yield_objective_q_ha": estimate.yield_objective_q_ha,
        "note": estimate.n_method_note,
    }
    if estimate.warning:
        besoins_irrigation["warning"] = estimate.warning
        besoins_engrais["warning"] = estimate.warning
    besoins_pesticides = {
        "warning": (
            "Non calculé — nécessite un module BSV (Bulletin de Santé du Végétal) croisant "
            "les données climatiques régionales avec les risques phytosanitaires connus."
        )
    }
    return estimate, besoins_irrigation, besoins_engrais, besoins_pesticides


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    warnings: list[str] = []

    terrain_row = None
    if req.terrain_id:
        try:
            terrain_row = persistence_service.get_terrain(req.terrain_id)
        except psycopg2.OperationalError as e:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Base Postgres inaccessible. En local, lancez `docker compose up -d db` "
                    f"(port 5434) et vérifiez DATABASE_URL. Détail : {e}"
                ),
            ) from e
        if not terrain_row:
            raise HTTPException(status_code=404, detail="Terrain introuvable.")
        centroid = Coordinate(lat=terrain_row["centroid_lat"], lon=terrain_row["centroid_lon"])
        parcel = await parcel_service.resolve_parcel(ParcelRequest(point=centroid))
        parcel.geometry = terrain_row["geometry"]
        parcel.area_ha = terrain_row["superficie_ha"]
        parcel.centroid = centroid
        parcel.resolved = True
        if parcel.source == "unresolved":
            parcel.source = "manual"
    else:
        parcel = await parcel_service.resolve_parcel(ParcelRequest(point=req.point, manual_geojson=req.manual_geojson))
        if not parcel.resolved:
            raise HTTPException(
                status_code=422,
                detail=parcel.warning or "Impossible de résoudre une parcelle à cet endroit.",
            )

    results = await asyncio.gather(
        soil_service.get_soil_data(parcel.centroid),
        weather_service.get_weather_data(parcel.centroid),
        satellite_service.get_ndvi(parcel.geometry) if parcel.geometry else asyncio.sleep(0, result=None),
        dl_service.predict_crop(parcel.geometry) if parcel.geometry else asyncio.sleep(0, result=None),
        parcel_service.get_neighboring_crop_context(parcel.centroid, radius_m=800, exclude_parcel_id=parcel.rpg_id_parcel),
        return_exceptions=True,
    )
    soil, weather, vegetation, dl_observation, neighbors = results

    if isinstance(soil, Exception):
        soil = SoilData(
            source="unavailable",
            warning="Données cartographiques de sol temporairement indisponibles.",
        )
    if isinstance(weather, Exception):
        weather = WeatherData(source="unavailable", warning=f"Erreur données météo : {weather}")
    if vegetation is None:
        vegetation = VegetationData(source="unavailable", warning="Aucune géométrie de parcelle disponible.")
    elif isinstance(vegetation, Exception):
        vegetation = VegetationData(source="unavailable", warning=f"Erreur NDVI : {vegetation}")
    if dl_observation is None:
        dl_observation = DLCropObservation(source="unavailable", warning="Aucune géométrie disponible pour classification DL.")
    elif isinstance(dl_observation, Exception):
        dl_observation = DLCropObservation(source="unavailable", warning=f"Erreur classification DL : {dl_observation}")
    if isinstance(neighbors, Exception):
        warnings.append(f"Contexte parcelles voisines indisponible : {neighbors}")
        neighbors = None

    _MAX_DISPLAYED_CROPS = 5
    crop_recs = ml_service.recommend_crops(soil, weather, dl_observation)[:_MAX_DISPLAYED_CROPS]
    crop_recommendations_out: list[CropRecommendationOut] = []
    top_crop_agro = None
    top_crop_yield: YieldEstimate | None = None
    for rank, rec in enumerate(crop_recs, start=1):
        rec_yield = yield_service.estimate_yield(rec)
        yield_objective = req.yield_objective_q_ha or rec_yield.yield_estimate_q_ha
        estimate, besoins_irrigation, besoins_engrais, besoins_pesticides = _besoins_for_crop(
            rec.crop, soil, weather, yield_objective, dl_observation
        )
        if rank == 1:
            top_crop_agro = estimate
            top_crop_yield = rec_yield
        crop_recommendations_out.append(
            CropRecommendationOut(
                rang=rank,
                culture=rec.crop,
                score_compatibilite=round(rec.suitability_score * 100, 2),
                cycle_jours=ml_service.CYCLE_DAYS.get(rec.crop, 0),
                besoins_irrigation=besoins_irrigation,
                besoins_engrais=besoins_engrais,
                besoins_pesticides=besoins_pesticides,
                feature_importance=rec.reasoning_features,
            )
        )
    top_crop = crop_recs[0].crop if crop_recs else None

    report = None
    try:
        chunks = await asyncio.to_thread(
            rag_service.retrieve,
            query=f"bonnes pratiques agronomiques pour {top_crop}" if top_crop else "bonnes pratiques agronomiques",
            crop_filter=top_crop,
        )
        if not chunks and top_crop:
            chunks = await asyncio.to_thread(
                rag_service.retrieve,
                query=f"bonnes pratiques agronomiques pour {top_crop}",
                crop_filter=None,
            )
        synthesis = await synthesis_service.synthesize_stage1(
            parcel, soil, weather, crop_recs, chunks, vegetation, dl_observation, top_crop_agro, top_crop_yield
        )
        report = await synthesis_service.generate_report(synthesis, parcel)
    except Exception as e:  # noqa: BLE001
        warnings.append(f"Rapport IA non généré : {e}")

    land_profile_id = None
    persisted = False
    if req.terrain_id:
        try:
            rpg_historique = None
            if parcel.crop_declared or parcel.parcel_id:
                rpg_historique = {
                    "crop_declared": parcel.crop_declared,
                    "parcel_id": parcel.parcel_id,
                    "rpg_id_parcel": parcel.rpg_id_parcel,
                    "is_agricultural": parcel.is_agricultural,
                }
            land_profile_id = persistence_service.save_land_profile(
                terrain_id=req.terrain_id,
                sol_data=soil.model_dump(),
                satellite_data={**vegetation.model_dump(), "dl_observation": dl_observation.model_dump()},
                rpg_historique=rpg_historique,
                cultures_voisines=neighbors.crop_distribution_pct if neighbors else None,
                climat_data=weather.model_dump(),
            )
            persistence_service.save_crop_recommendations(land_profile_id, crop_recommendations_out)
            persisted = True
        except Exception as e:  # noqa: BLE001
            warnings.append(f"Résultats non persistés en base : {e}")

    weather_stats = synthesis_service.compute_weather_stats(weather)

    return AnalyzeResponse(
        terrain_id=req.terrain_id,
        land_profile_id=land_profile_id,
        persisted=persisted,
        parcel=parcel,
        soil=soil,
        weather=weather,
        weather_stats=weather_stats,
        vegetation=vegetation,
        dl_observation=dl_observation,
        neighbors=neighbors,
        crop_recommendations=crop_recommendations_out,
        agro_calc_top_crop=top_crop_agro,
        yield_estimate=top_crop_yield,
        report=report,
        warnings=warnings,
    )


@router.post("/carbon/estimate", response_model=CarbonCalculationResponse)
async def estimate_carbon_credits(req: CarbonCalculationRequest):
    """Estimate agricultural soil carbon sequestration (tCO2e/yr) and carbon credit revenue potential."""
    try:
        return carbon_service.calculate_carbon_credits(req)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Erreur calcul Bilan Carbone : {exc}") from exc


@router.post("/vra/prescription", response_model=VraPrescriptionResponse)
async def generate_vra_prescription(req: VraPrescriptionRequest):
    """Generate precision nitrogen VRA modulation zones and ISOBUS/CSV export prescription files."""
    try:
        return vra_service.generate_vra_prescription(req)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Erreur génération carte de modulation VRA : {exc}") from exc

