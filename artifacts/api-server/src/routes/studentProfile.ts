// ─────────────────────────────────────────────────────────────────────────────
// GET /api/students/:id/profile-stats
//
// Цифры, которых не хватало чужому профилю ученика, чтобы выглядеть ровно так
// же, как свой (app/(main)/profile.tsx):
//
//   • wordsLearned  — «слов выучено» в шапке. GET /flashcards/stats отдаёт эту
//                     цифру только владельцу, учителю и родителю, поэтому для
//                     чужого профиля считаем её здесь;
//   • loginStreak   — «дней подряд» в шапке;
//   • periodStats   — «Успеваемость» с переключателем Неделя / Месяц / Всё
//                     время. Свой профиль считает его из полного списка сдач,
//                     который другим ученикам не отдаётся;
//   • todayMinutes  — подпись «Сегодня» на плитке времени;
//   • perfectScoreCount / voiceChatSessions / earlyBirdSessions —
//                     условия наград. Без них витрина показывала чужой профиль
//                     как «ничего не добился».
//
// Данные не приватные: те же самые цифры видно в рейтинге и в списке друзей.
// Ручка открыта любому авторизованному пользователю — как и соседняя
// /students/:id/category-stats.
//
// Формулы намеренно повторяют routes/gamification.ts и routes/flashcards.ts:
// если цифры разойдутся, ученик увидит у себя одно, а друг у него — другое.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  submissionsTable,
  timeSessionsTable,
  voiceChatSessionsTable,
  userCardStateTable,
  userAchievementsTable,
  flashcardSettingsTable,
} from "@workspace/db";
import { eq, and, gt, gte, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import {
  countEarlyBirdDays,
  liveSessionMinutes,
  sessionMinutes,
  startOfLocalDay,
} from "../lib/timeStats";

const router = Router();

/** Слово считается выученным с уровня памяти 4 — см. WORDS.md и lib/srs.ts. */
const LEARNED_MEMORY_LEVEL = 4;

/** Разговор состоялся, если в сессии был хотя бы один обмен репликами. */
const REAL_VOICE_SESSION = gt(voiceChatSessionsTable.messageCount, 0);

type PeriodStat = { count: number; average: number | null; points: number };

const EMPTY_PERIOD: PeriodStat = { count: 0, average: null, points: 0 };

/**
 * Срез успеваемости за период. Считается по ПРОВЕРЕННЫМ сдачам — ровно как на
 * своём профиле, где список приходит из /students/:id/submissions (там фильтр
 * status = graded).
 */
function periodStat(
  rows: { score: number; pointsEarned: number | null; submittedAt: Date }[],
  days: number | null,
): PeriodStat {
  const cutoff = days === null ? 0 : Date.now() - days * 86_400_000;
  const inPeriod = rows.filter((r) => r.submittedAt.getTime() >= cutoff);
  if (inPeriod.length === 0) return { ...EMPTY_PERIOD };
  const sum = inPeriod.reduce((acc, r) => acc + (r.score ?? 0), 0);
  return {
    count: inPeriod.length,
    average: Math.round(sum / inPeriod.length),
    points: inPeriod.reduce((acc, r) => acc + (r.pointsEarned ?? 0), 0),
  };
}

router.get("/students/:id/profile-stats", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");

  const studentId = Number(req.params["id"]);
  if (!Number.isFinite(studentId)) {
    res.status(400).json({ error: "Неверный ID" });
    return;
  }

  const [student] = await db
    .select({
      id: usersTable.id,
      role: usersTable.role,
      totalPoints: usersTable.totalPoints,
      totalTimeMinutes: usersTable.totalTimeMinutes,
      loginStreak: usersTable.loginStreak,
    })
    .from(usersTable)
    .where(eq(usersTable.id, studentId));

  if (!student) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }

  // У учителя и родителя ученических счётчиков нет — отдаём пустой каркас,
  // чтобы клиент не разбирал ошибку там, где просто нечего показывать.
  if (student.role !== "student") {
    res.json({
      studentId,
      wordsLearned: 0,
      placementLevel: null,
      loginStreak: 0,
      todayMinutes: 0,
      totalTimeMinutes: student.totalTimeMinutes ?? 0,
      gradedAssignments: 0,
      perfectScoreCount: 0,
      voiceChatSessions: 0,
      earlyBirdSessions: 0,
      unlockedAchievementIds: [],
      periodStats: { week: EMPTY_PERIOD, month: EMPTY_PERIOD, all: EMPTY_PERIOD },
    });
    return;
  }

  // ── Время: открытая сессия + «сегодня» + утренние дни ──
  let todayMinutes = 0;
  let totalTimeMinutes = student.totalTimeMinutes ?? 0;
  let earlyBirdSessions = 0;
  try {
    const sessions = await db
      .select()
      .from(timeSessionsTable)
      .where(eq(timeSessionsTable.studentId, studentId));

    const openSession = sessions.find((s) => s.endedAt === null);
    totalTimeMinutes =
      (student.totalTimeMinutes ?? 0) +
      (openSession ? Math.floor(liveSessionMinutes(openSession)) : 0);

    const todayStart = startOfLocalDay();
    todayMinutes = Math.round(
      sessions
        .filter((s) => s.startedAt >= todayStart)
        .reduce((sum, s) => sum + sessionMinutes(s), 0),
    );
    earlyBirdSessions = countEarlyBirdDays(sessions);
  } catch {
    /* время не критично: профиль должен открыться в любом случае */
  }

  // ── Сдачи: срезы по периодам, идеальные работы, всего проверено ──
  const graded = await db
    .select({
      score: submissionsTable.score,
      pointsEarned: submissionsTable.pointsEarned,
      submittedAt: submissionsTable.submittedAt,
    })
    .from(submissionsTable)
    .where(and(eq(submissionsTable.studentId, studentId), eq(submissionsTable.status, "graded")));

  const periodStats = {
    week: periodStat(graded, 7),
    month: periodStat(graded, 30),
    all: periodStat(graded, null),
  };
  const perfectScoreCount = graded.filter((r) => r.score === 100).length;

  // ── Слова: выучено + уровень по placement-тесту ──
  const [learned] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userCardStateTable)
    .where(
      and(
        eq(userCardStateTable.userId, studentId),
        gte(userCardStateTable.memoryLevel, LEARNED_MEMORY_LEVEL),
      ),
    );

  const [settings] = await db
    .select({ placementLevel: flashcardSettingsTable.placementLevel })
    .from(flashcardSettingsTable)
    .where(eq(flashcardSettingsTable.userId, studentId));

  // ── Голосовые разговоры ──
  const [voice] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(voiceChatSessionsTable)
    .where(and(eq(voiceChatSessionsTable.studentId, studentId), REAL_VOICE_SESSION));

  // ── Уже выданные награды: витрина подсвечивает их как полученные ──
  const achievements = await db
    .select({ achievementId: userAchievementsTable.achievementId })
    .from(userAchievementsTable)
    .where(eq(userAchievementsTable.userId, studentId));

  res.json({
    studentId,
    wordsLearned: learned?.count ?? 0,
    placementLevel: settings?.placementLevel ?? null,
    loginStreak: student.loginStreak ?? 0,
    todayMinutes,
    totalTimeMinutes,
    gradedAssignments: graded.length,
    perfectScoreCount,
    voiceChatSessions: voice?.count ?? 0,
    earlyBirdSessions,
    unlockedAchievementIds: achievements.map((a) => a.achievementId),
    periodStats,
  });
});

export default router;
