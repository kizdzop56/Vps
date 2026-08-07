// Тесты отбора карточек по режимам. Без БД и express: node:test + node:assert,
// запускается без установки зависимостей.
//
//   pnpm exec tsx --test artifacts/api-server/src/lib/wordQueue.test.ts
import test from "node:test";
import assert from "node:assert/strict";

import { LEARNED_LEVEL } from "./srs";
import {
  MARATHON_MAX_CARDS,
  belongsToMarathon,
  compareByDue,
  needsMoreStudy,
  pickMarathonCards,
} from "./wordQueue";

const NOW = new Date("2026-01-15T12:00:00Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

test("граница режимов проходит ровно по LEARNED_LEVEL", () => {
  for (let level = 0; level < LEARNED_LEVEL; level++) {
    assert.equal(belongsToMarathon({ memoryLevel: level, dueAt: NOW }), false, `уровень ${level}`);
  }
  for (let level = LEARNED_LEVEL; level <= 5; level++) {
    assert.equal(belongsToMarathon({ memoryLevel: level, dueAt: NOW }), true, `уровень ${level}`);
  }
});

test("новое слово не попадает ни в один из режимов через состояние", () => {
  // У новых слов состояния нет вовсе: их добирает отдельная ветка с дневной
  // нормой, поэтому здесь оба ответа должны быть отрицательными.
  assert.equal(belongsToMarathon(undefined), false);
  assert.equal(needsMoreStudy(undefined, NOW), false);
});

test("в «Учить слова» идут только неусвоенные слова с наступившим сроком", () => {
  assert.equal(needsMoreStudy({ memoryLevel: 1, dueAt: minutes(-10) }, NOW), true);
  // срок ещё не подошёл
  assert.equal(needsMoreStudy({ memoryLevel: 1, dueAt: minutes(10) }, NOW), false);
  // выучено — это уже марафон, даже если срок наступил
  assert.equal(needsMoreStudy({ memoryLevel: LEARNED_LEVEL, dueAt: minutes(-10) }, NOW), false);
});

test("сорвавшееся слово возвращается доучиваться", () => {
  // Оценка again роняет выученное слово на LEARNED_LEVEL - 1 (см. srs.ts):
  // оно обязано уйти из марафона обратно в изучение.
  const afterLapse = { memoryLevel: LEARNED_LEVEL - 1, dueAt: minutes(-1) };
  assert.equal(belongsToMarathon(afterLapse), false);
  assert.equal(needsMoreStudy(afterLapse, NOW), true);
});

test("марафон отдаёт выученные слова по возрастанию срока", () => {
  const states = new Map([
    ["soon", { memoryLevel: 4, dueAt: minutes(5) }],
    ["overdue", { memoryLevel: 5, dueAt: minutes(-60) }],
    ["later", { memoryLevel: 5, dueAt: minutes(60) }],
    ["learning", { memoryLevel: 2, dueAt: minutes(-999) }],
  ]);
  const get = (id: string) => states.get(id);

  const { picked, learnedCount, dueNow } = pickMarathonCards([...states.keys()], get, NOW);

  // Неусвоенное слово не попадает, даже будучи самым просроченным.
  assert.deepEqual(picked, ["overdue", "soon", "later"]);
  assert.equal(learnedCount, 3);
  assert.equal(dueNow, 1);
});

test("чем выше уровень, тем дальше слово в очереди", () => {
  // Это и есть «реже попадается»: интервал растёт с уровнем, поэтому свежий
  // верный ответ сам уносит слово в хвост — отдельного счётчика не нужно.
  const states = new Map([
    ["week", { memoryLevel: 4, dueAt: minutes(60 * 24 * 7) }],
    ["month", { memoryLevel: 5, dueAt: minutes(60 * 24 * 30) }],
  ]);
  const order = ["month", "week"].sort(compareByDue((id: string) => states.get(id)));
  assert.deepEqual(order, ["week", "month"]);
});

test("порция марафона ограничена лимитом, счётчик показывает всё", () => {
  const ids = Array.from({ length: MARATHON_MAX_CARDS + 15 }, (_, i) => `w${i}`);
  const get = (id: string) => ({ memoryLevel: 4, dueAt: minutes(Number(id.slice(1))) });

  const { picked, learnedCount } = pickMarathonCards(ids, get, NOW);

  assert.equal(picked.length, MARATHON_MAX_CARDS);
  assert.equal(learnedCount, ids.length);
  assert.equal(picked[0], "w0");
});

test("пустой марафон — это нормальный ответ, а не ошибка", () => {
  // Пока ничего не выучено, залу повторений просто нечего показать.
  const { picked, learnedCount, dueNow } = pickMarathonCards(
    ["a", "b"],
    () => ({ memoryLevel: 0, dueAt: NOW }),
    NOW,
  );
  assert.deepEqual(picked, []);
  assert.equal(learnedCount, 0);
  assert.equal(dueNow, 0);
});
