// ─────────────────────────────────────────────────────────────────────────────
// Задачи дня.
//
// Раньше цель дня была одна: «время в приложении». Её можно закрыть, просто не
// закрывая вкладку, поэтому она ничего не требовала и ничему не учила. Здесь
// цель собирается из 2–4 разных задач: время, задание, слова, разговор.
//
// Набор задач НЕ случайный в привычном смысле: он детерминированно выводится из
// даты. Это важно по трём причинам:
//   1. Задачи не должны меняться при каждом обновлении экрана — иначе ученик
//      выполнит одну, вернётся и увидит другую.
//   2. Не нужна отдельная таблица в базе и запрос за ней: одна и та же дата у
//      клиента и у сервера даёт один и тот же набор.
//   3. День ото дня набор всё-таки меняется, иначе «цель дня» превратится в
//      постоянный список.
//
// Прогресс берётся из уже загруженных счётчиков (см. GET /gamification/stats и
// GET /flashcards/stats) — новых запросов эта логика не добавляет.
// ─────────────────────────────────────────────────────────────────────────────

import type { GlyphName } from "@/components/ui/Glyph";

/** Что именно требует задача. */
export type QuestKind = "time" | "assignment" | "words" | "voice";

export interface Quest {
  kind: QuestKind;
  /** Текст задачи: «Позаниматься 15 минут». */
  title: string;
  /** Сделано. */
  current: number;
  /** Нужно сделать. */
  target: number;
  /** Задача закрыта. */
  done: boolean;
  /** Очки за выполнение. */
  points: number;
  icon: GlyphName;
  /** Цвет задачи на оси бренда. */
  color: string;
  /** Короткая подпись справа: «12 / 15 мин». */
  counter: string;
}

/** Данные, из которых собираются задачи. */
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
function plural(n: number, forms: [string, string, string]): string {
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

  switch (kind) {
    case "time":
      return {
        kind, target, current, done, points: 20,
        title: `Позаниматься ${target} ${plural(target, ["минуту", "минуты", "минут"])}`,
        counter: `${shown} / ${target} мин`,
        icon: "clock", color: "#6366f1",
      };
    case "assignment":
      return {
        kind, target, current, done, points: 30,
        title: target === 1
          ? "Выполнить задание"
          : `Выполнить ${target} ${plural(target, ["задание", "задания", "заданий"])}`,
        counter: `${shown} / ${target}`,
        icon: "check", color: "#8b5cf6",
      };
    case "words":
      return {
        kind, target, current, done, points: 25,
        title: `Повторить ${target} ${plural(target, ["слово", "слова", "слов"])}`,
        counter: `${shown} / ${target}`,
        icon: "cards", color: "#d946ef",
      };
    case "voice":
      return {
        kind, target, current, done, points: 35,
        title: target === 1
          ? "Поговорить с тьютором"
          : `${target} ${plural(target, ["разговор", "разговора", "разговоров"])} с тьютором`,
        counter: `${shown} / ${target}`,
        icon: "mic", color: "#ec4899",
      };
  }
}

/**
 * Задачи на сегодня: от двух до четырёх.
 *
 * «Время» есть всегда — это единственная задача, которую ученик закрывает
 * самим фактом занятия, и она задаёт нижнюю планку дня. Остальные добираются
 * из пула по дате.
 *
 * Порядок в наборе тоже зависит от даты, но «время» остаётся первым: список
 * не должен перетасовываться между заходами в один и тот же день.
 */
export function buildDailyQuests(input: QuestInput, dateKey = todayKey()): Quest[] {
  const seed = seedFromDate(dateKey);

  // Сколько задач сегодня: 2, 3 или 4.
  const count = 2 + (seed % 3);

  const quests: Quest[] = [
    buildQuest("time", Math.max(5, input.dailyGoalMinutes), input.todayMinutes),
  ];

  // Пул дополнительных задач. Порядок перебора сдвигается по дате, поэтому в
  // разные дни добираются разные типы.
  const pool: QuestKind[] = ["assignment", "words", "voice"];
  const offset = seed % pool.length;

  for (let i = 0; i < pool.length && quests.length < count; i++) {
    const kind = pool[(i + offset) % pool.length]!;

    if (kind === "assignment") {
      // Два задания в день — уже много для ребёнка, поэтому не больше двух и
      // только когда день «тяжёлый» (четыре задачи).
      const target = count >= 4 && seed % 2 === 0 ? 2 : 1;
      quests.push(buildQuest("assignment", target, input.todayCompletions));
      continue;
    }

    if (kind === "words") {
      // Опираемся на личную цель из настроек карточек: у новичка она меньше.
      const base = Math.max(5, input.dailyWordGoal || 10);
      quests.push(buildQuest("words", base, input.wordsToday));
      continue;
    }

    quests.push(buildQuest("voice", 1, input.todayVoiceSessions));
  }

  return quests;
}

/** Свод по дню: сколько закрыто, сколько очков светит. */
export function questSummary(quests: Quest[]) {
  const done = quests.filter((q) => q.done).length;
  const totalPoints = quests.reduce((sum, q) => sum + q.points, 0);
  const earnedPoints = quests.filter((q) => q.done).reduce((sum, q) => sum + q.points, 0);

  // Общий процент считаем по долям задач, а не по сумме «сделано/нужно»:
  // иначе задача с целью 15 минут перевешивала бы задачу с целью 1 разговор.
  const ratio = quests.length === 0
    ? 0
    : quests.reduce((sum, q) => sum + Math.min(1, q.target > 0 ? q.current / q.target : 0), 0) / quests.length;

  return {
    done,
    total: quests.length,
    allDone: quests.length > 0 && done === quests.length,
    percent: Math.round(ratio * 100),
    totalPoints,
    earnedPoints,
  };
}
