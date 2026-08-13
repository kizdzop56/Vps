// ─────────────────────────────────────────────────────────────────────────────
// Ситуации от учителя: роль-плей как ЗАДАНИЕ, а не свободный разговор.
//
// ── Чем это отличается от «Разговора со Снежей» ─────────────────────────────
// Свободный разговор (voice_chat_*) — бесконечная беседа ни о чём конкретном:
// у неё нет ни цели, ни конца, ни проверяющего. Ситуация — задание: учитель
// задаёт обстановку и роль собеседника, условие завершения (сколько реплик или
// какая цель достигнута), а по итогам ПОЛУЧАЕТ ВЕСЬ ДИАЛОГ С ОШИБКАМИ.
//
// Поэтому таблицы свои, а не флаг в voice_chat_sessions. Причины:
//   • у реплики ситуации есть разбор (верно/неверно, как правильно, что не так),
//     которого в voice_chat_messages нет и который там никому не нужен;
//   • у попытки есть владелец-учитель, статус и итог — в сессии свободного
//     разговора этого нет;
//   • свободный разговор считает очки с дневным потолком и попадает в медали
//     voice_*. Задание не должно ни закрывать эти медали, ни съедать потолок:
//     иначе учитель, выдавший десять ситуаций, обнулял бы экономику очков.
//
// Четыре таблицы:
//   dialog_scenarios            — сама ситуация (шаблон задания);
//   dialog_scenario_assignments — кому она выдана;
//   dialog_attempts             — прохождение одним учеником;
//   dialog_turns                — реплики попытки вместе с разбором ошибок.
// ─────────────────────────────────────────────────────────────────────────────
import {
  pgTable, serial, integer, text, boolean, timestamp, jsonb, index, unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Ситуация: то, что создаёт учитель. */
export const dialogScenariosTable = pgTable("dialog_scenarios", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  /** Название для списков: «Дорога до магазина». */
  title: text("title").notNull(),
  /** Обстановка: где происходит разговор и что вокруг. Русский текст. */
  situation: text("situation").notNull(),
  /** Кем выступает Снежа: «прохожий в незнакомом городе», «продавец». */
  role: text("role").notNull(),
  /**
   * Цель ученика: «узнать, как дойти до магазина». Пусто — цели нет, задание
   * закрывается по числу реплик.
   */
  goal: text("goal"),
  /**
   * Подпись условия завершения: turns | goal | both. НЕ настройка: сервер
   * выводит её из самого задания (есть цель, есть число реплик) и переписывает
   * при каждой правке. Настройкой она была раньше, и по умолчанию стояло «по
   * репликам» — из-за этого достигнутая цель задание не закрывала.
   */
  finishMode: text("finish_mode").notNull().default("turns"),
  /**
   * Сколько реплик ученика нужно. НОЛЬ — учитель не ограничивал: тогда задание
   * закрывает достигнутая цель. Если число задано, оно обязательно: цель без
   * набранных реплик задание не закроет.
   */
  turnsTarget: integer("turns_target").notNull().default(0),
  /**
   * Критерии, по которым отвечает и оценивает Снежа: строгость к ошибкам, о чём
   * спрашивать, какие слова и конструкции ждать. Список коротких строк.
   */
  criteria: jsonb("criteria").$type<string[]>(),
  /** Насколько строго придираться: gentle | normal | strict. */
  strictness: text("strictness").notNull().default("normal"),
  /** Уровень, под который Снежа подбирает слова: A1…C1 или уровень профиля. */
  level: text("level"),
  /** Первая реплика Снежи. Пусто — начинает ученик. */
  opener: text("opener"),
  /** Снята с выдачи: старые попытки остаются, новые не начинаются. */
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("dialog_scenarios_teacher_idx").on(t.teacherId, t.createdAt)]);

/** Выдача ситуации ученику. */
export const dialogAssignmentsTable = pgTable("dialog_scenario_assignments", {
  id: serial("id").primaryKey(),
  scenarioId: integer("scenario_id").notNull().references(() => dialogScenariosTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  assignedBy: integer("assigned_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  unique("dialog_assignment_unique").on(t.scenarioId, t.studentId),
  index("dialog_assignments_student_idx").on(t.studentId),
]);

/** Одно прохождение ситуации одним учеником. */
export const dialogAttemptsTable = pgTable("dialog_attempts", {
  id: serial("id").primaryKey(),
  scenarioId: integer("scenario_id").notNull().references(() => dialogScenariosTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  /** active — идёт, done — закрыта, stopped — ученик вышел сам. */
  status: text("status").notNull().default("active"),
  /** Реплик ученика. По нему считается условие «столько-то реплик». */
  turns: integer("turns").notNull().default(0),
  /** Ошибок в репликах — из них учитель видит, много ли работы. */
  mistakes: integer("mistakes").notNull().default(0),
  /** Цель достигнута: решает модель, но не раньше третьей реплики. */
  goalReached: boolean("goal_reached").notNull().default(false),
  /** Итог для учителя: короткий разбор от Снежи по всей беседе. */
  summary: text("summary"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  /** Учитель открыл разбор. Гасит метку «новое» в его списке. */
  seenAt: timestamp("seen_at"),
}, (t) => [
  index("dialog_attempts_student_idx").on(t.studentId, t.startedAt),
  index("dialog_attempts_scenario_idx").on(t.scenarioId, t.startedAt),
]);

/**
 * Реплика попытки.
 *
 * У реплики УЧЕНИКА хранится разбор: correct, fixed, issue. Именно из них
 * собирается то, что видит учитель, поэтому они лежат в строке, а не считаются
 * заново: модель на второй прогон ответит иначе, и «ошибки» в отчёте начали бы
 * меняться сами собой.
 */
export const dialogTurnsTable = pgTable("dialog_turns", {
  id: serial("id").primaryKey(),
  attemptId: integer("attempt_id").notNull().references(() => dialogAttemptsTable.id, { onDelete: "cascade" }),
  /** student | ai. */
  role: text("role").notNull(),
  /** Что было сказано (у ученика — как есть, без исправлений). */
  text: text("text").notNull(),
  /** Только у реплик ученика: разбор. */
  correct: boolean("correct"),
  /** Как надо было сказать. */
  fixed: text("fixed"),
  /** Что не так, по-русски и одной фразой. */
  issue: text("issue"),
  at: timestamp("at").notNull().defaultNow(),
}, (t) => [index("dialog_turns_attempt_idx").on(t.attemptId, t.at)]);

export type DialogScenario = typeof dialogScenariosTable.$inferSelect;
export type DialogAssignment = typeof dialogAssignmentsTable.$inferSelect;
export type DialogAttempt = typeof dialogAttemptsTable.$inferSelect;
export type DialogTurn = typeof dialogTurnsTable.$inferSelect;
