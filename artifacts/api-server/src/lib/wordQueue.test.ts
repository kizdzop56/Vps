// Тесты отбора карточек по режимам. Без БД и express: node:test + node:assert.
//
//   pnpm --filter @workspace/api-server test
import test from "node:test";
import assert from "node:assert/strict";

import { LEARNED_LEVEL } from "./srs";
import {
  MARATHON_MAX_CARDS,
  belongsToMarathon,
  compareByDue,
  isDue,
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
  assert.equal(isDue(undefined, NOW), false);
});

test("срок наступил — это dueAt не позже «сейчас»", () => {
  assert.equal(isDue({ memoryLevel: 4, dueAt: minutes(-1) }, NOW), true);
  assert.equal(isDue({ memoryLevel: 4, dueAt: NOW }, NOW), true);
  assert.equal(isDue({ memoryLevel: 4, dueAt: minutes(1) }, NOW), false);
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

test("марафон отдаёт только созревшие выученные слова", () => {
  const states = new Map([
    ["soon", { memoryLevel: 4, dueAt: minutes(5) }],        // срок ещё не подошёл
    ["overdue", { memoryLevel: 5, dueAt: minutes(-60) }],
    ["later", { memoryLevel: 5, dueAt: minutes(60) }],      // и здесь тоже
    ["learning", { memoryLevel: 2, dueAt: minutes(-999) }], // не выучено
  ]);
  const get = (id: string) => states.get(id);

  const { picked, learnedCount, dueNow } = pickMarathonCards([...states.keys()], get, NOW);

  // Слово, отвеченное недавно, снова не приходит — в этом весь смысл
  // интервального повторения. Неусвоенное не попадает и подавно.
  assert.deepEqual(picked, ["overdue"]);
  // В зале повторений при этом три слова: счётчик показывает всё выученное.
  assert.equal(learnedCount, 3);
  assert.equal(dueNow, 1);
});

test("созревшие идут по возрастанию срока: дольше всех ждало — первым", () => {
  const states = new Map([
    ["hour", { memoryLevel: 4, dueAt: minutes(-60) }],
    ["week", { memoryLevel: 5, dueAt: minutes(-60 * 24 * 7) }],
    ["minute", { memoryLevel: 4, dueAt: minutes(-1) }],
  ]);
  const get = (id: string) => states.get(id);

  const { picked } = pickMarathonCards([...states.keys()], get, NOW);
  assert.deepEqual(picked, ["week", "hour", "minute"]);
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
  const total = MARATHON_MAX_CARDS + 15;
  const ids = Array.from({ length: total }, (_, i) => `w${i}`);
  // Все сроки в прошлом: w0 просрочено сильнее всех, w44 — меньше всех.
  const get = (id: string) => ({ memoryLevel: 4, dueAt: minutes(Number(id.slice(1)) - total) });

  const { picked, learnedCount, dueNow } = pickMarathonCards(ids, get, NOW);

  assert.equal(picked.length, MARATHON_MAX_CARDS);
  assert.equal(learnedCount, total);
  assert.equal(dueNow, total);
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

test("всё выучено и ничего не созрело — порция пуста, но зал не пуст", () => {
  const { picked, learnedCount, dueNow } = pickMarathonCards(
    ["a", "b"],
    () => ({ memoryLevel: 5, dueAt: minutes(60 * 24) }),
    NOW,
  );
  assert.deepEqual(picked, []);
  assert.equal(learnedCount, 2);
  assert.equal(dueNow, 0);
});
