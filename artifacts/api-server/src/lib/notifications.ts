// ─────────────────────────────────────────────────────────────────────────────
// Лента уведомлений: сборка событий пользователя.
//
// ── Главное решение: события ВЫВОДЯТСЯ ИЗ СОСТОЯНИЯ ─────────────────────────
// Уведомления не пишутся в момент события. Они собираются при чтении ленты из
// того, что уже лежит в базе: принятые медали, входящие заявки, назначенные
// задания, сданные работы, заявки на время в календаре. Каждое событие
// получает ключ (dedupeKey), уникальный в пределах пользователя, и вставка
// идёт с onConflictDoNothing.
//
// Почему так, а не «отправить уведомление там, где событие происходит»:
//   • эти места живут в разных роутерах, и достаточно забыть про одно, чтобы
//     раздел молча перестал работать;
//   • история появляется сразу: медали и задания, полученные до этой ленты,
//     тоже в ней окажутся;
//   • пересчёт идемпотентен, поэтому его можно звать хоть на каждый запрос.
//
// Плата: у задач дня время уведомления — момент, когда сервер это заметил, а не
// когда галочка реально встала. У остальных событий время берётся из исходной
// строки (unlocked_at, created_at, assigned_at), то есть точное.
//
// ── ЛЕНТА РАЗНАЯ У РАЗНЫХ РОЛЕЙ ─────────────────────────────────────────────
// Сначала источники были общими на всех, и это выходило боком: учителю падали
// «Новая медаль» и «Задача дня выполнена». У него нет ни медалей, ни задач дня
// — эти строки брались из его собственной ученической статистики, которая
// когда-то накопилась, и выглядели как чужие уведомления в своей ленте.
//
// Теперь набор источников выбирается по роли:
//   ученик  — медали, задачи и цель дня, заявки в друзья и от учителей,
//             назначенные задания, выданные диалоги;
//   учитель — сданные работы, пройденные диалоги, заявки на время в календаре,
//             принятые учениками приглашения;
//   родитель — работы своих детей.
// Пересечения нет намеренно: событие «ученик сдал» интересно учителю, а «я
// сдал» ученик и так видит на экране сдачи.
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
  parentChildrenTable,
  assignedTasksTable,
  assignmentsTable,
  submissionsTable,
  calendarSlotsTable,
  slotBookingsTable,
  customBookingRequestsTable,
  dialogScenariosTable,
  dialogAssignmentsTable,
  dialogAttemptsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { buildServerDailyPlan } from "./dailyPlan";
import { computeDailyProgress } from "./dailyProgress";
import { logger } from "./logger";

/**
 * Вид события. Определяет значок и цвет на клиенте
 * (english-learning/utils/notificationLook.ts) — новый вид нужно завести и там,
 * иначе он нарисуется запасной звёздочкой.
 */
export type NotificationKind =
  | "quest"
  | "goal"
  | "achievement"
  | "friend_request"
  | "teacher_request"
  | "assignment"
  // ── события учителя и родителя ──
  | "submission"
  | "booking"
  | "student_joined";

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
 * Остальные источники — короткие запросы, их проверяем каждый раз.
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

/** Дата человеку: «5 августа, 15:00». Часовой пояс сервера, но день верный. */
const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** «2026-08-15» → «15 августа». Дата в календаре хранится строкой. */
function humanDate(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  if (!y || !m || !d) return isoDay;
  return `${d} ${MONTHS[m - 1] ?? ""}`.trim();
}

// ── Источники: УЧЕНИК ───────────────────────────────────────────────────────

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

/**
 * Ситуации для разговора, выданные ученику.
 *
 * Отдельный источник, но тот же вид уведомления, что у обычного задания
 * (kind: assignment): для ученика это одно и то же — учитель что-то задал.
 *
 * Ключ идёт по строке ВЫДАЧИ, а не по ситуации: снял и выдал заново — это новое
 * событие, и ученик должен о нём узнать.
 */
async function collectScenarios(userId: number): Promise<Draft[]> {
  const rows = await db
    .select({
      id: dialogAssignmentsTable.id,
      createdAt: dialogAssignmentsTable.createdAt,
      scenarioId: dialogScenariosTable.id,
      title: dialogScenariosTable.title,
      goal: dialogScenariosTable.goal,
      teacherName: usersTable.name,
    })
    .from(dialogAssignmentsTable)
    .innerJoin(dialogScenariosTable, eq(dialogScenariosTable.id, dialogAssignmentsTable.scenarioId))
    .leftJoin(usersTable, eq(usersTable.id, dialogScenariosTable.teacherId))
    .where(and(
      eq(dialogAssignmentsTable.studentId, userId),
      // Снятую с выдачи ситуацию начать нельзя, значит и уведомлять о ней не о
      // чем.
      eq(dialogScenariosTable.archived, false),
    ))
    .orderBy(desc(dialogAssignmentsTable.createdAt))
    .limit(SOURCE_LIMIT);

  return rows.map((row) => ({
    kind: "assignment" as const,
    dedupeKey: `scenario:${row.id}`,
    title: "Новый диалог от учителя",
    body: row.title,
    detail: [
      row.teacherName ? `Разговор с ролью от учителя ${row.teacherName}.` : "Разговор с ролью от учителя.",
      row.goal ? `Цель: ${row.goal}.` : "",
      "Открыть можно в «Учёбе»: «Разговор со Снежей», блок «Задания учителя».",
    ].filter(Boolean).join(" "),
    meta: { scenarioId: row.scenarioId, dialogAssignmentId: row.id },
    createdAt: row.createdAt,
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

// ── Источники: УЧИТЕЛЬ ──────────────────────────────────────────────────────

/**
 * Ученик сдал работу.
 *
 * Главное событие учителя: раньше он узнавал о сдаче, только если сам открывал
 * вкладку и пересчитывал карточки глазами.
 *
 * Условие `submittedAt > assignedAt` — то же, что в списке заданий: сдача до
 * повторной выдачи не считается ответом на текущее назначение.
 *
 * Автозакрытые по сроку работы (status = expired) сюда тоже попадают, но с
 * другим заголовком: «не сдал в срок» — это событие, а не результат.
 */
async function collectTeacherSubmissions(teacherId: number): Promise<Draft[]> {
  const rows = await db
    .select({
      id: submissionsTable.id,
      status: submissionsTable.status,
      score: submissionsTable.score,
      submittedAt: submissionsTable.submittedAt,
      assignmentId: assignmentsTable.id,
      title: assignmentsTable.title,
      type: assignmentsTable.type,
      studentId: submissionsTable.studentId,
      studentName: usersTable.name,
    })
    .from(submissionsTable)
    .innerJoin(assignedTasksTable, and(
      eq(assignedTasksTable.assignmentId, submissionsTable.assignmentId),
      eq(assignedTasksTable.studentId, submissionsTable.studentId),
    ))
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, submissionsTable.assignmentId))
    .leftJoin(usersTable, eq(usersTable.id, submissionsTable.studentId))
    .where(and(
      eq(assignedTasksTable.teacherId, teacherId),
      gt(submissionsTable.submittedAt, assignedTasksTable.assignedAt),
      isNull(assignmentsTable.deletedAt),
    ))
    .orderBy(desc(submissionsTable.submittedAt))
    .limit(SOURCE_LIMIT);

  return rows.map((row) => {
    const who = row.studentName ?? "Ученик";
    if (row.status === "expired") {
      return {
        kind: "submission" as const,
        dedupeKey: `submission:${row.id}`,
        title: "Задание не сдано в срок",
        body: `${who}: ${row.title}`,
        detail: "Срок вышел, работа закрылась сама. Можно сдвинуть срок в итогах задания и дать ещё попытку.",
        meta: { submissionId: row.id, assignmentId: row.assignmentId, studentId: row.studentId },
        createdAt: row.submittedAt,
      };
    }
    if (row.status === "pending") {
      return {
        kind: "submission" as const,
        dedupeKey: `submission:${row.id}`,
        title: "Работа ждёт проверки",
        body: `${who}: ${row.title}`,
        detail: "Свободный ответ проверяется вручную. Открыть и оценить можно в «Заданиях», вкладка «Ответы учеников».",
        meta: { submissionId: row.id, assignmentId: row.assignmentId, studentId: row.studentId },
        createdAt: row.submittedAt,
      };
    }
    return {
      kind: "submission" as const,
      dedupeKey: `submission:${row.id}`,
      title: "Ученик выполнил задание",
      body: `${who}: ${row.title}`,
      detail: `Результат: ${row.score ?? 0}%. Разбор ответов — в итогах задания.`,
      meta: {
        submissionId: row.id,
        assignmentId: row.assignmentId,
        studentId: row.studentId,
        score: row.score ?? 0,
      },
      createdAt: row.submittedAt,
    };
  });
}

/**
 * Пройденные диалоги — тоже событие учителя.
 *
 * Берём и «прошёл», и «вышел на середине»: незаконченный разговор учителю важен
 * не меньше, это и есть сигнал, что задание не пошло.
 */
async function collectScenarioReviews(teacherId: number): Promise<Draft[]> {
  const rows = await db
    .select({
      id: dialogAttemptsTable.id,
      status: dialogAttemptsTable.status,
      turns: dialogAttemptsTable.turns,
      mistakes: dialogAttemptsTable.mistakes,
      startedAt: dialogAttemptsTable.startedAt,
      finishedAt: dialogAttemptsTable.finishedAt,
      scenarioId: dialogScenariosTable.id,
      title: dialogScenariosTable.title,
      studentId: dialogAttemptsTable.studentId,
      studentName: usersTable.name,
    })
    .from(dialogAttemptsTable)
    .innerJoin(dialogScenariosTable, eq(dialogScenariosTable.id, dialogAttemptsTable.scenarioId))
    .leftJoin(usersTable, eq(usersTable.id, dialogAttemptsTable.studentId))
    .where(and(
      eq(dialogScenariosTable.teacherId, teacherId),
      ne(dialogAttemptsTable.status, "active"),
    ))
    .orderBy(desc(dialogAttemptsTable.startedAt))
    .limit(SOURCE_LIMIT);

  return rows.map((row) => ({
    kind: "submission" as const,
    dedupeKey: `scenario_review:${row.id}`,
    title: row.status === "done" ? "Диалог пройден" : "Диалог прерван",
    body: `${row.studentName ?? "Ученик"}: ${row.title}`,
    detail: [
      `Реплик: ${row.turns}. Ошибок: ${row.mistakes}.`,
      row.status === "done" ? "" : "Ученик вышел, не закончив задание.",
      "Весь диалог с разбором — в «Заданиях», вкладка «Ответы учеников».",
    ].filter(Boolean).join(" "),
    meta: { attemptId: row.id, scenarioId: row.scenarioId, studentId: row.studentId },
    createdAt: row.finishedAt ?? row.startedAt,
  }));
}

/**
 * Календарь: ученик записался на занятие или предложил своё время.
 *
 * Два источника в одном: запись на выставленный слот и запрос произвольного
 * времени. Для учителя это одно и то же дело — ответить да или нет, — поэтому
 * и вид уведомления один.
 */
async function collectTeacherBookings(teacherId: number): Promise<Draft[]> {
  const drafts: Draft[] = [];

  // Запись на слот, который учитель сам выставил.
  const booked = await db
    .select({
      id: slotBookingsTable.id,
      status: slotBookingsTable.status,
      note: slotBookingsTable.note,
      createdAt: slotBookingsTable.createdAt,
      date: calendarSlotsTable.date,
      startTime: calendarSlotsTable.startTime,
      endTime: calendarSlotsTable.endTime,
      studentId: slotBookingsTable.studentId,
      studentName: usersTable.name,
    })
    .from(slotBookingsTable)
    .innerJoin(calendarSlotsTable, eq(calendarSlotsTable.id, slotBookingsTable.slotId))
    .leftJoin(usersTable, eq(usersTable.id, slotBookingsTable.studentId))
    .where(eq(calendarSlotsTable.teacherId, teacherId))
    .orderBy(desc(slotBookingsTable.createdAt))
    .limit(SOURCE_LIMIT);

  for (const row of booked) {
    drafts.push({
      kind: "booking",
      dedupeKey: `slot_booking:${row.id}`,
      title: "Запись на занятие",
      body: `${row.studentName ?? "Ученик"}: ${humanDate(row.date)}, ${row.startTime}`,
      detail: [
        `Занятие ${humanDate(row.date)} с ${row.startTime} до ${row.endTime}.`,
        row.note ? `Комментарий: ${row.note}` : "",
        row.status === "pending" ? "Подтвердить или отклонить можно в «Календаре»." : "",
      ].filter(Boolean).join(" "),
      meta: { bookingId: row.id, studentId: row.studentId, date: row.date, startTime: row.startTime },
      createdAt: row.createdAt,
    });
  }

  // Своё время: ученик предложил час, которого в расписании не было.
  const proposed = await db
    .select({
      id: customBookingRequestsTable.id,
      status: customBookingRequestsTable.status,
      note: customBookingRequestsTable.note,
      createdAt: customBookingRequestsTable.createdAt,
      date: customBookingRequestsTable.date,
      startTime: customBookingRequestsTable.startTime,
      endTime: customBookingRequestsTable.endTime,
      studentId: customBookingRequestsTable.studentId,
      studentName: usersTable.name,
    })
    .from(customBookingRequestsTable)
    .leftJoin(usersTable, eq(usersTable.id, customBookingRequestsTable.studentId))
    .where(eq(customBookingRequestsTable.teacherId, teacherId))
    .orderBy(desc(customBookingRequestsTable.createdAt))
    .limit(SOURCE_LIMIT);

  for (const row of proposed) {
    drafts.push({
      kind: "booking",
      dedupeKey: `custom_booking:${row.id}`,
      title: "Ученик предложил своё время",
      body: `${row.studentName ?? "Ученик"}: ${humanDate(row.date)}, ${row.startTime}`,
      detail: [
        `Предложено ${humanDate(row.date)} с ${row.startTime} до ${row.endTime}.`,
        row.note ? `Комментарий: ${row.note}` : "",
        row.status === "pending" ? "Ответить можно в «Календаре»." : "",
      ].filter(Boolean).join(" "),
      meta: { requestId: row.id, studentId: row.studentId, date: row.date, startTime: row.startTime },
      createdAt: row.createdAt,
    });
  }

  return drafts;
}

/** Ученик принял приглашение учителя: связь стала рабочей. */
async function collectAcceptedStudents(teacherId: number): Promise<Draft[]> {
  const rows = await db
    .select({
      id: teacherStudentsTable.id,
      createdAt: teacherStudentsTable.createdAt,
      studentId: usersTable.id,
      studentName: usersTable.name,
      username: usersTable.username,
    })
    .from(teacherStudentsTable)
    .innerJoin(usersTable, eq(usersTable.id, teacherStudentsTable.studentId))
    .where(and(
      eq(teacherStudentsTable.teacherId, teacherId),
      eq(teacherStudentsTable.status, "accepted"),
    ))
    .orderBy(desc(teacherStudentsTable.createdAt))
    .limit(SOURCE_LIMIT);

  return rows.map((row) => ({
    kind: "student_joined" as const,
    dedupeKey: `student_joined:${row.id}`,
    title: "Ученик принял заявку",
    body: row.studentName ?? row.username,
    detail: "Теперь ему можно назначать задания, колоды и диалоги, а его успеваемость видна во вкладке «Анализ».",
    meta: { studentId: row.studentId, username: row.username },
    createdAt: row.createdAt,
  }));
}

// ── Источники: РОДИТЕЛЬ ─────────────────────────────────────────────────────

/** Работы своих детей. Ровно то же событие, что у учителя, но по своим детям. */
async function collectChildSubmissions(parentId: number): Promise<Draft[]> {
  const links = await db
    .select({ studentId: parentChildrenTable.studentId })
    .from(parentChildrenTable)
    .where(eq(parentChildrenTable.parentId, parentId));

  const ids = links.map((l) => l.studentId);
  if (ids.length === 0) return [];

  const rows = await db
    .select({
      id: submissionsTable.id,
      status: submissionsTable.status,
      score: submissionsTable.score,
      submittedAt: submissionsTable.submittedAt,
      assignmentId: assignmentsTable.id,
      title: assignmentsTable.title,
      studentId: submissionsTable.studentId,
      studentName: usersTable.name,
    })
    .from(submissionsTable)
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, submissionsTable.assignmentId))
    .leftJoin(usersTable, eq(usersTable.id, submissionsTable.studentId))
    .where(and(
      inArray(submissionsTable.studentId, ids),
      isNull(assignmentsTable.deletedAt),
    ))
    .orderBy(desc(submissionsTable.submittedAt))
    .limit(SOURCE_LIMIT);

  return rows.map((row) => ({
    kind: "submission" as const,
    dedupeKey: `submission:${row.id}`,
    title: row.status === "expired" ? "Задание не сдано в срок" : "Задание выполнено",
    body: `${row.studentName ?? "Ребёнок"}: ${row.title}`,
    detail: row.status === "expired"
      ? "Срок вышел, работа закрылась сама."
      : row.status === "pending"
        ? "Учитель ещё не проверил работу."
        : `Результат: ${row.score ?? 0}%.`,
    meta: { submissionId: row.id, assignmentId: row.assignmentId, studentId: row.studentId },
    createdAt: row.submittedAt,
  }));
}

// ── Сборка ──────────────────────────────────────────────────────────────────

/**
 * Досоздаёт недостающие уведомления пользователя.
 *
 * Идемпотентна: повторный вызов ничего не добавляет. Ошибку наружу не бросает —
 * лента не настолько важна, чтобы из-за неё падал экран профиля.
 */
export async function syncNotifications(userId: number): Promise<void> {
  const [account] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  const role = account?.role ?? "student";
  const isTeacher = role === "teacher" || role === "admin";
  const isParent = role === "parent";
  const isStudent = !isTeacher && !isParent;

  const existing = await db
    .select({ dedupeKey: notificationsTable.dedupeKey })
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId));

  const known = new Set(existing.map((r) => r.dedupeKey));
  // Ни одного уведомления — значит, лента для этого пользователя открывается
  // впервые. Тихо пишем только предысторию, не всё подряд (см. шапку файла).
  const firstSync = existing.length === 0;

  const now = Date.now();
  const sources: Promise<Draft[]>[] = [];

  if (isStudent) {
    sources.push(
      collectAchievements(userId),
      collectFriendRequests(userId),
      collectTeacherRequests(userId),
      collectAssignments(userId),
      collectScenarios(userId),
    );
    // Задачи дня — самый дорогой источник, и только у ученика.
    const questsAreDue = firstSync || (now - (lastQuestSync.get(userId) ?? 0)) > QUEST_SYNC_TTL_MS;
    if (questsAreDue) {
      rememberQuestSync(userId, now);
      sources.push(collectDailyPlan(userId));
    }
  }

  if (isTeacher) {
    sources.push(
      collectTeacherSubmissions(userId),
      collectScenarioReviews(userId),
      collectTeacherBookings(userId),
      collectAcceptedStudents(userId),
    );
  }

  if (isParent) {
    sources.push(collectChildSubmissions(userId));
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
    // Гонка двух одновременных запросов от одного пользователя: оба соберут
    // одно и то же событие, второй просто ничего не вставит.
    .onConflictDoNothing();
}

/**
 * Убрать из ленты события, которых этой роли быть не должно.
 *
 * Нужно ОДИН раз: у учителей уже накопились медали и задачи дня, записанные
 * прежней общей сборкой. Новые источники их больше не создают, но старые строки
 * сами не исчезнут, и учитель продолжал бы видеть «Новая медаль» в истории.
 *
 * Дешевле, чем миграция: один DELETE по своему же пользователю, и он ничего не
 * находит на второй раз.
 */
export async function dropForeignKinds(userId: number, role: string): Promise<void> {
  const studentOnly: NotificationKind[] = ["quest", "goal", "achievement", "friend_request", "teacher_request"];
  const isStudent = role !== "teacher" && role !== "admin" && role !== "parent";
  if (isStudent) return;

  await db
    .delete(notificationsTable)
    .where(and(
      eq(notificationsTable.userId, userId),
      inArray(notificationsTable.kind, studentOnly),
    ));
}
