// ─────────────────────────────────────────────────────────────────────────────
// Прогон аудита словаря: перевод через сеть + решение по каждому слову.
//
// Модуль стоит между чистыми правилами (wordAudit.ts — ни сети, ни БД) и теми,
// кто ходит в базу: скриптом maintenance/auditWords.ts и веб-ручкой
// routes/maintenance.ts. Обоим нужна ОДНА логика: если правила разъедутся,
// данные будет править то одна версия проверки, то другая.
//
// Здесь нет обращений к БД: на вход строка слова, на выход вердикт и готовый
// патч. Читать и писать строки — забота вызывающего.
// ─────────────────────────────────────────────────────────────────────────────
import { googleTranslate } from "@workspace/translate";
import { exampleMentionsWord, stripInfinitive, translationMatches } from "./wordAudit";

/** Строка слова, которой достаточно для проверки. */
export type AuditWordRow = {
  id: number;
  deckId: number;
  english: string;
  translationsRu: string[];
  exampleEn: string | null;
  exampleRu: string | null;
};

export type AuditFinding = {
  word: AuditWordRow;
  /** Перевод признан ошибочным: обратный перевод не вернул исходное слово. */
  wrongTranslation: boolean;
  /** Свежий перевод, который должен встать первым. null — расхождений нет. */
  freshRu: string | null;
  /** Пример не содержит изучаемого слова. */
  badExample: boolean;
  /** Перевод не получен (сеть или лимит) — слово не трогаем. */
  skipped: boolean;
};

export type AuditScope = {
  /** Не трогать переводы, проверять только примеры. */
  examplesOnly?: boolean;
  /** Не трогать примеры, проверять только переводы. */
  translationsOnly?: boolean;
};

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
 * Пример-предложение обязано содержать само изучаемое слово. Спорные случаи
 * (неправильные глаголы, слова короче трёх букв) wordAudit помечает как
 * «не берусь судить» — такие остаются на месте.
 */
export async function inspectWord(word: AuditWordRow, scope: AuditScope = {}): Promise<AuditFinding> {
  const finding: AuditFinding = {
    word,
    wrongTranslation: false,
    freshRu: null,
    badExample: false,
    skipped: false,
  };

  if (!scope.translationsOnly && word.exampleEn) {
    finding.badExample = exampleMentionsWord(word.english, word.exampleEn) === "no";
  }

  if (scope.examplesOnly) return finding;

  const lookup = stripInfinitive(word.english);
  const fresh = await googleTranslate(lookup, "en", "ru");
  if (!fresh) {
    finding.skipped = true;
    return finding;
  }

  const stored = word.translationsRu ?? [];
  if (translationMatches(fresh, stored)) return finding;

  finding.freshRu = fresh;

  const primary = stored[0];
  if (!primary) {
    finding.wrongTranslation = true; // переводов нет вообще
    return finding;
  }

  const back = await googleTranslate(primary, "ru", "en");
  if (!back) {
    finding.skipped = true;
    return finding;
  }

  finding.wrongTranslation = stripInfinitive(back) !== lookup;
  return finding;
}

/** Что записать в строку слова. null — менять нечего. */
export type WordPatch = {
  translationsRu?: string[];
  exampleEn?: null;
  exampleRu?: null;
};

/**
 * Собрать патч по вердикту.
 *
 * Свежий перевод всегда встаёт ПЕРВЫМ: первый элемент показывается на карточке
 * и уходит в варианты ответа тренажёра. Прежние значения сохраняются следом —
 * но только если перевод не признан ошибочным: у заведомо чужого перевода
 * хранить нечего.
 *
 * Плохой пример стирается вместе с русским переводом: без английского он
 * бессмыслен.
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

  if (finding.badExample) {
    patch.exampleEn = null;
    patch.exampleRu = null;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Проверить пачку слов с ограничением параллельности.
 *
 * Бесплатный путь Google Translate отвечает пустотой, если долбить его без
 * остановки, поэтому запросы идут小 партиями с паузой между ними.
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
