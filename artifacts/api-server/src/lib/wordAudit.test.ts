// Тесты правил аудита словаря (lib/wordAudit.ts). Без БД и сети: node:test.
//
// Что важно доказать: проверка НЕ ошибается в дорогую сторону. Ложное «слова в
// примере нет» удалит хороший пример, ложное «перевод неверный» затрёт верный
// перевод. Поэтому большая часть случаев здесь — про терпимость: к формам
// слова, падежам, многозначности и идиомам.
//
// Раздел «ложные срабатывания» собран с живых данных: каждый случай там —
// карточка, которую аудит собирался испортить.
import test from "node:test";
import assert from "node:assert/strict";
import {
  exampleIsUsable,
  exampleMentionsWord,
  exampleSenseMatches,
  isPhrase,
  normalizeRu,
  normalizeText,
  ruStem,
  stripInfinitive,
  translationMatches,
  wordForms,
} from "./wordAudit";

// ── Нормализация ────────────────────────────────────────────────────────────
test("normalizeText убирает пунктуацию и регистр", () => {
  assert.equal(normalizeText("  I eat an APPLE, daily! "), "i eat an apple daily");
});

test("normalizeText склеивает слово с апострофом", () => {
  assert.equal(normalizeText("I don't know"), "i dont know");
});

test("stripInfinitive снимает частицу to", () => {
  assert.equal(stripInfinitive("to buy"), "buy");
  assert.equal(stripInfinitive("tomato"), "tomato"); // не режем слова на to
});

// ── Распознавание выражений ─────────────────────────────────────────────────
test("словосочетание распознаётся как фраза", () => {
  assert.equal(isPhrase("a piece of cake"), true);
  assert.equal(isPhrase("take care of"), true);
});

test("инфинитив фразой не считается", () => {
  assert.equal(isPhrase("to buy"), false);
  assert.equal(isPhrase("apple"), false);
});

// ── Формы слова ─────────────────────────────────────────────────────────────
test("wordForms знает правило y → ies", () => {
  const forms = wordForms("study");
  assert.ok(forms.includes("studies"));
  assert.ok(forms.includes("studied"));
});

test("wordForms знает удвоение согласной", () => {
  assert.ok(wordForms("run").includes("running"));
  assert.ok(wordForms("stop").includes("stopped"));
});

test("wordForms снимает немую e", () => {
  assert.ok(wordForms("make").includes("making"));
});

// ── Пример содержит слово ───────────────────────────────────────────────────
test("пример со словом в исходной форме", () => {
  assert.equal(exampleMentionsWord("apple", "I eat an apple every day."), "yes");
});

test("пример со словом в другой форме", () => {
  assert.equal(exampleMentionsWord("run", "He runs every morning."), "yes");
  assert.equal(exampleMentionsWord("study", "She studies at night."), "yes");
});

test("фраза ищется целиком", () => {
  assert.equal(exampleMentionsWord("take care", "Please take care of yourself."), "yes");
});

test("подстрока внутри другого слова не считается совпадением", () => {
  // art внутри start — самая частая ловушка поиска подстрокой
  assert.equal(exampleMentionsWord("art", "Let us start now."), "no");
});

test("неправильный глагол не объявляется ошибкой", () => {
  assert.equal(exampleMentionsWord("to buy", "She bought a new car."), "maybe");
  assert.equal(exampleMentionsWord("go", "He went home."), "maybe");
});

test("пример без слова признаётся негодным", () => {
  assert.equal(exampleMentionsWord("apple", "The sky is blue today."), "no");
});

test("exampleIsUsable удаляет только доказанный мусор", () => {
  assert.equal(exampleIsUsable("apple", "The sky is blue today."), false);
  assert.equal(exampleIsUsable("go", "He went home."), true); // спорное оставляем
  assert.equal(exampleIsUsable("apple", null), false);
});

// ── Переводы ────────────────────────────────────────────────────────────────
test("normalizeRu приводит ё к е", () => {
  assert.equal(normalizeRu("Ёлка"), "елка");
});

test("перевод совпадает при разном наборе синонимов", () => {
  assert.equal(translationMatches("костюм", ["костюм, комплект"]), true);
  assert.equal(translationMatches("костюм", ["комплект", "костюм"]), true);
});

test("падеж не считается расхождением", () => {
  assert.equal(translationMatches("костюм", ["костюма"]), true);
});

test("многозначность: совпало хоть одно значение — перевод верный", () => {
  const senses = ["ничья", "галстук", "связывать"];
  assert.equal(translationMatches(senses, ["галстук"]), true);
  assert.equal(translationMatches(senses, ["связывать"]), true);
});

test("ошибка — только полное непопадание", () => {
  assert.equal(translationMatches(["костюм", "комплект"], ["иск"]), false);
});

test("пустой список значений никого не обвиняет", () => {
  assert.equal(translationMatches("", ["что угодно"]), true);
  assert.equal(translationMatches([], ["что угодно"]), true);
});

// ── Основа русского слова ───────────────────────────────────────────────────
test("ruStem снимает окончание", () => {
  assert.equal(ruStem("кухня"), ruStem("кухне"));
  assert.equal(ruStem("стена"), ruStem("стене"));
  assert.equal(ruStem("дикий"), ruStem("дикие"));
  assert.equal(ruStem("яблоко"), ruStem("яблоки"));
});

test("ruStem не сводит разные слова к одному", () => {
  assert.notEqual(ruStem("дом"), ruStem("доска"));
  assert.notEqual(ruStem("галстук"), ruStem("счет"));
});

// ── Значение примера ────────────────────────────────────────────────────────
test("перевод примера содержит перевод слова", () => {
  assert.equal(exampleSenseMatches(["яблоко"], "Я ем яблоко каждый день."), "yes");
});

test("пример о другом значении ловится", () => {
  // Дословно с карточки: tie переведено как «галстук», а пример про ничью
  assert.equal(
    exampleSenseMatches(["галстук"], "Два аута в конце девятого раунда, ничейный счет."),
    "no",
  );
});

test("любое из значений подходит", () => {
  assert.equal(exampleSenseMatches(["галстук", "ничья"], "Матч закончился ничьей."), "yes");
});

test("у выражения значение примера не судим", () => {
  assert.equal(
    exampleSenseMatches(["проще простого"], "Экзамен оказался лёгким.", { phrase: true }),
    "maybe",
  );
});

test("глагол не судим: основа меняется при спряжении", () => {
  assert.equal(exampleSenseMatches(["бежать"], "Он бежит каждое утро."), "maybe");
});

test("без перевода примера сравнивать нечего", () => {
  assert.equal(exampleSenseMatches(["яблоко"], null), "maybe");
  assert.equal(exampleSenseMatches([], "Любая фраза."), "maybe");
});

// ── Ложные срабатывания с живых данных ──────────────────────────────────────
// Каждая карточка ниже была в отчёте как «пример о другом значении» или
// «в примере нет слова», хотя пример нормальный. Это регрессионный щит:
// правила легко починить и так же легко сломать обратно.

test("кухня находится в «на кухне»", () => {
  assert.equal(exampleSenseMatches(["кухня"], "Она готовит на кухне."), "yes");
});

test("стена находится в «на стене»", () => {
  assert.equal(exampleSenseMatches(["стена"], "На стене висит картина."), "yes");
});

test("дикий находится в «дикие животные»", () => {
  assert.equal(exampleSenseMatches(["дикий"], "Это дикие животные, а не питомцы."), "yes");
});

test("вкусный находится в «был вкусным»", () => {
  assert.equal(exampleSenseMatches(["вкусный"], "Суп был совершенно вкусным."), "yes");
});

test("движение находится в «плотное движение»", () => {
  assert.equal(exampleSenseMatches(["движение"], "Сегодня утром плотное движение."), "yes");
});

test("grow up находится в «I grew up»", () => {
  // Неправильный глагол внутри фразы: дословного «grow up» в тексте нет
  assert.equal(exampleMentionsWord("grow up", "I grew up in a small village."), "maybe");
});

test("фраза с правильным глаголом всё ещё проверяется", () => {
  // Здесь ошибаться не страшно: обе части обычные, и ни одной в тексте нет
  assert.equal(exampleMentionsWord("look after", "The sky is blue today."), "no");
});
