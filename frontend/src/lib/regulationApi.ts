/**
 * Client API pour l'agent Régulation (backend/agent_regulation).
 *
 * Les types ci-dessous reflètent volontairement, champ à champ,
 * `backend/agent_regulation/app/schemas/chat.py` pour éviter tout mapping
 * caché entre les deux couches.
 *
 * URL du service : `VITE_AGENT_REGULATION_URL` (défaut : http://localhost:8005,
 * cf. `backend/agent_regulation/README.md` — `uvicorn app.main:app --reload --port 8005`).
 * Port distinct de Auth (8001) et Business (8000) pour lancer les services en local.
 */

const REGULATION_API_BASE_URL: string =
  (import.meta.env.VITE_AGENT_REGULATION_URL as string | undefined) ?? "http://localhost:8005";

// ---------------------------------------------------------------------------
// Entrée/sortie — reflète ChatRequest / ChatResponse
// ---------------------------------------------------------------------------

export type ChatHistoryMessage = {
  role: "user" | "bot";
  text: string;
};

export type ChatRequest = {
  question: string;
  history?: ChatHistoryMessage[];
  memories?: string[];
};

export type ChatResponse = {
  answer: string;
};

// ---------------------------------------------------------------------------
// Aides financières — reflète `Subsidy` / `SubsidyListResponse`
// (backend/agent_regulation/app/schemas/subsidy.py)
// ---------------------------------------------------------------------------

export type Subsidy = {
  id: string;
  name: string;
  description: string | null;
  eligibility: string | null;
  amount: string | null;
  region: string | null;
  start_date: string | null; // ISO date (YYYY-MM-DD)
  end_date: string | null; // ISO date (YYYY-MM-DD)
  application_procedure: string | null;
  source_name: string;
  source_url: string;
  is_official: boolean;
  last_verified_at: string;
  created_at: string;
  updated_at: string;
};

export type SubsidyListResponse = {
  subsidies: Subsidy[];
};

export class RegulationApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "RegulationApiError";
  }
}

async function postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  let response: Response;
  try {
    response = await fetch(`${REGULATION_API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new RegulationApiError(
      `Impossible de joindre l'agent Régulation (${REGULATION_API_BASE_URL}). Vérifiez qu'il tourne (uvicorn app.main:app --reload --port 8005).`,
    );
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new RegulationApiError(
      (detail && typeof detail === "object" && "detail" in detail
        ? String((detail as { detail: unknown }).detail)
        : `Erreur ${response.status} de l'agent Régulation`),
      response.status,
    );
  }

  return response.json() as Promise<TResponse>;
}

/** POST /chat — pose une question de réglementation agricole à l'agent. */
export function askRegulationAgent(request: ChatRequest): Promise<ChatResponse> {
  return postJson<ChatResponse>("/chat", request);
}

async function getJson<TResponse>(path: string): Promise<TResponse> {
  let response: Response;
  try {
    response = await fetch(`${REGULATION_API_BASE_URL}${path}`);
  } catch {
    throw new RegulationApiError(
      `Impossible de joindre l'agent Régulation (${REGULATION_API_BASE_URL}). Vérifiez qu'il tourne (uvicorn app.main:app --reload --port 8005).`,
    );
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new RegulationApiError(
      (detail && typeof detail === "object" && "detail" in detail
        ? String((detail as { detail: unknown }).detail)
        : `Erreur ${response.status} de l'agent Régulation`),
      response.status,
    );
  }

  return response.json() as Promise<TResponse>;
}

/** GET /subsidies?limit=N — aides financières déjà en cache PostgreSQL,
 * triées par échéance la plus proche (aucune recherche web déclenchée). */
export function fetchSubsidies(limit = 4): Promise<SubsidyListResponse> {
  return getJson<SubsidyListResponse>(`/subsidies?limit=${limit}`);
}
