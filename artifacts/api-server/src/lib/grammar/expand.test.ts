// ─────────────────────────────────────────────────────────────────────────────
// Размножение заготовок по лицам.
//
// Тесты здесь важнее обычных: размножение делает из одной строки данных до шести
// заготовок и до сорока заданий. Ошибка в одной клетке таблицы русских форм даёт
// не одно кривое задание, а сотню — и увидит их ученик, потому что глазами
// четыре тысячи заданий никто не перечитает.
//
// Поэтому проверяется не только механика, но и САМИ ДАННЫЕ: русская форма из
// таблицы сверяется с той, что автор написал в заготовке руками. Если они
// разошлись, значит либо в таблице опечатка, либо в заготовке — и падать это
// должно на сборке.
//
// ГРАБЛИ ПРО ПРОВЕРКИ. Русский текст нельзя проверять через \b: в JavaScript
// граница слова знает только латиницу, поэтому /\bне\b/ не совпадает никогда.
// Для кириллицы границу пишем руками: (^|\s).
import test from "node:test";
import assert from "node:assert/strict";

import { SENTENCE_UNITS } from "./sentenceUnits";
import { RU_VERBS, SWAP_SUBJECTS, ruVerbForm, type RuTense } from "./ruForms";
import {
  expandUnits,
  generateAssembleTasks,
  generateTenseTasks,
} from "./generate";

const EXPANDED = expandUnits();
const TENSE_TASKS = generateTenseTasks();
const ASSEMBLE = generateAssembleTasks();

const SWAPPABLE = SENTENCE_UNITS.filter((u) => u.swap);

/** Русское время перевода — то же правило, что в генераторе. */
function ruTenseOf(tense: string, override?: RuTense): RuTense {
  if (override) return override;
  if (tense === "present_simple" || tense === "present_continuous") return "present";
  if (tense === "future_simple") return "future";
  return "past";
}

// ── Данные ──────────────────────────────────────────────────────────────────

test("размножаемая заготовка полностью снаряжена", () => {
  for (const u of SWAPPABLE) {
    assert.ok(u.ruSubject, `${u.id}: swap без ruSubject`);
    assert.ok(u.ruVerbKey, `${u.id}: swap без ruVerbKey`);
    assert.ok(RU_VERBS[u.ruVerbKey!], `${u.id}: глагола «${u.ruVerbKey}» нет в таблице форм`);
  }
});

test("перевод начинается с заявленного подлежащего", () => {
  // Иначе подменять нечего: подстановка в середину дала бы «ОсеньюОни идёт дождь».
  for (const u of SWAPPABLE) {
    assert.ok(
      u.ru.startsWith(u.ruSubject!),
      `${u.id}: перевод «${u.ru}» не начинается с «${u.ruSubject}»`,
    );
    if (u.ruNeg) {
      assert.ok(
        u.ruNeg.startsWith(u.ruSubject!),
        `${u.id}: перевод отрицания не начинается с «${u.ruSubject}»`,
      );
    }
  }
});

test("таблица форм совпадает с тем, что написано в заготовке", () => {
  // Самая ценная проверка файла: сверяет данные с данными. Опечатка в таблице
  // («ложиться» вместо «ложится») иначе разъехалась бы молча.
  for (const u of SWAPPABLE) {
    const own = SWAP_SUBJECTS.find((s) => s.person === u.person);
    assert.ok(own, `${u.id}: лицо ${u.person} не описано в SWAP_SUBJECTS`);
    const form = ruVerbForm(u.ruVerbKey!, ruTenseOf(u.tense, u.ruTense), own!);
    assert.equal(
      form,
      u.ruVerb,
      `${u.id}: в таблице «${form}», в заготовке «${u.ruVerb}»`,
    );
  }
});

test("нужное время у глагола заполнено", () => {
  for (const u of SWAPPABLE) {
    const tense = ruTenseOf(u.tense, u.ruTense);
    const forms = RU_VERBS[u.ruVerbKey!]!;
    const row = tense === "past" ? forms.past : tense === "future" ? forms.future : forms.present;
    assert.ok(row, `${u.id}: у «${u.ruVerbKey}» не заполнено время ${tense}`);
    for (const value of row!) {
      assert.ok(value.trim().length > 0, `${u.id}: пустая форма у «${u.ruVerbKey}»`);
    }
  }
});

// ── Развёрнутый список ──────────────────────────────────────────────────────

test("базовые заготовки сохранили свои номера", () => {
  // На них ссылаются тесты генератора, и они же — вычитанные предложения.
  const ids = new Set(EXPANDED.map((u) => u.id));
  for (const u of SENTENCE_UNITS) {
    assert.ok(ids.has(u.id), `${u.id}: базовая заготовка исчезла из развёрнутого списка`);
  }
});

test("номера развёрнутых заготовок уникальны", () => {
  const ids = EXPANDED.map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("каждая размножаемая заготовка дала варианты по всем лицам", () => {
  for (const u of SWAPPABLE) {
    const variants = EXPANDED.filter((x) => x.id.startsWith(`${u.id}-`));
    // Шесть лиц минус родное: пять вариантов, если подлежащее — местоимение,
    // и шесть, если существительное («My father» → He тоже нужен).
    assert.ok(
      variants.length >= 5,
      `${u.id}: вариантов всего ${variants.length}`,
    );
    for (const v of variants) {
      assert.equal(v.tense, u.tense, `${v.id}: время поехало`);
      assert.equal(v.level, u.level, `${v.id}: уровень поехал`);
      assert.equal(v.verb, u.verb, `${v.id}: глагол поехал`);
    }
  }
});

test("неразмножаемая заготовка вариантов не даёт", () => {
  for (const u of SENTENCE_UNITS) {
    if (u.swap) continue;
    const variants = EXPANDED.filter((x) => x.id.startsWith(`${u.id}-`));
    assert.equal(variants.length, 0, `${u.id}: размножилась без разрешения`);
  }
});

test("подлежащее и русская форма меняются вместе", () => {
  const they = EXPANDED.find((u) => u.id === "u-ps-1-they");
  assert.ok(they, "вариант u-ps-1-they не собрался");
  assert.equal(they!.subject, "They");
  assert.equal(they!.person, "they");
  assert.equal(they!.ruVerb, "ложатся");
  assert.equal(they!.ru, "Они {} спать в десять");

  const she = EXPANDED.find((u) => u.id === "u-pst-3-she");
  assert.ok(she, "вариант u-pst-3-she не собрался");
  // Прошедшее время: у «она» своя форма, и это ровно то, чего не умеет
  // английская механика.
  assert.equal(she!.ruVerb, "играла");
  assert.equal(she!.ru, "Она {} в футбол вчера");
});

// ── Притяжательное ──────────────────────────────────────────────────────────

test("метка {poss} нигде не осталась", () => {
  for (const u of EXPANDED) {
    assert.equal(u.rest.includes("{poss}"), false, `${u.id}: метка в хвосте`);
    assert.equal(u.restNeg?.includes("{poss}") ?? false, false, `${u.id}: метка в хвосте отрицания`);
  }
  for (const t of TENSE_TASKS) {
    assert.equal(t.text.includes("{poss}"), false, `${t.id}: метка в тексте задания`);
  }
  for (const t of ASSEMBLE) {
    assert.equal(t.en.includes("{poss}"), false, `${t.id}: метка в предложении`);
  }
});

test("у родного лица притяжательное осталось прежним", () => {
  // До появления метки в этих заготовках стояли готовые her/our — базовый
  // вариант обязан выглядеть точно так же, иначе правка задним числом изменила
  // бы вычитанные предложения.
  const own = (id: string) => EXPANDED.find((u) => u.id === id);
  assert.equal(own("u-ps-3")?.rest, "her homework");
  assert.equal(own("u-pst-7")?.rest, "our friends on Saturday");
  assert.equal(own("u-pp-1")?.rest, "my homework already");
  assert.equal(own("u-pp-1")?.restNeg, "my homework yet");
});

test("притяжательное следует за подлежащим", () => {
  const cases: Array<[string, string]> = [
    ["u-ps-3-i", "my homework"],
    ["u-ps-3-they", "their homework"],
    ["u-ps-3-you", "your homework"],
    ["u-pp-1-she", "her homework already"],
  ];
  for (const [id, rest] of cases) {
    assert.equal(EXPANDED.find((u) => u.id === id)?.rest, rest, `${id}: не то притяжательное`);
  }
});

test("в хвосте нет объектного местоимения того же лица", () => {
  // Ровно тот класс ошибок, из-за которого часть заготовок не размножается:
  // «You will call you», «I will help me with my homework».
  const clash: Record<string, string> = { I: "me", you: "you", we: "us" };
  for (const u of EXPANDED) {
    const bad = clash[u.person];
    if (!bad) continue;
    const tail = ` ${u.rest} ${u.restNeg ?? ""} `.toLowerCase();
    assert.equal(
      tail.includes(` ${bad} `),
      false,
      `${u.id}: «${bad}» в хвосте при подлежащем ${u.subject}`,
    );
  }
});

// ── Механика на развёрнутых заготовках ──────────────────────────────────────

test("be согласуется с новым подлежащим", () => {
  const byId = (id: string) => TENSE_TASKS.find((t) => t.id === id);
  // Заготовка написана для «I», варианты обязаны получить свои формы be.
  assert.deepEqual(byId("g-u-pc-2-he-aff")?.accept, ["is reading"]);
  assert.deepEqual(byId("g-u-pc-2-they-aff")?.accept, ["are reading"]);
  // …а «I» — остаться с am, включая сокращение.
  assert.deepEqual(byId("g-u-pc-2-aff")?.accept, ["am reading", "'m reading"]);
});

test("третье лицо получает -s только там, где нужно", () => {
  const byId = (id: string) => TENSE_TASKS.find((t) => t.id === id);
  assert.deepEqual(byId("g-u-ps-2-he-aff")?.accept, ["drinks"]);
  assert.deepEqual(byId("g-u-ps-2-they-aff")?.accept, ["drink"]);
  assert.deepEqual(byId("g-u-ps-1-i-aff")?.accept, ["go"]);
});

test("have и has выбираются по новому подлежащему", () => {
  const byId = (id: string) => TENSE_TASKS.find((t) => t.id === id);
  assert.deepEqual(byId("g-u-pp-2-they-qa")?.accept, ["Have"]);
  assert.deepEqual(byId("g-u-pp-2-he-qa")?.accept, ["Has"]);
});

test("перевод варианта собран целиком и без остатков шаблона", () => {
  for (const t of TENSE_TASKS) {
    assert.equal(t.ru.includes("{}"), false, `${t.id}: в переводе остался {}`);
    assert.equal(/\s{2}/.test(t.ru), false, `${t.id}: двойной пробел в переводе`);
    assert.ok(t.ru.length > 3, `${t.id}: перевод пустой`);
  }
});

test("в отрицании «не» стоит перед глаголом и у вариантов", () => {
  // Кириллица и \b несовместимы, см. шапку файла.
  const neg = TENSE_TASKS.filter((t) => t.form === "negative" && t.id.includes("-they-"));
  assert.ok(neg.length > 50, `вариантов отрицания всего ${neg.length}`);
  for (const t of neg) {
    assert.match(t.ru, /(^|\s)не\s/, `${t.id}: в переводе нет «не»`);
  }
});

// ── Объём: то, ради чего всё делалось ───────────────────────────────────────

test("заготовок стало в несколько раз больше", () => {
  assert.ok(
    EXPANDED.length >= SENTENCE_UNITS.length * 3,
    `развёрнуто ${EXPANDED.length} из ${SENTENCE_UNITS.length} — размножение почти не сработало`,
  );
});

test("банк заданий вырос до сотен заходов", () => {
  // Заход — 12 заданий. Полторы тысячи заданий на времена это 125 заходов без
  // единого повтора; было 58 на всё, включая уровни выше.
  assert.ok(TENSE_TASKS.length >= 1500, `заданий на времена всего ${TENSE_TASKS.length}`);
  assert.ok(ASSEMBLE.length >= 1000, `заданий на сборку всего ${ASSEMBLE.length}`);
});
