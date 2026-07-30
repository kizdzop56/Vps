// ─────────────────────────────────────────────────────────────────────────────
// Интервальное повторение слов: планировщик, начисление очков и отбор «сложных»
// слов. Модуль чистый (без БД и express), поэтому покрывается тестами напрямую —
// см. srs.test.ts.
//
// Уровень памяти (memoryLevel) остаётся 0–5, как в схеме user_card_state:
//   0–1 — знакомство и первые повторы (минуты),
//   2–3 — закрепление (часы/дни),
//   4–5 — слово считается выученным (неделя/месяц).
//
// Отличие от прежней логики: четыре оценки вместо двух («не знаю / трудно /
// знаю / легко») и мягкое падение при ошибке. Раньше любой неверный ответ ронял
// уровень сразу на две ступени, из-за чего ребёнок, споткнувшийся на выученном
// слове, откатывался в самое начало и терял мотивацию.
// ─────────────────────────────────────────────────────────────────────────────

/** Оценка ответа. Совпадает по смыслу с Anki: again → hard → good → easy. */
export type Grade = "again" | "hard" | "good" | "easy";

/** Старый формат оценки (совместимость с уже развёрнутым клиентом). */
export type LegacyResult = "know" | "dont";

export const MAX_MEMORY_LEVEL = 5;
/** С этого уровня слово считается выученным (как и раньше). */
export const LEARNED_LEVEL = 4;

/** Базовый интервал до следующего показа (в минутах) по уровню памяти. */
export const INTERVAL_MIN: Record<number, number> = {
  0: 1,       // только что познакомились / ошиблись → почти сразу
  1: 10,      // 10 минут
  2: 720,     // 12 часов
  3: 2880,    // 2 дня
  4: 10080,   // 1 неделя
  5: 43200,   // 30 дней
};

/** Множитель интервала по оценке: «трудно» — раньше, «легко» — позже. */
const DUE_MULTIPLIER: Record<Grade, number> = {
  again: 1,
  hard: 0.5,
  good: 1,
  easy: 1.4,
};

/** Минимальный интервал — чтобы карточка не возвращалась в ту же секунду. */
const MIN_INTERVAL_MIN = 1;

export type ReviewPlan = {
  level: number;
  dueAt: Date;
  intervalMinutes: number;
};

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(MAX_MEMORY_LEVEL, Math.round(level)));
}

/** Новый уровень памяти по прежнему уровню и оценке. */
export function nextLevel(level: number, grade: Grade): number {
  const cur = clampLevel(level);
  switch (grade) {
    // Ошибка: откат на одну ступень, но не ниже нуля. Для уже выученного слова
    // (4–5) уводим в закрепление (3), а не в самое начало.
    case "again":
      return cur >= LEARNED_LEVEL ? LEARNED_LEVEL - 1 : Math.max(0, cur - 1);
    case "hard":
      return cur; // уровень держим, но спросим раньше срока
    case "good":
      return clampLevel(cur + 1);
    case "easy":
      return clampLevel(cur + 2);
  }
}

/** Полный план следующего показа карточки. */
export function nextReviewState(level: number, grade: Grade, now: Date = new Date()): ReviewPlan {
  const newLevel = nextLevel(level, grade);
  const base = INTERVAL_MIN[newLevel] ?? MIN_INTERVAL_MIN;
  const minutes = Math.max(MIN_INTERVAL_MIN, Math.round(base * DUE_MULTIPLIER[grade]));
  return {
    level: newLevel,
    intervalMinutes: minutes,
    dueAt: new Date(now.getTime() + minutes * 60_000),
  };
}

/** Слово выучено? */
export function isLearned(level: number): boolean {
  return clampLevel(level) >= LEARNED_LEVEL;
}

/** Карточка впервые дошла до «выучено» — за это даём бонус очков. */
export function reachedLearned(prevLevel: number, newLevel: number): boolean {
  return !isLearned(prevLevel) && isLearned(newLevel);
}

/** Считать ли ответ срывом (для счётчика lapses и подборки «сложные слова»). */
export function countsAsLapse(prevLevel: number, grade: Grade): boolean {
  return grade === "again" && clampLevel(prevLevel) >= 2;
}

// ── Оценка по ответу ребёнка ────────────────────────────────────────────────
// Оценку не спрашиваем у ученика (дети переоценивают себя и жмут «знаю»), а
// выводим из самого ответа: верно/неверно, число попыток и скорость.
export const FAST_ANSWER_MS = 4_000;   // быстрый уверенный ответ → «легко»
export const SLOW_ANSWER_MS = 12_000;  // долгий ответ → «трудно», спросим раньше

export type AnswerInfo = {
  correct: boolean;
  attempts?: number;   // попыток в этом показе (1 — ответил сразу)
  elapsedMs?: number;  // время до ответа
  hintUsed?: boolean;  // пользовался подсказкой (открыл букву/перевод)
};

export function gradeFromAnswer(answer: AnswerInfo): Grade {
  if (!answer.correct) return "again";
  const attempts = Math.max(1, Math.round(answer.attempts ?? 1));
  if (attempts > 1 || answer.hintUsed) return "hard";
  const elapsed = answer.elapsedMs;
  if (typeof elapsed === "number" && Number.isFinite(elapsed)) {
    if (elapsed <= FAST_ANSWER_MS) return "easy";
    if (elapsed > SLOW_ANSWER_MS) return "hard";
  }
  return "good";
}

/** Старый формат → новая оценка (клиент прошлой версии присылает know/dont). */
export function gradeFromLegacy(result: LegacyResult): Grade {
  return result === "know" ? "good" : "again";
}

/** Новая оценка → старый формат: журнал review_log хранит know/dont. */
export function legacyResultFromGrade(grade: Grade): LegacyResult {
  return grade === "again" ? "dont" : "know";
}

// ── Очки за слова ───────────────────────────────────────────────────────────
// Раньше за карточки не начислялось ничего: очки давали только задания
// (routes/submissions.ts), поэтому изучение слов ребёнку ничего не «стоило».
// Начисляем немного за каждый верный ответ и заметный бонус за выученное слово,
// с дневным потолком — чтобы нельзя было накрутить очки перелистыванием.
export const POINTS_BY_GRADE: Record<Grade, number> = {
  again: 0,
  hard: 1,
  good: 2,
  easy: 2,
};
export const LEARNED_BONUS_POINTS = 5;
export const DAILY_WORD_POINTS_CAP = 60;

/** Очки за один ответ (без учёта дневного потолка). */
export function pointsForReview(grade: Grade, justLearned: boolean): number {
  return POINTS_BY_GRADE[grade] + (justLearned ? LEARNED_BONUS_POINTS : 0);
}

export type ReviewLogLike = {
  wordId: number;
  result: string;
  memoryLevelAfter: number | null;
  reviewedAt: Date;
};

/**
 * Сколько очков за слова уже начислено сегодня. Считаем по журналу повторений
 * (review_log) теми же правилами, что и при начислении, — так дневной потолок
 * работает без отдельной колонки в БД.
 *
 * logs — записи журнала пользователя (можно передать все, фильтрация внутри).
 */
export function pointsEarnedToday(logs: ReviewLogLike[], dayStart: Date): number {
  const startMs = dayStart.getTime();
  // Бонус за «выучено» даём один раз на слово — по первой записи, где уровень
  // достиг LEARNED_LEVEL. Поэтому сначала ищем такие записи по всей истории.
  const firstLearnedAt = new Map<number, number>();
  for (const log of [...logs].sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime())) {
    if (isLearned(log.memoryLevelAfter ?? 0) && !firstLearnedAt.has(log.wordId)) {
      firstLearnedAt.set(log.wordId, log.reviewedAt.getTime());
    }
  }

  let total = 0;
  for (const log of logs) {
    const at = log.reviewedAt.getTime();
    if (at < startMs) continue;
    if (log.result === "know") total += POINTS_BY_GRADE.good;
    if (firstLearnedAt.get(log.wordId) === at) total += LEARNED_BONUS_POINTS;
  }
  return total;
}

/** Сколько из заработанных очков реально начислить с учётом дневного потолка. */
export function awardablePoints(points: number, earnedToday: number): number {
  const left = DAILY_WORD_POINTS_CAP - Math.max(0, earnedToday);
  if (left <= 0) return 0;
  return Math.max(0, Math.min(points, left));
}

// ── «Сложные слова» ─────────────────────────────────────────────────────────
// Отдельная подборка для отработки: слова, на которых ребёнок регулярно
// спотыкается. Раньше такие слова нигде не выделялись — они просто всплывали в
// общей очереди вперемешку с новыми.
export type CardStateLike = {
  wordId: number;
  memoryLevel: number;
  lapses: number;
  timesSeen: number;
  timesCorrect: number;
};

/** Точность по карточке в процентах (0–100). */
export function cardAccuracy(state: CardStateLike): number {
  if (state.timesSeen <= 0) return 100;
  return Math.round((state.timesCorrect / state.timesSeen) * 100);
}

export const HARD_ACCURACY_THRESHOLD = 60;

/** Слово «сложное»: были срывы или низкая точность, и оно ещё не выучено. */
export function isHardCard(state: CardStateLike): boolean {
  if (isLearned(state.memoryLevel)) return false;
  if (state.lapses >= 1) return true;
  return state.timesSeen >= 3 && cardAccuracy(state) < HARD_ACCURACY_THRESHOLD;
}

/** Чем больше — тем «сложнее» слово. Для сортировки подборки. */
export function hardScore(state: CardStateLike): number {
  const errors = Math.max(0, state.timesSeen - state.timesCorrect);
  return state.lapses * 10 + errors * 3 + (MAX_MEMORY_LEVEL - clampLevel(state.memoryLevel));
}

/** Начало текущих суток (локальная зона сервера) — как в routes/flashcards.ts. */
export function startOfDay(now: Date = new Date()): Date {
  const d = new Date(now.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}
