import { pgTable, text, serial, integer, timestamp, pgEnum, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assignmentTypeEnum = pgEnum("assignment_type", ["text_test", "audio", "reading", "video", "free_form"]);
export const assignmentSourceEnum = pgEnum("assignment_source", ["app_suggested", "teacher_created"]);

export const assignmentsTable = pgTable("assignments", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: assignmentTypeEnum("type").notNull(),
  source: assignmentSourceEnum("source").notNull().default("app_suggested"),
  createdBy: integer("created_by"),
  ageMin: integer("age_min").notNull().default(5),
  ageMax: integer("age_max").notNull().default(18),
  points: integer("points").notNull().default(10),
  mediaUrl: text("media_url"),
  content: text("content"),
  isDraft: boolean("is_draft").notNull().default(true),
  timeLimitMinutes: integer("time_limit_minutes"),
  imageUrl: text("image_url"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const questionsTable = pgTable("questions", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => assignmentsTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  options: jsonb("options").notNull().$type<string[]>(),
  correctAnswer: text("correct_answer").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAssignmentSchema = createInsertSchema(assignmentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertQuestionSchema = createInsertSchema(questionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Assignment = typeof assignmentsTable.$inferSelect;
export type Question = typeof questionsTable.$inferSelect;
