// ─────────────────────────────────────────────────────────────────────────────
// Медали за рейды. Часть общего каталога наград (constants/achievements.ts).
//
// ── Почему отдельным файлом ─────────────────────────────────────────────────
// Каталог наград и без того на восемьсот строк, и каждая новая тема раздувала
// бы его дальше. Здесь тема одна — событие рейда, — и держать её рядом легче:
// пороги, тексты и ключи боссов правятся в одном месте.
//
// Медали ВОЗВРАЩАЮТСЯ в общий массив ACHIEVEMENTS. Это принципиально: витрина
// в профиле должна быть одна. Раньше у рейда был свой блок медалей во вкладке
// события, и коллекция ученика делилась надвое — общий счётчик «14 из 50»
// перестал быть общим, а оформление рейдовых медалей жило второй реализацией и
// разъезжалось с первой на каждой правке.
//
// ── Медали за боссов ────────────────────────────────────────────────────────
// Пять медалей, по одной на каждого босса. Условие простое и общее: ученик бил
// этого босса в ту неделю, которая закончилась ПОБЕДОЙ сообщества. Не «нанёс
// столько-то урона», а именно участвовал в победе: рейд — событие общее, и
// медаль за него тоже общая.
//
// Ключи боссов (golem, dragon, phantom, elemental, titan) обязаны совпадать с
// BOSSES в api-server/src/lib/raid.ts. Расхождение выглядело бы как «босса
// добили, а медаль не пришла».
//
// ── id и прогресс ───────────────────────────────────────────────────────────
// У числовых медалей id по общей схеме `метрика_число`: из него
// utils/achievementProgress.ts достаёт порог и рисует полосу. У медалей за
// боссов порога нет (это факт, а не счётчик), поэтому их id заканчивается
// ключом босса — полоса для них просто не рисуется, и это правильно: «0,5
// босса» не бывает.
//
// Условия продублированы на сервере (api-server/src/routes/gamification.ts,
// ACHIEVEMENT_CONDITIONS): клиент показывает медаль, сервер решает, записать ли
// её в базу.
// ─────────────────────────────────────────────────────────────────────────────

import type { Achievement, AchievementStats } from "./achievements";

/** Показатели рейда. Приходят с сервера в /gamification/stats. */
export interface RaidAchievementFields {
  /** Урон по всем боссам за всё время. */
  raidDamage?: number;
  /** Ударов, дошедших до босса. */
  raidHits?: number;
  /** Критических ударов мощной атакой. */
  raidCrits?: number;
  /** Лучшее комбо за всю историю. */
  raidBestCombo?: number;
  /** Рейдов, закончившихся победой. */
  raidWins?: number;
  /** Сколько раз добивающий удар был его. */
  raidLastHits?: number;
  /** Ключи боссов, которых он помогал добить. */
  raidBosses?: string[];
}

/** Проверка «этого босса я добивал». */
function beaten(stats: AchievementStats, boss: string): boolean {
  return Array.isArray(stats.raidBosses) && stats.raidBosses.includes(boss);
}

/**
 * Медаль за босса. Все пять устроены одинаково, поэтому собираются функцией:
 * пять почти одинаковых объектов подряд читаются хуже, чем таблица данных.
 */
function bossMedal(opts: {
  boss: string;
  emoji: string;
  title: string;
  bossName: string;
  about: string;
  difficulty: Achievement["difficulty"];
  color: string;
  bgColor: string;
}): Achievement {
  return {
    id: `raidboss_${opts.boss}`,
    emoji: opts.emoji,
    title: opts.title,
    description: `${opts.bossName} повержен, и ты был среди тех, кто его добил. ${opts.about}`,
    requirement: `Бей ${opts.bossName}а в его неделю и дождись, пока сообщество снимет ему всё здоровье.`,
    difficulty: opts.difficulty,
    color: opts.color,
    bgColor: opts.bgColor,
    check: (stats) => beaten(stats, opts.boss),
  };
}

/**
 * Десять медалей: пять за боссов и пять за сам ход события.
 *
 * Пороги от реального темпа: один заход боя это 300–500 урона, неделя занятий —
 * несколько тысяч. Первая медаль берётся в первый же вечер, «Все пятеро» — за
 * несколько месяцев участия, потому что боссы идут по кругу и титан приходит
 * каждую восьмую неделю.
 */
export const RAID_ACHIEVEMENTS: Achievement[] = [
  // ── Лёгкие ──
  {
    id: "raidhits_1",
    emoji: "🔥",
    title: "Первый удар",
    description: "Ты ударил рейд-босса. Теперь ты в событии, и твой урон идёт в общий счёт.",
    requirement: "Ответь верно хотя бы раз в бою рейда — вкладка «Рейд», кнопка «Бить босса».",
    difficulty: "easy",
    color: "#f59e0b",
    bgColor: "#fef3c7",
    check: (stats) => (stats.raidHits ?? 0) >= 1,
  },
  bossMedal({
    boss: "golem",
    emoji: "🗿",
    title: "Голем расколот",
    bossName: "Грамматический Голем",
    about: "Каменная кладка правил не выдержала времён и предлогов.",
    difficulty: "easy",
    color: "#4338ca",
    bgColor: "#e0e7ff",
  }),
  bossMedal({
    boss: "dragon",
    emoji: "🐲",
    title: "Дракон повержен",
    bossName: "Лексический Дракон",
    about: "Он копил слова, как золото, — и проиграл словарному запасу.",
    difficulty: "easy",
    color: "#6d28d9",
    bgColor: "#ede9fe",
  }),

  // ── Средние ──
  bossMedal({
    boss: "phantom",
    emoji: "👻",
    title: "Фантом рассеян",
    bossName: "Фонетический Фантом",
    about: "Его почти не видно, но он выдал себя на слух.",
    difficulty: "medium",
    color: "#0e7490",
    bgColor: "#cffafe",
  }),
  bossMedal({
    boss: "elemental",
    emoji: "🧩",
    title: "Элементаль разобран",
    bossName: "Идиоматический Элементаль",
    about: "Он собран из выражений, которые нельзя перевести дословно. Ты и не переводил.",
    difficulty: "medium",
    color: "#be185d",
    bgColor: "#fce7f3",
  }),
  {
    id: "raiddamage_10000",
    emoji: "💥",
    title: "Десять тысяч урона",
    description: "10 000 урона по боссам суммарно. Это уже вклад, который видно на общей шкале.",
    requirement: "Нанеси 10 000 урона по рейд-боссам за всё время.",
    difficulty: "medium",
    color: "#d946ef",
    bgColor: "#fae8ff",
    check: (stats) => (stats.raidDamage ?? 0) >= 10000,
  },
  {
    id: "raidcombo_10",
    emoji: "⚡",
    title: "Серия из десяти",
    description: "Десять верных ответов подряд в бою: на такой серии комбо удваивает урон.",
    requirement: "Ответь верно 10 раз подряд, не прерывая серию, в бою рейда.",
    difficulty: "medium",
    color: "#8b5cf6",
    bgColor: "#ede9fe",
    check: (stats) => (stats.raidBestCombo ?? 0) >= 10,
  },

  // ── Сложные ──
  bossMedal({
    boss: "titan",
    emoji: "🛡️",
    title: "Титан сломлен",
    bossName: "Экзаменационный Титан",
    about: "Сезонный босс, уязвимый ко всему сразу и живучий как контрольная.",
    difficulty: "hard",
    color: "#b45309",
    bgColor: "#fef3c7",
  }),
  {
    id: "raidlast_1",
    emoji: "🏆",
    title: "Последний герой",
    description: "Добивающий удар по боссу был твоим. Такое случается один раз за неделю на всё сообщество.",
    requirement: "Нанеси удар, который снимет боссу последние очки здоровья.",
    difficulty: "hard",
    color: "#fbbf24",
    bgColor: "#fef3c7",
    check: (stats) => (stats.raidLastHits ?? 0) >= 1,
  },
  {
    id: "raidbosses_5",
    emoji: "👑",
    title: "Все пятеро",
    description: "Голем, Дракон, Фантом, Элементаль и Титан — ты помог добить каждого. Полный набор.",
    requirement: "Поучаствуй в победе над всеми пятью рейд-боссами. Они идут по кругу, титан — каждую восьмую неделю.",
    difficulty: "hard",
    color: "#a21caf",
    bgColor: "#f5d0fe",
    check: (stats) => (stats.raidBosses?.length ?? 0) >= 5,
  },
];

export default RAID_ACHIEVEMENTS;
