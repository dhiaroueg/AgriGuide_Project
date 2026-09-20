import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const APP_LANGUAGES = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number]["code"];

const STORAGE_KEY = "agriguide.lang";

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (code: AppLanguage) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLanguage(): AppLanguage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && APP_LANGUAGES.some((l) => l.code === raw)) return raw as AppLanguage;
  } catch {
    /* ignore */
  }
  return "fr";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("fr");

  useEffect(() => {
    setLanguageState(readStoredLanguage());
  }, []);

  const setLanguage = useCallback((code: AppLanguage) => {
    setLanguageState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useAppLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      language: "fr" as AppLanguage,
      setLanguage: (_code: AppLanguage) => {},
    };
  }
  return ctx;
}
