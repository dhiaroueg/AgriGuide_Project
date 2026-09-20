/**
 * Client API pour l'agent Agriculture (backend/agent_agriculture).
 *
 * Les types ci-dessous reflètent volontairement, champ à champ,
 * `backend/agent_agriculture/app/models/schemas.py` pour éviter tout mapping
 * caché entre les deux couches (même convention que `businessApi.ts`).
 *
 * URL du service : `VITE_AGENT_AGRICULTURE_URL` (défaut :
 * http://localhost:8002, cf. `backend/agent_agriculture/README.md` —
 * `uvicorn app.main:app --reload --port 8002`).
 */

const AGRICULTURE_API_BASE_URL: string =
  (import.meta.env.VITE_AGENT_AGRICULTURE_URL as string | undefined) ?? "http://localhost:8002";

// ---------------------------------------------------------------------------
// Types communs
// ---------------------------------------------------------------------------

export type Coordinate = { lat: number; lon: number };

export type ParcelResolution = {
  resolved: boolean;
  source: "cadastre" | "rpg" | "manual" | "unresolved";
  geometry: Record<string, unknown> | null;
  centroid: Coordinate | null;
  parcel_id: string | null;
  rpg_id_parcel: string | null;
  area_ha: number | null;
  area_m2: number | null;
  crop_declared: string | null;
  is_agricultural: boolean | null;
  agricultural_note: string | null;
  warning: string | null;
};

export type NeighborParcel = { geometry: Record<string, unknown>; crop_code: string | null };

export type NeighborCropContext = {
  neighbor_count: number;
  crop_distribution_pct: Record<string, number>;
  neighbors: NeighborParcel[];
  note: string;
};

export type SoilData = {
  source: "soilgrids" | "inrae" | "unavailable";
  ph: number | null;
  nitrogen_g_kg: number | null;
  organic_carbon_g_kg: number | null;
  sand_pct: number | null;
  clay_pct: number | null;
  silt_pct: number | null;
  cec_cmolkg: number | null;
  bulk_density_kg_dm3: number | null;
  coarse_fragments_pct: number | null;
  depth_cm: string | null;
  warning: string | null;
};

export type WeatherData = {
  source: "open-meteo" | "unavailable";
  daily_temp_mean_c: (number | null)[] | null;
  daily_precip_mm: (number | null)[] | null;
  daily_et0_mm: (number | null)[] | null;
  daily_dates: string[] | null;
  current_temp_c?: number | null;
  current_humidity_pct?: number | null;
  current_wind_kmh?: number | null;
  current_precip_mm?: number | null;
  weather_code?: number | null;
  sunrise?: string | null;
  sunset?: string | null;
  today_temp_min_c?: number | null;
  today_temp_max_c?: number | null;
  observed_at?: string | null;
  warning: string | null;
};

export type WeatherStats = {
  mean_temp_c?: number;
  min_temp_c?: number;
  max_temp_c?: number;
  total_precip_mm?: number;
  rainy_days_count?: number;
};

export type VegetationData = {
  source: "sentinel-2" | "unavailable";
  mean_ndvi: number | null;
  observation_window_days: number | null;
  valid_pixel_count: number | null;
  warning: string | null;
};

export type DLCropObservation = {
  source: "dl-tempcnn-breizhcrops" | "unavailable";
  predicted_class_fr: string | null;
  predicted_class_en: string | null;
  confidence: number | null;
  observation_timesteps: number | null;
  warning: string | null;
};

export type AgroCalcEstimate = {
  crop: string;
  n_dose_kg_ha: number | null;
  n_besoins_kg_ha: number | null;
  n_fournitures_kg_ha: number | null;
  yield_objective_q_ha: number | null;
  n_method_note: string | null;
  irrigation_need_mm: number | null;
  irrigation_window_days: number | null;
  total_et0_mm: number | null;
  total_effective_precip_mm: number | null;
  irrigation_method_note: string | null;
  warning: string | null;
};

export type YieldEstimate = {
  crop: string;
  yield_estimate_q_ha: number | null;
  yield_range_low_q_ha: number | null;
  yield_range_high_q_ha: number | null;
  base_yield_q_ha: number | null;
  suitability_score: number | null;
  adjustment_factor: number | null;
  method_note: string | null;
  warning: string | null;
};

export type AdvisorReport = {
  parcel_id: string | null;
  report_markdown: string;
  warnings: string[];
  unverified_figures: string[];
};

/** Même shape que `CropRecommendation` dans `businessApi.ts` — voir schema.sql `crop_recommendations`. */
export type CropRecommendationOut = {
  rang: number;
  culture: string;
  score_compatibilite: number;
  cycle_jours: number;
  besoins_irrigation: Record<string, unknown>;
  besoins_engrais: Record<string, unknown>;
  besoins_pesticides: Record<string, unknown>;
  feature_importance: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// /agriculture/analyze
// ---------------------------------------------------------------------------

export type AnalyzeRequest = {
  point: Coordinate;
  manual_geojson?: Record<string, unknown> | null;
  terrain_id?: string | null;
  yield_objective_q_ha?: number | null;
};

export type AnalyzeResponse = {
  terrain_id: string | null;
  land_profile_id: string | null;
  persisted: boolean;
  parcel: ParcelResolution;
  soil: SoilData;
  weather: WeatherData;
  weather_stats: WeatherStats;
  vegetation: VegetationData;
  dl_observation: DLCropObservation;
  neighbors: NeighborCropContext | null;
  crop_recommendations: CropRecommendationOut[];
  agro_calc_top_crop: AgroCalcEstimate;
  yield_estimate: YieldEstimate | null;
  report: AdvisorReport | null;
  warnings: string[];
};

export type NdviHeatmapResponse = {
  image_base64: string | null;
  bounds: { south: number; west: number; north: number; east: number } | null;
  warning: string | null;
};

export type ParcelRequest = { point: Coordinate; manual_geojson?: Record<string, unknown> | null };

export type ReliefGrid = {
  grille_ndvi: number[][];
  grille_ndwi: number[][];
  grille_ndmi: number[][];
  grille_elevation: number[][];
  grille_pente_pct: number[][];
  grille_validite: boolean[][];
  grille_validite_satellite: boolean[][];
  hauteur: number;
  largeur: number;
  largeur_m: number;
  hauteur_m: number;
  resolution_relief_m: number;
  resolution_satellite_m: number;
  resolution_ndmi_m: number;
  source_relief: string;
  date_relief: string | null;
  stats_ndvi: {
    moyen: number | null;
    min: number | null;
    max: number | null;
      ndwi_moyen: number | null;
      ndwi_min: number | null;
      ndwi_max: number | null;
      signal_eau_libre_pct: number | null;
      ndmi_moyen: number | null;
      ndmi_min: number | null;
      ndmi_max: number | null;
      vegetation_faible_pct: number | null;
      humidite_vegetation_faible_pct: number | null;
    couverture_pct: number;
  };
  stats_pente: { moyenne_pct: number; p95_pct: number; max_pct: number };
  periode_recherche: string;
  source_satellite: string;
  satellite_available: boolean;
  index_definitions: { ndvi: string; ndwi: string; ndmi: string };
  warnings: string[];
};

export class AgricultureApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AgricultureApiError";
  }
}

async function postJson<TResponse>(
  path: string,
  body: unknown,
  token?: string | null,
): Promise<TResponse> {
  let response: Response;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    response = await fetch(`${AGRICULTURE_API_BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new AgricultureApiError(
      `Impossible de joindre l'agent Agriculture (${AGRICULTURE_API_BASE_URL}). Vérifiez qu'il tourne (uvicorn app.main:app --reload --port 8002).`,
    );
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new AgricultureApiError(
      detail && typeof detail === "object" && "detail" in detail
        ? String((detail as { detail: unknown }).detail)
        : `Erreur ${response.status} de l'agent Agriculture`,
      response.status,
    );
  }

  return response.json() as Promise<TResponse>;
}

/** POST /agriculture/parcel/resolve — aperçu de la parcelle cadastrale/RPG à un point donné, sans persistance. */
export function resolveParcel(request: ParcelRequest): Promise<ParcelResolution> {
  return postJson<ParcelResolution>("/agriculture/parcel/resolve", request);
}

/** POST /agriculture/parcel/neighbors — répartition des cultures déclarées dans un rayon donné, sans persistance. */
export function getNeighbors(request: ParcelRequest, radiusM = 800): Promise<NeighborCropContext> {
  return postJson<NeighborCropContext>(`/agriculture/parcel/neighbors?radius_m=${radiusM}`, request);
}

/** POST /agriculture/parcel/ndvi_heatmap — PNG NDVI coloré pour la bascule "Afficher la carte NDVI" du frontend. */
export function getNdviHeatmap(request: ParcelRequest): Promise<NdviHeatmapResponse> {
  return postJson<NdviHeatmapResponse>("/agriculture/parcel/ndvi_heatmap", request);
}

/** POST /agriculture/analyze — pipeline complet (sol/météo/satellite/scoring/rapport), persisté si `terrain_id` est fourni. */
export function analyzeParcel(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  return postJson<AnalyzeResponse>("/agriculture/analyze", request);
}

/** Mesh LiDAR/IGN et indices Sentinel utilisés par la vue 3D de la parcelle. */
export function getReliefGrid(geometry: Record<string, unknown>): Promise<ReliefGrid> {
  return postJson<ReliefGrid>("/agriculture/relief/grid", geometry);
}

/** Orthophoto IGN optionnelle, chargée seulement si l'utilisateur la sélectionne. */
export function getReliefOrthophoto(geometry: Record<string, unknown>): Promise<{ image_base64: string }> {
  return postJson<{ image_base64: string }>("/agriculture/relief/orthophoto", geometry);
}

// ---------------------------------------------------------------------------
// Assistant conversationnel (widget flottant) — reflète ChatRequest/ChatResponse
// ---------------------------------------------------------------------------

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatSource = {
  title: string;
  url: string;
};

/** Reflète `ChatParcelContext` — schemas.py. Sous-ensemble d'un AnalyzeResponse déjà en mémoire côté client. */
export type ChatParcelContext = {
  parcel?: ParcelResolution;
  soil?: SoilData;
  weather_stats?: WeatherStats;
  vegetation?: VegetationData;
  crop_recommendations?: CropRecommendationOut[];
  yield_estimate?: YieldEstimate | null;
  agro_calc_top_crop?: AgroCalcEstimate;
};

export type ChatRequest = {
  question: string;
  history: ChatMessage[];
  parcel_context: ChatParcelContext | null;
};

export type ChatResponse = {
  answer: string;
  sources: ChatSource[];
};

/** Construit le contexte de parcelle envoyé au chatbot à partir d'un AnalyzeResponse déjà chargé. Retourne null si aucune parcelle n'a encore été analysée. */
export function buildChatContext(analysis: AnalyzeResponse | null): ChatParcelContext | null {
  if (!analysis) return null;
  return {
    parcel: analysis.parcel,
    soil: analysis.soil,
    weather_stats: analysis.weather_stats,
    vegetation: analysis.vegetation,
    crop_recommendations: analysis.crop_recommendations,
    yield_estimate: analysis.yield_estimate,
    agro_calc_top_crop: analysis.agro_calc_top_crop,
  };
}

/** POST /agriculture/chat — question libre au widget flottant, avec historique, parcelle optionnelle, et JWT pour charger le profil en base. */
export function sendChatMessage(
  request: ChatRequest,
  token?: string | null,
): Promise<ChatResponse> {
  return postJson<ChatResponse>("/agriculture/chat", request, token);
}

// ---------------------------------------------------------------------------
// Multi-temporal Satellite Timeline (NDVI, NDWI, RGB & N vs N-1)
// ---------------------------------------------------------------------------

export type SatelliteIndexType = "ndvi" | "ndwi" | "rgb";

export type SatelliteIndexStats = {
  mean: number;
  min: number;
  max: number;
  std: number;
  vigor_class: string;
  water_stress_class?: string | null;
  cloud_cover_pct: number;
  distribution_pct: {
    optimal: number;
    moderate: number;
    stressed: number;
  };
};

export type SatelliteTimelinePoint = {
  date: string;
  label: string;
  ndvi: number;
  ndwi: number;
  prior_year_ndvi?: number | null;
  prior_year_ndwi?: number | null;
  cloud_cover_pct: number;
};

export type SatelliteTimelineResponse = {
  index_type: SatelliteIndexType;
  target_date: string;
  image_base64: string | null;
  bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  } | null;
  stats: SatelliteIndexStats;
  timeline: SatelliteTimelinePoint[];
  prior_year_image_base64?: string | null;
  delta_pct?: number | null;
  warning?: string | null;
};

export type SatelliteTimelineRequest = {
  geometry: Record<string, unknown>;
  index_type?: SatelliteIndexType;
  target_date?: string | null;
  compare_year_prior?: boolean;
};

/** POST /agriculture/parcel/satellite_timeline — analyse multi-temporelle Sentinel-2 */
export function fetchSatelliteTimeline(
  request: SatelliteTimelineRequest,
  token?: string | null,
): Promise<SatelliteTimelineResponse> {
  return postJson<SatelliteTimelineResponse>("/agriculture/parcel/satellite_timeline", request, token);
}

// ---------------------------------------------------------------------------
// Bilan Carbone & Crédits Carbone Agricoles
// ---------------------------------------------------------------------------

export type CarbonCalculationRequest = {
  area_ha: number;
  tillage_practice?: "semis_direct" | "travail_reduit" | "labour_conventionnel";
  cover_crop?: "couvert_permanent" | "couvert_intermediaire" | "aucun";
  organic_amendments?: "compost" | "fumier" | "aucun";
  residue_management?: "restitution_sol" | "exportation_paille";
  soil_carbon_g_kg?: number | null;
  clay_pct?: number | null;
};

export type CarbonCalculationResponse = {
  area_ha: number;
  sequestration_rate_t_co2e_ha_yr: number;
  total_sequestration_t_co2e_yr: number;
  estimated_credit_value_eur_yr: number;
  credit_price_per_ton_eur: number;
  carbon_rating: string;
  practices_score_pct: number;
  breakdown_by_practice: Record<string, number>;
  recommendations: string[];
  certification_eligible: boolean;
};

export function estimateCarbonCredits(
  request: CarbonCalculationRequest,
  token?: string | null,
): Promise<CarbonCalculationResponse> {
  return postJson<CarbonCalculationResponse>("/agriculture/carbon/estimate", request, token);
}

// ---------------------------------------------------------------------------
// Cartes de Modulation VRA (Azote / Engrais)
// ---------------------------------------------------------------------------

export type VraPrescriptionRequest = {
  geometry: Record<string, unknown>;
  area_ha: number;
  crop_type: string;
  target_yield_q_ha?: number;
  total_n_budget_kg_ha?: number;
  strategy?: "ndvi_proportional" | "soil_potential" | "protein_optimization";
  fertilizer_unit_cost_eur_kg?: number;
};

export type VraZonePrescription = {
  zone_id: string;
  label: string;
  ndvi_range: string;
  area_pct: number;
  area_ha: number;
  prescribed_n_dose_kg_ha: number;
  total_n_zone_kg: number;
  color_hex: string;
};

export type VraPrescriptionResponse = {
  crop_type: string;
  area_ha: number;
  strategy: string;
  base_n_budget_kg_ha: number;
  modulated_avg_n_dose_kg_ha: number;
  n_saved_total_kg: number;
  savings_eur: number;
  savings_pct: number;
  zones: VraZonePrescription[];
  isobus_task_data_json: string;
  csv_prescription: string;
};

export function generateVraPrescription(
  request: VraPrescriptionRequest,
  token?: string | null,
): Promise<VraPrescriptionResponse> {
  return postJson<VraPrescriptionResponse>("/agriculture/vra/prescription", request, token);
}

