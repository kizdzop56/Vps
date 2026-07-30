/**
 * Диагностика ученика для вкладки «Анализ» у учителя.
 *
 * Раньше вкладка жила на /students/:id/category-stats — среднем балле по типам
 * заданий за всё время. По нему нельзя подготовиться к уроку: непонятно, свежие
 * ли это данные, растёт ученик или падает, что с лексикой и что именно
 * переспросить. Здесь собирается полная картина одним запросом плюс короткий
 * список приоритетов (правила — в lib/studentAnalysis.ts).
 *
 * Доступ закрыт: только сам ученик, связанный учитель (accepted), его родитель
 * или админ. Соседние эндпоинты статистики исторически открыты любому
 * авторизованному пользователю — здесь этого повторять не стали.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  submissionsTable,
  submissionAnswersTable,
  assignmentsTable,
  assignedTasksTable,
  timeSessionsTable,
  teacherStudentsTable,
  parentChildrenTable,
  decksTable,
  wordsTable,
  userCardStateTable,
  reviewLogTable,
  deckAssignmentsTable,
  flashcardSettingsTable,
} from "@workspace/db";
import { eq, and, or, isNull, inArray, desc, sql } from "drizzle-orm";
import { requireAuth, getUser, isTeacher } from "../lib/auth";
import { sessionMinutes, startOfLocalDay, startOfLocalWeek } from "../lib/timeStats";
import {
  buildFocus,
  computeSkillStats,
  freshnessStatus,
  groupMistakes,
  type AnalysisMetrics,
  type WrongAnswer,
} from "../lib/studentAnalysis";

const router = Router();

/** Уровень памяти, с которого слово считаем выученным (как в routes/flashcards.ts). */
const LEARNED_LEVEL = 4;

/** Сколько неверных ответов поднимаем из БД для группировки. */
const WRONG_ANSWERS_LIMIT = 300;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Тот же контракт доступа, что и у статистики слов: сам ученик, админ,
 * связанный учитель или родитель.
 */
async function canViewStudent(viewer: { userId: number; role: string }, studentId: number): Promise<boolean> {
  if (viewer.userId === studentId) return true;
  if (viewer.role === "admin") return true;
  if (isTeacher(viewer.role)) {
    const [ts] = await db.select({ id: teacherStudentsTable.id }).from(teacherStudentsTable).where(and(
      eq(teacherStudentsTable.teacherId, viewer.userId),
      eq(teacherStudentsTable.studentId, studentId),
      eq(teacherStudentsTable.status, "accepted"),
    ));
    if (ts) return true;
  }
  if (viewer.role === "parent") {
    const [pc] = await db.select({ id: parentChildrenTable.id }).from(parentChildrenTable).where(and(
      eq(parentChildrenTable.parentId, viewer.userId),
      eq(parentChildrenTable.studentId, studentId),
    ));
    if (pc) return true;
  }
  return false;
}

/** Целых дней между моментом и «сейчас». */
function daysSince(date: Date | null, now: number): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((now - date.getTime()) / MS_PER_DAY));
}

// ── GET /students/:id/analysis ──────────────────────────────────────────────
router.get("/students/:id/analysis", requireAuth, async (req, res) => {
  const caller = getUser(req);
  const studentId = Number(req.params["id"]);
  if (!Number.isFinite(studentId)) { res.status(400).json({ error: "Bad student id" }); return; }

  if (!(await canViewStudent(caller, studentId))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const [student] = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    name: usersTable.name,
    surname: usersTable.surname,
    role: usersTable.role,
    avatarEmoji: usersTable.avatarEmoji,
    avatarColor: usersTable.avatarColor,
    avatarUrl: usersTable.avatarUrl,
    knowledgeLevel: usersTable.knowledgeLevel,
    xpLevel: usersTable.xpLevel,
    loginStreak: usersTable.loginStreak,
    dailyGoalMinutes: usersTable.dailyGoalMinutes,
    lastSeenAt: usersTable.lastSeenAt,
  }).from(usersTable).where(eq(usersTable.id, studentId));

  if (!student) { res.status(404).json({ error: "Student not found" }); return; }

  const now = Date.now();
  const dayStart = startOfLocalDay(now);
  const weekStart = startOfLocalWeek(now);
  const prevWeekStart = new Date(weekStart.getTime() - 7 * MS_PER_DAY);
  const weekAgo = new Date(now - 7 * MS_PER_DAY);

  // Всё, что не зависит друг от друга, тянем параллельно — иначе список
  // учеников на вкладке «Анализ» ощутимо тормозит.
  const [
    gradedRows,
    pendingRows,
    assignedRows,
    wrongRows,
    sessions,
    settingsRow,
    cardStates,
    recentReviews,
    myAssignments,
  ] = await Promise.all([
    // Проверенные работы: основа статистики по навыкам.
    db.select({
      score: submissionsTable.score,
      type: assignmentsTable.type,
      submittedAt: submissionsTable.submittedAt,
    })
      .from(submissionsTable)
      .leftJoin(assignmentsTable, eq(submissionsTable.assignmentId, assignmentsTable.id))
      .where(and(eq(submissionsTable.studentId, studentId), eq(submissionsTable.status, "graded"))),

    // Сдано, но ещё не проверено — это задача учителя.
    db.select({ id: submissionsTable.id })
      .from(submissionsTable)
      .where(and(eq(submissionsTable.studentId, studentId), sql`${submissionsTable.status} <> 'graded'`)),

    // Назначенные задания без сдачи → «не начато». Дедлайнов в схеме нет,
    // поэтому «просрочено» считаем по времени с момента выдачи.
    db.select({
      assignedAt: assignedTasksTable.assignedAt,
      submissionId: submissionsTable.id,
    })
      .from(assignedTasksTable)
      .leftJoin(submissionsTable, and(
        eq(submissionsTable.assignmentId, assignedTasksTable.assignmentId),
        eq(submissionsTable.studentId, assignedTasksTable.studentId),
      ))
      .where(eq(assignedTasksTable.studentId, studentId)),

    // Неверные ответы для группировки повторяющихся ошибок.
    db.select({
      questionText: submissionAnswersTable.questionText,
      studentAnswer: submissionAnswersTable.studentAnswer,
      correctAnswer: submissionAnswersTable.correctAnswer,
      occurredAt: submissionAnswersTable.createdAt,
      assignmentTitle: assignmentsTable.title,
    })
      .from(submissionAnswersTable)
      .innerJoin(submissionsTable, eq(submissionAnswersTable.submissionId, submissionsTable.id))
      .leftJoin(assignmentsTable, eq(submissionsTable.assignmentId, assignmentsTable.id))
      .where(and(eq(submissionsTable.studentId, studentId), eq(submissionAnswersTable.isCorrect, false)))
      .orderBy(desc(submissionAnswersTable.createdAt))
      .limit(WRONG_ANSWERS_LIMIT),

    // Учебное время. Берём с начала прошлой недели — этого хватает на все окна.
    db.select({
      startedAt: timeSessionsTable.startedAt,
      endedAt: timeSessionsTable.endedAt,
      durationMinutes: timeSessionsTable.durationMinutes,
    })
      .from(timeSessionsTable)
      .where(and(
        eq(timeSessionsTable.studentId, studentId),
        sql`${timeSessionsTable.startedAt} >= ${prevWeekStart}`,
      )),

    db.select({ placementLevel: flashcardSettingsTable.placementLevel })
      .from(flashcardSettingsTable).where(eq(flashcardSettingsTable.userId, studentId)),

    db.select({
      wordId: userCardStateTable.wordId,
      memoryLevel: userCardStateTable.memoryLevel,
      dueAt: userCardStateTable.dueAt,
      introduced: userCardStateTable.introduced,
      timesSeen: userCardStateTable.timesSeen,
      timesCorrect: userCardStateTable.timesCorrect,
    }).from(userCardStateTable).where(eq(userCardStateTable.userId, studentId)),

    db.select({
      wordId: reviewLogTable.wordId,
      result: reviewLogTable.result,
      memoryLevelAfter: reviewLogTable.memoryLevelAfter,
    })
      .from(reviewLogTable)
      .where(and(
        eq(reviewLogTable.userId, studentId),
        sql`${reviewLogTable.reviewedAt} >= ${weekAgo}`,
      )),

    db.select({ deckId: deckAssignmentsTable.deckId, assignedBy: deckAssignmentsTable.assignedBy })
      .from(deckAssignmentsTable).where(eq(deckAssignmentsTable.studentId, studentId)),
  ]);

  // ── Навыки ────────────────────────────────────────────────────────────────
  const skills = computeSkillStats(gradedRows.map((r) => ({
    type: r.type,
    score: r.score,
    submittedAt: r.submittedAt,
  })));

  // ── Задания ───────────────────────────────────────────────────────────────
  const notStartedRows = assignedRows.filter((r) => r.submissionId === null);
  const oldestNotStartedDays = notStartedRows.length > 0
    ? Math.max(...notStartedRows.map((r) => daysSince(r.assignedAt, now) ?? 0))
    : null;

  const fortnightAgo = now - 14 * MS_PER_DAY;
  const last14 = gradedRows.filter((r) => r.submittedAt.getTime() >= fortnightAgo);
  const avgScoreLast14 = last14.length > 0
    ? Math.round(last14.reduce((s, r) => s + (r.score ?? 0), 0) / last14.length)
    : null;

  // ── Лексика ───────────────────────────────────────────────────────────────
  // Колоды, доступные ученику: системные + свои + назначенные учителем. Тот же
  // набор, что видит сам ученик на вкладке «Слова».
  const assignedDeckIds = myAssignments.map((a) => a.deckId);
  const visibleDecks = await db.select({
    id: decksTable.id,
    title: decksTable.title,
    emoji: decksTable.emoji,
    isSystem: decksTable.isSystem,
    ownerId: decksTable.ownerId,
  }).from(decksTable).where(or(
    isNull(decksTable.ownerId),
    eq(decksTable.ownerId, studentId),
    assignedDeckIds.length > 0 ? inArray(decksTable.id, assignedDeckIds) : sql`false`,
  ));

  const deckIds = visibleDecks.map((d) => d.id);
  const visibleWords = deckIds.length > 0
    ? await db.select({ id: wordsTable.id, deckId: wordsTable.deckId })
        .from(wordsTable).where(inArray(wordsTable.deckId, deckIds))
    : [];

  const wordToDeck = new Map<number, number>();
  const wordCountByDeck = new Map<number, number>();
  for (const w of visibleWords) {
    wordToDeck.set(w.id, w.deckId);
    wordCountByDeck.set(w.deckId, (wordCountByDeck.get(w.deckId) ?? 0) + 1);
  }

  // Состояния карточек считаем только по видимым словам: у ученика могут
  // остаться состояния от удалённых или чужих колод.
  const relevantStates = cardStates.filter((st) => wordToDeck.has(st.wordId));

  let learned = 0;
  let dueNow = 0;
  let lapsed = 0;
  let introduced = 0;
  let timesSeenTotal = 0;
  let timesCorrectTotal = 0;
  const learnedByDeck = new Map<number, number>();
  const introducedByDeck = new Map<number, number>();
  const dueByDeck = new Map<number, number>();

  for (const st of relevantStates) {
    const deckId = wordToDeck.get(st.wordId)!;
    if (st.introduced) {
      introduced += 1;
      introducedByDeck.set(deckId, (introducedByDeck.get(deckId) ?? 0) + 1);
    }
    if (st.memoryLevel >= LEARNED_LEVEL) {
      learned += 1;
      learnedByDeck.set(deckId, (learnedByDeck.get(deckId) ?? 0) + 1);
    }
    if (st.dueAt.getTime() <= now) {
      dueNow += 1;
      dueByDeck.set(deckId, (dueByDeck.get(deckId) ?? 0) + 1);
    }
    // Слово откатилось в ноль, хотя ученик его уже видел, — забыто.
    if (st.introduced && st.memoryLevel === 0) lapsed += 1;
    timesSeenTotal += st.timesSeen;
    timesCorrectTotal += st.timesCorrect;
  }

  const accuracy = timesSeenTotal > 0 ? Math.round((timesCorrectTotal / timesSeenTotal) * 100) : null;
  const learnedLast7 = recentReviews.filter((r) => (r.memoryLevelAfter ?? 0) >= LEARNED_LEVEL).length;

  // Разбивка по колодам, которые ученику назначил учитель: «я выдал — как идёт».
  const assignedByMe = new Set(
    myAssignments.filter((a) => a.assignedBy === caller.userId).map((a) => a.deckId),
  );
  const assignedDeckSet = new Set(assignedDeckIds);
  const decks = visibleDecks
    .filter((d) => assignedDeckSet.has(d.id))
    .map((d) => {
      const total = wordCountByDeck.get(d.id) ?? 0;
      return {
        deckId: d.id,
        title: d.title,
        emoji: d.emoji ?? undefined,
        total,
        learned: learnedByDeck.get(d.id) ?? 0,
        started: introducedByDeck.get(d.id) ?? 0,
        due: dueByDeck.get(d.id) ?? 0,
        assignedByMe: assignedByMe.has(d.id),
      };
    })
    .sort((a, b) => Number(b.assignedByMe) - Number(a.assignedByMe) || a.title.localeCompare(b.title));

  // ── Активность ────────────────────────────────────────────────────────────
  let minutesToday = 0;
  let minutesWeek = 0;
  let minutesPrevWeek = 0;
  let lastSessionAt: Date | null = null;

  for (const s of sessions) {
    const minutes = sessionMinutes(s, now);
    const started = s.startedAt.getTime();
    if (started >= dayStart.getTime()) minutesToday += minutes;
    if (started >= weekStart.getTime()) minutesWeek += minutes;
    else if (started >= prevWeekStart.getTime()) minutesPrevWeek += minutes;
    const ended = s.endedAt ?? s.startedAt;
    if (!lastSessionAt || ended.getTime() > lastSessionAt.getTime()) lastSessionAt = ended;
  }

  // Последняя активность: берём максимум из lastSeenAt, последней сессии и
  // последней сдачи — любая из них означает, что ученик был в приложении.
  const lastSubmissionAt = gradedRows.reduce<Date | null>((latest, r) => (
    !latest || r.submittedAt.getTime() > latest.getTime() ? r.submittedAt : latest
  ), null);
  const activityCandidates = [student.lastSeenAt, lastSessionAt, lastSubmissionAt]
    .filter((d): d is Date => d instanceof Date);
  const lastActiveAt = activityCandidates.length > 0
    ? new Date(Math.max(...activityCandidates.map((d) => d.getTime())))
    : null;

  const activity = {
    daysSinceActive: daysSince(lastActiveAt, now),
    minutesToday: Math.round(minutesToday),
    minutesWeek: Math.round(minutesWeek),
    minutesPrevWeek: Math.round(minutesPrevWeek),
    loginStreak: student.loginStreak,
    dailyGoalMinutes: student.dailyGoalMinutes,
  };

  // ── Ошибки ────────────────────────────────────────────────────────────────
  const mistakes = groupMistakes(wrongRows.map((r): WrongAnswer => ({
    questionText: r.questionText,
    assignmentTitle: r.assignmentTitle ?? null,
    studentAnswer: r.studentAnswer,
    correctAnswer: r.correctAnswer,
    occurredAt: r.occurredAt,
  })));

  const metrics: AnalysisMetrics = {
    cefrLevel: settingsRow[0]?.placementLevel ?? null,
    activity,
    skills,
    vocabulary: {
      totalWords: visibleWords.length,
      introduced,
      learned,
      dueNow,
      lapsed,
      accuracy,
      learnedLast7,
      reviewsLast7: recentReviews.length,
    },
    assignments: {
      total: assignedRows.length,
      notStarted: notStartedRows.length,
      oldestNotStartedDays,
      awaitingReview: pendingRows.length,
      gradedLast14: last14.length,
      avgScoreLast14,
    },
    mistakes,
  };

  res.json({
    student: {
      id: student.id,
      username: student.username,
      name: student.name,
      surname: student.surname ?? undefined,
      avatarEmoji: student.avatarEmoji ?? undefined,
      avatarColor: student.avatarColor ?? undefined,
      avatarUrl: student.avatarUrl ?? undefined,
      knowledgeLevel: student.knowledgeLevel ?? undefined,
      cefrLevel: metrics.cefrLevel ?? undefined,
      xpLevel: student.xpLevel,
    },
    freshness: freshnessStatus(activity),
    lastActiveAt: lastActiveAt ? lastActiveAt.toISOString() : null,
    activity,
    skills,
    vocabulary: { ...metrics.vocabulary, decks },
    assignments: metrics.assignments,
    mistakes,
    focus: buildFocus(metrics),
  });
});

export default router;
