import { pgTable, serial, integer, timestamp, pgEnum, text, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const friendshipStatusEnum = pgEnum("friendship_status", ["pending", "accepted"]);

// Teacher ↔ Student links (now with pending/accepted status)
export const teacherStudentsTable = pgTable("teacher_students", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("accepted"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("teacher_student_unique").on(t.teacherId, t.studentId)]);

// Student ↔ Student friendships
export const friendshipsTable = pgTable("friendships", {
  id: serial("id").primaryKey(),
  requesterId: integer("requester_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  addresseeId: integer("addressee_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  status: friendshipStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("friendship_unique").on(t.requesterId, t.addresseeId)]);

// Parent ↔ Child links (via invite code — separate from parentId column)
export const parentChildrenTable = pgTable("parent_children", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("parent_child_unique").on(t.parentId, t.studentId)]);
