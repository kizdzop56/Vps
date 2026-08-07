// ─────────────────────────────────────────────────────────────────────────────
// Сегодняшние счётчики ученика: минуты, задания, разговоры, слова.
//
// Из них собирается план дня (dailyPlan.ts). Раньше этот расчёт жил частными
// функциями внутри routes/gamification.ts, и ленте уведомлений, которой нужны
// ровно те же числа, переиспользовать было нечего.
//
// ВАЖНО: границы суток берутся из тех же функций, что и везде —
// startOfLocalDay() для сессий и startOfDay() для журнала повторений. Сервер
// живёт в UTC, и без них «сегодня» для Минска начиналось бы в три часа ночи.
//
// Отложенную цель по времени здесь НЕ переносим: перенос — операция записи, и
// делает её только GET /gamification/stats. Читающий запрос менять цель не
// должен, иначе один и тот же перенос попытаются сделать два разных места.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@workspace/db";
import {
  usersTable,
  timeSessionsTable,
  submissionsTable,
  voiceChatSessionsTable,
  reviewLogTable,
  flashcardSettingsTable,
} from "@workspace/db";
import { and, eq, gt, gte, sql } from "drizzle-orm";
import { localDayKey, sessionMinutes, startOfLocalDay } from "./timeStats";
import { isLearned, startOfDay } from "./srs";

/**
 * Состоявшийся разговор с тьютором = сессия хотя бы с одним обменом репликами.
 * Пустые строки создаются при самом открытии голосового чата.
 */
const REAL_VOICE_SESSION = gt(voiceChatSessionsTable.messageCount, 0);

export interface DailyProgress {
  /** Ключ дня «YYYY-MM-DD» в часовом поясе приложения. */
  dateKey: string;
  todayMinutes: number;
  activeGoalMinutes: number;
  todayCompletions: number;
  todayVoiceSessions: number;
  wordsToday: number;
  learnedToday: number;
  dailyWordGoal: number;
}

export async function computeDailyProgress(userId: number): Promise<DailyProgress | null> {
  const [user] = await db
    .select({
      id: usersTable.id,
      dailyGoalMinutes: usersTable.dailyGoalMinutes,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) return null;

  const todayStart = startOfLocalDay();

  // ── Время ──
  // sessionMinutes сам разбирается с открытой сессией: живой засчитывается
  // календарное время, брошенной — только подтверждённое heartbeat. Разворачивать
  // это здесь вручную нельзя: два выражения для одного числа разъедутся, и лента
  // объявит цель закрытой раньше, чем сервер согласится выдать за неё очки.
  const sessions = await db
    .select()
    .from(timeSessionsTable)
    .where(eq(timeSessionsTable.studentId, userId));

  const todayMinutes = Math.round(
    sessions
      .filter((s) => s.startedAt >= todayStart)
      .reduce((sum, s) => sum + sessionMinutes(s), 0),
  );

  // ── Задания и разговоры за сегодня ──
  const [subs] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(submissionsTable)
    .where(and(
      eq(submissionsTable.studentId, userId),
      gte(submissionsTable.submittedAt, todayStart),
    ));

  const [voice] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(voiceChatSessionsTable)
    .where(and(
      eq(voiceChatSessionsTable.studentId, userId),
      gte(voiceChatSessionsTable.createdAt, todayStart),
      REAL_VOICE_SESSION,
    ));

  // ── Слова ──
  const logs = await db
    .select()
    .from(reviewLogTable)
    .where(eq(reviewLogTable.userId, userId));

  const dayStart = startOfDay().getTime();

  const wordsToday = new Set(
    logs.filter((l) => l.reviewedAt.getTime() >= dayStart).map((l) => l.wordId),
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

  const [settings] = await db
    .select({ dailyWordGoal: flashcardSettingsTable.dailyWordGoal })
    .from(flashcardSettingsTable)
    .where(eq(flashcardSettingsTable.userId, userId));

  return {
    dateKey: localDayKey(Date.now()),
    todayMinutes,
    activeGoalMinutes: user.dailyGoalMinutes,
    todayCompletions: subs?.count ?? 0,
    todayVoiceSessions: voice?.count ?? 0,
    wordsToday,
    learnedToday,
    dailyWordGoal: settings?.dailyWordGoal ?? 10,
  };
}
