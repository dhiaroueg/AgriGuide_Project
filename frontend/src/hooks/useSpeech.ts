import { useCallback, useEffect, useRef, useState } from "react";

import type { AppLanguage } from "@/lib/languageContext";

const SPEECH_LANG: Record<AppLanguage, string> = {
  fr: "fr-FR",
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
  it: "it-IT",
};

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Strip markdown/light formatting for TTS. */
export function plainTextForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function useSpeech(language: AppLanguage = "fr") {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeakingId(null);
    utteranceRef.current = null;
  }, []);

  const speak = useCallback(
    (messageId: string, text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;

      if (speakingId === messageId) {
        stop();
        return;
      }

      stop();
      const utterance = new SpeechSynthesisUtterance(plainTextForSpeech(text));
      utterance.lang = SPEECH_LANG[language] ?? "fr-FR";
      utterance.rate = 1;
      utterance.onend = () => setSpeakingId(null);
      utterance.onerror = () => setSpeakingId(null);
      utteranceRef.current = utterance;
      setSpeakingId(messageId);
      window.speechSynthesis.speak(utterance);
    },
    [language, speakingId, stop],
  );

  const startListening = useCallback(
    (onResult: (transcript: string) => void, onError?: (msg: string) => void) => {
      const Ctor = getSpeechRecognition();
      if (!Ctor) {
        onError?.("La reconnaissance vocale n'est pas supportée par ce navigateur.");
        return;
      }

      stop();
      const recognition = new Ctor();
      recognition.lang = SPEECH_LANG[language] ?? "fr-FR";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript?.trim();
        if (transcript) onResult(transcript);
        setListening(false);
      };
      recognition.onerror = () => {
        setListening(false);
        onError?.("Impossible d'écouter — vérifiez le micro.");
      };
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
      setListening(true);
      recognition.start();
    },
    [language, stop],
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return {
    speakingId,
    listening,
    speak,
    stop,
    startListening,
    stopListening,
    speechSupported: typeof window !== "undefined" && "speechSynthesis" in window,
    recognitionSupported: getSpeechRecognition() !== null,
  };
}
