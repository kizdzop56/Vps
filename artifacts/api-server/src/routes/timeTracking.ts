import { Router } from "express";
import { db } from "@workspace/db";
import { timeSessionsTable, usersTable } from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";

const router = Router();

router.post("/time-tracking/start", requireAuth, async (req, res) => {
  const user = getUser(req);

  const openSessions = await db.select().from(timeSessionsTable)
    .where(and(eq(timeSessionsTable.studentId, user.userId), isNull(timeSessionsTable.endedAt)));

  // Max minutes we credit for a single abandoned session.
  // Prevents inflated leaderboard times when a session was never properly
  // closed (e.g. browser crash, network failure on beforeunload).
  const MAX_ORPHAN_MINUTES = 240;

  let accumulatedMinutes = 0;
  for (const session of openSessions) {
    const rawMinutes = Math.round((Date.now() - session.startedAt.getTime()) / 60000);
    const durationMinutes = Math.min(rawMinutes, MAX_ORPHAN_MINUTES);
    accumulatedMinutes += durationMinutes;
    await db.update(timeSessionsTable)
      .set({ endedAt: new Date(), durationMinutes })
      .where(eq(timeSessionsTable.id, session.id));
  }

  // Persist closed session time atomically (no race condition)
  if (accumulatedMinutes > 0) {
    await db.update(usersTable)
      .set({ totalTimeMinutes: sql`${usersTable.totalTimeMinutes} + ${accumulatedMinutes}` })
      .where(eq(usersTable.id, user.userId));
  }

  const [session] = await db.insert(timeSessionsTable).values({ studentId: user.userId }).returning();
  res.json(session);
});

router.post("/time-tracking/end", requireAuth, async (req, res) => {
  const user = getUser(req);

  const [openSession] = await db.select().from(timeSessionsTable)
    .where(and(eq(timeSessionsTable.studentId, user.userId), isNull(timeSessionsTable.endedAt)));

  if (!openSession) {
    res.json({ message: "No open session" });
    return;
  }

  const durationMinutes = Math.round((Date.now() - openSession.startedAt.getTime()) / 60000);

  await db.update(timeSessionsTable)
    .set({ endedAt: new Date(), durationMinutes })
    .where(eq(timeSessionsTable.id, openSession.id));

  // Persist accumulated session minutes atomically (no race condition)
  if (durationMinutes > 0) {
    await db.update(usersTable)
      .set({ totalTimeMinutes: sql`${usersTable.totalTimeMinutes} + ${durationMinutes}` })
      .where(eq(usersTable.id, user.userId));
  }

  res.json({ ok: true, durationMinutes });
});

router.get("/students/:id/time", requireAuth, async (req, res) => {
  const studentId = Number(req.params["id"]);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());

  const [user] = await db.select({ totalTimeMinutes: usersTable.totalTimeMinutes })
    .from(usersTable).where(eq(usersTable.id, studentId));

  const sessions = await db.select().from(timeSessionsTable)
    .where(eq(timeSessionsTable.studentId, studentId));

  // totalTimeMinutes already includes all closed-session minutes (persisted by endSession).
  // Only add elapsed time from the current open session to avoid double-counting.
  const openSession = sessions.find(s => s.endedAt === null);
  const openMinutes = openSession
    ? Math.floor((Date.now() - openSession.startedAt.getTime()) / 60000)
    : 0;
  const totalMinutes = (user?.totalTimeMinutes ?? 0) + openMinutes;

  // Today/week: compute from timestamps (endedAt - startedAt) instead of the
  // integer durationMinutes column — otherwise short sessions round away and
  // the "today" counter appears to reset between visits.
  const spanMinutes = (s: { startedAt: Date; endedAt: Date | null }) =>
    Math.max(0, ((s.endedAt ? s.endedAt.getTime() : Date.now()) - s.startedAt.getTime()) / 60000);
  const sumSince = (from: Date) => sessions
    .filter(s => s.startedAt >= from)
    .reduce((sum, s) => sum + spanMinutes(s), 0);
  const todayMinutes = Math.round(sumSince(todayStart) * 100) / 100;
  const weekMinutes = Math.round(sumSince(weekStart) * 100) / 100;

  res.json({ totalMinutes, todayMinutes, weekMinutes, sessions });
});

export default router;
