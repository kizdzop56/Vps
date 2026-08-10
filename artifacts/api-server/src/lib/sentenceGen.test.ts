// Запас предложений обязан соответствовать тем же правилам, что и всё, что
// приходит от модели. Правила уровней будут двигаться, и предложение, выпавшее
// из своего уровня, глазами в списке из тридцати штук не заметишь.
//
//   pnpm --filter @workspace/api-server test
import test from "node:test";
import assert from "node:assert/strict";

import { SEEDS_FOR_TESTS } from "./sentenceGen";
import { CEFR_LEVELS, LEVEL_RULES, validateTask, wordCount } from "./sentenceTask";

test("каждое предложение запаса проходит проверку своего уровня", () => {
  for (const level of CEFR_LEVELS) {
    for (const task of SEEDS_FOR_TESTS[level]) {
      const verdict = validateTask({ ru: task.ru, en: task.en }, level);
      assert.equal(
        verdict.ok,
        true,
        // Причина в сообщении: иначе падение теста говорит только «что-то не так».
        `${level} «${task.en}» — ${verdict.ok ? "" : verdict.reason}`,
      );
    }
  }
});

test("запас есть на каждом уровне и его хватает на короткую сессию", () => {
  for (const level of CEFR_LEVELS) {
    const seeds = SEEDS_FOR_TESTS[level];
    // Меньше пяти — и при недоступной модели ученик увидит одно и то же
    // предложение дважды за один заход.
    assert.ok(seeds.length >= 5, `${level}: всего ${seeds.length} предложений`);
  }
});

test("у каждого предложения запаса есть пояснение правила", () => {
  // Пояснение показывается после ошибки. Без него разбор ошибки превращается в
  // «неправильно, вот верный ответ» — то есть ни во что.
  for (const level of CEFR_LEVELS) {
    for (const task of SEEDS_FOR_TESTS[level]) {
      assert.ok((task.note ?? "").length > 10, `${level} «${task.en}» без пояснения`);
    }
  }
});

test("предложения внутри уровня не повторяются", () => {
  for (const level of CEFR_LEVELS) {
    const all = SEEDS_FOR_TESTS[level].map((t) => t.en.toLowerCase());
    assert.equal(new Set(all).size, all.length, `${level}: есть дубликаты`);
  }
});

test("длина предложений запаса лежит внутри границ уровня", () => {
  for (const level of CEFR_LEVELS) {
    const rule = LEVEL_RULES[level];
    for (const task of SEEDS_FOR_TESTS[level]) {
      const n = wordCount(task.en);
      assert.ok(
        n >= rule.minWords && n <= rule.maxWords,
        `${level} «${task.en}»: ${n} слов, нужно ${rule.minWords}–${rule.maxWords}`,
      );
    }
  }
});
