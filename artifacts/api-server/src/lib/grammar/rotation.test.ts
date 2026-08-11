// Объём банка и ротация заданий.
//
// Файл появился из жалобы: «в разделе собери предложение всего 12 предложений
// для уровня A2, этого очень мало, каждый день должны быть новые». Оба
// требования — и объём, и новизна — здесь превращены в проверки, потому что
// обещание в комментарии банк не удержит: он будет расти правками, и правило
// должно падать само.
//
// ── Что именно гарантируется ────────────────────────────────────────────────
// Внутри круга повторов нет ВОВСЕ: круг — это несколько заходов подряд (для
// сборки на A2 их четыре), и за него банк проходится целиком. На границе круга
// банк тасуется заново, и первая порция нового круга может задеть последнюю
// порцию старого. Это не «повтор вчерашнего»: к этому моменту ученик прошёл
// весь доступный ему банк.
import test from "node:test";
import assert from "node:assert/strict";

import { LEVEL_ORDER, fitsLevel, type CefrLevel } from "./verbs";
import { TENSES } from "./tenses";
import { ASSEMBLE_TASKS, TENSE_GAP_TASKS, VERB_GAP_TASKS } from "./tasks";
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
 * Минимальный запас: два полных захода.
 *
 * Почему именно два. При одном заходе в банке ротации просто не из чего
 * выбирать: любой следующий заход — это те же задания в другом порядке. Два —
 * нижняя граница, при которой «завтра будет новое» вообще выполнимо.
 */
const MIN_POOL = SESSION_SIZE * 2;

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

// ── Объём ───────────────────────────────────────────────────────────────────

test("в сборке предложений на каждом уровне хватает минимум на два захода", () => {
  for (const level of LEVEL_ORDER) {
    const pool = ASSEMBLE_TASKS.filter((t) => fitsLevel(t.level, level));
    assert.ok(
      pool.length >= MIN_POOL,
      `${level}: ${pool.length} предложений при минимуме ${MIN_POOL}`,
    );
  }
});

test("в неправильных глаголах на каждом уровне хватает минимум на два захода", () => {
  for (const level of LEVEL_ORDER) {
    const pool = VERB_GAP_TASKS.filter((t) => fitsLevel(t.level, level));
    assert.ok(
      pool.length >= MIN_POOL,
      `${level}: ${pool.length} заданий при минимуме ${MIN_POOL}`,
    );
  }
});

test("у каждого времени хватает заданий, как только оно появилось у ученика", () => {
  // Считаем по уровню самого времени: именно с него оно показывается в списке.
  // Время, которое видно, но заданий почти не имеет, — сломанная кнопка.
  for (const tense of TENSES) {
    const pool = TENSE_GAP_TASKS.filter(
      (t) => t.tense === tense.id && fitsLevel(t.level, tense.level),
    );
    assert.ok(
      pool.length >= MIN_POOL,
      `${tense.title}: ${pool.length} заданий на уровне ${tense.level} при минимуме ${MIN_POOL}`,
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
  assert.ok(forA2.length >= MIN_POOL, `на A2 доступно ${forA2.length} заданий`);
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

test("несколько дней подряд предложения не повторяются", () => {
  const { batches } = buildGrammarSession({ mode: "build", level: "A2", now: NOW });
  assert.ok(batches >= 2, `на A2 набирается всего ${batches} непересекающихся заходов`);

  const start = cycleStart(batches);
  const seen = new Set<string>();
  for (let day = 0; day < batches; day++) {
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
    for (const mode of ["verbs", "tense", "build"] as const) {
      const { cards } = buildGrammarSession({ mode, level, now: NOW });
      assert.equal(
        cards.length,
        SESSION_SIZE,
        `${mode}/${level}: в заходе ${cards.length} заданий вместо ${SESSION_SIZE}`,
      );
    }
  }
});
