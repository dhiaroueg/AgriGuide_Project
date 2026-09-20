const BASE_URL = (import.meta.env.VITE_MARKETPLACE_API_URL as string | undefined) ?? "http://localhost:8007";

export class MarketplaceApiError extends Error {}

async function request<T>(path: string, options: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}/marketplace${path}`, {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }).catch(() => { throw new MarketplaceApiError("Marketplace indisponible. Réessayez dans quelques instants."); });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new MarketplaceApiError(data?.detail ?? `Erreur Marketplace (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export type ListingPayload = {
  type_annonce: "recolte" | "dechet"; titre: string; description: string; quantite: number; unite: string;
  prix?: number | null; culture_source?: string; terrain_id?: string; region?: string;
  latitude?: number; longitude?: number; modes_livraison: string[]; rayon_livraison_km: number; certifications: string[];
};
export const createListing = (payload: ListingPayload, token: string) => request("/listings", { method: "POST", body: payload, token });
export const createReservation = (listingId: string, body: { quantity: number; pickup_mode: string; note?: string }, token: string) => request(`/listings/${listingId}/reservations`, { method: "POST", body, token });
export const startConversation = (listingId: string, token: string) => request<{ id: string }>(`/listings/${listingId}/conversations`, { method: "POST", token });
export const getMessages = (conversationId: string, token: string) => request<Array<{ id: string; sender_id: string; body: string; created_at: string }>>(`/conversations/${conversationId}/messages`, { token });
export const sendMessage = (conversationId: string, body: string, token: string) => request(`/conversations/${conversationId}/messages`, { method: "POST", body: { body }, token });
