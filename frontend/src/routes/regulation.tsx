import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { AlertBanner } from "@/components/AlertBanner";
import { PageHeader } from "@/components/PageHeader";
import { WaitingMascot } from "@/components/chat/WaitingMascot";
import { TypewriterMarkdown } from "@/components/chat/TypewriterMarkdown";
import { MessageActions } from "@/components/chat/MessageActions";
import { VoiceInputButton } from "@/components/chat/VoiceInputButton";
import { PageTour } from "@/components/onboarding/PageTour";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  ExternalLink,
  Send,
  ScrollText,
  Sparkles,
  ShieldCheck,
  User,
  Brain,
  Plus,
  Trash2,
  MessageSquare,
  PenLine,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  askRegulationAgent,
  fetchSubsidies,
  RegulationApiError,
  type Subsidy,
} from "@/lib/regulationApi";
import {
  loadConversations,
  loadMemories,
  upsertConversation,
  deleteConversation,
  addMemory,
  deleteMemory,
  generateTitle,
  newConversationId,
  formatRelativeDate,
  type ChatMessage,
  type SavedConversation,
  type Memory,
} from "@/lib/regulationMemory";
import { MarkdownLite } from "@/lib/markdownLite";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/regulation")({
  head: () => ({
    meta: [
      { title: "Conseiller Réglementaire - AgriMent" },
      {
        name: "description",
        content:
          "Chat, aides, PAC et certifications : toutes les règles agricoles expliquées.",
      },
      { property: "og:title", content: "Conseiller Réglementaire - AgriMent" },
      { property: "og:description", content: "Toutes les règles agricoles, expliquées." },
    ],
  }),
  component: Page,
});

const CHAT_SUGGESTIONS = [
  "Quelles aides PAC pour ma parcelle de blé ?",
  "Comment devenir agriculteur bio en 2 ans ?",
  "Puis-je installer une haie en bord de champ ?",
  "Quels documents pour vendre en circuit court ?",
];

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return null;
  return `${day}/${month}/${year}`;
}

function subsidyDateRange(s: Subsidy): string | null {
  const start = formatDate(s.start_date);
  const end = formatDate(s.end_date);
  if (start && end) return `Du ${start} au ${end}`;
  if (end) return `Jusqu'au ${end}`;
  if (start) return `À partir du ${start}`;
  return null;
}

function subsidyMeta(s: Subsidy): string {
  return [s.source_name, s.region, subsidyDateRange(s)].filter(Boolean).join(" · ");
}

function buildWelcomeMessage(firstName: string): ChatMessage {
  return {
    id: "welcome",
    role: "bot",
    text: `Bonjour ${firstName}, je suis un agent IA, votre conseiller réglementaire, et je vous réponds automatiquement. Posez-moi une question sur la PAC, les aides ou les normes, ou choisissez une suggestion.`,
    animate: false,
  };
}

function Page() {
  const { user } = useAuth();
  const firstName = user?.nom?.split(" ")[0] ?? "agriculteur";

  // ── Panneaux latéraux (collapsible) ──────────────────────────────────────
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightTab, setRightTab] = useState<"memory" | "subsidies">("memory");

  // ── Conversations ─────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<SavedConversation[]>(() =>
    loadConversations(),
  );
  const [activeConvId, setActiveConvId] = useState<string>(() => newConversationId());

  // ── Messages du chat courant ──────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    buildWelcomeMessage(firstName),
  ]);

  // ── Mémoires ──────────────────────────────────────────────────────────────
  const [memories, setMemories] = useState<Memory[]>(() => loadMemories());
  const [newMemoryText, setNewMemoryText] = useState("");
  const [showMemoryInput, setShowMemoryInput] = useState(false);

  const [input, setInput] = useState("");
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Auto-save conversation quand les messages changent ────────────────────
  const saveCurrentConv = useCallback(
    (msgs: ChatMessage[]) => {
      const userMsgs = msgs.filter((m) => m.role === "user");
      if (userMsgs.length === 0) return; // ne pas sauvegarder les convs vides
      const conv: SavedConversation = {
        id: activeConvId,
        title: generateTitle(msgs),
        messages: msgs.map((m) => ({ ...m, animate: false })),
        createdAt:
          conversations.find((c) => c.id === activeConvId)?.createdAt ??
          new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      upsertConversation(conv);
      setConversations(loadConversations());
    },
    [activeConvId, conversations],
  );

  // ── Mutation API ──────────────────────────────────────────────────────────
  const chatMutation = useMutation({
    mutationFn: (question: string) => {
      const history = messages
        .filter((m) => m.role === "user" || m.role === "bot")
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role as "user" | "bot", text: m.text }));

      return askRegulationAgent({
        question,
        history,
        memories: memories.map((m) => m.text),
      });
    },
    onSuccess: (data, question) => {
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: "bot",
        text: data.answer,
        animate: true,
      };
      setMessages((prev) => {
        const next = [...prev, botMsg];
        saveCurrentConv(next);
        return next;
      });
    },
  });

  const subsidiesQuery = useQuery({
    queryKey: ["subsidies", 4],
    queryFn: () => fetchSubsidies(4),
  });
  const subsidies = subsidiesQuery.data?.subsidies ?? [];

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, chatMutation.isPending]);

  const send = (t: string) => {
    if (!t.trim() || chatMutation.isPending) return;
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: t.trim(),
    };
    setMessages((prev) => {
      const next = [...prev, userMsg];
      return next;
    });
    setInput("");
    chatMutation.mutate(t.trim());
  };

  // ── Nouvelle conversation ─────────────────────────────────────────────────
  function startNewConversation() {
    setActiveConvId(newConversationId());
    setMessages([buildWelcomeMessage(firstName)]);
    setInput("");
    chatMutation.reset();
    inputRef.current?.focus();
  }

  // ── Charger une conversation existante ───────────────────────────────────
  function loadConversation(conv: SavedConversation) {
    setActiveConvId(conv.id);
    setMessages(conv.messages.map((m) => ({ ...m, animate: false })));
    setInput("");
    chatMutation.reset();
  }

  // ── Supprimer une conversation ────────────────────────────────────────────
  function removeConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    deleteConversation(id);
    setConversations(loadConversations());
    if (id === activeConvId) startNewConversation();
  }

  // ── Mémoires ──────────────────────────────────────────────────────────────
  function handleAddMemory() {
    if (!newMemoryText.trim()) return;
    addMemory(newMemoryText.trim());
    setMemories(loadMemories());
    setNewMemoryText("");
    setShowMemoryInput(false);
  }

  function handleDeleteMemory(id: string) {
    deleteMemory(id);
    setMemories(loadMemories());
  }

  const errorMessage =
    chatMutation.error instanceof RegulationApiError
      ? chatMutation.error.message
      : chatMutation.isError
        ? "Une erreur inattendue est survenue en contactant l'agent réglementaire."
        : null;

  const showSuggestions = !messages.some((m) => m.role === "user");

  return (
    <AppShell>
      <PageHeader
        icon={ScrollText}
        tone="sky"
        title="Conseiller Réglementaire"
        subtitle="Questions en langage naturel, réponses sourcées sur le corpus réglementaire."
        className="mb-2"
      />

      <div
        className={cn(
          "grid gap-3 transition-all duration-300",
          leftOpen
            ? "lg:grid-cols-[240px_minmax(0,1fr)_280px]"
            : "lg:grid-cols-[0px_minmax(0,1fr)_280px]",
        )}
      >
        {/* ═══ PANNEAU GAUCHE — Historique des chats ══════════════════════════ */}
        <div
          className={cn(
            "relative transition-all duration-300 overflow-hidden",
            leftOpen ? "opacity-100" : "opacity-0 pointer-events-none w-0",
          )}
        >
          <aside className="flex h-[calc(100dvh-9.5rem)] min-h-[28rem] max-h-[920px] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm md:h-[calc(100dvh-8.25rem)]">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Chats</span>
                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {conversations.length} sauveg.
                </span>
              </div>
            </div>

            {/* New chat button */}
            <div className="p-2">
              <Button
                size="sm"
                variant="outline"
                className="w-full rounded-xl gap-1.5 h-9 border-dashed"
                onClick={startNewConversation}
              >
                <Plus className="h-3.5 w-3.5" />
                New chat
              </Button>
            </div>

            {/* Conversations list */}
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
              {conversations.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-6 px-2">
                  No saved chats yet.
                </p>
              )}
              {conversations.map((conv) => {
                const isActive = conv.id === activeConvId;
                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => loadConversation(conv)}
                    className={cn(
                      "w-full text-left group rounded-xl px-3 py-2.5 text-sm transition-colors",
                      isActive
                        ? "bg-primary/10 text-foreground ring-1 ring-primary/20"
                        : "hover:bg-secondary/80 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="block truncate font-medium leading-snug">
                        {conv.title}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => removeConversation(conv.id, e)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive mt-0.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {formatRelativeDate(conv.updatedAt)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        · {conv.messages.filter((m) => m.role === "user").length} msg
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>

        {/* ═══ PANNEAU CENTRAL — Chat ══════════════════════════════════════════ */}
        <div className="relative">
          {/* Toggle left panel */}
          <button
            type="button"
            onClick={() => setLeftOpen((v) => !v)}
            className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 hidden lg:flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground transition-colors"
            aria-label={leftOpen ? "Masquer l'historique" : "Afficher l'historique"}
          >
            {leftOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>

          <section className="flex h-[calc(100dvh-9.5rem)] min-h-[28rem] max-h-[920px] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_16px_48px_-28px_rgba(28,43,28,0.45)] ring-1 ring-black/[0.02] md:h-[calc(100dvh-8.25rem)]">
            {/* Chat header */}
            <header className="flex items-center justify-between gap-3 border-b border-border/70 bg-gradient-to-r from-sky/25 via-card to-card px-4 py-3 md:px-5">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-sky/40 text-sky-foreground ring-1 ring-sky/30">
                  <img src="/logo_mistral_O.jpg" alt="Agent" className="h-full w-full object-cover" />
                </span>
                <div className="min-w-0">
                  <div className="font-display text-base font-semibold tracking-tight">
                    Assistant réglementaire
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        chatMutation.isPending ? "bg-waste animate-pulse" : "bg-harvest",
                      )}
                    />
                    {chatMutation.isPending ? "En train de répondre…" : "En ligne"}
                    {memories.length > 0 && (
                      <span className="ml-1 flex items-center gap-0.5 text-primary/70">
                        <Brain className="h-3 w-3" />
                        {memories.length} mémoire{memories.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  Réponses sourcées
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-xl h-8 gap-1.5 text-xs text-muted-foreground"
                  onClick={startNewConversation}
                >
                  <PenLine className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Nouveau</span>
                </Button>
              </div>
            </header>

            {/* Messages */}
            <div className="flex-1 space-y-4 overflow-y-auto bg-[radial-gradient(ellipse_at_top,oklch(0.97_0.02_145)_0%,transparent_55%)] px-3 py-4 sm:px-5">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "page-enter flex gap-2.5",
                    m.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  {m.role === "bot" && (
                    <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-primary ring-1 ring-border/70">
                      <img src="/logo_mistral_O.jpg" alt="Agent" className="h-full w-full object-cover" />
                    </span>
                  )}
                  <div
                    className={cn(
                      "max-w-[min(100%,42rem)] rounded-2xl px-3.5 py-2.5 shadow-sm",
                      m.role === "user"
                        ? "rounded-tr-md bg-primary text-primary-foreground"
                        : "rounded-tl-md border border-border/60 bg-background/90 text-foreground backdrop-blur-sm",
                    )}
                  >
                    {m.role === "bot" ? (
                      m.animate ? (
                        <TypewriterMarkdown
                          key={`type-${m.id}`}
                          text={m.text}
                          wordsPerTick={3}
                          tickMs={18}
                          onProgress={() =>
                            scrollAnchorRef.current?.scrollIntoView({
                              behavior: "auto",
                              block: "end",
                            })
                          }
                          onDone={() =>
                            setMessages((prev) =>
                              prev.map((msg) =>
                                msg.id === m.id ? { ...msg, animate: false } : msg,
                              ),
                            )
                          }
                        />
                      ) : (
                        <div className="text-sm leading-relaxed">
                          <MarkdownLite text={m.text} />
                        </div>
                      )
                    ) : (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
                    )}
                    {m.role === "bot" && (
                      <MessageActions
                        messageId={m.id}
                        text={m.text}
                        agent="regulation"
                        disabled={Boolean(m.animate)}
                      />
                    )}
                  </div>
                  {m.role === "user" && (
                    <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/20">
                      <User className="h-4 w-4" />
                    </span>
                  )}
                </div>
              ))}

              {chatMutation.isPending && (
                <div className="page-enter flex gap-2.5">
                  <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-primary ring-1 ring-border/70">
                    <img src="/logo_mistral_O.jpg" alt="Agent" className="h-full w-full object-cover" />
                  </span>
                  <WaitingMascot label="Analyse de votre question…" />
                </div>
              )}

              {errorMessage && (
                <AlertBanner tone="danger" title="Agent réglementaire indisponible">
                  {errorMessage}
                </AlertBanner>
              )}
              <div ref={scrollAnchorRef} />
            </div>

            {/* Footer */}
            <footer className="border-t border-border/70 bg-card/95 p-3 sm:p-4 backdrop-blur-sm" data-tour="reg-chat-input">
              {showSuggestions && (
                <div className="mb-3 flex flex-wrap gap-2" data-tour="reg-suggestions">
                  {CHAT_SUGGESTIONS.map((s, i) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      disabled={chatMutation.isPending}
                      style={{ animationDelay: `${0.08 + i * 0.06}s` }}
                      className="page-enter press inline-flex items-center gap-1 rounded-full border border-border/80 bg-background px-3 py-1.5 text-xs text-muted-foreground transition-all duration-300 hover:border-primary/40 hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                    >
                      <Sparkles className="h-3 w-3 text-primary" />
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <VoiceInputButton
                  disabled={chatMutation.isPending}
                  onTranscript={(text) => setInput(text)}
                />
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Écrivez votre question réglementaire…"
                  className="h-12 flex-1 rounded-xl border-border/80 bg-background text-base shadow-none focus-visible:shadow-[0_0_0_3px_var(--color-secondary)]"
                  disabled={chatMutation.isPending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                />
                <Button
                  size="lg"
                  className="press h-12 shrink-0 rounded-xl px-4 transition-transform hover:-translate-y-0.5"
                  onClick={() => send(input)}
                  disabled={chatMutation.isPending || !input.trim()}
                  aria-label="Envoyer"
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Vérifiez toujours auprès de votre chambre d&apos;agriculture avant une
                démarche officielle.
              </p>
            </footer>
          </section>
        </div>

        {/* ═══ PANNEAU DROIT — Mémoire + Aides ════════════════════════════════ */}
        <aside className="flex h-[calc(100dvh-9.5rem)] min-h-[28rem] max-h-[920px] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm md:h-[calc(100dvh-8.25rem)]" data-tour="reg-sidebar">
          {/* Tabs */}
          <div className="flex border-b border-border/70">
            <button
              type="button"
              onClick={() => setRightTab("memory")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors",
                rightTab === "memory"
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Brain className="h-4 w-4" />
              Memory
            </button>
            <button
              type="button"
              onClick={() => setRightTab("subsidies")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 px-3 py-3 text-sm font-semibold transition-colors",
                rightTab === "subsidies"
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <FileText className="h-4 w-4" />
              Aides PAC
            </button>
          </div>

          {/* ── Memory tab ── */}
          {rightTab === "memory" && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-border/40">
                <p className="text-xs text-muted-foreground leading-snug">
                  These are memories Farmer AI has about your operation that are used in every chat.
                </p>
              </div>

              {/* Add memory */}
              <div className="px-3 py-2">
                {showMemoryInput ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                    <Input
                      autoFocus
                      value={newMemoryText}
                      onChange={(e) => setNewMemoryText(e.target.value)}
                      placeholder="Ex : J'ai 25 ha de céréales en Bretagne"
                      className="h-9 rounded-lg text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddMemory();
                        if (e.key === "Escape") {
                          setShowMemoryInput(false);
                          setNewMemoryText("");
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="rounded-lg h-8 flex-1" onClick={handleAddMemory}>
                        Ajouter
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-lg h-8"
                        onClick={() => { setShowMemoryInput(false); setNewMemoryText(""); }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full rounded-xl gap-1.5 h-9"
                    onClick={() => setShowMemoryInput(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add a memory
                  </Button>
                )}
              </div>

              {/* Memory list */}
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                {memories.length === 0 && !showMemoryInput && (
                  <p className="text-center text-xs text-muted-foreground py-8">
                    No memories yet.
                  </p>
                )}
                {memories.map((mem) => (
                  <div
                    key={mem.id}
                    className="group flex items-start gap-2 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2.5 text-sm"
                  >
                    <Brain className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary/60" />
                    <span className="flex-1 leading-snug text-xs">{mem.text}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteMemory(mem.id)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Subsidies tab ── */}
          {rightTab === "subsidies" && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-border/40">
                <p className="text-xs text-muted-foreground">
                  Échéances proches — sources officielles
                </p>
              </div>
              <div className="flex-1 space-y-1 overflow-y-auto p-2.5 sm:p-3">
                {subsidiesQuery.isPending && (
                  <div className="space-y-3 p-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="flex items-start gap-3 p-3">
                        <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {subsidiesQuery.isError && (
                  <div className="p-1">
                    <AlertBanner tone="danger" title="Aides financières indisponibles">
                      {subsidiesQuery.error instanceof RegulationApiError
                        ? subsidiesQuery.error.message
                        : "Une erreur inattendue est survenue."}
                    </AlertBanner>
                  </div>
                )}
                {!subsidiesQuery.isPending && !subsidiesQuery.isError && subsidies.length === 0 && (
                  <div className="flex items-start gap-3 rounded-xl p-3 text-sm text-muted-foreground">
                    <FileText className="h-5 w-5 shrink-0 mt-0.5" />
                    <span>Aucune aide financière disponible pour le moment.</span>
                  </div>
                )}
                {!subsidiesQuery.isPending &&
                  !subsidiesQuery.isError &&
                  subsidies.map((s, i) => (
                    <a
                      key={s.id}
                      href={s.source_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ animationDelay: `${0.1 + i * 0.07}s` }}
                      className="page-enter group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-secondary/80"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky/20 text-sky-foreground transition-transform duration-400 group-hover:scale-105 group-hover:rotate-2">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-snug">{s.name}</div>
                        {s.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {s.description}
                          </p>
                        )}
                        <div className="mt-1.5 text-[11px] font-semibold text-primary/80">
                          {subsidyMeta(s)}
                        </div>
                      </div>
                      <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                    </a>
                  ))}
              </div>
            </div>
          )}
        </aside>
      </div>
      <PageTour tourId="regulation" />
    </AppShell>
  );
}
