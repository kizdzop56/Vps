// ─────────────────────────────────────────────────────────────────────────────
// Задачи дня.
//
// Раньше цель дня была одна: «время в приложении». Её можно закрыть, просто не
// закрывая вкладку, поэтому она ничего не требовала и ничему не учила.
//
// Теперь у дня два слоя:
//   • ВРЕМЯ — заголовок карточки и кольцо прогресса. Это по-прежнему главное
//     число дня («2 из 15 минут»), но уже не единственная задача.
//   • ЗАДАЧИ — чек-лист из 2–4 пунктов разного плана: зайти в приложение,
//     выполнить задание, повторить слова, поговорить с тьютором.
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
export type QuestKind = "login" | "assignment" | "words" | "voice";

export interface Quest {
  kind: QuestKind;
  /** Текст задачи: «Выполнить задание». */
  title: string;
  /** Сделано. */
  current: number;
  /** Нужно сделать. */
  target: number;
  /** Задача закрыта. */
  done: boolean;
  /** Очки за выполнение. */
  points: number;
  /**
   * Подпись справа: «0 / 10». У выполненных и у задач без счёта пустая —
   * галочки и зачёркнутого текста достаточно, цифра рядом только шумит.
   */
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
  /** Слов пройдено сегодня. */
  wordsToday: number;
  /** Личная цель по словам. */
  dailyWordGoal: number;
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
  const shown = Math.min(current, target);
  const counter = done ? "" : `${shown} / ${target}`;

  switch (kind) {
    // Единственная задача, которая закрывается сама фактом захода. Она стоит
    // первой намеренно: список, в котором уже есть галочка, ребёнок дочитывает
    // до конца, а пустой чек-лист выглядит как список долгов.
    case "login":
      return { kind, target, current, done, points: 10, title: "Зайти в приложение", counter: "" };
    case "assignment":
      return {
        kind, target, current, done, points: 30, counter,
        title: target === 1
          ? "Выполнить задание"
          : `Выполнить ${target} ${plural(target, ["задание", "задания", "заданий"])}`,
      };
    case "words":
      return { kind, target, current, done, points: 25, counter, title: "Повторить слова" };
    case "voice":
      return { kind, target, current, done, points: 35, counter, title: "Поговорить с тьютором" };
  }
}

/**
 * План на сегодня: цель по времени и от двух до четырёх задач.
 *
 * Первая задача всегда «Зайти в приложение», остальные добираются из пула по
 * дате. Порядок перебора сдвигается по дате, поэтому в разные дни выпадают
 * разные типы, но внутри одного дня список неизменен.
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
    points: 20,
  };

  // ── Задачи: 2, 3 или 4 ──
  const count = 2 + (seed % 3);
  const quests: Quest[] = [buildQuest("login", 1, 1)];

  const pool: QuestKind[] = ["assignment", "words", "voice"];
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

    if (kind === "words") {
      // Опираемся на личную цель из настроек карточек: у новичка она меньше.
      quests.push(buildQuest("words", Math.max(5, input.dailyWordGoal || 10), input.wordsToday));
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
