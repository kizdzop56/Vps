// Тесты расписания повторений. Без БД и express: расписание — чистая функция от
// журнала ответов, и проверяется напрямую.
//
// Проверяется то, что легко сломать незаметно: кто вообще попадает в повторения,
// растёт ли уровень, возвращается ли отработанная ошибка и в каком порядке
// выдаются созревшие задания.
import test from "node:test";
import assert from "node:assert/strict";

import {
  GRAMMAR_REVIEW_FIXED_LEVEL,
  GRAMMAR_REVIEW_INTERVAL_MIN,
  dueReviews,
  reviewStates,
  reviewSummary,
  type GrammarAnswerLike,
} from "./review";

const T0 = new Date("2026-01-01T10:00:00.000Z");

/** Минуты от T0 в дату: даты в тестах должны читаться, а не считаться в уме. */
function at(minutes: number): Date {
  return new Date(T0.getTime() + minutes * 60_000);
}

function answer(
  taskId: string,
  correct: boolean,
  minutes: number,
  typo = false,
): GrammarAnswerLike {
  return { taskId, correct, typo, answeredAt: at(minutes) };
}

test("решённое с первого раза в повторения не попадает", () => {
  const states = reviewStates([answer("t-1", true, 0), answer("t-2", true, 1)]);
  assert.equal(states.size, 0);
});

test("ошибка попадает в повторения и созревает через десять минут", () => {
  const states = reviewStates([answer("t-1", false, 0)]);
  const state = states.get("t-1");
  assert.ok(state);
  assert.equal(state.level, 0);
  assert.equal(state.wrongs, 1);
  assert.equal(state.dueAt.getTime(), at(GRAMMAR_REVIEW_INTERVAL_MIN[0]!).getTime());

  // Раньше срока задание не показывается.
  assert.equal(dueReviews(states, at(5)).length, 0);
  assert.equal(dueReviews(states, at(11)).length, 1);
});

test("верный ответ поднимает уровень и удлиняет срок", () => {
  const states = reviewStates([answer("t-1", false, 0), answer("t-1", true, 20)]);
  const state = states.get("t-1");
  assert.ok(state);
  assert.equal(state.level, 1);
  assert.equal(state.dueAt.getTime(), at(20 + GRAMMAR_REVIEW_INTERVAL_MIN[1]!).getTime());
});

test("опечатка ответ засчитывает, но уровень не поднимает", () => {
  const states = reviewStates([
    answer("t-1", false, 0),
    answer("t-1", true, 20, true),
  ]);
  const state = states.get("t-1");
  assert.ok(state);
  assert.equal(state.level, 0);
  // Срок всё равно отодвигается от последнего ответа: иначе задание висело бы
  // просроченным и выпадало бы в каждом заходе подряд.
  assert.equal(state.dueAt.getTime(), at(20 + GRAMMAR_REVIEW_INTERVAL_MIN[0]!).getTime());
});

test("повторная ошибка сбрасывает уровень и считается", () => {
  const states = reviewStates([
    answer("t-1", false, 0),
    answer("t-1", true, 20),
    answer("t-1", true, 2000),
    answer("t-1", false, 6000),
  ]);
  const state = states.get("t-1");
  assert.ok(state);
  assert.equal(state.level, 0);
  assert.equal(state.wrongs, 2);
});

test("отработанная ошибка уходит из повторений", () => {
  const log: GrammarAnswerLike[] = [answer("t-1", false, 0)];
  for (let i = 1; i <= GRAMMAR_REVIEW_FIXED_LEVEL; i++) log.push(answer("t-1", true, i * 100_000));
  assert.equal(reviewStates(log).size, 0);
});

test("отработанная ошибка возвращается, если ученик снова промахнулся", () => {
  const log: GrammarAnswerLike[] = [answer("t-1", false, 0)];
  for (let i = 1; i <= GRAMMAR_REVIEW_FIXED_LEVEL; i++) log.push(answer("t-1", true, i * 100_000));
  log.push(answer("t-1", false, 900_000));

  const state = reviewStates(log).get("t-1");
  assert.ok(state);
  assert.equal(state.level, 0);
});

test("порядок повторений: самые давние впереди, лимит соблюдается", () => {
  const states = reviewStates([
    answer("свежая", false, 500),
    answer("давняя", false, 0),
    answer("средняя", false, 100),
  ]);

  const due = dueReviews(states, at(10_000), 2);
  assert.deepEqual(due.map((s) => s.taskId), ["давняя", "средняя"]);
});

test("журнал в обратном порядке даёт то же расписание", () => {
  const log = [answer("t-1", false, 0), answer("t-1", true, 20)];
  const straight = reviewStates(log).get("t-1");
  const reversed = reviewStates([...log].reverse()).get("t-1");
  assert.ok(straight && reversed);
  assert.equal(reversed.level, straight.level);
  assert.equal(reversed.dueAt.getTime(), straight.dueAt.getTime());
});

test("сводка: созревшие, всего в работе и срок ближайшего", () => {
  const states = reviewStates([
    answer("созрела", false, 0),
    answer("ждёт", false, 0),
    answer("ждёт", true, 1),
  ]);

  const summary = reviewSummary(states, at(30));
  assert.equal(summary.pool, 2);
  assert.equal(summary.due, 1);
  assert.equal(summary.nextDueAt?.getTime(), at(1 + GRAMMAR_REVIEW_INTERVAL_MIN[1]!).getTime());
});

test("пустой журнал: сводка пустая, ждать нечего", () => {
  const summary = reviewSummary(reviewStates([]), T0);
  assert.deepEqual(summary, { due: 0, pool: 0, nextDueAt: null });
});
