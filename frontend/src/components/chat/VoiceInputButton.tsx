import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";

import { useSpeech } from "@/hooks/useSpeech";
import { useAppLanguage } from "@/lib/languageContext";
import { cn } from "@/lib/utils";

type VoiceInputButtonProps = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
};

export function VoiceInputButton({
  onTranscript,
  disabled = false,
  className,
  size = "md",
}: VoiceInputButtonProps) {
  const { language } = useAppLanguage();
  const { listening, startListening, stopListening, recognitionSupported } = useSpeech(language);

  function toggle() {
    if (disabled) return;
    if (listening) {
      stopListening();
      return;
    }
    if (!recognitionSupported) {
      toast.error("La reconnaissance vocale n'est pas disponible dans ce navigateur.");
      return;
    }
    startListening(
      (transcript) => onTranscript(transcript),
      (msg) => toast.error(msg),
    );
  }

  const dim = size === "sm" ? "h-9 w-9" : "h-10 w-10";
  const icon = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <button
      type="button"
      title={listening ? "Arrêter l'écoute" : "Dicter votre question"}
      aria-label={listening ? "Arrêter l'écoute" : "Dicter votre question"}
      disabled={disabled}
      onClick={toggle}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl border border-border/80 bg-background text-muted-foreground transition",
        "hover:bg-secondary hover:text-foreground",
        listening && "border-primary/50 bg-primary/10 text-primary animate-pulse",
        disabled && "pointer-events-none opacity-50",
        dim,
        className,
      )}
    >
      {listening ? <MicOff className={icon} /> : <Mic className={icon} />}
    </button>
  );
}
