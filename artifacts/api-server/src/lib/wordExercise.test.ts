/**
 * Тесты подбора упражнений и вариантов ответа для тренажёра слов.
 * Запуск: pnpm exec tsx --test artifacts/api-server/src/lib/wordExercise.test.ts
 *
 * Зависимостей нет — только node:test и node:assert.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_BUILD_LENGTH,
  OPTION_COUNT,
  buildExercise,
  buildOptions,
  cardSeed,
  interleaveQueue,
  isBuildable,
  letterTiles,
  mainTranslation,
  mulberry32,
  pickExerciseType,
  shuffle,
  type WordLike,
} from "./wordExercise";

const NOW = new Date("2026-07-30T12:00:00.000Z");

const word = (id: number, english: string, ru: string[]): WordLike => ({ id, english, translationsRu: ru });

const POOL: WordLike[] = [
  word(1, "apple", ["яблоко"]),
  word(2, "bread", ["хлеб"]),
  word(3, "water", ["вода"]),
  word(4, "cheese", ["сыр"]),
  word(5, "milk", ["молоко"]),
  word(6, "egg", ["яйцо"]),
];

// ── выбор упражнения ────────────────────────────────────────────────────────

test("новое слово всегда начинается со знакомства", () => {
  assert.equal(pickExerciseType({ memoryLevel: 0, isNew: true, english: "apple" }), "intro");
  assert.equal(pickExerciseType({ memoryLevel: 5, isNew: true, english: "apple" }), "intro");
});

test("упражнение усложняется с уровнем памяти", () => {
  const type = (level: number) => pickExerciseType({ memoryLevel: level, isNew: false, english: "apple" });
  assert.equal(type(0), "choiceRu");
  assert.equal(type(1), "choiceRu");
  assert.equal(type(2), "choiceEn");
  assert.equal(type(3), "listen");
  assert.equal(type(4), "build");
  assert.equal(type(5), "build");
});

test("без озвучки аудирование заменяется выбором слова", () => {
  assert.equal(
    pickExerciseType({ memoryLevel: 3, isNew: false, english: "apple", allowListen: false }),
    "choiceEn",
  );
});

test("фразы и длинные слова из букв не собираем", () => {
  assert.equal(isBuildable("apple"), true);
  assert.equal(isBuildable("have breakfast"), false);   // словосочетание
  assert.equal(isBuildable("mother-in-law"), false);     // дефис
  assert.equal(isBuildable("go"), false);                // слишком короткое
  assert.equal(isBuildable("a".repeat(MAX_BUILD_LENGTH + 1)), false);
  // выученное словосочетание уходит в аудирование, а не в сборку
  assert.equal(pickExerciseType({ memoryLevel: 5, isNew: false, english: "a piece of cake" }), "listen");
});

// ── варианты ответа ─────────────────────────────────────────────────────────

test("варианты содержат верный ответ ровно один раз и не повторяются", () => {
  const rng = mulberry32(42);
  const { options, answerIndex } = buildOptions("яблоко", ["хлеб", "вода", "сыр", "молоко"], rng);
  assert.equal(options.length, OPTION_COUNT);
  assert.equal(options[answerIndex], "яблоко");
  assert.equal(options.filter((o) => o === "яблоко").length, 1);
  assert.equal(new Set(options).size, options.length);
});

test("прочие переводы того же слова не попадают в неверные варианты", () => {
  const rng = mulberry32(7);
  const { options } = buildOptions(
    "пробовать",
    ["иметь вкус", "хлеб", "вода", "сыр"],
    rng,
    ["пробовать", "иметь вкус"],
  );
  assert.equal(options.includes("иметь вкус"), false);
  assert.ok(options.includes("пробовать"));
});

test("дубликаты и регистр в подборке не создают одинаковых вариантов", () => {
  const rng = mulberry32(11);
  const { options } = buildOptions("яблоко", ["хлеб", "Хлеб", "хлеб ", "вода"], rng);
  assert.equal(options.filter((o) => o.trim().toLowerCase() === "хлеб").length, 1);
});

test("если подборка мала, вариантов меньше, но верный на месте", () => {
  const rng = mulberry32(3);
  const { options, answerIndex } = buildOptions("яблоко", ["хлеб"], rng);
  assert.equal(options.length, 2);
  assert.equal(options[answerIndex], "яблоко");
});

test("порядок вариантов стабилен для одного сида и различается между сидами", () => {
  const pool = ["хлеб", "вода", "сыр", "молоко", "яйцо"];
  const a = buildOptions("яблоко", pool, mulberry32(100)).options;
  const b = buildOptions("яблоко", pool, mulberry32(100)).options;
  const c = buildOptions("яблоко", pool, mulberry32(999)).options;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("сид карточки зависит от слова и от дня", () => {
  assert.equal(cardSeed(5, NOW), cardSeed(5, NOW));
  assert.notEqual(cardSeed(5, NOW), cardSeed(6, NOW));
  assert.notEqual(cardSeed(5, NOW), cardSeed(5, new Date("2026-08-05T12:00:00.000Z")));
});

test("перемешивание сохраняет состав", () => {
  const src = [1, 2, 3, 4, 5];
  const out = shuffle(src, mulberry32(5));
  assert.deepEqual([...out].sort(), [...src].sort());
  assert.deepEqual(src, [1, 2, 3, 4, 5]); // исходный массив не портим
});

// ── плитки букв ─────────────────────────────────────────────────────────────

test("в плитках есть все буквы слова плюс лишние", () => {
  const tiles = letterTiles("apple", mulberry32(1));
  assert.equal(tiles.length, "apple".length + 2);
  const counts = (arr: string[]) => arr.reduce<Record<string, number>>((m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }), {});
  const tileCounts = counts(tiles);
  for (const [letter, need] of Object.entries(counts("apple".split("")))) {
    assert.ok((tileCounts[letter] ?? 0) >= need, `буквы «${letter}» должно быть не меньше ${need}`);
  }
});

test("для длинного слова лишних букв больше", () => {
  assert.equal(letterTiles("computer", mulberry32(2)).length, "computer".length + 3);
});

// ── готовое упражнение ──────────────────────────────────────────────────────

test("знакомство отдаёт только слово, без вариантов", () => {
  const ex = buildExercise({ word: POOL[0]!, memoryLevel: 0, isNew: true, pool: POOL, now: NOW });
  assert.equal(ex.type, "intro");
  assert.equal(ex.prompt, "apple");
  assert.equal(ex.options, undefined);
});

test("choiceRu: спрашиваем английское слово, отвечаем переводом", () => {
  const ex = buildExercise({ word: POOL[0]!, memoryLevel: 1, isNew: false, pool: POOL, now: NOW });
  assert.equal(ex.type, "choiceRu");
  assert.equal(ex.prompt, "apple");
  assert.equal(ex.options![ex.answerIndex!], "яблоко");
  assert.equal(ex.options!.length, OPTION_COUNT);
});

test("choiceEn: спрашиваем перевод, отвечаем английским словом", () => {
  const ex = buildExercise({ word: POOL[0]!, memoryLevel: 2, isNew: false, pool: POOL, now: NOW });
  assert.equal(ex.type, "choiceEn");
  assert.equal(ex.prompt, "яблоко");
  assert.equal(ex.options![ex.answerIndex!], "apple");
  assert.equal(ex.answer, "apple");
});

test("build: даём перевод, ответ — слово, плитки перемешаны", () => {
  const ex = buildExercise({ word: POOL[0]!, memoryLevel: 4, isNew: false, pool: POOL, now: NOW });
  assert.equal(ex.type, "build");
  assert.equal(ex.prompt, "яблоко");
  assert.equal(ex.answer, "apple");
  assert.ok((ex.letters?.length ?? 0) > "apple".length);
});

test("само слово не попадает в свои же варианты", () => {
  const ex = buildExercise({ word: POOL[2]!, memoryLevel: 2, isNew: false, pool: POOL, now: NOW });
  assert.equal(ex.options!.filter((o) => o === "water").length, 1);
});

test("если подходящих слов нет совсем — падаем в знакомство, а не в пустой выбор", () => {
  const only = [POOL[0]!];
  const ex = buildExercise({ word: POOL[0]!, memoryLevel: 1, isNew: false, pool: only, now: NOW });
  assert.equal(ex.type, "intro");
});

// ── очередь сессии ──────────────────────────────────────────────────────────

test("новые слова вставляются между повторениями, состав сохраняется", () => {
  const due = ["d1", "d2", "d3", "d4", "d5", "d6"];
  const fresh = ["n1", "n2"];
  const queue = interleaveQueue(due, fresh, 3);
  assert.equal(queue.length, due.length + fresh.length);
  assert.deepEqual(queue, ["d1", "d2", "d3", "n1", "d4", "d5", "d6", "n2"]);
});

test("остаток новых слов уходит в хвост, пустые списки не ломают очередь", () => {
  assert.deepEqual(interleaveQueue(["d1"], ["n1", "n2", "n3"], 3), ["d1", "n1", "n2", "n3"]);
  assert.deepEqual(interleaveQueue([], ["n1"], 3), ["n1"]);
  assert.deepEqual(interleaveQueue(["d1", "d2"], [], 3), ["d1", "d2"]);
  assert.deepEqual(interleaveQueue([], [], 3), []);
});

test("основной перевод — первый в списке", () => {
  assert.equal(mainTranslation(word(9, "taste", ["пробовать", "иметь вкус"])), "пробовать");
  assert.equal(mainTranslation(word(10, "x", [])), "");
});
