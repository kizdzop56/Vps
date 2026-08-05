// ─────────────────────────────────────────────────────────────────────────────
// Задачи дня.
//
// Раньше цель дня была одна: «время в приложении». Её можно закрыть, просто не
// закрывая вкладку, поэтому она ничего не требовала и ничему не учила.
//
// Теперь у дня два слоя:
//   • ВРЕМЯ — заголовок карточки и кольцо прогресса. Главное число дня
//     («5 из 20 минут»), но уже не единственная задача.
//   • ЗАДАЧИ — чек-лист из 2–4 пунктов. ВСЕ задачи требуют реальной учёбы:
//     повторить слова, выучить новые, сдать задание, поговорить с тьютором.
//     Пунктов вроде «зайти в приложение» здесь намеренно нет: галочка за вход
//     в приложение поощряет открыть вкладку, а не заниматься.
//
// Набор задач НЕ случайный в привычном смысле: он детерминированно выводится из
// даты. Это важно по трём причинам:
//   1. Задачи не должны меняться при каждом обновлении экрана — иначе ученик
//      выполнит одну, вернётся и увидит другую.
//   2. Не нужна отдельная таблица в базе и запрос за ней: одна и та же дата
//      всегда даёт один и тот же набор.
//   3. День ото дня набор всё-таки меняется, иначе «цель дня» превратится в
//      постоянный список.
//
// Прогресс берётся из уже загруженных счётчиков (см. GET /gamification/stats и
// GET /flashcards/stats) — новых запросов эта логика не добавляет.
// ─────────────────────────────────────────────────────────────────────────────

/** Что именно требует задача. Время сюда не входит — оно в шапке карточки. */
export type QuestKind = "words" | "newWords" | "assignment" | "voice";

export interface Quest {
  kind: QuestKind;
  /** Текст задачи: «Повторить слова». */
  title: string;
  /** Сделано. */
  current: number;
  /** Нужно сделать. */
  target: number;
  /** Задача закрыта. */
  done: boolean;
  /** Очки за выполнение. */
  points: number;
  /** Подпись справа: «0 / 10». У выполненных пустая — галочки достаточно. */
  counter: string;
}

/** Цель по времени: шапка карточки и кольцо. */
export interface TimeGoal {
  /** Минут сегодня. */
  current: number;
  /** Цель, которая действует СЕГОДНЯ. */
  target: number;
  /** Цель, выбранная на ЗАВТРА. Может совпадать с сегодняшней. */
  nextTarget: number;
  /** Сколько осталось. */
  remaining: number;
  /** Заполненность кольца, 0–100. */
  percent: number;
  done: boolean;
  /** Очки именно за сегодняшнюю цель. */
  points: number;
  /** Очки за цель, выбранную на завтра. */
  nextPoints: number;
}

export interface DailyPlan {
  time: TimeGoal;
  quests: Quest[];
  /** Сколько задач закрыто (без учёта времени). */
  doneCount: number;
  /** Все задачи дня и время закрыты. */
  allDone: boolean;
  /** Очки за весь день: сегодняшняя цель по времени + все задачи. */
  totalPoints: number;
}

/** Данные, из которых собирается день. */
export interface QuestInput {
  /** Минут в приложении сегодня. */
  todayMinutes: number;
  /** Цель, которая действует сегодня. */
  activeGoalMinutes: number;
  /** Цель, выбранная пользователем на следующий день. */
  selectedGoalMinutes: number;
  /** Сдано заданий сегодня. */
  todayCompletions: number;
  /** Разговоров с тьютором сегодня. */
  todayVoiceSessions: number;
  /** Слов повторено сегодня. */
  wordsToday: number;
  /** Слов доведено до «выучено» сегодня. */
  learnedToday: number;
  /** Личная цель по словам. */
  dailyWordGoal: number;
}

/**
 * Очки за цель по времени.
 *
 * Раньше за любую цель давали одинаково — и выбрать 10 минут было выгоднее:
 * та же награда за втрое меньшую работу. Теперь награда растёт быстрее самой
 * цели (30 минут вдвое дольше 15, но приносит в 2.4 раза больше), чтобы
 * тянуться к длинному занятию имело смысл.
 */
export const GOAL_POINTS: Record<number, number> = {
  10: 15,
  15: 25,
  20: 40,
  30: 60,
};

/** Очки за произвольную цель: для значений вне таблицы считаем пропорцией. */
export function pointsForGoal(minutes: number): number {
  const exact = GOAL_POINTS[minutes];
  if (exact) return exact;
  return Math.max(10, Math.round((minutes / 15) * 25));
}

/** Русское склонение по числу. */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 14) return forms[2];
  const last = abs % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/**
 * Стабильное число из строки даты.
 *
 * Обычный Math.random() не годится: он даёт новый набор на каждый ре-рендер.
 * Здесь простая хеш-функция (вариация djb2) — одна дата всегда даёт одно число,
 * и никакого состояния хранить не нужно.
 */
function seedFromDate(dateKey: string): number {
  let h = 5381;
  for (let i = 0; i < dateKey.length; i++) {
    h = ((h << 5) + h + dateKey.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Ключ дня в местном времени. UTC не годится: сутки сдвинулись бы на 3 часа. */
export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Описание задачи по типу. Цель подставляется снаружи. */
function buildQuest(kind: QuestKind, target: number, current: number, points: number): Quest {
  const done = current >= target;
  const counter = done ? "" : `${Math.min(current, target)} / ${target}`;

  switch (kind) {
    case "words":
      return {
        kind, target, current, done, counter, points,
        title: `Повторить ${target} ${plural(target, ["слово", "слова", "слов"])}`,
      };
    case "newWords":
      return {
        kind, target, current, done, counter, points,
        title: `Выучить ${target} ${plural(target, ["новое слово", "новых слова", "новых слов"])}`,
      };
    case "assignment":
      return {
        kind, target, current, done, counter, points,
        title: target === 1
          ? "Выполнить задание от учителя"
          : `Выполнить ${target} ${plural(target, ["задание", "задания", "заданий"])}`,
      };
    case "voice":
      return { kind, target, current, done, counter, points, title: "Поговорить с тьютором" };
  }
}

/**
 * Коэффициент сложности дня от цели по времени.
 *
 * Важно: чем тяжелее цель, тем БОЛЬШЕ не только очков, но и самой работы.
 * Иначе 30 минут превращаются в тот же набор задач, только с другой цифрой
 * сверху, а пользователь справедливо чувствует, что приложение его обманывает.
 */
function goalTier(minutes: number): 0 | 1 | 2 | 3 {
  if (minutes >= 30) return 3;
  if (minutes >= 20) return 2;
  if (minutes >= 15) return 1;
  return 0;
}

/**
 * План на сегодня: сегодняшняя цель по времени и от двух до четырёх учебных
 * задач. Сложность задач растёт вместе с активной целью по времени.
 */
export function buildDailyPlan(input: QuestInput, dateKey = todayKey()): DailyPlan {
  const seed = seedFromDate(dateKey);
  const tier = goalTier(input.activeGoalMinutes);

  // ── Время ──
  const activeTarget = Math.max(5, input.activeGoalMinutes || 15);
  const selectedTarget = Math.max(5, input.selectedGoalMinutes || activeTarget);
  const current = Math.max(0, input.todayMinutes);
  const time: TimeGoal = {
    current,
    target: activeTarget,
    nextTarget: selectedTarget,
    remaining: Math.max(0, activeTarget - current),
    percent: Math.min(100, Math.round((current / activeTarget) * 100)),
    done: current >= activeTarget,
    points: pointsForGoal(activeTarget),
    nextPoints: pointsForGoal(selectedTarget),
  };

  // ── Задачи: 2, 3 или 4. Базовое число зависит и от даты, и от тяжести цели ──
  const baseCount = 2 + (seed % 3);
  const count = Math.min(4, Math.max(2, baseCount + (tier >= 2 ? 1 : 0)));

  const quests: Quest[] = [];

  // Повторение слов есть всегда и растёт вместе с целью по времени.
  const wordGoal = Math.max(5, input.dailyWordGoal || 10) + (tier >= 1 ? 2 : 0) + (tier >= 3 ? 3 : 0);
  quests.push(buildQuest("words", wordGoal, input.wordsToday, 25 + tier * 5));

  const pool: QuestKind[] = ["assignment", "newWords", "voice"];
  const offset = seed % pool.length;

  for (let i = 0; i < pool.length && quests.length < count; i++) {
    const kind = pool[(i + offset) % pool.length]!;

    if (kind === "assignment") {
      // Чем тяжелее цель по времени, тем выше шанс получить 2 задания.
      const n = tier >= 2 ? 2 : 1;
      quests.push(buildQuest("assignment", n, input.todayCompletions, 35 + tier * 5));
      continue;
    }

    if (kind === "newWords") {
      // Новые слова даются тяжелее повторения, поэтому их всего 2–5 за день.
      const n = 2 + tier;
      quests.push(buildQuest("newWords", n, input.learnedToday, 30 + tier * 5));
      continue;
    }

    // Разговор с тьютором на сложных целях может стать двумя разговорами.
    const n = tier >= 3 ? 2 : 1;
    quests.push(buildQuest("voice", n, input.todayVoiceSessions, 40 + tier * 5));
  }

  const doneCount = quests.filter((q) => q.done).length;

  return {
    time,
    quests,
    doneCount,
    allDone: time.done && doneCount === quests.length,
    totalPoints: time.points + quests.reduce((sum, q) => sum + q.points, 0),
  };
}
