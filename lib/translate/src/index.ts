// Общий модуль перевода Google Translate (EN<->RU).
//
// Вынесен из artifacts/api-server/src/routes/flashcards.ts, чтобы им мог
// пользоваться не только API-сервер (добавление слов «с русской стороны»),
// но и офлайн-скрипты (scripts/src/import-vocabulary.ts): импортёр словаря
// переводит и сами слова, и примеры предложений теми же правилами.
//
// Два пути:
//  1. Официальный Cloud Translation Basic API v2 — если задан
//     GOOGLE_TRANSLATE_API_KEY (стабильно, но платно/с квотами).
//  2. Нестабильный, но бесплатный резервный путь через публичный
//     translate.googleapis.com/translate_a/single — работает без ключа,
//     этого достаточно, чтобы карточки переводились «из коробки».

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

export type TranslateLang = "en" | "ru";

/** Перевод текста через Google Translate. Возвращает null при любой ошибке. */
export async function googleTranslate(
  text: string,
  source: TranslateLang,
  target: TranslateLang,
): Promise<string | null> {
  try {
    const apiKey = process.env["GOOGLE_TRANSLATE_API_KEY"]?.trim();

    if (apiKey) {
      // Официальный Cloud Translation Basic API v2.
      const url = new URL("https://translation.googleapis.com/language/translate/v2");
      url.searchParams.set("key", apiKey);
      url.searchParams.set("q", text);
      url.searchParams.set("source", source);
      url.searchParams.set("target", target);
      url.searchParams.set("format", "text");
      const response = await fetch(url, { method: "POST" });
      if (!response.ok) return null;
      const data = await response.json() as { data?: { translations?: Array<{ translatedText?: unknown }> } };
      const translated = data.data?.translations?.[0]?.translatedText;
      return typeof translated === "string" && translated.trim() ? decodeHtmlEntities(translated).trim() : null;
    }

    // Совместимый резервный путь: позволяет карточкам работать до настройки API-ключа.
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", source);
    url.searchParams.set("tl", target);
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", text);
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json() as unknown;
    const segments = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
    const translated = segments
      .map((segment) => Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : "")
      .join("")
      .trim();
    return translated ? decodeHtmlEntities(translated) : null;
  } catch {
    return null;
  }
}

/** EN -> RU. Название сохранено для совместимости с прежним кодом flashcards.ts. */
export function translateWithGoogle(english: string): Promise<string | null> {
  return googleTranslate(english, "en", "ru");
}

/** RU -> EN. Название сохранено для совместимости с прежним кодом flashcards.ts. */
export function translateRussianToEnglish(russian: string): Promise<string | null> {
  return googleTranslate(russian, "ru", "en");
}
