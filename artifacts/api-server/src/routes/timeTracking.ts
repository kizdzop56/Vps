import { Router } from "express";
import { db } from "@workspace/db";
import { timeSessionsTable, usersTable } from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";
import {
  liveSessionMinutes,
  orphanSessionMinutes,
  orphanSessionEnd,
  sessionMinutes,
  startOfLocalDay,
  startOfLocalWeek,
} from "../lib/timeStats";

const router = Router();

router.post("/time-tracking/start", requireAuth, async (req, res) => {
  const user = getUser(req);

  const openSessions = await db.select().from(timeSessionsTable)
    .where(and(eq(timeSessionsTable.studentId, user.userId), isNull(timeSessionsTable.endedAt)));

  // Незакрытые сессии закрываем по ПОСЛЕДНЕМУ heartbeat (durationMinutes
  // обновляет /api/users/ping раз в минуту), а не по текущему моменту.
  // Иначе закрытая вкладка засчитывалась как занятие: ушёл в 8:05, вернулся
  // в 9:32 — и в "Сегодня" прилетало полтора часа, которых не было.
  // endedAt тоже ставим задним числом, чтобы отчёты по таймстампам сходились.
  let accumulatedMinutes = 0;
  for (const session of openSessions) {
    const durationMinutes = orphanSessionMinutes(session);
    accumulatedMinutes += durationMinutes;
    await db.update(timeSessionsTable)
      .set({ endedAt: orphanSessionEnd(session), durationMinutes })
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

  // /end приходит с живого клиента, поэтому реальное время почти всегда верное.
  // Ограничение по heartbeat здесь — страховка на случай запоздавшего keepalive-запроса.
  const durationMinutes = Math.round(liveSessionMinutes(openSession));

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
  // Границы суток и недели — по часовому поясу приложения (APP_TIMEZONE),
  // а не по времени процесса: на хостинге сервер живёт в UTC, из-за чего
  // "сегодня" начиналось в 3 часа ночи по Минску.
  const todayStart = startOfLocalDay();
  const weekStart = startOfLocalWeek();

  const [user] = await db.select({ totalTimeMinutes: usersTable.totalTimeMinutes })
    .from(usersTable).where(eq(usersTable.id, studentId));

  const sessions = await db.select().from(timeSessionsTable)
    .where(eq(timeSessionsTable.studentId, studentId));

  // totalTimeMinutes already includes all closed-session minutes (persisted by endSession).
  // Only add elapsed time from the current open session to avoid double-counting.
  const openSession = sessions.find(s => s.endedAt === null);
  const openMinutes = openSession ? Math.floor(liveSessionMinutes(openSession)) : 0;
  const totalMinutes = (user?.totalTimeMinutes ?? 0) + openMinutes;

  // Today/week: compute from timestamps (endedAt - startedAt) instead of the
  // integer durationMinutes column — otherwise short sessions round away and
  // the "today" counter appears to reset between visits.
  const sumSince = (from: Date) => sessions
    .filter(s => s.startedAt >= from)
    .reduce((sum, s) => sum + sessionMinutes(s), 0);
  const todayMinutes = Math.round(sumSince(todayStart) * 100) / 100;
  const weekMinutes = Math.round(sumSince(weekStart) * 100) / 100;

  res.json({ totalMinutes, todayMinutes, weekMinutes, sessions });
});

export default router;
