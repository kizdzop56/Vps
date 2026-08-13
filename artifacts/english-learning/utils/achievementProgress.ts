// ─────────────────────────────────────────────────────────────────────────────
// Прогресс до медали.
//
// В constants/achievements.ts у награды есть только предикат check(): он
// отвечает «получена или нет», но не говорит, сколько осталось. Ученик видел
// пунктирный кружок с замком и текст «Выполни 25 заданий» — а сколько у него
// сейчас и много ли осталось, приходилось считать в уме.
//
// Порог достаём из самого id: все награды названы по схеме `метрика_число`
// (tasks_25, points_500, streak_7, time_600, xp_20, grammar_100, raiddamage_10000
// …), и это число ровно то, с которым сравнивает check(). Так мы не дублируем
// данные и не рискуем разойтись: файл наград не меняется вообще.
//
// Награды без прогресса: welcome (check: () => true) и медали за конкретных
// боссов рейда (raidboss_golem и остальные). У них нет ни метрики, ни порога —
// это факт, а не счётчик, и «половина босса» бессмысленна.
//
// ── Метрики, которых может не быть ──────────────────────────────────────────
// Показатели раздела «Учёба» и рейда отдаются только на своём профиле: чужому
// ученику сервер их не считает. Поэтому метрика умеет отвечать undefined, и
// тогда полоса прогресса не рисуется вовсе. Показать «0 из 100» там, где данных
// просто нет, — значит соврать в обе стороны сразу.
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
  /** Текущее значение показателя у ученика. undefined — показателя нет. */
  value: (s: AchievementStats) => number | undefined;
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

  // ── Раздел «Учёба» ──
  grammar: {
    value: (s) => s.grammarSolved,
    remaining: (n) => `Осталось ${n} ${plural(n, ["верный ответ", "верных ответа", "верных ответов"])}`,
    unit: (n) => plural(n, ["верный", "верных", "верных"]),
  },
  forms: {
    value: (s) => s.verbFormsMastered,
    remaining: (n) => `Осталось ${n} ${plural(n, ["глагол", "глагола", "глаголов"])}`,
    unit: (n) => plural(n, ["глагол", "глагола", "глаголов"]),
  },
  phrases: {
    value: (s) => s.sentencesBuilt,
    remaining: (n) => `Осталось ${n} ${plural(n, ["предложение", "предложения", "предложений"])}`,
    unit: (n) => plural(n, ["предложение", "предложения", "предложений"]),
  },
  tenses: {
    value: (s) => s.tensesMastered,
    remaining: (n) => `Осталось ${n} ${plural(n, ["время", "времени", "времён"])}`,
    unit: (n) => plural(n, ["время", "времени", "времён"]),
  },

  // ── Рейд ──
  // Префиксы длиннее обычных (raiddamage вместо damage) намеренно: короткие
  // имена столкнулись бы с метриками учёбы, а id медали должен читаться сам по
  // себе — по нему понятно, что это событие, а не тренажёр.
  raidhits: {
    value: (s) => s.raidHits,
    remaining: (n) => `Осталось ${n} ${plural(n, ["удар", "удара", "ударов"])}`,
    unit: (n) => plural(n, ["удар", "удара", "ударов"]),
  },
  raiddamage: {
    value: (s) => s.raidDamage,
    remaining: (n) => `Осталось ${n.toLocaleString("ru-RU")} урона`,
    unit: () => "урона",
  },
  raidcombo: {
    // Комбо не накапливается, а обнуляется на ошибке: считается лучшая серия.
    value: (s) => s.raidBestCombo,
    remaining: (n) => `Ещё ${n} ${plural(n, ["ответ", "ответа", "ответов"])} подряд`,
    unit: (n) => plural(n, ["ответ", "ответа", "ответов"]),
  },
  raidwins: {
    value: (s) => s.raidWins,
    remaining: (n) => `Осталось ${n} ${plural(n, ["победа", "победы", "побед"])} в рейде`,
    unit: (n) => plural(n, ["победа", "победы", "побед"]),
  },
  raidlast: {
    value: (s) => s.raidLastHits,
    remaining: (n) => `Нужен ${n} добивающий удар`,
    unit: () => "добиваний",
  },
  raidbosses: {
    value: (s) => (s.raidBosses ? s.raidBosses.length : undefined),
    remaining: (n) => `Осталось ${n} ${plural(n, ["босс", "босса", "боссов"])}`,
    unit: (n) => plural(n, ["босс", "босса", "боссов"]),
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
 * (welcome, медали за боссов), префикс id неизвестен или показателя нет у этого
 * пользователя: в этом случае экран просто не рисует полосу, вместо того чтобы
 * показывать выдуманное число.
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

  const raw = metric.value(stats);
  if (raw === undefined) return null;

  const current = Math.max(0, raw);
  const remaining = Math.max(0, target - current);
  const percent = Math.max(0, Math.min(100, Math.round((current / target) * 100)));

  const counterText = parsed[1] === "time"
    ? `${humanMinutes(Math.min(current, target))} из ${humanMinutes(target)}`
    : `${Math.min(current, target).toLocaleString("ru-RU")} из ${target.toLocaleString("ru-RU")} ${metric.unit(target)}`;

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
