import { pgTable, serial, integer, text, timestamp, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Kind of media a chat message can carry in addition to (or instead of) text.
export const messageAttachmentEnum = pgEnum("message_attachment_type", ["image", "audio"]);

// One row per unique pair of users. userAId is always the SMALLER user id so a
// pair is stored canonically and the unique constraint prevents duplicate
// conversations regardless of who opened the chat first.
export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userAId: integer("user_a_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  userBId: integer("user_b_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // Denormalised timestamp of the last message so the conversation list can be
  // ordered without joining/aggregating the messages table.
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("conversation_pair_unique").on(t.userAId, t.userBId)]);

// A single chat message. A message has text, an attachment, or both. Voice
// messages and photos are uploaded via the existing /api/upload/* routes and
// referenced here by their relative url + attachmentType.
export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  senderId: integer("sender_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  text: text("text"),
  attachmentUrl: text("attachment_url"),
  attachmentType: messageAttachmentEnum("attachment_type"),
  // Null until the recipient has opened the conversation — used for unread badges.
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Conversation = typeof conversationsTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;
