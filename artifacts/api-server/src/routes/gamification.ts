import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  userAchievementsTable,
  voiceChatSessionsTable,
  submissionsTable,
  timeSessionsTable,
} from "@workspace/db";
import { eq, and, sql, gte } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";

const router = Router();

// XP thresholds per level
const XP_THRESHOLDS = [
  0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200,
  4100, 5200, 6500, 8000, 9800, 11800, 14000, 16500, 19500, 23000,
  27000, 31500, 36500, 42000, 48000, 55000, 63000, 72000, 82000, 93000,
  105000, 118000, 132000, 147000, 163000, 180000, 198000, 217000, 237000, 258000,
  280000, 303000, 327000, 352000, 378000, 405000, 433000, 462000, 492000, 523000,
];

function computeLevel(xp: number): number {
  let level = 1;
  for (let i = 1; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]!) level = i + 1;
    else break;
  }
  return Math.min(level, 50);
}

const DAILY_LOGIN_POINTS = 30;
const STREAK_BONUS_POINTS = [0, 0, 5, 10, 15, 20, 25, 50]; // bonus at streak day 3,4,5,6,7+

// ── GET /gamification/stats ─────────────────────────────────────────────────
router.get("/gamification/stats", requireAuth, async (req, res) => {
  const user = getUser(req);
  const userId = user.userId;

  const [userData] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!userData) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Voice chat sessions count
  const voiceSessions = await db.select({ count: sql<number>`count(*)::int` })
    .from(voiceChatSessionsTable)
    .where(eq(voiceChatSessionsTable.studentId, userId));
  const voiceChatSessions = voiceSessions[0]?.count ?? 0;

  // Perfect score count — only graded submissions with score = 100
  const perfectSubs = await db.select({ count: sql<number>`count(*)::int` })
    .from(submissionsTable)
    .where(and(
      eq(submissionsTable.studentId, userId),
      eq(submissionsTable.status, "graded"),
      eq(submissionsTable.score, 100),
    ));
  const perfectScoreCount = perfectSubs[0]?.count ?? 0;

  // Completed assignments count — only graded submissions count as "done"
  const completedSubs = await db.select({ count: sql<number>`count(*)::int` })
    .from(submissionsTable)
    .where(and(
      eq(submissionsTable.studentId, userId),
      eq(submissionsTable.status, "graded"),
    ));
  const completedAssignments = completedSubs[0]?.count ?? 0;

  // Early bird sessions (sessions started before 9am)
  let earlyBirdSessions = 0;
  try {
    const earlySessions = await db.select({ count: sql<number>`count(*)::int` })
      .from(timeSessionsTable)
      .where(and(
        eq(timeSessionsTable.studentId, userId),
        sql`EXTRACT(HOUR FROM ${timeSessionsTable.startedAt}) < 9`
      ));
    earlyBirdSessions = earlySessions[0]?.count ?? 0;
  } catch {
    earlyBirdSessions = 0;
  }

  // Unlocked achievements from DB
  const dbAchievements = await db.select().from(userAchievementsTable)
    .where(eq(userAchievementsTable.userId, userId));

  // Daily goal progress (today's time) — include elapsed time from the
  // currently open session so the goal bar and timer stay in sync with
  // the live client-side timer (open sessions have no durationMinutes yet).
  let todayMinutes = 0;
  let totalTimeMinutes = userData.totalTimeMinutes ?? 0;
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const allSessions = await db.select().from(timeSessionsTable)
      .where(eq(timeSessionsTable.studentId, userId));

    const openSession = allSessions.find(s => s.endedAt === null);
    const openMinutes = openSession
      ? Math.floor((Date.now() - openSession.startedAt.getTime()) / 60000)
      : 0;

    const closedSessions = allSessions.filter(s => s.endedAt !== null);
    todayMinutes = closedSessions
      .filter(s => s.startedAt >= todayStart)
      .reduce((sum, s) => sum + (s.durationMinutes || 0), 0)
      + (openSession && openSession.startedAt >= todayStart ? openMinutes : 0);

    totalTimeMinutes = (userData.totalTimeMinutes ?? 0) + openMinutes;
  } catch {
    todayMinutes = 0;
    totalTimeMinutes = userData.totalTimeMinutes ?? 0;
  }

  const xpLevel = computeLevel(userData.totalPoints);

  // Today's completions and voice sessions
  let todayCompletions = 0;
  let todayVoiceSessions = 0;
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todaySubs = await db.select({ count: sql<number>`count(*)::int` })
      .from(submissionsTable)
      .where(and(eq(submissionsTable.studentId, userId), gte(submissionsTable.submittedAt, todayStart)));
    todayCompletions = todaySubs[0]?.count ?? 0;

    const todayVoice = await db.select({ count: sql<number>`count(*)::int` })
      .from(voiceChatSessionsTable)
      .where(and(eq(voiceChatSessionsTable.studentId, userId), gte(voiceChatSessionsTable.createdAt, todayStart)));
    todayVoiceSessions = todayVoice[0]?.count ?? 0;
  } catch { /* silent */ }

  res.json({
    totalPoints: userData.totalPoints,
    xpLevel,
    dailyGoalMinutes: userData.dailyGoalMinutes,
    loginStreak: userData.loginStreak,
    lastLoginDate: userData.lastLoginDate,
    todayMinutes,
    todayCompletions,
    todayVoiceSessions,
    voiceChatSessions,
    perfectScoreCount,
    completedAssignments,
    earlyBirdSessions,
    unlockedAchievementIds: dbAchievements.map(a => a.achievementId),
    totalTimeMinutes,
    mascotName: (userData.mascotName && userData.mascotName !== "Оливер") ? userData.mascotName : "Снежа",
  });
});

// ── POST /gamification/daily-login ─────────────────────────────────────────
router.post("/gamification/daily-login", requireAuth, async (req, res) => {
  const user = getUser(req);
  const userId = user.userId;

  const [userData] = await db.select({
    totalPoints: usersTable.totalPoints,
    loginStreak: usersTable.loginStreak,
    lastLoginDate: usersTable.lastLoginDate,
    xpLevel: usersTable.xpLevel,
  }).from(usersTable).where(eq(usersTable.id, userId));

  if (!userData) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const today = new Date().toISOString().split("T")[0]!;
  const lastLogin = userData.lastLoginDate;

  // Already claimed today
  if (lastLogin === today) {
    const xpLevel = computeLevel(userData.totalPoints);
    res.json({
      alreadyClaimed: true,
      loginStreak: userData.loginStreak,
      totalPoints: userData.totalPoints,
      xpLevel,
      pointsAwarded: 0,
    });
    return;
  }

  // Calculate streak
  let newStreak = 1;
  if (lastLogin) {
    const lastDate = new Date(lastLogin);
    const todayDate = new Date(today);
    const diffDays = Math.round((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      newStreak = userData.loginStreak + 1;
    } else {
      newStreak = 1;
    }
  }

  // Bonus points for streak milestones
  const streakIndex = Math.min(newStreak, STREAK_BONUS_POINTS.length - 1);
  const bonusPoints = STREAK_BONUS_POINTS[streakIndex] ?? 0;
  const pointsAwarded = DAILY_LOGIN_POINTS + bonusPoints;

  const newTotalPoints = userData.totalPoints + pointsAwarded;
  const newXpLevel = computeLevel(newTotalPoints);

  await db.update(usersTable)
    .set({
      totalPoints: newTotalPoints,
      loginStreak: newStreak,
      lastLoginDate: today,
      xpLevel: newXpLevel,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, userId));

  res.json({
    alreadyClaimed: false,
    loginStreak: newStreak,
    totalPoints: newTotalPoints,
    xpLevel: newXpLevel,
    pointsAwarded,
    bonusPoints,
    leveledUp: newXpLevel > (userData.xpLevel ?? 1),
  });
});

// ── PATCH /gamification/daily-goal ─────────────────────────────────────────
router.patch("/gamification/daily-goal", requireAuth, async (req, res) => {
  const user = getUser(req);
  const { minutes } = req.body;
  const validOptions = [10, 15, 20, 30];
  if (!validOptions.includes(minutes)) {
    res.status(400).json({ error: "Invalid goal. Must be 10, 15, 20, or 30 minutes." });
    return;
  }
  await db.update(usersTable)
    .set({ dailyGoalMinutes: minutes, updatedAt: new Date() })
    .where(eq(usersTable.id, user.userId));
  res.json({ dailyGoalMinutes: minutes });
});

// ── POST /gamification/achievements/unlock ─────────────────────────────────
router.post("/gamification/achievements/unlock", requireAuth, async (req, res) => {
  const user = getUser(req);
  const { achievementIds } = req.body as { achievementIds: string[] };
  if (!Array.isArray(achievementIds) || achievementIds.length === 0) {
    res.status(400).json({ error: "achievementIds required" });
    return;
  }

  const existing = await db.select({ achievementId: userAchievementsTable.achievementId })
    .from(userAchievementsTable)
    .where(eq(userAchievementsTable.userId, user.userId));
  const existingIds = new Set(existing.map(e => e.achievementId));

  const newIds = achievementIds.filter(id => !existingIds.has(id));
  if (newIds.length > 0) {
    await db.insert(userAchievementsTable).values(
      newIds.map(achievementId => ({ userId: user.userId, achievementId }))
    );
  }

  res.json({ unlocked: newIds, alreadyHad: achievementIds.filter(id => existingIds.has(id)) });
});

// ── PATCH /gamification/mascot-name ────────────────────────────────────────
router.patch("/gamification/mascot-name", requireAuth, async (req, res) => {
  const user = getUser(req);
  const { name } = req.body;
  if (!name || typeof name !== "string" || name.length > 20) {
    res.status(400).json({ error: "Invalid name" });
    return;
  }
  await db.update(usersTable)
    .set({ mascotName: name.trim(), updatedAt: new Date() })
    .where(eq(usersTable.id, user.userId));
  res.json({ mascotName: name.trim() });
});

// ── POST /gamification/sync-xp-level ───────────────────────────────────────
// Called after awarding points to sync the xpLevel stored in users table
router.post("/gamification/sync-xp-level", requireAuth, async (req, res) => {
  const user = getUser(req);
  const [userData] = await db.select({ totalPoints: usersTable.totalPoints, xpLevel: usersTable.xpLevel })
    .from(usersTable).where(eq(usersTable.id, user.userId));
  if (!userData) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const newLevel = computeLevel(userData.totalPoints);
  if (newLevel !== userData.xpLevel) {
    await db.update(usersTable).set({ xpLevel: newLevel, updatedAt: new Date() })
      .where(eq(usersTable.id, user.userId));
  }
  res.json({ xpLevel: newLevel, totalPoints: userData.totalPoints });
});

export default router;
