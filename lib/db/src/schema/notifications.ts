import { pgTable, serial, integer, text, jsonb, timestamp, unique, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Лента уведомлений ученика.
 *
 * Строки создаются НЕ в момент события, а при чтении ленты — из текущего
 * состояния базы (см. api-server/src/lib/notifications.ts). Причина: события
 * рождаются в пяти разных местах (награды, дружба, назначения заданий, план
 * дня), и врезаться в каждое означало бы пять шансов забыть про уведомление.
 * Вывод из состояния даёт ещё и историю задним числом: медали и задания,
 * полученные до появления этой ленты, в ней всё равно окажутся.
 *
 * Отсюда dedupe_key: он описывает СОБЫТИЕ, а не запись, и уникален в пределах
 * пользователя. Пересчёт ленты сто раз подряд даёт те же самые строки.
 */
export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  /** quest | goal | achievement | friend_request | teacher_request | assignment. */
  kind: text("kind").notNull(),
  /** Ключ события: «achievement:tasks_5», «quest:2026-08-07:words». */
  dedupeKey: text("dedupe_key").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  /** Развёрнутый текст для экрана подробностей. */
  detail: text("detail").notNull().default(""),
  /** Ссылки на объекты события: achievementId, assignmentId, dueAt и прочее. */
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  /** Ученик открыл уведомление. Гасит счётчик у колокольчика. */
  readAt: timestamp("read_at"),
  /**
   * Всплывающее окно уже показывали.
   *
   * Отдельно от readAt: окно показывается один раз, а счётчик держится до тех
   * пор, пока уведомление не открыли. Одним полем это не описать — либо окно
   * всплывает при каждом обновлении экрана, либо счётчик гаснет сам собой.
   */
  seenAt: timestamp("seen_at"),
}, (t) => [
  unique("notification_dedupe_unique").on(t.userId, t.dedupeKey),
  index("notifications_user_created_idx").on(t.userId, t.createdAt),
]);

export type AppNotification = typeof notificationsTable.$inferSelect;
