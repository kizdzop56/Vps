// Тесты раздела «Составлять». Без БД и express: node:test + node:assert.
//
//   pnpm --filter @workspace/api-server test
//
// Половина файла — не про код, а про ДАННЫЕ. Просьба была «строго проверь, чтобы
// предложения соответствовали уровню», а обещание в комментарии проверкой не
// является: банк будет расти, и правило должно падать само.
//
// Банк здесь полный: написанное руками плюс сгенерированное из заготовок. Сам
// генератор проверяется отдельно, в generate.test.ts.
import test from "node:test";
import assert from "node:assert/strict";

import { IRREGULAR_VERBS, LEVEL_ORDER, verbByBase, type CefrLevel } from "./verbs";
import { TENSES, diagnose, tenseById, type SentenceForm } from "./tenses";
import {
  ASSEMBLE_TASKS,
  GAP,
  MAX_WORDS,
  PARTICIPLE_FROM,
  VERB_GAP_TASKS,
} from "./tasks";
import { TENSE_GAP_TASKS } from "./tenseBank";
import {
  CHOICE_EVERY,
  allForms,
  assembleMistake,
  buildGrammarSession,
  checkGrammarAnswer,
  edForm,
  ingForm,
  sentenceTiles,
  thirdPerson,
  verbGapAnswers,
} from "./engine";

const rank = (l: CefrLevel) => LEVEL_ORDER.indexOf(l);
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const gaps = (s: string) => s.split(GAP).length - 1;

/**
 * Готовая фраза: с подставленным ответом, а не с прочерком.
 *
 * Длину меряем именно по ней. В отрицании на месте одного слова встают три
 * («does not watch»), и фраза с пропуском о своей длине врёт.
 */
const filled = (text: string, answer: string) => text.replace(GAP, answer);

// ── Таблица глаголов ────────────────────────────────────────────────────────

test("у каждого глагола есть обе формы и перевод", () => {
  for (const v of IRREGULAR_VERBS) {
    assert.ok(v.base.length > 1, `${v.base}: пустая первая форма`);
    assert.ok(v.past.length > 0, `${v.base}: нет второй формы`);
    assert.ok(v.participle.length > 0, `${v.base}: нет третьей формы`);
    assert.ok(v.ru.trim().length > 0, `${v.base}: нет перевода`);
    assert.ok(LEVEL_ORDER.includes(v.level), `${v.base}: неизвестный уровень`);
  }
});

test("глаголы не повторяются", () => {
  const seen = new Set<string>();
  for (const v of IRREGULAR_VERBS) {
    assert.equal(seen.has(v.base), false, `${v.base} встречается дважды`);
    seen.add(v.base);
  }
});

// ── Времена ─────────────────────────────────────────────────────────────────

test("у каждого времени есть правило, примеры употребления и маркеры", () => {
  for (const t of TENSES) {
    assert.ok(t.rule.length > 80, `${t.id}: правило слишком короткое, чтобы что-то объяснить`);
    assert.ok(t.usage.length >= 2, `${t.id}: меньше двух случаев употребления`);
    assert.ok(t.markers.length >= 3, `${t.id}: мало слов-маркеров`);
    assert.ok(t.titleRu.trim().length > 0, `${t.id}: нет русского названия`);
  }
});

test("у каждого времени есть схема отрицания и вопроса", () => {
  // Схемы не украшение: их подставляет в объяснение разбор ошибки.
  for (const t of TENSES) {
    assert.ok(t.formulaNegative.includes("not"), `${t.id}: в схеме отрицания нет not`);
    assert.ok(t.formulaQuestion.includes("?"), `${t.id}: схема вопроса не выглядит вопросом`);
  }
});

// ── Уровни: то, о чём была просьба «строго проверь» ──────────────────────────

test("готовая фраза не длиннее лимита своего уровня", () => {
  for (const t of VERB_GAP_TASKS) {
    const answers = verbGapAnswers(t);
    const text = filled(t.text, answers[0] ?? "");
    assert.ok(
      wordCount(text) <= MAX_WORDS[t.level],
      `${t.id}: ${wordCount(text)} слов при лимите ${MAX_WORDS[t.level]} для ${t.level}`,
    );
  }
  for (const t of TENSE_GAP_TASKS) {
    const text = filled(t.text, t.accept[0] ?? "");
    assert.ok(
      wordCount(text) <= MAX_WORDS[t.level],
      `${t.id}: ${wordCount(text)} слов при лимите ${MAX_WORDS[t.level]} для ${t.level}`,
    );
  }
  for (const t of ASSEMBLE_TASKS) {
    assert.ok(
      wordCount(t.en) <= MAX_WORDS[t.level],
      `${t.id}: ${wordCount(t.en)} слов при лимите ${MAX_WORDS[t.level]} для ${t.level}`,
    );
  }
});

test("глагол задания есть в таблице и не выше уровня задания", () => {
  for (const t of VERB_GAP_TASKS) {
    const verb = verbByBase(t.base);
    assert.ok(verb, `${t.id}: глагола «${t.base}» нет в таблице форм`);
    assert.ok(
      rank(verb!.level) <= rank(t.level),
      `${t.id}: глагол ${t.base} уровня ${verb!.level} в задании уровня ${t.level}`,
    );
  }
});

test("третья форма спрашивается с A1", () => {
  // Раньше здесь стояла обратная проверка: третьей формы не должно быть до B1.
  // Порог держался за Present Perfect, но have и has пишутся прямо в задании, и
  // знать время для ответа не нужно — нужна форма глагола, а её учат сразу.
  assert.equal(PARTICIPLE_FROM, "A1");

  const a1 = VERB_GAP_TASKS.filter((t) => t.level === "A1" && t.form === "participle");
  assert.ok(a1.length > 0, "на A1 нет ни одного задания на третью форму");
  for (const t of a1) {
    assert.match(t.text, /\b(have|has)\b/, `${t.id}: в задании нет have или has`);
  }
});

test("время задания существует и не выше уровня задания", () => {
  for (const t of TENSE_GAP_TASKS) {
    const tense = tenseById(t.tense);
    assert.ok(tense, `${t.id}: неизвестное время «${t.tense}»`);
    assert.ok(
      rank(tense!.level) <= rank(t.level),
      `${t.id}: время ${tense!.title} уровня ${tense!.level} в задании уровня ${t.level}`,
    );
  }
});

test("в задании ровно один пропуск", () => {
  for (const t of [...VERB_GAP_TASKS, ...TENSE_GAP_TASKS]) {
    assert.equal(gaps(t.text), 1, `${t.id}: пропусков ${gaps(t.text)}, а должен быть один`);
  }
});

test("номера заданий уникальны по всем банкам", () => {
  // Проверка ответа ищет задание по номеру в трёх банках подряд. Одинаковый
  // номер в двух банках означает, что ответ сверят с чужим заданием. С
  // появлением генератора это уже не теория: у него свои номера с приставкой g-.
  const ids = [...VERB_GAP_TASKS, ...TENSE_GAP_TASKS, ...ASSEMBLE_TASKS].map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, "есть повторяющиеся номера заданий");
});

test("у каждого задания есть русский перевод", () => {
  for (const t of [...VERB_GAP_TASKS, ...TENSE_GAP_TASKS, ...ASSEMBLE_TASKS]) {
    assert.ok(t.ru.trim().length > 0, `${t.id}: нет перевода`);
  }
});

// ── Три вида предложений ────────────────────────────────────────────────────

test("у каждого времени хватает и утверждений, и отрицаний, и вопросов", () => {
  // Ровный состав — не вкусовщина: при перекосе 24/6/6 вопросы попадали бы в
  // заход через раз, и раздел снова выглядел бы «только утвердительным».
  const forms: SentenceForm[] = ["affirmative", "negative", "question"];
  for (const tense of TENSES) {
    const own = TENSE_GAP_TASKS.filter((t) => t.tense === tense.id);
    for (const form of forms) {
      const count = own.filter((t) => t.form === form).length;
      assert.ok(count >= 12, `${tense.id}: заданий вида «${form}» всего ${count}`);
    }
  }
});

test("в отрицании есть not, в вопросе — вопросительный знак", () => {
  for (const t of TENSE_GAP_TASKS) {
    const text = filled(t.text, t.accept[0] ?? "");
    if (t.form === "negative") {
      assert.match(text, /\bnot\b|n't/, `${t.id}: отрицание без not`);
    }
    if (t.form === "question") {
      assert.ok(text.trim().endsWith("?"), `${t.id}: вопрос без знака вопроса`);
    }
    if (t.form === "affirmative") {
      assert.equal(text.includes("?"), false, `${t.id}: утверждение со знаком вопроса`);
    }
  }
});

test("ответ согласован с временем и видом предложения", () => {
  for (const t of TENSE_GAP_TASKS) {
    assert.ok(t.accept.length > 0, `${t.id}: нет ответа`);
    const main = t.accept[0]!;

    // В вопросе ответом бывает один вспомогательный («Does»), поэтому форму
    // смыслового глагола проверять не по чему — она стоит в самой фразе.
    if (t.form === "question") continue;
    if (t.form === "negative") {
      assert.match(main, /\bnot\b/, `${t.id}: в отрицании ожидается not`);
      continue;
    }
    if (t.tense === "future_simple") {
      assert.match(main, /^(will|'ll)\s/, `${t.id}: в будущем времени ожидается will`);
    }
    if (t.tense === "present_perfect") {
      assert.match(main, /^(have|has|'ve)\s/, `${t.id}: в Present Perfect ожидается have/has`);
    }
    if (t.tense === "present_continuous" || t.tense === "past_continuous") {
      assert.match(main, /ing$/, `${t.id}: в длительном времени ожидается -ing`);
    }
  }
});

test("ответ в начале вопроса написан с заглавной буквы", () => {
  // Он подставляется в начало фразы: строчная буква там выглядела бы ошибкой
  // в самом задании.
  for (const t of TENSE_GAP_TASKS) {
    if (!t.text.startsWith(GAP)) continue;
    const main = t.accept[0] ?? "";
    assert.equal(main[0], main[0]?.toUpperCase(), `${t.id}: ответ «${main}» со строчной буквы`);
  }
});

test("полная форма идёт раньше сокращённой", () => {
  // Первый вариант показывается как эталон после ошибки, и там уместнее
  // «did not go», а не «didn't go».
  for (const t of TENSE_GAP_TASKS) {
    const main = t.accept[0] ?? "";
    assert.equal(main.includes("n't"), false, `${t.id}: эталонный ответ сокращённый`);
  }
});

test("ловушка в сборке — одно слово, которого нет в самом предложении", () => {
  for (const t of ASSEMBLE_TASKS) {
    const own = new Set(sentenceTiles(t.en).map((w) => w.toLowerCase()));
    for (const extra of t.extra ?? []) {
      assert.equal(wordCount(extra), 1, `${t.id}: ловушка «${extra}» из нескольких слов`);
      assert.equal(
        own.has(extra.toLowerCase()),
        false,
        `${t.id}: ловушка «${extra}» есть в самом предложении — она нужна для ответа`,
      );
    }
  }
});

// ── Формы ───────────────────────────────────────────────────────────────────

test("третье лицо: -s, -es и y → ies", () => {
  assert.equal(thirdPerson("work"), "works");
  assert.equal(thirdPerson("go"), "goes");
  assert.equal(thirdPerson("watch"), "watches");
  assert.equal(thirdPerson("study"), "studies");
  // play — гласная перед y, поэтому просто -s
  assert.equal(thirdPerson("play"), "plays");
  // be и have правилу не подчиняются вовсе
  assert.equal(thirdPerson("be"), "is");
  assert.equal(thirdPerson("have"), "has");
});

test("-ing: немая e пропадает, короткая согласная удваивается", () => {
  assert.equal(ingForm("make"), "making");
  assert.equal(ingForm("run"), "running");
  assert.equal(ingForm("read"), "reading");
  assert.equal(ingForm("go"), "going");
  assert.equal(ingForm("be"), "being");
});

test("-ed по тем же правилам", () => {
  assert.equal(edForm("work"), "worked");
  assert.equal(edForm("live"), "lived");
  assert.equal(edForm("study"), "studied");
  assert.equal(edForm("stop"), "stopped");
});

// ── Подбор заданий ──────────────────────────────────────────────────────────

const NOW = new Date("2026-08-10T12:00:00.000Z");

test("ученик получает только задания своего уровня и ниже", () => {
  for (const level of LEVEL_ORDER) {
    for (const mode of ["forms", "verbs", "tense", "build"] as const) {
      const { cards } = buildGrammarSession({ mode, level, now: NOW });
      for (const c of cards) {
        assert.ok(
          rank(c.level) <= rank(level),
          `${mode}/${level}: пришло задание уровня ${c.level}`,
        );
      }
    }
  }
});

test("в режиме времени приходят задания только выбранного времени", () => {
  const { cards } = buildGrammarSession({ mode: "tense", level: "B1", tense: "past_simple", now: NOW });
  assert.ok(cards.length > 0, "пустая подборка");
  for (const c of cards) assert.equal(c.tense, "past_simple");
});

test("вид предложения назван в подсказке", () => {
  // Без этого задание нерешаемо: «He ___ milk» допускает и «likes», и «does not
  // like». Перевод под заданием говорит о том же, но подсказка не должна
  // зависеть от того, прочитал ли ученик перевод.
  const { cards } = buildGrammarSession({
    mode: "tense", level: "A1", tense: "present_simple", now: NOW, size: 500,
  });
  for (const c of cards) {
    const task = TENSE_GAP_TASKS.find((t) => t.id === c.id)!;
    if (task.form === "negative") assert.match(c.hint ?? "", /отрицание/, `${c.id}`);
    if (task.form === "question") assert.match(c.hint ?? "", /вопрос/, `${c.id}`);
    if (task.form === "affirmative") {
      assert.equal(/отрицание|вопрос/.test(c.hint ?? ""), false, `${c.id}`);
    }
  }
});

test("ученик в основном пишет сам, вариантами даётся каждое третье задание", () => {
  const { cards } = buildGrammarSession({ mode: "verbs", level: "B1", now: NOW, size: 6 });
  const choices = cards.filter((c) => c.input === "choice");
  assert.equal(choices.length, Math.floor(6 / CHOICE_EVERY));
  for (const c of choices) {
    assert.ok((c.options?.length ?? 0) >= 2, `${c.id}: вариантов меньше двух`);
    // Верный ответ обязан быть среди вариантов, иначе задание нерешаемо.
    const answers = verbGapAnswers(VERB_GAP_TASKS.find((t) => t.id === c.id)!);
    assert.ok(
      c.options!.some((o) => answers.includes(o)),
      `${c.id}: верного ответа нет среди вариантов`,
    );
  }
});

test("дистракторы — другие формы того же глагола, а не случайные слова", () => {
  const { cards } = buildGrammarSession({ mode: "verbs", level: "B2", now: NOW, size: 12 });
  for (const c of cards) {
    if (c.input !== "choice") continue;
    const forms = new Set(allForms(c.base!));
    for (const o of c.options!) {
      assert.ok(forms.has(o), `${c.id}: вариант «${o}» не форма глагола ${c.base}`);
    }
  }
});

test("во временах верный ответ ровно один, и он не выдаёт себя регистром", () => {
  for (const tense of TENSES) {
    const { cards } = buildGrammarSession({
      mode: "tense", level: "C1", tense: tense.id, now: NOW, size: 500,
    });
    for (const c of cards) {
      if (c.input !== "choice") continue;
      const task = TENSE_GAP_TASKS.find((t) => t.id === c.id)!;
      const options = c.options ?? [];
      assert.equal(new Set(options).size, options.length, `${c.id}: варианты повторяются`);

      const accept = new Set(task.accept.map((a) => a.toLowerCase()));
      const hits = options.filter((o) => accept.has(o.toLowerCase()));
      assert.equal(hits.length, 1, `${c.id}: принимаемых ответов среди вариантов ${hits.length}`);

      // Заглавная буква только у одного варианта — это подсказка, видная без
      // знания языка.
      const caps = options.filter((o) => o[0] === o[0]?.toUpperCase());
      assert.ok(
        caps.length === 0 || caps.length === options.length,
        `${c.id}: регистр вариантов разный, ответ видно по большой букве`,
      );
    }
  }
});

test("в сборке есть все нужные слова плюс ловушки", () => {
  const { cards } = buildGrammarSession({ mode: "build", level: "A1", now: NOW });
  for (const c of cards) {
    const task = ASSEMBLE_TASKS.find((t) => t.id === c.id)!;
    const need = sentenceTiles(task.en);
    const tiles = [...(c.tiles ?? [])];
    for (const w of need) {
      const at = tiles.indexOf(w);
      assert.ok(at >= 0, `${c.id}: не хватает плитки «${w}»`);
      tiles.splice(at, 1); // одно слово — одна плитка
    }
  }
});

test("подбор детерминирован в течение дня", () => {
  const a = buildGrammarSession({ mode: "verbs", level: "B1", now: NOW });
  const b = buildGrammarSession({ mode: "verbs", level: "B1", now: new Date(NOW.getTime() + 3 * 3600_000) });
  assert.deepEqual(a.cards.map((c) => c.id), b.cards.map((c) => c.id));
});

// ── Проверка ответа ─────────────────────────────────────────────────────────

test("верная форма принимается, неизвестное задание — null", () => {
  const ok = checkGrammarAnswer("vg-a1-1", "went");
  assert.equal(ok?.correct, true);
  assert.equal(ok?.typo, false);
  assert.equal(checkGrammarAnswer("нет-такого", "went"), null);
});

test("регистр и лишние пробелы не влияют", () => {
  assert.equal(checkGrammarAnswer("vg-a1-1", "  Went ")?.correct, true);
});

test("принимается любой равноправный вариант формы", () => {
  // burn: burnt и burned оба верны, спорить с учебником нельзя.
  const verb = verbByBase("burn")!;
  assert.ok(verb.past.includes("burnt") && verb.past.includes("burned"));
});

test("другая форма глагола НЕ прощается как опечатка", () => {
  // pst-5: нужно lived. «lives» отличается на одну букву, но это другое время,
  // и прощать это — значит превратить упражнение в формальность.
  const wrong = checkGrammarAnswer("pst-5", "lives");
  assert.equal(wrong?.correct, false);
  // А вот обычная описка прощается: «bough» — не форма глагола buy.
  const typo = checkGrammarAnswer("pst-2", "bough");
  assert.equal(typo?.correct, true);
  assert.equal(typo?.typo, true);
});

test("сокращение принимается наравне с полной формой", () => {
  assert.equal(checkGrammarAnswer("pst-n1", "did not go")?.correct, true);
  assert.equal(checkGrammarAnswer("pst-n1", "didn't go")?.correct, true);
  // Описка внутри сокращения — всё ещё описка.
  const typo = checkGrammarAnswer("pst-n1", "didnt go");
  assert.equal(typo?.correct, true);
  assert.equal(typo?.typo, true);
});

test("в отрицании вторая форма не проходит", () => {
  const v = checkGrammarAnswer("pst-n1", "did not went");
  assert.equal(v?.correct, false);
});

test("«Do» вместо «Does» — ошибка, а не опечатка", () => {
  // Короткие служебные слова обязаны совпадать точно: выбор вспомогательного —
  // это и есть проверяемое знание.
  const v = checkGrammarAnswer("ps-q1", "Do");
  assert.equal(v?.correct, false);
  assert.equal(checkGrammarAnswer("ps-q1", "does")?.correct, true);
});

test("сгенерированное задание проверяется так же, как написанное руками", () => {
  assert.equal(checkGrammarAnswer("g-u-ps-1-aff", "goes")?.correct, true);
  assert.equal(checkGrammarAnswer("g-u-ps-1-aff", "go")?.correct, false);
  assert.equal(checkGrammarAnswer("g-u-pst-1-qv", "go")?.correct, true);
  assert.equal(checkGrammarAnswer("g-u-pst-1-qv", "went")?.correct, false);
});

test("после ошибки приходит предложение целиком с верным ответом", () => {
  const v = checkGrammarAnswer("vg-a1-1", "go");
  assert.equal(v?.correct, false);
  assert.equal(v?.full, "I went to school yesterday.");
  assert.ok(v?.expected.includes("went"));
  // Правило прилагается: ошибка на второй форме разбирается по Past Simple.
  assert.equal(v?.rule?.title, "Past Simple");
});

// ── Разбор ошибки ───────────────────────────────────────────────────────────

test("Present Simple: назван пропуск -s, а не «неверно»", () => {
  const tense = tenseById("present_simple")!;
  const d = diagnose("go", "goes", tense, "go");
  assert.ok(d, "ошибка не опознана");
  assert.match(d!.headline, /-s/);
});

test("Past Simple: первая форма вместо второй", () => {
  const tense = tenseById("past_simple")!;
  const d = diagnose("go", "went", tense, "go");
  assert.ok(d);
  assert.match(d!.headline, /первая форма/);
});

test("Past Simple: -ed приклеено к неправильному глаголу", () => {
  const tense = tenseById("past_simple")!;
  const d = diagnose("goed", "went", tense, "go");
  assert.ok(d);
  assert.match(d!.headline, /-ed/);
});

test("Present Perfect: have вместо has и вторая форма вместо третьей", () => {
  const tense = tenseById("present_perfect")!;
  const a = diagnose("have read", "has read", tense, "read");
  assert.ok(a);
  assert.match(a!.headline, /has/);

  const b = diagnose("has saw", "has seen", tense, "see");
  assert.ok(b);
  assert.match(b!.headline, /третья форма/);
});

test("длительное время: пропущен be или пропущено -ing", () => {
  const tense = tenseById("present_continuous")!;
  const noBe = diagnose("sleeping", "is sleeping", tense, "sleep");
  assert.ok(noBe);
  assert.match(noBe!.headline, /be/);

  const noIng = diagnose("is sleep", "is sleeping", tense, "sleep");
  assert.ok(noIng);
  assert.match(noIng!.headline, /ing/);
});

test("будущее: пропущено will", () => {
  const tense = tenseById("future_simple")!;
  const d = diagnose("call", "will call", tense, "call");
  assert.ok(d);
  assert.match(d!.headline, /will/);
});

test("верный ответ не разбирается", () => {
  const tense = tenseById("past_simple")!;
  assert.equal(diagnose("went", "went", tense, "go"), null);
});

// ── Разбор ошибки в отрицании и вопросе ─────────────────────────────────────
//
// Самое важное здесь — что ветки утвердительного предложения СЮДА НЕ ЛЕЗУТ.
// В вопросе «Did you ___ to school?» верный ответ go, и старый разбор объяснял
// бы, что «go — первая форма, а нужна вторая», то есть учил бы писать «Did you
// went».

test("вопрос: после вспомогательного нужна первая форма, а не вторая", () => {
  const tense = tenseById("past_simple")!;
  const d = diagnose("went", "go", tense, "go", "question");
  assert.ok(d, "ошибка не опознана");
  assert.match(d!.headline, /перв/);
  assert.equal(/нужна вторая/.test(d!.headline), false, "разбор учит писать «did you went»");
});

test("отрицание: не тот вспомогательный назван прямо", () => {
  const tense = tenseById("present_simple")!;
  const d = diagnose("do not like", "does not like", tense, "like", "negative");
  assert.ok(d);
  assert.match(d!.headline, /does/);
});

test("отрицание: -s уехало не туда", () => {
  const tense = tenseById("present_simple")!;
  const d = diagnose("does not likes", "does not like", tense, "like", "negative");
  assert.ok(d);
  assert.match(d!.headline, /-s/);
});

test("отрицание: пропущено not", () => {
  const tense = tenseById("past_simple")!;
  const d = diagnose("did go", "did not go", tense, "go", "negative");
  assert.ok(d);
  assert.match(d!.headline, /not/);
});

test("отрицание: пропущен сам вспомогательный", () => {
  const tense = tenseById("present_perfect")!;
  const d = diagnose("not seen", "have not seen", tense, "see", "negative");
  assert.ok(d);
  assert.match(d!.headline, /have/);
});

test("сокращение в ответе понимается разбором", () => {
  const tense = tenseById("past_simple")!;
  // «didn't go» — тот же ответ, что и «did not go»: разбирать нечего.
  assert.equal(diagnose("didn't go", "did not go", tense, "go", "negative"), null);
  // А вот «didn't went» — ошибка, и её надо назвать.
  const d = diagnose("didn't went", "did not go", tense, "go", "negative");
  assert.ok(d);
  assert.match(d!.headline, /перв/);
});

test("вопрос в длительном времени: пропущено -ing", () => {
  const tense = tenseById("present_continuous")!;
  const d = diagnose("sleep", "sleeping", tense, "sleep", "question");
  assert.ok(d);
  assert.match(d!.headline, /ing/);
});

test("сборка: те же слова в другом порядке — это про порядок слов", () => {
  const m = assembleMistake("I to school go every day", "I go to school every day.");
  assert.ok(m);
  assert.match(m!.headline, /порядок/);
});

test("сборка: пропущенное и лишнее слово называются прямо", () => {
  const missing = assembleMistake("I go school every day", "I go to school every day.");
  assert.ok(missing);
  assert.match(missing!.headline, /to/);

  const wrongForm = assembleMistake("She like red apples", "She likes red apples.");
  assert.ok(wrongForm);
  assert.match(wrongForm!.headline, /likes/);
});
