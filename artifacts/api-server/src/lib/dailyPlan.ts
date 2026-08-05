// ─────────────────────────────────────────────────────────────────────────────
// Цель дня: серверный расчёт.
//
// ЗЕРКАЛО клиентского файла english-learning/utils/dailyQuests.ts. Логика
// продублирована сознательно: клиент рисует день, сервер выдаёт за него очки и
// обязан проверить выполнение сам. Доверять клиенту нельзя — иначе награда
// начисляется одним поддельным запросом.
//
// Расчёт детерминированный: набор задач выводится из даты (djb2), поэтому при
// одинаковых входных счётчиках обе стороны получают один и тот же день.
//
// ПРИ ЛЮБОЙ ПРАВКЕ МЕНЯТЬ ОБА ФАЙЛА. Расхождение выглядит для ученика как
// «день закрыт, а очки не пришли».
// ─────────────────────────────────────────────────────────────────────────────

export type QuestKind = "words" | "newWords" | "assignment" | "voice";

/** Очки за полностью закрытый день. Зависят от активной цели по времени. */
export const GOAL_POINTS: Record<number, number> = {
  10: 15,
  15: 25,
  20: 40,
  30: 60,
};

export function pointsForGoal(minutes: number): number {
  const exact = GOAL_POINTS[minutes];
  if (exact) return exact;
  return Math.max(10, Math.round((minutes / 15) * 25));
}

/** Вариация djb2: одна дата — одно число, без состояния и без random. */
function seedFromDate(dateKey: string): number {
  let h = 5381;
  for (let i = 0; i < dateKey.length; i++) {
    h = ((h << 5) + h + dateKey.charCodeAt(i)) >>> 0;
  }
  return h;
}

function goalTier(minutes: number): 0 | 1 | 2 | 3 {
  if (minutes >= 30) return 3;
  if (minutes >= 20) return 2;
  if (minutes >= 15) return 1;
  return 0;
}

export interface DailyPlanInput {
  /** Ключ дня «YYYY-MM-DD» в часовом поясе приложения. */
  dateKey: string;
  /** Минут в приложении сегодня. */
  todayMinutes: number;
  /** Цель по времени, действующая сегодня. */
  activeGoalMinutes: number;
  /** Сдано заданий сегодня. */
  todayCompletions: number;
  /** Состоявшихся разговоров с тьютором сегодня. */
  todayVoiceSessions: number;
  /** Разных слов повторено сегодня. */
  wordsToday: number;
  /** Слов доведено до «выучено» сегодня. */
  learnedToday: number;
  /** Личная цель по словам (flashcard_settings.daily_word_goal). */
  dailyWordGoal: number;
}

export interface PendingItem {
  kind: QuestKind | "time";
  current: number;
  target: number;
}

export interface DailyPlanResult {
  /** Закрыты и время, и все задачи. Только в этом случае положены очки. */
  allDone: boolean;
  /** Награда за день. */
  reward: number;
  /** Что именно не закрыто: молчаливый отказ хуже, чем названная причина. */
  pending: PendingItem[];
}

/**
 * Считает, закрыт ли день целиком, и сколько за него причитается.
 */
export function evaluateDailyPlan(input: DailyPlanInput): DailyPlanResult {
  const seed = seedFromDate(input.dateKey);
  const activeTarget = Math.max(5, input.activeGoalMinutes || 15);
  const tier = goalTier(input.activeGoalMinutes);

  const pending: PendingItem[] = [];

  const minutes = Math.max(0, input.todayMinutes);
  if (minutes < activeTarget) {
    pending.push({ kind: "time", current: minutes, target: activeTarget });
  }

  const baseCount = 2 + (seed % 3);
  const count = Math.min(4, Math.max(2, baseCount + (tier >= 2 ? 1 : 0)));

  const targets: { kind: QuestKind; current: number; target: number }[] = [];

  const wordGoal =
    Math.max(5, input.dailyWordGoal || 10) + (tier >= 1 ? 2 : 0) + (tier >= 3 ? 3 : 0);
  targets.push({ kind: "words", current: input.wordsToday, target: wordGoal });

  const pool: QuestKind[] = ["assignment", "newWords", "voice"];
  const offset = seed % pool.length;

  for (let i = 0; i < pool.length && targets.length < count; i++) {
    const kind = pool[(i + offset) % pool.length]!;

    if (kind === "assignment") {
      targets.push({ kind, current: input.todayCompletions, target: tier >= 2 ? 2 : 1 });
      continue;
    }

    if (kind === "newWords") {
      targets.push({ kind, current: input.learnedToday, target: 2 + tier });
      continue;
    }

    targets.push({ kind, current: input.todayVoiceSessions, target: tier >= 3 ? 2 : 1 });
  }

  for (const t of targets) {
    if (t.current < t.target) pending.push(t);
  }

  return {
    allDone: pending.length === 0,
    reward: pointsForGoal(activeTarget),
    pending,
  };
}
