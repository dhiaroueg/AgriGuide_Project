import type { AppLanguage } from "@/lib/languageContext";

/** Detect likely source language (simple heuristic for FR vs EN). */
function guessSourceLang(text: string): AppLanguage {
  const lower = text.toLowerCase();
  const frHints = /\b(le|la|les|un|une|des|pour|avec|dans|sur|parcelle|culture|aide|pac|blé|maïs)\b/;
  const enHints = /\b(the|and|for|with|crop|field|farm|subsidy|wheat|corn)\b/;
  if (frHints.test(lower) && !enHints.test(lower)) return "fr";
  if (enHints.test(lower) && !frHints.test(lower)) return "en";
  return "fr";
}

export async function translateChatText(
  text: string,
  targetLang: AppLanguage,
): Promise<string> {
  const sourceLang = guessSourceLang(text);
  if (sourceLang === targetLang) return text;

  const langpair = `${sourceLang}|${targetLang}`;
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text.slice(0, 450));
  url.searchParams.set("langpair", langpair);

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error("Traduction indisponible");

  const data = (await response.json()) as {
    responseStatus?: number;
    responseData?: { translatedText?: string };
  };

  const translated = data.responseData?.translatedText?.trim();
  if (!translated || data.responseStatus === 429) {
    throw new Error("Traduction temporairement indisponible");
  }
  return translated;
}
