/**
 * Тесты правил «на что обратить внимание».
 * Запуск: pnpm exec tsx --test artifacts/api-server/src/lib/studentAnalysis.test.ts
 *
 * Зависимостей нет — только node:test и node:assert, поэтому тест не тянет
 * за собой ни БД, ни express.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFocus,
  computeSkillStats,
  freshnessStatus,
  groupMistakes,
  plural,
  skillLabel,
  DUE_WORDS_ALERT,
  INACTIVE_DAYS,
  LAPSED_WORDS_ALERT,
  MAX_FOCUS_ITEMS,
  MISTAKE_REPEAT_ALERT,
  STALE_ASSIGNMENT_DAYS,
  TREND_WINDOW,
  type ActivityMetrics,
  type AnalysisMetrics,
  type GradedWork,
  type SkillStat,
} from "./studentAnalysis";

// ── Хелперы ────────────────────────────────────────────────────────────────

const activity = (over: Partial<ActivityMetrics> = {}): ActivityMetrics => ({
  daysSinceActive: 0,
  minutesToday: 20,
  minutesWeek: 120,
  minutesPrevWeek: 120,
  loginStreak: 3,
  dailyGoalMinutes: 15,
  ...over,
});

/** Навык с нужным средним баллом и достаточной выборкой. */
const skill = (type: SkillStat["type"], avgScore: number | null, over: Partial<SkillStat> = {}): SkillStat => ({
  type,
  avgScore,
  count: avgScore === null ? 0 : 5,
  recentAvg: avgScore,
  prevAvg: avgScore,
  delta: avgScore === null ? null : 0,
  trend: avgScore === null ? "unknown" : "flat",
  lastAt: avgScore === null ? null : "2026-07-01T10:00:00.000Z",
  ...over,
});

const metrics = (over: Partial<AnalysisMetrics> = {}): AnalysisMetrics => ({
  cefrLevel: "A2",
  activity: activity(),
  skills: [skill("text_test", 90), skill("audio", 88), skill("reading", 91), skill("video", null), skill("free_form", null)],
  vocabulary: {
    totalWords: 200,
    introduced: 80,
    learned: 40,
    dueNow: 3,
    lapsed: 1,
    accuracy: 82,
    learnedLast7: 10,
    reviewsLast7: 40,
  },
  assignments: {
    total: 10,
    notStarted: 0,
    oldestNotStartedDays: null,
    awaitingReview: 0,
    gradedLast14: 4,
    avgScoreLast14: 88,
  },
  mistakes: [],
  ...over,
});

const ids = (m: AnalysisMetrics) => buildFocus(m).map((f) => f.id);

// ── plural / labels ────────────────────────────────────────────────────────

test("plural: русское склонение по последней цифре и исключение 11-14", () => {
  assert.equal(plural(1, "слово", "слова", "слов"), "слово");
  assert.equal(plural(2, "слово", "слова", "слов"), "слова");
  assert.equal(plural(5, "слово", "слова", "слов"), "слов");
  assert.equal(plural(11, "слово", "слова", "слов"), "слов");
  assert.equal(plural(14, "слово", "слова", "слов"), "слов");
  assert.equal(plural(21, "слово", "слова", "слов"), "слово");
  assert.equal(plural(112, "слово", "слова", "слов"), "слов");
});

test("skillLabel: известный тип переводится, неизвестный возвращается как есть", () => {
  assert.equal(skillLabel("audio"), "Аудирование");
  assert.equal(skillLabel("free_form"), "Свободный ответ");
  assert.equal(skillLabel("something_new"), "something_new");
});

// ── freshnessStatus ────────────────────────────────────────────────────────

test("freshnessStatus: нет активности → unknown", () => {
  assert.equal(freshnessStatus(activity({ daysSinceActive: null })), "unknown");
});

test("freshnessStatus: долгое отсутствие → inactive", () => {
  assert.equal(freshnessStatus(activity({ daysSinceActive: INACTIVE_DAYS })), "inactive");
  assert.equal(freshnessStatus(activity({ daysSinceActive: INACTIVE_DAYS - 1 })), "active");
});

test("freshnessStatus: активность упала больше чем вдвое → slowing", () => {
  assert.equal(freshnessStatus(activity({ minutesWeek: 20, minutesPrevWeek: 120 })), "slowing");
});

test("freshnessStatus: старт с нуля не считается просадкой", () => {
  // Прошлая неделя пустая — сравнивать не с чем, иначе любой новичок «просел».
  assert.equal(freshnessStatus(activity({ minutesWeek: 5, minutesPrevWeek: 0 })), "active");
  assert.equal(freshnessStatus(activity({ minutesWeek: 5, minutesPrevWeek: 20 })), "active");
});

// ── computeSkillStats ──────────────────────────────────────────────────────

const work = (type: string, score: number, day: number): GradedWork => ({
  type,
  score,
  submittedAt: new Date(Date.UTC(2026, 5, day, 12, 0, 0)),
});

test("computeSkillStats: возвращает строку на каждый тип задания", () => {
  const stats = computeSkillStats([]);
  assert.equal(stats.length, 5);
  assert.deepEqual(
    stats.map((s) => s.type),
    ["text_test", "audio", "reading", "video", "free_form"],
  );
  for (const s of stats) {
    assert.equal(s.avgScore, null);
    assert.equal(s.count, 0);
    assert.equal(s.trend, "unknown");
  }
});

test("computeSkillStats: средний балл и дата последней работы", () => {
  const stats = computeSkillStats([work("audio", 50, 1), work("audio", 100, 2)]);
  const audio = stats.find((s) => s.type === "audio")!;
  assert.equal(audio.avgScore, 75);
  assert.equal(audio.count, 2);
  assert.equal(audio.lastAt, new Date(Date.UTC(2026, 5, 2, 12, 0, 0)).toISOString());
});

test("computeSkillStats: free_form учитывается (старый эндпоинт его терял)", () => {
  const stats = computeSkillStats([work("free_form", 70, 1)]);
  const free = stats.find((s) => s.type === "free_form")!;
  assert.equal(free.avgScore, 70);
  assert.equal(free.count, 1);
});

test("computeSkillStats: динамика считается по последним работам против предыдущих", () => {
  // Первые TREND_WINDOW работ по 90, следующие TREND_WINDOW — по 60.
  const works: GradedWork[] = [];
  for (let i = 0; i < TREND_WINDOW; i += 1) works.push(work("reading", 90, i + 1));
  for (let i = 0; i < TREND_WINDOW; i += 1) works.push(work("reading", 60, TREND_WINDOW + i + 1));

  const reading = computeSkillStats(works).find((s) => s.type === "reading")!;
  assert.equal(reading.prevAvg, 90);
  assert.equal(reading.recentAvg, 60);
  assert.equal(reading.delta, -30);
  assert.equal(reading.trend, "down");
});

test("computeSkillStats: одной работы недостаточно для тренда", () => {
  const reading = computeSkillStats([work("reading", 80, 1)]).find((s) => s.type === "reading")!;
  assert.equal(reading.prevAvg, null);
  assert.equal(reading.delta, null);
  assert.equal(reading.trend, "unknown");
});

test("computeSkillStats: порядок работ не зависит от порядка входных строк", () => {
  const asc = computeSkillStats([work("audio", 40, 1), work("audio", 90, 9)]);
  const desc = computeSkillStats([work("audio", 90, 9), work("audio", 40, 1)]);
  assert.deepEqual(asc, desc);
});

// ── groupMistakes ──────────────────────────────────────────────────────────

const wrong = (question: string, day: number, studentAnswer = "wrong") => ({
  questionText: question,
  assignmentTitle: "Present Perfect",
  studentAnswer,
  correctAnswer: "have been",
  occurredAt: new Date(Date.UTC(2026, 5, day, 12, 0, 0)),
});

test("groupMistakes: одинаковые вопросы схлопываются и считаются", () => {
  const grouped = groupMistakes([wrong("I ___ here", 1), wrong("I ___ here", 2), wrong("She ___ tired", 3)]);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0]!.questionText, "I ___ here");
  assert.equal(grouped[0]!.count, 2);
  assert.equal(grouped[1]!.count, 1);
});

test("groupMistakes: регистр и пробелы не создают дубликатов", () => {
  const grouped = groupMistakes([wrong("I ___ here", 1), wrong("  i ___ HERE  ", 2)]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0]!.count, 2);
});

test("groupMistakes: сохраняется самый свежий ответ ученика", () => {
  const grouped = groupMistakes([wrong("I ___ here", 1, "am"), wrong("I ___ here", 5, "was")]);
  assert.equal(grouped[0]!.lastStudentAnswer, "was");
  assert.equal(grouped[0]!.lastAt, new Date(Date.UTC(2026, 5, 5, 12, 0, 0)).toISOString());
});

test("groupMistakes: пустой текст вопроса игнорируется, лимит соблюдается", () => {
  assert.equal(groupMistakes([wrong("   ", 1)]).length, 0);
  const many = [1, 2, 3, 4, 5, 6, 7].map((i) => wrong(`q${i}`, i));
  assert.equal(groupMistakes(many, 5).length, 5);
});

// ── buildFocus ─────────────────────────────────────────────────────────────

test("buildFocus: нет ни работ, ни слов → подсказка про первый шаг", () => {
  const focus = buildFocus(
    metrics({
      skills: [skill("text_test", null), skill("audio", null), skill("reading", null), skill("video", null), skill("free_form", null)],
      vocabulary: { totalWords: 0, introduced: 0, learned: 0, dueNow: 0, lapsed: 0, accuracy: null, learnedLast7: 0, reviewsLast7: 0 },
    }),
  );
  assert.deepEqual(focus.map((f) => f.id), ["no-data"]);
  assert.equal(focus[0]!.severity, "info");
});

test("buildFocus: непроверенные работы попадают в приоритет", () => {
  const focus = buildFocus(metrics({
    assignments: { total: 10, notStarted: 0, oldestNotStartedDays: null, awaitingReview: 3, gradedLast14: 2, avgScoreLast14: 80 },
  }));
  const item = focus.find((f) => f.id === "awaiting-review")!;
  assert.equal(item.severity, "high");
  assert.match(item.title, /3 работы/);
});

test("buildFocus: длительное отсутствие важнее просадки активности", () => {
  const focus = ids(metrics({ activity: activity({ daysSinceActive: 9, minutesWeek: 0, minutesPrevWeek: 200 }) }));
  assert.ok(focus.includes("inactive"));
  assert.ok(!focus.includes("slowing"), "одновременно inactive и slowing показывать не нужно");
});

test("buildFocus: просадка активности сообщает обе недели", () => {
  const focus = buildFocus(metrics({ activity: activity({ minutesWeek: 20, minutesPrevWeek: 140 }) }));
  const item = focus.find((f) => f.id === "slowing")!;
  assert.match(item.detail, /20 мин/);
  assert.match(item.detail, /140 мин/);
});

test("buildFocus: падение навыка отмечается отдельно от слабого навыка", () => {
  const focus = ids(metrics({
    skills: [
      skill("reading", 70, { recentAvg: 60, prevAvg: 85, delta: -25, trend: "down" }),
      skill("audio", 88),
      skill("text_test", 90),
      skill("video", null),
      skill("free_form", null),
    ],
  }));
  assert.ok(focus.includes("falling-reading"));
});

test("buildFocus: слабый навык не дублируется, если он уже отмечен как падающий", () => {
  const focus = ids(metrics({
    skills: [
      skill("audio", 45, { recentAvg: 40, prevAvg: 70, delta: -30, trend: "down" }),
      skill("reading", 90),
      skill("text_test", 92),
      skill("video", null),
      skill("free_form", null),
    ],
  }));
  assert.ok(focus.includes("falling-audio"));
  assert.ok(!focus.includes("weak-audio"), "один и тот же навык не должен попадать в фокус дважды");
});

test("buildFocus: единичная плохая работа не делает навык слабым", () => {
  // Балл ниже порога, но работ меньше MIN_SKILL_SAMPLE — вывода быть не должно.
  const focus = ids(metrics({
    skills: [
      skill("audio", 20, { count: 1, recentAvg: 20, prevAvg: null, delta: null, trend: "unknown" }),
      skill("reading", 90),
      skill("text_test", 92),
      skill("video", null),
      skill("free_form", null),
    ],
  }));
  assert.ok(!focus.includes("weak-audio"));
});

test("buildFocus: повторяющаяся ошибка попадает в фокус с текстом вопроса", () => {
  const focus = buildFocus(metrics({
    mistakes: [{
      questionText: "I ___ to London twice",
      assignmentTitle: "Present Perfect",
      count: MISTAKE_REPEAT_ALERT,
      correctAnswer: "have been",
      lastStudentAnswer: "was",
      lastAt: "2026-07-02T10:00:00.000Z",
    }],
  }));
  const item = focus.find((f) => f.id === "repeated-mistake")!;
  assert.match(item.detail, /I ___ to London twice/);
  assert.match(item.detail, /have been/);
});

test("buildFocus: единичная ошибка в фокус не идёт", () => {
  const focus = ids(metrics({
    mistakes: [{
      questionText: "I ___ to London twice",
      assignmentTitle: null,
      count: MISTAKE_REPEAT_ALERT - 1,
      correctAnswer: null,
      lastStudentAnswer: null,
      lastAt: null,
    }],
  }));
  assert.ok(!focus.includes("repeated-mistake"));
});

test("buildFocus: просроченные слова важнее забытых и не показываются вместе", () => {
  const focus = ids(metrics({
    vocabulary: {
      totalWords: 200, introduced: 100, learned: 30,
      dueNow: DUE_WORDS_ALERT, lapsed: LAPSED_WORDS_ALERT,
      accuracy: 70, learnedLast7: 2, reviewsLast7: 10,
    },
  }));
  assert.ok(focus.includes("words-due"));
  assert.ok(!focus.includes("words-lapsed"));
});

test("buildFocus: забытые слова показываются, когда просрочки нет", () => {
  const focus = ids(metrics({
    vocabulary: {
      totalWords: 200, introduced: 100, learned: 30,
      dueNow: 0, lapsed: LAPSED_WORDS_ALERT,
      accuracy: 70, learnedLast7: 2, reviewsLast7: 10,
    },
  }));
  assert.ok(focus.includes("words-lapsed"));
});

test("buildFocus: неначатое задание попадает в фокус только когда провисело долго", () => {
  const stale = ids(metrics({
    assignments: { total: 5, notStarted: 2, oldestNotStartedDays: STALE_ASSIGNMENT_DAYS, awaitingReview: 0, gradedLast14: 1, avgScoreLast14: 90 },
  }));
  assert.ok(stale.includes("not-started"));

  const fresh = ids(metrics({
    assignments: { total: 5, notStarted: 2, oldestNotStartedDays: 1, awaitingReview: 0, gradedLast14: 1, avgScoreLast14: 90 },
  }));
  assert.ok(!fresh.includes("not-started"));
});

test("buildFocus: колоды выданы, но карточки не открывали", () => {
  const focus = ids(metrics({
    vocabulary: { totalWords: 120, introduced: 0, learned: 0, dueNow: 0, lapsed: 0, accuracy: null, learnedLast7: 0, reviewsLast7: 0 },
  }));
  assert.ok(focus.includes("vocab-untouched"));
});

test("buildFocus: сильному ученику предлагаем усложнение", () => {
  const focus = buildFocus(metrics());
  assert.deepEqual(focus.map((f) => f.id), ["ready-to-level-up"]);
  assert.equal(focus[0]!.severity, "good");
  assert.match(focus[0]!.detail, /A2/);
});

test("buildFocus: мало работ → предупреждение вместо диагноза", () => {
  const focus = buildFocus(metrics({
    skills: [
      skill("audio", 75, { count: 1, recentAvg: 75, prevAvg: null, delta: null, trend: "unknown" }),
      skill("text_test", null), skill("reading", null), skill("video", null), skill("free_form", null),
    ],
    vocabulary: { totalWords: 100, introduced: 5, learned: 1, dueNow: 0, lapsed: 0, accuracy: 60, learnedLast7: 1, reviewsLast7: 5 },
  }));
  assert.deepEqual(focus.map((f) => f.id), ["low-sample"]);
});

test("buildFocus: ровный средний ученик получает нейтральный вывод", () => {
  const focus = buildFocus(metrics({
    skills: [skill("text_test", 75), skill("audio", 72), skill("reading", 78), skill("video", null), skill("free_form", null)],
  }));
  assert.deepEqual(focus.map((f) => f.id), ["stable"]);
});

test("buildFocus: срочное идёт первым, список ограничен по длине", () => {
  const focus = buildFocus(metrics({
    activity: activity({ daysSinceActive: 12, minutesWeek: 0, minutesPrevWeek: 300 }),
    skills: [
      skill("audio", 30, { recentAvg: 30, prevAvg: 80, delta: -50, trend: "down" }),
      skill("reading", 40),
      skill("text_test", 45),
      skill("video", null),
      skill("free_form", null),
    ],
    vocabulary: {
      totalWords: 300, introduced: 200, learned: 20,
      dueNow: DUE_WORDS_ALERT + 30, lapsed: LAPSED_WORDS_ALERT + 5,
      accuracy: 40, learnedLast7: 0, reviewsLast7: 0,
    },
    assignments: { total: 12, notStarted: 4, oldestNotStartedDays: STALE_ASSIGNMENT_DAYS + 10, awaitingReview: 2, gradedLast14: 0, avgScoreLast14: null },
    mistakes: [{
      questionText: "I ___ to London twice", assignmentTitle: "Present Perfect",
      count: 5, correctAnswer: "have been", lastStudentAnswer: "was", lastAt: "2026-07-02T10:00:00.000Z",
    }],
  }));

  assert.ok(focus.length <= MAX_FOCUS_ITEMS, `в фокусе не больше ${MAX_FOCUS_ITEMS} пунктов`);
  assert.equal(focus[0]!.severity, "high");
  // Порядок по важности не должен нарушаться.
  const ranks = focus.map((f) => ({ high: 0, medium: 1, low: 2, good: 3, info: 4 })[f.severity]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test("buildFocus: у каждого пункта есть иконка, заголовок и пояснение", () => {
  const focus = buildFocus(metrics({
    activity: activity({ daysSinceActive: 8 }),
    assignments: { total: 4, notStarted: 1, oldestNotStartedDays: 30, awaitingReview: 1, gradedLast14: 0, avgScoreLast14: null },
  }));
  assert.ok(focus.length > 0);
  for (const item of focus) {
    assert.ok(item.id.length > 0);
    assert.ok(item.icon.length > 0, `${item.id}: нужна иконка`);
    assert.ok(item.title.length > 0, `${item.id}: нужен заголовок`);
    assert.ok(item.detail.length > 20, `${item.id}: пояснение должно объяснять, что делать`);
  }
});
