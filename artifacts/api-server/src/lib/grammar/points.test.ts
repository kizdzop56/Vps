// Тесты очков за грамматику и разбора слабых мест.
//
//   pnpm --filter @workspace/api-server test
import test from "node:test";
import assert from "node:assert/strict";

import {
  DAILY_GRAMMAR_POINTS_CAP,
  MIN_ANSWERS_FOR_VERDICT,
  POINTS_BY_INPUT,
  WEAK_ACCURACY,
  awardableGrammarPoints,
  pointsForAnswer,
  topicStats,
  type LogLike,
} from "./points";

const NOW = new Date("2026-08-10T12:00:00.000Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);

const log = (topic: string | null, correct: boolean, minutes: number, mode = "tense"): LogLike => ({
  topic, mode, correct, answeredAt: minutesAgo(minutes),
});

// ── Ставки ──────────────────────────────────────────────────────────────────

test("письмо дороже выбора: узнавание легче воспроизведения", () => {
  assert.ok(POINTS_BY_INPUT.type > POINTS_BY_INPUT.choice);
  assert.ok(POINTS_BY_INPUT.assemble > POINTS_BY_INPUT.choice);
});

test("ошибка не приносит очков ни при каком способе ответа", () => {
  assert.equal(pointsForAnswer("type", false), 0);
  assert.equal(pointsForAnswer("choice", false), 0);
  assert.equal(pointsForAnswer("assemble", false), 0);
});

test("верный ответ платится по способу ответа", () => {
  assert.equal(pointsForAnswer("type", true), POINTS_BY_INPUT.type);
  assert.equal(pointsForAnswer("choice", true), POINTS_BY_INPUT.choice);
  assert.equal(pointsForAnswer("assemble", true), POINTS_BY_INPUT.assemble);
});

// ── Потолок ─────────────────────────────────────────────────────────────────

test("дневной потолок не пробивается", () => {
  assert.equal(awardableGrammarPoints(2, 0), 2);
  // Остаток меньше ставки — выдаём остаток, а не полную ставку.
  assert.equal(awardableGrammarPoints(2, DAILY_GRAMMAR_POINTS_CAP - 1), 1);
  assert.equal(awardableGrammarPoints(2, DAILY_GRAMMAR_POINTS_CAP), 0);
  // Даже если в журнале почему-то больше потолка — в минус не уходим.
  assert.equal(awardableGrammarPoints(2, DAILY_GRAMMAR_POINTS_CAP + 100), 0);
});

test("потолок грамматики отдельный и ниже словарного", () => {
  // Не потому, что грамматика менее ценна: один заход письмом даёт ~24 очка, и
  // потолка в 60 хватило бы на три захода подряд по одной теме.
  assert.ok(DAILY_GRAMMAR_POINTS_CAP < 60);
});

// ── Слабые места ────────────────────────────────────────────────────────────

test("точность считается по теме, слабое идёт первым", () => {
  const logs: LogLike[] = [
    // past_simple: 1 из 4 → слабое место
    log("past_simple", true, 10),
    log("past_simple", false, 11),
    log("past_simple", false, 12),
    log("past_simple", false, 13),
    // present_simple: 4 из 4 → всё хорошо
    log("present_simple", true, 20),
    log("present_simple", true, 21),
    log("present_simple", true, 22),
    log("present_simple", true, 23),
  ];

  const stats = topicStats(logs);
  assert.equal(stats.length, 2);
  assert.equal(stats[0]!.topic, "past_simple");
  assert.equal(stats[0]!.accuracy, 25);
  assert.equal(stats[0]!.weak, true);
  assert.equal(stats[1]!.topic, "present_simple");
  assert.equal(stats[1]!.accuracy, 100);
  assert.equal(stats[1]!.weak, false);
});

test("по двум ответам тему слабой не объявляем", () => {
  // Две ошибки подряд бывают у любого. Клеймо «слабое место» после двух
  // ответов — это не диагноз, а шум.
  const logs = [log("past_simple", false, 1), log("past_simple", false, 2)];
  const stats = topicStats(logs);
  assert.equal(stats[0]!.accuracy, 0);
  assert.equal(stats[0]!.weak, false);
  assert.ok(MIN_ANSWERS_FOR_VERDICT > 2);
});

test("порог слабого места — точность ниже WEAK_ACCURACY", () => {
  // 3 из 4 = 75%, выше порога 70 → тема не слабая.
  const ok = topicStats([
    log("present_perfect", true, 1),
    log("present_perfect", true, 2),
    log("present_perfect", true, 3),
    log("present_perfect", false, 4),
  ]);
  assert.equal(ok[0]!.accuracy, 75);
  assert.ok(ok[0]!.accuracy >= WEAK_ACCURACY);
  assert.equal(ok[0]!.weak, false);
});

test("окно считается ПО ТЕМЕ, а не по всему журналу", () => {
  // Главный неочевидный случай. Свежих ответов по одной теме много, старая тема
  // одна и давняя: при общем окне она бы просто исчезла из статистики.
  const fresh = Array.from({ length: 10 }, (_, i) => log("present_simple", true, i + 1));
  const old = [
    log("past_simple", false, 5000),
    log("past_simple", false, 5001),
    log("past_simple", false, 5002),
    log("past_simple", true, 5003),
  ];

  const stats = topicStats([...fresh, ...old], 5);
  const past = stats.find((s) => s.topic === "past_simple");
  assert.ok(past, "старая тема пропала из статистики");
  assert.equal(past!.answers, 4);
  assert.equal(past!.weak, true);
});

test("окно отбрасывает старое, оставляя свежее", () => {
  // Тема освоена: старые ответы неверные, последние — верные. За пределами окна
  // старое влиять уже не должно.
  const logs: LogLike[] = [
    log("past_simple", false, 900),
    log("past_simple", false, 901),
    log("past_simple", false, 902),
    log("past_simple", true, 1),
    log("past_simple", true, 2),
    log("past_simple", true, 3),
    log("past_simple", true, 4),
  ];
  const stats = topicStats(logs, 4);
  assert.equal(stats[0]!.answers, 4);
  assert.equal(stats[0]!.accuracy, 100);
  assert.equal(stats[0]!.weak, false);
});

test("ответы без темы в статистику не идут", () => {
  // Сборка предложений — это порядок слов вообще, а не одно правило: считать по
  // ней «точность темы» нечего.
  const stats = topicStats([
    log(null, false, 1, "build"),
    log("", false, 2, "build"),
    log("go", true, 3, "verbs"),
  ]);
  assert.equal(stats.length, 1);
  assert.equal(stats[0]!.topic, "go");
  assert.equal(stats[0]!.mode, "verbs");
});

test("одинаковая тема в разных режимах не смешивается", () => {
  // Гипотетически глагол и время могут совпасть по строке — считаться они
  // должны всё равно раздельно.
  const stats = topicStats([
    log("read", true, 1, "verbs"),
    log("read", false, 2, "tense"),
  ]);
  assert.equal(stats.length, 2);
});

test("пустой журнал — пустая статистика, а не ошибка", () => {
  assert.deepEqual(topicStats([]), []);
});
