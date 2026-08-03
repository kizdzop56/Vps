import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, submissionsTable, timeSessionsTable, assignmentsTable, friendshipsTable, voiceChatSessionsTable, voiceChatMessagesTable, parentChildrenTable, calendarSlotsTable, slotBookingsTable, assignedTasksTable, teacherStudentsTable } from "@workspace/db";
import { eq, and, or, sql, desc, isNull, inArray } from "drizzle-orm";
import { requireAuth, getUser, isTeacher } from "../lib/auth";
import { liveSessionMinutes, isSessionStale, wallMinutes } from "../lib/timeStats";

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

// Родитель связан с учеником через parentChildrenTable (или через parentId в usersTable).
async function isLinkedParent(parentId: number, studentId: number): Promise<boolean> {
  const [link] = await db.select().from(parentChildrenTable).where(
    and(eq(parentChildrenTable.parentId, parentId), eq(parentChildrenTable.studentId, studentId))
  );
  if (link) return true;
  const [child] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, studentId), eq(usersTable.parentId, parentId)));
  return !!child;
}

// ── Слоты календаря: время хранится строками "HH:MM", дата — "YYYY-MM-DD" ──
const SLOT_TIME_RE = /^\d{1,2}:\d{2}$/;

/** Краткая карточка слота — ровно то, что рисует клиент (formatSlot). */
type SlotBrief = { id: number; date: string; startTime: string; endTime: string };

/** Длительность слота в минутах; кривое время даёт 0, а не NaN. */
function slotMinutes(startTime: string, endTime: string): number {
  if (!SLOT_TIME_RE.test(startTime) || !SLOT_TIME_RE.test(endTime)) return 0;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : 0;
}

/**
 * Слот считается проведённым, когда его конец уже в прошлом.
 * Сервер считает в UTC — та же логика, что у isInPast() в routes/calendar.ts,
 * чтобы «проведено» на профиле и в календаре не расходились.
 */
function isSlotFinished(date: string, endTime: string): boolean {
  if (!SLOT_TIME_RE.test(endTime)) return false;
  const [h, m] = endTime.split(":").map(Number);
  const dt = new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  return dt.getTime() < Date.now();
}

/** Раньше ли слот a, чем слот b (дата, затем время начала). */
function slotIsEarlier(a: SlotBrief, b: SlotBrief): boolean {
  return a.date < b.date || (a.date === b.date && a.startTime < b.startTime);
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

// ── Онбординг-гайд «Снежа»: хранение просмотренных вкладок на сервере ───────
// Записывать клиентски (authStorage / localStorage) недостаточно: на web
// localStorage сбрасывается при очистке данных браузера или на другом устройстве.

// GET /api/users/onboarding-seen → { seen: string[] }
// ВАЖНО: этот маршрут должен стоять ДО GET /users/:id,
// иначе "onboarding-seen" матчится как :id.
router.get("/users/onboarding-seen", requireAuth, async (req, res) => {
  const { userId } = getUser(req);
  const [row] = await db
    .select({ onboardingSeen: usersTable.onboardingSeen })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  res.json({ seen: row?.onboardingSeen ?? [] });
});

// POST /api/users/onboarding-seen  body: { tab: string }
// Идемпотентно добавляет таб в jsonb-массив; дубликаты не записываются.
router.post("/users/onboarding-seen", requireAuth, async (req, res) => {
  const { userId } = getUser(req);
  const { tab } = req.body as { tab?: string };
  if (!tab || typeof tab !== "string") {
    res.status(400).json({ error: "tab required" });
    return;
  }
  const [row] = await db
    .select({ onboardingSeen: usersTable.onboardingSeen })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const current = row?.onboardingSeen ?? [];
  if (!current.includes(tab)) {
    await db
      .update(usersTable)
      .set({ onboardingSeen: [...current, tab] })
      .where(eq(usersTable.id, userId));
  }
  res.json({ ok: true });
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
    // Add only the CURRENT open session (closed sessions are already in user.totalTimeMinutes).
    // Открытая сессия ограничена последним heartbeat — брошенная вкладка не должна
    // накручивать часы в профиле.
    const [openSession] = await db.select()
      .from(timeSessionsTable)
      .where(and(eq(timeSessionsTable.studentId, id), isNull(timeSessionsTable.endedAt)));
    const openMinutes = openSession ? Math.floor(liveSessionMinutes(openSession)) : 0;
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

// ── GET /api/teachers/:id/profile-stats ────────────────────────────────
// Цифры для чужого профиля УЧИТЕЛЯ. GET /users/:id считает
// completedAssignments/totalPoints только для role="student", поэтому на
// профиле учителя ученические карточки (очки, решённые задания, время)
// всегда показывали нули: учитель не решает задания и очков не получает.
//
// Форма ответа зафиксирована типом TeacherProfileStats в
// app/(main)/friend/[id].tsx — менять её можно только вместе с клиентом:
//   personal — персонально для того, кто смотрит (слоты и часы С НИМ, его
//              прогресс по заданиям именно этого учителя);
//   overall  — общее по учителю, одинаковое для всех учеников.
// Разведены намеренно: ученик не должен принять общую цифру за свою.
router.get("/teachers/:id/profile-stats", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const caller = getUser(req);
  const teacherId = Number(req.params["id"]);
  if (!Number.isFinite(teacherId)) {
    res.status(400).json({ error: "Неверный ID" });
    return;
  }

  const [teacher] = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, teacherId));
  if (!teacher) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }
  if (!isTeacher(teacher.role)) {
    res.status(400).json({ error: "Это не профиль учителя" });
    return;
  }

  // ── Занятия: слоты учителя + брони ──
  // Подтверждённая кастомная заявка сама создаёт слот и confirmed-бронь
  // (см. PATCH /calendar/custom-requests/:id), поэтому slot_bookings —
  // единственный источник правды по занятиям.
  const slots = await db.select().from(calendarSlotsTable)
    .where(eq(calendarSlotsTable.teacherId, teacherId));
  const slotIds = slots.map((s) => s.id);
  const bookings = slotIds.length > 0
    ? await db.select({
        slotId: slotBookingsTable.slotId,
        studentId: slotBookingsTable.studentId,
        status: slotBookingsTable.status,
      })
      .from(slotBookingsTable)
      .where(inArray(slotBookingsTable.slotId, slotIds))
    : [];

  const slotById = new Map(slots.map((s) => [s.id, s]));
  const bookedSlotIds = new Set<number>();      // занято подтверждённой бронью
  const myPendingSlotIds = new Set<number>();   // моя заявка ещё висит

  let lessonsTotal = 0;      // проведённые занятия учителя со всеми
  let minutesTotal = 0;
  let lessonsWithMe = 0;     // и то же самое лично со смотрящим
  let minutesWithMe = 0;
  let lastLessonWithMe: SlotBrief | null = null;
  let nextLessonWithMe: SlotBrief | null = null;

  for (const booking of bookings) {
    const slot = slotById.get(booking.slotId);
    if (!slot) continue;

    const mine = booking.studentId === caller.userId;
    if (booking.status === "pending") {
      if (mine) myPendingSlotIds.add(slot.id);
      continue;
    }
    if (booking.status !== "confirmed") continue;

    bookedSlotIds.add(slot.id);
    const finished = isSlotFinished(slot.date, slot.endTime);
    const minutes = slotMinutes(slot.startTime, slot.endTime);
    if (finished) {
      lessonsTotal += 1;
      minutesTotal += minutes;
    }
    if (!mine) continue;

    const brief: SlotBrief = {
      id: slot.id, date: slot.date, startTime: slot.startTime, endTime: slot.endTime,
    };
    if (finished) {
      lessonsWithMe += 1;
      minutesWithMe += minutes;
      // Последнее занятие — самое позднее из уже прошедших.
      if (!lastLessonWithMe || slotIsEarlier(lastLessonWithMe, brief)) lastLessonWithMe = brief;
    } else if (!nextLessonWithMe || slotIsEarlier(brief, nextLessonWithMe)) {
      // Ближайшее — самое раннее из ещё не прошедших.
      nextLessonWithMe = brief;
    }
  }

  // Свободные слоты — чтобы на профиле было куда нажать.
  const todayUTC = new Date().toISOString().slice(0, 10);
  const freeAll = slots
    .filter((s) => s.date >= todayUTC && !bookedSlotIds.has(s.id) && !isSlotFinished(s.date, s.endTime))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const freeSlots = freeAll.slice(0, 5).map((s) => ({
    id: s.id,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    myStatus: myPendingSlotIds.has(s.id) ? "pending" : "free",
  }));

  // ── Задания, созданные учителем (общая цифра) ──
  // Черновики и удалённые не в счёт: ученик их не видит, в общей цифре им не место.
  const created = await db
    .select({ id: assignmentsTable.id })
    .from(assignmentsTable)
    .where(and(
      eq(assignmentsTable.createdBy, teacherId),
      eq(assignmentsTable.isDraft, false),
      isNull(assignmentsTable.deletedAt),
    ));

  // ── Ученики учителя ──
  const links = await db
    .select({ studentId: teacherStudentsTable.studentId })
    .from(teacherStudentsTable)
    .where(and(
      eq(teacherStudentsTable.teacherId, teacherId),
      eq(teacherStudentsTable.status, "accepted"),
    ));

  // ── Прогресс смотрящего по заданиям ИМЕННО ЭТОГО учителя ──
  // Одно задание может быть назначено дважды — считаем по самому свежему
  // назначению, иначе «сдано N из M» врёт на повторных выдачах.
  const assignedRows = await db
    .select({
      assignmentId: assignedTasksTable.assignmentId,
      assignedAt: assignedTasksTable.assignedAt,
      title: assignmentsTable.title,
      type: assignmentsTable.type,
      points: assignmentsTable.points,
      deletedAt: assignmentsTable.deletedAt,
    })
    .from(assignedTasksTable)
    .leftJoin(assignmentsTable, eq(assignedTasksTable.assignmentId, assignmentsTable.id))
    .where(and(
      eq(assignedTasksTable.teacherId, teacherId),
      eq(assignedTasksTable.studentId, caller.userId),
    ))
    .orderBy(desc(assignedTasksTable.assignedAt));

  const assignedUnique: {
    id: number;
    title: string | null;
    type: string | null;
    points: number | null;
    assignedAt: Date;
  }[] = [];
  const seenAssignments = new Set<number>();
  for (const row of assignedRows) {
    if (row.deletedAt) continue;                       // удалённое задание не показываем
    if (seenAssignments.has(row.assignmentId)) continue;
    seenAssignments.add(row.assignmentId);
    assignedUnique.push({
      id: row.assignmentId,
      title: row.title ?? null,
      type: row.type ?? null,
      points: row.points ?? null,
      assignedAt: row.assignedAt,
    });
  }

  const assignedIds = assignedUnique.map((a) => a.id);
  // Лучший процент по каждому заданию (пересдача не должна ухудшать картину)
  // и суммарные очки по всем сдачам этих заданий.
  const bestScore = new Map<number, number>();
  let pointsFromTeacher = 0;

  if (assignedIds.length > 0) {
    const subs = await db
      .select({
        assignmentId: submissionsTable.assignmentId,
        score: submissionsTable.score,
        pointsEarned: submissionsTable.pointsEarned,
      })
      .from(submissionsTable)
      .where(and(
        eq(submissionsTable.studentId, caller.userId),
        inArray(submissionsTable.assignmentId, assignedIds),
        eq(submissionsTable.status, "graded"),
      ));
    for (const s of subs) {
      const score = s.score ?? 0;
      const prev = bestScore.get(s.assignmentId);
      if (prev === undefined || score > prev) bestScore.set(s.assignmentId, score);
      pointsFromTeacher += s.pointsEarned ?? 0;
    }
  }

  const completedByMe = bestScore.size;
  const avgScore = completedByMe > 0
    ? Math.round([...bestScore.values()].reduce((sum, v) => sum + v, 0) / completedByMe)
    : null;

  // Разбивка по типам заданий этого учителя: total — назначено, count — сдано.
  // Кольца рисуются только по count > 0, поэтому несданные категории не
  // изображают ложный прогресс.
  const byType = new Map<string, { total: number; count: number; sum: number }>();
  for (const a of assignedUnique) {
    const type = a.type ?? "free_form";
    const acc = byType.get(type) ?? { total: 0, count: 0, sum: 0 };
    acc.total += 1;
    const score = bestScore.get(a.id);
    if (score !== undefined) {
      acc.count += 1;
      acc.sum += score;
    }
    byType.set(type, acc);
  }
  const categories = [...byType.entries()].map(([type, acc]) => ({
    type,
    total: acc.total,
    count: acc.count,
    avgScore: acc.count > 0 ? Math.round(acc.sum / acc.count) : null,
  }));

  const recentAssignments = assignedUnique.slice(0, 5).map((a) => {
    const score = bestScore.get(a.id);
    return {
      id: a.id,
      title: a.title,
      type: a.type,
      points: a.points,
      assignedAt: a.assignedAt,
      score: score ?? null,
      done: score !== undefined,
    };
  });

  res.json({
    teacherId,
    overall: {
      assignmentsCreated: created.length,
      studentsCount: links.length,
      lessonsTotal,
      minutesTotal,
    },
    personal: {
      lessonsWithMe,
      minutesWithMe,
      lastLessonWithMe,
      nextLessonWithMe,
      assignedToMe: assignedUnique.length,
      completedByMe,
      avgScore,
      pointsFromTeacher,
      categories,
      recentAssignments,
    },
    freeSlots,
    freeSlotsTotal: freeAll.length,
  });
});

// Heartbeat — updates lastSeenAt, used for online status.
// Дополнительно продлевает открытую учебную сессию: durationMinutes работает
// как отметка "досюда ученик точно был в приложении". Именно по ней сессия
// закрывается, если клиент пропал без /time-tracking/end.
router.post("/users/ping", requireAuth, async (req, res) => {
  const user = getUser(req);
  await db.update(usersTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(usersTable.id, user.userId));

  const [openSession] = await db.select().from(timeSessionsTable)
    .where(and(eq(timeSessionsTable.studentId, user.userId), isNull(timeSessionsTable.endedAt)));

  // Брошенную сессию ping НЕ воскрешает (иначе гонка "ping раньше start" вернула бы
  // всё время отсутствия) — её закроет /time-tracking/start по старому heartbeat.
  if (openSession && !isSessionStale(openSession)) {
    await db.update(timeSessionsTable)
      .set({ durationMinutes: Math.floor(wallMinutes(openSession)) })
      .where(eq(timeSessionsTable.id, openSession.id));
  }

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

  const allowed = isTeacher(caller.role) || caller.role === "admin" || caller.userId === studentId
    || (caller.role === "parent" && await isLinkedParent(caller.userId, studentId));
  if (!allowed) {
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
