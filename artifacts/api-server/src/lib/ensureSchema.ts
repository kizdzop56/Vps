// ─────────────────────────────────────────────────────────────────────────────
// Страховка схемы БД на старте сервера: досоздаём недостающие «аддитивные» колонки.
//
// Зачем это нужно
// ───────────────
// Схема живёт в lib/db/src/schema и попадает на боевую базу командой
// drizzle-kit push. В scripts/prod-start.mjs push выполняется на каждом старте,
// но его можно отключить переменной RUN_DB_SETUP=false — именно так советует
// сделать комментарий в render.yaml, чтобы холодные старты шли быстрее.
//
// После этого любая новая колонка в схеме ломает боевой сервер: drizzle
// перечисляет в SELECT все колонки таблицы, и Postgres отвечает
// «column ... does not exist». Причём падает не одна страница, а весь раздел.
//
// Так и случилось с колонками words.emoji, user_card_state.lapses и
// flashcard_settings.daily_word_goal (коммит 9c1851f, «нужен pnpm db:push»):
// GET /flashcards/catalog/words, /flashcards/decks, /flashcards/settings,
// /flashcards/stats отдавали 500 — учитель не мог ни открыть каталог слов, ни
// добавить слово в колоду.
//
// Как работает
// ────────────
// Сверяем колонки из схемы drizzle с information_schema и добавляем отсутствующие.
// Не зависит от RUN_DB_SETUP, идемпотентно (ADD COLUMN IF NOT EXISTS) и не
// нуждается в поддержке руками: список колонок берётся из самой схемы, поэтому
// следующая добавленная колонка подхватится сама.
//
// Границы ответственности
// ───────────────────────
// Это подстраховка, а не замена миграциям. Добавляем только то, что безопасно
// добавить в таблицу с данными:
//   • колонку, допускающую NULL;
//   • колонку NOT NULL с простым значением по умолчанию.
// Всё остальное (NOT NULL без DEFAULT, новые таблицы, переименования, изменение
// типов, индексы, внешние ключи) пропускаем и громко пишем в лог — такие правки
// по-прежнему требуют drizzle-kit push.
// ─────────────────────────────────────────────────────────────────────────────
import { getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { PgTable, type PgColumn } from "drizzle-orm/pg-core";
import * as schema from "@workspace/db";
import { db } from "@workspace/db";
import { logger } from "./logger";

/** Одна колонка, которую можно досоздать: готовый хвост ALTER TABLE. */
export type ColumnAddition = {
  table: string;
  column: string;
  /** Тип и ограничения: «text», «integer not null default 0». */
  definition: string;
};

/** Колонка, которую сами добавить не берёмся, — с причиной для лога. */
export type SkippedColumn = {
  table: string;
  column: string;
  reason: string;
};

/** Карта «таблица → её колонки», как их видит база. */
export type ExistingColumns = Map<string, Set<string>>;

/**
 * Все таблицы схемы drizzle. Берём из общего экспорта @workspace/db, чтобы
 * список не приходилось поддерживать вручную.
 */
export function schemaTables(): PgTable[] {
  // Через Record<string, unknown>: в общем экспорте лежат не только таблицы, но и
  // db, pool и zod-схемы, а сужение объединения их типов до PgTable TS не примет.
  const exported = Object.values(schema as Record<string, unknown>);
  return exported.filter((value): value is PgTable => is(value, PgTable));
}

/**
 * Значение по умолчанию в виде SQL-литерала.
 *
 * Сознательно поддерживаем только простые значения: число, строку, boolean.
 * Выражения (defaultNow(), sql`...`) и составные значения не разбираем — для
 * колонки NOT NULL это повод пропустить её и отдать на откуп drizzle-kit push.
 */
export function renderDefault(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  return null;
}

/**
 * Можно ли досоздать эту колонку в таблице с данными — и если да, каким ALTER.
 *
 * Первичные ключи и serial пропускаем: такие колонки появляются вместе с
 * таблицей, а не добавляются к существующей.
 */
export function planColumn(column: PgColumn): { definition: string } | { reason: string } {
  const sqlType = column.getSQLType();

  if (column.primary) return { reason: "первичный ключ" };
  if (/^(serial|bigserial|smallserial)\b/i.test(sqlType)) return { reason: `тип ${sqlType}` };

  if (!column.notNull) return { definition: sqlType };

  const literal = renderDefault(column.hasDefault ? column.default : undefined);
  if (literal === null) {
    return { reason: "NOT NULL без простого значения по умолчанию" };
  }
  return { definition: `${sqlType} not null default ${literal}` };
}

/**
 * Что нужно добавить, чтобы база догнала схему.
 *
 * Чистая функция — принимает снимок колонок базы, поэтому проверяется тестами
 * без подключения к Postgres (см. ensureSchema.test.ts).
 *
 * Таблицы, которых в базе нет вовсе, не трогаем: добавить колонку в
 * несуществующую таблицу нельзя, её создаст drizzle-kit push или сид.
 */
export function planColumnAdditions(existing: ExistingColumns): {
  additions: ColumnAddition[];
  skipped: SkippedColumn[];
  missingTables: string[];
} {
  const additions: ColumnAddition[] = [];
  const skipped: SkippedColumn[] = [];
  const missingTables: string[] = [];

  for (const table of schemaTables()) {
    const tableName = getTableName(table);
    const present = existing.get(tableName);
    if (!present) {
      missingTables.push(tableName);
      continue;
    }

    for (const column of Object.values(getTableColumns(table)) as PgColumn[]) {
      if (present.has(column.name)) continue;

      const planned = planColumn(column);
      if ("reason" in planned) {
        skipped.push({ table: tableName, column: column.name, reason: planned.reason });
        continue;
      }
      additions.push({ table: tableName, column: column.name, definition: planned.definition });
    }
  }

  return { additions, skipped, missingTables };
}

/** Готовый ALTER для одной колонки. */
export function alterStatement(addition: ColumnAddition): string {
  return `alter table "${addition.table}" add column if not exists "${addition.column}" ${addition.definition}`;
}

/** Снимок колонок текущей схемы базы. */
async function readExistingColumns(): Promise<ExistingColumns> {
  const result = await db.execute<{ table_name: string; column_name: string }>(sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = current_schema()
  `);
  // node-postgres отдаёт QueryResult, а не массив строк.
  const rows = (result as unknown as { rows?: Array<{ table_name: string; column_name: string }> }).rows
    ?? (result as unknown as Array<{ table_name: string; column_name: string }>);

  const existing: ExistingColumns = new Map();
  for (const row of rows) {
    const columns = existing.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    existing.set(row.table_name, columns);
  }
  return existing;
}

/**
 * Привести базу в соответствие со схемой в части аддитивных колонок.
 *
 * Никогда не бросает исключение: сервер должен подняться даже если база
 * недоступна — иначе вместо частично работающего приложения получим контейнер,
 * падающий в цикле. Все проблемы уходят в лог.
 */
export async function ensureAdditiveColumns(): Promise<{ added: string[]; failed: string[] }> {
  const added: string[] = [];
  const failed: string[] = [];

  try {
    const existing = await readExistingColumns();
    const { additions, skipped, missingTables } = planColumnAdditions(existing);

    if (missingTables.length > 0) {
      logger.warn(
        { tables: missingTables },
        "Schema guard: tables missing from the database — run drizzle-kit push (pnpm db:push)",
      );
    }
    if (skipped.length > 0) {
      logger.warn(
        { columns: skipped.map((c) => `${c.table}.${c.column} (${c.reason})`) },
        "Schema guard: columns need a real migration — run drizzle-kit push (pnpm db:push)",
      );
    }
    if (additions.length === 0) {
      logger.info("Schema guard: database columns match the drizzle schema");
      return { added, failed };
    }

    // По одному запросу на колонку: сбой на одной не должен отменять остальные.
    for (const addition of additions) {
      const target = `${addition.table}.${addition.column}`;
      try {
        await db.execute(sql.raw(alterStatement(addition)));
        added.push(target);
      } catch (err) {
        failed.push(target);
        logger.error({ err, column: target }, "Schema guard: failed to add missing column");
      }
    }

    if (added.length > 0) {
      logger.warn({ columns: added }, "Schema guard: added missing columns to catch up with the schema");
    }
  } catch (err) {
    logger.error({ err }, "Schema guard: could not compare the database with the schema");
  }

  return { added, failed };
}
