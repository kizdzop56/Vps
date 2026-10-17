// ─────────────────────────────────────────────────────────────────────────────
// Автозакрытие заданий по истечении срока сдачи.
//
// Находит назначения с истёкшим сроком, по которым ученик не отправил работу,
// и создаёт сдачу со статусом "expired". Она исчезает из активного списка
// ученика и появляется у учителя в ответах как «не сдано в срок».
//
// Повторные запуски безопасны: после вставки просроченной сдачи назначение
// больше не попадает в выборку. Запросы списка ученика и результатов учителя
// также запускают эту проверку, поэтому после пробуждения сервера пропуски
// сроков закрываются при первом обращении.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@workspace/db";
import {
  assignedTasksTable, assignmentsTable, submissionsTable, questionsTable,
} from "@workspace/db";
import { and, eq, gt, isNull, isNotNull, lt, inArray } from "drizzle-orm";
import { logger } from "./logger";

/** Статус сдачи, созданной автоматически из-за истёкшего срока. */
export const EXPIRED_STATUS = "expired";

/** Закрывает просроченные назначения. Возвращает число закрытых. */
export async function autoCloseOverdueAssignments(): Promise<number> {
  try {
    const now = new Date();
    const overdue = await db.select({
      assignedTaskId: assignedTasksTable.id,
      assignmentId: assignedTasksTable.assignmentId,
      studentId: assignedTasksTable.studentId,
    })
      .from(assignedTasksTable)
      .leftJoin(assignmentsTable, eq(assignedTasksTable.assignmentId, assignmentsTable.id))
      .leftJoin(
        submissionsTable,
        and(
          eq(submissionsTable.studentId, assignedTasksTable.studentId),
          eq(submissionsTable.assignmentId, assignedTasksTable.assignmentId),
          gt(submissionsTable.submittedAt, assignedTasksTable.assignedAt),
        ),
      )
      .where(and(
        isNotNull(assignedTasksTable.dueAt),
        lt(assignedTasksTable.dueAt, now),
        isNull(submissionsTable.id),
        isNull(assignmentsTable.deletedAt),
        eq(assignmentsTable.isDraft, false),
      ));

    if (overdue.length === 0) return 0;

    const assignmentIds = [...new Set(overdue.map((task) => task.assignmentId))];
    const questions = await db.select({
      id: questionsTable.id,
      assignmentId: questionsTable.assignmentId,
    })
      .from(questionsTable)
      .where(inArray(questionsTable.assignmentId, assignmentIds));

    const totalByAssignment = new Map<number, number>();
    for (const question of questions) {
      totalByAssignment.set(
        question.assignmentId,
        (totalByAssignment.get(question.assignmentId) ?? 0) + 1,
      );
    }

    await db.insert(submissionsTable).values(
      overdue.map((task) => ({
        studentId: task.studentId,
        assignmentId: task.assignmentId,
        score: 0,
        correctCount: 0,
        totalQuestions: totalByAssignment.get(task.assignmentId) ?? 0,
        pointsEarned: 0,
        status: EXPIRED_STATUS,
        teacherFeedback: null,
      })),
    );

    logger.info({ count: overdue.length }, "Auto-closed overdue assignments");
    return overdue.length;
  } catch (err) {
    logger.error({ err }, "Failed to auto-close overdue assignments");
    return 0;
  }
}

/** Starts an immediate check and then checks once per minute. */
export function startOverdueWatcher(intervalMs = 60_000): void {
  void autoCloseOverdueAssignments();
  const timer = setInterval(() => { void autoCloseOverdueAssignments(); }, intervalMs);
  timer.unref?.();
}
