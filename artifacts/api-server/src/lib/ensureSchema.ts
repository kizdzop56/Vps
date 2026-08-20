// ─────────────────────────────────────────────────────────────────────────────
// Досоздание недостающих таблиц и колонок при старте.
//
// ЗАЧЕМ. drizzle перечисляет в SELECT все колонки схемы, поэтому одна колонка,
// добавленная в код, но не доехавшая до базы, роняет КАЖДЫЙ запрос к таблице.
// Так daily_goal_claimed_date уронила чужой профиль, цель дня и всю
// статистику разом. С таблицей то же самое, только хуже: раздел целиком
// отвечает пятисоткой.
//
// Продакшен на Render деплоится обычным пушем, миграции руками почти никогда не
// гоняются, а падение выглядит как сломанное приложение, хотя код правильный.
// Поэтому сервер сам приводит схему в порядок при старте.
//
// ГРАНИЦЫ. Сюда попадают ТОЛЬКО создание таблиц и простые добавления колонок с
// DEFAULT или NULL — то, без чего сервер не отвечает. Переименования, смены
// типов и всё, что требует переноса данных, остаются за drizzle-kit push: их
// нельзя выполнять вслепую на живой базе.
//
// Исключение — добавление ЗНАЧЕНИЯ в уже существующий enum (ALTER TYPE ... ADD
// VALUE IF NOT EXISTS): это тоже безопасно и обратимо только вперёд, как и
// добавление колонки, а без него разрастание enum (например,
// message_attachment_type: 'image'/'audio' → плюс 'video') на
// уже развёрнутой базе не доедет никогда — сам CREATE TYPE выполняется только
// «если не существует» и молча не тронет уже созданный тип.
//
// Оставшиеся не нужными колонки здесь НЕ удаляются: удаление необратимо, а
// лишняя колонка с DEFAULT никому не мешает.
//
// Определения написаны дословно, а не выведены из схемы drizzle: генерация DDL
// из кода — это свой мини-drizzle-kit, а настоящий в проекте уже есть. Здесь
// только страховка от «код доехал, база нет».
//
// Все команды идемпотентны (IF NOT EXISTS), поэтому на уже мигрированной базе
// блок не делает ничего.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

interface TablePatch {
  table: string;
  ddl: string[];
  reason: string;
}

interface ColumnPatch {
  table: string;
  column: string;
  definition: string;
  reason: string;
}

const CONVERSATIONS_ENUM_DDL = [
  "do $$ begin",
  "  create type \"message_attachment_type\" as enum ('image', 'audio', 'video');",
  "exception when duplicate_object then null;",
  "end $$",
].join("\n");

// Базы, где тип уже был создан ДО того, как в него добавили 'video', не
// получат новое значение от CONVERSATIONS_ENUM_DDL выше (он срабатывает только
// «если типа ещё нет вовсе»). Это отдельный шаг именно за это и отвечает.
const MESSAGE_ATTACHMENT_VIDEO_DDL =
  "alter type \"message_attachment_type\" add value if not exists 'video'";

const CONVERSATIONS_TABLE_DDL = [
  "create table if not exists \"conversations\" (",
  "  \"id\" serial primary key,",
  "  \"user_a_id\" integer not null references \"users\"(\"id\") on delete cascade,",
  "  \"user_b_id\" integer not null references \"users\"(\"id\") on delete cascade,",
  "  \"last_message_at\" timestamp not null default now(),",
  "  \"created_at\" timestamp not null default now(),",
  "  constraint \"conversation_pair_unique\" unique (\"user_a_id\", \"user_b_id\")",
  ")",
].join("\n");

const MESSAGES_TABLE_DDL = [
  "create table if not exists \"messages\" (",
  "  \"id\" serial primary key,",
  "  \"conversation_id\" integer not null references \"conversations\"(\"id\") on delete cascade,",
  "  \"sender_id\" integer not null references \"users\"(\"id\") on delete cascade,",
  "  \"text\" text,",
  "  \"attachment_url\" text,",
  "  \"attachment_type\" \"message_attachment_type\",",
  "  \"read_at\" timestamp,",
  "  \"created_at\" timestamp not null default now()",
  ")",
].join("\n");

const MESSAGES_INDEX_DDL =
  "create index if not exists \"messages_conversation_time_idx\" on \"messages\" (\"conversation_id\", \"created_at\")";

const TABLES: TablePatch[] = [
  {
    table: "conversations",
    reason:
      "личные сообщения (ученик/учитель/родитель): без таблиц раздел «Чат» отвечает 500 на КАЖДЫЙ запрос, вне зависимости от собеседника",
    ddl: [
      CONVERSATIONS_ENUM_DDL,
      MESSAGE_ATTACHMENT_VIDEO_DDL,
      CONVERSATIONS_TABLE_DDL,
      MESSAGES_TABLE_DDL,
      MESSAGES_INDEX_DDL,
    ],
  },
  {
    table: "grammar_log",
    reason: "журнал ответов раздела «Составлять»: потолок очков и статистика",
    ddl: [
      `create table if not exists "grammar_log" (
         "id" serial primary key,
         "user_id" integer not null references "users"("id") on delete cascade,
         "task_id" text not null,
         "mode" text not null,
         "topic" text,
         "input" text not null,
         "correct" boolean not null,
         "typo" boolean not null default false,
         "points_earned" integer not null default 0,
         "answered_at" timestamp not null default now()
       )`,
      `create index if not exists "grammar_log_user_time_idx"
         on "grammar_log" ("user_id", "answered_at")`,
    ],
  },
  {
    table: "raid_events",
    reason: "рейд недели: без него вкладка «Рейд» отвечает ошибкой",
    ddl: [
      `create table if not exists "raid_events" (
         "id" serial primary key,
         "boss" text not null,
         "week_key" text not null,
         "starts_at" timestamp not null,
         "ends_at" timestamp not null,
         "hp_total" integer not null,
         "damage_dealt" integer not null default 0,
         "status" text not null default 'active',
         "killer_user_id" integer,
         "hp_tuned_at" timestamp not null default now(),
         "resolved_at" timestamp,
         "created_at" timestamp not null default now(),
         constraint "raid_event_week_unique" unique ("week_key")
       )`,
    ],
  },
  {
    table: "raid_participants",
    reason: "вклад ученика в рейд: рейтинг и сундук",
    ddl: [
      `create table if not exists "raid_participants" (
         "id" serial primary key,
         "event_id" integer not null references "raid_events"("id") on delete cascade,
         "user_id" integer not null references "users"("id") on delete cascade,
         "damage" integer not null default 0,
         "hits" integer not null default 0,
         "crits" integer not null default 0,
         "best_combo" integer not null default 0,
         "milestone" integer not null default 0,
         "chest_claimed" boolean not null default false,
         "last_hit_at" timestamp,
         "created_at" timestamp not null default now(),
         constraint "raid_participant_unique" unique ("event_id", "user_id")
       )`,
      `create index if not exists "raid_participants_event_damage_idx"
         on "raid_participants" ("event_id", "damage")`,
    ],
  },
  {
    table: "raid_hits",
    reason: "журнал ударов: дневное задание и лента последних попаданий",
    ddl: [
      `create table if not exists "raid_hits" (
         "id" serial primary key,
         "event_id" integer not null references "raid_events"("id") on delete cascade,
         "user_id" integer not null references "users"("id") on delete cascade,
         "damage" integer not null default 0,
         "tag" text,
         "difficulty" text not null,
         "crit" boolean not null default false,
         "super_effective" boolean not null default false,
         "combo" integer not null default 0,
         "at" timestamp not null default now()
       )`,
      `create index if not exists "raid_hits_user_time_idx" on "raid_hits" ("user_id", "at")`,
      `create index if not exists "raid_hits_event_time_idx" on "raid_hits" ("event_id", "at")`,
    ],
  },
  {
    table: "raid_tasks",
    reason: "журнал выданных заданий боя: ротация подборки и проверка ответа",
    ddl: [
      `create table if not exists "raid_tasks" (
         "id" serial primary key,
         "user_id" integer not null references "users"("id") on delete cascade,
         "kind" text not null,
         "ref" text not null,
         "mode" text not null,
         "difficulty" text not null,
         "tags" jsonb,
         "issued_at" timestamp not null default now(),
         "answered_at" timestamp,
         "correct" boolean
       )`,
      `create index if not exists "raid_tasks_user_time_idx" on "raid_tasks" ("user_id", "issued_at")`,
      `create index if not exists "raid_tasks_user_ref_idx" on "raid_tasks" ("user_id", "ref")`,
    ],
  },
  {
    table: "raid_state",
    reason: "боевое состояние ученика: энергия, комбо, монеты, сумка бафов",
    ddl: [
      `create table if not exists "raid_state" (
         "user_id" integer primary key references "users"("id") on delete cascade,
         "stamina" integer not null default 20,
         "stamina_at" timestamp not null default now(),
         "combo" integer not null default 0,
         "clean_streak" integer not null default 0,
         "power_armed" boolean not null default false,
         "power_stacks" integer not null default 0,
         "aoe_stock" integer not null default 0,
         "aoe_left" integer not null default 0,
         "stamina_stock" integer not null default 0,
         "hints" integer not null default 0,
         "shield_until" timestamp,
         "rust_until" timestamp,
         "boost_until" timestamp,
         "last_active_at" timestamp,
         "coins" integer not null default 0,
         "bonus_day" date,
         "keys" integer not null default 0,
         "frames" jsonb,
         "weapon_skin" text,
         "weapon_event_id" integer,
         "title" text,
         "title_until" timestamp,
         "quest_day" date,
         "quest_claimed" boolean not null default false,
         "updated_at" timestamp not null default now()
       )`,
    ],
  },
  {
    table: "dialog_scenarios",
    reason: "ситуации от учителя: без них раздел ролевых заданий отвечает ошибкой",
    ddl: [
      `create table if not exists "dialog_scenarios" (
         "id" serial primary key,
         "teacher_id" integer not null references "users"("id") on delete cascade,
         "title" text not null,
         "situation" text not null,
         "role" text not null,
         "goal" text,
         "finish_mode" text not null default 'turns',
         "turns_target" integer not null default 20,
         "criteria" jsonb,
         "strictness" text not null default 'normal',
         "level" text,
         "opener" text,
         "archived" boolean not null default false,
         "created_at" timestamp not null default now(),
         "updated_at" timestamp not null default now()
       )`,
      `create index if not exists "dialog_scenarios_teacher_idx"
         on "dialog_scenarios" ("teacher_id", "created_at")`,
    ],
  },
  {
    table: "dialog_scenario_assignments",
    reason: "кому выдана ситуация: по ней ученик видит задание",
    ddl: [
      `create table if not exists "dialog_scenario_assignments" (
         "id" serial primary key,
         "scenario_id" integer not null references "dialog_scenarios"("id") on delete cascade,
         "student_id" integer not null references "users"("id") on delete cascade,
         "assigned_by" integer references "users"("id") on delete set null,
         "created_at" timestamp not null default now(),
         constraint "dialog_assignment_unique" unique ("scenario_id", "student_id")
       )`,
      `create index if not exists "dialog_assignments_student_idx"
         on "dialog_scenario_assignments" ("student_id")`,
    ],
  },
  {
    table: "dialog_attempts",
    reason: "прохождение ситуации: статус, реплики, ошибки, итог для учителя",
    ddl: [
      `create table if not exists "dialog_attempts" (
         "id" serial primary key,
         "scenario_id" integer not null references "dialog_scenarios"("id") on delete cascade,
         "student_id" integer not null references "users"("id") on delete cascade,
         "status" text not null default 'active',
         "turns" integer not null default 0,
         "mistakes" integer not null default 0,
         "goal_reached" boolean not null default false,
         "summary" text,
         "started_at" timestamp not null default now(),
         "finished_at" timestamp,
         "seen_at" timestamp
       )`,
      `create index if not exists "dialog_attempts_student_idx"
         on "dialog_attempts" ("student_id", "started_at")`,
      `create index if not exists "dialog_attempts_scenario_idx"
         on "dialog_attempts" ("scenario_id", "started_at")`,
    ],
  },
  {
    table: "dialog_turns",
    reason: "реплики ситуации вместе с разбором ошибок — это и есть отчёт учителю",
    ddl: [
      `create table if not exists "dialog_turns" (
         "id" serial primary key,
         "attempt_id" integer not null references "dialog_attempts"("id") on delete cascade,
         "role" text not null,
         "text" text not null,
         "correct" boolean,
         "fixed" text,
         "issue" text,
         "at" timestamp not null default now()
       )`,
      `create index if not exists "dialog_turns_attempt_idx" on "dialog_turns" ("attempt_id", "at")`,
    ],
  },
];

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
  {
    table: "raid_state",
    column: "bonus_day",
    definition: "date",
    reason: "день, за который выданы монеты за вход (пришла на место mana_day)",
  },
  {
    table: "raid_state",
    column: "power_stacks",
    definition: "integer not null default 0",
    reason:
      "запас купленных мощных ударов: без неё баф нельзя купить второй раз, пока не потрачен первый",
  },
  // Сумка бафов. Колонки появились вместе с ручным применением бафов и
  // свитками подсказок. Без них на развёрнутой базе drizzle выбирает
  // несуществующие поля, и ЛЮБОЙ запрос к raid_state отвечает пятисоткой —
  // вкладка «Рейд» в этот момент грузится бесконечно.
  {
    table: "raid_state",
    column: "aoe_stock",
    definition: "integer not null default 0",
    reason: "запас купленных AOE-ударов в сумке (отдельно от активного aoe_left)",
  },
  {
    table: "raid_state",
    column: "stamina_stock",
    definition: "integer not null default 0",
    reason: "запас колб полной энергии: применяются вручную в бою",
  },
  {
    table: "raid_state",
    column: "hints",
    definition: "integer not null default 0",
    reason: "свитки подсказок: без них весь рейд отвечает ошибкой",
  },
];

/**
 * Приводит схему в состояние, при котором сервер способен отвечать.
 *
 * Не бросает исключений: если базе не хватает прав на ALTER, приложение должно
 * подняться и сообщить об этом в лог, а не молча не стартовать.
 */
export async function ensureSchema(): Promise<void> {
  for (const patch of TABLES) {
    for (const statement of patch.ddl) {
      try {
        await db.execute(sql.raw(statement));
      } catch (err) {
        logger.error(
          { err, table: patch.table, reason: patch.reason },
          "Не удалось досоздать таблицу — раздел будет отвечать ошибкой",
        );
      }
    }
  }

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
