import { Router } from "express";
import { db, assignmentsTable, assignedTasksTable, submissionsTable } from "@workspace/db";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getUser, isTeacher, requireAuth } from "../lib/auth";

const router = Router();

/**
 * Teacher-facing assignment list. Draft state is intentionally omitted from
 * this list response: teachers still open the same assignment preview by
 * clicking its title, but the card no longer displays a "Черновик" badge.
 * The database state and publish-on-assign behavior remain unchanged.
 */
router.get("/assignments/my-assignments", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const caller = getUser(req);
  if (!isTeacher(caller.role) && caller.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const rows = await db.select().from(assignmentsTable)
    .where(and(
      eq(assignmentsTable.createdBy, caller.userId),
      isNull(assignmentsTable.deletedAt),
    ));
  if (rows.length === 0) {
    res.json([]);
    return;
  }

  const ids = rows.map((assignment) => assignment.id);
  const tasks = await db.select({
    assignmentId: assignedTasksTable.assignmentId,
    studentId: assignedTasksTable.studentId,
    assignedAt: assignedTasksTable.assignedAt,
  })
    .from(assignedTasksTable)
    .where(and(
      eq(assignedTasksTable.teacherId, caller.userId),
      inArray(assignedTasksTable.assignmentId, ids),
    ));

  const submissions = tasks.length > 0
    ? await db.select({
        assignmentId: submissionsTable.assignmentId,
        studentId: submissionsTable.studentId,
        status: submissionsTable.status,
        score: submissionsTable.score,
        submittedAt: submissionsTable.submittedAt,
      })
      .from(submissionsTable)
      .where(inArray(submissionsTable.assignmentId, ids))
      .orderBy(desc(submissionsTable.submittedAt))
    : [];

  type Counters = { assigned: number; submitted: number; pending: number; scoreSum: number; scored: number };
  const stats = new Map<number, Counters>();
  const bump = (id: number): Counters => {
    const counters = stats.get(id) ?? { assigned: 0, submitted: 0, pending: 0, scoreSum: 0, scored: 0 };
    stats.set(id, counters);
    return counters;
  };

  for (const task of tasks) {
    const counters = bump(task.assignmentId);
    counters.assigned += 1;
    const submission = submissions.find((row) =>
      row.assignmentId === task.assignmentId &&
      row.studentId === task.studentId &&
      row.submittedAt > task.assignedAt,
    );
    if (!submission) continue;
    counters.submitted += 1;
    if (submission.status === "pending") counters.pending += 1;
    if (submission.status !== "pending") {
      counters.scoreSum += submission.score ?? 0;
      counters.scored += 1;
    }
  }

  res.json(rows.map((assignment) => {
    const { isDraft: _hiddenDraftFlag, ...visibleAssignment } = assignment;
    const counters = stats.get(assignment.id);
    return {
      ...visibleAssignment,
      assignedCount: counters?.assigned ?? 0,
      submittedCount: counters?.submitted ?? 0,
      pendingCount: counters?.pending ?? 0,
      avgScore: counters && counters.scored > 0
        ? Math.round(counters.scoreSum / counters.scored)
        : null,
    };
  }));
});

export default router;
