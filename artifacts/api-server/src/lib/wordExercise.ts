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
//   memoryLevel 3 → listen или typeRu: аудирование и письменный перевод;
//   memoryLevel 4–5 → build, typeEn или speak: орфография, воспроизведение и речь.
//
// Выбор из вариантов — это узнавание: правильный ответ уже на экране, его надо
// лишь опознать. Поэтому со среднего уровня подмешиваются упражнения на
// воспроизведение, где ответ ребёнок достаёт из головы сам:
//
//   typeRu — видит английское слово, пишет перевод по-русски;
//   typeEn — видит перевод, пишет слово по-английски;
//   speak  — произносит слово вслух, клиент распознаёт речь.
//
// Проверку свободного ответа делает lib/answerCheck.ts: она прощает регистр,
// пунктуацию и одну опечатку, принимает любой из переводов карточки, а
// произношению даёт три попытки.
//
// Словосочетания и слова длиннее MAX_BUILD_LENGTH из букв не собираются —
// вместо этого аудирование или choiceEn.
//
// ── Нехватка вариантов не отменяет проверку ─────────────────────────────────
// Дистракторов может не набраться: маленькая колода, редкая часть речи, слово
// непохожей формы. Раньше в этом случае возвращался intro — «знакомство» с
// кнопкой «Понятно, запомнил». Для нового слова это верно, для знакомого —
// катастрофа: ребёнок сам ставит себе оценку, слово получает good без единой
// проверки и уезжает на неделю вперёд.
//
// Теперь недобор вариантов уводит в СВОБОДНЫЙ ответ (см. fallbackExercise):
// написать перевод, собрать слово, написать слово. Их проверяет сервер, и
// качество подборки дистракторов на честность оценки больше не влияет.
//
// Отдельная забота — сами отвлекающие варианты. Раньше они выдавали себя формой:
// среди однословных ответов стояло словосочетание, один вариант был втрое
// длиннее прочих, у кого-то оставалась точка на конце. Ребёнок отбрасывал
// лишнее по внешнему виду и попадал в верный ответ, не вспомнив слово. Теперь
// дистракторы подбираются по признакам (см. buildOptions):
//
//   форма       — слово только против слов, фраза против фраз (±1 слово);
//   часть речи  — глагол против глаголов, существительное против существительных;
//   длина       — не более чем в MAX_LENGTH_RATIO раза от верного варианта;
//   оформление  — единый регистр, без разнобойной пунктуации;
//   смысл       — сначала та же колода, затем тот же уровень CEFR.
//
// Если кандидатов не хватает, критерии ослабляются по лесенке TIERS
// (смысл → длина → часть речи), но совпадение формы не отпускается никогда.
//
// Модуль без БД и express — тесты в wordExercise.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { LEARNED_LEVEL } from "./srs";
import { SPEAK_MAX_ATTEMPTS } from "./answerCheck";

export type ExerciseType =
  | "intro"
  | "choiceRu"
  | "choiceEn"
  | "listen"
  | "build"
  | "typeRu"
  | "typeEn"
  | "speak";

/** Упражнения со свободным ответом: проверяет answerCheck, а не сравнение с options. */
export const FREE_ANSWER_TYPES: ReadonlySet<ExerciseType> = new Set<ExerciseType>([
  "typeRu",
  "typeEn",
  "speak",
]);

export function isFreeAnswer(type: ExerciseType): boolean {
  return FREE_ANSWER_TYPES.has(type);
}

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
  /**
   * Все допустимые ответы (для typeRu / typeEn / speak). Клиент показывает
   * верный вариант после ответа; саму проверку делает сервер
   * (POST /flashcards/check-answer), чтобы правила жили в одном месте.
   */
  accept?: string[];
  /** На каком языке ждём ответ — клиенту нужно для клавиатуры и распознавания речи. */
  answerLang?: "ru" | "en";
  /** Сколько попыток даётся (для speak). */
  maxAttempts?: number;
};

export type WordLike = {
  id: number;
  english: string;
  translationsRu: string[];
  /** Часть речи (noun/verb/…): дистракторы берём той же части речи. */
  partOfSpeech?: string | null;
  /** Уровень CEFR — второй по приоритету источник дистракторов. */
  cefrLevel?: string | null;
  /** Колода — первый по приоритету источник: слова одной темы. */
  deckId?: number | null;
};

/** Кандидат в отвлекающие варианты: текст + признаки, по которым он отбирается. */
export type DistractorCandidate = {
  text: string;
  pos?: string | null;
  level?: string | null;
  deckId?: number | null;
};

/** Сколько вариантов ответа предлагаем в упражнениях с выбором. */
export const OPTION_COUNT = 4;
/** Минимум вариантов: если слов в подборке мало, предложим меньше, но не один. */
export const MIN_OPTION_COUNT = 2;
/** Максимальная длина слова, которое просим собрать из букв. */
export const MAX_BUILD_LENGTH = 12;
/**
 * Максимальная длина ответа, который просим написать целиком.
 *
 * Длинную конструкцию («take care of sb/sth/yourself») ребёнок будет набирать
 * дольше, чем вспоминать, и ошибётся на опечатке, а не на знании. Такие
 * карточки остаются на выборе и аудировании.
 */
export const MAX_TYPING_LENGTH = 24;

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

/** Ответ достаточно короткий, чтобы просить написать его целиком. */
export function isTypeable(answer: string): boolean {
  const value = answer.trim();
  return value.length > 0 && value.length <= MAX_TYPING_LENGTH;
}

/**
 * Слово годится для проверки произношения.
 *
 * Распознавание речи ошибается тем чаще, чем длиннее фраза, поэтому просим
 * произнести только короткие английские слова и словосочетания. Плейсхолдеры
 * (sb/sth) вслух не произносятся вовсе — такие карточки исключаем.
 */
export function isSpeakable(english: string): boolean {
  const value = english.trim();
  if (!value || value.length > MAX_TYPING_LENGTH) return false;
  if (/\b(sb|sth)\b/i.test(value)) return false;
  if (/[…]/.test(value)) return false;
  return /^[A-Za-z][A-Za-z' -]*$/.test(value);
}

export function pickExerciseType(opts: {
  memoryLevel: number;
  isNew: boolean;
  english: string;
  /** Основной перевод — нужен, чтобы решить, можно ли просить написать его. */
  translation?: string;
  allowListen?: boolean;
  /**
   * Клиент умеет распознавать речь. По умолчанию считаем, что умеет: микрофон
   * есть почти везде, а устройство-исключение отключает упражнение явным
   * allowSpeak=false. Обратное умолчание означало бы, что speak не появится
   * нигде, пока каждый маршрут не вспомнит про флаг.
   */
  allowSpeak?: boolean;
  /** ID слова — нужен для детерминированного чередования типов. */
  wordId?: number;
  /** Точка времени — нужна для cardSeed (по умолчанию now). */
  now?: Date;
}): ExerciseType {
  const { isNew, english, wordId } = opts;
  const level = Number.isFinite(opts.memoryLevel) ? Math.max(0, Math.trunc(opts.memoryLevel)) : 0;
  const allowListen = opts.allowListen !== false;
  const allowSpeak = opts.allowSpeak !== false;
  const translation = (opts.translation ?? "").trim();

  if (isNew) return "intro";

  // Один и тот же сид на карточку и день: тип упражнения стабилен в течение
  // дня (ребёнок не получает разные задания при перезаходе) и воспроизводим
  // в тестах.
  const seed = wordId != null ? cardSeed(wordId, opts.now) : 0;

  // memoryLevel 0: слово только что прошло знакомство, обратное направление
  // ещё слишком рано — даём только узнавание EN→RU.
  if (level === 0) return "choiceRu";

  // memoryLevel 1–2: чередуем choiceRu (EN→RU) и choiceEn (RU→EN) поровну.
  if (level <= 2) return seed % 2 === 1 ? "choiceEn" : "choiceRu";

  const canTypeRu = isTypeable(translation);
  const canTypeEn = isTypeable(english);
  const canSpeak = allowSpeak && isSpeakable(english);

  // memoryLevel 3: узнавание уже пройдено — половину показов отдаём письму,
  // остальное аудированию.
  if (level === 3) {
    if (seed % 2 === 0 && canTypeRu) return "typeRu";
    if (allowListen) return "listen";
    return canTypeRu ? "typeRu" : "choiceEn";
  }

  // memoryLevel 4–5: слово выучено, закрепляем воспроизведением — орфография,
  // письменный перевод и речь по очереди.
  const wheel: ExerciseType[] = [];
  if (isBuildable(english)) wheel.push("build");
  if (canTypeEn) wheel.push("typeEn");
  if (canSpeak) wheel.push("speak");
  if (wheel.length > 0) return wheel[seed % wheel.length]!;

  // Ни собрать, ни написать, ни произнести (длинная конструкция) — остаётся
  // аудирование или выбор.
  if (allowListen) return "listen";
  return "choiceEn";
}

// ── Варианты ответа ──────────────────────────────────────────────────────────

// Плохой набор вариантов вычисляется без знания слова: среди однословных
// ответов стоит словосочетание, один вариант вдвое длиннее прочих, у кого-то
// точка на конце. Ребёнок отсекает лишнее по форме и «угадывает» правильно, не
// вспомнив перевод. Поэтому дистракторы подбираются по признакам ниже.

/** Максимальное отношение длин строк: длинный/короткий вариант не должен выделяться. */
export const MAX_LENGTH_RATIO = 1.5;

/** Единое оформление варианта: без разнобоя пробелов, кавычек, точек и регистра. */
export function sanitizeOption(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[«"'“”(\[]+/u, "")
    .replace(/[»"'“”)\].,;:!?…]+$/u, "")
    .trim()
    .toLowerCase();
}

/** Сколько слов в варианте: слово это или словосочетание. */
export function wordCount(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

// Часть речи приходит из разных источников (сид, импорт, ручной ввод), поэтому
// сравниваем нормализованно: "V." и "verb" — одно и то же.
const POS_ALIASES: Record<string, string> = {
  n: "noun", noun: "noun", сущ: "noun", существительное: "noun",
  v: "verb", verb: "verb", гл: "verb", глагол: "verb",
  adj: "adjective", adjective: "adjective", прил: "adjective", прилагательное: "adjective",
  adv: "adverb", adverb: "adverb", нареч: "adverb", наречие: "adverb",
  prep: "preposition", preposition: "preposition", предлог: "preposition",
  pron: "pronoun", pronoun: "pronoun", местоимение: "pronoun",
  num: "numeral", numeral: "numeral", числительное: "numeral",
  phr: "phrase", phrase: "phrase", idiom: "phrase", фраза: "phrase",
};

/** Часть речи в сравнимом виде; пустая строка — «не размечено». */
export function normalizePos(pos: string | null | undefined): string {
  const key = (pos ?? "").trim().toLowerCase().replace(/\.+$/u, "").trim();
  return POS_ALIASES[key] ?? key;
}

/**
 * Совпадение формы — единственное правило, которое не ослабляется никогда:
 * одно слово только против одного слова, словосочетание — только против
 * словосочетания сопоставимой длины (±1 слово).
 */
export function sameShape(a: string, b: string): boolean {
  const ca = wordCount(a);
  const cb = wordCount(b);
  if (ca === 0 || cb === 0) return false;
  if (ca === 1 || cb === 1) return ca === cb;
  return Math.abs(ca - cb) <= 1;
}

/** Близость длин: строка варианта не длиннее/короче верной в полтора раза. */
export function lengthClose(a: string, b: string, ratio: number = MAX_LENGTH_RATIO): boolean {
  const la = a.trim().length;
  const lb = b.trim().length;
  if (la === 0 || lb === 0) return la === lb;
  return Math.max(la, lb) / Math.min(la, lb) <= ratio;
}

/** Части речи сравнимы; неразмеченное слово кандидата не отсекает. */
function posCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePos(a);
  const nb = normalizePos(b);
  if (!na || !nb) return true;
  return na === nb;
}

type Tier = {
  /** Откуда берём кандидата: та же колода → тот же уровень → весь пул. */
  scope: "deck" | "level" | "any";
  /** Требовать совпадения части речи. */
  pos: boolean;
  /** Требовать близости длин. */
  length: boolean;
};

/**
 * Лесенка ослабления. Идём сверху вниз и добираем кандидатов, пока не наберём
 * нужное число. Порядок ослабления задан требованиями: сначала отпускаем
 * близость по смыслу (тема → уровень → весь пул), затем длину, затем часть
 * речи. Совпадение формы проверяется на каждом ярусе и не отпускается.
 */
const TIERS: Tier[] = [
  { scope: "deck",  pos: true,  length: true },
  { scope: "level", pos: true,  length: true },
  { scope: "any",   pos: true,  length: true },
  { scope: "any",   pos: true,  length: false },
  { scope: "any",   pos: false, length: false },
];

/**
 * Собрать варианты ответа: верный + отвлекающие из подборки похожих слов.
 *
 * Отвлекающие не повторяются и не совпадают ни с верным ответом, ни с другими
 * переводами этого же слова (иначе ребёнок ткнёт «неверный» вариант, который на
 * самом деле верен). Порядок детерминирован: зависит только от rng.
 *
 * pool принимает и простые строки (тогда признаки неизвестны и отбор идёт
 * только по форме и длине), и кандидатов с частью речи, уровнем и колодой.
 */
export function buildOptions(
  correct: string,
  pool: Array<string | DistractorCandidate>,
  rng: () => number,
  exclude: string[] = [],
  count: number = OPTION_COUNT,
  target: { pos?: string | null; level?: string | null; deckId?: number | null } = {},
): { options: string[]; answerIndex: number; answer: string } {
  const answer = sanitizeOption(correct);
  const forbidden = new Set([answer, ...exclude.map(sanitizeOption)]);

  const seen = new Set<string>();
  const candidates: DistractorCandidate[] = [];
  for (const item of pool) {
    const raw = typeof item === "string" ? { text: item } : item;
    const text = sanitizeOption(raw.text ?? "");
    if (!text || forbidden.has(text) || seen.has(text)) continue;
    seen.add(text);
    candidates.push({ ...raw, text });
  }

  const targetLevel = (target.level ?? "").trim().toLowerCase();

  const fits = (c: DistractorCandidate, tier: Tier): boolean => {
    // (а) форма — нерушимое условие на любом ярусе
    if (!sameShape(answer, c.text)) return false;
    if (tier.scope === "deck") {
      if (target.deckId == null || c.deckId == null || c.deckId !== target.deckId) return false;
    }
    if (tier.scope === "level") {
      const level = (c.level ?? "").trim().toLowerCase();
      if (!targetLevel || !level || level !== targetLevel) return false;
    }
    if (tier.pos && !posCompatible(target.pos, c.pos)) return false;
    if (tier.length && !lengthClose(answer, c.text)) return false;
    return true;
  };

  // Перемешиваем один раз, ярусы только фильтруют — так выбор остаётся
  // детерминированным независимо от того, до какого яруса пришлось дойти.
  const shuffled = shuffle(candidates, rng);
  const need = Math.max(0, count - 1);
  const picked: string[] = [];
  const used = new Set<string>();
  for (const tier of TIERS) {
    if (picked.length >= need) break;
    for (const candidate of shuffled) {
      if (picked.length >= need) break;
      if (used.has(candidate.text) || !fits(candidate, tier)) continue;
      used.add(candidate.text);
      picked.push(candidate.text);
    }
  }

  const options = answer ? shuffle([answer, ...picked], rng) : [];
  return { options, answerIndex: options.indexOf(answer), answer };
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

// ── Готовые упражнения ───────────────────────────────────────────────────────

/** Письменный перевод: показываем слово, ждём русский ответ. */
function typeRuExercise(word: WordLike, translation: string): Exercise {
  return {
    type: "typeRu",
    prompt: word.english,
    answer: translation,
    accept: word.translationsRu.map((t) => t.trim()).filter(Boolean),
    answerLang: "ru",
  };
}

/** Письмо по-английски: показываем перевод, ждём слово. */
function typeEnExercise(word: WordLike, translation: string): Exercise {
  return {
    type: "typeEn",
    prompt: translation,
    answer: word.english.trim(),
    accept: [word.english.trim()],
    answerLang: "en",
  };
}

/** Сборка слова из букв: показываем перевод, ответ набирается плитками. */
function buildLettersExercise(word: WordLike, translation: string, rng: () => number): Exercise {
  return {
    type: "build",
    prompt: translation,
    answer: word.english.trim(),
    letters: letterTiles(word.english, rng),
  };
}

/**
 * Что дать, когда вариантов ответа не набралось.
 *
 * ЗАЧЕМ. Раньше здесь возвращался intro. Для нового слова это правильно, а для
 * знакомого — подмена: intro показывает «Показать перевод» и «Понятно,
 * запомнил», то есть ребёнок ставит себе оценку сам. Слово получало good без
 * всякой проверки и уезжало на неделю вперёд. Недобор дистракторов — проблема
 * подборки, а не повод отменить проверку знания.
 *
 * Свободный ответ дистракторов не требует вовсе, поэтому он и берётся:
 * написать перевод, собрать слово из букв, написать слово по-английски.
 * Проверяет его сервер (POST /flashcards/check-answer).
 *
 * intro остаётся последней строчкой — для карточки, у которой нет перевода:
 * ни спросить, ни проверить нечего.
 */
function fallbackExercise(word: WordLike, translation: string, rng: () => number): Exercise {
  if (!translation) return { type: "intro", prompt: word.english };
  if (isTypeable(translation)) return typeRuExercise(word, translation);
  if (isBuildable(word.english)) return buildLettersExercise(word, translation, rng);
  if (isTypeable(word.english)) return typeEnExercise(word, translation);
  return { type: "intro", prompt: word.english };
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
  allowSpeak?: boolean;
}): Exercise {
  const { word, memoryLevel, isNew, pool } = opts;
  const now = opts.now ?? new Date();
  const rng = mulberry32(cardSeed(word.id, now));
  const translation = mainTranslation(word);
  const type = pickExerciseType({
    memoryLevel,
    isNew,
    english: word.english,
    translation,
    allowListen: opts.allowListen,
    allowSpeak: opts.allowSpeak,
    wordId: word.id,
    now,
  });
  const others = pool.filter((w) => w.id !== word.id);

  if (type === "intro") {
    return { type, prompt: word.english };
  }

  if (type === "build") {
    return buildLettersExercise(word, translation, rng);
  }

  // Свободный ответ: вариантов не даём вовсе. accept — все допустимые написания;
  // сравнение делает сервер (POST /flashcards/check-answer), клиент лишь
  // показывает верный вариант после проверки.
  if (type === "typeRu") {
    return typeRuExercise(word, translation);
  }

  if (type === "typeEn") {
    return typeEnExercise(word, translation);
  }

  if (type === "speak") {
    return {
      type,
      // Показываем само слово: задача не вспомнить его, а произнести.
      prompt: word.english,
      answer: word.english.trim(),
      accept: [word.english.trim()],
      answerLang: "en",
      maxAttempts: SPEAK_MAX_ATTEMPTS,
    };
  }

  // Признаки правильного ответа, по которым подбираются дистракторы: часть
  // речи, уровень и колода самого слова.
  const target = { pos: word.partOfSpeech, level: word.cefrLevel, deckId: word.deckId };
  /** Кандидаты из пула: текст берём нужной стороны, признаки — у слова-источника. */
  const candidates = (pick: (w: WordLike) => string): DistractorCandidate[] =>
    others.map((w) => ({ text: pick(w), pos: w.partOfSpeech, level: w.cefrLevel, deckId: w.deckId }));

  if (type === "choiceEn") {
    const { options, answerIndex, answer } = buildOptions(
      word.english,
      candidates((w) => w.english),
      rng,
      [],
      OPTION_COUNT,
      target,
    );
    return options.length >= MIN_OPTION_COUNT
      ? { type, prompt: translation, options, answerIndex, answer }
      : fallbackExercise(word, translation, rng);
  }

  // choiceRu и listen отличаются только тем, показываем ли само слово: варианты
  // в обоих случаях — переводы.
  const { options, answerIndex, answer } = buildOptions(
    translation,
    candidates(mainTranslation),
    rng,
    word.translationsRu, // прочие переводы этого же слова нельзя давать как «неверные»
    OPTION_COUNT,
    target,
  );
  if (options.length < MIN_OPTION_COUNT) return fallbackExercise(word, translation, rng);
  return { type, prompt: word.english, options, answerIndex, answer };
}
