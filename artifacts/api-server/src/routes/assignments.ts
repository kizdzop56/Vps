import { Router } from "express";
import { db } from "@workspace/db";
import { assignmentsTable, questionsTable, assignedTasksTable, submissionsTable, submissionAnswersTable, usersTable, teacherStudentsTable } from "@workspace/db";
import { eq, and, gte, lte, inArray, or, desc, isNull, gt } from "drizzle-orm";
import { requireAuth, getUser, requireRole, isTeacher } from "../lib/auth";
import { computeMaxPoints, isTimeLimited } from "../lib/points";

const router = Router();

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
router.get("/assignments/my-assignments", requireAuth, async (req, res) => {
  const caller = getUser(req);
  if (!isTeacher(caller.role) && caller.role !== "admin") {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const rows = await db.select().from(assignmentsTable)
    .where(and(
      eq(assignmentsTable.createdBy, caller.userId),
      isNull(assignmentsTable.deletedAt),
    ));
  res.json(rows);
});

// ── Assignments assigned to me (student) ─────────────────────────────
router.get("/assignments/my-tasks", requireAuth, async (req, res) => {
  const caller = getUser(req);

  // LEFT JOIN submissions on same student+assignment AND submittedAt > assignedAt.
  // WHERE submissions.id IS NULL means "no submission exists for the current assignment instance"
  // so only active (not yet submitted in this round) tasks are returned.
  const tasks = await db.select({
    assignedTaskId: assignedTasksTable.id,
    assignedAt: assignedTasksTable.assignedAt,
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

  const tasks = await db.select({
    assignedTaskId: assignedTasksTable.id,
    assignedAt: assignedTasksTable.assignedAt,
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
      ));

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

  const { title, description, type, ageMin, ageMax, mediaUrl, content, questions, isDraft, timeLimitMinutes, imageUrl } = req.body;

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

  res.json({
    ...assignment,
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
  const { studentIds } = req.body as { studentIds: number[] };

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    res.status(400).json({ error: "studentIds required" }); return;
  }

  const [assignment] = await db.select().from(assignmentsTable)
    .where(eq(assignmentsTable.id, assignmentId));
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }

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
  const { title, description, ageMin, ageMax, mediaUrl, content, type, questions } = req.body;

  const [updated] = await db.update(assignmentsTable)
    .set({
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(ageMin !== undefined && { ageMin }),
      ...(ageMax !== undefined && { ageMax }),
      ...(mediaUrl !== undefined && { mediaUrl }),
      ...(content !== undefined && { content }),
      ...(type !== undefined && { type }),
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
