import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const calendarSlotsTable = pgTable("calendar_slots", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),       // "YYYY-MM-DD"
  startTime: text("start_time").notNull(), // "15:00"
  endTime: text("end_time").notNull(),     // "16:00"
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("slot_unique").on(t.teacherId, t.date, t.startTime)]);

export const slotBookingsTable = pgTable("slot_bookings", {
  id: serial("id").primaryKey(),
  slotId: integer("slot_id").notNull().references(() => calendarSlotsTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // "pending" | "confirmed" | "rejected"
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("booking_unique").on(t.slotId, t.studentId)]);

// Student-initiated custom time requests (no pre-existing slot required)
export const customBookingRequestsTable = pgTable("custom_booking_requests", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  note: text("note"),
  status: text("status").notNull().default("pending"), // "pending" | "confirmed" | "rejected"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
