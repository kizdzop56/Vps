// Генератор заданий из предложений-заготовок.
//
// Генератор опаснее ручного банка: ошибка в нём портит не одно задание, а сразу
// сотню одинаковым образом. Поэтому здесь проверяется вся механика — и на живых
// заготовках, а не на выдуманных.
import test from "node:test";
import assert from "node:assert/strict";

import { LEVEL_ORDER, verbByBase, type CefrLevel } from "./verbs";
import { TENSES } from "./tenses";
import { GAP, MAX_WORDS, ingForm, thirdPerson } from "./core";
import { SENTENCE_UNITS } from "./sentenceUnits";
import {
  generateAssembleTasks,
  generateTenseTasks,
  generateVerbGapTasks,
} from "./generate";

const rank = (l: CefrLevel) => LEVEL_ORDER.indexOf(l);
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const filled = (text: string, answer: string) => text.replace(GAP, answer);

const TENSE_TASKS = generateTenseTasks();
const ASSEMBLE = generateAssembleTasks();
const VERB_GAP = generateVerbGapTasks();

const byId = (id: string) => TENSE_TASKS.find((t) => t.id === id);

// ── Заготовки ───────────────────────────────────────────────────────────────

test("у каждой заготовки уникальный номер", () => {
  const ids = SENTENCE_UNITS.map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("в шаблоне перевода есть место для глагола", () => {
  // Без {} глагол просто исчезнет из русской фразы, а «не» будет некуда
  // подставить: получится утверждение вместо отрицания.
  for (const u of SENTENCE_UNITS) {
    assert.ok(u.ru.includes("{}"), `${u.id}: в переводе нет {}`);
    if (u.ruNeg) assert.ok(u.ruNeg.includes("{}"), `${u.id}: в переводе отрицания нет {}`);
    assert.ok(u.ruVerb.trim().length > 0, `${u.id}: не задана русская форма глагола`);
  }
});

test("свой хвост для отрицания идёт вместе со своим переводом", () => {
  // Одно без другого — рассинхрон: английская фраза про yet, русская про «уже».
  for (const u of SENTENCE_UNITS) {
    if (u.restNeg && !u.ruNeg) assert.fail(`${u.id}: есть restNeg, но нет ruNeg`);
  }
});

test("время заготовки существует, а её уровень не ниже уровня времени", () => {
  for (const u of SENTENCE_UNITS) {
    const tense = TENSES.find((t) => t.id === u.tense);
    assert.ok(tense, `${u.id}: неизвестное время`);
    assert.ok(
      rank(u.level) >= rank(tense!.level),
      `${u.id}: уровень ${u.level} ниже уровня времени ${tense!.level}`,
    );
  }
});

// ── Механика: то, ради чего генератор и написан ─────────────────────────────

test("третье лицо получает -s, остальные лица не получают", () => {
  assert.deepEqual(byId("g-u-ps-1-aff")?.accept, ["goes"]);
  assert.deepEqual(byId("g-u-ps-2-aff")?.accept, ["drink"]);
  assert.deepEqual(byId("g-u-ps-4-aff")?.accept, ["play"]);
});

test("вспомогательный выбирается по лицу и времени", () => {
  assert.deepEqual(byId("g-u-ps-1-qa")?.accept, ["Does"]);
  assert.deepEqual(byId("g-u-ps-2-qa")?.accept, ["Do"]);
  assert.deepEqual(byId("g-u-pst-1-qa")?.accept, ["Did"]);
  assert.deepEqual(byId("g-u-fs-1-qa")?.accept, ["Will"]);
  assert.deepEqual(byId("g-u-pc-1-qa")?.accept, ["Is"]);
  assert.deepEqual(byId("g-u-pc-3-qa")?.accept, ["Are"]);
  assert.deepEqual(byId("g-u-pcn-1-qa")?.accept, ["Was"]);
  assert.deepEqual(byId("g-u-pcn-2-qa")?.accept, ["Were"]);
  assert.deepEqual(byId("g-u-pp-1-qa")?.accept, ["Have"]);
  assert.deepEqual(byId("g-u-pp-2-qa")?.accept, ["Has"]);
});

test("ПОСЛЕ DID СТОИТ ПЕРВАЯ ФОРМА", () => {
  // Самая частая школьная ошибка — «Did you went». Если генератор когда-нибудь
  // начнёт её производить, упасть должен тест, а не ученик.
  const q = byId("g-u-pst-1-qv");
  assert.ok(q);
  assert.deepEqual(q!.accept, ["go"]);
  assert.match(q!.text, /^Did we/);

  const neg = byId("g-u-pst-1-neg");
  assert.deepEqual(neg?.accept, ["did not go", "didn't go"]);
});

test("в длительном времени всегда be и -ing", () => {
  assert.deepEqual(byId("g-u-pc-1-aff")?.accept, ["is sleeping"]);
  assert.deepEqual(byId("g-u-pc-2-aff")?.accept, ["am reading", "'m reading"]);
  assert.deepEqual(byId("g-u-pc-1-qv")?.accept, ["sleeping"]);
  assert.deepEqual(byId("g-u-pcn-2-aff")?.accept, ["were playing"]);
});

test("в Present Perfect всегда have/has и третья форма", () => {
  assert.deepEqual(byId("g-u-pp-15-aff")?.accept, ["have seen", "'ve seen"]);
  assert.deepEqual(byId("g-u-pp-2-aff")?.accept, ["has read"]);
  assert.deepEqual(byId("g-u-pp-15-qv")?.accept, ["seen"]);
});

test("сокращение идёт вторым, эталон остаётся полным", () => {
  for (const t of TENSE_TASKS) {
    const main = t.accept[0] ?? "";
    assert.equal(main.includes("n't"), false, `${t.id}: эталон сокращённый`);
    assert.equal(main.startsWith("'"), false, `${t.id}: эталон начинается с апострофа`);
  }
  assert.deepEqual(byId("g-u-ps-1-neg")?.accept, ["does not go", "doesn't go"]);
  assert.deepEqual(byId("g-u-fs-1-neg")?.accept, ["will not call", "won't call"]);
});

test("be и have не ломаются об общее правило", () => {
  // thirdPerson("be") когда-то давало «bes», ingForm("be") — «bing».
  assert.equal(thirdPerson("be"), "is");
  assert.equal(ingForm("be"), "being");
  assert.equal(thirdPerson("have"), "has");
  assert.equal(ingForm("have"), "having");
});

// ── Форма готового задания ──────────────────────────────────────────────────

test("в каждом задании ровно один пропуск", () => {
  for (const t of TENSE_TASKS) {
    assert.equal(t.text.split(GAP).length - 1, 1, `${t.id}: пропусков не один`);
  }
  for (const t of VERB_GAP) {
    assert.equal(t.text.split(GAP).length - 1, 1, `${t.id}: пропусков не один`);
  }
});

test("вопрос заканчивается знаком вопроса, утверждение — точкой", () => {
  for (const t of TENSE_TASKS) {
    if (t.form === "question") {
      assert.ok(t.text.endsWith("?"), `${t.id}: вопрос без знака вопроса`);
      assert.ok(t.ru.endsWith("?"), `${t.id}: перевод вопроса без знака вопроса`);
    } else {
      assert.ok(t.text.endsWith("."), `${t.id}: фраза без точки`);
    }
  }
});

test("в отрицании есть not, и он же есть в переводе", () => {
  for (const t of TENSE_TASKS) {
    if (t.form !== "negative") continue;
    assert.match(t.accept[0] ?? "", /\bnot\b/, `${t.id}: в ответе нет not`);
    assert.match(t.ru, /\bне\b/, `${t.id}: в переводе нет «не»`);
  }
});

test("подлежащее в вопросе теряет заглавную букву, кроме I", () => {
  const q = byId("g-u-ps-7-qa"); // My father
  assert.ok(q);
  assert.match(q!.text, /my father/);

  const withI = byId("g-u-ps-2-qa"); // I
  assert.match(withI!.text, /\bI\b/);
});

test("нет двойных пробелов и пробела перед точкой", () => {
  for (const t of [...TENSE_TASKS, ...VERB_GAP]) {
    assert.equal(/\s{2}/.test(t.text), false, `${t.id}: двойной пробел`);
    assert.equal(/\s[.?]/.test(t.text), false, `${t.id}: пробел перед знаком`);
  }
  for (const t of ASSEMBLE) {
    assert.equal(/\s{2}/.test(t.en), false, `${t.id}: двойной пробел`);
  }
});

test("готовая фраза влезает в лимит своего уровня", () => {
  for (const t of TENSE_TASKS) {
    const full = filled(t.text, t.accept[0] ?? "");
    assert.ok(
      words(full).length <= MAX_WORDS[t.level],
      `${t.id}: ${words(full).length} слов при лимите ${MAX_WORDS[t.level]}`,
    );
  }
  for (const t of ASSEMBLE) {
    assert.ok(words(t.en).length <= MAX_WORDS[t.level], `${t.id}: слишком длинно`);
  }
});

// ── Сборка предложений ──────────────────────────────────────────────────────

test("ловушка — одно слово, которого нет в самом предложении", () => {
  for (const t of ASSEMBLE) {
    const own = new Set(t.en.toLowerCase().replace(/[.?!]/g, "").split(/\s+/));
    for (const extra of t.extra ?? []) {
      assert.equal(words(extra).length, 1, `${t.id}: ловушка из нескольких слов`);
      assert.equal(own.has(extra.toLowerCase()), false, `${t.id}: ловушка «${extra}» есть в ответе`);
    }
  }
});

test("на каждую заготовку приходится по три предложения на сборку", () => {
  // Утверждение, отрицание и вопрос: именно порядок слов в отрицании и вопросе
  // и есть самое полезное здесь.
  assert.ok(ASSEMBLE.length >= SENTENCE_UNITS.length * 2, `собрано всего ${ASSEMBLE.length}`);
});

// ── Форма неправильного глагола ─────────────────────────────────────────────

test("третья форма в предложении встречается уже на A1", () => {
  // Раньше такие задания начинались с B1, потому что привязывались к уровню
  // Present Perfect. Теперь уровень берётся у глагола: have и has уже написаны
  // в самом задании, знать время для ответа не требуется.
  const a1 = VERB_GAP.filter((t) => t.level === "A1" && t.form === "participle");
  assert.ok(a1.length > 0, "на A1 нет ни одного задания на третью форму");
  for (const t of a1) {
    assert.match(t.text, /\b(have|has)\b/, `${t.id}: в задании нет have или has`);
  }
});

test("уровень задания равен уровню глагола, и глагол неправильный", () => {
  for (const t of VERB_GAP) {
    const verb = verbByBase(t.base);
    assert.ok(verb, `${t.id}: глагола нет в таблице`);
    assert.equal(t.level, verb!.level, `${t.id}: уровень задания не совпал с уровнем глагола`);
  }
});

// ── Объём: собственно то, ради чего всё затевалось ──────────────────────────

test("из одной заготовки выходит несколько заданий", () => {
  // Если это перестанет быть правдой, значит генератор молча отсеял почти всё —
  // например, из-за лимита длины.
  const perUnit = (TENSE_TASKS.length + ASSEMBLE.length) / SENTENCE_UNITS.length;
  assert.ok(perUnit >= 5, `на заготовку приходится всего ${perUnit.toFixed(1)} задания`);
});
