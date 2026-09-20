/**
 * Gestion de la mémoire persistante et de l'historique des conversations
 * pour le Conseiller Réglementaire.
 *
 * Tout est stocké en localStorage — aucun backend nécessaire.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChatRole = "user" | "bot";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  animate?: boolean;
};

export type SavedConversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

export type Memory = {
  id: string;
  text: string;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Clés localStorage
// ---------------------------------------------------------------------------

const CONVERSATIONS_KEY = "agriguide.regulation.conversations";
const MEMORIES_KEY = "agriguide.regulation.memories";
const MAX_CONVERSATIONS = 30;

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export function loadConversations(): SavedConversation[] {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedConversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveConversations(list: SavedConversation[]): void {
  try {
    // Garde uniquement les MAX_CONVERSATIONS plus récentes
    const trimmed = list.slice(0, MAX_CONVERSATIONS);
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore (mode privé, quota...)
  }
}

/** Génère un titre court à partir du premier message utilisateur. */
export function generateTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "Nouvelle conversation";
  const text = first.text.trim();
  return text.length > 50 ? text.slice(0, 50) + "…" : text;
}

/** Sauvegarde ou met à jour une conversation. */
export function upsertConversation(conv: SavedConversation): void {
  const list = loadConversations();
  const idx = list.findIndex((c) => c.id === conv.id);
  if (idx >= 0) {
    list[idx] = conv;
  } else {
    list.unshift(conv); // plus récente en tête
  }
  saveConversations(list);
}

/** Supprime une conversation par son id. */
export function deleteConversation(id: string): void {
  const list = loadConversations().filter((c) => c.id !== id);
  saveConversations(list);
}

// ---------------------------------------------------------------------------
// Mémoires
// ---------------------------------------------------------------------------

export function loadMemories(): Memory[] {
  try {
    const raw = localStorage.getItem(MEMORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Memory[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMemoriesStore(list: Memory[]): void {
  try {
    localStorage.setItem(MEMORIES_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function addMemory(text: string): Memory {
  const memory: Memory = {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };
  const list = loadMemories();
  list.unshift(memory);
  saveMemoriesStore(list);
  return memory;
}

export function deleteMemory(id: string): void {
  const list = loadMemories().filter((m) => m.id !== id);
  saveMemoriesStore(list);
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

export function newConversationId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  if (diffH < 24) return `Il y a ${diffH} h`;
  if (diffD === 1) return "Hier";
  if (diffD < 7) return `Il y a ${diffD} jours`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
