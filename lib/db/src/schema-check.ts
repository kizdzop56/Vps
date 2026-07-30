// Сверка схемы в реальной БД с тем, что объявлено в коде.
//
// Живёт в @workspace/db, потому что нужна в двух местах: в CLI-скрипте
// (scripts/src/check-schema.ts, вызывается при старте) и в API — эндпоинт
// GET /api/healthz/db показывает расхождение прямо из браузера.
//
// Предыстория: в задеплоенной базе не хватало таблиц deck_assignments,
// conversations и messages, из-за чего /api/flashcards/decks и /api/messages/*
// отвечали 500, а приложение выглядело работающим. Такое расхождение должно
// обнаруживаться автоматически, а не вручную по симптомам.
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { pool } from "./client";

/** Имена таблиц, объявленных в схеме drizzle. */
export function expectedTables(): string[] {
  const names = new Set<string>();
  for (const value of Object.values(schema)) {
    if (is(value, PgTable)) names.add(getTableName(value));
  }
  return [...names].sort();
}

export type SchemaCheck = {
  ok: boolean;
  expectedCount: number;
  missingTables: string[];
};

/**
 * Возвращает список таблиц из схемы, которых нет в базе.
 * Бросает исключение, если до базы не достучаться, — вызывающий решает,
 * считать это фатальным или нет.
 */
export async function checkSchema(): Promise<SchemaCheck> {
  const expected = expectedTables();
  const { rows } = await pool.query<{ table_name: string }>(
    `select table_name
       from information_schema.tables
      where table_schema = current_schema()
        and table_type = 'BASE TABLE'`,
  );
  const present = new Set(rows.map((r) => r.table_name));
  const missingTables = expected.filter((name) => !present.has(name));

  return { ok: missingTables.length === 0, expectedCount: expected.length, missingTables };
}
