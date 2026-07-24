import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, submissionsTable, timeSessionsTable, assignmentsTable, friendshipsTable, voiceChatSessionsTable, voiceChatMessagesTable } from "@workspace/db";
import { eq, and, or, sql, desc, isNull, inArray } from "drizzle-orm";
import { requireAuth, getUser, isTeacher } from "../lib/auth";

async function areFriends(userIdA: number, userIdB: number): Promise<boolean> {
  const [friendship] = await db.select().from(friendshipsTable).where(
    and(
      or(
        and(eq(friendshipsTable.requesterId, userIdA), eq(friendshipsTable.addresseeId, userIdB)),
        and(eq(friendshipsTable.requesterId, userIdB), eq(friendshipsTable.addresseeId, userIdA)),
      ),
      eq(friendshipsTable.status, "accepted"),
    )
  );
  return !!friendship;
}

const router = Router();

router.get("/users", requireAuth, async (req, res) => {
  const { role, parentId } = req.query;

  let conditions: any[] = [];
  if (role) conditions.push(eq(usersTable.role, role as any));
  if (parentId) conditions.push(eq(usersTable.parentId, Number(parentId)));

  const users = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    name: usersTable.name,
    surname: usersTable.surname,
    role: usersTable.role,
    age: usersTable.age,
    knowledgeLevel: usersTable.knowledgeLevel,
    avatarEmoji: usersTable.avatarEmoji,
    avatarColor: usersTable.avatarColor,
    avatarUrl: usersTable.avatarUrl,
    totalPoints: usersTable.totalPoints,
    totalTimeMinutes: usersTable.totalTimeMinutes,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json(users);
});

router.get("/users/:id", requireAuth, async (req, res) => {
  const id = Number(req.params["id"]);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  let totalTimeMinutes = user.totalTimeMinutes ?? 0;
  let completedAssignments = 0;
  let averageScore: number | null = null;

  if (user.role === "student") {
    // Add only the CURRENT open session (closed sessions are already in user.totalTimeMinutes)
    const [openSession] = await db.select()
      .from(timeSessionsTable)
      .where(and(eq(timeSessionsTable.studentId, id), isNull(timeSessionsTable.endedAt)));
    const openMinutes = openSession
      ? Math.floor((Date.now() - openSession.startedAt.getTime()) / 60000)
      : 0;
    totalTimeMinutes = (user.totalTimeMinutes ?? 0) + openMinutes;

    const submissions = await db.select({ score: submissionsTable.score })
      .from(submissionsTable).where(eq(submissionsTable.studentId, id));
    completedAssignments = submissions.length;
    if (submissions.length > 0) {
      averageScore = Math.round(submissions.reduce((sum, s) => sum + s.score, 0) / submissions.length);
    }
  }

  const ONLINE_MS = 90 * 1000; // 90s — ping is every 60s, 30s buffer
  const isOnline = user.lastSeenAt
    ? Date.now() - new Date(user.lastSeenAt).getTime() < ONLINE_MS
    : false;

  res.json({
    id: user.id,
    username: user.username,
    name: user.name,
    surname: user.surname,
    role: user.role,
    age: user.age,
    dateOfBirth: user.dateOfBirth,
    knowledgeLevel: user.knowledgeLevel,
    avatarEmoji: user.avatarEmoji,
    avatarColor: user.avatarColor,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    totalPoints: user.totalPoints,
    totalTimeMinutes,
    completedAssignments,
    averageScore,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
    isOnline,
  });
});

// Heartbeat — updates lastSeenAt, used for online status
router.post("/users/ping", requireAuth, async (req, res) => {
  const user = getUser(req);
  await db.update(usersTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(usersTable.id, user.userId));
  res.json({ ok: true });
});

// Mark user as offline on logout (clears lastSeenAt)
router.post("/users/offline", requireAuth, async (req, res) => {
  const user = getUser(req);
  await db.update(usersTable)
    .set({ lastSeenAt: null })
    .where(eq(usersTable.id, user.userId));
  res.json({ ok: true });
});

// Update profile (bio, avatar)
router.patch("/users/:id/profile", requireAuth, async (req, res) => {
  const caller = getUser(req);
  const id = Number(req.params["id"]);

  // Can only update own profile (or admin/teacher can update anyone)
  if (caller.userId !== id && !isTeacher(caller.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { bio, avatarEmoji, avatarColor, avatarUrl, name, username } = req.body;

  // Guard against oversized avatar payloads (e.g. an uncompressed data URI).
  // A large avatarUrl bloats every list response that includes this user
  // (students, leaderboard, friends, etc.) and can break avatar loading
  // entirely in production.
  if (typeof avatarUrl === "string" && avatarUrl.length > 500_000) {
    res.status(413).json({ error: "Изображение слишком большое" });
    return;
  }

  const updateData: Record<string, any> = { updatedAt: new Date() };
  if (bio !== undefined) updateData.bio = bio;
  if (avatarEmoji !== undefined) updateData.avatarEmoji = avatarEmoji;
  if (avatarColor !== undefined) updateData.avatarColor = avatarColor;
  if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
  if (name !== undefined && name.trim()) updateData.name = name.trim();

  if (username !== undefined) {
    const trimmed = String(username).trim();
    if (!trimmed) {
      res.status(400).json({ error: "Никнейм не может быть пустым" });
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(trimmed)) {
      res.status(400).json({ error: "Никнейм: 3-20 символов, только латиница, цифры и _" });
      return;
    }
    const [taken] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.username, trimmed));
    if (taken && taken.id !== id) {
      res.status(409).json({ error: "Этот никнейм уже занят" });
      return;
    }
    updateData.username = trimmed;
  }

  const [updated] = await db.update(usersTable)
    .set(updateData)
    .where(eq(usersTable.id, id))
    .returning();

  res.json({
    id: updated.id,
    username: updated.username,
    name: updated.name,
    bio: updated.bio,
    avatarEmoji: updated.avatarEmoji,
    avatarColor: updated.avatarColor,
    avatarUrl: updated.avatarUrl,
    role: updated.role,
  });
});

// Get parent's children
router.get("/users/:id/children", requireAuth, async (req, res) => {
  const id = Number(req.params["id"]);
  const children = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    name: usersTable.name,
    role: usersTable.role,
    age: usersTable.age,
    knowledgeLevel: usersTable.knowledgeLevel,
    avatarEmoji: usersTable.avatarEmoji,
    avatarColor: usersTable.avatarColor,
    totalPoints: usersTable.totalPoints,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.parentId, id));
  res.json(children);
});

// ── Teacher: view student's submission history ────────────────────────
router.get("/students/:id/submissions", requireAuth, async (req, res) => {
  const caller = getUser(req);
  const studentId = Number(req.params["id"]);

  if (!isTeacher(caller.role) && caller.role !== "admin" && caller.userId !== studentId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const rows = await db.select({
    submissionId: submissionsTable.id,
    score: submissionsTable.score,
    correctCount: submissionsTable.correctCount,
    totalQuestions: submissionsTable.totalQuestions,
    pointsEarned: submissionsTable.pointsEarned,
    submittedAt: submissionsTable.submittedAt,
    assignmentId: assignmentsTable.id,
    title: assignmentsTable.title,
    type: assignmentsTable.type,
    points: assignmentsTable.points,
  })
    .from(submissionsTable)
    .leftJoin(assignmentsTable, eq(submissionsTable.assignmentId, assignmentsTable.id))
    .where(and(
      eq(submissionsTable.studentId, studentId),
      eq(submissionsTable.status, "graded"),
    ))
    .orderBy(desc(submissionsTable.submittedAt));

  res.json(rows);
});

// ── Teacher: per-category score stats for a student ───────────────────
router.get("/students/:id/category-stats", requireAuth, async (req, res) => {
  const caller = getUser(req);
  const studentId = Number(req.params["id"]);

  // Any authenticated user may view another user's category stats
  // (the data is shown on public profile pages and contains no sensitive info)

  const rows = await db.select({
    score: submissionsTable.score,
    type: assignmentsTable.type,
  })
    .from(submissionsTable)
    .leftJoin(assignmentsTable, eq(submissionsTable.assignmentId, assignmentsTable.id))
    .where(
      and(
        eq(submissionsTable.studentId, studentId),
        eq(submissionsTable.status, "graded")
      )
    );

  const CATEGORIES = ["text_test", "audio", "reading", "video"] as const;
  const stats = CATEGORIES.map((cat) => {
    const catRows = rows.filter((r) => r.type === cat);
    const avgScore = catRows.length > 0
      ? Math.round(catRows.reduce((s, r) => s + (r.score ?? 0), 0) / catRows.length)
      : null;
    return { type: cat, avgScore, count: catRows.length };
  });

  res.json(stats);
});

router.delete("/users/:id", requireAuth, async (req, res) => {
  const caller = getUser(req);
  if (!isTeacher(caller.role)) {
    res.status(403).json({ error: "Только учитель может удалять пользователей" });
    return;
  }

  const targetId = Number(req.params["id"]);
  if (isNaN(targetId)) {
    res.status(400).json({ error: "Неверный ID" });
    return;
  }

  if (caller.userId === targetId) {
    res.status(400).json({ error: "Нельзя удалить свой собственный аккаунт" });
    return;
  }

  const [target] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, targetId));
  if (!target) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }
  if (isTeacher(target.role)) {
    res.status(403).json({ error: "Нельзя удалить другого учителя" });
    return;
  }

  // Delete records without cascade first
  const sessions = await db.select({ id: voiceChatSessionsTable.id })
    .from(voiceChatSessionsTable).where(eq(voiceChatSessionsTable.studentId, targetId));
  if (sessions.length > 0) {
    const sessionIds = sessions.map((s) => s.id);
    await db.delete(voiceChatMessagesTable).where(inArray(voiceChatMessagesTable.sessionId, sessionIds));
  }
  await db.delete(voiceChatSessionsTable).where(eq(voiceChatSessionsTable.studentId, targetId));
  await db.delete(submissionsTable).where(eq(submissionsTable.studentId, targetId));
  await db.delete(timeSessionsTable).where(eq(timeSessionsTable.studentId, targetId));

  await db.delete(usersTable).where(eq(usersTable.id, targetId));

  res.json({ ok: true, deletedId: targetId });
});

export default router;
