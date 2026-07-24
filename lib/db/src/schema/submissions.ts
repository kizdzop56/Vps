import { pgTable, serial, integer, timestamp, text, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { assignmentsTable } from "./assignments";

export const submissionsTable = pgTable("submissions", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id),
  assignmentId: integer("assignment_id").notNull().references(() => assignmentsTable.id),
  score: integer("score").notNull().default(0),
  correctCount: integer("correct_count").notNull().default(0),
  totalQuestions: integer("total_questions").notNull().default(0),
  pointsEarned: integer("points_earned").notNull().default(0),
  recordingUrl: text("recording_url"),
  textAnswer: text("text_answer"),
  attachmentUrl: text("attachment_url"),
  status: text("status").notNull().default("graded"),
  teacherFeedback: text("teacher_feedback"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

export const submissionAnswersTable = pgTable("submission_answers", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id").notNull().references(() => submissionsTable.id, { onDelete: "cascade" }),
  questionId: integer("question_id").notNull(),
  studentAnswer: text("student_answer").notNull(),
  correctAnswer: text("correct_answer").notNull(),
  isCorrect: boolean("is_correct").notNull().default(false),
  questionText: text("question_text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSubmissionSchema = createInsertSchema(submissionsTable).omit({
  id: true,
  submittedAt: true,
});
export const insertSubmissionAnswerSchema = createInsertSchema(submissionAnswersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type InsertSubmissionAnswer = z.infer<typeof insertSubmissionAnswerSchema>;
export type Submission = typeof submissionsTable.$inferSelect;
export type SubmissionAnswer = typeof submissionAnswersTable.$inferSelect;
