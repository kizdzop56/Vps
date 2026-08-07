// Тесты свободного ответа. Без БД и express: node:test + node:assert.
//
//   pnpm exec tsx --test artifacts/api-server/src/lib/answerCheck.test.ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  SPEAK_MAX_ATTEMPTS,
  checkSpoken,
  checkWritten,
  editDistance,
  normalizeAnswer,
  stripOptionalWords,
} from "./answerCheck";

test("оформление ответа не влияет на правильность", () => {
  assert.equal(normalizeAnswer("  Кот.  "), "кот");
  assert.equal(normalizeAnswer("Ёжик"), "ежик");
  assert.equal(normalizeAnswer("«привет»"), "привет");
  assert.equal(normalizeAnswer("don’t"), "don't");
  assert.equal(normalizeAnswer("a   glass  of water"), "a glass of water");
});

test("артикли и to не обязательны", () => {
  assert.equal(stripOptionalWords("to run"), "run");
  assert.equal(stripOptionalWords("a glass of water"), "glass of water");
  // Ответ, состоящий только из служебного слова, не должен исчезнуть в пустоту.
  assert.equal(stripOptionalWords("the"), "the");

  assert.equal(checkWritten("run", ["to run"]).correct, true);
  assert.equal(checkWritten("To Run", ["run"]).correct, true);
  assert.equal(checkWritten("glass of water", ["a glass of water"]).correct, true);
});

test("принимается любой перевод карточки, не только первый", () => {
  const expected = ["кудрявый", "вьющийся"];
  assert.equal(checkWritten("вьющийся", expected).correct, true);
  assert.equal(checkWritten("кудрявый", expected).correct, true);
});

test("одна опечатка прощается в длинных словах", () => {
  const verdict = checkWritten("кудрявй", ["кудрявый"]);
  assert.equal(verdict.correct, true);
  // Помечаем как опечатку: клиент показывает верное написание.
  assert.equal(verdict.typo, true);
  assert.equal(verdict.matched, "кудрявый");
});

test("в коротких словах опечатка не прощается", () => {
  // cat/cut, hat/hot — это разные слова, а не описка.
  assert.equal(checkWritten("cut", ["cat"]).correct, false);
  assert.equal(checkWritten("hot", ["hat"]).correct, false);
  assert.equal(checkWritten("кот", ["кит"]).correct, false);
});

test("две опечатки — уже неверно", () => {
  assert.equal(checkWritten("кудрвй", ["кудрявый"]).correct, false);
});

test("пустой ответ неверен", () => {
  assert.equal(checkWritten("", ["кот"]).correct, false);
  assert.equal(checkWritten("   ", ["кот"]).correct, false);
});

test("расстояние Левенштейна не считает дальше предела", () => {
  assert.equal(editDistance("кот", "кот"), 0);
  assert.equal(editDistance("кот", "кит"), 1);
  // Больше предела — точное значение не нужно, важно лишь «дальше некуда».
  assert.ok(editDistance("кот", "собака", 1) > 1);
});

test("произношение: до трёх попыток, потом ошибка", () => {
  const expected = ["curly"];

  const first = checkSpoken("girlie", expected, 1);
  assert.equal(first.correct, false);
  assert.equal(first.retry, true, "после первой неудачи просим повторить");
  assert.equal(first.attemptsLeft, SPEAK_MAX_ATTEMPTS - 1);

  const second = checkSpoken("girlie", expected, 2);
  assert.equal(second.retry, true);

  const third = checkSpoken("girlie", expected, SPEAK_MAX_ATTEMPTS);
  assert.equal(third.correct, false);
  assert.equal(third.retry, false, "попытки кончились — засчитываем ошибку");
  assert.equal(third.attemptsLeft, 0);
});

test("произношение: верный ответ закрывает упражнение сразу", () => {
  const ok = checkSpoken("Curly.", ["curly"], 1);
  assert.equal(ok.correct, true);
  assert.equal(ok.retry, false);
});

test("произношение: осечка распознавания на одну букву прощается", () => {
  // Детский голос и микрофон телефона регулярно дают такую расшифровку.
  const verdict = checkSpoken("treasur chest", ["treasure chest"], 1);
  assert.equal(verdict.correct, true);
  assert.equal(verdict.typo, true);
});
