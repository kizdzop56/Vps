// ─────────────────────────────────────────────────────────────────────────────
// Задачи дня.
//
// Раньше цель дня была одна: «время в приложении». Её можно закрыть, просто не
// закрывая вкладку, поэтому она ничего не требовала и ничему не учила.
//
// Теперь у дня два слоя:
//   • ВРЕМЯ — заголовок карточки и кольцо прогресса. Главное число дня
//     («3 из 15 минут»), но уже не единственная задача.
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
  /** Личная цель по минутам. */
  target: number;
  /** Сколько осталось. */
  remaining: number;
  /** Заполненность кольца, 0–100. */
  percent: number;
  done: boolean;
  /** Очки за закрытую цель по времени. Зависят от самой цели. */
  points: number;
}

export interface DailyPlan {
  time: TimeGoal;
  quests: Quest[];
  /** Сколько задач закрыто (без учёта времени). */
  doneCount: number;
  /** Все задачи дня и время закрыты. */
  allDone: boolean;
  /** Очки за весь день: время + все задачи. */
  totalPoints: number;
}

/** Данные, из которых собирается день. */
export interface QuestInput {
  /** Минут в приложении сегодня. */
  todayMinutes: number;
  /** Личная цель по минутам (10/15/20/30). */
  dailyGoalMinutes: number;
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
 *
 * Значения ключей совпадают с вариантами в окне настройки и с валидацией на
 * сервере (PATCH /gamification/daily-goal).
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
function buildQuest(kind: QuestKind, target: number, current: number): Quest {
  const done = current >= target;
  const counter = done ? "" : `${Math.min(current, target)} / ${target}`;

  switch (kind) {
    case "words":
      return {
        kind, target, current, done, counter, points: 25,
        title: `Повторить ${target} ${plural(target, ["слово", "слова", "слов"])}`,
      };
    case "newWords":
      return {
        kind, target, current, done, counter, points: 30,
        title: `Выучить ${target} ${plural(target, ["новое слово", "новых слова", "новых слов"])}`,
      };
    case "assignment":
      return {
        kind, target, current, done, counter, points: 35,
        title: target === 1
          ? "Выполнить задание от учителя"
          : `Выполнить ${target} ${plural(target, ["задание", "задания", "заданий"])}`,
      };
    case "voice":
      return {
        kind, target, current, done, counter, points: 40,
        title: "Поговорить с тьютором",
      };
  }
}

/**
 * План на сегодня: цель по времени и от двух до четырёх учебных задач.
 *
 * «Повторить слова» есть всегда: это то, что ученик может сделать в любой день
 * без учителя и без интернета сверх приложения. Остальные добираются из пула,
 * порядок перебора сдвигается по дате — в разные дни выпадают разные типы, но
 * внутри одного дня список неизменен.
 */
export function buildDailyPlan(input: QuestInput, dateKey = todayKey()): DailyPlan {
  const seed = seedFromDate(dateKey);

  // ── Время ──
  const target = Math.max(5, input.dailyGoalMinutes || 15);
  const current = Math.max(0, input.todayMinutes);
  const time: TimeGoal = {
    current,
    target,
    remaining: Math.max(0, target - current),
    percent: Math.min(100, Math.round((current / target) * 100)),
    done: current >= target,
    points: pointsForGoal(target),
  };

  // ── Задачи: 2, 3 или 4 ──
  const count = 2 + (seed % 3);
  const wordGoal = Math.max(5, input.dailyWordGoal || 10);
  const quests: Quest[] = [buildQuest("words", wordGoal, input.wordsToday)];

  const pool: QuestKind[] = ["assignment", "newWords", "voice"];
  const offset = seed % pool.length;

  for (let i = 0; i < pool.length && quests.length < count; i++) {
    const kind = pool[(i + offset) % pool.length]!;

    if (kind === "assignment") {
      // Два задания в день — уже много для ребёнка, поэтому не больше двух и
      // только когда день «тяжёлый» (четыре задачи).
      const n = count >= 4 && seed % 2 === 0 ? 2 : 1;
      quests.push(buildQuest("assignment", n, input.todayCompletions));
      continue;
    }

    if (kind === "newWords") {
      // Новые слова даются тяжелее повторения, поэтому их всего 2–3 за день.
      const n = 2 + (seed % 2);
      quests.push(buildQuest("newWords", n, input.learnedToday));
      continue;
    }

    quests.push(buildQuest("voice", 1, input.todayVoiceSessions));
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
