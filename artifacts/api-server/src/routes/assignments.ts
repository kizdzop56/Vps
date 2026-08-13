import { Router } from "express";
import { db } from "@workspace/db";
import { assignmentsTable, questionsTable, assignedTasksTable, submissionsTable, submissionAnswersTable, usersTable, teacherStudentsTable } from "@workspace/db";
import { eq, and, gte, lte, inArray, or, desc, isNull, gt } from "drizzle-orm";
import { requireAuth, getUser, requireRole, isTeacher } from "../lib/auth";
import { computeMaxPoints, isTimeLimited } from "../lib/points";
import { autoCloseOverdueAssignments } from "../lib/autoCloseOverdue";

const router = Router();

/**
 * Разбор срока сдачи из тела запроса.
 *
 * Клиент присылает ISO-строку (её даёт Date.toISOString(), уже в UTC) или null,
 * если срока нет. Пустая строка и undefined тоже означают «без срока» — так
 * старые клиенты, которые про срок ничего не знают, продолжают работать.
 *
 * Возвращает Date, null или строку с ошибкой: явный разбор нужен, чтобы в базу
 * не попал Invalid Date и ученик не увидел «просрочено» из-за опечатки.
 */
function parseDueAt(raw: unknown): { value: Date | null } | { error: string } {
  if (raw === undefined || raw === null || raw === "") return { value: null };
  if (typeof raw !== "string" && !(raw instanceof Date)) {
    return { error: "Неверный формат срока сдачи" };
  }
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) return { error: "Неверный формат срока сдачи" };
  return { value: date };
}

/**
 * Срок по умолчанию в днях. Ограничен годом: больше — почти наверняка опечатка
 * (учитель промахнулся по клавише), а не осмысленный срок.
 */
function parseDefaultDueDays(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 365) return null;
  return Math.round(n);
}

// ── List assignments ──────────────────────────────────────────────────
// Students: only published (isDraft=false), optionally filtered by age
// Teachers/admins: their own (any status) + all published others
router.get("/assignments", requireAuth, async (req, res) => {
  const { type, ageMin, ageMax } = req.query;
  const caller = getUser(req);

  let rows: typeof assignmentsTable.$inferSelect[];

  if (isTeacher(caller.role) || caller.role === "admin") {
    const all = await db.select().from(assignmentsTable);
    rows = all.filter(a => !a.isDraft || a.createdBy === caller.userId);
  } else {
    rows = await db.select().from(assignmentsTable).where(eq(assignmentsTable.isDraft, false));
  }

  if (type) rows = rows.filter(a => a.type === type);
  if (ageMin) rows = rows.filter(a => a.ageMin <= Number(ageMin));
  if (ageMax) rows = rows.filter(a => a.ageMax >= Number(ageMax));

  res.json(rows);
});

// ── Teacher: my assignments (drafts + published, not soft-deleted) ────
//
// К каждому заданию добавляются счётчики по назначениям: сколько выдано,
// сколько сдано, сколько ждёт ручной проверки. Без них карточка задания в
// списке показывала только название и не отвечала на главный вопрос учителя —
// «дошло ли это до учеников и кто уже сдал».
router.get("/assignments/my-assignments", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const caller = getUser(req);
  if (!isTeacher(caller.role) && caller.role !== "admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const rows = await db.select().from(assignmentsTable)
    .where(and(
      eq(assignmentsTable.createdBy, caller.userId),
      isNull(assignmentsTable.deletedAt),
    ));

  if (rows.length === 0) { res.json([]); return; }

  // Назначения этого учителя по всем его заданиям — одним запросом.
  const ids = rows.map((a) => a.id);
  const tasks = await db.select({
    assignmentId: assignedTasksTable.assignmentId,
    studentId: assignedTasksTable.studentId,
    assignedAt: assignedTasksTable.assignedAt,
    dueAt: assignedTasksTable.dueAt,
  })
    .from(assignedTasksTable)
    .where(and(
      eq(assignedTasksTable.teacherId, caller.userId),
      inArray(assignedTasksTable.assignmentId, ids),
    ));

  // Сдачи по тем же заданиям. Сопоставляем по паре ученик+задание и по времени:
  // сдача до повторной выдачи не считается выполнением текущего назначения —
  // та же логика, что в GET /assignments/my-tasks.
  //
  // ПОРЯДОК ВАЖЕН: свежие сдачи первыми. У ученика их может быть несколько по
  // одному заданию (сдал, задание выдали снова, сдал ещё раз), и брать первую
  // попавшуюся значит показать учителю то старую работу, то новую — по
  // настроению базы. Отсюда же расходились счётчик «ждёт проверки» и сам
  // список ответов: счёт видел новую сдачу, список — старую.
  const subs = tasks.length > 0
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
    const acc = stats.get(id) ?? { assigned: 0, submitted: 0, pending: 0, scoreSum: 0, scored: 0 };
    stats.set(id, acc);
    return acc;
  };

  for (const task of tasks) {
    const acc = bump(task.assignmentId);
    acc.assigned += 1;
    const sub = subs.find((s) =>
      s.assignmentId === task.assignmentId &&
      s.studentId === task.studentId &&
      s.submittedAt > task.assignedAt,
    );
    if (!sub) continue;
    acc.submitted += 1;
    if (sub.status === "pending") acc.pending += 1;
    // В средний балл идут только проверенные работы: у ждущих проверки
    // score ещё нулевой и занижал бы среднее.
    if (sub.status !== "pending") {
      acc.scoreSum += sub.score ?? 0;
      acc.scored += 1;
    }
  }

  res.json(rows.map((a) => {
    const acc = stats.get(a.id);
    return {
      ...a,
      assignedCount: acc?.assigned ?? 0,
      submittedCount: acc?.submitted ?? 0,
      pendingCount: acc?.pending ?? 0,
      avgScore: acc && acc.scored > 0 ? Math.round(acc.scoreSum / acc.scored) : null,
    };
  }));
});

// ── Assignments assigned to me (student) ─────────────────────────────
router.get("/assignments/my-tasks", requireAuth, async (req, res) => {
  const caller = getUser(req);

  // Просроченные задания закрываем перед выдачей списка: иначе ученик до
  // следующего тика фонового сторожа видел бы задание, срок которого вышел,
  // и мог его сдать «задним числом».
  await autoCloseOverdueAssignments();

  // LEFT JOIN submissions on same student+assignment AND submittedAt > assignedAt.
  // WHERE submissions.id IS NULL means "no submission exists for the current assignment instance"
  // so only active (not yet submitted in this round) tasks are returned.
  const tasks = await db.select({
    assignedTaskId: assignedTasksTable.id,
    assignedAt: assignedTasksTable.assignedAt,
    // Срок сдачи: null, если учитель его не ставил. Ученик видит его на
    // карточке, и по нему же сортируется список — просроченное сверху.
    dueAt: assignedTasksTable.dueAt,
    teacherId: assignedTasksTable.teacherId,
    teacherName: usersTable.name,
    assignmentId: assignmentsTable.id,
    title: assignmentsTable.title,
    description: assignmentsTable.description,
    type: assignmentsTable.type,
    points: assignmentsTable.points,
    ageMin: assignmentsTable.ageMin,
    ageMax: assignmentsTable.ageMax,
    content: assignmentsTable.content,
    mediaUrl: assignmentsTable.mediaUrl,
    createdAt: assignmentsTable.createdAt,
  })
    .from(assignedTasksTable)
    .leftJoin(assignmentsTable, eq(assignedTasksTable.assignmentId, assignmentsTable.id))
    .leftJoin(usersTable, eq(assignedTasksTable.teacherId, usersTable.id))
    .leftJoin(
      submissionsTable,
      and(
        eq(submissionsTable.studentId, assignedTasksTable.studentId),
        eq(submissionsTable.assignmentId, assignedTasksTable.assignmentId),
        gt(submissionsTable.submittedAt, assignedTasksTable.assignedAt),
      ),
    )
    .where(and(
      eq(assignedTasksTable.studentId, caller.userId),
      isNull(submissionsTable.id),
      isNull(assignmentsTable.deletedAt),
      eq(assignmentsTable.isDraft, false),
    ));

  res.json(tasks);
});

// ── Teacher: get their assigned tasks + results ───────────────────────
router.get("/assignments/teacher-results", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const caller = getUser(req);
  if (!isTeacher(caller.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  // Тот же сторож, что и у ученика: учитель должен видеть «не сдано в срок»
  // сразу, а не после следующего тика фоновой задачи.
  await autoCloseOverdueAssignments();

  const tasks = await db.select({
    assignedTaskId: assignedTasksTable.id,
    assignedAt: assignedTasksTable.assignedAt,
    // Срок нужен и учителю: по нему видно, кто не сдал вовремя.
    dueAt: assignedTasksTable.dueAt,
    studentId: assignedTasksTable.studentId,
    studentName: usersTable.name,
    studentAvatarEmoji: usersTable.avatarEmoji,
    studentAvatarColor: usersTable.avatarColor,
    studentAvatarUrl: usersTable.avatarUrl,
    assignmentId: assignmentsTable.id,
    assignmentTitle: assignmentsTable.title,
    assignmentType: assignmentsTable.type,
    assignmentPoints: assignmentsTable.points,
    assignmentMediaUrl: assignmentsTable.mediaUrl,
    assignmentImageUrl: assignmentsTable.imageUrl,
  })
    .from(assignedTasksTable)
    .leftJoin(assignmentsTable, eq(assignedTasksTable.assignmentId, assignmentsTable.id))
    .leftJoin(usersTable, eq(assignedTasksTable.studentId, usersTable.id))
    .where(eq(assignedTasksTable.teacherId, caller.userId));

  const withSubmissions = await Promise.all(tasks.map(async (task) => {
    // ГРАБЛИ: запрос был без порядка и без ограничения, а брали первую строку.
    // У ученика по одному заданию сдач может быть несколько (сдал, задание
    // выдали снова, сдал ещё раз), и «первая» — это как база решит. Учитель
    // видел то новую работу, то старую: счётчик писал «ждёт проверки», а в
    // списке лежала прошлая, уже оценённая сдача, и проверять было нечего.
    //
    // Берём ПОСЛЕДНЮЮ по времени: это и есть ответ на текущее назначение.
    const [submission] = await db.select({
      id: submissionsTable.id,
      score: submissionsTable.score,
      correctCount: submissionsTable.correctCount,
      totalQuestions: submissionsTable.totalQuestions,
      pointsEarned: submissionsTable.pointsEarned,
      textAnswer: submissionsTable.textAnswer,
      attachmentUrl: submissionsTable.attachmentUrl,
      status: submissionsTable.status,
      teacherFeedback: submissionsTable.teacherFeedback,
      submittedAt: submissionsTable.submittedAt,
    }).from(submissionsTable)
      .where(and(
        eq(submissionsTable.studentId, task.studentId!),
        eq(submissionsTable.assignmentId, task.assignmentId!),
      ))
      .orderBy(desc(submissionsTable.submittedAt))
      .limit(1);

    let answers: any[] = [];
    if (submission) {
      answers = await db.select({
        id: submissionAnswersTable.id,
        questionId: submissionAnswersTable.questionId,
        studentAnswer: submissionAnswersTable.studentAnswer,
        isCorrect: submissionAnswersTable.isCorrect,
        correctAnswer: submissionAnswersTable.correctAnswer,
        questionText: submissionAnswersTable.questionText,
      }).from(submissionAnswersTable).where(eq(submissionAnswersTable.submissionId, submission.id));
    }

    return { ...task, submission: submission ?? null, answers };
  }));

  res.json(withSubmissions);
});

// ── Student: my completed assignments ────────────────────────────────
router.get("/assignments/my-submissions", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const caller = getUser(req);

  const rows = await db.select({
    submissionId: submissionsTable.id,
    score: submissionsTable.score,
    correctCount: submissionsTable.correctCount,
    totalQuestions: submissionsTable.totalQuestions,
    pointsEarned: submissionsTable.pointsEarned,
    submittedAt: submissionsTable.submittedAt,
    // Статус нужен клиенту: "expired" — работа закрыта автоматически по
    // истечении срока, её нельзя показывать как обычную сдачу с нулём.
    status: submissionsTable.status,
    assignmentId: assignmentsTable.id,
    title: assignmentsTable.title,
    description: assignmentsTable.description,
    type: assignmentsTable.type,
    points: assignmentsTable.points,
  })
    .from(submissionsTable)
    .leftJoin(assignmentsTable, eq(submissionsTable.assignmentId, assignmentsTable.id))
    .where(eq(submissionsTable.studentId, caller.userId))
    .orderBy(desc(submissionsTable.submittedAt));

  res.json(rows);
});

// ── Review a submission (student sees own answers, teacher sees any) ──
router.get("/submissions/:submissionId/review", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const caller = getUser(req);
  const submissionId = Number(req.params["submissionId"]);

  const [submission] = await db.select({
    id: submissionsTable.id,
    score: submissionsTable.score,
    correctCount: submissionsTable.correctCount,
    totalQuestions: submissionsTable.totalQuestions,
    pointsEarned: submissionsTable.pointsEarned,
    submittedAt: submissionsTable.submittedAt,
    studentId: submissionsTable.studentId,
    assignmentId: submissionsTable.assignmentId,
    textAnswer: submissionsTable.textAnswer,
    attachmentUrl: submissionsTable.attachmentUrl,
    status: submissionsTable.status,
    teacherFeedback: submissionsTable.teacherFeedback,
  }).from(submissionsTable).where(eq(submissionsTable.id, submissionId));

  if (!submission) { res.status(404).json({ error: "Submission not found" }); return; }

  if (!isTeacher(caller.role) && submission.studentId !== caller.userId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [assignment] = await db.select({
    id: assignmentsTable.id,
    title: assignmentsTable.title,
    type: assignmentsTable.type,
    points: assignmentsTable.points,
    mediaUrl: assignmentsTable.mediaUrl,
    imageUrl: assignmentsTable.imageUrl,
  }).from(assignmentsTable).where(eq(assignmentsTable.id, submission.assignmentId));

  const answers = await db.select({
    id: submissionAnswersTable.id,
    questionId: submissionAnswersTable.questionId,
    studentAnswer: submissionAnswersTable.studentAnswer,
    isCorrect: submissionAnswersTable.isCorrect,
    correctAnswer: submissionAnswersTable.correctAnswer,
    questionText: submissionAnswersTable.questionText,
  }).from(submissionAnswersTable)
    .where(eq(submissionAnswersTable.submissionId, submissionId));

  res.json({ ...submission, assignment: assignment ?? null, answers });
});

// ── Create assignment (teacher or admin) ──────────────────────────────
router.post("/assignments", requireAuth, async (req, res) => {
  const caller = getUser(req);
  if (!isTeacher(caller.role) && caller.role !== "admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const {
    title, description, type, ageMin, ageMax, mediaUrl, content, questions,
    isDraft, timeLimitMinutes, imageUrl, defaultDueDays,
  } = req.body;

  if (!title?.trim()) { res.status(400).json({ error: "Введите название задания" }); return; }
  if (!type) { res.status(400).json({ error: "Выберите тип задания" }); return; }

  // Points are computed automatically, never chosen by the teacher.
  // free_form has no predefined questions — its total is decided at grading time (points = 0 here).
  const timeLimit = timeLimitMinutes ? Number(timeLimitMinutes) : null;
  const computedPoints = type === "free_form"
    ? 0
    : computeMaxPoints(type, questions ?? [], isTimeLimited(timeLimit));

  const [assignment] = await db.insert(assignmentsTable).values({
    title: title.trim(),
    description: description?.trim() ?? "",
    type,
    source: "teacher_created",
    createdBy: caller.userId,
    ageMin: ageMin || 5,
    ageMax: ageMax || 18,
    points: computedPoints,
    mediaUrl: mediaUrl?.trim() || null,
    content: content?.trim() || null,
    isDraft: isDraft !== false,
    timeLimitMinutes: timeLimit,
    defaultDueDays: parseDefaultDueDays(defaultDueDays),
    imageUrl: imageUrl?.trim() || null,
  }).returning();

  if (questions && questions.length > 0) {
    await db.insert(questionsTable).values(
      questions.map((q: any, i: number) => ({
        assignmentId: assignment.id,
        text: q.text,
        options: q.options ?? [],
        correctAnswer: q.correctAnswer ?? "",
        orderIndex: q.orderIndex ?? i,
      }))
    );
  }

  res.status(201).json(assignment);
});

// ── Get assignment detail ─────────────────────────────────────────────
router.get("/assignments/:id", requireAuth, async (req, res) => {
  const id = Number(req.params["id"]);
  const caller = getUser(req);

  const [assignment] = await db.select().from(assignmentsTable).where(eq(assignmentsTable.id, id));
  if (!assignment) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  const questions = await db.select().from(questionsTable)
    .where(eq(questionsTable.assignmentId, id))
    .orderBy(questionsTable.orderIndex);

  const canSeeAnswers = isTeacher(caller.role) || caller.role === "admin";

  // Срок сдачи именно для того, кто открыл задание. Ученику он нужен на самом
  // экране выполнения: до этого срок был виден только в списке.
  let dueAt: Date | null = null;
  if (!canSeeAnswers) {
    const [task] = await db.select({ dueAt: assignedTasksTable.dueAt })
      .from(assignedTasksTable)
      .where(and(
        eq(assignedTasksTable.assignmentId, id),
        eq(assignedTasksTable.studentId, caller.userId),
      ))
      .orderBy(desc(assignedTasksTable.assignedAt));
    dueAt = task?.dueAt ?? null;
  }

  res.json({
    ...assignment,
    dueAt,
    questions: questions.map(q => ({
      id: q.id,
      text: q.text,
      options: q.options,
      correctAnswer: canSeeAnswers ? q.correctAnswer : null,
      orderIndex: q.orderIndex,
    })),
  });
});

// ── Publish a draft assignment ────────────────────────────────────────
router.post("/assignments/:id/publish", requireAuth, async (req, res) => {
  const caller = getUser(req);
  if (!isTeacher(caller.role) && caller.role !== "admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const id = Number(req.params["id"]);
  const [updated] = await db.update(assignmentsTable)
    .set({ isDraft: false, updatedAt: new Date() })
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.createdBy, caller.userId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// ── Assign assignment to students (teacher) ───────────────────────────
router.post("/assignments/:id/assign", requireAuth, async (req, res) => {
  const caller = getUser(req);
  if (!isTeacher(caller.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const assignmentId = Number(req.params["id"]);
  const { studentIds, dueAt } = req.body as { studentIds: number[]; dueAt?: string | null };

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    res.status(400).json({ error: "studentIds required" }); return;
  }

  // Срок сдачи необязателен. Если он пришёл и разобрался — уйдёт в назначение
  // всем ученикам этой отправки: они получают задание одновременно, значит и
  // срок у них общий.
  const due = parseDueAt(dueAt);
  if ("error" in due) { res.status(400).json({ error: due.error }); return; }

  const [assignment] = await db.select().from(assignmentsTable)
    .where(eq(assignmentsTable.id, assignmentId));
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }

  // Клиент не прислал срок, но у задания есть предустановка — применяем её.
  // Так «контрольная на неделю» остаётся недельной, даже если отправка идёт
  // из старого клиента или из места, где выбора срока нет.
  let dueValue = due.value;
  if (dueValue === null && dueAt === undefined && assignment.defaultDueDays != null) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + assignment.defaultDueDays);
    fallback.setHours(23, 59, 0, 0);
    dueValue = fallback;
  }

  // Auto-publish when assigning
  if (assignment.isDraft) {
    await db.update(assignmentsTable)
      .set({ isDraft: false, updatedAt: new Date() })
      .where(eq(assignmentsTable.id, assignmentId));
  }

  const accepted = await db.select({ studentId: teacherStudentsTable.studentId })
    .from(teacherStudentsTable)
    .where(and(
      eq(teacherStudentsTable.teacherId, caller.userId),
      eq(teacherStudentsTable.status, "accepted"),
      inArray(teacherStudentsTable.studentId, studentIds),
    ));

  const validStudentIds = accepted.map((r) => r.studentId);
  if (validStudentIds.length === 0) {
    res.status(400).json({ error: "Нет принятых учеников из списка" }); return;
  }

  // Find students who already have this assignment (active)
  const existingTasks = await db.select({
    studentId: assignedTasksTable.studentId,
    assignedAt: assignedTasksTable.assignedAt,
  })
    .from(assignedTasksTable)
    .where(and(
      eq(assignedTasksTable.assignmentId, assignmentId),
      inArray(assignedTasksTable.studentId, validStudentIds),
    ));
  const existingMap = new Map(existingTasks.map((t) => [t.studentId, t.assignedAt]));

  // Among existing, find who already submitted AFTER the task was assigned
  // (old submissions before re-assignment don't count)
  const submittedSet = new Set<number>();
  if (existingMap.size > 0) {
    const submittedRows = await db.select({
      studentId: submissionsTable.studentId,
      submittedAt: submissionsTable.submittedAt,
    })
      .from(submissionsTable)
      .where(and(
        eq(submissionsTable.assignmentId, assignmentId),
        inArray(submissionsTable.studentId, [...existingMap.keys()]),
      ));
    for (const row of submittedRows) {
      const assignedAt = existingMap.get(row.studentId);
      if (assignedAt && row.submittedAt > assignedAt) {
        submittedSet.add(row.studentId);
      }
    }
  }

  // Skip students who have an active unsubmitted task
  const skipIds = [...existingMap.keys()].filter((id) => !submittedSet.has(id));
  const toAssignIds = validStudentIds.filter((id) => !skipIds.includes(id));

  if (toAssignIds.length === 0) {
    res.json({ ok: true, assigned: 0, skipped: skipIds.length });
    return;
  }

  await db.delete(assignedTasksTable).where(and(
    eq(assignedTasksTable.assignmentId, assignmentId),
    eq(assignedTasksTable.teacherId, caller.userId),
    inArray(assignedTasksTable.studentId, toAssignIds),
  ));

  await db.insert(assignedTasksTable).values(
    toAssignIds.map((sid) => ({
      assignmentId,
      studentId: sid,
      teacherId: caller.userId,
      dueAt: dueValue,
    }))
  );

  res.json({ ok: true, assigned: toAssignIds.length, skipped: skipIds.length });
});

// ── Patch assignment (teacher or admin who owns it) ───────────────────
router.patch("/assignments/:id", requireAuth, async (req, res) => {
  const caller = getUser(req);
  if (!isTeacher(caller.role) && caller.role !== "admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const id = Number(req.params["id"]);
  const {
    title, description, ageMin, ageMax, mediaUrl, content, type, questions,
    timeLimitMinutes, imageUrl, defaultDueDays,
  } = req.body;

  const [updated] = await db.update(assignmentsTable)
    .set({
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(ageMin !== undefined && { ageMin }),
      ...(ageMax !== undefined && { ageMax }),
      ...(mediaUrl !== undefined && { mediaUrl }),
      ...(content !== undefined && { content }),
      ...(type !== undefined && { type }),
      ...(imageUrl !== undefined && { imageUrl }),
      ...(timeLimitMinutes !== undefined && {
        timeLimitMinutes: timeLimitMinutes ? Number(timeLimitMinutes) : null,
      }),
      ...(defaultDueDays !== undefined && { defaultDueDays: parseDefaultDueDays(defaultDueDays) }),
      updatedAt: new Date(),
    })
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.createdBy, caller.userId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  const questionsChanged = questions !== undefined;
  if (questionsChanged) {
    await db.delete(questionsTable).where(eq(questionsTable.assignmentId, id));
    if (questions.length > 0) {
      await db.insert(questionsTable).values(
        questions.map((q: any, i: number) => ({
          assignmentId: id,
          text: q.text,
          options: q.options ?? [],
          correctAnswer: q.correctAnswer ?? "",
          orderIndex: i,
        }))
      );
    }
  }

  // Recompute auto points whenever questions or type change, so stored points
  // always reflect the assignment's current factors. When only the type changed,
  // fall back to the questions already stored for this assignment.
  if (questionsChanged || type !== undefined) {
    const pointQuestions = questionsChanged
      ? questions
      : await db.select({ options: questionsTable.options })
          .from(questionsTable)
          .where(eq(questionsTable.assignmentId, id));
    const computedPoints = updated.type === "free_form"
      ? 0
      : computeMaxPoints(updated.type, pointQuestions, isTimeLimited(updated.timeLimitMinutes));
    const [repointed] = await db.update(assignmentsTable)
      .set({ points: computedPoints })
      .where(eq(assignmentsTable.id, id))
      .returning();
    res.json(repointed);
    return;
  }

  res.json(updated);
});

// ── Update due date of an assigned task (teacher who assigned it) ─────
// Срок иногда нужно сдвинуть уже после отправки: ученик заболел, урок
// перенесли. Отдельный маленький роут вместо переназначения задания — иначе
// пришлось бы удалять назначение и ученик потерял бы прогресс попытки.
router.patch("/assigned-tasks/:assignedTaskId/due", requireAuth, async (req, res) => {
  const caller = getUser(req);
  if (!isTeacher(caller.role) && caller.role !== "admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const assignedTaskId = Number(req.params["assignedTaskId"]);
  const due = parseDueAt((req.body ?? {}).dueAt);
  if ("error" in due) { res.status(400).json({ error: due.error }); return; }

  const [updated] = await db.update(assignedTasksTable)
    .set({ dueAt: due.value })
    .where(and(
      eq(assignedTasksTable.id, assignedTaskId),
      eq(assignedTasksTable.teacherId, caller.userId),
    ))
    .returning();

  if (!updated) { res.status(404).json({ error: "Назначение не найдено" }); return; }
  res.json(updated);
});

// ── Unassign (remove assigned task from student) ──────────────────────
router.delete("/assigned-tasks/:assignedTaskId", requireAuth, async (req, res) => {
  const caller = getUser(req);
  if (!isTeacher(caller.role) && caller.role !== "admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const assignedTaskId = Number(req.params["assignedTaskId"]);
  await db.delete(assignedTasksTable).where(
    and(
      eq(assignedTasksTable.id, assignedTaskId),
      eq(assignedTasksTable.teacherId, caller.userId),
    )
  );
  res.status(204).send();
});

// Soft-delete: hides assignment from teacher's list but students keep their assigned tasks
router.delete("/assignments/:id", requireAuth, async (req, res) => {
  const caller = getUser(req);
  if (!isTeacher(caller.role) && caller.role !== "admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const assignmentId = Number(req.params["id"]);

  const [updated] = await db.update(assignmentsTable)
    .set({ deletedAt: new Date() })
    .where(and(
      eq(assignmentsTable.id, assignmentId),
      eq(assignmentsTable.createdBy, caller.userId),
      isNull(assignmentsTable.deletedAt),
    ))
    .returning({ id: assignmentsTable.id });

  if (!updated) { res.status(404).json({ error: "Задание не найдено" }); return; }
  res.status(204).send();
});

export default router;
