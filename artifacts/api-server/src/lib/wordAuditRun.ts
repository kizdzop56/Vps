// ─────────────────────────────────────────────────────────────────────────────
// Прогон аудита словаря: сеть (значения слова + словарь) и решение по каждому
// слову.
//
// Модуль стоит между чистыми правилами (wordAudit.ts — ни сети, ни БД) и теми,
// кто ходит в базу: скриптом maintenance/auditWords.ts и веб-ручкой
// routes/maintenance.ts. Обоим нужна ОДНА логика: если правила разъедутся,
// данные будет править то одна версия проверки, то другая.
//
// ── Чему здесь нельзя верить ────────────────────────────────────────────────
// Машинному переводу как истине. Две ловушки, обе ведут к порче нормальных
// данных:
//
//   • ИДИОМЫ. «A piece of cake» — «проще простого», а машина даёт «кусок
//     торта». Проверка, сравнивающая человеческий перевод с машинным, объявит
//     ошибкой ПРАВИЛЬНЫЙ перевод. Поэтому словосочетания автоматически не
//     правятся никогда: только пометка needsReview для человека.
//
//   • МНОГОЗНАЧНОСТЬ. У «tie» есть галстук, ничья и «связывать». Сравнение с
//     одним «главным» переводом объявляет ошибкой любое другое значение.
//     Поэтому берём словарную статью целиком (wordSenses) и считаем перевод
//     ошибочным, только если он не совпал НИ С ОДНИМ значением.
//
// ── Что чинится ─────────────────────────────────────────────────────────────
//   • перевод — только у одиночных слов и только при полном непопадании;
//   • пример — отсутствует, не содержит слова или показывает чужое значение;
//   • часть речи — не совпадает со словарём.
// ─────────────────────────────────────────────────────────────────────────────
import { googleTranslate, wordSenses } from "@workspace/translate";
import {
  exampleMentionsWord,
  exampleSenseMatches,
  isPhrase,
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
  /** Перевод не совпал ни с одним значением слова. Только для одиночных слов. */
  wrongTranslation: boolean;
  /** Что предлагает словарь вместо сохранённого перевода. */
  freshRu: string | null;
  /** Все известные значения слова — показываем в отчёте, чтобы было видно контекст. */
  senses: string[];
  /** Словосочетание с расхождением: решает человек, автоматически не трогаем. */
  needsReview: boolean;
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
  /** Данные не получены (сеть или лимит) — слово не трогаем. */
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
 * Порядок важен: сначала значения слова, потом пример — потому что пример
 * сверяется именно со значением карточки.
 */
export async function inspectWord(word: AuditWordRow, scope: AuditScope = {}): Promise<AuditFinding> {
  const finding: AuditFinding = {
    word,
    wrongTranslation: false,
    freshRu: null,
    senses: [],
    needsReview: false,
    missingExample: false,
    badExample: false,
    senseMismatch: false,
    newExample: null,
    freshPos: null,
    skipped: false,
  };

  const phrase = isPhrase(word.english);
  const lookup = stripInfinitive(word.english);

  // ── Перевод ───────────────────────────────────────────────────────────────
  if (!scope.examplesOnly) {
    const senses = await wordSenses(lookup, "en", "ru");
    if (!senses) {
      finding.skipped = true;
      return finding; // без данных не судим и о примере: не с чем сверять
    }

    finding.senses = senses.variants;
    const stored = word.translationsRu ?? [];

    if (!translationMatches(senses.variants, stored)) {
      finding.freshRu = senses.main;

      // Словосочетание — территория идиом. Машинный перевод здесь не судья:
      // «a piece of cake» он переведёт «кусок торта» и объявит ошибкой верное
      // «проще простого». Помечаем на ручную проверку и ничего не меняем.
      if (phrase || senses.isPhrase) {
        finding.needsReview = true;
      } else {
        finding.wrongTranslation = true;
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
      finding.senseMismatch =
        exampleSenseMatches(sense, word.exampleRu, { phrase }) === "no";
    }
  }

  const needsExample = finding.missingExample || finding.badExample || finding.senseMismatch;

  // ── Словарь: примеры и часть речи ─────────────────────────────────────────
  // Ходим в словарь только когда есть за чем: либо чинить пример, либо нечем
  // проверить часть речи. У идиом пример не подбираем — проверить его значение
  // всё равно нечем, а подставить дословный смысл хуже, чем оставить пусто.
  const wantExample = needsExample && !phrase;
  if (wantExample || word.partOfSpeech) {
    const dict = await fetchDictionary(word.english);
    if (dict) {
      if (wantExample) {
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
 * Перевод правим ТОЛЬКО при wrongTranslation, то есть у одиночного слова, не
 * совпавшего ни с одним значением. needsReview (словосочетания и идиомы) в
 * патч не попадает никогда — там решает человек.
 *
 * Пример либо заменяется найденным, либо стирается вместе с русским переводом:
 * без английского он бессмыслен. Отсутствующий пример без замены ничего не
 * меняет — стирать там нечего.
 */
export function patchFor(finding: AuditFinding): WordPatch | null {
  const patch: WordPatch = {};

  if (finding.wrongTranslation && finding.freshRu) {
    // Прежнее значение не сохраняем: оно не второе значение слова, а чужое.
    patch.translationsRu = [finding.freshRu];
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
