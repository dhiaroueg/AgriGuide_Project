/**
 * `backend/agent_agriculture` expose maintenant `POST /agriculture/analyze`
 * (voir `frontend/src/lib/agricultureApi.ts` et `routes/agriculture.tsx`).
 *
 * `saveRealCropRecommendations` / `loadRealCropRecommendations` mettent en
 * cache (localStorage) la dernière analyse réelle d'une parcelle, pour que
 * `business.tsx` puisse la réutiliser directement. Sans analyse réelle,
 * l'interface demande au farmer de passer d'abord par le Conseiller
 * Agriculture; aucun scénario financier n'est fabriqué.
 *
 * Stratégie de stockage :
 *  - Les analyses sont stockées par terrain_id dans un dictionnaire.
 *  - La dernière analyse est toujours accessible via `getLatestAnalyzedTerrainId()`.
 *  - Si terrain_id est null (mode SKIP_AUTH), on utilise la clé "__last__".
 *  - Le chargement fait d'abord une recherche exacte, puis tombe en fallback
 *    sur la dernière analyse disponible.
 */

import type { CropRecommendation } from "@/lib/businessApi";

/** Clé principale multi-terrain dans le localStorage */
const MULTI_KEY = "agriguide.agriculture.crop_recommendations.v2";
/** Clé legacy mono-terrain (conservée pour compatibilité de lecture) */
const LEGACY_KEY = "agriguide.agriculture.crop_recommendations";
/** Sentinel utilisée quand terrain_id est null (mode SKIP_AUTH / exploration carte) */
const FALLBACK_ID = "__last__";

type StoredEntry = {
  terrainId: string;
  recommendations: CropRecommendation[];
  savedAt: string;
};

type MultiStore = {
  /** Dernière analyse sauvegardée (terrain_id ou FALLBACK_ID) */
  latestId: string;
  /** Map terrain_id -> analyse */
  entries: Record<string, StoredEntry>;
};

function loadStore(): MultiStore {
  try {
    const raw = localStorage.getItem(MULTI_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MultiStore;
      if (parsed && parsed.entries) return parsed;
    }
  } catch {
    // ignore
  }
  return { latestId: "", entries: {} };
}

function saveStore(store: MultiStore) {
  try {
    localStorage.setItem(MULTI_KEY, JSON.stringify(store));
  } catch {
    // ignore (mode privé, quota...)
  }
}

/** Sauvegarde l'analyse pour un terrain. Si terrainId est null, utilise FALLBACK_ID. */
export function saveRealCropRecommendations(
  terrainId: string | null,
  recommendations: CropRecommendation[],
) {
  const id = terrainId ?? FALLBACK_ID;
  const store = loadStore();
  store.entries[id] = { terrainId: id, recommendations, savedAt: new Date().toISOString() };
  store.latestId = id;
  saveStore(store);

  // Maintenir aussi la clé legacy pour les anciens codes encore lus.
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ terrainId: id, recommendations, savedAt: new Date().toISOString() }));
  } catch { /* ignore */ }
}

/**
 * Charge l'analyse d'un terrain.
 * 1. Recherche exacte par terrainId.
 * 2. Fallback sur la dernière analyse disponible (toutes clés confondues).
 * Retourne null si aucune analyse n'existe.
 */
export function loadRealCropRecommendations(terrainId: string): CropRecommendation[] | null {
  const store = loadStore();

  // 1. Recherche exacte
  const exact = store.entries[terrainId];
  if (exact && Array.isArray(exact.recommendations) && exact.recommendations.length > 0) {
    return exact.recommendations;
  }

  // 2. Fallback : dernière analyse disponible (utile en mode SKIP_AUTH ou exploration carte)
  if (store.latestId && store.entries[store.latestId]) {
    const latest = store.entries[store.latestId];
    if (Array.isArray(latest.recommendations) && latest.recommendations.length > 0) {
      return latest.recommendations;
    }
  }

  // 3. Fallback legacy (clé mono-terrain ancienne version)
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { recommendations: CropRecommendation[] };
      if (Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
        return parsed.recommendations;
      }
    }
  } catch { /* ignore */ }

  return null;
}

/** Terrain analysé en dernier par le Conseiller Agriculture, ou null. */
export function getLatestAnalyzedTerrainId(): string | null {
  const store = loadStore();
  if (store.latestId && store.latestId !== FALLBACK_ID) return store.latestId;

  // Fallback legacy
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { terrainId?: string };
      return parsed.terrainId ?? null;
    }
  } catch { /* ignore */ }

  return null;
}

/**
 * Charge la toute dernière analyse disponible, sans contrainte de terrain_id.
 * Utilisé comme fallback ultime dans business.tsx quand aucun terrain sélectionné
 * ne correspond exactement à une analyse stockée.
 */
export function loadLatestCropRecommendations(): CropRecommendation[] | null {
  const store = loadStore();

  // Dernière sauvegardée
  if (store.latestId && store.entries[store.latestId]) {
    const entry = store.entries[store.latestId];
    if (Array.isArray(entry.recommendations) && entry.recommendations.length > 0) {
      return entry.recommendations;
    }
  }

  // Toute entrée disponible
  for (const entry of Object.values(store.entries)) {
    if (Array.isArray(entry.recommendations) && entry.recommendations.length > 0) {
      return entry.recommendations;
    }
  }

  // Fallback legacy
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { recommendations?: CropRecommendation[] };
      if (Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
        return parsed.recommendations;
      }
    }
  } catch { /* ignore */ }

  return null;
}

const CULTURE_LABELS: Record<string, string> = {
  tomate: "Tomate",
  pomme_de_terre: "Pomme de terre",
  ble: "Blé",
  // Les 9 cultures notées par `backend/agent_agriculture/app/services/ml_service.py`
  // (voir `_CROP_PROFILES`).
  ble_tendre: "Blé tendre",
  colza: "Colza",
  orge: "Orge",
  mais: "Maïs",
  tournesol: "Tournesol",
  betterave_sucriere: "Betterave sucrière",
  soja: "Soja",
  pois_proteagineux: "Pois protéagineux",
};

export function cultureLabel(culture: string): string {
  return CULTURE_LABELS[culture] ?? culture;
}
