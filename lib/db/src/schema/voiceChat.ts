import { pgTable, serial, integer, timestamp, text, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const messageSenderEnum = pgEnum("message_sender", ["student", "ai"]);

export const voiceChatSessionsTable = pgTable("voice_chat_sessions", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id),
  messageCount: integer("message_count").notNull().default(0),
  pointsEarned: integer("points_earned").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const voiceChatMessagesTable = pgTable("voice_chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => voiceChatSessionsTable.id, { onDelete: "cascade" }),
  role: messageSenderEnum("role").notNull(),
  audioUrl: text("audio_url"),
  transcript: text("transcript").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVoiceChatSessionSchema = createInsertSchema(voiceChatSessionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertVoiceChatMessageSchema = createInsertSchema(voiceChatMessagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertVoiceChatSession = z.infer<typeof insertVoiceChatSessionSchema>;
export type InsertVoiceChatMessage = z.infer<typeof insertVoiceChatMessageSchema>;
export type VoiceChatSession = typeof voiceChatSessionsTable.$inferSelect;
export type VoiceChatMessage = typeof voiceChatMessagesTable.$inferSelect;
