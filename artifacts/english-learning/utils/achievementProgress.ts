// ─────────────────────────────────────────────────────────────────────────────
// Прогресс до медали.
//
// В constants/achievements.ts у награды есть только предикат check(): он
// отвечает «получена или нет», но не говорит, сколько осталось. Ученик видел
// пунктирный кружок с замком и текст «Выполни 25 заданий» — а сколько у него
// сейчас и много ли осталось, приходилось считать в уме.
//
// Порог достаём из самого id: все награды названы по схеме `метрика_число`
// (tasks_25, points_500, streak_7, time_600, xp_20 …), и это число ровно то,
// с которым сравнивает check(). Так мы не дублируем данные и не рискуем
// разойтись: файл наград не меняется вообще.
//
// Единственная награда без прогресса — welcome (check: () => true): у неё нет
// ни метрики, ни порога, и она выдаётся сразу.
// ─────────────────────────────────────────────────────────────────────────────

import type { Achievement, AchievementStats } from "@/constants/achievements";

/** Русское склонение по числу: [1, 2-4, 5-0]. */
function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 14) return forms[2];
  const last = abs % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/** Минуты в человеческую строку: 150 → «2 ч 30 мин». */
function humanMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} ${plural(m, ["минуту", "минуты", "минут"])}`;
  if (m === 0) return `${h} ${plural(h, ["час", "часа", "часов"])}`;
  return `${h} ч ${m} мин`;
}

type Metric = {
  /** Текущее значение показателя у ученика. */
  value: (s: AchievementStats) => number;
  /** Фраза «Осталось …» для оставшегося количества. */
  remaining: (n: number) => string;
  /** Короткая подпись под полосой: «12 из 25 заданий». */
  unit: (n: number) => string;
};

/**
 * Метрики по префиксу id. Порядок и пороги здесь не задаются — только то,
 * откуда брать текущее значение и как назвать его по-русски.
 */
const METRICS: Record<string, Metric> = {
  tasks: {
    value: (s) => s.completedAssignments,
    remaining: (n) => `Осталось ${n} ${plural(n, ["задание", "задания", "заданий"])}`,
    unit: (n) => plural(n, ["задание", "задания", "заданий"]),
  },
  points: {
    value: (s) => s.totalPoints,
    remaining: (n) => `Осталось ${n} ${plural(n, ["очко", "очка", "очков"])}`,
    unit: (n) => plural(n, ["очко", "очка", "очков"]),
  },
  perfect: {
    value: (s) => s.perfectScoreCount,
    remaining: (n) => `Осталось ${n} ${plural(n, ["идеальный результат", "идеальных результата", "идеальных результатов"])}`,
    unit: (n) => plural(n, ["идеальный", "идеальных", "идеальных"]),
  },
  streak: {
    value: (s) => s.loginStreak,
    // Стрик не накапливается, а обнуляется при пропуске — поэтому здесь
    // «подряд», иначе цифра вводит в заблуждение.
    remaining: (n) => `Ещё ${n} ${plural(n, ["день", "дня", "дней"])} подряд`,
    unit: (n) => plural(n, ["день", "дня", "дней"]),
  },
  time: {
    value: (s) => s.totalTimeMinutes,
    remaining: (n) => `Осталось ${humanMinutes(n)}`,
    unit: () => "мин",
  },
  voice: {
    value: (s) => s.voiceChatSessions,
    remaining: (n) => `Осталось ${n} ${plural(n, ["разговор", "разговора", "разговоров"])}`,
    unit: (n) => plural(n, ["разговор", "разговора", "разговоров"]),
  },
  xp: {
    value: (s) => s.xpLevel,
    remaining: (n) => `Ещё ${n} ${plural(n, ["уровень", "уровня", "уровней"])}`,
    unit: (n) => plural(n, ["уровень", "уровня", "уровней"]),
  },
  early: {
    value: (s) => s.earlyBirdSessions,
    remaining: (n) => `Осталось ${n} ${plural(n, ["утреннее занятие", "утренних занятия", "утренних занятий"])}`,
    unit: (n) => plural(n, ["утреннее", "утренних", "утренних"]),
  },
};

export interface AchievementProgress {
  /** Текущее значение показателя. */
  current: number;
  /** Порог, при котором награда выдаётся. */
  target: number;
  /** Сколько не хватает. 0 — награда уже получена. */
  remaining: number;
  /** Заполнение полосы, 0…100. */
  percent: number;
  /** «Осталось 4 задания» — готовая фраза для подписи. */
  remainingText: string;
  /** «12 / 25 заданий» — счётчик рядом с полосой. */
  counterText: string;
}

/**
 * Прогресс по конкретной награде. null — у награды нет измеримого условия
 * (welcome) или префикс id неизвестен: в этом случае экран просто не рисует
 * полосу, вместо того чтобы показывать выдуманное число.
 */
export function achievementProgress(
  achievement: Achievement,
  stats: AchievementStats,
): AchievementProgress | null {
  const parsed = /^([a-z]+)_(\d+)$/.exec(achievement.id);
  if (!parsed) return null;

  const metric = METRICS[parsed[1]!];
  if (!metric) return null;

  const target = Number(parsed[2]);
  if (!Number.isFinite(target) || target <= 0) return null;

  const current = Math.max(0, metric.value(stats));
  const remaining = Math.max(0, target - current);
  const percent = Math.max(0, Math.min(100, Math.round((current / target) * 100)));

  const counterText = parsed[1] === "time"
    ? `${humanMinutes(Math.min(current, target))} из ${humanMinutes(target)}`
    : `${Math.min(current, target)} из ${target} ${metric.unit(target)}`;

  return {
    current,
    target,
    remaining,
    percent,
    remainingText: remaining === 0 ? "Условие выполнено" : metric.remaining(remaining),
    counterText,
  };
}

export interface NextAchievement {
  achievement: Achievement;
  progress: AchievementProgress;
}

/**
 * Ближайшая награда: та, что заполнена сильнее всех остальных.
 *
 * Сортируем по доле, а не по абсолютному остатку: «осталось 2 задания из 3»
 * ощущается ближе, чем «осталось 100 очков из 10 000», хотя во втором случае
 * остаток формально тоже невелик. При равной доле выигрывает та, где меньше
 * делать руками.
 */
export function nextAchievement(
  locked: Achievement[],
  stats: AchievementStats,
): NextAchievement | null {
  let best: NextAchievement | null = null;

  for (const achievement of locked) {
    const progress = achievementProgress(achievement, stats);
    if (!progress) continue;

    if (
      !best ||
      progress.percent > best.progress.percent ||
      (progress.percent === best.progress.percent && progress.remaining < best.progress.remaining)
    ) {
      best = { achievement, progress };
    }
  }

  return best;
}
