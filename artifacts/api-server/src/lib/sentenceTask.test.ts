// Тесты режима «Собери предложение»: правила уровня, этикет, разбор ответа.
// Без БД и сети: node:test + node:assert.
//
//   pnpm --filter @workspace/api-server test
import test from "node:test";
import assert from "node:assert/strict";

import {
  LEVEL_RULES,
  buildTokens,
  checkSentence,
  decoyCount,
  expandContractions,
  hasBannedContent,
  isCefr,
  normalizeSentence,
  sameSentence,
  tokenize,
  validateTask,
  wordCount,
} from "./sentenceTask";

// ── уровни ──────────────────────────────────────────────────────────────────

test("уровень распознаётся, C2 в списке нет", () => {
  assert.equal(isCefr("A1"), true);
  assert.equal(isCefr("C1"), true);
  // C2 нет ни в каталоге слов, ни здесь: заданий такого уровня не бывает.
  assert.equal(isCefr("C2"), false);
  assert.equal(isCefr(""), false);
  assert.equal(isCefr(undefined), false);
});

test("границы длины растут вместе с уровнем и не пересекаются вниз", () => {
  const order = ["A1", "A2", "B1", "B2", "C1"] as const;
  for (let i = 1; i < order.length; i++) {
    const prev = LEVEL_RULES[order[i - 1]!];
    const cur = LEVEL_RULES[order[i]!];
    assert.ok(cur.maxWords >= prev.maxWords, `${order[i]} не короче предыдущего`);
    assert.ok(cur.minWords >= prev.minWords, `${order[i]} не проще предыдущего`);
  }
});

// ── что фильтр обязан отсечь ────────────────────────────────────────────────

const A1_OK = { ru: "Я люблю красные яблоки", en: "I like red apples" };

test("нормальное задание A1 проходит", () => {
  assert.deepEqual(validateTask(A1_OK, "A1"), { ok: true });
});

test("перепутанные местами языки не проходят", () => {
  // Самая частая ошибка модели: ru и en заполнены наоборот.
  const swapped = { ru: "I like red apples", en: "Я люблю яблоки" };
  assert.equal(validateTask(swapped, "A1").ok, false);
});

test("пустые поля не проходят", () => {
  assert.equal(validateTask({ ru: "", en: "I like apples" }, "A1").ok, false);
  assert.equal(validateTask({ ru: "Я люблю яблоки", en: "" }, "A1").ok, false);
  assert.equal(validateTask({}, "A1").ok, false);
});

test("предложение не с заглавной буквы не проходит", () => {
  // Иначе первая плитка выдаёт порядок: она одна с большой буквы.
  assert.equal(validateTask({ ru: "Я люблю яблоки", en: "i like red apples" }, "A1").ok, false);
});

test("слишком длинное предложение не проходит на A1, но проходит на B2", () => {
  const long = {
    ru: "Мой брат каждое утро ходит в школу вместе со своим лучшим другом",
    en: "My brother goes to school with his best friend every morning",
  };
  assert.equal(validateTask(long, "A1").ok, false);
  assert.equal(validateTask(long, "B2").ok, true);
});

test("слишком короткое предложение не проходит на старшем уровне", () => {
  // Три слова на C1 — это не задание, а подарок.
  assert.equal(validateTask({ ru: "Я читаю книги", en: "I read books" }, "C1").ok, false);
});

test("перфект не проходит на A1 и A2, но проходит на B1", () => {
  const perfect = {
    ru: "Я уже закончил домашнюю работу",
    en: "I have finished my homework already",
  };
  assert.equal(validateTask(perfect, "A1").ok, false);
  assert.equal(validateTask(perfect, "A2").ok, false);
  assert.equal(validateTask(perfect, "B1").ok, true);
});

test("пассив не проходит ниже B2", () => {
  const passive = {
    ru: "Это письмо было написано моей сестрой",
    en: "This letter was written by my sister",
  };
  assert.equal(validateTask(passive, "A2").ok, false);
  assert.equal(validateTask(passive, "B1").ok, false);
  assert.equal(validateTask(passive, "B2").ok, true);
});

test("сложное предложение не проходит на A1", () => {
  const complex = { ru: "Я останусь дома если будет дождь", en: "I stay home if it rains" };
  assert.equal(validateTask(complex, "A1").ok, false);
});

// ── учебный этикет ──────────────────────────────────────────────────────────

test("запрещённые темы не проходят ни на одном уровне", () => {
  const bad = [
    { ru: "Мой отец пьёт пиво по вечерам", en: "My father drinks beer in the evening" },
    { ru: "Солдат нёс с собой ружьё", en: "The soldier carried a gun with him" },
    { ru: "Его дедушка умер прошлой зимой", en: "His grandfather died last winter" },
    { ru: "Президент выступил перед выборами", en: "The president spoke before the election" },
    { ru: "Она сегодня очень глупая", en: "She is very stupid today" },
    { ru: "Он играл в казино", en: "He played in the casino yesterday" },
  ];
  for (const task of bad) {
    for (const level of ["A1", "A2", "B1", "B2", "C1"] as const) {
      assert.equal(validateTask(task, level).ok, false, `прошло: ${task.en} (${level})`);
    }
  }
});

test("этикет ловится и по русскому переводу, даже если английский чистый", () => {
  const sneaky = { ru: "Он быстро выпил вино", en: "He drank it quickly" };
  assert.equal(validateTask(sneaky, "A2").ok, false);
});

test("английские слова ищутся целиком, а не внутри других слов", () => {
  // Пропущенное плохое слово заметит пользователь и скажет. Выброшенное
  // НОРМАЛЬНОЕ задание не заметит никто — заданий просто станет меньше.
  assert.equal(hasBannedContent("The lesson has begun"), null);       // begun ≠ gun
  assert.equal(hasBannedContent("The soup is warm"), null);           // warm ≠ war
  assert.equal(hasBannedContent("She has a useful skill"), null);     // skill ≠ kill
  assert.equal(hasBannedContent("What is the date today"), null);     // дата, не свидание
  assert.equal(hasBannedContent("I bought a bar of chocolate"), null);
  assert.equal(hasBannedContent("My father is a police officer"), null);
  assert.equal(hasBannedContent("Where is the toilet"), null);
  assert.equal(hasBannedContent("Please shut the door"), null);
  assert.equal(hasBannedContent("He hit the ball hard"), null);
  assert.equal(hasBannedContent("This is a fat cat"), null);
});

test("русские стемы не залезают в соседние слова", () => {
  // Каждое из этих слов ловилось прошлой версией фильтра.
  assert.equal(hasBannedContent("Я люблю виноград"), null);       // вино
  assert.equal(hasBannedContent("Он очень богатый"), null);       // бог
  assert.equal(hasBannedContent("Мы открыли ворота"), null);      // вор
  assert.equal(hasBannedContent("Она пошла в библиотеку"), null); // библи
  assert.equal(hasBannedContent("Мама купила курицу"), null);     // курит
  assert.equal(hasBannedContent("Я пью воду"), null);             // водка
  assert.equal(hasBannedContent("Кровать стоит у окна"), null);   // кровь
  assert.equal(hasBannedContent("Это твой выбор"), null);         // выборы
  assert.equal(hasBannedContent("Надо убирать комнату"), null);   // убить
  assert.equal(hasBannedContent("Толстая книга на столе"), null);
});

test("сами запрещённые слова при этом ловятся", () => {
  assert.equal(hasBannedContent("He has a gun"), "gun");
  assert.equal(hasBannedContent("Он пил пиво"), "пиво");
  assert.equal(hasBannedContent("Дедушка умер"), "умер");
  assert.equal(hasBannedContent("Он был пьяный"), "пьян");
  assert.equal(hasBannedContent("Это оружие"), "оруж");
});

// ── плитки ──────────────────────────────────────────────────────────────────

test("плитки — слова предложения без точки в конце", () => {
  assert.deepEqual(tokenize("I like red apples."), ["I", "like", "red", "apples"]);
  assert.deepEqual(tokenize("Do you speak English?"), ["Do", "you", "speak", "English"]);
  // Апостроф внутри слова остаётся: don't — одна плитка, а не три.
  assert.deepEqual(tokenize("I don't know."), ["I", "don't", "know"]);
});

test("задание с плитками, из которых ответ не собрать, отбрасывается", () => {
  // Задание физически нерешаемо: ученик складывает слова, сервер ждёт другое.
  const broken = { ...A1_OK, tokens: ["I", "like", "green", "apples"] };
  assert.equal(validateTask(broken, "A1").ok, false);

  const fine = { ...A1_OK, tokens: ["apples", "I", "red", "like", "blue"] };
  assert.equal(validateTask(fine, "A1").ok, true);
});

test("в наборе плиток есть все нужные слова и есть лишние", () => {
  const en = "I like red apples";
  const tokens = buildTokens(en, ["green", "table", "quickly", "school"], 42);
  for (const w of tokenize(en)) {
    assert.ok(tokens.some((t) => t.toLowerCase() === w.toLowerCase()), `нет слова ${w}`);
  }
  assert.equal(tokens.length, tokenize(en).length + decoyCount(4));
});

test("слово из предложения не попадает в лишние плитки", () => {
  // Иначе на поле два одинаковых слова и одно из них «неверное» — ученик
  // ткнёт не в ту плитку и получит ошибку за верный ответ.
  const tokens = buildTokens("I like red apples", ["red", "apples", "green", "water"], 7);
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t.toLowerCase(), (counts.get(t.toLowerCase()) ?? 0) + 1);
  assert.equal(counts.get("red"), 1);
  assert.equal(counts.get("apples"), 1);
});

test("набор плиток стабилен для одного сида и различается между сидами", () => {
  const pool = ["green", "table", "quickly", "school", "water"];
  const a = buildTokens("I like red apples", pool, 100);
  const b = buildTokens("I like red apples", pool, 100);
  const c = buildTokens("I like red apples", pool, 999);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

// ── проверка ответа ─────────────────────────────────────────────────────────

test("пунктуация и регистр не влияют на правильность", () => {
  assert.equal(normalizeSentence("  I like  red apples. "), "i like red apples");
  assert.equal(sameSentence("i like red apples", "I like red apples."), true);
  assert.equal(sameSentence("Do you speak English", "Do you speak English?"), true);
});

test("сокращение и полная форма — один ответ", () => {
  assert.equal(expandContractions("i'm happy"), "i am happy");
  assert.equal(sameSentence("I am not hungry", "I'm not hungry"), true);
  assert.equal(sameSentence("I do not know", "I don't know"), true);
});

test("неверный порядок слов — ошибка с номером первого расхождения", () => {
  const v = checkSentence("I red like apples", "I like red apples");
  assert.equal(v.correct, false);
  // Первое слово совпало, второе разошлось. По этому номеру экран подсвечивает
  // место, а не просто ругается.
  assert.equal(v.firstWrongWord, 2);
});

test("пропущенное и лишнее слово называются отдельно", () => {
  const v = checkSentence("I like apples green", "I like red apples");
  assert.equal(v.correct, false);
  assert.deepEqual(v.missing, ["red"]);
  assert.deepEqual(v.extra, ["green"]);
});

test("верный ответ не разбирается на части", () => {
  const v = checkSentence("I like red apples.", "I like red apples");
  assert.deepEqual(v, { correct: true });
});

test("пустой ответ неверен и не роняет разбор", () => {
  const v = checkSentence("", "I like red apples");
  assert.equal(v.correct, false);
  assert.deepEqual(v.missing, ["i", "like", "red", "apples"]);
});

test("слов в предложении считаем по пробелам", () => {
  assert.equal(wordCount("I like red apples"), 4);
  assert.equal(wordCount("  I   like  apples "), 3);
});
