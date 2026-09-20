import type { TerrainOut } from "@/lib/authApi";
import { getLatestAnalyzedTerrainId } from "@/lib/cropRecommendations";
import { centroid } from "@/lib/terrain";

const WEATHER_TERRAIN_KEY = "agriguide.weather.selectedTerrainId";

export type WeatherLocation = {
  lat: number;
  lon: number;
  label: string;
  terrainId?: string | null;
};

export function terrainToWeatherLocation(terrain: TerrainOut): WeatherLocation | null {
  const c = centroid(terrain.points);
  if (!c) return null;
  const label =
    [terrain.nom, terrain.region].filter(Boolean).join(" · ") ||
    `Parcelle (${c[0].toFixed(2)}°, ${c[1].toFixed(2)}°)`;
  return { lat: c[0], lon: c[1], label, terrainId: terrain.id };
}

export function readSavedWeatherTerrainId(): string | null {
  try {
    return localStorage.getItem(WEATHER_TERRAIN_KEY);
  } catch {
    return null;
  }
}

export function saveWeatherTerrainId(id: string | null) {
  try {
    if (id) localStorage.setItem(WEATHER_TERRAIN_KEY, id);
    else localStorage.removeItem(WEATHER_TERRAIN_KEY);
  } catch {
    /* ignore */
  }
}

/** Default: last weather pick → last Agriculture analysis → first saved terrain → Chartres demo. */
export function pickDefaultWeatherLocation(terrains: TerrainOut[]): WeatherLocation {
  const candidates = [
    readSavedWeatherTerrainId(),
    getLatestAnalyzedTerrainId(),
    terrains[0]?.id ?? null,
  ];
  for (const id of candidates) {
    if (!id) continue;
    const terrain = terrains.find((t) => t.id === id);
    if (terrain) {
      const loc = terrainToWeatherLocation(terrain);
      if (loc) return loc;
    }
  }
  if (terrains[0]) {
    const loc = terrainToWeatherLocation(terrains[0]);
    if (loc) return loc;
  }
  return {
    lat: 48.44,
    lon: 1.49,
    label: "Chartres · Eure-et-Loir (démo)",
    terrainId: null,
  };
}

/** Open-Meteo Geocoding — free, no API key (for city / place search only). */
export async function geocodePlaceName(name: string): Promise<WeatherLocation | null> {
  const q = name.trim();
  if (q.length < 2) return null;

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", q);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "fr");
  url.searchParams.set("format", "json");

  const response = await fetch(url.toString());
  if (!response.ok) return null;

  const data = (await response.json()) as {
    results?: Array<{
      name: string;
      latitude: number;
      longitude: number;
      admin1?: string;
      country?: string;
    }>;
  };

  const hit = data.results?.[0];
  if (!hit) return null;

  const label = [hit.name, hit.admin1, hit.country].filter(Boolean).join(" · ");
  return {
    lat: hit.latitude,
    lon: hit.longitude,
    label,
    terrainId: null,
  };
}
