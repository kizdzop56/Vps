// ─────────────────────────────────────────────────────────────────────────────
// Лента уведомлений: сборка событий ученика.
//
// ── Главное решение: события ВЫВОДЯТСЯ ИЗ СОСТОЯНИЯ ─────────────────────────
// Уведомления не пишутся в момент события. Они собираются при чтении ленты из
// того, что уже лежит в базе: принятые медали, входящие заявки, назначенные
// задания, посчитанный план дня. Каждое событие получает ключ (dedupeKey),
// уникальный в пределах пользователя, и вставка идёт с onConflictDoNothing.
//
// Почему так, а не «отправить уведомление там, где событие происходит»:
//   • эти пять мест живут в четырёх разных роутерах, и достаточно забыть про
//     одно, чтобы раздел молча перестал работать;
//   • история появляется сразу: медали и задания, полученные до этой ленты,
//     тоже в ней окажутся;
//   • пересчёт идемпотентен, поэтому его можно звать хоть на каждый запрос.
//
// Плата: у задач дня время уведомления — момент, когда сервер это заметил, а не
// когда галочка реально встала. У остальных событий время берётся из исходной
// строки (unlocked_at, created_at, assigned_at), то есть точное.
//
// ── Первый заход глушит ПРЕДЫСТОРИЮ, а не первое событие ────────────────────
// У ученика с сорока медалями и двадцатью заданиями первая же сборка выдала бы
// шестьдесят всплывающих окон подряд, поэтому накопленное пишется сразу
// прочитанным и показанным: история есть, окон нет.
//
// ГРАБЛИ: раньше под это правило попадала вся первая порция целиком. «Первый
// заход» определяется по отсутствию строк в базе, а строки не появятся, пока
// источники ничего не отдают — у нового ученика нет ни медалей, ни заданий.
// Значит, первое настоящее событие (закрытая задача дня) тоже уходило в тишину:
// в истории оно есть, окна не было. Ровно на это и было похоже «уведомления не
// приходят».
//
// Теперь глушится только то, что случилось раньше BACKFILL_AGE_MS назад. Свежее
// всплывает как обычно, но не больше FIRST_SYNC_LOUD окон за первый заход — на
// случай ученика, который набрал десяток медалей за один день.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@workspace/db";
import {
  notificationsTable,
  userAchievementsTable,
  friendshipsTable,
  teacherStudentsTable,
  assignedTasksTable,
  assignmentsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { buildServerDailyPlan } from "./dailyPlan";
import { computeDailyProgress } from "./dailyProgress";
import { logger } from "./logger";

export type NotificationKind =
  | "quest"
  | "goal"
  | "achievement"
  | "friend_request"
  | "teacher_request"
  | "assignment";

interface Draft {
  kind: NotificationKind;
  dedupeKey: string;
  title: string;
  body: string;
  detail: string;
  meta?: Record<string, unknown>;
  /** Когда событие произошло. По умолчанию — сейчас. */
  createdAt?: Date;
}

/** Сколько уведомлений держим в ленте. Дальше история никому не нужна. */
export const FEED_LIMIT = 60;

/** Заданий и заявок берём не больше этого — лента не архив. */
const SOURCE_LIMIT = 40;

/**
 * Сколько строк заводим за один заход.
 *
 * Упирается в первую сборку у давнего ученика: сорок медалей, сорок заданий и
 * заявки — это под сотню строк одним запросом. Свежие всё равно окажутся в
 * ленте, а хвост истории заводить незачем: его никто не откроет.
 */
const MAX_NEW_PER_SYNC = 60;

/**
 * Что на первом заходе считается предысторией.
 *
 * Двенадцать часов, а не «начало суток»: событие вчера в 23:50 на первом заходе
 * в 8 утра — уже новость позавчерашняя, а вот закрытая полчаса назад задача дня
 * должна всплыть, даже если ученик открыл ленту впервые.
 */
const BACKFILL_AGE_MS = 12 * 60 * 60 * 1000;

/** Сколько свежих событий разрешено всплыть на самом первом заходе. */
const FIRST_SYNC_LOUD = 3;

/**
 * Как часто пересчитывать задачи дня.
 *
 * Расчёт тянет весь журнал повторений ученика, а ленту опрашивает таймер на
 * клиенте. Без этого ограничения каждый опрос сканировал бы историю целиком.
 * Остальные источники — четыре коротких запроса, их проверяем каждый раз.
 */
const QUEST_SYNC_TTL_MS = 45_000;

const lastQuestSync = new Map<number, number>();

/** Чтобы карта не росла бесконечно на большом воркспейсе. */
function rememberQuestSync(userId: number, at: number) {
  if (lastQuestSync.size > 5000) lastQuestSync.clear();
  lastQuestSync.set(userId, at);
}

/** Русское склонение по числу. */
function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 14) return forms[2]!;
  const last = abs % 10;
  if (last === 1) return forms[0]!;
  if (last >= 2 && last <= 4) return forms[1]!;
  return forms[2]!;
}

// ── Источники событий ───────────────────────────────────────────────────────

async function collectAchievements(userId: number): Promise<Draft[]> {
  const rows = await db
    .select({
      achievementId: userAchievementsTable.achievementId,
      unlockedAt: userAchievementsTable.unlockedAt,
    })
    .from(userAchievementsTable)
    .where(eq(userAchievementsTable.userId, userId));

  // Название и описание медали сервер НЕ хранит: их подставит клиент из
  // constants/achievements.ts по achievementId. Каталог из пятидесяти наград,
  // продублированный здесь, разъехался бы на первой же правке текста.
  return rows.map((row) => ({
    kind: "achievement" as const,
    dedupeKey: `achievement:${row.achievementId}`,
    title: "Новая медаль",
    body: "Открыта новая награда",
    detail: "Медаль уже лежит на витрине наград в профиле.",
    meta: { achievementId: row.achievementId },
    createdAt: row.unlockedAt,
  }));
}

async function collectFriendRequests(userId: number): Promise<Draft[]> {
  const rows = await db
    .select({
      id: friendshipsTable.id,
      createdAt: friendshipsTable.createdAt,
      fromId: usersTable.id,
      fromName: usersTable.name,
      fromUsername: usersTable.username,
    })
    .from(friendshipsTable)
    .innerJoin(usersTable, eq(usersTable.id, friendshipsTable.requesterId))
    .where(and(
      eq(friendshipsTable.addresseeId, userId),
      eq(friendshipsTable.status, "pending"),
    ))
    .orderBy(desc(friendshipsTable.createdAt))
    .limit(SOURCE_LIMIT);

  return rows.map((row) => ({
    kind: "friend_request" as const,
    dedupeKey: `friend_request:${row.id}`,
    title: "Заявка в друзья",
    body: `${row.fromName} хочет добавить тебя в друзья`,
    detail: "Ответить можно в профиле: раздел «Друзья» — «Мои друзья». Там же видно очки друзей.",
    meta: { friendshipId: row.id, fromId: row.fromId, username: row.fromUsername },
    createdAt: row.createdAt,
  }));
}

async function collectTeacherRequests(userId: number): Promise<Draft[]> {
  const rows = await db
    .select({
      id: teacherStudentsTable.id,
      createdAt: teacherStudentsTable.createdAt,
      teacherId: usersTable.id,
      teacherName: usersTable.name,
    })
    .from(teacherStudentsTable)
    .innerJoin(usersTable, eq(usersTable.id, teacherStudentsTable.teacherId))
    .where(and(
      eq(teacherStudentsTable.studentId, userId),
      eq(teacherStudentsTable.status, "pending"),
    ))
    .orderBy(desc(teacherStudentsTable.createdAt))
    .limit(SOURCE_LIMIT);

  return rows.map((row) => ({
    kind: "teacher_request" as const,
    dedupeKey: `teacher_request:${row.id}`,
    title: "Заявка от учителя",
    body: `${row.teacherName} хочет добавить тебя как ученика`,
    detail: "Принять или отклонить можно в профиле, в блоке «Заявки от учителей».",
    meta: { requestId: row.id, teacherId: row.teacherId },
    createdAt: row.createdAt,
  }));
}

async function collectAssignments(userId: number): Promise<Draft[]> {
  const rows = await db
    .select({
      id: assignedTasksTable.id,
      assignedAt: assignedTasksTable.assignedAt,
      dueAt: assignedTasksTable.dueAt,
      assignmentId: assignmentsTable.id,
      title: assignmentsTable.title,
      points: assignmentsTable.points,
      teacherName: usersTable.name,
    })
    .from(assignedTasksTable)
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, assignedTasksTable.assignmentId))
    .leftJoin(usersTable, eq(usersTable.id, assignedTasksTable.teacherId))
    .where(and(
      eq(assignedTasksTable.studentId, userId),
      // Удаление задания мягкое, а назначение при этом остаётся. Без этого
      // условия ученик получал бы уведомление о задании, которого уже нет ни в
      // одном списке.
      isNull(assignmentsTable.deletedAt),
    ))
    .orderBy(desc(assignedTasksTable.assignedAt))
    .limit(SOURCE_LIMIT);

  return rows.map((row) => ({
    kind: "assignment" as const,
    dedupeKey: `assignment:${row.id}`,
    title: "Новое задание",
    body: row.title,
    detail: row.teacherName
      ? `Задание от учителя ${row.teacherName}. За выполнение: ${row.points} ${plural(row.points, ["очко", "очка", "очков"])}.`
      : `За выполнение: ${row.points} ${plural(row.points, ["очко", "очка", "очков"])}.`,
    // Срок отдаём как есть: формат даты — забота клиента, он знает язык и
    // часовой пояс устройства.
    meta: {
      assignmentId: row.assignmentId,
      assignedTaskId: row.id,
      points: row.points,
      dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    },
    createdAt: row.assignedAt,
  }));
}

async function collectDailyPlan(userId: number): Promise<Draft[]> {
  const progress = await computeDailyProgress(userId);
  if (!progress) return [];

  const plan = buildServerDailyPlan(progress);
  const drafts: Draft[] = [];
  const total = plan.quests.length;
  const done = plan.quests.filter((q) => q.done).length;

  if (plan.time.done) {
    drafts.push({
      kind: "quest",
      dedupeKey: `quest:${plan.dateKey}:time`,
      title: "Цель по времени выполнена",
      body: plan.time.title,
      detail: `Ты позанимался ${plan.time.current} ${plural(plan.time.current, ["минуту", "минуты", "минут"])} при цели в ${plan.time.target}.`,
      meta: { questKind: "time", dateKey: plan.dateKey },
    });
  }

  for (const quest of plan.quests) {
    if (!quest.done) continue;
    const left = total - done;
    drafts.push({
      kind: "quest",
      dedupeKey: `quest:${plan.dateKey}:${quest.kind}`,
      title: "Задача дня выполнена",
      body: quest.title,
      detail: left > 0
        ? `Закрыто задач: ${done} из ${total}. Осталось ${left} — и день засчитан целиком.`
        : `Закрыты все задачи дня: ${done} из ${total}.`,
      meta: { questKind: quest.kind, dateKey: plan.dateKey, done, total },
    });
  }

  if (plan.allDone) {
    drafts.push({
      kind: "goal",
      dedupeKey: `goal:${plan.dateKey}`,
      title: "Цель дня выполнена!",
      body: `Награда: ${plan.reward} ${plural(plan.reward, ["очко", "очка", "очков"])}`,
      detail: "Время и все задачи дня закрыты. Очки начисляются один раз в сутки — забрать их можно на карточке цели дня в профиле.",
      meta: { dateKey: plan.dateKey, reward: plan.reward },
    });
  }

  return drafts;
}

// ── Сборка ──────────────────────────────────────────────────────────────────

/**
 * Досоздаёт недостающие уведомления пользователя.
 *
 * Идемпотентна: повторный вызов ничего не добавляет. Ошибку наружу не бросает —
 * лента не настолько важна, чтобы из-за неё падал экран профиля.
 */
export async function syncNotifications(userId: number): Promise<void> {
  const existing = await db
    .select({ dedupeKey: notificationsTable.dedupeKey })
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId));

  const known = new Set(existing.map((r) => r.dedupeKey));
  // Ни одного уведомления — значит, лента для этого ученика открывается
  // впервые. Тихо пишем только предысторию, не всё подряд (см. шапку файла).
  const firstSync = existing.length === 0;

  const now = Date.now();
  const questsAreDue = firstSync || (now - (lastQuestSync.get(userId) ?? 0)) > QUEST_SYNC_TTL_MS;

  const sources: Promise<Draft[]>[] = [
    collectAchievements(userId),
    collectFriendRequests(userId),
    collectTeacherRequests(userId),
    collectAssignments(userId),
  ];
  if (questsAreDue) {
    rememberQuestSync(userId, now);
    sources.push(collectDailyPlan(userId));
  }

  const collected = await Promise.all(
    sources.map((p) =>
      p.catch((err) => {
        logger.error({ err, userId }, "Источник уведомлений не прочитался");
        return [] as Draft[];
      }),
    ),
  );

  const fresh = collected
    .flat()
    .filter((d) => !known.has(d.dedupeKey))
    // Свежее вперёд: если порция не влезает целиком, отрезать надо хвост
    // истории, а не сегодняшние события.
    .sort((a, b) => (b.createdAt?.getTime() ?? now) - (a.createdAt?.getTime() ?? now))
    .slice(0, MAX_NEW_PER_SYNC);

  if (fresh.length === 0) return;

  const stampedAt = new Date();
  let loudLeft = firstSync ? FIRST_SYNC_LOUD : Number.POSITIVE_INFINITY;

  const rows = fresh.map((d) => {
    const at = d.createdAt ?? stampedAt;
    // Порядок уже «свежее вперёд», поэтому квота на громкие окна достаётся
    // самым новым событиям, а не случайным.
    const old = now - at.getTime() > BACKFILL_AGE_MS;
    const silent = firstSync && (old || loudLeft <= 0);
    if (firstSync && !silent) loudLeft -= 1;

    return {
      userId,
      kind: d.kind,
      dedupeKey: d.dedupeKey,
      title: d.title,
      body: d.body,
      detail: d.detail,
      meta: d.meta ?? {},
      createdAt: at,
      readAt: silent ? stampedAt : null,
      seenAt: silent ? stampedAt : null,
    };
  });

  await db
    .insert(notificationsTable)
    .values(rows)
    // Гонка двух одновременных запросов от одного ученика: оба соберут одно и
    // то же событие, второй просто ничего не вставит.
    .onConflictDoNothing();
}
