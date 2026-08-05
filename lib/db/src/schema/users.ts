import { pgTable, text, serial, integer, timestamp, pgEnum, date, jsonb } from "drizzle-orm/pg-core";
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
  // Темы, которые интересны ученику («Игры», «Футбол», «Кино»). Показываются
  // метками в блоке «О себе» и подсказывают учителю, на чём строить занятие.
  // null у старых строк эквивалентен пустому списку.
  interests: jsonb("interests").$type<string[]>(),
  avatarEmoji: text("avatar_emoji").default("🦁"),
  avatarColor: text("avatar_color").default("#6366f1"),
  avatarUrl: text("avatar_url"),
  totalTimeMinutes: integer("total_time_minutes").notNull().default(0),
  // Gamification
  xpLevel: integer("xp_level").notNull().default(1),
  // Цель по времени, которая ДЕЙСТВУЕТ СЕГОДНЯ.
  dailyGoalMinutes: integer("daily_goal_minutes").notNull().default(15),
  // Цель, выбранная учеником «на потом»: вступит в силу со следующего дня.
  // Смена цели задним числом позволяла бы подбирать удобный набор задач дня,
  // поэтому выбор всегда откладывается (см. PATCH /gamification/daily-goal).
  nextDailyGoalMinutes: integer("next_daily_goal_minutes").notNull().default(15),
  // День, в который цель последний раз переносилась из next в активную.
  // По нему сервер понимает, что наступили новые сутки и пора применить выбор.
  dailyGoalAppliedDate: date("daily_goal_applied_date"),
  // День, за который последний раз выдана награда за ПОЛНОСТЬЮ закрытую цель
  // дня (время + все задачи). Очки выдаются один раз в день, поэтому нужна
  // отметка — та же схема, что у lastLoginDate.
  // См. POST /gamification/daily-goal/claim.
  dailyGoalClaimedDate: date("daily_goal_claimed_date"),
  loginStreak: integer("login_streak").notNull().default(0),
  lastLoginDate: date("last_login_date"),
  email: text("email").unique(),
  emailVerified: text("email_verified").default("false"),
  mascotName: text("mascot_name").default("Оливер"),
  lastSeenAt: timestamp("last_seen_at"),
  // Список просмотренных вкладок онбординга (гайд «Снежа»).
  // null у существующих строк эквивалентен пустому массиву.
  onboardingSeen: jsonb("onboarding_seen").$type<string[]>(),
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
