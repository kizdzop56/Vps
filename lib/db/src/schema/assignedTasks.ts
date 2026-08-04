import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { assignmentsTable } from "./assignments";

export const assignedTasksTable = pgTable("assigned_tasks", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => assignmentsTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  /**
   * Срок сдачи. Живёт на назначении, а не на самом задании: одно и то же
   * задание учитель выдаёт разным ученикам в разное время и с разным сроком.
   *
   * Nullable намеренно: срок необязателен, «без срока» — валидное и частое
   * состояние. Существующие назначения после миграции получают null и
   * продолжают работать как раньше.
   */
  dueAt: timestamp("due_at"),
});

export type AssignedTask = typeof assignedTasksTable.$inferSelect;
