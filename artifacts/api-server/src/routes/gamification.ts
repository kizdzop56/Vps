import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  userAchievementsTable,
  voiceChatSessionsTable,
  submissionsTable,
  timeSessionsTable,
  reviewLogTable,
  flashcardSettingsTable,
} from "@workspace/db";
import { eq, and, sql, gte, gt } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";
import {
  countEarlyBirdDays,
  liveSessionMinutes,
  localDayKey,
  sessionMinutes,
  startOfLocalDay,
} from "../lib/timeStats";
import { isLearned, startOfDay } from "../lib/srs";
import { evaluateDailyPlan } from "../lib/dailyPlan";

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

// ── Чтение пользователя ─────────────────────────────────────────────────────
//
// ВАЖНО: колонки перечисляются ЯВНО. `db.select().from(usersTable)` разворачивается
// в SELECT по всем полям схемы, и стоит добавить в схему новый столбец, как
// каждый такой запрос падает на любой базе, где миграция ещё не накатана. Так
// один столбец daily_goal_claimed_date уронил цель дня сразу на двух экранах.
const USER_FIELDS = {
  id: usersTable.id,
  totalPoints: usersTable.totalPoints,
  totalTimeMinutes: usersTable.totalTimeMinutes,
  xpLevel: usersTable.xpLevel,
  dailyGoalMinutes: usersTable.dailyGoalMinutes,
  nextDailyGoalMinutes: usersTable.nextDailyGoalMinutes,
  dailyGoalAppliedDate: usersTable.dailyGoalAppliedDate,
  loginStreak: usersTable.loginStreak,
  lastLoginDate: usersTable.lastLoginDate,
  mascotName: usersTable.mascotName,
} as const;

// Один раз узнав, что столбца награды нет, больше не долбим базу заведомо
// падающим запросом на каждый заход в профиль.
let claimedColumnMissing = false;

/**
 * День последней выданной награды за цель дня.
 *
 * Живёт в отдельном запросе, потому что столбец мог ещё не приехать в базу:
 * до миграции возвращаем null («сегодня не выдавали»), и весь остальной
 * экран продолжает работать.
 */
async function readClaimedDate(userId: number): Promise<string | null> {
  if (claimedColumnMissing) return null;
  try {
    const result: any = await db.execute(
      sql`select daily_goal_claimed_date::text as claimed from users where id = ${userId}`,
    );
    const rows = Array.isArray(result) ? result : result?.rows ?? [];
    return rows[0]?.claimed ?? null;
  } catch {
    claimedColumnMissing = true;
    return null;
  }
}

// Время ученика по данным сессий. Считается в одном месте, чтобы условия наград
// и цифры в профиле не расходились.
// Важно: у открытой сессии засчитывается только время, подтверждённое heartbeat —
// иначе брошенная вкладка дарит часы занятий (и вместе с ними награды).
async function computeTimeStats(userId: number, persistedMinutes: number) {
  const sessions = await db.select().from(timeSessionsTable)
    .where(eq(timeSessionsTable.studentId, userId));

  const openSession = sessions.find(s => s.endedAt === null);
  const openMinutes = openSession ? Math.floor(liveSessionMinutes(openSession)) : 0;

  const todayStart = startOfLocalDay();
  const todayMinutes = Math.round(
    sessions
      .filter(s => s.startedAt >= todayStart)
      .reduce((sum, s) => sum + sessionMinutes(s), 0)
  );

  return {
    sessions,
    todayMinutes,
    totalTimeMinutes: persistedMinutes + openMinutes,
    earlyBirdDays: countEarlyBirdDays(sessions),
    todayStart,
  };
}

/**
 * Слова за сегодня: сколько разных слов повторено и сколько впервые доведено
 * до «выучено». Те же правила, что в GET /flashcards/stats — иначе задача дня
 * «повторить 10 слов» будет закрыта на экране и не закрыта при выдаче награды.
 */
async function computeWordProgress(userId: number) {
  const logs = await db.select().from(reviewLogTable)
    .where(eq(reviewLogTable.userId, userId));

  const dayStart = startOfDay().getTime();

  const wordsToday = new Set(
    logs.filter((l) => l.reviewedAt.getTime() >= dayStart).map((l) => l.wordId)
  ).size;

  // Когда слово ВПЕРВЫЕ дошло до «выучено». Повторное подтверждение уже
  // выученного слова новой галочки не даёт.
  const firstLearnedAt = new Map<number, Date>();
  for (const l of [...logs].sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime())) {
    if (isLearned(l.memoryLevelAfter ?? 0) && !firstLearnedAt.has(l.wordId)) {
      firstLearnedAt.set(l.wordId, l.reviewedAt);
    }
  }
  const learnedToday = [...firstLearnedAt.values()]
    .filter((at) => at.getTime() >= dayStart).length;

  const [settings] = await db.select({ dailyWordGoal: flashcardSettingsTable.dailyWordGoal })
    .from(flashcardSettingsTable).where(eq(flashcardSettingsTable.userId, userId));

  return { wordsToday, learnedToday, dailyWordGoal: settings?.dailyWordGoal ?? 10 };
}

/** Сдано заданий и состоявшихся разговоров с начала сегодняшнего дня. */
async function computeTodayActivity(userId: number, todayStart: Date) {
  const todaySubs = await db.select({ count: sql<number>`count(*)::int` })
    .from(submissionsTable)
    .where(and(
      eq(submissionsTable.studentId, userId),
      gte(submissionsTable.submittedAt, todayStart),
    ));

  const todayVoice = await db.select({ count: sql<number>`count(*)::int` })
    .from(voiceChatSessionsTable)
    .where(and(
      eq(voiceChatSessionsTable.studentId, userId),
      gte(voiceChatSessionsTable.createdAt, todayStart),
      REAL_VOICE_SESSION,
    ));

  return {
    todayCompletions: todaySubs[0]?.count ?? 0,
    todayVoiceSessions: todayVoice[0]?.count ?? 0,
  };
}

// ── Отложенная смена цели дня ───────────────────────────────────────────────
// Ученик может поменять цель когда угодно, но новая цель начинает действовать
// только СО СЛЕДУЮЩЕГО дня. Иначе цель превращается в способ подобрать себе
// задачи: набор задач дня зависит от тяжести цели, и можно было щёлкать
// 10/15/20/30, пока не выпадет удобный.
//
// Хранение: dailyGoalMinutes — то, что действует сегодня; nextDailyGoalMinutes —
// выбор ученика; dailyGoalAppliedDate — день последнего переноса.
const VALID_GOALS = [10, 15, 20, 30];

// День считаем по часовому поясу приложения (APP_TIMEZONE), а не по UTC.
// С UTC «следующий день» для Минска начинался в 3 часа ночи: ученик менял цель
// вечером, а она вступала в силу не в полночь, как обещано, а под утро.
function todayKey(): string {
  return localDayKey(Date.now());
}

/**
 * Переносит отложенную цель в активную, если сутки уже сменились.
 * Возвращает актуальную пару целей — её и отдаём клиенту.
 */
async function resolveDailyGoal(user: {
  id: number;
  dailyGoalMinutes: number;
  nextDailyGoalMinutes: number | null;
  dailyGoalAppliedDate: string | null;
}): Promise<{ active: number; next: number }> {
  const next = user.nextDailyGoalMinutes ?? user.dailyGoalMinutes;
  const today = todayKey();

  // Первый заход после добавления полей: считаем, что цель уже применена
  // сегодня, и ничего не меняем — иначе смена «задним числом» проскочит.
  if (!user.dailyGoalAppliedDate) {
    await db.update(usersTable)
      .set({ nextDailyGoalMinutes: next, dailyGoalAppliedDate: today, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
    return { active: user.dailyGoalMinutes, next };
  }

  if (user.dailyGoalAppliedDate >= today || next === user.dailyGoalMinutes) {
    return { active: user.dailyGoalMinutes, next };
  }

  await db.update(usersTable)
    .set({ dailyGoalMinutes: next, dailyGoalAppliedDate: today, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));
  return { active: next, next };
}

// Состоявшийся разговор с AI-тьютором = сессия, в которой был хотя бы один
// обмен репликами (messageCount увеличивается на 2 за каждый обмен).
// Пустые строки появляются сами: POST /voice-chat/sessions создаёт сессию уже
// при открытии голосового чата. Раньше они считались наравне с реальными, и
// награды voice_* выдавались за один только вход в раздел.
const REAL_VOICE_SESSION = gt(voiceChatSessionsTable.messageCount, 0);

// ── Серверная валидация наград ──────────────────────────────────────────────
// Реальные статы пользователя, по которым проверяются условия наград.
type ServerAchievementStats = {
  completedAssignments: number;
  totalPoints: number;
  totalTimeMinutes: number;
  voiceChatSessions: number;
  loginStreak: number;
  perfectScoreCount: number;
  xpLevel: number;
  earlyBirdSessions: number;
};

// Считает статы пользователя из БД (те же источники, что и /gamification/stats).
async function computeAchievementStats(userId: number): Promise<ServerAchievementStats | null> {
  const [userData] = await db.select(USER_FIELDS).from(usersTable).where(eq(usersTable.id, userId));
  if (!userData) return null;

  const voiceSessions = await db.select({ count: sql<number>`count(*)::int` })
    .from(voiceChatSessionsTable)
    .where(and(
      eq(voiceChatSessionsTable.studentId, userId),
      REAL_VOICE_SESSION,
    ));
  const voiceChatSessions = voiceSessions[0]?.count ?? 0;

  const perfectSubs = await db.select({ count: sql<number>`count(*)::int` })
    .from(submissionsTable)
    .where(and(
      eq(submissionsTable.studentId, userId),
      eq(submissionsTable.status, "graded"),
      eq(submissionsTable.score, 100),
    ));
  const perfectScoreCount = perfectSubs[0]?.count ?? 0;

  const completedSubs = await db.select({ count: sql<number>`count(*)::int` })
    .from(submissionsTable)
    .where(and(
      eq(submissionsTable.studentId, userId),
      eq(submissionsTable.status, "graded"),
    ));
  const completedAssignments = completedSubs[0]?.count ?? 0;

  // Те же цифры, что видит клиент в /gamification/stats — иначе клиент считает
  // награду открытой, а сервер её отклоняет (и она не выдаётся никогда).
  let totalTimeMinutes = userData.totalTimeMinutes ?? 0;
  let earlyBirdSessions = 0;
  try {
    const time = await computeTimeStats(userId, userData.totalTimeMinutes ?? 0);
    totalTimeMinutes = time.totalTimeMinutes;
    earlyBirdSessions = time.earlyBirdDays;
  } catch {
    earlyBirdSessions = 0;
  }

  return {
    completedAssignments,
    totalPoints: userData.totalPoints,
    totalTimeMinutes,
    voiceChatSessions,
    loginStreak: userData.loginStreak,
    perfectScoreCount,
    xpLevel: computeLevel(userData.totalPoints),
    earlyBirdSessions,
  };
}

// Условия для всех 50 наград. ДОЛЖНЫ соответствовать каталогу на клиенте
// (english-learning/constants/achievements.ts). Награда записывается в БД
// только если ЕЁ условие реально выполнено — клиенту доверять нельзя.
// early_* считаются в УТРЕННИХ ДНЯХ (один день — максимум одно занятие).
const ACHIEVEMENT_CONDITIONS: Record<string, (s: ServerAchievementStats) => boolean> = {
  // easy
  welcome:      () => true,
  tasks_1:      (s) => s.completedAssignments >= 1,
  tasks_3:      (s) => s.completedAssignments >= 3,
  tasks_5:      (s) => s.completedAssignments >= 5,
  points_10:    (s) => s.totalPoints >= 10,
  points_50:    (s) => s.totalPoints >= 50,
  points_100:   (s) => s.totalPoints >= 100,
  perfect_1:    (s) => s.perfectScoreCount >= 1,
  streak_3:     (s) => s.loginStreak >= 3,
  time_30:      (s) => s.totalTimeMinutes >= 30,
  time_120:     (s) => s.totalTimeMinutes >= 120,
  voice_1:      (s) => s.voiceChatSessions >= 1,
  voice_3:      (s) => s.voiceChatSessions >= 3,
  xp_5:         (s) => s.xpLevel >= 5,
  early_1:      (s) => s.earlyBirdSessions >= 1,
  // medium
  tasks_10:     (s) => s.completedAssignments >= 10,
  tasks_25:     (s) => s.completedAssignments >= 25,
  tasks_50:     (s) => s.completedAssignments >= 50,
  points_500:   (s) => s.totalPoints >= 500,
  points_1000:  (s) => s.totalPoints >= 1000,
  points_2000:  (s) => s.totalPoints >= 2000,
  perfect_5:    (s) => s.perfectScoreCount >= 5,
  perfect_10:   (s) => s.perfectScoreCount >= 10,
  streak_7:     (s) => s.loginStreak >= 7,
  streak_14:    (s) => s.loginStreak >= 14,
  streak_30:    (s) => s.loginStreak >= 30,
  time_600:     (s) => s.totalTimeMinutes >= 600,
  time_1200:    (s) => s.totalTimeMinutes >= 1200,
  time_1800:    (s) => s.totalTimeMinutes >= 1800,
  time_2400:    (s) => s.totalTimeMinutes >= 2400,
  voice_5:      (s) => s.voiceChatSessions >= 5,
  voice_10:     (s) => s.voiceChatSessions >= 10,
  voice_20:     (s) => s.voiceChatSessions >= 20,
  voice_50:     (s) => s.voiceChatSessions >= 50,
  xp_10:        (s) => s.xpLevel >= 10,
  xp_20:        (s) => s.xpLevel >= 20,
  xp_30:        (s) => s.xpLevel >= 30,
  early_5:      (s) => s.earlyBirdSessions >= 5,
  early_15:     (s) => s.earlyBirdSessions >= 15,
  early_30:     (s) => s.earlyBirdSessions >= 30,
  // hard
  tasks_100:    (s) => s.completedAssignments >= 100,
  tasks_200:    (s) => s.completedAssignments >= 200,
  points_5000:  (s) => s.totalPoints >= 5000,
  points_10000: (s) => s.totalPoints >= 10000,
  time_3600:    (s) => s.totalTimeMinutes >= 3600,
  time_6000:    (s) => s.totalTimeMinutes >= 6000,
  streak_60:    (s) => s.loginStreak >= 60,
  streak_100:   (s) => s.loginStreak >= 100,
  perfect_25:   (s) => s.perfectScoreCount >= 25,
  xp_50:        (s) => s.xpLevel >= 50,
};

const DAILY_LOGIN_POINTS = 30;
const STREAK_BONUS_POINTS = [0, 0, 5, 10, 15, 20, 25, 50]; // bonus at streak day 3,4,5,6,7+

// ── GET /gamification/stats ─────────────────────────────────────────────────
router.get("/gamification/stats", requireAuth, async (req, res) => {
  const user = getUser(req);
  const userId = user.userId;

  const [userData] = await db.select(USER_FIELDS).from(usersTable).where(eq(usersTable.id, userId));
  if (!userData) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Цель дня: если наступили новые сутки — применяем отложенный выбор.
  const goal = await resolveDailyGoal({
    id: userId,
    dailyGoalMinutes: userData.dailyGoalMinutes,
    nextDailyGoalMinutes: userData.nextDailyGoalMinutes ?? null,
    dailyGoalAppliedDate: userData.dailyGoalAppliedDate ?? null,
  });

  const claimedDate = await readClaimedDate(userId);

  // Voice chat sessions count — только сессии с реальным разговором
  const voiceSessions = await db.select({ count: sql<number>`count(*)::int` })
    .from(voiceChatSessionsTable)
    .where(and(
      eq(voiceChatSessionsTable.studentId, userId),
      REAL_VOICE_SESSION,
    ));
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

  // Время: сегодня, всего и утренние дни для награды «Жаворонок».
  // Границы суток — по часовому поясу приложения (APP_TIMEZONE), а не по
  // времени процесса: сервер живёт в UTC, из-за чего «сегодня» начиналось
  // в 3 часа ночи по Минску.
  let todayMinutes = 0;
  let totalTimeMinutes = userData.totalTimeMinutes ?? 0;
  let earlyBirdSessions = 0;
  let todayStart = startOfLocalDay();
  try {
    const time = await computeTimeStats(userId, userData.totalTimeMinutes ?? 0);
    todayMinutes = time.todayMinutes;
    totalTimeMinutes = time.totalTimeMinutes;
    earlyBirdSessions = time.earlyBirdDays;
    todayStart = time.todayStart;
  } catch {
    todayMinutes = 0;
    totalTimeMinutes = userData.totalTimeMinutes ?? 0;
    earlyBirdSessions = 0;
  }

  const xpLevel = computeLevel(userData.totalPoints);

  // Today's completions and voice sessions
  let todayCompletions = 0;
  let todayVoiceSessions = 0;
  try {
    const activity = await computeTodayActivity(userId, todayStart);
    todayCompletions = activity.todayCompletions;
    todayVoiceSessions = activity.todayVoiceSessions;
  } catch { /* silent */ }

  // Unlocked achievements from DB
  const dbAchievements = await db.select().from(userAchievementsTable)
    .where(eq(userAchievementsTable.userId, userId));

  res.json({
    totalPoints: userData.totalPoints,
    xpLevel,
    dailyGoalMinutes: goal.active,
    nextDailyGoalMinutes: goal.next,
    // Награда за сегодняшний день уже получена? Клиент по этому полю показывает
    // «получено» вместо «+40» и не дёргает claim повторно.
    dailyGoalClaimedToday: claimedDate === todayKey(),
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

// ── POST /gamification/daily-goal/claim ────────────────────────────────────
//
// Очки за цель дня. Выдаются ОДИН раз в сутки и только за полностью закрытый
// день: время плюс все задачи. Раньше награда не начислялась вообще — и «+15»
// у цели, и «+35» у отдельных задач были нарисованы на карточке, а в
// total_points не попадали никогда.
//
// Клиент только просит выдать награду. Что именно закрыто, сервер считает сам
// по своим данным (lib/dailyPlan.ts + те же счётчики, что в /gamification/stats
// и /flashcards/stats): иначе очки начислялись бы одним поддельным запросом.
router.post("/gamification/daily-goal/claim", requireAuth, async (req, res) => {
  const user = getUser(req);
  const userId = user.userId;

  const [userData] = await db.select(USER_FIELDS).from(usersTable).where(eq(usersTable.id, userId));
  if (!userData) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const today = todayKey();

  const goal = await resolveDailyGoal({
    id: userId,
    dailyGoalMinutes: userData.dailyGoalMinutes,
    nextDailyGoalMinutes: userData.nextDailyGoalMinutes ?? null,
    dailyGoalAppliedDate: userData.dailyGoalAppliedDate ?? null,
  });

  // Уже забрал сегодня — отвечаем спокойно, без ошибки: клиент вызывает claim
  // при каждом обновлении экрана, пока день закрыт.
  if ((await readClaimedDate(userId)) === today) {
    res.json({
      alreadyClaimed: true,
      awarded: 0,
      totalPoints: userData.totalPoints,
      xpLevel: computeLevel(userData.totalPoints),
    });
    return;
  }

  const time = await computeTimeStats(userId, userData.totalTimeMinutes ?? 0);
  const activity = await computeTodayActivity(userId, time.todayStart);
  const words = await computeWordProgress(userId);

  const plan = evaluateDailyPlan({
    dateKey: today,
    todayMinutes: time.todayMinutes,
    activeGoalMinutes: goal.active,
    todayCompletions: activity.todayCompletions,
    todayVoiceSessions: activity.todayVoiceSessions,
    wordsToday: words.wordsToday,
    learnedToday: words.learnedToday,
    dailyWordGoal: words.dailyWordGoal,
  });

  if (!plan.allDone) {
    res.json({
      alreadyClaimed: false,
      awarded: 0,
      reward: plan.reward,
      pending: plan.pending,
      totalPoints: userData.totalPoints,
      xpLevel: computeLevel(userData.totalPoints),
    });
    return;
  }

  const newTotal = userData.totalPoints + plan.reward;
  const newLevel = computeLevel(newTotal);

  // Очки и отметка о выдаче пишутся ОДНИМ запросом. Если столбца ещё нет в
  // базе, падает всё целиком и очки не начисляются: без отметки награду можно
  // было бы забирать бесконечно.
  try {
    await db.update(usersTable)
      .set({
        totalPoints: newTotal,
        xpLevel: newLevel,
        dailyGoalClaimedDate: today,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));
  } catch {
    claimedColumnMissing = true;
    res.json({
      alreadyClaimed: false,
      awarded: 0,
      reward: plan.reward,
      pending: [],
      totalPoints: userData.totalPoints,
      xpLevel: computeLevel(userData.totalPoints),
    });
    return;
  }

  res.json({
    alreadyClaimed: false,
    awarded: plan.reward,
    reward: plan.reward,
    pending: [],
    totalPoints: newTotal,
    xpLevel: newLevel,
    leveledUp: newLevel > (userData.xpLevel ?? 1),
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

  const today = todayKey();
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
// Меняем ТОЛЬКО отложенную цель: сегодняшний день уже начат, и его набор задач
// пересобираться не должен.
router.patch("/gamification/daily-goal", requireAuth, async (req, res) => {
  const user = getUser(req);
  const { minutes } = req.body;
  if (!VALID_GOALS.includes(minutes)) {
    res.status(400).json({ error: "Invalid goal. Must be 10, 15, 20, or 30 minutes." });
    return;
  }

  const [current] = await db.select({
    dailyGoalMinutes: usersTable.dailyGoalMinutes,
    dailyGoalAppliedDate: usersTable.dailyGoalAppliedDate,
  }).from(usersTable).where(eq(usersTable.id, user.userId));
  if (!current) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await db.update(usersTable)
    .set({
      nextDailyGoalMinutes: minutes,
      // Если перенос ещё ни разу не выполнялся, фиксируем сегодняшний день —
      // иначе ближайший же запрос статистики применил бы новую цель сразу.
      dailyGoalAppliedDate: current.dailyGoalAppliedDate ?? todayKey(),
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, user.userId));

  res.json({
    dailyGoalMinutes: current.dailyGoalMinutes,
    nextDailyGoalMinutes: minutes,
    appliesTomorrow: minutes !== current.dailyGoalMinutes,
  });
});

// ── POST /gamification/achievements/unlock ─────────────────────────────────
router.post("/gamification/achievements/unlock", requireAuth, async (req, res) => {
  const user = getUser(req);
  const { achievementIds } = req.body as { achievementIds: string[] };
  if (!Array.isArray(achievementIds) || achievementIds.length === 0) {
    res.status(400).json({ error: "achievementIds required" });
    return;
  }

  // Проверяем условия на сервере: награду можно записать ТОЛЬКО если её
  // условие реально выполнено. Раньше сервер вставлял любые id от клиента —
  // из-за этого награды начислялись без выполнения условий.
  const stats = await computeAchievementStats(user.userId);
  if (!stats) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const eligibleIds = achievementIds.filter((id) => {
    const condition = ACHIEVEMENT_CONDITIONS[id];
    return typeof condition === "function" && condition(stats);
  });
  const rejectedIds = achievementIds.filter((id) => !eligibleIds.includes(id));

  const existing = await db.select({ achievementId: userAchievementsTable.achievementId })
    .from(userAchievementsTable)
    .where(eq(userAchievementsTable.userId, user.userId));
  const existingIds = new Set(existing.map(e => e.achievementId));

  const newIds = eligibleIds.filter(id => !existingIds.has(id));
  if (newIds.length > 0) {
    await db.insert(userAchievementsTable).values(
      newIds.map(achievementId => ({ userId: user.userId, achievementId }))
    );
  }

  res.json({
    unlocked: newIds,
    alreadyHad: eligibleIds.filter(id => existingIds.has(id)),
    rejected: rejectedIds,
  });
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
