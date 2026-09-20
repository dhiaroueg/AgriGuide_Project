"""
Pydantic models shared across the pipeline. Kept in one file so every
service and the router agree on the same shapes.

Ported from the standalone `agri-advisor-parcelle` prototype, plus a
new request/response pair (`AnalyzeRequest` / `AnalyzeResponse`) that
wires the pipeline to this project's actual DB schema
(`database/schema.sql` — `terrains` / `land_profiles` /
`crop_recommendations`) and to `frontend/src/lib/businessApi.ts`'s
`CropRecommendation` shape, so the agent Business can eventually
consume this agent's real output instead of its mocks.
"""
from pydantic import BaseModel, Field
from typing import Optional, Literal


class Coordinate(BaseModel):
    lat: float
    lon: float


class ParcelRequest(BaseModel):
    point: Coordinate
    manual_geojson: Optional[dict] = None  # user-drawn fallback boundary


class ParcelResolution(BaseModel):
    resolved: bool
    source: Literal["cadastre", "rpg", "manual", "unresolved"]
    geometry: Optional[dict] = None
    centroid: Optional[Coordinate] = None
    parcel_id: Optional[str] = None
    rpg_id_parcel: Optional[str] = None  # RPG's own id_parcel field — distinct ID system from cadastre's idu; needed to correctly exclude this parcel from its own RPG-neighbor lookup
    area_ha: Optional[float] = None
    area_m2: Optional[float] = None
    crop_declared: Optional[str] = None
    is_agricultural: Optional[bool] = None  # RPG registration check
    agricultural_note: Optional[str] = None  # explains the check's limits
    warning: Optional[str] = None


class NeighborParcel(BaseModel):
    geometry: dict
    crop_code: Optional[str] = None


class NeighborCropContext(BaseModel):
    neighbor_count: int
    crop_distribution_pct: dict[str, float]  # e.g. {"Blé tendre": 45.0, "Maïs": 30.0, ...} — keys are display names via taxonomy.get_display_name
    neighbors: list[NeighborParcel]
    note: str


class SoilData(BaseModel):
    source: Literal["soilgrids", "inrae", "unavailable"]
    ph: Optional[float] = None
    nitrogen_g_kg: Optional[float] = None
    organic_carbon_g_kg: Optional[float] = None
    sand_pct: Optional[float] = None
    clay_pct: Optional[float] = None
    silt_pct: Optional[float] = None
    cec_cmolkg: Optional[float] = None          # Cation Exchange Capacity — proxy for K/P retention
    bulk_density_kg_dm3: Optional[float] = None  # Bulk density (soil compaction)
    coarse_fragments_pct: Optional[float] = None # Stones/gravel volume fraction
    depth_cm: Optional[str] = None
    warning: Optional[str] = None


class WeatherData(BaseModel):
    source: Literal["open-meteo", "unavailable"]
    daily_temp_mean_c: Optional[list[Optional[float]]] = None
    daily_precip_mm: Optional[list[Optional[float]]] = None
    daily_et0_mm: Optional[list[Optional[float]]] = None  # reference evapotranspiration, for irrigation estimate
    daily_dates: Optional[list[str]] = None
    # Snapshot « aujourd'hui » pour le widget météo UI (Open-Meteo current + daily[0])
    current_temp_c: Optional[float] = None
    current_humidity_pct: Optional[float] = None
    current_wind_kmh: Optional[float] = None
    current_precip_mm: Optional[float] = None
    weather_code: Optional[int] = None  # WMO weather interpretation code
    sunrise: Optional[str] = None  # ISO local, e.g. 2026-08-03T06:35
    sunset: Optional[str] = None
    today_temp_min_c: Optional[float] = None
    today_temp_max_c: Optional[float] = None
    observed_at: Optional[str] = None  # heure de l'observation current
    warning: Optional[str] = None


class RetrievedChunk(BaseModel):
    chunk_id: str
    text: str
    source_document: str
    crop: Optional[str] = None
    region: Optional[str] = None
    topic: Optional[str] = None
    score: float
    title: Optional[str] = None  # real HAL document title, looked up at ingest/backfill time — falls back to a filename-derived title if unavailable
    url: Optional[str] = None    # HAL permalink (hal.science/{hal_id}), always constructible from the filename


class CropRecommendation(BaseModel):
    """Raw output of `ml_service.recommend_crops` — internal pipeline shape."""
    crop: str
    suitability_score: float
    reasoning_features: dict


class AgroCalcEstimate(BaseModel):
    """
    Fertilizer (nitrogen) and irrigation estimates for a given crop —
    computed with published reference formulas/constants (COMIFER-style
    nitrogen balance, FAO-56 crop water balance), NOT by the LLM.
    Explicitly a simplified placeholder: nitrogen supply is estimated from
    soil organic carbon, not a real Nmin soil test; irrigation is based on
    the 16-day forecast window, not a full growing season. Both facts are
    carried in the notes fields so the report states the limitation
    honestly rather than presenting placeholder precision as authoritative.
    """
    crop: str
    # Nitrogen
    n_dose_kg_ha: Optional[float] = None
    n_besoins_kg_ha: Optional[float] = None       # crop need, from yield objective
    n_fournitures_kg_ha: Optional[float] = None   # estimated soil supply
    n_dl_credit_kg_ha: Optional[float] = None     # grassland-conversion N credit, from dl_service observation (0 if not applicable)
    yield_objective_q_ha: Optional[float] = None
    n_method_note: Optional[str] = None
    # Irrigation
    irrigation_need_mm: Optional[float] = None
    irrigation_window_days: Optional[int] = None
    total_et0_mm: Optional[float] = None
    total_effective_precip_mm: Optional[float] = None
    irrigation_method_note: Optional[str] = None
    warning: Optional[str] = None


class YieldEstimate(BaseModel):
    """
    Deterministic yield estimate for the top-recommended crop â€”
    base_yield_q_ha(crop) x adjustment_factor(suitability_score).
    NOT a calibrated agronomic yield model (no historical yield-trial
    data, soil-yield curves, or management/genotype info at this
    project's scope) â€” an honest placeholder, same trust tier as
    ml_service.py's scoring and agro_calc_service.py's formulas.
    yield_range_low/high_q_ha is a fixed +-15% band representing THIS
    METHOD's uncertainty, not a statistical confidence interval â€” see
    method_note.
    """
    crop: str
    yield_estimate_q_ha: Optional[float] = None
    yield_range_low_q_ha: Optional[float] = None
    yield_range_high_q_ha: Optional[float] = None
    base_yield_q_ha: Optional[float] = None       # French national-average reference before adjustment
    suitability_score: Optional[float] = None      # ml_service.py score this estimate was scaled from
    adjustment_factor: Optional[float] = None
    method_note: Optional[str] = None
    warning: Optional[str] = None


class SynthesisJSON(BaseModel):
    """Stage 1 output — every claim traceable to a source chunk."""
    parcel_id: Optional[str] = None
    location: Coordinate
    soil_summary: dict
    weather_summary: dict
    weather_stats: dict = Field(default_factory=dict)  # precomputed in Python (mean/min/max temp, total precip, rainy-day count) — ground truth for the audit, independent of whatever Stage 1 computed into weather_summary
    vegetation_summary: dict
    dl_observation_summary: dict = Field(default_factory=dict)  # set directly from DLCropObservation.model_dump() in Python — Stage 1 never sees or touches this, avoiding the LLM-recomputation risk found with weather_summary
    dl_mismatch_note: Optional[str] = None  # pre-formatted French sentence, computed in Python — Stage 2 copies it verbatim rather than generating it
    agro_calc_summary: dict = Field(default_factory=dict)  # set directly from AgroCalcEstimate.model_dump() in Python — same treatment, never LLM-generated
    yield_summary: dict = Field(default_factory=dict)  # set directly from YieldEstimate.model_dump() in Python — same treatment, never LLM-generated
    crop_recommendations: list[CropRecommendation]
    grounded_claims: list[dict]  # {"claim": str, "source_chunk_id": str}
    retrieved_chunk_count: int = 0  # chunks RAG actually returned — lets the report say "corpus vide" vs "rien d'exploitable dans les documents trouvés" instead of one ambiguous message for both
    data_gaps: list[str]


class AdvisorReport(BaseModel):
    parcel_id: Optional[str] = None
    report_markdown: str
    warnings: list[str] = Field(default_factory=list)
    unverified_figures: list[str] = Field(default_factory=list)  # numbers in the report not traceable to source data


class VegetationData(BaseModel):
    source: Literal["sentinel-2", "unavailable"]
    mean_ndvi: Optional[float] = None  # -1 to 1; roughly: <0.2 bare/sparse, 0.2-0.5 moderate, >0.5 dense healthy vegetation
    observation_window_days: Optional[int] = None
    valid_pixel_count: Optional[int] = None  # cloud-free samples used in the mean — low count = less reliable
    warning: Optional[str] = None


class NdviHeatmapResponse(BaseModel):
    """Colored NDVI PNG for map overlay, rendered server-side via the
    Sentinel Hub Process API (distinct from get_ndvi()'s Statistics API
    call, which only returns a single mean value)."""
    image_base64: Optional[str] = None
    bounds: Optional[dict] = None  # {"south": float, "west": float, "north": float, "east": float} â€” WGS84, for L.imageOverlay
    warning: Optional[str] = None


class DLCropObservation(BaseModel):
    """Phase B — a real-world satellite observation of what is CURRENTLY
    growing on the parcel today, as opposed to ml_service.py's soil/climate
    suitability model, which reasons about what WOULD grow well there.
    Used in two narrow, explicitly-bounded ways (see ml_service.py's
    _dl_evidence_bonus and agro_calc_service.py's _dl_prairie_n_credit):
      1. crop scoring: a small, capped bonus when the DL model independently
         confirms a candidate crop is already thriving on this exact parcel
         (real-world evidence, not a second opinion feeding the same
         soil/climate priors).
      2. fertilization: a documented soil-N credit when the parcel is
         currently under permanent/temporary meadow (grassland-to-arable
         conversion releases mineralized N for 1-2 seasons — a real,
         published agronomic effect, not a suitability judgement).
    Everything else in the pipeline (yield_service.py, NDVI-based reasoning)
    still deliberately ignores it — see those modules' own docstrings."""
    source: Literal["dl-tempcnn-breizhcrops", "unavailable"]
    predicted_class_fr: Optional[str] = None
    predicted_class_en: Optional[str] = None
    confidence: Optional[float] = None  # softmax probability of the predicted class, 0-1
    observation_timesteps: Optional[int] = None  # real cloud-free acquisitions used — low count = less reliable
    warning: Optional[str] = None


# ---------------------------------------------------------------------------
# New — /agriculture/analyze request/response.
#
# CropRecommendationOut mirrors `crop_recommendations` in `database/schema.sql`
# field-for-field (rang, culture, score_compatibilite, besoins_*,
# feature_importance) AND `frontend/src/lib/businessApi.ts`'s
# `CropRecommendation` type, so the agent Business can eventually call this
# agent directly instead of using mock data (see its README §"Prochaines
# étapes").
# ---------------------------------------------------------------------------


class AnalyzeRequest(BaseModel):
    point: Coordinate
    manual_geojson: Optional[dict] = None
    terrain_id: Optional[str] = None  # if provided, results are persisted against this terrain (must already exist in `terrains`)
    yield_objective_q_ha: Optional[float] = None  # optional override for the fertilizer calculation


class CropRecommendationOut(BaseModel):
    rang: int
    culture: str
    score_compatibilite: float  # 0-100
    cycle_jours: int
    besoins_irrigation: dict
    besoins_engrais: dict
    besoins_pesticides: dict
    feature_importance: dict


class AnalyzeResponse(BaseModel):
    terrain_id: Optional[str] = None
    land_profile_id: Optional[str] = None
    persisted: bool = False
    parcel: ParcelResolution
    soil: SoilData
    weather: WeatherData
    weather_stats: dict = Field(default_factory=dict)
    vegetation: VegetationData
    dl_observation: DLCropObservation
    neighbors: Optional[NeighborCropContext] = None
    crop_recommendations: list[CropRecommendationOut]
    agro_calc_top_crop: AgroCalcEstimate
    yield_estimate: Optional[YieldEstimate] = None  # top-recommended crop's yield estimate (Tier 3 addition — new response field)
    report: Optional[AdvisorReport] = None  # None when MISTRAL_API_KEY / RAG corpus aren't configured — degrades gracefully rather than failing the whole analysis
    warnings: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Floating chat widget — /agriculture/chat
# ---------------------------------------------------------------------------


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatSource(BaseModel):
    title: str
    url: str


class ChatParcelContext(BaseModel):
    """Subset of a prior AnalyzeResponse the frontend already has in memory."""
    parcel: Optional[ParcelResolution] = None
    soil: Optional[SoilData] = None
    weather_stats: Optional[dict] = None
    vegetation: Optional[VegetationData] = None
    crop_recommendations: Optional[list[CropRecommendationOut]] = None
    yield_estimate: Optional[YieldEstimate] = None
    agro_calc_top_crop: Optional[AgroCalcEstimate] = None


class ChatRequest(BaseModel):
    question: str
    history: list[ChatMessage] = Field(default_factory=list)
    parcel_context: Optional[ChatParcelContext] = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[ChatSource] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Multi-temporal Satellite Timeline — /agriculture/parcel/satellite_timeline
# ---------------------------------------------------------------------------


class SatelliteTimelineRequest(BaseModel):
    geometry: dict
    index_type: Literal["ndvi", "ndwi", "rgb"] = "ndvi"
    target_date: Optional[str] = None  # ISO format "YYYY-MM-DD" or "YYYY-MM"
    compare_year_prior: bool = False


class SatelliteIndexStats(BaseModel):
    mean: float
    min: float
    max: float
    std: float
    vigor_class: str
    water_stress_class: Optional[str] = None
    cloud_cover_pct: float = 0.0
    distribution_pct: dict[str, float] = Field(default_factory=dict)


class SatelliteTimelinePoint(BaseModel):
    date: str
    label: str
    ndvi: float
    ndwi: float
    prior_year_ndvi: Optional[float] = None
    prior_year_ndwi: Optional[float] = None
    cloud_cover_pct: float = 0.0


class SatelliteTimelineResponse(BaseModel):
    index_type: Literal["ndvi", "ndwi", "rgb"]
    target_date: str
    image_base64: Optional[str] = None
    bounds: Optional[dict] = None
    stats: SatelliteIndexStats
    timeline: list[SatelliteTimelinePoint] = Field(default_factory=list)
    prior_year_image_base64: Optional[str] = None
    delta_pct: Optional[float] = None
    warning: Optional[str] = None


# ---------------------------------------------------------------------------
# Bilan Carbone & Crédits Carbone Agricoles — /agriculture/carbon/estimate
# ---------------------------------------------------------------------------


class CarbonCalculationRequest(BaseModel):
    area_ha: float = Field(..., gt=0)
    tillage_practice: Literal["semis_direct", "travail_reduit", "labour_conventionnel"] = "semis_direct"
    cover_crop: Literal["couvert_permanent", "couvert_intermediaire", "aucun"] = "couvert_intermediaire"
    organic_amendments: Literal["compost", "fumier", "aucun"] = "compost"
    residue_management: Literal["restitution_sol", "exportation_paille"] = "restitution_sol"
    soil_carbon_g_kg: Optional[float] = None
    clay_pct: Optional[float] = None


class CarbonCalculationResponse(BaseModel):
    area_ha: float
    sequestration_rate_t_co2e_ha_yr: float
    total_sequestration_t_co2e_yr: float
    estimated_credit_value_eur_yr: float
    credit_price_per_ton_eur: float
    carbon_rating: str  # e.g., "A+ Excellent", "B Bon", "C Moyen"
    practices_score_pct: float
    breakdown_by_practice: dict[str, float]  # tCO2e/yr added per practice
    recommendations: list[str]
    certification_eligible: bool


# ---------------------------------------------------------------------------
# Cartes de Modulation VRA (Azote) — /agriculture/vra/prescription
# ---------------------------------------------------------------------------


class VraPrescriptionRequest(BaseModel):
    geometry: dict
    area_ha: float = Field(..., gt=0)
    crop_type: str  # e.g. "Blé tendre", "Maïs", "Colza"
    target_yield_q_ha: float = Field(default=80.0, gt=0)
    total_n_budget_kg_ha: float = Field(default=170.0, gt=0)
    strategy: Literal["ndvi_proportional", "soil_potential", "protein_optimization"] = "ndvi_proportional"
    fertilizer_unit_cost_eur_kg: float = Field(default=1.35, gt=0)  # € per kg N


class VraZonePrescription(BaseModel):
    zone_id: str
    label: str  # e.g. "Zone Haute Vigueur", "Zone Vigueur Moyenne", "Zone Stress / Faible Vigueur"
    ndvi_range: str
    area_pct: float
    area_ha: float
    prescribed_n_dose_kg_ha: float
    total_n_zone_kg: float
    color_hex: str


class VraPrescriptionResponse(BaseModel):
    crop_type: str
    area_ha: float
    strategy: str
    base_n_budget_kg_ha: float
    modulated_avg_n_dose_kg_ha: float
    n_saved_total_kg: float
    savings_eur: float
    savings_pct: float
    zones: list[VraZonePrescription]
    isobus_task_data_json: str  # ISOBUS XML / JSON format string for tractor computer
    csv_prescription: str       # CSV string for export

