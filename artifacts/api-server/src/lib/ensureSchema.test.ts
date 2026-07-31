/**
 * Тесты страховки схемы (lib/ensureSchema.ts).
 * Запуск: pnpm exec tsx --test artifacts/api-server/src/lib/ensureSchema.test.ts
 *
 * Проверяем чистую часть — планирование ALTER'ов по снимку колонок базы.
 * Подключения к Postgres здесь нет: DATABASE_URL подставляем заглушкой (pg.Pool
 * не открывает соединение, пока не выполнен запрос), а модуль импортируем
 * динамически — уже после того, как переменная выставлена.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getTableColumns, getTableName } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

process.env["DATABASE_URL"] ??= "postgres://user:pass@127.0.0.1:5432/test";

const {
  alterStatement,
  planColumnAdditions,
  renderDefault,
  schemaTables,
} = await import("./ensureSchema");

/** Полный снимок «база догнала схему»: все таблицы со всеми колонками. */
function fullSnapshot(): Map<string, Set<string>> {
  const snapshot = new Map<string, Set<string>>();
  for (const table of schemaTables()) {
    const columns = Object.values(getTableColumns(table)) as PgColumn[];
    snapshot.set(getTableName(table), new Set(columns.map((c) => c.name)));
  }
  return snapshot;
}

/** Снимок без перечисленных колонок — имитируем отставшую базу. */
function snapshotWithout(missing: Array<[string, string]>): Map<string, Set<string>> {
  const snapshot = fullSnapshot();
  for (const [table, column] of missing) {
    const columns = snapshot.get(table);
    assert.ok(columns, `в схеме нет таблицы ${table}`);
    assert.ok(columns.delete(column), `в схеме нет колонки ${table}.${column}`);
  }
  return snapshot;
}

test("схема совпадает с базой — добавлять нечего", () => {
  const { additions, skipped, missingTables } = planColumnAdditions(fullSnapshot());
  assert.deepEqual(additions, []);
  assert.deepEqual(skipped, []);
  assert.deepEqual(missingTables, []);
});

test("колонки из коммита 9c1851f досоздаются с нужными ограничениями", () => {
  const { additions, skipped } = planColumnAdditions(snapshotWithout([
    ["words", "emoji"],
    ["user_card_state", "lapses"],
    ["flashcard_settings", "daily_word_goal"],
  ]));

  assert.deepEqual(skipped, []);
  assert.deepEqual(additions, [
    { table: "words", column: "emoji", definition: "text" },
    { table: "user_card_state", column: "lapses", definition: "integer not null default 0" },
    { table: "flashcard_settings", column: "daily_word_goal", definition: "integer not null default 10" },
  ]);
});

test("ALTER идемпотентен и заключает имена в кавычки", () => {
  assert.equal(
    alterStatement({ table: "words", column: "emoji", definition: "text" }),
    'alter table "words" add column if not exists "emoji" text',
  );
  assert.equal(
    alterStatement({ table: "user_card_state", column: "lapses", definition: "integer not null default 0" }),
    'alter table "user_card_state" add column if not exists "lapses" integer not null default 0',
  );
});

test("нулевая колонка добавляется без DEFAULT, NOT NULL — со значением", () => {
  const { additions } = planColumnAdditions(snapshotWithout([
    ["words", "ipa"],            // text, допускает NULL
    ["decks", "is_system"],      // boolean not null default false
  ]));

  const byColumn = new Map(additions.map((a) => [`${a.table}.${a.column}`, a.definition]));
  assert.equal(byColumn.get("words.ipa"), "text");
  assert.equal(byColumn.get("decks.is_system"), "boolean not null default false");
});

test("первичный ключ и serial сами не добавляем — отдаём миграции", () => {
  const { additions, skipped } = planColumnAdditions(snapshotWithout([["words", "id"]]));

  assert.deepEqual(additions, []);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0]?.table, "words");
  assert.equal(skipped[0]?.column, "id");
});

test("NOT NULL без простого DEFAULT не добавляем", () => {
  // translations_ru — jsonb NOT NULL без значения по умолчанию: на таблице с
  // данными такой ALTER невозможен, нужен настоящий drizzle-kit push.
  const { additions, skipped } = planColumnAdditions(snapshotWithout([["words", "translations_ru"]]));

  assert.deepEqual(additions, []);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0]?.column, "translations_ru");
  assert.match(skipped[0]?.reason ?? "", /NOT NULL/);
});

test("timestamp с defaultNow() не берёмся добавлять сами", () => {
  const { additions, skipped } = planColumnAdditions(snapshotWithout([["words", "created_at"]]));

  assert.deepEqual(additions, []);
  assert.equal(skipped[0]?.column, "created_at");
});

test("отсутствующая таблица только сообщается, колонки к ней не планируются", () => {
  const snapshot = fullSnapshot();
  snapshot.delete("words");

  const { additions, missingTables } = planColumnAdditions(snapshot);
  assert.ok(missingTables.includes("words"));
  assert.equal(additions.filter((a) => a.table === "words").length, 0);
});

test("значения по умолчанию превращаются в SQL-литералы", () => {
  assert.equal(renderDefault(0), "0");
  assert.equal(renderDefault(10), "10");
  assert.equal(renderDefault(true), "true");
  assert.equal(renderDefault(false), "false");
  assert.equal(renderDefault("know"), "'know'");
  assert.equal(renderDefault("it's"), "'it''s'");
  assert.equal(renderDefault(undefined), null);
  assert.equal(renderDefault(null), null);
  assert.equal(renderDefault({ sql: "now()" }), null);
});
