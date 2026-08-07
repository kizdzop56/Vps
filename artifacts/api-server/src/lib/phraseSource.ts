// ─────────────────────────────────────────────────────────────────────────────
// Источник учебных карточек: фразы, слова и фразеологизмы.
//
// ── Правило, из которого всё вытекает ───────────────────────────────────────
// Перевод и пример обязаны приходить ИЗ ОДНОГО МЕСТА. Все поломки в этом
// разделе случались потому, что перевод брали из одного значения слова, а
// пример из другого: карточка «cooker = плита» получала пример про slow cooker,
// «tie = галстук» — фразу про ничью в игре.
//
// Проверить такую склейку постфактум нельзя (пробовал: самодельная морфология
// резала нормальные карточки, машинный перевод врал на идиомах). Зато можно
// собирать карточку так, чтобы она была верна ПО ПОСТРОЕНИЮ.
//
// Отсюда три способа, и в каждом источник один и тот же для всех полей:
//
//   ФРАЗА    — Tatoeba: английское предложение и русский перевод написаны
//              людьми и связаны вручную. У целой фразы значение одно, поэтому
//              многозначности здесь не существует как проблемы.
//   СЛОВО    — одно значение Викисловаря: перевод и примеры лежат внутри него.
//   ИДИОМА   — значение с пометкой idiomatic: толкование смысла, не дословный
//              перевод.
//
// ── Почему фраза важнее слова ───────────────────────────────────────────────
// Фразами человек говорит. Заучив «Они умеют петь», ученик может это сказать;
// заучив «cooker — плита», не может ничего.
//
// Лицензии: Tatoeba CC BY 2.0 FR, Викисловарь CC BY-SA 4.0.
// ─────────────────────────────────────────────────────────────────────────────
import { googleTranslate } from "@workspace/translate";
import { fetchSenses, type WordSense } from "./wiktionary";

/** Карточка-фраза: оба текста написаны людьми. */
export type PhraseCard = {
  en: string;
  ru: string;
  /** Номер предложения в Tatoeba — по нему всегда можно проверить источник. */
  sourceId: number;
  /** Есть ли запись носителя (в Tatoeba такие предложения ещё и вычитаны). */
  hasAudio: boolean;
};

type TatoebaTranslation = {
  text?: unknown;
  lang?: unknown;
  isDirect?: unknown;
};
type TatoebaResult = {
  id?: unknown;
  text?: unknown;
  translations?: TatoebaTranslation[][];
  audios?: unknown[];
};
type TatoebaResponse = { results?: TatoebaResult[] };

/**
 * Границы длины фразы для карточки.
 *
 * Короче — обрывок без смысла («Yes, it is.»), длиннее — ребёнок не удержит
 * фразу в голове и не сможет её произнести целиком.
 */
const MIN_LEN = 10;
const MAX_LEN = 70;

/** Имена, которыми в Tatoeba заполнена половина базы. */
const FILLER_NAMES = /\b(Tom|Mary|Bob|Ken|Jim|Nancy|Yumi|Taro|Hanako)\b/;

/**
 * Пригодна ли пара для карточки.
 *
 * Отсеиваем: служебные пометки вроде «Он_а» (в Tatoeba так пишут
 * гендерно-нейтральные варианты), цифры (отвлекают от языка) и предложения из
 * нескольких фраз — их не проговорить одним движением.
 */
function usable(en: string, ru: string): boolean {
  if (en.length < MIN_LEN || en.length > MAX_LEN) return false;
  if (ru.includes("_")) return false;
  if (/\d/.test(en) || /\d/.test(ru)) return false;
  // Точка внутри строки = два предложения; последняя не считается.
  if (/[.!?]\s+\S/.test(en)) return false;
  return true;
}

/**
 * Насколько фраза хороша для заучивания. Больше — лучше.
 *
 * Запись носителя — главный признак: в Tatoeba озвучивают вычитанные
 * предложения. Дальше — отсутствие лишних имён (учебная фраза должна быть о
 * ком угодно) и короткая длина.
 */
function score(card: PhraseCard): number {
  let value = 100 - card.en.length;
  if (card.hasAudio) value += 40;
  if (!FILLER_NAMES.test(card.en)) value += 25;
  return value;
}

/**
 * Найти фразы, содержащие слово или конструкцию.
 *
 * `query` — то, вокруг чего строится карточка: слово («sing»), конструкция
 * («can sing») или идиома («piece of cake»). Поиск и морфологию берёт на себя
 * Tatoeba.
 */
export async function fetchPhrases(query: string, limit = 8): Promise<PhraseCard[]> {
  const q = query.trim();
  if (!q) return [];

  const url = new URL("https://tatoeba.org/en/api_v0/search");
  url.searchParams.set("query", q);
  url.searchParams.set("from", "eng");
  url.searchParams.set("to", "rus");
  url.searchParams.set("trans_filter", "limit");
  url.searchParams.set("trans_to", "rus");
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("limit", "30");

  let data: TatoebaResponse;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return [];
    data = (await response.json()) as TatoebaResponse;
  } catch {
    return [];
  }

  const cards: PhraseCard[] = [];
  const seen = new Set<string>();

  for (const result of data.results ?? []) {
    const en = typeof result.text === "string" ? result.text.trim() : "";
    const id = Number(result.id);
    if (!en || !Number.isFinite(id)) continue;

    const hasAudio = Array.isArray(result.audios) && result.audios.length > 0;

    // translations[0] — прямые связи, translations[1] — через третий язык.
    const direct = Array.isArray(result.translations?.[0]) ? result.translations[0] : [];
    for (const t of direct) {
      if (t?.lang !== "rus" || t?.isDirect !== true) continue;
      const ru = typeof t.text === "string" ? t.text.trim() : "";
      if (!ru || !usable(en, ru)) continue;

      const key = en.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      cards.push({ en, ru, sourceId: id, hasAudio });
      break; // одного перевода на предложение достаточно
    }
  }

  return cards.sort((a, b) => score(b) - score(a)).slice(0, limit);
}

// ── Карточка слова ──────────────────────────────────────────────────────────

/** Слово в одном конкретном значении: перевод и пример из одной записи. */
export type WordCard = {
  /** Как показать на карточке: у глаголов с частицей to. */
  display: string;
  /** Русские переводы ИМЕННО этого значения, первым — основной. */
  ru: string[];
  /** Толкование по-английски: помогает выбрать нужное значение. */
  definition: string;
  partOfSpeech: string;
  /** Пример из этого же значения и его перевод. */
  exampleEn: string | null;
  exampleRu: string | null;
};

/**
 * Убрать пометки из начала толкования: «(transitive, ergative) To make…».
 *
 * Они полезны лингвисту, но на карточке только мешают: ученику всё равно,
 * переходный глагол или нет.
 */
function cleanDefinition(text: string): string {
  return text.replace(/^\([^)]*\)\s*/, "").trim();
}

/** Как слово выглядит на карточке. */
function displayForm(word: string, partOfSpeech: string): string {
  const clean = word.trim().toLowerCase().replace(/^to\s+/, "");
  // Без «to» глагол читается как существительное: «change» — это и «изменить»,
  // и «изменение». Частица снимает двусмысленность одним символом.
  return partOfSpeech === "verb" ? `to ${clean}` : clean;
}

/** Пример из значения: короткий и цельный. */
function pickExample(sense: WordSense): string | null {
  const usable = sense.examples
    .map((e) => e.trim())
    .filter((e) => e.length >= 10 && e.length <= 120)
    // «Oxford ties; Derby ties» — перечисление, а не предложение.
    .filter((e) => !e.includes(";"));
  if (usable.length === 0) return null;
  return [...usable].sort((a, b) => a.length - b.length)[0] ?? null;
}

/**
 * Собрать карточки слова — по одной на каждое значение с русским переводом.
 *
 * Порядок значений в Викисловаре примерно соответствует частоте употребления,
 * поэтому первое подходит на роль «чаще всего встречающегося». Но выбор всё
 * равно за человеком: отдаём все варианты с толкованием, он берёт нужный.
 *
 * Переводится только ПРИМЕР, то есть целое предложение, где контекст сам
 * снимает многозначность. Сам перевод слова машиной не трогаем никогда — он
 * взят из Викисловаря, где его написал человек.
 */
export async function fetchWordCards(word: string, limit = 4): Promise<WordCard[]> {
  const senses = await fetchSenses(word);

  // Только значения с русским переводом: без него карточку не собрать.
  // Идиомы отсекаем — для них отдельный путь (fetchIdiom).
  const usableSenses = senses
    .filter((s) => s.translationsRu.length > 0)
    .filter((s) => !s.tags.includes("idiomatic"))
    .slice(0, limit);

  const cards: WordCard[] = [];

  for (const sense of usableSenses) {
    const exampleEn = pickExample(sense);
    const exampleRu = exampleEn ? await googleTranslate(exampleEn, "en", "ru") : null;

    cards.push({
      display: displayForm(word, sense.partOfSpeech),
      ru: sense.translationsRu,
      definition: cleanDefinition(sense.definition),
      partOfSpeech: sense.partOfSpeech,
      exampleEn,
      exampleRu,
    });
  }

  return cards;
}

// ── Фразеологизмы ───────────────────────────────────────────────────────────

/** Идиома со ЗНАЧЕНИЕМ, а не дословным переводом. */
export type IdiomCard = {
  /** Сама идиома в словарной форме. */
  phrase: string;
  /** Толкование по-английски — то, что Викисловарь пометил как idiomatic. */
  meaning: string;
  /** Толкование по-русски: переведено ТОЛКОВАНИЕ, а не идиома. */
  meaningRu: string;
  /** Пример употребления и его перевод. */
  exampleEn: string | null;
  exampleRu: string | null;
  /** Английские синонимы: помогают понять смысл быстрее толкования. */
  synonyms: string[];
};

/**
 * Форма для поиска в Викисловаре.
 *
 * Статьи там лежат без артикля: «a piece of cake» не находится, «piece of cake»
 * находится. То же с инфинитивом — «to pull someone's leg» живёт как
 * «pull someone's leg».
 */
function dictionaryForm(phrase: string): string {
  return phrase
    .trim()
    .toLowerCase()
    .replace(/^(a|an|the)\s+/, "")
    .replace(/^to\s+/, "");
}

/**
 * Собрать карточку фразеологизма.
 *
 * Значение берём из Викисловаря, где смысл идиомы записан человеком, и только
 * из значения с пометкой idiomatic: у «piece of cake» вторая статья — про
 * настоящий кусок торта, и она нам не нужна.
 *
 * Переводим толкование и пример, то есть ЦЕЛЫЕ ПРЕДЛОЖЕНИЯ. Это единственный
 * безопасный способ применить машинный перевод: контекст сам снимает
 * многозначность. Саму идиому не переводим никогда.
 */
export async function fetchIdiom(phrase: string): Promise<IdiomCard | null> {
  const senses = await fetchSenses(dictionaryForm(phrase));

  const idiomatic = senses.find(
    (s) => s.tags.includes("idiomatic") || /^\(idiomatic\)/i.test(s.definition),
  );
  if (!idiomatic) return null;

  const meaning = cleanDefinition(idiomatic.definition);
  if (!meaning) return null;

  const meaningRu = await googleTranslate(meaning, "en", "ru");
  if (!meaningRu) return null;

  const exampleEn = pickExample(idiomatic);
  const exampleRu = exampleEn ? await googleTranslate(exampleEn, "en", "ru") : null;

  return {
    phrase: phrase.trim(),
    meaning,
    meaningRu,
    exampleEn,
    exampleRu,
    // Дубликаты в синонимах Викисловаря — обычное дело, и сама идиома тоже
    // попадает в свой список.
    synonyms: [...new Set(idiomatic.synonyms)]
      .filter((s) => s.toLowerCase() !== dictionaryForm(phrase))
      .slice(0, 6),
  };
}
