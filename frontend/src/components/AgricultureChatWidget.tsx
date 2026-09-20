import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "@tanstack/react-query";
import { Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WaitingMascot } from "@/components/chat/WaitingMascot";
import { TypewriterMarkdown } from "@/components/chat/TypewriterMarkdown";
import { MessageActions } from "@/components/chat/MessageActions";
import { VoiceInputButton } from "@/components/chat/VoiceInputButton";
import { MarkdownLite } from "@/lib/markdownLite";
import { cn } from "@/lib/utils";
import {
  sendChatMessage,
  AgricultureApiError,
  type ChatMessage as ApiChatMessage,
  type ChatParcelContext,
  type ChatSource,
} from "@/lib/agricultureApi";
import { useAuth } from "@/lib/auth-context";

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: ChatSource[];
  /** Réponse assistant encore en train d'être tapée mot à mot */
  animate?: boolean;
};

const WELCOME =
  "Bonjour ! Je suis un agent IA qui vous répond automatiquement. Posez-moi une question sur l'agriculture en général, ou sur la parcelle actuellement sélectionnée si vous en avez analysé une.";

const GENERAL_SUGGESTIONS = [
  "Quelles cultures pour un sol calcaire ?",
  "Comment optimiser l'apport d'azote au blé ?",
  "Quels sont les avantages des couverts végétaux ?",
  "Comment interpréter l'indice NDVI ?",
];

const PARCEL_SUGGESTIONS = [
  "Quelles sont les cultures idéales sur ce terrain ?",
  "Comment est la fertilité et le sol de ma parcelle ?",
  "Quel est le bilan hydrique et météo récent ?",
  "Quelle dose d'azote recommandes-tu ici ?",
];

const MISTRAL_AVATAR = "/logo_mistral_O.jpg";
const FARMER_USER_AVATAR = "/img/farmer-user.avif";

/**
 * questions générales (RAG), à la parcelle sélectionnée (`parcelContext`),
 * et au profil connecté (terrains / matériel lus en base via le JWT).
 */
export function AgricultureChatWidget({
  parcelContext = null,
}: {
  parcelContext?: ChatParcelContext | null;
}) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([
    { id: "welcome", role: "assistant", text: WELCOME, animate: false },
  ]);
  const [input, setInput] = useState("");
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  // Portail sur document.body : `<main class="page-enter">` (AppShell)
  // porte une animation `transform`, ce qui en fait le containing block de
  // tout `position: fixed` descendant — le widget resterait alors ancré à
  // la page (et disparaîtrait au scroll) plutôt qu'à l'écran. Même fix que
  // components/motion/ScrollMoreHint.tsx pour la même raison.
  useEffect(() => {
    setMounted(true);
  }, []);

  const chatMutation = useMutation({
    mutationFn: (question: string) => {
      const history: ApiChatMessage[] = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.text }));
      return sendChatMessage(
        { question, history, parcel_context: parcelContext },
        token,
      );
    },
    onSuccess: (data) => {
      setMessages((m) => [
        ...m,
        { id: `assistant-${Date.now()}`, role: "assistant", text: data.answer, sources: data.sources, animate: true },
      ]);
    },
  });

  useEffect(() => {
    if (open) scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, chatMutation.isPending, open]);

  const send = (text: string) => {
    if (!text.trim() || chatMutation.isPending) return;
    setMessages((m) => [...m, { id: `user-${Date.now()}`, role: "user", text: text.trim() }]);
    setInput("");
    chatMutation.mutate(text.trim());
  };

  const errorMessage =
    chatMutation.error instanceof AgricultureApiError
      ? chatMutation.error.message
      : chatMutation.isError
        ? "Une erreur inattendue est survenue en contactant l'assistant."
        : null;

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Icône flottante */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fermer l'assistant" : "Ouvrir l'assistant agricole"}
        data-tour="agri-chat-fab"
        className={cn(
          "fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full shadow-[0_12px_32px_-12px_rgba(28,43,28,0.55)] transition-transform duration-200 hover:scale-105",
          "bg-primary text-primary-foreground ring-1 ring-primary/30",
        )}
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <img src={MISTRAL_AVATAR} alt="Ouvrir l'assistant agricole" className="h-full w-full object-cover" />
        )}
      </button>

      {/* Panneau de chat */}
      {open && (
        <div
          className="fixed bottom-24 right-5 z-50 flex h-[min(32rem,calc(100dvh-8rem))] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_24px_64px_-24px_rgba(28,43,28,0.55)] ring-1 ring-black/[0.02]"
          role="dialog"
          aria-label="Assistant agricole"
        >
          <header className="flex items-center gap-3 border-b border-border/70 bg-gradient-to-r from-primary/10 via-card to-card px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
              <img src={MISTRAL_AVATAR} alt="Assistant Mistral" className="h-full w-full object-cover" />
            </span>
            <div className="min-w-0">
              <div className="font-display text-sm font-semibold tracking-tight">Assistant agricole</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    chatMutation.isPending ? "bg-waste animate-pulse" : "bg-harvest",
                  )}
                />
                {chatMutation.isPending
                  ? "En train de répondre…"
                  : parcelContext
                    ? "Parcelle sélectionnée en contexte"
                    : "En ligne"}
              </div>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "assistant" && (
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-primary ring-1 ring-border/70">
                    <img src={MISTRAL_AVATAR} alt="" className="h-full w-full object-cover" />
                  </span>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 shadow-sm",
                    m.role === "user"
                      ? "rounded-tr-md bg-primary text-primary-foreground"
                      : "rounded-tl-md border border-border/60 bg-background/90 text-foreground",
                  )}
                >
                  {m.role === "assistant" ? (
                    m.animate ? (
                      <TypewriterMarkdown
                        key={`type-${m.id}`}
                        text={m.text}
                        wordsPerTick={3}
                        tickMs={18}
                        onProgress={() => scrollAnchorRef.current?.scrollIntoView({ behavior: "auto", block: "end" })}
                        onDone={() =>
                          setMessages((prev) => prev.map((msg) => (msg.id === m.id ? { ...msg, animate: false } : msg)))
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
                  {m.role === "assistant" && (
                    <MessageActions
                      messageId={m.id}
                      text={m.text}
                      agent="agriculture"
                      disabled={Boolean(m.animate)}
                    />
                  )}
                  {m.role === "assistant" && !m.animate && m.sources && m.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/50 pt-2">
                      {m.sources.map((s) => (
                        <a
                          key={s.url}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-primary"
                        >
                          {s.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                {m.role === "user" && (
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 ring-1 ring-primary/20">
                    <img src={FARMER_USER_AVATAR} alt="Vous" className="h-full w-full object-contain p-0.5" />
                  </span>
                )}
              </div>
            ))}

            {chatMutation.isPending && (
              <div className="flex gap-2">
                <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-primary ring-1 ring-border/70">
                  <img src={MISTRAL_AVATAR} alt="" className="h-full w-full object-cover" />
                </span>
                <WaitingMascot label="Réflexion en cours…" />
              </div>
            )}

            {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
            <div ref={scrollAnchorRef} />
          </div>

          <footer className="border-t border-border/70 bg-card/95 p-2.5">
            {!messages.some((m) => m.role === "user") && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {(parcelContext ? PARCEL_SUGGESTIONS : GENERAL_SUGGESTIONS).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    disabled={chatMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground transition-all duration-200 hover:border-primary/40 hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-50 text-left cursor-pointer"
                  >
                    <Sparkles className="h-2.5 w-2.5 text-primary shrink-0" />
                    <span>{s}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <VoiceInputButton
                disabled={chatMutation.isPending}
                onTranscript={(text) => setInput(text)}
                size="sm"
              />
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder="Posez votre question…"
                disabled={chatMutation.isPending}
                className="text-sm"
              />
              <Button
                type="button"
                size="icon"
                onClick={() => send(input)}
                disabled={chatMutation.isPending || !input.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </footer>
        </div>
      )}
    </>,
    document.body,
  );
}
