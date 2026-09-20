const WEATHER_API_BASE_URL: string =
  (import.meta.env.VITE_AGENT_WEATHER_URL as string | undefined) ?? "http://localhost:8006";

const DEV_BYPASS_TOKEN = "00000000-0000-0000-0000-000000000000";
const USE_DEV_BYPASS =
  (import.meta.env.VITE_SKIP_AUTH as string | undefined)?.toString() === "true";

export type Coordinate = { lat: number; lon: number };

export type WeatherRequest = {
  point: Coordinate;
  location_label?: string | null;
  forecast_days?: number;
  past_days?: number;
  history_days?: number;
  models?: string;
  wind_speed_unit?: "kmh" | "ms" | "mph" | "kn";
  temperature_unit?: "celsius" | "fahrenheit";
};

export type CurrentWeather = {
  time?: string | null;
  temperature_2m?: number | null;
  apparent_temperature?: number | null;
  relative_humidity_2m?: number | null;
  dew_point_2m?: number | null;
  precipitation?: number | null;
  precipitation_probability?: number | null;
  weather_code?: number | null;
  weather_label?: string | null;
  wind_speed_10m?: number | null;
  wind_direction_10m?: number | null;
  wind_gusts_10m?: number | null;
  wind_compass?: string | null;
  surface_pressure?: number | null;
  uv_index?: number | null;
  uv_label?: string | null;
  cloud_cover?: number | null;
  visibility?: number | null;
  soil_temperature_0cm?: number | null;
  soil_moisture_0cm?: number | null;
};

export type AtmosphereMetrics = {
  dew_point_c?: number | null;
  dew_point_f?: number | null;
  pressure_hpa?: number | null;
  pressure_inhg?: number | null;
  visibility_km?: number | null;
  visibility_mi?: number | null;
  cloud_cover_pct?: number | null;
  ceiling_m?: number | null;
};

export type SoilMetrics = {
  depth_0_1cm_temp_c?: number | null;
  depth_0_1cm_temp_f?: number | null;
  depth_0_1cm_moisture_m3m3?: number | null;
  depth_1_3cm_temp_c?: number | null;
  depth_1_3cm_temp_f?: number | null;
  depth_1_3cm_moisture_m3m3?: number | null;
  depth_3_9cm_temp_c?: number | null;
  depth_3_9cm_temp_f?: number | null;
  depth_3_9cm_moisture_m3m3?: number | null;
  depth_9_27cm_temp_c?: number | null;
  depth_9_27cm_temp_f?: number | null;
  depth_9_27cm_moisture_m3m3?: number | null;
  soil_texture_note?: string | null;
};

export type SolarMetrics = {
  uv_index?: number | null;
  uv_clear_sky?: number | null;
  shortwave_radiation_wm2?: number | null;
  direct_radiation_wm2?: number | null;
  diffuse_radiation_wm2?: number | null;
  global_tilted_irradiance_wm2?: number | null;
  sunrise_local?: string | null;
  sunset_local?: string | null;
  sunshine_duration_h?: number | null;
  day_length_h?: number | null;
};

export type HourlyForecastPoint = {
  time: string;
  temp_c?: number | null;
  temp_f?: number | null;
  feels_like_c?: number | null;
  feels_like_f?: number | null;
  humidity_pct?: number | null;
  precip_mm?: number | null;
  precip_in?: number | null;
  precip_prob_pct?: number | null;
  weather_code?: number | null;
  weather_label?: string | null;
  wind_speed_kmh?: number | null;
  wind_gusts_kmh?: number | null;
  wind_dir_deg?: number | null;
  wind_compass?: string | null;
  uv_index?: number | null;
  cloud_cover_pct?: number | null;
  solar_radiation_wm2?: number | null;
  soil_temp_f?: number | null;
};

export type DailyForecastPoint = {
  date: string;
  weekday_label?: string | null;
  day_month_label?: string | null;
  temp_max_c?: number | null;
  temp_max_f?: number | null;
  temp_min_c?: number | null;
  temp_min_f?: number | null;
  precip_sum_mm?: number | null;
  precip_sum_in?: number | null;
  precip_prob_max_pct?: number | null;
  wind_speed_max_kmh?: number | null;
  wind_gusts_max_kmh?: number | null;
  dominant_wind_dir_deg?: number | null;
  dominant_wind_compass?: string | null;
  sunrise_local?: string | null;
  sunset_local?: string | null;
  weather_code?: number | null;
  weather_label?: string | null;
  uv_index_max?: number | null;
  et0_mm?: number | null;
};

export type TrendSeries = {
  variable: string;
  points: Array<Record<string, unknown>>;
  source: "forecast" | "forecast+archive" | "fallback" | "unavailable";
};

export type CalendarDayShape = {
  date: string;
  dow: number;
  week_of_year?: number | null;
  variable: string;
  primary_value?: number | null;
  secondary_value?: number | null;
  min_value?: number | null;
  max_value?: number | null;
  weather_code?: number | null;
  weather_label?: string | null;
  anomaly_pct?: number | null;
};

export type WeatherDecisionSignal = {
  id: string;
  title: string;
  value: string;
  detail: string;
  tone: "neutral" | "good" | "warning" | "critical";
};

export type WeatherDashboardResponse = {
  location_label?: string | null;
  latitude: number;
  longitude: number;
  elevation_m?: number | null;
  timezone: string;
  units: Record<string, string>;
  source: "open-meteo" | "fallback" | "unavailable";
  warning?: string | null;
  current: CurrentWeather;
  atmosphere: AtmosphereMetrics;
  soil: SoilMetrics;
  solar: SolarMetrics;
  hourly: HourlyForecastPoint[];
  daily: DailyForecastPoint[];
  trends: Record<string, TrendSeries>;
  calendar_month: {
    variable: string;
    year: number;
    month: number;
    days: CalendarDayShape[];
  };
  decision_signals: WeatherDecisionSignal[];
};

export class WeatherApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "WeatherApiError";
  }
}

async function postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  let response: Response;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (USE_DEV_BYPASS) headers.Authorization = `Bearer ${DEV_BYPASS_TOKEN}`;
    response = await fetch(`${WEATHER_API_BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new WeatherApiError(
      `Impossible de joindre l'agent Weather (${WEATHER_API_BASE_URL}). Démarrez-le : uvicorn app.main:app --reload --port 8006`,
    );
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new WeatherApiError(
      detail && typeof detail === "object" && "detail" in detail
        ? String((detail as { detail: unknown }).detail)
        : `Erreur ${response.status} de l'agent Weather`,
      response.status,
    );
  }
  return (await response.json()) as Promise<TResponse>;
}

export function getWeatherDashboard(req: WeatherRequest): Promise<WeatherDashboardResponse> {
  return postJson<WeatherDashboardResponse>("/api/v1/weather/dashboard", req);
}

/** Default demo coordinates — Chartres, Eure-et-Loir (France). */
export const WEATHER_DEFAULT_LATLON = { lat: 48.44, lon: 1.49 };

/** @deprecated Use WEATHER_DEFAULT_LATLON */
export const WEATHER_MOCK_LATLON = WEATHER_DEFAULT_LATLON;
