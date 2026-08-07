// ─────────────────────────────────────────────────────────────────────────────
// Досоздание недостающих колонок и таблиц при старте.
//
// ЗАЧЕМ. drizzle перечисляет в SELECT все колонки схемы, поэтому одна колонка,
// добавленная в код, но не доехавшая до базы, роняет КАЖДЫЙ запрос к таблице.
// Так `daily_goal_claimed_date` уронила чужой профиль, цель дня и всю
// статистику разом: «Failed query: select "id", "username", …».
//
// С целыми таблицами то же самое, только грубее: запрос к несуществующей
// таблице падает всегда.
//
// Продакшен на Render деплоится обычным пушем, миграции руками почти никогда не
// гоняются, а падение выглядит как сломанное приложение, хотя код правильный.
// Поэтому сервер сам приводит схему в порядок при старте.
//
// ГРАНИЦЫ. Сюда попадают ТОЛЬКО простые добавления: колонка с DEFAULT или NULL
// и создание таблицы с нуля — то, без чего сервер не отвечает. Переименования,
// смены типов и всё, что требует переноса данных, остаются за drizzle-kit push:
// их нельзя выполнять вслепую на живой базе.
//
// Все команды идемпотентны (IF NOT EXISTS), поэтому на уже мигрированной базе
// блок не делает ничего и стоит пары запросов.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/** Колонка, без которой падают запросы. Порядок значения не имеет. */
interface ColumnPatch {
  table: string;
  column: string;
  /** Тип и модификаторы: «date», «integer not null default 0». */
  definition: string;
  /** Зачем она нужна — чтобы список не превратился в свалку. */
  reason: string;
}

/** Таблица, которой может не быть на уже развёрнутой базе. */
interface TablePatch {
  name: string;
  /** Полный CREATE TABLE IF NOT EXISTS. */
  create: string;
  /** Индексы и ограничения — отдельными идемпотентными командами. */
  indexes?: string[];
  reason: string;
}

const PATCHES: ColumnPatch[] = [
  {
    table: "users",
    column: "daily_goal_claimed_date",
    definition: "date",
    reason: "день последней выданной награды за цель дня",
  },
  {
    table: "users",
    column: "next_daily_goal_minutes",
    definition: "integer not null default 15",
    reason: "цель по времени, выбранная на следующий день",
  },
  {
    table: "users",
    column: "daily_goal_applied_date",
    definition: "date",
    reason: "день последнего переноса отложенной цели",
  },
  {
    table: "users",
    column: "interests",
    definition: "jsonb",
    reason: "темы, интересные ученику (блок «О себе»)",
  },
  {
    table: "users",
    column: "onboarding_seen",
    definition: "jsonb",
    reason: "просмотренные вкладки онбординга",
  },
];

const TABLES: TablePatch[] = [
  {
    name: "notifications",
    reason: "лента событий: колокольчик в профиле и всплывающие окна",
    create: `create table if not exists "notifications" (
      "id" serial primary key,
      "user_id" integer not null references "users"("id") on delete cascade,
      "kind" text not null,
      "dedupe_key" text not null,
      "title" text not null,
      "body" text not null default '',
      "detail" text not null default '',
      "meta" jsonb,
      "created_at" timestamp not null default now(),
      "read_at" timestamp,
      "seen_at" timestamp
    )`,
    indexes: [
      // Уникальность по ключу события — на ней держится идемпотентность ленты.
      `create unique index if not exists "notification_dedupe_unique" on "notifications" ("user_id", "dedupe_key")`,
      `create index if not exists "notifications_user_created_idx" on "notifications" ("user_id", "created_at")`,
    ],
  },
];

/**
 * Приводит схему в состояние, при котором сервер способен отвечать.
 *
 * Не бросает исключений: если базе не хватает прав на ALTER, приложение должно
 * подняться и сообщить об этом в лог, а не молча не стартовать.
 */
export async function ensureSchema(): Promise<void> {
  for (const patch of PATCHES) {
    try {
      await db.execute(
        sql.raw(
          `alter table "${patch.table}" add column if not exists "${patch.column}" ${patch.definition}`,
        ),
      );
    } catch (err) {
      logger.error(
        { err, table: patch.table, column: patch.column, reason: patch.reason },
        "Не удалось досоздать колонку — запросы к таблице могут падать",
      );
    }
  }

  for (const table of TABLES) {
    try {
      await db.execute(sql.raw(table.create));
      for (const statement of table.indexes ?? []) {
        await db.execute(sql.raw(statement));
      }
    } catch (err) {
      logger.error(
        { err, table: table.name, reason: table.reason },
        "Не удалось досоздать таблицу — связанный раздел работать не будет",
      );
    }
  }
}
