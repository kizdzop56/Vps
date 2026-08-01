// ─────────────────────────────────────────────────────────────────────────────
// Подбор упражнения для карточки и генерация вариантов ответа.
//
// Раньше тренировка была одна: перевернуть карточку и самому нажать «знаю» или
// «учить». Для детей это слабо работает — ребёнок видит перевод и уверен, что
// «знал», хотя вспомнить сам не смог. Поэтому упражнение подбирается по уровню
// памяти слова и постепенно усложняется:
//
//   знакомство    → карточка с картинкой, переводом, примером и озвучкой (isNew);
//   memoryLevel 0 → choiceRu только (EN → выбор RU, первое узнавание);
//   memoryLevel 1–2 → choiceRu или choiceEn поровну, детерминировано по сиду
//                     (слово + день): оба направления чередуются без Math.random;
//   memoryLevel 3 → listen (только озвучка → выбор перевода, аудирование);
//   memoryLevel 4–5 → build (собери слово из букв, орфография).
//
// Словосочетания и слова длиннее MAX_BUILD_LENGTH из букв не собираются —
// вместо этого аудирование или choiceEn.
//
// Модуль чистый (без БД и express) — тесты в wordExercise.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { LEARNED_LEVEL } from "./srs";

export type ExerciseType = "intro" | "choiceRu" | "choiceEn" | "listen" | "build";

export type Exercise = {
  type: ExerciseType;
  /** Что показать в задании: английское слово или русский перевод. */
  prompt: string;
  /** Варианты ответа (для choiceRu / choiceEn / listen). */
  options?: string[];
  /** Индекс верного варианта в options. */
  answerIndex?: number;
  /** Перемешанные плитки букв (для build). */
  letters?: string[];
  /** Верный ответ строкой (для build — само слово). */
  answer?: string;
};

export type WordLike = {
  id: number;
  english: string;
  translationsRu: string[];
};

/** Сколько вариантов ответа предлагаем в упражнениях с выбором. */
export const OPTION_COUNT = 4;
/** Минимум вариантов: если слов в подборке мало, предложим меньше, но не один. */
export const MIN_OPTION_COUNT = 2;
/** Максимальная длина слова, которое просим собрать из букв. */
export const MAX_BUILD_LENGTH = 12;

// ── Детерминированный генератор случайных чисел ──────────────────────────────
// Нужен, чтобы порядок вариантов был стабильным для одной и той же карточки в
// течение дня (и чтобы тесты были воспроизводимыми), но менялся день ко дню.
export function mulberry32(seed: number): () => number {
  let a = Math.trunc(seed) || 1;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Перемешивание Фишера–Йейтса с заданным генератором. */
export function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** Номер дня — часть сида: варианты ответа перетасовываются каждый день. */
export function daySeed(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 86_400_000);
}

/** Сид для конкретной карточки на конкретный день. */
export function cardSeed(wordId: number, now: Date = new Date()): number {
  return Math.abs(Math.trunc(wordId) * 2654435761 + daySeed(now)) || 1;
}

// ── Выбор типа упражнения ────────────────────────────────────────────────────

/** Слово годится для сборки из букв: одно слово латиницей и не слишком длинное. */
export function isBuildable(english: string): boolean {
  const word = english.trim();
  if (!/^[A-Za-z]+$/.test(word)) return false; // фразы и слова с дефисом не собираем
  return word.length >= 3 && word.length <= MAX_BUILD_LENGTH;
}

export function pickExerciseType(opts: {
  memoryLevel: number;
  isNew: boolean;
  english: string;
  allowListen?: boolean;
  /** ID слова — нужен для детерминированного чередования choiceRu/choiceEn. */
  wordId?: number;
  /** Точка времени — нужна для cardSeed (по умолчанию now). */
  now?: Date;
}): ExerciseType {
  const { isNew, english, wordId } = opts;
  const level = Number.isFinite(opts.memoryLevel) ? Math.max(0, Math.trunc(opts.memoryLevel)) : 0;
  const allowListen = opts.allowListen !== false;

  if (isNew) return "intro";

  // memoryLevel 0: слово только что прошло знакомство, обратное направление
  // ещё слишком рано — даём только узнавание EN→RU.
  if (level === 0) return "choiceRu";

  // memoryLevel 1–2: чередуем choiceRu (EN→RU) и choiceEn (RU→EN) поровну.
  // Чередование детерминировано: бит из cardSeed (wordId + день) — стабилен
  // в течение дня, воспроизводим в тестах, не зависит от Math.random.
  if (level <= 2) {
    const choiceEnBit = wordId != null ? cardSeed(wordId, opts.now) % 2 : 0;
    return choiceEnBit === 1 ? "choiceEn" : "choiceRu";
  }

  if (level === 3) return allowListen ? "listen" : "choiceEn";

  // Выученное закрепляем письмом; фразы и длинные слова — аудированием/выбором.
  if (level >= LEARNED_LEVEL && isBuildable(english)) return "build";
  return allowListen ? "listen" : "choiceEn";
}

// ── Варианты ответа ──────────────────────────────────────────────────────────

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Собрать варианты ответа: верный + отвлекающие из подборки похожих слов.
 * Отвлекающие не повторяются и не совпадают ни с верным ответом, ни с другими
 * переводами этого же слова (иначе ребёнок ткнёт «неверный» вариант, который на
 * самом деле верен).
 */
export function buildOptions(
  correct: string,
  pool: string[],
  rng: () => number,
  exclude: string[] = [],
  count: number = OPTION_COUNT,
): { options: string[]; answerIndex: number } {
  const forbidden = new Set([normalize(correct), ...exclude.map(normalize)]);
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const item of pool) {
    const value = item.trim();
    const key = normalize(value);
    if (!value || forbidden.has(key) || seen.has(key)) continue;
    seen.add(key);
    candidates.push(value);
  }

  const distractors = shuffle(candidates, rng).slice(0, Math.max(0, count - 1));
  const options = shuffle([correct.trim(), ...distractors], rng);
  return { options, answerIndex: options.findIndex((o) => normalize(o) === normalize(correct)) };
}

/** Плитки букв для сборки слова: буквы слова + несколько лишних. */
export function letterTiles(english: string, rng: () => number): string[] {
  const word = english.trim().toLowerCase();
  const letters = word.split("");
  const decoyCount = word.length <= 5 ? 2 : 3;
  const alphabet = "abcdefghijklmnoprstuvwy".split("");
  const decoys: string[] = [];
  for (let i = 0; i < decoyCount; i++) {
    decoys.push(alphabet[Math.floor(rng() * alphabet.length)]!);
  }
  return shuffle([...letters, ...decoys], rng);
}

/** Основной перевод слова — его показываем как верный ответ. */
export function mainTranslation(word: WordLike): string {
  return (word.translationsRu[0] ?? "").trim();
}

/**
 * Собрать очередь сессии: новые слова вставляются между повторениями, а не
 * идут скучным блоком в конце. Повторения задают порядок, каждое everyN-е
 * место отдаём новому слову; остаток новых добавляется в хвост.
 */
export function interleaveQueue<T>(due: T[], fresh: T[], everyN: number = 3): T[] {
  if (fresh.length === 0) return [...due];
  if (due.length === 0) return [...fresh];
  const out: T[] = [];
  let next = 0;
  for (let i = 0; i < due.length; i++) {
    out.push(due[i]!);
    if ((i + 1) % everyN === 0 && next < fresh.length) out.push(fresh[next++]!);
  }
  while (next < fresh.length) out.push(fresh[next++]!);
  return out;
}

/**
 * Готовое упражнение для карточки.
 *
 * pool — слова того же уровня (или той же колоды), из которых берём отвлекающие
 * варианты; само слово из подборки исключается.
 */
export function buildExercise(opts: {
  word: WordLike;
  memoryLevel: number;
  isNew: boolean;
  pool: WordLike[];
  now?: Date;
  allowListen?: boolean;
}): Exercise {
  const { word, memoryLevel, isNew, pool } = opts;
  const now = opts.now ?? new Date();
  const rng = mulberry32(cardSeed(word.id, now));
  const type = pickExerciseType({
    memoryLevel,
    isNew,
    english: word.english,
    allowListen: opts.allowListen,
    wordId: word.id,
    now,
  });
  const others = pool.filter((w) => w.id !== word.id);

  if (type === "intro") {
    return { type, prompt: word.english };
  }

  if (type === "build") {
    return { type, prompt: mainTranslation(word), answer: word.english.trim(), letters: letterTiles(word.english, rng) };
  }

  if (type === "choiceEn") {
    const { options, answerIndex } = buildOptions(word.english, others.map((w) => w.english), rng);
    return options.length >= MIN_OPTION_COUNT
      ? { type, prompt: mainTranslation(word), options, answerIndex, answer: word.english.trim() }
      : { type: "intro", prompt: word.english };
  }

  // choiceRu и listen отличаются только тем, показываем ли само слово: варианты
  // в обоих случаях — переводы.
  const correct = mainTranslation(word);
  const { options, answerIndex } = buildOptions(
    correct,
    others.map(mainTranslation),
    rng,
    word.translationsRu, // прочие переводы этого же слова нельзя давать как «неверные»
  );
  if (options.length < MIN_OPTION_COUNT) return { type: "intro", prompt: word.english };
  return { type, prompt: word.english, options, answerIndex, answer: correct };
}
