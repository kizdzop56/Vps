// ─────────────────────────────────────────────────────────────────────────────
// Прогон аудита словаря: сеть (перевод + словарь) и решение по каждому слову.
//
// Модуль стоит между чистыми правилами (wordAudit.ts — ни сети, ни БД) и теми,
// кто ходит в базу: скриптом maintenance/auditWords.ts и веб-ручкой
// routes/maintenance.ts. Обоим нужна ОДНА логика: если правила разъедутся,
// данные будет править то одна версия проверки, то другая.
//
// Здесь нет обращений к БД: на вход строка слова, на выход вердикт и готовый
// патч. Читать и писать строки — забота вызывающего.
//
// ── Что чинится ─────────────────────────────────────────────────────────────
//   • перевод — не то значение многозначного слова;
//   • пример — отсутствует, не содержит слова или показывает чужое значение;
//   • часть речи — не совпадает со словарём.
// ─────────────────────────────────────────────────────────────────────────────
import { googleTranslate } from "@workspace/translate";
import {
  exampleMentionsWord,
  exampleSenseMatches,
  stripInfinitive,
  translationMatches,
} from "./wordAudit";

/** Строка слова, которой достаточно для проверки. */
export type AuditWordRow = {
  id: number;
  deckId: number;
  english: string;
  translationsRu: string[];
  partOfSpeech: string | null;
  exampleEn: string | null;
  exampleRu: string | null;
};

/** Пример-предложение вместе с переводом. */
export type ExamplePair = { en: string; ru: string };

export type AuditFinding = {
  word: AuditWordRow;
  /** Перевод признан ошибочным: обратный перевод не вернул исходное слово. */
  wrongTranslation: boolean;
  /** Свежий перевод, который должен встать первым. null — расхождений нет. */
  freshRu: string | null;
  /** Примера нет вовсе. */
  missingExample: boolean;
  /** Пример не содержит изучаемого слова. */
  badExample: boolean;
  /** Слово в примере есть, но значение чужое. */
  senseMismatch: boolean;
  /** Чем заменить пример. null — замены не нашлось. */
  newExample: ExamplePair | null;
  /** Часть речи по словарю, если сохранённая ей противоречит. */
  freshPos: string | null;
  /** Перевод не получен (сеть или лимит) — слово не трогаем. */
  skipped: boolean;
};

export type AuditScope = {
  /** Не трогать переводы, проверять только примеры. */
  examplesOnly?: boolean;
  /** Не трогать примеры, проверять только переводы. */
  translationsOnly?: boolean;
};

// ── Словарь ─────────────────────────────────────────────────────────────────
// dictionaryapi.dev уже используется в routes/flashcards.ts для проверки
// написания и транскрипции. Здесь он нужен ради двух других полей: примеров
// употребления (живые фразы, а не выдуманные) и части речи.

type DictDefinition = { definition?: unknown; example?: unknown };
type DictMeaning = { partOfSpeech?: unknown; definitions?: DictDefinition[] };
type DictEntry = { meanings?: DictMeaning[] };

export type DictionaryInfo = {
  /** Части речи по словарю, в порядке словарной статьи. */
  partsOfSpeech: string[];
  /** Примеры употребления из всех значений, вперемешку. */
  examples: string[];
};

/** Сколько примеров-кандидатов пробуем перевести: каждый стоит запроса. */
const MAX_EXAMPLE_CANDIDATES = 5;

export async function fetchDictionary(english: string): Promise<DictionaryInfo | null> {
  const lookup = stripInfinitive(english);
  if (!lookup) return null;
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(lookup)}`,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as DictEntry[];
    if (!Array.isArray(data)) return null;

    const partsOfSpeech: string[] = [];
    const examples: string[] = [];

    for (const entry of data) {
      for (const meaning of entry.meanings ?? []) {
        const pos = typeof meaning.partOfSpeech === "string" ? meaning.partOfSpeech.trim() : "";
        if (pos && !partsOfSpeech.includes(pos)) partsOfSpeech.push(pos);
        for (const def of meaning.definitions ?? []) {
          const ex = typeof def.example === "string" ? def.example.trim() : "";
          if (ex && !examples.includes(ex)) examples.push(ex);
        }
      }
    }
    return { partsOfSpeech, examples };
  } catch {
    return null;
  }
}

/**
 * Подобрать пример, который показывает НУЖНОЕ значение слова.
 *
 * Словарь отдаёт примеры на все значения вперемешку: у «tie» там и про галстук,
 * и про ничью в игре. Поэтому кандидат проходит два сита:
 *
 *   1. слово должно присутствовать в самой фразе;
 *   2. перевод фразы должен содержать перевод карточки.
 *
 * Второе сито и решает задачу выбора значения — оно же используется для
 * проверки существующих примеров, так что правило одно на оба случая.
 *
 * Ничего не подошло — возвращаем null. Пустой пример честнее чужого.
 */
export async function pickExample(
  english: string,
  translationsRu: string[],
  candidates: string[],
): Promise<ExamplePair | null> {
  const usable = candidates
    .filter((c) => c.length >= 8 && c.length <= 160)
    .filter((c) => exampleMentionsWord(english, c) !== "no")
    .slice(0, MAX_EXAMPLE_CANDIDATES);

  for (const en of usable) {
    const ru = await googleTranslate(en, "en", "ru");
    if (!ru) continue;
    if (exampleSenseMatches(translationsRu, ru) === "yes") return { en, ru };
  }
  return null;
}

/**
 * Проверить одно слово.
 *
 * Перевод проверяется В ДВЕ СТОРОНЫ. Односторонней проверки мало: у слова
 * бывает несколько честных переводов, и расхождение с автопереводом само по
 * себе ещё не ошибка — так можно вырезать нормальные синонимы.
 *
 *   1. EN→RU. Свежий перевод сверяется с сохранёнными (translationMatches —
 *      по отдельным словам и общему корню, чтобы «костюм» и «костюм, комплект»
 *      считались одним ответом). Совпало — карточка чистая, второй запрос не
 *      тратим.
 *   2. Не совпало → RU→EN на первом сохранённом переводе. Если обратный
 *      перевод даёт исходное английское слово, сохранённый вариант — законное
 *      второе значение, и трогать его нельзя.
 *   3. Обратный перевод увёл в сторону → перевод ошибочный.
 *
 * Пример проверяется после перевода и СВЕРЯЕТСЯ С НИМ: значение примера должно
 * совпадать со значением карточки. Если перевод только что признан ошибочным,
 * сверяем уже со свежим — иначе чинили бы пример под неверное значение.
 */
export async function inspectWord(word: AuditWordRow, scope: AuditScope = {}): Promise<AuditFinding> {
  const finding: AuditFinding = {
    word,
    wrongTranslation: false,
    freshRu: null,
    missingExample: false,
    badExample: false,
    senseMismatch: false,
    newExample: null,
    freshPos: null,
    skipped: false,
  };

  // ── Перевод ───────────────────────────────────────────────────────────────
  const lookup = stripInfinitive(word.english);

  if (!scope.examplesOnly) {
    const fresh = await googleTranslate(lookup, "en", "ru");
    if (!fresh) {
      finding.skipped = true;
      return finding; // без перевода не судим и о примере: не с чем сверять
    }

    const stored = word.translationsRu ?? [];
    if (!translationMatches(fresh, stored)) {
      finding.freshRu = fresh;

      const primary = stored[0];
      if (!primary) {
        finding.wrongTranslation = true; // переводов нет вообще
      } else {
        const back = await googleTranslate(primary, "ru", "en");
        if (!back) {
          finding.skipped = true;
          return finding;
        }
        finding.wrongTranslation = stripInfinitive(back) !== lookup;
      }
    }
  }

  if (scope.translationsOnly) return finding;

  // Значение, под которое подбираем пример: если перевод только что признан
  // ошибочным, ориентируемся на свежий, а не на тот, что лежит в базе.
  const sense = finding.wrongTranslation && finding.freshRu
    ? [finding.freshRu]
    : word.translationsRu ?? [];

  // ── Пример ────────────────────────────────────────────────────────────────
  if (!word.exampleEn) {
    finding.missingExample = true;
  } else {
    finding.badExample = exampleMentionsWord(word.english, word.exampleEn) === "no";
    if (!finding.badExample) {
      finding.senseMismatch = exampleSenseMatches(sense, word.exampleRu) === "no";
    }
  }

  const needsExample = finding.missingExample || finding.badExample || finding.senseMismatch;

  // ── Словарь: примеры и часть речи ─────────────────────────────────────────
  // Ходим в словарь только когда есть за чем: либо чинить пример, либо нечем
  // проверить часть речи.
  if (needsExample || word.partOfSpeech) {
    const dict = await fetchDictionary(word.english);
    if (dict) {
      if (needsExample) {
        finding.newExample = await pickExample(word.english, sense, dict.examples);
      }
      // Часть речи: сверяем без регистра. Словарь молчит — не выдумываем.
      if (word.partOfSpeech && dict.partsOfSpeech.length > 0) {
        const stored = word.partOfSpeech.trim().toLowerCase();
        const known = dict.partsOfSpeech.map((p) => p.toLowerCase());
        if (!known.includes(stored)) finding.freshPos = dict.partsOfSpeech[0] ?? null;
      }
    }
  }

  return finding;
}

/** Что записать в строку слова. null — менять нечего. */
export type WordPatch = {
  translationsRu?: string[];
  partOfSpeech?: string;
  exampleEn?: string | null;
  exampleRu?: string | null;
};

/**
 * Собрать патч по вердикту.
 *
 * Свежий перевод всегда встаёт ПЕРВЫМ: первый элемент показывается на карточке
 * и уходит в варианты ответа тренажёра. Прежние значения сохраняются следом —
 * но только если перевод не признан ошибочным: у заведомо чужого перевода
 * хранить нечего.
 *
 * Пример либо заменяется найденным, либо стирается вместе с русским переводом:
 * без английского он бессмыслен. Отсутствующий пример, которому не нашлось
 * замены, ничего не меняет — стирать там нечего.
 */
export function patchFor(finding: AuditFinding): WordPatch | null {
  const patch: WordPatch = {};

  if (finding.freshRu) {
    const fresh = finding.freshRu;
    const rest = finding.word.translationsRu.filter(
      (t) => t.trim().toLowerCase() !== fresh.trim().toLowerCase(),
    );
    patch.translationsRu = finding.wrongTranslation ? [fresh] : [fresh, ...rest];
  }

  if (finding.freshPos) patch.partOfSpeech = finding.freshPos;

  if (finding.newExample) {
    patch.exampleEn = finding.newExample.en;
    patch.exampleRu = finding.newExample.ru;
  } else if (finding.badExample || finding.senseMismatch) {
    patch.exampleEn = null;
    patch.exampleRu = null;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Проверить пачку слов с ограничением параллельности.
 *
 * Бесплатный путь Google Translate отвечает пустотой, если долбить его без
 * остановки, поэтому запросы идут небольшими партиями с паузой между ними.
 */
export async function inspectBatch(
  words: AuditWordRow[],
  scope: AuditScope = {},
  concurrency = 4,
  pauseMs = 350,
): Promise<AuditFinding[]> {
  const out: AuditFinding[] = [];
  const step = Math.min(Math.max(concurrency, 1), 8);

  for (let i = 0; i < words.length; i += step) {
    const chunk = words.slice(i, i + step);
    out.push(...(await Promise.all(chunk.map((w) => inspectWord(w, scope)))));
    if (i + step < words.length && pauseMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  }

  return out;
}
