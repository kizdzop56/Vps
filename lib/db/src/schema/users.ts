import { pgTable, text, serial, integer, timestamp, pgEnum, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roleEnum = pgEnum("role", ["student", "parent", "admin", "teacher"]);

export const knowledgeLevelEnum = pgEnum("knowledge_level", [
  "starter",
  "beginner",
  "elementary",
  "intermediate",
  "upper_intermediate",
]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  surname: text("surname"),
  role: roleEnum("role").notNull().default("student"),
  age: integer("age"),
  dateOfBirth: date("date_of_birth"),
  knowledgeLevel: knowledgeLevelEnum("knowledge_level"),
  parentId: integer("parent_id"),
  totalPoints: integer("total_points").notNull().default(0),
  inviteCode: text("invite_code").unique(),
  bio: text("bio"),
  avatarEmoji: text("avatar_emoji").default("🦁"),
  avatarColor: text("avatar_color").default("#6366f1"),
  avatarUrl: text("avatar_url"),
  totalTimeMinutes: integer("total_time_minutes").notNull().default(0),
  // Gamification
  xpLevel: integer("xp_level").notNull().default(1),
  dailyGoalMinutes: integer("daily_goal_minutes").notNull().default(15),
  loginStreak: integer("login_streak").notNull().default(0),
  lastLoginDate: date("last_login_date"),
  email: text("email").unique(),
  emailVerified: text("email_verified").default("false"),
  mascotName: text("mascot_name").default("Оливер"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
