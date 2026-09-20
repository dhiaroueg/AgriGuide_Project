import { useState } from "react";
import {
  Languages,
  Loader2,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";

import { useMessageFeedback, type MessageFeedback } from "@/hooks/useMessageFeedback";
import { useSpeech } from "@/hooks/useSpeech";
import { translateChatText } from "@/lib/chatTranslate";
import { useAppLanguage } from "@/lib/languageContext";
import { cn } from "@/lib/utils";

type MessageActionsProps = {
  messageId: string;
  text: string;
  agent: "agriculture" | "regulation";
  /** Hide until typewriter animation finishes */
  disabled?: boolean;
  className?: string;
};

export function MessageActions({
  messageId,
  text,
  agent,
  disabled = false,
  className,
}: MessageActionsProps) {
  const { language } = useAppLanguage();
  const { speakingId, speak, stop, speechSupported } = useSpeech(language);
  const { getFeedback, setMessageFeedback } = useMessageFeedback(agent);
  const [translated, setTranslated] = useState<string | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translating, setTranslating] = useState(false);

  const feedback = getFeedback(messageId);
  const isSpeaking = speakingId === messageId;

  if (disabled) return null;

  async function onTranslate() {
    if (showTranslation && translated) {
      setShowTranslation(false);
      return;
    }
    if (translated) {
      setShowTranslation(true);
      return;
    }
    setTranslating(true);
    try {
      const result = await translateChatText(text, language);
      setTranslated(result);
      setShowTranslation(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Traduction impossible");
    } finally {
      setTranslating(false);
    }
  }

  function onSpeak() {
    if (!speechSupported) {
      toast.error("La synthèse vocale n'est pas disponible dans ce navigateur.");
      return;
    }
    if (isSpeaking) {
      stop();
    } else {
      speak(messageId, text);
    }
  }

  function onFeedback(value: MessageFeedback) {
    setMessageFeedback(messageId, value);
    toast.success(value === "up" ? "Merci pour votre retour !" : "Retour enregistré.");
  }

  return (
    <div className={cn("mt-2", className)}>
      <div
        className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5"
        role="toolbar"
        aria-label="Actions sur le message"
      >
        <ActionButton
          title={isSpeaking ? "Arrêter la lecture" : "Lire à voix haute"}
          onClick={onSpeak}
          active={isSpeaking}
        >
          {isSpeaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </ActionButton>

        <ActionButton
          title={showTranslation ? "Masquer la traduction" : "Traduire"}
          onClick={() => void onTranslate()}
          active={showTranslation}
          disabled={translating}
        >
          {translating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Languages className="h-3.5 w-3.5" />
          )}
        </ActionButton>

        <ActionButton
          title="Utile"
          onClick={() => onFeedback("up")}
          active={feedback === "up"}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </ActionButton>

        <ActionButton
          title="Pas utile"
          onClick={() => onFeedback("down")}
          active={feedback === "down"}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </ActionButton>
      </div>

      {showTranslation && translated ? (
        <p className="mt-2 rounded-lg border border-border/50 bg-muted/30 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground/80">Traduction · </span>
          {translated}
        </p>
      ) : null}
    </div>
  );
}

function ActionButton({
  children,
  title,
  onClick,
  active = false,
  disabled = false,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition",
        "hover:bg-background hover:text-foreground",
        active && "bg-background text-primary shadow-sm",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {children}
    </button>
  );
}
