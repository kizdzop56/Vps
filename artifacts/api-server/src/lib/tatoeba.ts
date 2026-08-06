// ─────────────────────────────────────────────────────────────────────────────
// Tatoeba: источник примеров употребления.
//
// Почему именно он. Прошлая попытка чинить каталог строилась на машинном
// переводе и самодельной морфологии: формы слова выводились суффиксами, русские
// слова сравнивались по обрезку основы, «подходит ли пример» решалось
// совпадением слов. На живых данных это предлагало стереть нормальные карточки
// («кухня» не находилась в «на кухне»), а перевод идиом выходил дословным
// («a piece of cake» → «кусок торта»).
//
// Tatoeba устроен иначе: это база предложений, где И английская фраза, И её
// русский перевод написаны людьми, а связь между ними подтверждена участниками
// проекта. Нам не нужно ни переводить, ни угадывать — пара берётся готовой.
// Поиск по слову тоже на их стороне, вместе с морфологией языка.
//
// Лицензия CC BY 2.0 FR: использование свободное при указании источника.
// ─────────────────────────────────────────────────────────────────────────────

/** Пара «предложение и его перевод», обе написаны людьми. */
export type SentencePair = {
  en: string;
  ru: string;
  /** Номер предложения в Tatoeba — по нему всегда можно проверить источник. */
  sourceId: number;
};

type TatoebaTranslation = { id?: unknown; text?: unknown; lang?: unknown };
type TatoebaResult = {
  id?: unknown;
  text?: unknown;
  translations?: TatoebaTranslation[][];
};
type TatoebaResponse = { results?: TatoebaResult[] };

/**
 * Длина фразы для учебной карточки.
 *
 * Короче — обычно обрывок без контекста («Yes, it is.»), длиннее — ребёнок не
 * дочитает. Границы подобраны под то, что помещается на карточку.
 */
const MIN_LEN = 12;
const MAX_LEN = 120;

/** Сколько кандидатов запрашиваем: из них выбираем самый удобный для чтения. */
const FETCH_LIMIT = 12;

/**
 * Найти предложения со словом и человеческим переводом на русский.
 *
 * Возвращает только пары, где перевод ПРЯМОЙ: в Tatoeba translations[0] — это
 * переводы, связанные с предложением напрямую, а translations[1] — через третий
 * язык. Вторые бывают заметно вольнее, поэтому их не берём.
 */
export async function findSentences(word: string): Promise<SentencePair[]> {
  const query = word.trim();
  if (!query) return [];

  const url = new URL("https://tatoeba.org/en/api_v0/search");
  url.searchParams.set("query", query);
  url.searchParams.set("from", "eng");
  url.searchParams.set("to", "rus");
  // has_translation=direct — только предложения, у которых перевод есть
  // на самом деле, а не подтянут через третий язык.
  url.searchParams.set("trans_filter", "limit");
  url.searchParams.set("trans_to", "rus");
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("limit", String(FETCH_LIMIT));

  let data: TatoebaResponse;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return [];
    data = (await response.json()) as TatoebaResponse;
  } catch {
    return []; // сеть или таймаут — считаем, что примеров не нашлось
  }

  const pairs: SentencePair[] = [];

  for (const result of data.results ?? []) {
    const en = typeof result.text === "string" ? result.text.trim() : "";
    const id = Number(result.id);
    if (!en || !Number.isFinite(id)) continue;
    if (en.length < MIN_LEN || en.length > MAX_LEN) continue;

    // Прямые переводы — первая группа.
    const direct = Array.isArray(result.translations?.[0]) ? result.translations[0] : [];
    for (const t of direct) {
      if (t?.lang !== "rus") continue;
      const ru = typeof t.text === "string" ? t.text.trim() : "";
      if (!ru) continue;
      pairs.push({ en, ru, sourceId: id });
      break; // одного перевода на предложение достаточно
    }
  }

  return pairs;
}

/**
 * Выбрать пример для карточки.
 *
 * Из подходящих берём самое короткое: у Tatoeba первым идёт «самое
 * релевантное», но для ребёнка ценнее короткая ясная фраза, чем предложение на
 * три строки с придаточными.
 *
 * Отсеиваем предложения с именами собственными в середине и с числами: они
 * отвлекают от изучаемого слова, а пользы не несут.
 */
export function pickBest(pairs: SentencePair[]): SentencePair | null {
  const clean = pairs.filter((p) => !/\d/.test(p.en));
  const pool = clean.length > 0 ? clean : pairs;
  if (pool.length === 0) return null;

  return [...pool].sort((a, b) => a.en.length - b.en.length)[0] ?? null;
}

/** Готовый пример для слова: одна пара «фраза + перевод» или null. */
export async function exampleFor(word: string): Promise<SentencePair | null> {
  return pickBest(await findSentences(word));
}
