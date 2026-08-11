// Объём банка и ротация заданий.
//
// Файл появился из жалобы: «в разделе собери предложение всего 12 предложений
// для уровня A2, этого очень мало, каждый день должны быть новые». Потом
// пришла вторая, точнее: ученик проходит раздел за одно занятие, и дальше
// раздел для него мёртв.
//
// Поэтому объём здесь меряется не в заданиях, а в ЗАНЯТИЯХ: сколько заходов
// подряд можно сделать, ни разу не повторившись. Это и есть то, что чувствует
// ученик.
//
// ── Что именно гарантируется ────────────────────────────────────────────────
// Внутри круга повторов нет ВОВСЕ: круг — это несколько заходов подряд, и за
// него банк проходится целиком. На границе круга банк тасуется заново, и первая
// порция нового круга может задеть последнюю порцию старого. Это не «повтор
// вчерашнего»: к этому моменту ученик прошёл весь доступный ему банк.
import test from "node:test";
import assert from "node:assert/strict";

import { LEVEL_ORDER, fitsLevel, type CefrLevel } from "./verbs";
import { TENSES } from "./tenses";
import { ASSEMBLE_TASKS, VERB_GAP_TASKS } from "./tasks";
import { TENSE_GAP_TASKS } from "./tenseBank";
import { formTasksUpTo } from "./forms";
import {
  SESSION_SIZE,
  batchCount,
  buildGrammarSession,
  rotateBatch,
  textSeed,
} from "./engine";

const DAY_MS = 86_400_000;
const NOW = new Date("2026-08-11T09:00:00.000Z");

/**
 * Сколько занятий подряд обязан выдержать режим, ни разу не повторившись.
 *
 * Числа разные, потому что банки растут по-разному, и взяты с запасом вниз от
 * сегодняшних: тест должен ловить обвал банка, а не колебание в одну заготовку.
 *
 * Самый скромный здесь — глагол в предложении: там задание требует не просто
 * формы, а осмысленной фразы вокруг неё, и генератор берёт только те заготовки,
 * где глагол неправильный.
 */
const MIN_SESSIONS = {
  tense: 6,
  build: 8,
  forms: 5,
  verbs: 3,
} as const;

const sessions = (count: number) => Math.floor(count / SESSION_SIZE);
const ids = <T extends { id: string }>(items: T[]) => items.map((t) => t.id);

/**
 * День, с которого начинается круг.
 *
 * Без этого тесты по дням зависели бы от того, когда их запустили: сегодняшний
 * день может оказаться последним шагом круга, и тогда «завтра» — уже следующий
 * круг с новой тасовкой.
 */
function cycleStart(batches: number): Date {
  const day = Math.floor(NOW.getTime() / DAY_MS);
  return new Date((day - (day % batches)) * DAY_MS);
}

// ── Объём в занятиях ────────────────────────────────────────────────────────

test("сборки предложений хватает на много занятий подряд", () => {
  for (const level of LEVEL_ORDER) {
    const pool = ASSEMBLE_TASKS.filter((t) => fitsLevel(t.level, level));
    assert.ok(
      sessions(pool.length) >= MIN_SESSIONS.build,
      `${level}: ${pool.length} предложений — это ${sessions(pool.length)} занятий`,
    );
  }
});

test("глагола в предложении хватает на несколько занятий", () => {
  for (const level of LEVEL_ORDER) {
    const pool = VERB_GAP_TASKS.filter((t) => fitsLevel(t.level, level));
    assert.ok(
      sessions(pool.length) >= MIN_SESSIONS.verbs,
      `${level}: ${pool.length} заданий — это ${sessions(pool.length)} занятий`,
    );
  }
});

test("форм глагола хватает на несколько занятий", () => {
  for (const level of LEVEL_ORDER) {
    const pool = formTasksUpTo(level);
    assert.ok(
      sessions(pool.length) >= MIN_SESSIONS.forms,
      `${level}: ${pool.length} заданий — это ${sessions(pool.length)} занятий`,
    );
  }
});

test("каждого времени хватает на много занятий, как только оно появилось", () => {
  // Считаем по уровню самого времени: именно с него оно показывается в списке.
  // Время, которое видно, но заданий почти не имеет, — сломанная кнопка.
  for (const tense of TENSES) {
    const pool = TENSE_GAP_TASKS.filter(
      (t) => t.tense === tense.id && fitsLevel(t.level, tense.level),
    );
    assert.ok(
      sessions(pool.length) >= MIN_SESSIONS.tense,
      `${tense.title}: ${pool.length} заданий на уровне ${tense.level} — это ${sessions(pool.length)} занятий`,
    );
  }
});

test("Past Continuous доступен уже на A2", () => {
  // Прошедшее длительное стояло на B1 рядом с перфектом, и ученик A2 его не
  // видел вовсе. Здесь закреплено и само время, и наличие заданий под него.
  const tense = TENSES.find((t) => t.id === "past_continuous");
  assert.ok(tense, "времени нет в списке");
  assert.equal(tense!.level, "A2");

  const forA2 = TENSE_GAP_TASKS.filter(
    (t) => t.tense === "past_continuous" && fitsLevel(t.level, "A2" as CefrLevel),
  );
  assert.ok(sessions(forA2.length) >= MIN_SESSIONS.tense, `на A2 доступно ${forA2.length} заданий`);
});

// ── Ротация ─────────────────────────────────────────────────────────────────

test("внутри круга соседние шаги не пересекаются вовсе", () => {
  const pool = Array.from({ length: 50 }, (_, i) => ({ id: `t-${i}` }));
  const batches = batchCount(pool.length, 12);

  for (let step = 0; step + 1 < batches; step++) {
    const a = new Set(ids(rotateBatch(pool, 12, step, 1)));
    const b = ids(rotateBatch(pool, 12, step + 1, 1));
    assert.equal(b.length, 12, `шаг ${step + 1}: неполная порция`);
    for (const id of b) {
      assert.equal(a.has(id), false, `шаг ${step + 1}: повтор задания ${id}`);
    }
  }
});

test("круг покрывает банк без повторов", () => {
  const pool = Array.from({ length: 48 }, (_, i) => ({ id: `t-${i}` }));
  const batches = batchCount(pool.length, 12);
  assert.equal(batches, 4);

  const seen = new Set<string>();
  for (let pos = 0; pos < batches; pos++) {
    for (const id of ids(rotateBatch(pool, 12, pos, 7))) {
      assert.equal(seen.has(id), false, `${id} встретился дважды за круг`);
      seen.add(id);
    }
  }
  assert.equal(seen.size, pool.length, "за круг банк пройден не целиком");
});

test("новый круг идёт в другом порядке", () => {
  const pool = Array.from({ length: 48 }, (_, i) => ({ id: `t-${i}` }));
  const batches = batchCount(pool.length, 12);
  const first = ids(rotateBatch(pool, 12, 0, 7)).join(",");
  const nextCycle = ids(rotateBatch(pool, 12, batches, 7)).join(",");
  assert.notEqual(first, nextCycle, "после полного круга подборка повторилась дословно");
});

test("хвост банка не режется на короткие заходы", () => {
  // 50 заданий по 12 — это четыре полных захода, а не четыре полных и один
  // куцый: иначе каждый пятый день был бы вдвое короче остальных.
  assert.equal(batchCount(50, 12), 4);
  assert.equal(rotateBatch(Array.from({ length: 50 }, (_, i) => ({ id: `t-${i}` })), 12, 3, 1).length, 12);
});

test("банк меньше захода отдаётся целиком", () => {
  const pool = Array.from({ length: 5 }, (_, i) => ({ id: `t-${i}` }));
  const batch = rotateBatch(pool, 12, 3, 1);
  assert.equal(batch.length, 5);
  assert.equal(new Set(ids(batch)).size, 5);
});

test("у режимов и времён свои сиды: подборки не идут в ногу", () => {
  assert.notEqual(textSeed("tense:past_simple"), textSeed("tense:past_continuous"));
  assert.notEqual(textSeed("build:"), textSeed("verbs:"));
});

// ── Подборка целиком ────────────────────────────────────────────────────────

test("неделю подряд предложения не повторяются", () => {
  const { batches } = buildGrammarSession({ mode: "build", level: "A2", now: NOW });
  assert.ok(batches >= 7, `на A2 набирается всего ${batches} непересекающихся заходов`);

  const start = cycleStart(batches);
  const seen = new Set<string>();
  for (let day = 0; day < 7; day++) {
    const { cards } = buildGrammarSession({
      mode: "build",
      level: "A2",
      now: new Date(start.getTime() + day * DAY_MS),
    });
    assert.equal(cards.length, SESSION_SIZE, `день ${day}: неполный заход`);
    for (const card of cards) {
      assert.equal(seen.has(card.id), false, `${card.id} пришёл повторно на ${day + 1}-й день`);
      seen.add(card.id);
    }
  }
});

test("«Ещё заход» приносит следующую порцию, а не ту же самую", () => {
  const { batches } = buildGrammarSession({ mode: "build", level: "A2", now: NOW });
  const now = cycleStart(batches);

  const seen = new Set<string>();
  for (let round = 0; round < batches; round++) {
    const { cards } = buildGrammarSession({ mode: "build", level: "A2", now, round });
    for (const card of cards) {
      assert.equal(seen.has(card.id), false, `${card.id} повторился в заходе ${round + 1}`);
      seen.add(card.id);
    }
  }
});

test("в течение дня подборка не меняется при обновлении экрана", () => {
  const a = buildGrammarSession({ mode: "tense", level: "A2", tense: "past_continuous", now: NOW });
  const b = buildGrammarSession({
    mode: "tense",
    level: "A2",
    tense: "past_continuous",
    now: new Date(NOW.getTime() + 5 * 3600_000),
  });
  assert.deepEqual(a.cards.map((c) => c.id), b.cards.map((c) => c.id));
  // И плитки с вариантами тоже: они мешаются от номера задания, а не от места
  // карточки в подборке.
  assert.deepEqual(a.cards.map((c) => c.options ?? []), b.cards.map((c) => c.options ?? []));
});

test("во всех режимах заход выдаётся полным", () => {
  for (const level of LEVEL_ORDER) {
    for (const mode of ["forms", "verbs", "tense", "build"] as const) {
      const { cards } = buildGrammarSession({ mode, level, now: NOW });
      assert.equal(
        cards.length,
        SESSION_SIZE,
        `${mode}/${level}: в заходе ${cards.length} заданий вместо ${SESSION_SIZE}`,
      );
    }
  }
});
