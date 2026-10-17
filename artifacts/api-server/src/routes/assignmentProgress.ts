import { Router } from "express";
import { and, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { assignedTasksTable } from "@workspace/db";
import { getUser, requireAuth } from "../lib/auth";

const router = Router();

// Add startedCount to the teacher's existing assignments response without
// duplicating its task/submission aggregation logic.
router.get("/assignments/my-assignments", requireAuth, (req, res, next) => {
  const caller = getUser(req);
  const response = res as any;
  const sendJson = res.json.bind(res);

  response.json = (body: unknown) => {
    if (!Array.isArray(body) || !["teacher", "admin"].includes(caller.role)) {
      return sendJson(body);
    }

    const rows = body as Array<{ id: number }>;
    const ids = rows.map((row) => row.id).filter(Number.isInteger);
    if (ids.length === 0) return sendJson(rows.map((row) => ({ ...row, startedCount: 0 })));

    void db.select({
      assignmentId: assignedTasksTable.assignmentId,
      count: sql<number>`count(*)::int`,
    })
      .from(assignedTasksTable)
      .where(and(
        eq(assignedTasksTable.teacherId, caller.userId),
        inArray(assignedTasksTable.assignmentId, ids),
        isNotNull(assignedTasksTable.startedAt),
      ))
      .groupBy(assignedTasksTable.assignmentId)
      .then((counts) => {
        const byAssignment = new Map(counts.map((row) => [row.assignmentId, Number(row.count)]));
        sendJson(rows.map((row) => ({ ...row, startedCount: byAssignment.get(row.id) ?? 0 })));
      })
      .catch(() => sendJson(rows.map((row) => ({ ...row, startedCount: 0 })));
    return response;
  };

  next();
});

// Opening an assigned task is the start event. Only set the timestamp once, so
// later previews/reopens don't change when the student originally began.
router.get("/assignments/:id", requireAuth, async (req, _res, next) => {
  const caller = getUser(req);
  const assignmentId = Number(req.params["id"]);
  if (caller.role === "student" && Number.isInteger(assignmentId) && assignmentId > 0) {
    await db.update(assignedTasksTable)
      .set({ startedAt: new Date() })
      .where(and(
        eq(assignedTasksTable.assignmentId, assignmentId),
        eq(assignedTasksTable.studentId, caller.userId),
        isNull(assignedTasksTable.startedAt),
      ));
  }
  next();
});

export default router;
