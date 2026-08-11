// Режим «Формы глаголов». Без БД и express: node:test + node:assert.
//
//   pnpm --filter @workspace/api-server test
import test from "node:test";
import assert from "node:assert/strict";

import { IRREGULAR_VERBS, LEVEL_ORDER, verbByBase, type CefrLevel } from "./verbs";
import {
  FORM_MASTERY_HITS,
  allFormTasks,
  formAnswers,
  formCard,
  formLine,
  formMistake,
  formTaskId,
  formTasksUpTo,
  parseFormTask,
} from "./forms";
import {
  SESSION_SIZE,
  buildGrammarSession,
  checkGrammarAnswer,
  edForm,
  findTask,
} from "./engine";

const NOW = new Date("2026-08-11T09:00:00.000Z");
const rank = (l: CefrLevel) => LEVEL_ORDER.indexOf(l);

/** Весь банк уровня целиком: size больше банка — значит без нарезки на порции. */
function wholePool(level: CefrLevel, mastered?: Set<string>) {
  return buildGrammarSession({ mode: "forms", level, now: NOW, size: 500, mastered }).cards;
}

// ── Номера заданий ──────────────────────────────────────────────────────────

test("номер задания разбирается обратно в глагол и форму", () => {
  const id = formTaskId("past", "buy");
  assert.equal(id, "vf:past:buy");
  const task = parseFormTask(id);
  assert.ok(task);
  assert.equal(task!.kind, "past");
  assert.equal(task!.verb.base, "buy");
});

test("мусорный номер даёт null, а не исключение", () => {
  assert.equal(parseFormTask("vf:past:notaverb"), null);
  assert.equal(parseFormTask("vf:bogus:buy"), null);
  assert.equal(parseFormTask("vf:past:"), null);
  assert.equal(parseFormTask("as-a1-1"), null);
  // Проверка ответа обязана отвечать «не найдено», а не падать пятисоткой.
  assert.equal(checkGrammarAnswer("vf:past:notaverb", "bought"), null);
});

test("номера уникальны и находятся общим поиском", () => {
  const ids = allFormTasks().map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);

  const found = findTask("vf:participle:see");
  assert.ok(found);
  assert.equal(found!.kind, "forms");
});

// ── Уровни ──────────────────────────────────────────────────────────────────

test("уровень задания равен уровню глагола", () => {
  for (const t of allFormTasks()) {
    assert.equal(
      t.level,
      t.verb.level,
      `${t.id}: задание уровня ${t.level} у глагола уровня ${t.verb.level}`,
    );
  }
});

test("все три формы спрашиваются с A1", () => {
  // Раньше третья форма была закрыта до B1 — по аналогии с предложениями, где
  // она приходит вместе с Present Perfect. Для таблицы форм это неверно: три
  // формы учат столбиком и целиком, и уронить из неё третью колонку молча
  // теперь нельзя.
  const a1 = formTasksUpTo("A1");
  const a1Verbs = IRREGULAR_VERBS.filter((v) => v.level === "A1");
  assert.ok(a1Verbs.length > 0, "на A1 нет ни одного глагола");

  for (const verb of a1Verbs) {
    for (const kind of ["toEn", "past", "participle"] as const) {
      assert.ok(
        a1.some((t) => t.verb.base === verb.base && t.kind === kind),
        `${verb.base}: на A1 не спрашивается форма «${kind}»`,
      );
    }
  }
  assert.equal(a1.length, a1Verbs.length * 3);
});

test("глагол выше уровня ученика не приходит", () => {
  for (const level of LEVEL_ORDER) {
    for (const t of formTasksUpTo(level)) {
      assert.ok(
        rank(t.verb.level) <= rank(level),
        `${t.id}: глагол уровня ${t.verb.level} на уровне ${level}`,
      );
    }
  }
});

test("на каждом уровне хватает минимум на два захода", () => {
  for (const level of LEVEL_ORDER) {
    const pool = formTasksUpTo(level);
    assert.ok(
      pool.length >= SESSION_SIZE * 2,
      `${level}: ${pool.length} заданий при минимуме ${SESSION_SIZE * 2}`,
    );
  }
});

// ── Ответы ──────────────────────────────────────────────────────────────────

test("верные ответы берутся из таблицы форм", () => {
  for (const t of allFormTasks()) {
    const answers = formAnswers(t);
    assert.ok(answers.length > 0, `${t.id}: нет ответа`);
    if (t.kind === "past") assert.deepEqual(answers, t.verb.past);
    if (t.kind === "participle") assert.deepEqual(answers, t.verb.participle);
    if (t.kind === "toEn") assert.equal(answers[0], t.verb.base);
  }
});

test("у одинаковых переводов принимаются оба глагола", () => {
  // «класть» в таблице стоит и у put, и у lay. Принимать только один — значит
  // выдать «неверно» на верном ответе.
  const put = parseFormTask(formTaskId("toEn", "put"))!;
  const answers = formAnswers(put);
  assert.ok(answers.includes("lay"), `ответы: ${answers.join(", ")}`);
  assert.equal(checkGrammarAnswer("vf:toEn:put", "lay")?.correct, true);
});

test("в вопросе про перевод английского слова на экране нет", () => {
  const task = parseFormTask("vf:toEn:buy")!;
  const view = formCard(task);
  assert.match(view.text, /покупать/);
  assert.equal(view.text.includes("buy"), false);
});

test("верная форма принимается, регистр и пробелы не мешают", () => {
  assert.equal(checkGrammarAnswer("vf:past:buy", "bought")?.correct, true);
  assert.equal(checkGrammarAnswer("vf:past:buy", "  Bought ")?.correct, true);
  assert.equal(checkGrammarAnswer("vf:toEn:buy", "buy")?.correct, true);
});

test("принимается любой равноправный вариант формы", () => {
  // burn: burnt и burned оба в учебниках, спорить с учебником нельзя.
  assert.equal(checkGrammarAnswer("vf:past:burn", "burnt")?.correct, true);
  assert.equal(checkGrammarAnswer("vf:past:burn", "burned")?.correct, true);
});

test("другая форма НЕ прощается как опечатка, даже на одну букву", () => {
  // come — came отличаются одной буквой, но это не промах пальца, а другая
  // форма. Простим — и упражнение перестанет чему-либо учить.
  const v = checkGrammarAnswer("vf:past:come", "come");
  assert.equal(v?.correct, false);
  assert.equal(v?.typo, false);
});

// ── Разбор ошибки ───────────────────────────────────────────────────────────

test("после ошибки видно все три формы и правило", () => {
  const v = checkGrammarAnswer("vf:past:buy", "buy");
  assert.equal(v?.correct, false);
  assert.ok(v?.expected.includes("bought"));
  assert.equal(v?.full, formLine(verbByBase("buy")!));
  assert.ok(v?.rule, "правило не приложено");
  assert.match(v!.rule!.text, /bought/);
});

test("в правиле сказано, где работает третья форма", () => {
  // Её спрашивают с A1, то есть задолго до Present Perfect. Без этой строчки
  // ученик заучивал бы слово, не понимая, зачем оно.
  const v = checkGrammarAnswer("vf:participle:see", "saw");
  assert.equal(v?.correct, false);
  assert.match(v!.rule!.text, /have и has/);
});

test("названа именно та путаница, которая случилась", () => {
  const first = formMistake("buy", parseFormTask("vf:past:buy")!);
  assert.match(first!.headline, /первая форма/);

  const second = formMistake("saw", parseFormTask("vf:participle:see")!);
  assert.match(second!.headline, /вторая форма/);

  const third = formMistake("seen", parseFormTask("vf:past:see")!);
  assert.match(third!.headline, /третья форма/);

  const ed = formMistake("buyed", parseFormTask("vf:past:buy")!);
  assert.match(ed!.headline, /-ed/);

  // Ответ формой чужого глагола: называем чужой глагол и его перевод, иначе
  // ученик не поймёт, куда его занесло.
  const alien = formMistake("went", parseFormTask("vf:past:buy")!);
  assert.match(alien!.headline, /go/);

  // В вопросе про перевод вторая форма — это «глагол угадан, форма не та».
  const wrongKind = formMistake("bought", parseFormTask("vf:toEn:buy")!);
  assert.match(wrongKind!.headline, /вторая форма/);
});

test("пустой ответ не разбирается: разбирать нечего", () => {
  assert.equal(formMistake("", parseFormTask("vf:past:buy")!), null);
});

// ── Подборка ────────────────────────────────────────────────────────────────

test("незнакомый глагол даётся вариантами, знакомый — письмом", () => {
  const cold = wholePool("A2").find((c) => c.id === "vf:past:buy");
  assert.ok(cold);
  assert.equal(cold!.input, "choice");

  const warm = wholePool("A2", new Set(["buy"])).find((c) => c.id === "vf:past:buy");
  assert.ok(warm);
  assert.equal(warm!.input, "type");
  assert.equal(warm!.options, undefined);

  // Порог знания задан одним числом и не размазан по коду.
  assert.ok(FORM_MASTERY_HITS >= 2);
});

test("среди вариантов ровно один принимаемый ответ", () => {
  for (const card of wholePool("B1")) {
    if (card.input !== "choice") continue;
    const options = card.options ?? [];
    assert.ok(options.length >= 2, `${card.id}: вариантов меньше двух`);
    assert.equal(new Set(options).size, options.length, `${card.id}: варианты повторяются`);

    const accept = new Set(formAnswers(parseFormTask(card.id)!).map((a) => a.toLowerCase()));
    const hits = options.filter((o) => accept.has(o.toLowerCase()));
    assert.equal(hits.length, 1, `${card.id}: принимаемых ответов среди вариантов ${hits.length}`);
  }
});

test("варианты осмысленные, мусорных слов среди них нет", () => {
  // Мусор — это ingForm("be") = «bing» и thirdPerson("be") = «bes». Такие слова
  // ученик отбрасывает, не зная языка, и выбор перестаёт быть выбором. Поэтому
  // вариант обязан быть либо формой этого глагола, либо его формой на -ed
  // (частая ошибка), либо формой другого глагола из таблицы.
  const bases = new Set(IRREGULAR_VERBS.map((v) => v.base));
  const anyForm = new Set(
    IRREGULAR_VERBS.flatMap((v) => [v.base, ...v.past, ...v.participle]),
  );

  for (const card of wholePool("B1")) {
    if (card.input !== "choice") continue;
    const task = parseFormTask(card.id)!;
    const own = new Set([
      task.verb.base,
      ...task.verb.past,
      ...task.verb.participle,
      edForm(task.verb.base),
    ]);

    for (const o of card.options ?? []) {
      if (task.kind === "toEn") {
        // Спрашивают слово — значит и ловушки это слова, а не формы.
        assert.ok(bases.has(o), `${card.id}: вариант «${o}» не глагол из таблицы`);
      } else {
        assert.ok(
          own.has(o) || anyForm.has(o),
          `${card.id}: вариант «${o}» не форма ни одного глагола`,
        );
      }
    }
  }
});

test("заход полный, и завтра он другой", () => {
  const today = buildGrammarSession({ mode: "forms", level: "A2", now: NOW });
  assert.equal(today.cards.length, SESSION_SIZE);
  assert.ok(today.batches >= 2);

  const tomorrow = buildGrammarSession({
    mode: "forms",
    level: "A2",
    now: new Date(NOW.getTime() + 86_400_000),
  });
  assert.notDeepEqual(
    today.cards.map((c) => c.id),
    tomorrow.cards.map((c) => c.id),
  );
});
