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
  grammarLogTable,
} from "@workspace/db";
import { eq, and, sql, gte, gt } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";
import {
  activityStreakDays,
  countEarlyBirdDays,
  liveSessionMinutes,
  localDayKey,
  sessionMinutes,
  startOfLocalDay,
} from "../lib/timeStats";
import { LEARNED_LEVEL, startOfDay } from "../lib/srs";
import { FORM_MASTERY_HITS } from "../lib/grammar/forms";
import { evaluateDailyPlan } from "../lib/dailyPlan";
import { EMPTY_RAID_STATS, raidAchievementStats, type RaidAchievementStats } from "../lib/raidStats";
import { logger } from "../lib/logger";

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

// ── Отметка о выданной награде за день ──────────────────────────────────────
//
// ГРАБЛИ, из-за которых очки можно было фармить бесконечно.
// Раньше здесь жил флаг `claimedColumnMissing`: первая же ошибка запроса —
// хоть отсутствующая колонка, хоть оборванное соединение — выставляла его
// НАВСЕГДА (до перезапуска процесса). После этого чтение отметки всегда
// возвращало null, то есть «сегодня награду не выдавали», и POST claim выдавал
// очки на каждый вызов. Один сетевой сбой снимал ограничение «раз в сутки»
// целиком.
//
// Теперь различаются ДВА разных ответа: «прочитали, отметки нет» и «прочитать не
// смогли». Во втором случае награда НЕ выдаётся вовсе: лучше отложить сорок
// очков до следующего запроса, чем раздавать их без ограничения.
//
// Колонку досоздаёт lib/ensureSchema.ts до того, как сервер начинает принимать
// запросы, поэтому нормальный путь здесь всегда успешный.
type ClaimedRead = { ok: true; claimed: string | null } | { ok: false };

async function readClaimedDate(userId: number): Promise<ClaimedRead> {
  try {
    const result: any = await db.execute(
      sql`select daily_goal_claimed_date::text as claimed from users where id = ${userId}`,
    );
    const rows = Array.isArray(result) ? result : result?.rows ?? [];
    return { ok: true, claimed: rows[0]?.claimed ?? null };
  } catch (err) {
    logger.error({ err, userId }, "Не удалось прочитать отметку награды за цель дня");
    return { ok: false };
  }
}

// Время ученика по данным сессий. Считается в одном месте, чтобы условия наград
// и цифры в профиле не расходились.
// Важно: у открытой сессии засчитывается только время, подтверждённое heartbeat —
// иначе брошенная вкладка дарит часы занятий (и вместе с ними награды).
//
// Сессии читаются целиком намеренно: из них считаются и серия дней подряд, и
// утренние занятия за всё время — обе величины по определению смотрят на всю
// историю, а не на сегодня.
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

// ── Серия дней подряд ───────────────────────────────────────────────────────
//
// Серия НЕ хранится как счётчик, а вычисляется из сессий (lib/timeStats).
// Раньше users.login_streak просто увеличивался на единицу при каждом входе и
// ни с чем не сверялся, поэтому в шапке профиля стояло 8 дней подряд, а
// карточка «Время в приложении», считавшая дни с реальными занятиями, честно
// показывала 6. Теперь обе цифры берутся из одной функции.
//
// Столбец остаётся кэшем: по нему работают награды streak_* и рейтинг, и его
// достаточно переписывать вычисленным значением.

/** Серия ученика: дни подряд с занятиями, день входа тоже считается. */
async function computeLoginStreak(
  sessions: Parameters<typeof activityStreakDays>[0],
  lastLoginDate: string | null,
): Promise<number> {
  return activityStreakDays(sessions, { alsoActiveDays: [lastLoginDate] });
}

/** Обновляет кэш серии, если он разошёлся с реальностью. */
async function syncLoginStreak(userId: number, stored: number, actual: number) {
  if (stored === actual) return;
  try {
    await db.update(usersTable)
      .set({ loginStreak: actual, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
  } catch { /* кэш не критичен: показываем вычисленное значение в любом случае */ }
}

/**
 * Слова за сегодня: сколько разных слов повторено и сколько впервые доведено
 * до «выучено». Те же правила, что в GET /flashcards/stats — иначе задача дня
 * «повторить 10 слов» будет закрыта на экране и не закрыта при выдаче награды.
 *
 * Считается ДВУМЯ запросами с фильтрами, а не выгрузкой всего журнала в память.
 * Раньше здесь читались все записи review_log за всё время (у активного ученика
 * это десятки тысяч строк на каждое открытие профиля), и из них перебором
 * искались сегодняшние. База умеет это сама и заметно быстрее.
 */
async function computeWordProgress(userId: number) {
  const dayStart = startOfDay();

  const [todayRow] = await db
    .select({ words: sql<number>`count(distinct ${reviewLogTable.wordId})::int` })
    .from(reviewLogTable)
    .where(and(
      eq(reviewLogTable.userId, userId),
      gte(reviewLogTable.reviewedAt, dayStart),
    ));

  // Слово засчитывается один раз — в тот день, когда ВПЕРВЫЕ дошло до «выучено».
  // Поэтому группировка по слову и отбор тех групп, чей первый успех попал в
  // сегодняшние сутки: повторное подтверждение уже выученного слова новой
  // галочки не даёт.
  const learnedRows = await db
    .select({ wordId: reviewLogTable.wordId })
    .from(reviewLogTable)
    .where(and(
      eq(reviewLogTable.userId, userId),
      gte(reviewLogTable.memoryLevelAfter, LEARNED_LEVEL),
    ))
    .groupBy(reviewLogTable.wordId)
    .having(sql`min(${reviewLogTable.reviewedAt}) >= ${dayStart}`);

  const [settings] = await db.select({ dailyWordGoal: flashcardSettingsTable.dailyWordGoal })
    .from(flashcardSettingsTable).where(eq(flashcardSettingsTable.userId, userId));

  return {
    wordsToday: Number(todayRow?.words ?? 0),
    learnedToday: learnedRows.length,
    dailyWordGoal: settings?.dailyWordGoal ?? 10,
  };
}

// ── Раздел «Учёба»: грамматика ──────────────────────────────────────────────
//
// Всё считается по журналу ответов grammar_log (см. routes/grammar.ts): одна
// строка на ответ, в ней режим, тема, верно или нет.
//
// ЛЮБОЙ запрос сюда обёрнут в try/catch и при ошибке отдаёт нули. Причина
// приземлённая: таблица приехала в базу позже остальных, и на базе без неё
// профиль обязан открыться целиком, а не падать пятисоткой из-за медалей.

/**
 * Сколько верных ответов по одному времени считаем «время освоено».
 *
 * Два полных захода (SESSION_SIZE = 12). Один заход — это знакомство, по нему
 * судить рано; десять заходов ученик до конца уровня может и не сделать.
 */
const TENSE_MASTERED_ANSWERS = 24;

/** Итоги по разделу за всё время: из них считаются медали. */
type GrammarTotals = {
  /** Верных ответов во всех режимах раздела. */
  grammarSolved: number;
  /** Глаголов, чьи формы ученик знает (порог тот же, что у режима форм). */
  verbFormsMastered: number;
  /** Времён, отработанных до TENSE_MASTERED_ANSWERS верных ответов. */
  tensesMastered: number;
  /** Верно собранных предложений. */
  sentencesBuilt: number;
};

const EMPTY_GRAMMAR: GrammarTotals = {
  grammarSolved: 0,
  verbFormsMastered: 0,
  tensesMastered: 0,
  sentencesBuilt: 0,
};

/**
 * Итоги раздела ОДНИМ запросом.
 *
 * Группировка сразу по режиму и теме: из неё выводится и общее число верных
 * ответов, и знакомые глаголы, и освоенные времена. Четыре отдельных запроса
 * дали бы то же самое, но каждый заход в профиль стоил бы вчетверо дороже.
 */
async function computeGrammarTotals(userId: number): Promise<GrammarTotals> {
  try {
    const rows = await db
      .select({
        mode: grammarLogTable.mode,
        topic: grammarLogTable.topic,
        correct: sql<number>`count(*) filter (where ${grammarLogTable.correct})::int`,
      })
      .from(grammarLogTable)
      .where(eq(grammarLogTable.userId, userId))
      .groupBy(grammarLogTable.mode, grammarLogTable.topic);

    const totals: GrammarTotals = { ...EMPTY_GRAMMAR };
    for (const row of rows) {
      const correct = Number(row.correct ?? 0);
      totals.grammarSolved += correct;
      if (row.mode === "build") totals.sentencesBuilt += correct;
      // Тема у сборки предложений пустая: там нет ни глагола, ни времени.
      if (!row.topic) continue;
      if (row.mode === "forms" && correct >= FORM_MASTERY_HITS) totals.verbFormsMastered += 1;
      if (row.mode === "tense" && correct >= TENSE_MASTERED_ANSWERS) totals.tensesMastered += 1;
    }
    return totals;
  } catch {
    return { ...EMPTY_GRAMMAR };
  }
}

/**
 * Сегодняшние счётчики раздела для цели дня.
 *
 * verbFormsToday считается по РАЗНЫМ глаголам, а не по ответам: в режиме форм
 * на каждый глагол приходится три вопроса, и задача «повторить формы пяти
 * глаголов» закрывалась бы двумя.
 */
async function computeGrammarToday(userId: number, todayStart: Date) {
  try {
    const [row] = await db
      .select({
        answers: sql<number>`count(*)::int`,
        verbs: sql<number>`count(distinct ${grammarLogTable.topic}) filter (where ${grammarLogTable.mode} = 'forms')::int`,
      })
      .from(grammarLogTable)
      .where(and(
        eq(grammarLogTable.userId, userId),
        gte(grammarLogTable.answeredAt, todayStart),
      ));
    return {
      grammarToday: Number(row?.answers ?? 0),
      verbFormsToday: Number(row?.verbs ?? 0),
    };
  } catch {
    return { grammarToday: 0, verbFormsToday: 0 };
  }
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
 *
 * ГРАБЛИ, из-за которых цель применялась мгновенно.
 * Раньше при смене суток без ожидающего переноса (next равен активной цели)
 * функция выходила сразу и дату НЕ трогала. Отметка застревала на позапрошлом
 * дне, а PATCH ниже сохранял её как есть — и первый же вызов этой функции после
 * смены цели видел «дата меньше сегодняшней» и применял новую цель немедленно.
 *
 * Поэтому сегодняшний день штампуется ВСЕГДА, когда сутки сменились: перенос
 * состоялся, даже если переносить было нечего.
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

  // Сегодня перенос уже был (или день ещё не сменился) — ничего не делаем.
  if (user.dailyGoalAppliedDate >= today) {
    return { active: user.dailyGoalMinutes, next };
  }

  // Сутки сменились. Переносить может быть нечего, но отметку всё равно
  // передвигаем: иначе она протухнет и следующая смена цели применится сразу.
  if (next === user.dailyGoalMinutes) {
    await db.update(usersTable)
      .set({ dailyGoalAppliedDate: today, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
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
  grammarSolved: number;
  verbFormsMastered: number;
  tensesMastered: number;
  sentencesBuilt: number;
} & RaidAchievementStats;

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

  const grammar = await computeGrammarTotals(userId);
  // Показатели рейда: из них выдаются медали за боссов, урон и комбо.
  const raid = await raidAchievementStats(userId);

  // Те же цифры, что видит клиент в /gamification/stats — иначе клиент считает
  // награду открытой, а сервер её отклоняет (и она не выдаётся никогда).
  let totalTimeMinutes = userData.totalTimeMinutes ?? 0;
  let earlyBirdSessions = 0;
  let loginStreak = userData.loginStreak ?? 0;
  try {
    const time = await computeTimeStats(userId, userData.totalTimeMinutes ?? 0);
    totalTimeMinutes = time.totalTimeMinutes;
    earlyBirdSessions = time.earlyBirdDays;
    loginStreak = await computeLoginStreak(time.sessions, userData.lastLoginDate ?? null);
  } catch {
    earlyBirdSessions = 0;
  }

  return {
    completedAssignments,
    totalPoints: userData.totalPoints,
    totalTimeMinutes,
    voiceChatSessions,
    loginStreak,
    perfectScoreCount,
    xpLevel: computeLevel(userData.totalPoints),
    earlyBirdSessions,
    ...grammar,
    ...raid,
  };
}

// Условия для всех наград. ДОЛЖНЫ соответствовать каталогу на клиенте
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
  grammar_10:   (s) => s.grammarSolved >= 10,
  forms_5:      (s) => s.verbFormsMastered >= 5,
  phrases_10:   (s) => s.sentencesBuilt >= 10,
  tenses_1:     (s) => s.tensesMastered >= 1,
  raidhits_1:   (s) => s.raidHits >= 1,
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
  grammar_100:  (s) => s.grammarSolved >= 100,
  grammar_500:  (s) => s.grammarSolved >= 500,
  forms_25:     (s) => s.verbFormsMastered >= 25,
  forms_60:     (s) => s.verbFormsMastered >= 60,
  phrases_100:  (s) => s.sentencesBuilt >= 100,
  tenses_3:     (s) => s.tensesMastered >= 3,
  raiddamage_10000: (s) => s.raidDamage >= 10000,
  raidcombo_10: (s) => s.raidBestCombo >= 10,
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
  grammar_2000: (s) => s.grammarSolved >= 2000,
  forms_100:    (s) => s.verbFormsMastered >= 100,
  tenses_6:     (s) => s.tensesMastered >= 6,
  raidlast_1:   (s) => s.raidLastHits >= 1,
  raidbosses_5: (s) => s.raidBosses.length >= 5,

  // ── Медали за конкретных боссов ──
  // Условие одно: ученик бил босса в той неделе, которая закончилась победой
  // сообщества. Ключи те же, что в BOSSES (lib/raid.ts) — расхождение здесь
  // выглядело бы как «босса добили, медаль не пришла».
  raidboss_golem:     (s) => s.raidBosses.includes("golem"),
  raidboss_dragon:    (s) => s.raidBosses.includes("dragon"),
  raidboss_phantom:   (s) => s.raidBosses.includes("phantom"),
  raidboss_elemental: (s) => s.raidBosses.includes("elemental"),
  raidboss_titan:     (s) => s.raidBosses.includes("titan"),
};

// ── Награда за ежедневный вход ──────────────────────────────────────────────
//
// Было: 30 очков просто за факт входа плюс бонус до 50 сверху — на седьмой день
// выходило 80 очков за нажатие на иконку приложения. Это больше, чем за
// полностью закрытую цель дня, ради которой нужно реально заниматься. Вход не
// работа, платить за него много нельзя: иначе выгоднее заходить и выходить.
//
// Стало: цена дня равна длине серии, шаг 5 очков. Первый день — 5, второй — 10,
// и так далее. Ценность здесь не в самой сумме, а в том, что серию жалко
// терять: пропустил день — начинаешь снова с пятёрки.
//
// Потолок: 50 очков (десятый день серии и дальше). Без него сотый день подряд
// приносил бы 500 очков за вход, и вся остальная арифметика приложения
// перестала бы что-либо значить.
const LOGIN_POINTS_STEP = 5;
const LOGIN_POINTS_CAP = 50;

function loginPointsFor(streak: number): number {
  return Math.min(Math.max(1, streak) * LOGIN_POINTS_STEP, LOGIN_POINTS_CAP);
}

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

  const claimed = await readClaimedDate(userId);

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
  // Серия по умолчанию — сохранённая: если сессии вдруг не прочитались,
  // лучше показать старое значение, чем ноль.
  let loginStreak = userData.loginStreak ?? 0;
  try {
    const time = await computeTimeStats(userId, userData.totalTimeMinutes ?? 0);
    todayMinutes = time.todayMinutes;
    totalTimeMinutes = time.totalTimeMinutes;
    earlyBirdSessions = time.earlyBirdDays;
    todayStart = time.todayStart;

    // Та же функция, что и в карточке «Время в приложении»: цифры на одном
    // экране обязаны совпадать.
    loginStreak = await computeLoginStreak(time.sessions, userData.lastLoginDate ?? null);
    await syncLoginStreak(userId, userData.loginStreak ?? 0, loginStreak);
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

  // Раздел «Учёба»: итоги для медалей и сегодняшние счётчики для цели дня.
  const grammar = await computeGrammarTotals(userId);
  const grammarDay = await computeGrammarToday(userId, todayStart);

  // Рейд: показатели для медалей витрины. Отдельного экрана у них больше нет —
  // рейдовые медали лежат в общем каталоге вместе с остальными.
  let raid: RaidAchievementStats = { ...EMPTY_RAID_STATS, raidBosses: [] };
  try {
    raid = await raidAchievementStats(userId);
  } catch { /* нули: медали просто останутся закрытыми */ }

  // Unlocked achievements from DB
  const dbAchievements = await db.select().from(userAchievementsTable)
    .where(eq(userAchievementsTable.userId, userId));

  res.json({
    totalPoints: userData.totalPoints,
    xpLevel,
    dailyGoalMinutes: goal.active,
    nextDailyGoalMinutes: goal.next,
    // Награда за сегодняшний день уже получена? Клиент по этому полю показывает
    // «получено» вместо «+40» и не дёргает claim повторно. Если отметку не
    // удалось прочитать, показываем «не получено»: сервер всё равно не выдаст
    // очки вслепую (см. POST claim).
    dailyGoalClaimedToday: claimed.ok ? claimed.claimed === todayKey() : false,
    loginStreak,
    lastLoginDate: userData.lastLoginDate,
    todayMinutes,
    todayCompletions,
    todayVoiceSessions,
    voiceChatSessions,
    perfectScoreCount,
    completedAssignments,
    earlyBirdSessions,
    // Раздел «Учёба»: за всё время (медали) и за сегодня (цель дня).
    grammarSolved: grammar.grammarSolved,
    verbFormsMastered: grammar.verbFormsMastered,
    tensesMastered: grammar.tensesMastered,
    sentencesBuilt: grammar.sentencesBuilt,
    grammarToday: grammarDay.grammarToday,
    verbFormsToday: grammarDay.verbFormsToday,
    // Рейд: из них считаются медали raidboss_*, raiddamage_*, raidcombo_*,
    // raidlast_* и raidbosses_*.
    raidDamage: raid.raidDamage,
    raidHits: raid.raidHits,
    raidCrits: raid.raidCrits,
    raidBestCombo: raid.raidBestCombo,
    raidWins: raid.raidWins,
    raidLastHits: raid.raidLastHits,
    raidBosses: raid.raidBosses,
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

  const claimed = await readClaimedDate(userId);

  // Отметку прочитать не удалось — награду НЕ выдаём. Раньше в этом месте
  // ограничение «раз в сутки» просто выключалось до перезапуска сервера, и
  // очки начислялись на каждый вызов.
  if (!claimed.ok) {
    res.status(503).json({
      alreadyClaimed: false,
      awarded: 0,
      error: "Не удалось проверить, выдавалась ли награда сегодня. Попробуйте позже.",
      totalPoints: userData.totalPoints,
      xpLevel: computeLevel(userData.totalPoints),
    });
    return;
  }

  // Уже забрал сегодня — отвечаем спокойно, без ошибки: клиент вызывает claim
  // при каждом обновлении экрана, пока день закрыт.
  if (claimed.claimed === today) {
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
  const grammarDay = await computeGrammarToday(userId, time.todayStart);

  const plan = evaluateDailyPlan({
    dateKey: today,
    todayMinutes: time.todayMinutes,
    activeGoalMinutes: goal.active,
    todayCompletions: activity.todayCompletions,
    todayVoiceSessions: activity.todayVoiceSessions,
    wordsToday: words.wordsToday,
    learnedToday: words.learnedToday,
    dailyWordGoal: words.dailyWordGoal,
    grammarToday: grammarDay.grammarToday,
    verbFormsToday: grammarDay.verbFormsToday,
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

  // Очки и отметка о выдаче пишутся ОДНИМ запросом. Если запись не удалась,
  // очки не начисляются: без отметки награду можно было бы забирать бесконечно.
  //
  // Дополнительная страховка от двойного нажатия: условие where требует, чтобы
  // отметка всё ещё была не сегодняшней. Два одновременных запроса тогда
  // приведут к одной успешной записи, а не к двойному начислению.
  let stored = false;
  try {
    const written = await db.execute(
      sql`update users
            set total_points = ${newTotal},
                xp_level = ${newLevel},
                daily_goal_claimed_date = ${today},
                updated_at = now()
          where id = ${userId}
            and (daily_goal_claimed_date is null or daily_goal_claimed_date <> ${today})
          returning id`,
    );
    const rows = Array.isArray(written) ? written : (written as { rows?: unknown[] })?.rows ?? [];
    stored = rows.length > 0;
  } catch (err) {
    logger.error({ err, userId }, "Не удалось записать награду за цель дня");
  }

  if (!stored) {
    res.status(503).json({
      alreadyClaimed: false,
      awarded: 0,
      reward: plan.reward,
      pending: [],
      error: "Награду не удалось выдать. Попробуйте позже.",
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
//
// Серия: КАЛЕНДАРНЫЕ дни подряд в часовом поясе приложения. Считает её
// activityStreakDays по реальным сессиям (lib/timeStats), а не «плюс один к
// счётчику»: старый счётчик ни с чем не сверялся и разъезжался с фактами —
// профиль показывал 8 дней подряд там, где занятий было 6.
//
// Пропустил хотя бы один день — серия начинается заново с единицы. Никаких
// «заморозок» и прощений: в этом весь смысл серии, иначе она перестаёт
// что-либо значить.
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

  const sessions = await db.select().from(timeSessionsTable)
    .where(eq(timeSessionsTable.studentId, userId));

  // Сегодняшний день засчитывается по факту входа: сессия только что создана и
  // минут в ней ещё нет. Прошлый день входа — тоже: заход, в котором не успело
  // накопиться ни минуты, всё равно был заходом.
  const streak = activityStreakDays(sessions, { alsoActiveDays: [today, lastLogin] });

  // Уже заходил сегодня: серия не растёт и очки второй раз не выдаются.
  if (lastLogin === today) {
    await syncLoginStreak(userId, userData.loginStreak ?? 0, streak);
    res.json({
      alreadyClaimed: true,
      loginStreak: streak,
      totalPoints: userData.totalPoints,
      xpLevel: computeLevel(userData.totalPoints),
      pointsAwarded: 0,
      nextPoints: loginPointsFor(streak + 1),
    });
    return;
  }

  // Серия оборвалась: вчера человека не было, счётчик начался заново.
  const streakReset = streak <= 1 && (userData.loginStreak ?? 0) > 1;

  // Очки за вход: чем длиннее серия, тем дороже день. Шаг 5, потолок 50.
  const pointsAwarded = loginPointsFor(streak);

  const newTotalPoints = userData.totalPoints + pointsAwarded;
  const newXpLevel = computeLevel(newTotalPoints);

  // Условие на last_login_date в WHERE — защита от двойного начисления при двух
  // одновременных запросах (клиент вызывает вход при каждом открытии профиля).
  const written = await db
    .update(usersTable)
    .set({
      totalPoints: newTotalPoints,
      loginStreak: streak,
      lastLoginDate: today,
      xpLevel: newXpLevel,
      updatedAt: new Date(),
    })
    .where(and(
      eq(usersTable.id, userId),
      lastLogin === null ? sql`${usersTable.lastLoginDate} is null` : eq(usersTable.lastLoginDate, lastLogin),
    ))
    .returning({ id: usersTable.id });

  if (written.length === 0) {
    // Кто-то успел раньше — считаем, что награда за сегодня уже выдана.
    res.json({
      alreadyClaimed: true,
      loginStreak: streak,
      totalPoints: userData.totalPoints,
      xpLevel: computeLevel(userData.totalPoints),
      pointsAwarded: 0,
      nextPoints: loginPointsFor(streak + 1),
    });
    return;
  }

  res.json({
    alreadyClaimed: false,
    loginStreak: streak,
    totalPoints: newTotalPoints,
    xpLevel: newXpLevel,
    pointsAwarded,
    // Сколько будет завтра, если прийти снова: это и есть повод вернуться.
    nextPoints: loginPointsFor(streak + 1),
    streakReset,
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
      // Отметку ставим СЕГОДНЯШНИМ днём всегда, а не только когда её нет.
      // Выбор сделан сегодня — значит, перенос причитается завтра. Раньше здесь
      // сохранялась прежняя дата (current.dailyGoalAppliedDate ?? today), и если
      // она успела протухнуть, ближайший GET /gamification/stats считал, что
      // сутки давно сменились, и применял новую цель немедленно: задачи
      // оставались вчерашними, а время в шапке менялось на глазах.
      dailyGoalAppliedDate: todayKey(),
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
