// Объём банка и ротация заданий.
//
// Файл появился из жалобы: «в разделе собери предложение всего 12 предложений
// для уровня A2, этого очень мало, каждый день должны быть новые». Оба
// требования — и объём, и новизна — здесь превращены в проверки, потому что
// обещание в комментарии банк не удержит: он будет расти правками, и правило
// должно падать само.
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

const NOW = new Date("2026-08-11T09:00:00.000Z");
const DAY_MS = 86_400_000;

/**
 * Минимальный запас: два полных захода.
 *
 * Почему именно два. При одном заходе в банке ротации просто не из чего
 * выбирать: любой следующий заход — это те же задания в другом порядке. Два —
 * нижняя граница, при которой «завтра будет новое» вообще выполнимо.
 */
const MIN_POOL = SESSION_SIZE * 2;

const ids = <T extends { id: string }>(items: T[]) => items.map((t) => t.id);

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

test("соседние шаги курсора не пересекаются вовсе", () => {
  const pool = Array.from({ length: 50 }, (_, i) => ({ id: `t-${i}` }));
  for (let step = 0; step < 12; step++) {
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

test("завтра приходят другие предложения", () => {
  const today = buildGrammarSession({ mode: "build", level: "A2", now: NOW });
  const tomorrow = buildGrammarSession({
    mode: "build",
    level: "A2",
    now: new Date(NOW.getTime() + DAY_MS),
  });

  assert.equal(today.cards.length, SESSION_SIZE);
  const seen = new Set(today.cards.map((c) => c.id));
  for (const card of tomorrow.cards) {
    assert.equal(seen.has(card.id), false, `${card.id} пришёл второй день подряд`);
  }
});

test("«Ещё заход» приносит следующую порцию, а не ту же самую", () => {
  const first = buildGrammarSession({ mode: "build", level: "A2", now: NOW, round: 0 });
  const second = buildGrammarSession({ mode: "build", level: "A2", now: NOW, round: 1 });

  const seen = new Set(first.cards.map((c) => c.id));
  for (const card of second.cards) {
    assert.equal(seen.has(card.id), false, `${card.id} повторился во втором заходе`);
  }
  assert.ok(first.batches >= 2, "на уровне не набирается двух непересекающихся заходов");
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
