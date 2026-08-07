// ─────────────────────────────────────────────────────────────────────────────
// Досоздание недостающих колонок при старте.
//
// ЗАЧЕМ. drizzle перечисляет в SELECT все колонки схемы, поэтому одна колонка,
// добавленная в код, но не доехавшая до базы, роняет КАЖДЫЙ запрос к таблице.
// Так `daily_goal_claimed_date` уронила чужой профиль, цель дня и всю
// статистику разом: «Failed query: select "id", "username", …».
//
// Продакшен на Render деплоится обычным пушем, миграции руками почти никогда не
// гоняются, а падение выглядит как сломанное приложение, хотя код правильный.
// Поэтому сервер сам приводит схему в порядок при старте.
//
// ГРАНИЦЫ. Сюда попадают ТОЛЬКО простые добавления колонок с DEFAULT или
// NULL — то, без чего сервер не отвечает. Переименования, смены типов, индексы
// и всё, что требует переноса данных, остаются за drizzle-kit push: их нельзя
// выполнять вслепую на живой базе.
//
// Все команды идемпотентны (IF NOT EXISTS), поэтому на уже мигрированной базе
// блок не делает ничего и стоит один запрос.
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
  {
    table: "review_log",
    column: "grade",
    definition: "text",
    reason: "оценка ответа (again/hard/good/easy) для точного дневного потолка очков",
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
}
