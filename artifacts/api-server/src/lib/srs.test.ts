/**
 * Тесты планировщика интервального повторения и начисления очков за слова.
 * Запуск: pnpm --filter @workspace/api-server test
 *
 * Зависимостей нет — только node:test и node:assert, поэтому тест не тянет
 * за собой ни БД, ни express.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_WORD_POINTS_CAP,
  INTERVAL_MIN,
  LEARNED_BONUS_POINTS,
  LEARNED_LEVEL,
  MAX_MEMORY_LEVEL,
  POINTS_BY_GRADE,
  awardablePoints,
  cardAccuracy,
  countsAsLapse,
  gradeFromAnswer,
  gradeFromLegacy,
  hardScore,
  isGrade,
  isHardCard,
  isLearned,
  legacyResultFromGrade,
  nextLevel,
  nextReviewState,
  pointsEarnedToday,
  pointsForReview,
  reachedLearned,
  startOfDay,
  type CardStateLike,
  type ReviewLogLike,
} from "./srs";
import { startOfLocalDay } from "./timeStats";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const minutesBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 60_000);

// ── уровни ──────────────────────────────────────────────────────────────────

test("«знаю» поднимает уровень на одну ступень, «легко» — на две", () => {
  assert.equal(nextLevel(0, "good"), 1);
  assert.equal(nextLevel(2, "good"), 3);
  assert.equal(nextLevel(0, "easy"), 2);
  assert.equal(nextLevel(3, "easy"), 5);
});

test("уровень не выходит за границы 0–5", () => {
  assert.equal(nextLevel(5, "good"), MAX_MEMORY_LEVEL);
  assert.equal(nextLevel(5, "easy"), MAX_MEMORY_LEVEL);
  assert.equal(nextLevel(0, "again"), 0);
});

test("«трудно» держит уровень, но возвращает карточку раньше срока", () => {
  assert.equal(nextLevel(3, "hard"), 3);
  const plan = nextReviewState(3, "hard", NOW);
  assert.equal(plan.level, 3);
  assert.equal(plan.intervalMinutes, Math.round(INTERVAL_MIN[3]! * 0.5));
  assert.ok(plan.intervalMinutes < INTERVAL_MIN[3]!);
});

test("ошибка роняет уровень мягко: не ниже нуля и без сброса выученного в начало", () => {
  assert.equal(nextLevel(1, "again"), 0);
  assert.equal(nextLevel(3, "again"), 2);
  // выученное слово (4–5) уходит в закрепление, а не в самое начало
  assert.equal(nextLevel(4, "again"), LEARNED_LEVEL - 1);
  assert.equal(nextLevel(5, "again"), LEARNED_LEVEL - 1);
});

test("интервалы растут вместе с уровнем", () => {
  const levels = [0, 1, 2, 3, 4, 5];
  const intervals = levels.map((l) => nextReviewState(l, "good", NOW).intervalMinutes);
  for (let i = 1; i < intervals.length; i++) {
    assert.ok(intervals[i]! >= intervals[i - 1]!, `интервал уровня ${i} не меньше предыдущего`);
  }
  // месяц на верхнем уровне
  assert.equal(nextReviewState(5, "good", NOW).intervalMinutes, INTERVAL_MIN[5]);
});

test("dueAt считается от переданного «сейчас», минимум одна минута", () => {
  const plan = nextReviewState(0, "again", NOW);
  assert.equal(minutesBetween(NOW, plan.dueAt), plan.intervalMinutes);
  assert.ok(plan.intervalMinutes >= 1);
});

test("«легко» отодвигает повтор дальше, чем «знаю»", () => {
  const good = nextReviewState(2, "good", NOW);
  const easy = nextReviewState(2, "easy", NOW);
  assert.ok(easy.dueAt.getTime() > good.dueAt.getTime());
});

// ── выучено / срывы ─────────────────────────────────────────────────────────

test("порог «выучено» — уровень 4", () => {
  assert.equal(isLearned(3), false);
  assert.equal(isLearned(4), true);
  assert.equal(isLearned(5), true);
});

test("бонус за «выучено» срабатывает только на переходе через порог", () => {
  assert.equal(reachedLearned(3, 4), true);
  assert.equal(reachedLearned(3, 5), true); // перескок через уровень при «легко»
  assert.equal(reachedLearned(4, 5), false);
  assert.equal(reachedLearned(2, 3), false);
});

test("срыв считаем только на закреплённых словах", () => {
  assert.equal(countsAsLapse(0, "again"), false);
  assert.equal(countsAsLapse(1, "again"), false);
  assert.equal(countsAsLapse(2, "again"), true);
  assert.equal(countsAsLapse(4, "again"), true);
  assert.equal(countsAsLapse(4, "good"), false);
});

// ── оценка по ответу ────────────────────────────────────────────────────────

test("оценка выводится из ответа: неверно → again, со второй попытки → hard", () => {
  assert.equal(gradeFromAnswer({ correct: false }), "again");
  assert.equal(gradeFromAnswer({ correct: false, elapsedMs: 500 }), "again");
  assert.equal(gradeFromAnswer({ correct: true, attempts: 2, elapsedMs: 500 }), "hard");
  assert.equal(gradeFromAnswer({ correct: true, attempts: 1, hintUsed: true, elapsedMs: 500 }), "hard");
});

test("быстрый ответ с первой попытки → easy, обычный → good, медленный → hard", () => {
  assert.equal(gradeFromAnswer({ correct: true, attempts: 1, elapsedMs: 1_500 }), "easy");
  assert.equal(gradeFromAnswer({ correct: true, attempts: 1, elapsedMs: 8_000 }), "good");
  assert.equal(gradeFromAnswer({ correct: true, attempts: 1, elapsedMs: 30_000 }), "hard");
  // без данных о времени — нейтральная оценка
  assert.equal(gradeFromAnswer({ correct: true }), "good");
});

test("совместимость со старым форматом know/dont", () => {
  assert.equal(gradeFromLegacy("know"), "good");
  assert.equal(gradeFromLegacy("dont"), "again");
  assert.equal(legacyResultFromGrade("easy"), "know");
  assert.equal(legacyResultFromGrade("hard"), "know");
  assert.equal(legacyResultFromGrade("again"), "dont");
});

test("оценкой считается только известное значение", () => {
  assert.equal(isGrade("good"), true);
  assert.equal(isGrade("again"), true);
  assert.equal(isGrade("know"), false);
  assert.equal(isGrade(null), false);
  assert.equal(isGrade(undefined), false);
});

// ── очки ────────────────────────────────────────────────────────────────────

test("очки за ответ: ошибка ноль, трудно меньше, чем знаю, бонус за выученное", () => {
  assert.equal(pointsForReview("again", false), 0);
  assert.ok(pointsForReview("hard", false) < pointsForReview("good", false));
  assert.equal(pointsForReview("good", true), pointsForReview("good", false) + LEARNED_BONUS_POINTS);
});

test("дневной потолок очков не даёт накрутить баллы", () => {
  assert.equal(awardablePoints(7, 0), 7);
  assert.equal(awardablePoints(7, DAILY_WORD_POINTS_CAP - 3), 3);
  assert.equal(awardablePoints(7, DAILY_WORD_POINTS_CAP), 0);
  assert.equal(awardablePoints(7, DAILY_WORD_POINTS_CAP + 100), 0);
});

test("начисленное за сегодня считается по журналу: только сегодняшние записи", () => {
  const log = (wordId: number, result: string, level: number, iso: string): ReviewLogLike => ({
    wordId, result, memoryLevelAfter: level, reviewedAt: new Date(iso),
  });
  const dayStart = startOfDay(NOW);
  const logs = [
    log(1, "know", 1, "2026-07-28T10:00:00.000Z"), // позавчера — не считаем
    log(1, "know", 2, NOW.toISOString()),
    log(2, "dont", 0, NOW.toISOString()),          // ошибка — 0 очков
  ];
  assert.equal(pointsEarnedToday(logs, dayStart), 2);
});

test("оценка из журнала точнее result: за «трудно» одно очко, а не два", () => {
  const dayStart = startOfDay(NOW);
  const logs: ReviewLogLike[] = [
    { wordId: 1, result: "know", grade: "hard", memoryLevelAfter: 2, reviewedAt: NOW },
    { wordId: 2, result: "know", grade: "good", memoryLevelAfter: 2, reviewedAt: NOW },
    { wordId: 3, result: "know", grade: "easy", memoryLevelAfter: 2, reviewedAt: NOW },
    { wordId: 4, result: "dont", grade: "again", memoryLevelAfter: 0, reviewedAt: NOW },
  ];
  const expected = POINTS_BY_GRADE.hard + POINTS_BY_GRADE.good + POINTS_BY_GRADE.easy;
  assert.equal(pointsEarnedToday(logs, dayStart), expected);
});

test("запись без оценки считается по result — как и начислялось в своё время", () => {
  const dayStart = startOfDay(NOW);
  const logs: ReviewLogLike[] = [
    { wordId: 1, result: "know", grade: null, memoryLevelAfter: 2, reviewedAt: NOW },
    { wordId: 2, result: "know", memoryLevelAfter: 2, reviewedAt: NOW },
  ];
  assert.equal(pointsEarnedToday(logs, dayStart), POINTS_BY_GRADE.good * 2);
});

test("бонус за «выучено» учитывается один раз на слово", () => {
  const dayStart = startOfDay(NOW);
  const logs: ReviewLogLike[] = [
    { wordId: 7, result: "know", memoryLevelAfter: LEARNED_LEVEL, reviewedAt: new Date("2026-07-30T09:00:00.000Z") },
    { wordId: 7, result: "know", memoryLevelAfter: MAX_MEMORY_LEVEL, reviewedAt: new Date("2026-07-30T10:00:00.000Z") },
  ];
  // 2 + 5 за первое достижение порога, второй раз — только 2
  assert.equal(pointsEarnedToday(logs, dayStart), 2 + LEARNED_BONUS_POINTS + 2);
});

test("бонус за слово, выученное вчера, сегодня повторно не начисляется", () => {
  const dayStart = startOfDay(NOW);
  const logs: ReviewLogLike[] = [
    { wordId: 9, result: "know", memoryLevelAfter: LEARNED_LEVEL, reviewedAt: new Date("2026-07-28T09:00:00.000Z") },
    { wordId: 9, result: "know", memoryLevelAfter: MAX_MEMORY_LEVEL, reviewedAt: new Date("2026-07-30T09:00:00.000Z") },
  ];
  assert.equal(pointsEarnedToday(logs, dayStart), 2);
});

test("по одним сегодняшним записям бонус не повторяется: помогает learnedBefore", () => {
  const dayStart = startOfDay(NOW);
  // Роут читает только сегодняшний журнал: слово 9 в нём выглядит как впервые
  // достигшее порога, хотя выучено оно было раньше.
  const todayOnly: ReviewLogLike[] = [
    { wordId: 9, result: "know", grade: "good", memoryLevelAfter: MAX_MEMORY_LEVEL, reviewedAt: NOW },
  ];
  assert.equal(pointsEarnedToday(todayOnly, dayStart), 2 + LEARNED_BONUS_POINTS);
  assert.equal(pointsEarnedToday(todayOnly, dayStart, new Set([9])), 2);
});

// ── сложные слова ───────────────────────────────────────────────────────────

const state = (over: Partial<CardStateLike> = {}): CardStateLike => ({
  wordId: 1, memoryLevel: 1, lapses: 0, timesSeen: 0, timesCorrect: 0, ...over,
});

test("точность карточки: без показов считаем 100%", () => {
  assert.equal(cardAccuracy(state()), 100);
  assert.equal(cardAccuracy(state({ timesSeen: 4, timesCorrect: 1 })), 25);
});

test("сложное слово: срыв или низкая точность и слово ещё не выучено", () => {
  assert.equal(isHardCard(state({ lapses: 1 })), true);
  assert.equal(isHardCard(state({ timesSeen: 4, timesCorrect: 1 })), true);
  // выученное не тащим в подборку, даже если раньше были срывы
  assert.equal(isHardCard(state({ lapses: 3, memoryLevel: LEARNED_LEVEL })), false);
  // одна ошибка на двух показах — ещё не «сложное»
  assert.equal(isHardCard(state({ timesSeen: 2, timesCorrect: 1 })), false);
  assert.equal(isHardCard(state({ timesSeen: 10, timesCorrect: 10 })), false);
});

test("сортировка сложных: больше срывов и ошибок — выше в списке", () => {
  const worse = state({ lapses: 3, timesSeen: 6, timesCorrect: 1, memoryLevel: 0 });
  const better = state({ lapses: 1, timesSeen: 3, timesCorrect: 2, memoryLevel: 3 });
  assert.ok(hardScore(worse) > hardScore(better));
});

test("сутки режутся по часовому поясу приложения, а не процесса", () => {
  // Проверять через getHours() нельзя: это зона процесса, и на сервере в UTC
  // тест проверял бы совпадение зон, а не саму функцию.
  const at = new Date("2026-07-30T23:45:12.000Z");
  assert.equal(startOfDay(at).getTime(), startOfLocalDay(at).getTime());
  // Начало суток не в будущем и не дальше суток назад.
  const diff = at.getTime() - startOfDay(at).getTime();
  assert.ok(diff >= 0 && diff < 24 * 60 * 60 * 1000);
});
