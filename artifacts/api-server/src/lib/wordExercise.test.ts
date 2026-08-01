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
  word(1, "apple",  ["яблоко"]),   // cardSeed(1,NOW)%2 = 1 → choiceEn
  word(2, "bread",  ["хлеб"]),     // cardSeed(2,NOW)%2 = 0 → choiceRu
  word(3, "water",  ["вода"]),     // cardSeed(3,NOW)%2 = 1 → choiceEn
  word(4, "cheese", ["сыр"]),      // cardSeed(4,NOW)%2 = 0 → choiceRu
  word(5, "milk",   ["молоко"]),   // cardSeed(5,NOW)%2 = 1 → choiceEn
  word(6, "egg",    ["яйцо"]),     // cardSeed(6,NOW)%2 = 0 → choiceRu
];

// ── выбор упражнения ────────────────────────────────────────────────────────

test("новое слово всегда начинается со знакомства", () => {
  assert.equal(pickExerciseType({ memoryLevel: 0, isNew: true, english: "apple" }), "intro");
  assert.equal(pickExerciseType({ memoryLevel: 5, isNew: true, english: "apple" }), "intro");
  // даже при wordId choiceEn не выдаётся для нового слова
  assert.equal(pickExerciseType({ memoryLevel: 0, isNew: true, english: "bread", wordId: 2, now: NOW }), "intro");
});

test("для нового слова choiceEn не выдаётся ни при каком wordId", () => {
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const t = pickExerciseType({ memoryLevel: 0, isNew: true, english: "apple", wordId: id, now: NOW });
    assert.equal(t, "intro", `wordId=${id} isNew=true должен дать intro, получили ${t}`);
  }
});

test("memoryLevel 0 (не новое) всегда choiceRu — обратное направление слишком рано", () => {
  for (const id of [1, 2, 3, 4, 5, 6]) {
    const t = pickExerciseType({ memoryLevel: 0, isNew: false, english: "apple", wordId: id, now: NOW });
    assert.equal(t, "choiceRu", `wordId=${id} level=0 должен быть choiceRu, получили ${t}`);
  }
});

test("уровни 1–2: детерминированное чередование по cardSeed(wordId+день)", () => {
  // wordId=1 (apple): bit=1 → choiceEn; wordId=2 (bread): bit=0 → choiceRu
  assert.equal(pickExerciseType({ memoryLevel: 1, isNew: false, english: "apple", wordId: 1, now: NOW }), "choiceEn");
  assert.equal(pickExerciseType({ memoryLevel: 1, isNew: false, english: "bread", wordId: 2, now: NOW }), "choiceRu");
  assert.equal(pickExerciseType({ memoryLevel: 2, isNew: false, english: "apple", wordId: 1, now: NOW }), "choiceEn");
  assert.equal(pickExerciseType({ memoryLevel: 2, isNew: false, english: "bread", wordId: 2, now: NOW }), "choiceRu");
});

test("выдача детерминирована: одни и те же аргументы дают один и тот же результат", () => {
  for (const id of [1, 2, 3, 4]) {
    const a = pickExerciseType({ memoryLevel: 1, isNew: false, english: "apple", wordId: id, now: NOW });
    const b = pickExerciseType({ memoryLevel: 1, isNew: false, english: "apple", wordId: id, now: NOW });
    assert.equal(a, b, `wordId=${id} должен давать одинаковый результат`);
  }
});

test("при memoryLevel ≥ 1 оба направления встречаются в наборе слов", () => {
  const types = new Set<string>();
  for (let id = 1; id <= 10; id++) {
    types.add(pickExerciseType({ memoryLevel: 1, isNew: false, english: "apple", wordId: id, now: NOW }));
  }
  assert.ok(types.has("choiceRu"), "choiceRu должен встречаться среди разных wordId");
  assert.ok(types.has("choiceEn"), "choiceEn должен встречаться среди разных wordId");
});

test("уровни 3 и выше остаются без изменений", () => {
  const type = (level: number) => pickExerciseType({ memoryLevel: level, isNew: false, english: "apple", wordId: 1, now: NOW });
  assert.equal(type(3), "listen");
  assert.equal(type(4), "build");
  assert.equal(type(5), "build");
});

test("без wordId дефолт — choiceRu (безопасный фолбэк для обратной совместимости)", () => {
  assert.equal(pickExerciseType({ memoryLevel: 1, isNew: false, english: "apple" }), "choiceRu");
  assert.equal(pickExerciseType({ memoryLevel: 2, isNew: false, english: "apple" }), "choiceRu");
});

test("без озвучки аудирование заменяется choiceEn", () => {
  assert.equal(
    pickExerciseType({ memoryLevel: 3, isNew: false, english: "apple", allowListen: false, wordId: 1, now: NOW }),
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

test("choiceRu: спрашиваем английское слово, отвечаем переводом (wordId=2 → bit=0)", () => {
  // POOL[1] = word(2, "bread") → cardSeed(2,NOW)%2 = 0 → choiceRu
  const ex = buildExercise({ word: POOL[1]!, memoryLevel: 1, isNew: false, pool: POOL, now: NOW });
  assert.equal(ex.type, "choiceRu");
  assert.equal(ex.prompt, "bread");
  assert.equal(ex.options![ex.answerIndex!], "хлеб");
  assert.equal(ex.options!.length, OPTION_COUNT);
});

test("choiceEn: спрашиваем перевод, отвечаем английским словом (wordId=1 → bit=1)", () => {
  // POOL[0] = word(1, "apple") → cardSeed(1,NOW)%2 = 1 → choiceEn
  const ex = buildExercise({ word: POOL[0]!, memoryLevel: 1, isNew: false, pool: POOL, now: NOW });
  assert.equal(ex.type, "choiceEn");
  assert.equal(ex.prompt, "яблоко");
  assert.equal(ex.options![ex.answerIndex!], "apple");
  assert.equal(ex.answer, "apple");
});

test("buildExercise детерминирован: один wordId+now → одно и то же упражнение", () => {
  const a = buildExercise({ word: POOL[0]!, memoryLevel: 1, isNew: false, pool: POOL, now: NOW });
  const b = buildExercise({ word: POOL[0]!, memoryLevel: 1, isNew: false, pool: POOL, now: NOW });
  assert.equal(a.type, b.type);
  assert.deepEqual(a.options, b.options);
  assert.equal(a.answerIndex, b.answerIndex);
});

test("buildExercise выдаёт разные типы для разных wordId при одном уровне", () => {
  // wordId=1 (apple) → bit=1 → choiceEn; wordId=2 (bread) → bit=0 → choiceRu
  const en = buildExercise({ word: POOL[0]!, memoryLevel: 1, isNew: false, pool: POOL, now: NOW });
  const ru = buildExercise({ word: POOL[1]!, memoryLevel: 1, isNew: false, pool: POOL, now: NOW });
  assert.equal(en.type, "choiceEn");
  assert.equal(ru.type, "choiceRu");
});

test("build: даём перевод, ответ — слово, плитки перемешаны", () => {
  const ex = buildExercise({ word: POOL[0]!, memoryLevel: 4, isNew: false, pool: POOL, now: NOW });
  assert.equal(ex.type, "build");
  assert.equal(ex.prompt, "яблоко");
  assert.equal(ex.answer, "apple");
  assert.ok((ex.letters?.length ?? 0) > "apple".length);
});

test("само слово не попадает в свои же варианты (choiceRu)", () => {
  // POOL[1] = bread (wordId=2, bit=0 → choiceRu): варианты — русские переводы
  const ex = buildExercise({ word: POOL[1]!, memoryLevel: 1, isNew: false, pool: POOL, now: NOW });
  assert.equal(ex.type, "choiceRu");
  assert.equal(ex.options!.filter((o) => o === "хлеб").length, 1);
  // Не должно быть "bread" среди вариантов (они все русские)
  assert.equal(ex.options!.filter((o) => o === "bread").length, 0);
});

test("само слово не попадает в свои же варианты (choiceEn)", () => {
  // POOL[0] = apple (wordId=1, bit=1 → choiceEn): варианты — английские слова
  const ex = buildExercise({ word: POOL[0]!, memoryLevel: 1, isNew: false, pool: POOL, now: NOW });
  assert.equal(ex.type, "choiceEn");
  assert.equal(ex.options!.filter((o) => o === "apple").length, 1);
  // Не должно быть "яблоко" среди вариантов (они все английские)
  assert.equal(ex.options!.filter((o) => o === "яблоко").length, 0);
});

test("если подходящих слов нет совсем — падаем в знакомство, а не в пустой выбор", () => {
  const only = [POOL[0]!];
  // wordId=1 → choiceRu → pool пуст → intro
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
