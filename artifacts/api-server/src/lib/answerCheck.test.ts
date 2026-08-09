// Тесты свободного ответа. Без БД и express: node:test + node:assert.
//
//   pnpm --filter @workspace/api-server test
import test from "node:test";
import assert from "node:assert/strict";

import {
  MIN_STEM_LENGTH,
  SPEAK_MAX_ATTEMPTS,
  checkSpoken,
  checkWritten,
  editDistance,
  normalizeAnswer,
  sameStem,
  stemRu,
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

// ── формы русского слова ────────────────────────────────────────────────────

test("good: «хорошо» засчитывается, хотя в карточке «хороший»", () => {
  // Ровно тот случай, на котором это вылезло: ребёнок ответил верно, а
  // приложение сказало «Неверно. Правильный ответ: хороший».
  const verdict = checkWritten("хорошо", ["хороший"]);
  assert.equal(verdict.correct, true);
  // Не «почти верно»: другая форма слова — это не описка.
  assert.equal(verdict.typo, false);
  assert.equal(verdict.matched, "хороший");
});

test("пары прилагательное/наречие принимаются в обе стороны", () => {
  assert.equal(checkWritten("плохо", ["плохой"]).correct, true);
  assert.equal(checkWritten("плохой", ["плохо"]).correct, true);
  assert.equal(checkWritten("быстро", ["быстрый"]).correct, true);
  assert.equal(checkWritten("красивый", ["красиво"]).correct, true);
});

test("падеж и число не делают ответ неверным", () => {
  assert.equal(checkWritten("школе", ["школа"]).correct, true);
  assert.equal(checkWritten("собаки", ["собака"]).correct, true);
  assert.equal(checkWritten("тетради", ["тетрадь"]).correct, true);
});

test("основа — это слово без ОДНОГО окончания", () => {
  assert.equal(stemRu("хороший"), "хорош");
  assert.equal(stemRu("хорошо"), "хорош");
  assert.equal(stemRu("школа"), "школ");
  // Длинное окончание отбрасывается раньше короткого: иначе от слова
  // отрезался бы не тот кусок.
  assert.equal(stemRu("красивыми"), "красив");
  assert.equal(stemRu("плохой"), "плох");
});

test("короткие слова не режем: там окончание — это само слово", () => {
  // Обе стороны границы. Основа ровно в MIN_STEM_LENGTH букв — уже можно.
  assert.equal(stemRu("плох").length, MIN_STEM_LENGTH);
  assert.equal(stemRu("плохой"), "плох");
  // Короче — слово остаётся целым.
  assert.equal(stemRu("дома"), "дома");
  assert.equal(stemRu("кот"), "кот");
  assert.equal(stemRu("мышь"), "мышь");
  assert.equal(stemRu("есть"), "есть");

  // И, главное, разные короткие слова не слипаются.
  assert.equal(checkWritten("кит", ["кот"]).correct, false);
  assert.equal(checkWritten("стул", ["стол"]).correct, false);
});

test("одно окончание за раз: работа и работать — разные ответы", () => {
  assert.notEqual(stemRu("работать"), stemRu("работа"));
  assert.equal(checkWritten("работать", ["работа"]).correct, false);
});

test("ответ из нескольких слов должен сойтись целиком", () => {
  assert.equal(sameStem("хорошая погода", "хорошей погоды"), true);
  // Разное число слов — разные ответы, сравнивать нечего.
  assert.equal(sameStem("хорошая погода", "погода"), false);
  assert.equal(checkWritten("погода", ["хорошая погода"]).correct, false);
});

test("на английский разбор окончаний не распространяется", () => {
  // stemRu не трогает латиницу, поэтому сравнение основ вырождается в обычное
  // равенство и ничего не разрешает сверх прежнего.
  assert.equal(stemRu("running"), "running");
  assert.equal(checkWritten("runs", ["run"]).correct, false);
  assert.equal(checkWritten("cats", ["cat"]).correct, false);
});

test("известный размен: дорога и дорогой дают одну основу", () => {
  // Не недосмотр, а осознанная цена правила. Сказать ребёнку «неверно», когда
  // он прав, дороже, чем изредка засчитать соседнее слово. Тест стоит здесь,
  // чтобы это не «починили» мимоходом, не прочитав, чем заплачено.
  assert.equal(checkWritten("дорогой", ["дорога"]).correct, true);
});

// ── опечатки ────────────────────────────────────────────────────────────────

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

// ── произношение ────────────────────────────────────────────────────────────

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
