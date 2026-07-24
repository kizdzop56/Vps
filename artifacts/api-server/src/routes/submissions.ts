import { Router } from "express";
import { db } from "@workspace/db";
import {
  submissionsTable, submissionAnswersTable,
  questionsTable, assignmentsTable, usersTable, assignedTasksTable
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, getUser, isTeacher } from "../lib/auth";
import { pointsPerCorrect, hasChoiceOptions, isTimeLimited } from "../lib/points";

const router = Router();

router.post("/assignments/:id/submit", requireAuth, async (req, res) => {
  const assignmentId = Number(req.params["id"]);
  const user = getUser(req);
  const { answers, recordingUrl, textAnswer, attachmentUrl } = req.body;

  const [assignment] = await db.select().from(assignmentsTable).where(eq(assignmentsTable.id, assignmentId));
  if (!assignment) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }

  // ── Free-form assignments: no auto-grading, teacher grades manually ──
  if (assignment.type === "free_form") {
    if (!textAnswer?.trim() && !attachmentUrl?.trim()) {
      res.status(400).json({ error: "Добавьте текст ответа или прикрепите файл" });
      return;
    }
    const [submission] = await db.insert(submissionsTable).values({
      studentId: user.userId,
      assignmentId,
      score: 0,
      correctCount: 0,
      totalQuestions: 0,
      pointsEarned: 0,
      textAnswer: textAnswer?.trim() || null,
      attachmentUrl: attachmentUrl?.trim() || null,
      status: "pending",
    }).returning();

    res.json({
      submissionId: submission.id,
      pending: true,
      score: 0,
      totalQuestions: 0,
      correctCount: 0,
      pointsEarned: 0,
      results: [],
    });
    return;
  }

  const questions = await db.select().from(questionsTable)
    .where(eq(questionsTable.assignmentId, assignmentId));

  let correctCount = 0;
  const results: any[] = [];

  for (const answer of (answers ?? [])) {
    const question = questions.find(q => q.id === answer.questionId);
    if (!question) continue;
    const isCorrect = (question.correctAnswer ?? "").toLowerCase().trim() === (answer.answer ?? "").toLowerCase().trim();
    if (isCorrect) correctCount++;
    results.push({
      questionId: question.id,
      isCorrect,
      studentAnswer: answer.answer,
      correctAnswer: question.correctAnswer,
      questionText: question.text,
    });
  }

  const totalQuestions = questions.length;
  const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  // Auto-calculated points: sum the value of each correct answer, where each
  // question's value depends on type difficulty, answer format and time limit.
  const hasTimeLimit = isTimeLimited(assignment.timeLimitMinutes);
  let pointsRaw = 0;
  for (const r of results) {
    if (!r.isCorrect) continue;
    const q = questions.find(qq => qq.id === r.questionId);
    pointsRaw += pointsPerCorrect(assignment.type, q ? hasChoiceOptions(q) : false, hasTimeLimit);
  }
  const pointsEarned = Math.round(pointsRaw);

  const [submission] = await db.insert(submissionsTable).values({
    studentId: user.userId,
    assignmentId,
    score,
    correctCount,
    totalQuestions,
    pointsEarned,
    recordingUrl: recordingUrl || null,
    status: "graded",
  }).returning();

  if (results.length > 0) {
    await db.insert(submissionAnswersTable).values(
      results.map(r => ({
        submissionId: submission.id,
        questionId: r.questionId,
        studentAnswer: r.studentAnswer,
        correctAnswer: r.correctAnswer,
        isCorrect: r.isCorrect,
        questionText: r.questionText,
      }))
    );
  }

  // Award points to user
  if (pointsEarned > 0) {
    const [userData] = await db.select({ totalPoints: usersTable.totalPoints })
      .from(usersTable).where(eq(usersTable.id, user.userId));
    await db.update(usersTable)
      .set({ totalPoints: (userData?.totalPoints || 0) + pointsEarned })
      .where(eq(usersTable.id, user.userId));
  }

  res.json({
    submissionId: submission.id,
    score,
    totalQuestions,
    correctCount,
    pointsEarned,
    results: results.map(r => ({
      questionId: r.questionId,
      isCorrect: r.isCorrect,
      studentAnswer: r.studentAnswer,
      correctAnswer: r.correctAnswer,
    })),
  });
});

// ── Teacher: grade a pending free-form submission ─────────────────────
router.patch("/submissions/:id/grade", requireAuth, async (req, res) => {
  const caller = getUser(req);
  const submissionId = Number(req.params["id"]);
  const { correctCount, totalQuestions, feedback } = req.body;

  const [submission] = await db.select().from(submissionsTable).where(eq(submissionsTable.id, submissionId));
  if (!submission) { res.status(404).json({ error: "Submission not found" }); return; }

  const [assignment] = await db.select().from(assignmentsTable).where(eq(assignmentsTable.id, submission.assignmentId));
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }

  const isOwnerTeacher = assignment.createdBy === caller.userId;
  // Also allow the teacher who specifically assigned this task to grade it
  const [assignedTask] = await db.select({ id: assignedTasksTable.id })
    .from(assignedTasksTable)
    .where(and(
      eq(assignedTasksTable.assignmentId, submission.assignmentId),
      eq(assignedTasksTable.studentId, submission.studentId),
      eq(assignedTasksTable.teacherId, caller.userId),
    ));
  const isAssigningTeacher = !!assignedTask;
  if (caller.role !== "admin" && !((isOwnerTeacher || isAssigningTeacher) && isTeacher(caller.role))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const total = Math.max(1, Math.round(Number(totalQuestions) || 1));
  const correct = Math.max(0, Math.min(total, Math.round(Number(correctCount) || 0)));
  const score = Math.round((correct / total) * 100);
  // Free-form answers are always open-ended (student writes them). Points scale
  // with the number of correct answers, type difficulty and time limit.
  const perCorrect = pointsPerCorrect(assignment.type, false, isTimeLimited(assignment.timeLimitMinutes));
  const points = Math.round(perCorrect * correct);

  const [updated] = await db.update(submissionsTable)
    .set({
      status: "graded",
      pointsEarned: points,
      score,
      correctCount: correct,
      totalQuestions: total,
      teacherFeedback: feedback?.trim() || null,
    })
    .where(eq(submissionsTable.id, submissionId))
    .returning();

  if (points > 0) {
    const [userData] = await db.select({ totalPoints: usersTable.totalPoints })
      .from(usersTable).where(eq(usersTable.id, submission.studentId));
    await db.update(usersTable)
      .set({ totalPoints: (userData?.totalPoints || 0) + points })
      .where(eq(usersTable.id, submission.studentId));
  }

  res.json(updated);
});

router.get("/assignments/:id/submissions", requireAuth, async (req, res) => {
  const assignmentId = Number(req.params["id"]);

  const submissions = await db.select({
    id: submissionsTable.id,
    studentId: submissionsTable.studentId,
    studentName: usersTable.name,
    assignmentId: submissionsTable.assignmentId,
    assignmentTitle: assignmentsTable.title,
    score: submissionsTable.score,
    correctCount: submissionsTable.correctCount,
    totalQuestions: submissionsTable.totalQuestions,
    pointsEarned: submissionsTable.pointsEarned,
    recordingUrl: submissionsTable.recordingUrl,
    textAnswer: submissionsTable.textAnswer,
    attachmentUrl: submissionsTable.attachmentUrl,
    status: submissionsTable.status,
    teacherFeedback: submissionsTable.teacherFeedback,
    submittedAt: submissionsTable.submittedAt,
  }).from(submissionsTable)
    .leftJoin(usersTable, eq(submissionsTable.studentId, usersTable.id))
    .leftJoin(assignmentsTable, eq(submissionsTable.assignmentId, assignmentsTable.id))
    .where(eq(submissionsTable.assignmentId, assignmentId));

  const withAnswers = await Promise.all(submissions.map(async (sub) => {
    const answers = await db.select().from(submissionAnswersTable)
      .where(eq(submissionAnswersTable.submissionId, sub.id));
    return {
      ...sub,
      answers: answers.map(a => ({
        questionId: a.questionId,
        isCorrect: a.isCorrect,
        studentAnswer: a.studentAnswer,
        correctAnswer: a.correctAnswer,
      })),
    };
  }));

  res.json(withAnswers);
});

router.get("/students/:id/submissions", requireAuth, async (req, res) => {
  const studentId = Number(req.params["id"]);

  const submissions = await db.select({
    id: submissionsTable.id,
    studentId: submissionsTable.studentId,
    studentName: usersTable.name,
    assignmentId: submissionsTable.assignmentId,
    assignmentTitle: assignmentsTable.title,
    score: submissionsTable.score,
    correctCount: submissionsTable.correctCount,
    totalQuestions: submissionsTable.totalQuestions,
    pointsEarned: submissionsTable.pointsEarned,
    recordingUrl: submissionsTable.recordingUrl,
    textAnswer: submissionsTable.textAnswer,
    attachmentUrl: submissionsTable.attachmentUrl,
    status: submissionsTable.status,
    teacherFeedback: submissionsTable.teacherFeedback,
    submittedAt: submissionsTable.submittedAt,
  }).from(submissionsTable)
    .leftJoin(usersTable, eq(submissionsTable.studentId, usersTable.id))
    .leftJoin(assignmentsTable, eq(submissionsTable.assignmentId, assignmentsTable.id))
    .where(eq(submissionsTable.studentId, studentId));

  const withAnswers = await Promise.all(submissions.map(async (sub) => {
    const answers = await db.select().from(submissionAnswersTable)
      .where(eq(submissionAnswersTable.submissionId, sub.id));
    return {
      ...sub,
      answers: answers.map(a => ({
        questionId: a.questionId,
        isCorrect: a.isCorrect,
        studentAnswer: a.studentAnswer,
        correctAnswer: a.correctAnswer,
      })),
    };
  }));

  res.json(withAnswers);
});

router.get("/students/:id/errors", requireAuth, async (req, res) => {
  const studentId = Number(req.params["id"]);

  const errors = await db.select({
    assignmentId: assignmentsTable.id,
    assignmentTitle: assignmentsTable.title,
    questionText: submissionAnswersTable.questionText,
    studentAnswer: submissionAnswersTable.studentAnswer,
    correctAnswer: submissionAnswersTable.correctAnswer,
    occurredAt: submissionsTable.submittedAt,
  }).from(submissionAnswersTable)
    .leftJoin(submissionsTable, eq(submissionAnswersTable.submissionId, submissionsTable.id))
    .leftJoin(assignmentsTable, eq(submissionsTable.assignmentId, assignmentsTable.id))
    .where(and(
      eq(submissionsTable.studentId, studentId),
      eq(submissionAnswersTable.isCorrect, false)
    ));

  res.json(errors);
});

export default router;
