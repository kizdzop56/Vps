import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const timeSessionsTable = pgTable("time_sessions", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  durationMinutes: integer("duration_minutes"),
});

export const insertTimeSessionSchema = createInsertSchema(timeSessionsTable).omit({
  id: true,
  startedAt: true,
});
export type InsertTimeSession = z.infer<typeof insertTimeSessionSchema>;
export type TimeSession = typeof timeSessionsTable.$inferSelect;
