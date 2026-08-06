// Тесты правил аудита словаря (lib/wordAudit.ts). Без БД и сети: node:test.
//
// Что важно доказать: проверка НЕ ошибается в дорогую сторону. Ложное «слова в
// примере нет» удалит хороший пример, ложное «перевод неверный» затрёт честный
// синоним. Поэтому большая часть случаев здесь — про терпимость к формам слова
// и падежам, а не про ловлю ошибок.
import test from "node:test";
import assert from "node:assert/strict";
import {
  exampleIsUsable,
  exampleMentionsWord,
  exampleSenseMatches,
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
  // don't не должно разваливаться на don и t — иначе токены не совпадут
  assert.equal(normalizeText("I don't know"), "i dont know");
});

test("stripInfinitive снимает частицу to", () => {
  assert.equal(stripInfinitive("to buy"), "buy");
  assert.equal(stripInfinitive("tomato"), "tomato"); // не режем слова на to
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
  assert.equal(exampleMentionsWord("take care", "Please be careful."), "no");
});

test("подстрока внутри другого слова не считается совпадением", () => {
  // art внутри start — самая частая ловушка поиска подстрокой
  assert.equal(exampleMentionsWord("art", "Let us start now."), "no");
});

test("неправильный глагол не объявляется ошибкой", () => {
  // bought мы вывести не умеем, но и удалять пример за это нельзя
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

test("чужое значение ловится", () => {
  // suit в колоде про одежду не может быть «иском»
  assert.equal(translationMatches("костюм", ["иск"]), false);
});

test("короткие разные слова не склеиваются по корню", () => {
  // порог общего корня — 5 букв, чтобы «дом» и «доска» не сошлись
  assert.equal(translationMatches("дом", ["доска"]), false);
});

test("пустой свежий перевод никого не обвиняет", () => {
  assert.equal(translationMatches("", ["что угодно"]), true);
});

// ── Значение примера ────────────────────────────────────────────────────────
test("ruStem отрезает изменяемый хвост", () => {
  assert.equal(ruStem("яблоко"), "яблок");
  assert.equal(ruStem("дом"), "дом"); // короткое не режем
});

test("перевод примера содержит перевод слова", () => {
  assert.equal(exampleSenseMatches(["яблоко"], "Я ем яблоко каждый день."), "yes");
});

test("падеж и число в примере не мешают", () => {
  assert.equal(exampleSenseMatches(["яблоко"], "Он купил зелёные яблоки."), "yes");
  assert.equal(exampleSenseMatches(["галстук"], "Он поправил галстука узел."), "yes");
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

test("глагол не судим: основа меняется при спряжении", () => {
  // «бежать» → «бежит»: правилом такую форму не вывести, обвинять нельзя
  assert.equal(exampleSenseMatches(["бежать"], "Он бежит каждое утро."), "maybe");
});

test("короткое слово не судим", () => {
  assert.equal(exampleSenseMatches(["дом"], "Совсем другая фраза."), "maybe");
});

test("без перевода примера сравнивать нечего", () => {
  assert.equal(exampleSenseMatches(["яблоко"], null), "maybe");
  assert.equal(exampleSenseMatches([], "Любая фраза."), "maybe");
});
