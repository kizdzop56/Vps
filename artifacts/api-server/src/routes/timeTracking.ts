import { Router } from "express";
import { db } from "@workspace/db";
import {
  timeSessionsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";
import { canViewStudent } from "../lib/studentAccess";
import {
  liveSessionMinutes,
  localDayKey,
  orphanSessionMinutes,
  orphanSessionEnd,
  sessionMinutes,
  startOfLocalDay,
  startOfLocalWeek,
} from "../lib/timeStats";

const router = Router();

router.post("/time-tracking/start", requireAuth, async (req, res) => {
  const user = getUser(req);

  const openSessions = await db.select().from(timeSessionsTable)
    .where(and(eq(timeSessionsTable.studentId, user.userId), isNull(timeSessionsTable.endedAt)));

  // Незакрытые сессии закрываем по ПОСЛЕДНЕМУ heartbeat (durationMinutes
  // обновляет /api/users/ping раз в минуту), а не по текущему моменту.
  // Иначе закрытая вкладка засчитывалась как занятие: ушёл в 8:05, вернулся
  // в 9:32 — и в "Сегодня" прилетало полтора часа, которых не было.
  // endedAt тоже ставим задним числом, чтобы отчёты по таймстампам сходились.
  let accumulatedMinutes = 0;
  for (const session of openSessions) {
    const durationMinutes = orphanSessionMinutes(session);
    accumulatedMinutes += durationMinutes;
    await db.update(timeSessionsTable)
      .set({ endedAt: orphanSessionEnd(session), durationMinutes })
      .where(eq(timeSessionsTable.id, session.id));
  }

  // Persist closed session time atomically (no race condition)
  if (accumulatedMinutes > 0) {
    await db.update(usersTable)
      .set({ totalTimeMinutes: sql`${usersTable.totalTimeMinutes} + ${accumulatedMinutes}` })
      .where(eq(usersTable.id, user.userId));
  }

  const [session] = await db.insert(timeSessionsTable).values({ studentId: user.userId }).returning();
  res.json(session);
});

router.post("/time-tracking/end", requireAuth, async (req, res) => {
  const user = getUser(req);

  const [openSession] = await db.select().from(timeSessionsTable)
    .where(and(eq(timeSessionsTable.studentId, user.userId), isNull(timeSessionsTable.endedAt)));

  if (!openSession) {
    res.json({ message: "No open session" });
    return;
  }

  // /end приходит с живого клиента, поэтому реальное время почти всегда верное.
  // Ограничение по heartbeat здесь — страховка на случай запоздавшего keepalive-запроса.
  const durationMinutes = Math.round(liveSessionMinutes(openSession));

  await db.update(timeSessionsTable)
    .set({ endedAt: new Date(), durationMinutes })
    .where(eq(timeSessionsTable.id, openSession.id));

  // Persist accumulated session minutes atomically (no race condition)
  if (durationMinutes > 0) {
    await db.update(usersTable)
      .set({ totalTimeMinutes: sql`${usersTable.totalTimeMinutes} + ${durationMinutes}` })
      .where(eq(usersTable.id, user.userId));
  }

  res.json({ ok: true, durationMinutes });
});

router.get("/students/:id/time", requireAuth, async (req, res) => {
  const studentId = Number(req.params["id"]);
  // Границы суток и недели — по часовому поясу приложения (APP_TIMEZONE),
  // а не по времени процесса: на хостинге сервер живёт в UTC, из-за чего
  // "сегодня" начиналось в 3 часа ночи по Минску.
  const todayStart = startOfLocalDay();
  const weekStart = startOfLocalWeek();

  const [user] = await db.select({ totalTimeMinutes: usersTable.totalTimeMinutes })
    .from(usersTable).where(eq(usersTable.id, studentId));

  const sessions = await db.select().from(timeSessionsTable)
    .where(eq(timeSessionsTable.studentId, studentId));

  // totalTimeMinutes already includes all closed-session minutes (persisted by endSession).
  // Only add elapsed time from the current open session to avoid double-counting.
  const openSession = sessions.find(s => s.endedAt === null);
  const openMinutes = openSession ? Math.floor(liveSessionMinutes(openSession)) : 0;
  const totalMinutes = (user?.totalTimeMinutes ?? 0) + openMinutes;

  // Today/week: compute from timestamps (endedAt - startedAt) instead of the
  // integer durationMinutes column — otherwise short sessions round away and
  // the "today" counter appears to reset between visits.
  const sumSince = (from: Date) => sessions
    .filter(s => s.startedAt >= from)
    .reduce((sum, s) => sum + sessionMinutes(s), 0);
  const todayMinutes = Math.round(sumSince(todayStart) * 100) / 100;
  const weekMinutes = Math.round(sumSince(weekStart) * 100) / 100;

  res.json({ totalMinutes, todayMinutes, weekMinutes, sessions });
});

// ── GET /students/:id/time/summary ─────────────────────────────────────────
//
// Разбор учебного времени по дням: его показывает плитка времени в профиле,
// когда её открывают.
//
// Почему на сервере, а не на клиенте: правила подсчёта нетривиальные (см.
// lib/timeStats — брошенная сессия засчитывается только по подтверждённому
// heartbeat). Продублировать их в приложении означало бы гарантированное
// расхождение цифр при первой же правке.
//
// Доступ проверяет lib/studentAccess: раньше такая же проверка лежала копией
// здесь, и следующий эндпоинт (работы ученика) написали вообще без неё.
//
// День сессии определяется по её НАЧАЛУ: занятие с 23:50 до 00:20 целиком
// уходит во вчера. Резать сессии по полуночи ради двух таких случаев не стоит.

/** Сколько дней показываем столбиками. */
const DAILY_WINDOW_DAYS = 14;
/** Окно, по которому считаем «в среднем за день». */
const AVERAGE_WINDOW_DAYS = 30;
/** Минут за день, начиная с которых день считается учебным. */
const ACTIVE_DAY_MINUTES = 1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

router.get("/students/:id/time/summary", requireAuth, async (req, res) => {
  const viewer = getUser(req);
  const studentId = Number(req.params["id"]);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    res.status(400).json({ error: "Некорректный номер ученика" });
    return;
  }
  if (!(await canViewStudent(viewer, studentId))) {
    res.status(403).json({ error: "Нет доступа к статистике этого ученика" });
    return;
  }

  const [user] = await db.select({ totalTimeMinutes: usersTable.totalTimeMinutes })
    .from(usersTable).where(eq(usersTable.id, studentId));
  if (!user) {
    res.status(404).json({ error: "Ученик не найден" });
    return;
  }

  const sessions = await db.select().from(timeSessionsTable)
    .where(eq(timeSessionsTable.studentId, studentId));

  const now = Date.now();

  // Минуты по локальным суткам.
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    const key = localDayKey(s.startedAt);
    byDay.set(key, (byDay.get(key) ?? 0) + sessionMinutes(s, now));
  }

  const todayMidnight = startOfLocalDay(now).getTime();
  /** Ключ дня, отстоящего от сегодняшнего на i суток назад. */
  const keyBack = (i: number) => localDayKey(todayMidnight - i * MS_PER_DAY);
  const minutesOn = (i: number) => Math.round(byDay.get(keyBack(i)) ?? 0);

  // Столбики: от старых к новым, последний — сегодня.
  const daily: { date: string; minutes: number }[] = [];
  for (let i = DAILY_WINDOW_DAYS - 1; i >= 0; i--) {
    daily.push({ date: keyBack(i), minutes: minutesOn(i) });
  }

  const todayMinutes = minutesOn(0);
  const yesterdayMinutes = minutesOn(1);

  // Неделя с понедельника: так её считают ученики. У соседнего эндпоинта
  // /students/:id/time неделя начинается с воскресенья — менять его здесь
  // означало бы сдвинуть цифры на других экранах.
  const weekStart = startOfLocalWeek(now, undefined, 1).getTime();
  const prevWeekStart = startOfLocalWeek(weekStart - MS_PER_DAY, undefined, 1).getTime();
  const sumRange = (fromMs: number, toMs: number) => Math.round(
    sessions
      .filter((s) => s.startedAt.getTime() >= fromMs && s.startedAt.getTime() < toMs)
      .reduce((sum, s) => sum + sessionMinutes(s, now), 0)
  );
  const weekMinutes = sumRange(weekStart, now + 1);
  const prevWeekMinutes = sumRange(prevWeekStart, weekStart);

  // Среднее считаем по УЧЕБНЫМ дням, а не по календарным: «в среднем 3 минуты
  // в день» у человека, который занимается через день по часу, — бесполезная
  // цифра. Календарное среднее отдаём отдельным полем.
  let windowMinutes = 0;
  let activeDays = 0;
  for (let i = 0; i < AVERAGE_WINDOW_DAYS; i++) {
    const m = minutesOn(i);
    windowMinutes += m;
    if (m >= ACTIVE_DAY_MINUTES) activeDays += 1;
  }
  const avgActiveDayMinutes = activeDays > 0 ? Math.round(windowMinutes / activeDays) : 0;
  const avgCalendarDayMinutes = Math.round(windowMinutes / AVERAGE_WINDOW_DAYS);

  // Лучший день за всю историю.
  let bestDay: { date: string; minutes: number } | null = null;
  for (const [date, minutes] of byDay) {
    const rounded = Math.round(minutes);
    if (rounded <= 0) continue;
    if (!bestDay || rounded > bestDay.minutes) bestDay = { date, minutes: rounded };
  }

  // Дней подряд с занятиями. Сегодняшний ноль серию не обрывает: день ещё
  // не кончился, и обнулять счётчик в полночь было бы просто обидно.
  let streakDays = 0;
  for (let i = todayMinutes >= ACTIVE_DAY_MINUTES ? 0 : 1; i < 400; i++) {
    if (minutesOn(i) < ACTIVE_DAY_MINUTES) break;
    streakDays += 1;
  }

  const openSession = sessions.find((s) => s.endedAt === null);
  const openMinutes = openSession ? Math.floor(liveSessionMinutes(openSession, now)) : 0;

  res.json({
    totalMinutes: (user.totalTimeMinutes ?? 0) + openMinutes,
    todayMinutes,
    yesterdayMinutes,
    weekMinutes,
    prevWeekMinutes,
    avgActiveDayMinutes,
    avgCalendarDayMinutes,
    activeDays,
    averageWindowDays: AVERAGE_WINDOW_DAYS,
    bestDay,
    streakDays,
    daily,
  });
});

export default router;
