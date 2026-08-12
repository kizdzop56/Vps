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
//
// Заголовки задач здесь тоже продублированы, слово в слово. Они нужны ленте
// уведомлений: сообщение «задача дня выполнена» обязано называть задачу ровно
// так же, как карточка цели дня в профиле.
// ─────────────────────────────────────────────────────────────────────────────

export type QuestKind =
  | "words"
  | "newWords"
  | "assignment"
  | "voice"
  | "grammar"
  | "verbForms";

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

/** Русское склонение по числу. Копия клиентской: заголовки должны совпадать. */
function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 14) return forms[2]!;
  const last = abs % 10;
  if (last === 1) return forms[0]!;
  if (last >= 2 && last <= 4) return forms[1]!;
  return forms[2]!;
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

/** Заголовок задачи. Слово в слово как в utils/dailyQuests.ts. */
function questTitle(kind: QuestKind, target: number): string {
  switch (kind) {
    case "words":
      return `Повторить ${target} ${plural(target, ["слово", "слова", "слов"])}`;
    case "newWords":
      return `Выучить ${target} ${plural(target, ["новое слово", "новых слова", "новых слов"])}`;
    case "assignment":
      return target === 1
        ? "Выполнить задание от учителя"
        : `Выполнить ${target} ${plural(target, ["задание", "задания", "заданий"])}`;
    case "voice":
      return "Поговорить с тьютором";
    case "grammar":
      return `Решить ${target} ${plural(target, ["задание", "задания", "заданий"])} по грамматике`;
    case "verbForms":
      return `Повторить формы ${target} ${plural(target, ["глагола", "глаголов", "глаголов"])}`;
  }
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
  /** Ответов в разделе «Учёба» сегодня — любой режим грамматики. */
  grammarToday: number;
  /**
   * РАЗНЫХ глаголов, чьи формы ученик трогал сегодня.
   *
   * Именно разных, а не ответов: в режиме форм на каждый глагол приходится три
   * вопроса, и по ответам задача «повторить формы 5 глаголов» закрывалась бы
   * двумя глаголами.
   */
  verbFormsToday: number;
}

export interface PendingItem {
  kind: QuestKind | "time";
  current: number;
  target: number;
}

/** Пункт дня целиком: и закрытый, и нет. */
export interface PlannedTask {
  kind: QuestKind | "time";
  title: string;
  current: number;
  target: number;
  done: boolean;
}

export interface ServerDailyPlan {
  dateKey: string;
  /** Цель по времени — шапка дня, не задача. */
  time: PlannedTask;
  /** Учебные задачи: от двух до четырёх. */
  quests: PlannedTask[];
  /** Закрыты и время, и все задачи. Только в этом случае положены очки. */
  allDone: boolean;
  /** Награда за день. */
  reward: number;
  /** Что именно не закрыто: молчаливый отказ хуже, чем названная причина. */
  pending: PendingItem[];
}

export interface DailyPlanResult {
  allDone: boolean;
  reward: number;
  pending: PendingItem[];
}

/**
 * Из чего собирается день, кроме повторения слов.
 *
 * Повторение слов стоит в дне ВСЕГДА (без слов остальное бессмысленно), а
 * дальше из этого списка берётся два-три пункта — по дате. Порядок здесь
 * значим: он вместе с датой определяет, что выпадет, и на клиенте список
 * обязан быть таким же.
 *
 * Грамматика и формы глаголов появились здесь позже остальных: раздел «Учёба»
 * вырос, а день о нём не знал, и его можно было закрыть, ни разу туда не
 * заглянув.
 */
const QUEST_POOL: QuestKind[] = ["assignment", "newWords", "voice", "grammar", "verbForms"];

/**
 * День целиком: цель по времени и список задач с отметками о выполнении.
 *
 * Нужен там, где важно не только «всё ли закрыто», но и ЧТО именно закрыто:
 * лента уведомлений сообщает о каждой отдельной задаче.
 */
export function buildServerDailyPlan(input: DailyPlanInput): ServerDailyPlan {
  const seed = seedFromDate(input.dateKey);
  const activeTarget = Math.max(5, input.activeGoalMinutes || 15);
  const tier = goalTier(input.activeGoalMinutes);

  const minutes = Math.max(0, input.todayMinutes);
  const time: PlannedTask = {
    kind: "time",
    title: `Провести в приложении ${activeTarget} ${plural(activeTarget, ["минуту", "минуты", "минут"])}`,
    current: minutes,
    target: activeTarget,
    done: minutes >= activeTarget,
  };

  const baseCount = 2 + (seed % 3);
  const count = Math.min(4, Math.max(2, baseCount + (tier >= 2 ? 1 : 0)));

  const raw: { kind: QuestKind; current: number; target: number }[] = [];

  const wordGoal =
    Math.max(5, input.dailyWordGoal || 10) + (tier >= 1 ? 2 : 0) + (tier >= 3 ? 3 : 0);
  raw.push({ kind: "words", current: input.wordsToday, target: wordGoal });

  const pool = QUEST_POOL;
  const offset = seed % pool.length;

  for (let i = 0; i < pool.length && raw.length < count; i++) {
    const kind = pool[(i + offset) % pool.length]!;

    if (kind === "assignment") {
      raw.push({ kind, current: input.todayCompletions, target: tier >= 2 ? 2 : 1 });
      continue;
    }

    if (kind === "newWords") {
      raw.push({ kind, current: input.learnedToday, target: 2 + tier });
      continue;
    }

    if (kind === "grammar") {
      // Заход в разделе — 12 заданий, поэтому даже на тяжёлой цели это меньше
      // полутора заходов: день не должен упираться в одну грамматику.
      raw.push({ kind, current: input.grammarToday, target: 10 + tier * 2 });
      continue;
    }

    if (kind === "verbForms") {
      raw.push({ kind, current: input.verbFormsToday, target: 3 + tier });
      continue;
    }

    raw.push({ kind, current: input.todayVoiceSessions, target: tier >= 3 ? 2 : 1 });
  }

  const quests: PlannedTask[] = raw.map((t) => ({
    kind: t.kind,
    title: questTitle(t.kind, t.target),
    current: t.current,
    target: t.target,
    done: t.current >= t.target,
  }));

  const pending: PendingItem[] = [];
  if (!time.done) pending.push({ kind: "time", current: time.current, target: time.target });
  for (const q of quests) {
    if (!q.done) pending.push({ kind: q.kind, current: q.current, target: q.target });
  }

  return {
    dateKey: input.dateKey,
    time,
    quests,
    allDone: pending.length === 0,
    reward: pointsForGoal(activeTarget),
    pending,
  };
}

/**
 * Считает, закрыт ли день целиком, и сколько за него причитается.
 *
 * Обёртка над buildServerDailyPlan: выдаче очков список задач не нужен, ей
 * важно только «всё закрыто или нет».
 */
export function evaluateDailyPlan(input: DailyPlanInput): DailyPlanResult {
  const plan = buildServerDailyPlan(input);
  return { allDone: plan.allDone, reward: plan.reward, pending: plan.pending };
}
