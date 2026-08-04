// ─────────────────────────────────────────────────────────────────────────────
// Автозакрытие заданий по истечении срока сдачи.
//
// Что делает: находит назначения, у которых срок (assigned_tasks.due_at) уже
// прошёл, а ученик так и не сдал работу, и создаёт за него сдачу со статусом
// "expired". После этого задание уходит из списка ученика (запрос my-tasks
// исключает задания, по которым есть сдача) и появляется у учителя в ответах
// с пометкой «не сдано в срок».
//
// Почему создаётся именно сдача, а не отдельный флаг: у учителя уже есть один
// экран со всеми работами, и просроченное должно попадать туда же, а не в
// параллельный список, который нужно проверять отдельно. Учитель видит факт
// «срок вышел, работы нет» там, где смотрит остальные результаты.
//
// Очки не начисляются, ответы не создаются: работа не выполнялась.
// score = 0 честно отражает результат и попадает в средний балл — иначе
// пропущенные задания были бы бесплатными.
//
// Идемпотентность: повторный запуск ничего не дублирует, потому что после
// первой вставки у назначения уже есть сдача и оно перестаёт попадать в
// выборку. Поэтому задачу безопасно гонять по таймеру.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@workspace/db";
import {
  assignedTasksTable, assignmentsTable, submissionsTable, questionsTable,
} from "@workspace/db";
import { and, eq, gt, isNull, isNotNull, lt, inArray } from "drizzle-orm";
import { logger } from "./logger";

/** Статус сдачи, созданной автоматически из-за истёкшего срока. */
export const EXPIRED_STATUS = "expired";

/**
 * Закрывает все просроченные назначения. Возвращает число закрытых.
 *
 * Ошибка внутри не пробрасывается наружу: задача фоновая, падать из-за неё
 * сервер не должен.
 */
export async function autoCloseOverdueAssignments(): Promise<number> {
  try {
    const now = new Date();

    // Назначения с истёкшим сроком и без сдачи, сделанной ПОСЛЕ выдачи.
    // Условие на submittedAt > assignedAt то же, что в GET /assignments/my-tasks:
    // старая сдача до повторной выдачи не считается выполнением текущей.
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

    // Число вопросов по каждому заданию — чтобы в карточке результата стояло
    // честное «0 из 12», а не «0 из 0».
    const assignmentIds = [...new Set(overdue.map((t) => t.assignmentId))];
    const questions = await db
      .select({ id: questionsTable.id, assignmentId: questionsTable.assignmentId })
      .from(questionsTable)
      .where(inArray(questionsTable.assignmentId, assignmentIds));

    const totalByAssignment = new Map<number, number>();
    for (const q of questions) {
      totalByAssignment.set(q.assignmentId, (totalByAssignment.get(q.assignmentId) ?? 0) + 1);
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

/**
 * Запускает автозакрытие сразу и дальше по таймеру.
 *
 * Пять минут — компромисс: срок ставится с точностью до дня (пресеты в
 * utils/dueDate.ts дают 23:59), поэтому чаще проверять незачем, а реже —
 * задание висело бы у ученика уже после дедлайна.
 *
 * unref(), чтобы таймер не держал процесс при остановке сервера.
 */
export function startOverdueWatcher(intervalMs = 5 * 60_000): void {
  void autoCloseOverdueAssignments();
  const timer = setInterval(() => { void autoCloseOverdueAssignments(); }, intervalMs);
  timer.unref?.();
}
