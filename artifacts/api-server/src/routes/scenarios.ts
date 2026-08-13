// ─────────────────────────────────────────────────────────────────────────────
// Ситуации от учителя: создание, выдача, прохождение, разбор.
//
// Учитель:
//   GET    /scenarios                     — мои ситуации со счётчиками
//   GET    /scenarios/students            — мои ученики (кому можно выдать)
//   POST   /scenarios                     — создать
//   PATCH  /scenarios/:id                 — правка и архив
//   POST   /scenarios/:id/assign          — выдать (списком или всем сразу)
//   DELETE /scenarios/:id/assign/:student — снять выдачу
//   GET    /scenarios/:id                 — ситуация, кому выдана, попытки
//   GET    /scenario-attempts             — все разборы, свежие сверху
//
// Ученик:
//   GET    /scenarios/mine                — выданные мне ситуации
//   POST   /scenarios/:id/start           — начать (или продолжить) попытку
//   POST   /scenario-attempts/:id/reply   — реплика: разбор и ответ роли
//   POST   /scenario-attempts/:id/finish  — закончить досрочно
//
// Оба:
//   GET    /scenario-attempts/:id         — весь диалог с ошибками
//
// ── ПОРЯДОК МАРШРУТОВ ЗНАЧИМ ────────────────────────────────────────────────
// /scenarios/mine и /scenarios/students объявлены ВЫШЕ /scenarios/:id. Express
// берёт первый подошедший, и при обратном порядке «mine» уехало бы в :id как
// номер, дав 404 на самом нужном ученику запросе.
//
// ── Права ───────────────────────────────────────────────────────────────────
// Создавать и смотреть разборы может учитель (и админ). Выдать ситуацию можно
// только СВОЕМУ ученику: проверяем через canViewStudent — ту же функцию, что
// охраняет статистику. Ученик видит только выданное ему и только свои попытки.
//
// ── Условие завершения не настраивается ─────────────────────────────────────
// Число реплик НЕОБЯЗАТЕЛЬНО: turnsTarget = 0 означает «учитель не ограничивал».
// Что закрывает задание, выводится из самого задания (см. isAttemptComplete в
// lib/scenarioChat.ts), а finishMode остаётся в базе только как подпись для
// старых записей и списков.
//
// ── Очки ────────────────────────────────────────────────────────────────────
// За закрытую ситуацию ученик получает SCENARIO_POINTS один раз на попытку. В
// дневной потолок свободных разговоров это НЕ входит: там своя механика и свои
// медали, а задание от учителя не должно ни съедать её потолок, ни закрывать
// медали за болтовню со Снежей.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  teacherStudentsTable,
  dialogScenariosTable,
  dialogAssignmentsTable,
  dialogAttemptsTable,
  dialogTurnsTable,
} from "@workspace/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth, getUser, isTeacher } from "../lib/auth";
import { canViewStudent } from "../lib/flashcardsCore";
import { chat, hasAnyAi, transcribe } from "../lib/ai";
import {
  LEVEL_HINT,
  MIN_TURNS_FOR_GOAL,
  isAttemptComplete,
  parseScenarioVerdict,
  scenarioSystemPrompt,
  summarySystemPrompt,
  type Strictness,
} from "../lib/scenarioChat";

const router = Router();

/** Очки за закрытую ситуацию. Разово на попытку. */
const SCENARIO_POINTS = 15;

/** Границы значений, которые задаёт учитель. */
const MIN_TURNS = 4;
const MAX_TURNS = 100;
const MAX_TITLE = 80;
const MAX_TEXT = 600;
const MAX_CRITERIA = 10;
/** Реплика длиннее — вставленный текст, а не фраза ребёнка. */
const MAX_REPLY_LEN = 500;
/** Сколько реплик отдаём модели: дальше вход дорожает, а смысла не добавляет. */
const HISTORY_LIMIT = 24;
/** Запись крупнее — это уже файл, а не реплика. */
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MIN_AUDIO_BYTES = 1200;

type ScenarioRow = typeof dialogScenariosTable.$inferSelect;

/** Строка ситуации для клиента: без внутренних полей. */
function viewScenario(s: ScenarioRow) {
  return {
    id: s.id,
    title: s.title,
    situation: s.situation,
    role: s.role,
    goal: s.goal,
    finishMode: s.finishMode,
    turnsTarget: s.turnsTarget,
    criteria: s.criteria ?? [],
    strictness: s.strictness,
    level: s.level,
    opener: s.opener,
    archived: s.archived,
    createdAt: s.createdAt.toISOString(),
  };
}

function readStrictness(value: unknown): Strictness {
  return value === "gentle" || value === "strict" ? value : "normal";
}

/**
 * Число реплик. НОЛЬ — учитель не ограничивал.
 *
 * Пустое поле, ноль и мусор дают 0, а не подставленные двадцать: подставленное
 * условие завершения — это условие, о котором учитель не знает, и именно оно
 * мешало закрывать задание по достигнутой цели.
 */
function readTurns(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(MIN_TURNS, Math.min(MAX_TURNS, Math.round(n)));
}

/** Подпись условия завершения. Выводится из задания, отдельно не настраивается. */
function finishModeFor(goal: string | null, turnsTarget: number): string {
  if (goal) return turnsTarget > 0 ? "both" : "goal";
  return "turns";
}

function readText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function readCriteria(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim().slice(0, 200) : ""))
    .filter(Boolean)
    .slice(0, MAX_CRITERIA);
}

/** Ученики учителя: связь принята. Из них выбирается, кому выдать ситуацию. */
async function myStudents(teacherId: number): Promise<number[]> {
  const rows = await db
    .select({ studentId: teacherStudentsTable.studentId })
    .from(teacherStudentsTable)
    .where(and(
      eq(teacherStudentsTable.teacherId, teacherId),
      eq(teacherStudentsTable.status, "accepted"),
    ));
  return rows.map((r) => r.studentId);
}

// ── Учитель: список своих ситуаций ──────────────────────────────────────────
router.get("/scenarios", requireAuth, async (req, res) => {
  const user = getUser(req);
  if (!isTeacher(user.role)) {
    res.status(403).json({ error: "Ситуации создаёт учитель" });
    return;
  }

  const rows = await db
    .select()
    .from(dialogScenariosTable)
    .where(eq(dialogScenariosTable.teacherId, user.userId))
    .orderBy(desc(dialogScenariosTable.createdAt));

  const ids = rows.map((r) => r.id);
  const counts = new Map<number, { assigned: number; attempts: number; fresh: number }>();

  if (ids.length > 0) {
    const assigned = await db
      .select({ scenarioId: dialogAssignmentsTable.scenarioId, n: sql<number>`count(*)::int` })
      .from(dialogAssignmentsTable)
      .where(inArray(dialogAssignmentsTable.scenarioId, ids))
      .groupBy(dialogAssignmentsTable.scenarioId);

    // Свежие разборы: закрытые попытки, которые учитель ещё не открывал.
    const attempts = await db
      .select({
        scenarioId: dialogAttemptsTable.scenarioId,
        n: sql<number>`count(*)::int`,
        fresh: sql<number>`count(*) filter (where ${dialogAttemptsTable.status} <> 'active' and ${dialogAttemptsTable.seenAt} is null)::int`,
      })
      .from(dialogAttemptsTable)
      .where(inArray(dialogAttemptsTable.scenarioId, ids))
      .groupBy(dialogAttemptsTable.scenarioId);

    for (const id of ids) counts.set(id, { assigned: 0, attempts: 0, fresh: 0 });
    for (const a of assigned) {
      const cur = counts.get(a.scenarioId);
      if (cur) cur.assigned = Number(a.n ?? 0);
    }
    for (const a of attempts) {
      const cur = counts.get(a.scenarioId);
      if (cur) {
        cur.attempts = Number(a.n ?? 0);
        cur.fresh = Number(a.fresh ?? 0);
      }
    }
  }

  res.json(rows.map((r) => ({
    ...viewScenario(r),
    ...(counts.get(r.id) ?? { assigned: 0, attempts: 0, fresh: 0 }),
  })));
});

// ── Учитель: кому можно выдать ──────────────────────────────────────────────
//
// ВЫШЕ /scenarios/:id намеренно — см. шапку файла.
router.get("/scenarios/students", requireAuth, async (req, res) => {
  const user = getUser(req);
  if (!isTeacher(user.role)) {
    res.status(403).json({ error: "Только для учителя" });
    return;
  }

  const ids = await myStudents(user.userId);
  if (ids.length === 0) {
    res.json([]);
    return;
  }

  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      avatarEmoji: usersTable.avatarEmoji,
      avatarColor: usersTable.avatarColor,
      knowledgeLevel: usersTable.knowledgeLevel,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, ids))
    .orderBy(asc(usersTable.name));

  res.json(rows);
});

// ── Ученик: выданные мне ситуации ───────────────────────────────────────────
router.get("/scenarios/mine", requireAuth, async (req, res) => {
  const user = getUser(req);

  const rows = await db
    .select({
      scenario: dialogScenariosTable,
      teacherName: usersTable.name,
    })
    .from(dialogAssignmentsTable)
    .innerJoin(dialogScenariosTable, eq(dialogScenariosTable.id, dialogAssignmentsTable.scenarioId))
    .leftJoin(usersTable, eq(usersTable.id, dialogScenariosTable.teacherId))
    .where(and(
      eq(dialogAssignmentsTable.studentId, user.userId),
      eq(dialogScenariosTable.archived, false),
    ))
    .orderBy(desc(dialogScenariosTable.createdAt));

  const ids = rows.map((r) => r.scenario.id);
  const attempts = ids.length > 0
    ? await db
      .select()
      .from(dialogAttemptsTable)
      .where(and(
        eq(dialogAttemptsTable.studentId, user.userId),
        inArray(dialogAttemptsTable.scenarioId, ids),
      ))
      .orderBy(desc(dialogAttemptsTable.startedAt))
    : [];

  // Последняя попытка по каждой ситуации: по ней клиент решает, что писать на
  // кнопке — «Начать», «Продолжить» или «Пройдено».
  const last = new Map<number, typeof attempts[number]>();
  for (const a of attempts) if (!last.has(a.scenarioId)) last.set(a.scenarioId, a);

  res.json(rows.map((r) => {
    const attempt = last.get(r.scenario.id);
    return {
      ...viewScenario(r.scenario),
      teacherName: r.teacherName ?? null,
      attempt: attempt
        ? {
          id: attempt.id,
          status: attempt.status,
          turns: attempt.turns,
          mistakes: attempt.mistakes,
          goalReached: attempt.goalReached,
          startedAt: attempt.startedAt.toISOString(),
          finishedAt: attempt.finishedAt?.toISOString() ?? null,
        }
        : null,
      /** Сколько раз ученик уже проходил эту ситуацию. */
      done: attempts.filter((a) => a.scenarioId === r.scenario.id && a.status !== "active").length,
    };
  }));
});

// ── Учитель: создать ситуацию ───────────────────────────────────────────────
router.post("/scenarios", requireAuth, async (req, res) => {
  const user = getUser(req);
  if (!isTeacher(user.role)) {
    res.status(403).json({ error: "Ситуации создаёт учитель" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const title = readText(body["title"], MAX_TITLE);
  const situation = readText(body["situation"], MAX_TEXT);
  const role = readText(body["role"], 200);
  const goal = readText(body["goal"], MAX_TEXT);
  const turnsTarget = readTurns(body["turnsTarget"]);

  if (!title) {
    res.status(400).json({ error: "Нужно название ситуации" });
    return;
  }
  if (!situation) {
    res.status(400).json({ error: "Опишите ситуацию: где происходит разговор" });
    return;
  }
  if (!role) {
    res.status(400).json({ error: "Укажите, кем будет Снежа в этом разговоре" });
    return;
  }
  // Без цели и без числа реплик задание нечем закрыть: ученик говорил бы
  // бесконечно и заканчивал разговор кнопкой, а разбор приходил бы с пометкой
  // «вышел на середине».
  if (!goal && turnsTarget === 0) {
    res.status(400).json({ error: "Задайте цель или число реплик: иначе задание нечем закончить" });
    return;
  }

  const [row] = await db
    .insert(dialogScenariosTable)
    .values({
      teacherId: user.userId,
      title,
      situation,
      role,
      goal: goal || null,
      finishMode: finishModeFor(goal || null, turnsTarget),
      turnsTarget,
      criteria: readCriteria(body["criteria"]),
      strictness: readStrictness(body["strictness"]),
      level: readText(body["level"], 20) || null,
      opener: readText(body["opener"], 300) || null,
    })
    .returning();

  // Сразу выдаём, если прислали кому: обычный порядок работы учителя —
  // «создал и отправил», два запроса ради этого не нужны.
  const all = body["assignAll"] === true;
  const listed = Array.isArray(body["studentIds"])
    ? (body["studentIds"] as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : [];
  const targets = all ? await myStudents(user.userId) : listed;

  const assigned: number[] = [];
  for (const studentId of targets.slice(0, 200)) {
    if (!(await canViewStudent(user, studentId))) continue;
    await db
      .insert(dialogAssignmentsTable)
      .values({ scenarioId: row!.id, studentId, assignedBy: user.userId })
      .onConflictDoNothing();
    assigned.push(studentId);
  }

  res.status(201).json({ ...viewScenario(row!), assignedTo: assigned });
});

// ── Учитель: ситуация целиком ───────────────────────────────────────────────
router.get("/scenarios/:id", requireAuth, async (req, res) => {
  const user = getUser(req);
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Некорректный номер ситуации" });
    return;
  }

  const [scenario] = await db.select().from(dialogScenariosTable).where(eq(dialogScenariosTable.id, id));
  if (!scenario) {
    res.status(404).json({ error: "Ситуация не найдена" });
    return;
  }
  if (scenario.teacherId !== user.userId && user.role !== "admin") {
    res.status(403).json({ error: "Это чужая ситуация" });
    return;
  }

  const students = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      avatarEmoji: usersTable.avatarEmoji,
      avatarColor: usersTable.avatarColor,
    })
    .from(dialogAssignmentsTable)
    .innerJoin(usersTable, eq(usersTable.id, dialogAssignmentsTable.studentId))
    .where(eq(dialogAssignmentsTable.scenarioId, id));

  const attempts = await db
    .select({
      id: dialogAttemptsTable.id,
      studentId: dialogAttemptsTable.studentId,
      studentName: usersTable.name,
      status: dialogAttemptsTable.status,
      turns: dialogAttemptsTable.turns,
      mistakes: dialogAttemptsTable.mistakes,
      goalReached: dialogAttemptsTable.goalReached,
      startedAt: dialogAttemptsTable.startedAt,
      finishedAt: dialogAttemptsTable.finishedAt,
      seenAt: dialogAttemptsTable.seenAt,
    })
    .from(dialogAttemptsTable)
    .leftJoin(usersTable, eq(usersTable.id, dialogAttemptsTable.studentId))
    .where(eq(dialogAttemptsTable.scenarioId, id))
    .orderBy(desc(dialogAttemptsTable.startedAt));

  res.json({
    scenario: viewScenario(scenario),
    students,
    attempts: attempts.map((a) => ({
      ...a,
      startedAt: a.startedAt.toISOString(),
      finishedAt: a.finishedAt?.toISOString() ?? null,
      seenAt: a.seenAt?.toISOString() ?? null,
      fresh: a.status !== "active" && !a.seenAt,
    })),
  });
});

// ── Учитель: правка и архив ─────────────────────────────────────────────────
router.patch("/scenarios/:id", requireAuth, async (req, res) => {
  const user = getUser(req);
  const id = Number(req.params["id"]);
  const [scenario] = await db.select().from(dialogScenariosTable).where(eq(dialogScenariosTable.id, id));
  if (!scenario) {
    res.status(404).json({ error: "Ситуация не найдена" });
    return;
  }
  if (scenario.teacherId !== user.userId && user.role !== "admin") {
    res.status(403).json({ error: "Это чужая ситуация" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const patch: Partial<typeof dialogScenariosTable.$inferInsert> = { updatedAt: new Date() };

  if (body["title"] !== undefined) patch.title = readText(body["title"], MAX_TITLE) || scenario.title;
  if (body["situation"] !== undefined) patch.situation = readText(body["situation"], MAX_TEXT) || scenario.situation;
  if (body["role"] !== undefined) patch.role = readText(body["role"], 200) || scenario.role;
  if (body["goal"] !== undefined) patch.goal = readText(body["goal"], MAX_TEXT) || null;
  if (body["criteria"] !== undefined) patch.criteria = readCriteria(body["criteria"]);
  if (body["strictness"] !== undefined) patch.strictness = readStrictness(body["strictness"]);
  if (body["level"] !== undefined) patch.level = readText(body["level"], 20) || null;
  if (body["opener"] !== undefined) patch.opener = readText(body["opener"], 300) || null;
  if (body["archived"] !== undefined) patch.archived = body["archived"] === true;
  if (body["turnsTarget"] !== undefined) patch.turnsTarget = readTurns(body["turnsTarget"]);

  // Условие завершения пересчитываем сами: правка цели или числа реплик меняет
  // и его, а держать это в руках учителя мы больше не хотим.
  const nextGoal = patch.goal !== undefined ? patch.goal : scenario.goal;
  const nextTurns = patch.turnsTarget !== undefined ? patch.turnsTarget : scenario.turnsTarget;
  if (!nextGoal && nextTurns === 0) {
    res.status(400).json({ error: "Оставьте цель или число реплик: иначе задание нечем закончить" });
    return;
  }
  patch.finishMode = finishModeFor(nextGoal ?? null, nextTurns);

  const [row] = await db
    .update(dialogScenariosTable)
    .set(patch)
    .where(eq(dialogScenariosTable.id, id))
    .returning();

  res.json(viewScenario(row!));
});

// ── Учитель: выдать и снять ─────────────────────────────────────────────────
//
// assignAll — «всем моим ученикам»: на телефоне это главный сценарий, а список
// с галочками нужен, когда ситуация адресная.
router.post("/scenarios/:id/assign", requireAuth, async (req, res) => {
  const user = getUser(req);
  const id = Number(req.params["id"]);
  const [scenario] = await db.select().from(dialogScenariosTable).where(eq(dialogScenariosTable.id, id));
  if (!scenario) {
    res.status(404).json({ error: "Ситуация не найдена" });
    return;
  }
  if (scenario.teacherId !== user.userId && user.role !== "admin") {
    res.status(403).json({ error: "Это чужая ситуация" });
    return;
  }

  const body = req.body as { studentIds?: unknown; studentId?: unknown; assignAll?: unknown };
  const listed = Array.isArray(body.studentIds) ? body.studentIds : [body.studentId];
  const ids = body.assignAll === true
    ? await myStudents(user.userId)
    : listed.map(Number).filter((n) => Number.isInteger(n) && n > 0);

  if (ids.length === 0) {
    res.status(400).json({ error: "Не выбран ни один ученик" });
    return;
  }

  const assigned: number[] = [];
  const rejected: number[] = [];
  for (const studentId of ids.slice(0, 200)) {
    // Выдать можно только своему ученику: та же проверка, что у статистики.
    if (!(await canViewStudent(user, studentId))) {
      rejected.push(studentId);
      continue;
    }
    await db
      .insert(dialogAssignmentsTable)
      .values({ scenarioId: id, studentId, assignedBy: user.userId })
      .onConflictDoNothing();
    assigned.push(studentId);
  }

  res.json({ assigned, rejected });
});

router.delete("/scenarios/:id/assign/:studentId", requireAuth, async (req, res) => {
  const user = getUser(req);
  const id = Number(req.params["id"]);
  const studentId = Number(req.params["studentId"]);
  const [scenario] = await db.select().from(dialogScenariosTable).where(eq(dialogScenariosTable.id, id));
  if (!scenario) {
    res.status(404).json({ error: "Ситуация не найдена" });
    return;
  }
  if (scenario.teacherId !== user.userId && user.role !== "admin") {
    res.status(403).json({ error: "Это чужая ситуация" });
    return;
  }

  await db
    .delete(dialogAssignmentsTable)
    .where(and(
      eq(dialogAssignmentsTable.scenarioId, id),
      eq(dialogAssignmentsTable.studentId, studentId),
    ));
  res.status(204).end();
});

// ── Ученик: начать или продолжить ───────────────────────────────────────────
//
// Активная попытка ВОЗВРАЩАЕТСЯ, а не создаётся вторая: иначе выход с экрана
// плодил бы брошенные диалоги, а учитель получал бы по пять отчётов из одной
// фразы.
router.post("/scenarios/:id/start", requireAuth, async (req, res) => {
  const user = getUser(req);
  const id = Number(req.params["id"]);

  const [scenario] = await db.select().from(dialogScenariosTable).where(eq(dialogScenariosTable.id, id));
  if (!scenario) {
    res.status(404).json({ error: "Ситуация не найдена" });
    return;
  }
  if (scenario.archived) {
    res.status(409).json({ error: "Учитель снял эту ситуацию" });
    return;
  }

  const [assignment] = await db
    .select({ id: dialogAssignmentsTable.id })
    .from(dialogAssignmentsTable)
    .where(and(
      eq(dialogAssignmentsTable.scenarioId, id),
      eq(dialogAssignmentsTable.studentId, user.userId),
    ));
  if (!assignment && user.role !== "admin") {
    res.status(403).json({ error: "Эта ситуация тебе не выдана" });
    return;
  }

  const [active] = await db
    .select()
    .from(dialogAttemptsTable)
    .where(and(
      eq(dialogAttemptsTable.scenarioId, id),
      eq(dialogAttemptsTable.studentId, user.userId),
      eq(dialogAttemptsTable.status, "active"),
    ))
    .orderBy(desc(dialogAttemptsTable.startedAt));

  let attempt = active;
  if (!attempt) {
    const [created] = await db
      .insert(dialogAttemptsTable)
      .values({ scenarioId: id, studentId: user.userId })
      .returning();
    attempt = created!;

    // Первая реплика роли, если учитель её задал: без неё ученик смотрит в
    // пустой экран и не понимает, кто перед ним.
    if (scenario.opener) {
      await db.insert(dialogTurnsTable).values({
        attemptId: attempt.id,
        role: "ai",
        text: scenario.opener,
      });
    }
  }

  const turns = await db
    .select()
    .from(dialogTurnsTable)
    .where(eq(dialogTurnsTable.attemptId, attempt.id))
    .orderBy(asc(dialogTurnsTable.at));

  res.json({
    scenario: viewScenario(scenario),
    attempt: {
      id: attempt.id,
      status: attempt.status,
      turns: attempt.turns,
      mistakes: attempt.mistakes,
      goalReached: attempt.goalReached,
      startedAt: attempt.startedAt.toISOString(),
      finishedAt: attempt.finishedAt?.toISOString() ?? null,
      summary: attempt.summary,
    },
    messages: turns.map((t) => ({
      id: t.id,
      role: t.role,
      text: t.text,
      correct: t.correct,
      fixed: t.fixed,
      issue: t.issue,
      at: t.at.toISOString(),
    })),
  });
});

/** Доступ к попытке: сам ученик, учитель этой ситуации или админ. */
async function loadAttempt(
  attemptId: number,
  user: { userId: number; role: string },
): Promise<{ attempt: typeof dialogAttemptsTable.$inferSelect; scenario: ScenarioRow } | null> {
  if (!Number.isInteger(attemptId)) return null;
  const [row] = await db
    .select({ attempt: dialogAttemptsTable, scenario: dialogScenariosTable })
    .from(dialogAttemptsTable)
    .innerJoin(dialogScenariosTable, eq(dialogScenariosTable.id, dialogAttemptsTable.scenarioId))
    .where(eq(dialogAttemptsTable.id, attemptId));
  if (!row) return null;

  const isOwner = row.attempt.studentId === user.userId;
  const isAuthor = row.scenario.teacherId === user.userId;
  if (!isOwner && !isAuthor && user.role !== "admin") return null;
  return row;
}

// ── Учитель: все разборы одним списком ──────────────────────────────────────
//
// ВЫШЕ /scenario-attempts/:id: иначе «attempts» без номера ушло бы в :id.
router.get("/scenario-attempts", requireAuth, async (req, res) => {
  const user = getUser(req);
  if (!isTeacher(user.role)) {
    res.status(403).json({ error: "Только для учителя" });
    return;
  }

  const rows = await db
    .select({
      id: dialogAttemptsTable.id,
      scenarioId: dialogAttemptsTable.scenarioId,
      scenarioTitle: dialogScenariosTable.title,
      studentId: dialogAttemptsTable.studentId,
      studentName: usersTable.name,
      status: dialogAttemptsTable.status,
      turns: dialogAttemptsTable.turns,
      mistakes: dialogAttemptsTable.mistakes,
      goalReached: dialogAttemptsTable.goalReached,
      finishedAt: dialogAttemptsTable.finishedAt,
      startedAt: dialogAttemptsTable.startedAt,
      seenAt: dialogAttemptsTable.seenAt,
    })
    .from(dialogAttemptsTable)
    .innerJoin(dialogScenariosTable, eq(dialogScenariosTable.id, dialogAttemptsTable.scenarioId))
    .leftJoin(usersTable, eq(usersTable.id, dialogAttemptsTable.studentId))
    .where(eq(dialogScenariosTable.teacherId, user.userId))
    .orderBy(desc(dialogAttemptsTable.startedAt))
    .limit(50);

  res.json(rows.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    seenAt: r.seenAt?.toISOString() ?? null,
    fresh: r.status !== "active" && !r.seenAt,
  })));
});

// ── Весь диалог с ошибками ──────────────────────────────────────────────────
//
// Это и есть отчёт учителю. Он же служит ученику экраном итога: показывать одну
// беседу двумя маршрутами незачем — данные одни и те же.
router.get("/scenario-attempts/:id", requireAuth, async (req, res) => {
  const user = getUser(req);
  const id = Number(req.params["id"]);
  const found = await loadAttempt(id, user);
  if (!found) {
    res.status(404).json({ error: "Диалог не найден" });
    return;
  }

  const [student] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      avatarEmoji: usersTable.avatarEmoji,
      avatarColor: usersTable.avatarColor,
    })
    .from(usersTable)
    .where(eq(usersTable.id, found.attempt.studentId));

  const turns = await db
    .select()
    .from(dialogTurnsTable)
    .where(eq(dialogTurnsTable.attemptId, id))
    .orderBy(asc(dialogTurnsTable.at));

  // Учитель открыл разбор — гасим метку «новое». Ученику отметку не ставим:
  // она про внимание учителя, а не про факт открытия экрана.
  if (found.scenario.teacherId === user.userId && !found.attempt.seenAt) {
    await db
      .update(dialogAttemptsTable)
      .set({ seenAt: new Date() })
      .where(eq(dialogAttemptsTable.id, id));
  }

  res.json({
    scenario: viewScenario(found.scenario),
    student: student ?? null,
    attempt: {
      id: found.attempt.id,
      status: found.attempt.status,
      turns: found.attempt.turns,
      mistakes: found.attempt.mistakes,
      goalReached: found.attempt.goalReached,
      summary: found.attempt.summary,
      startedAt: found.attempt.startedAt.toISOString(),
      finishedAt: found.attempt.finishedAt?.toISOString() ?? null,
    },
    messages: turns.map((t) => ({
      id: t.id,
      role: t.role,
      text: t.text,
      correct: t.correct,
      fixed: t.fixed,
      issue: t.issue,
      at: t.at.toISOString(),
    })),
  });
});

/**
 * Итоговый разбор для учителя.
 *
 * Считается ОДИН раз при закрытии попытки и сохраняется: пересчёт на каждом
 * открытии отчёта давал бы учителю каждый раз новый текст об одном и том же
 * диалоге, да ещё и за деньги.
 *
 * Не получилось — не беда: отчёт остаётся без итоговой строки, сам диалог с
 * ошибками важнее и он уже в базе.
 */
async function writeSummary(
  attemptId: number,
  scenario: ScenarioRow,
  log: Parameters<typeof chat>[0]["log"],
): Promise<string | null> {
  try {
    if (!hasAnyAi()) return null;
    const turns = await db
      .select({ role: dialogTurnsTable.role, text: dialogTurnsTable.text, issue: dialogTurnsTable.issue })
      .from(dialogTurnsTable)
      .where(eq(dialogTurnsTable.attemptId, attemptId))
      .orderBy(asc(dialogTurnsTable.at));

    const script = turns
      .map((t) => `${t.role === "student" ? "Student" : "Character"}: ${t.text}${t.issue ? `  [ошибка: ${t.issue}]` : ""}`)
      .join("\n")
      .slice(0, 6000);

    const outcome = await chat({
      system: summarySystemPrompt(),
      history: [],
      message: `Ситуация: ${scenario.situation}\nРоль собеседника: ${scenario.role}\nЦель ученика: ${scenario.goal ?? "не задана"}\n\nДиалог:\n${script}`,
      log,
    });
    if (!outcome.ok) return null;
    return outcome.text.trim().slice(0, 2000);
  } catch {
    return null;
  }
}

/** Закрыть попытку: статус, время, итоговый разбор и очки. */
async function closeAttempt(
  attempt: typeof dialogAttemptsTable.$inferSelect,
  scenario: ScenarioRow,
  status: "done" | "stopped",
  log: Parameters<typeof chat>[0]["log"],
): Promise<string | null> {
  const summary = await writeSummary(attempt.id, scenario, log);

  const closed = await db
    .update(dialogAttemptsTable)
    .set({ status, finishedAt: new Date(), summary })
    // Условие по статусу: две одновременные попытки закрыть дадут одну запись,
    // а значит и очки начислятся один раз.
    .where(and(eq(dialogAttemptsTable.id, attempt.id), eq(dialogAttemptsTable.status, "active")))
    .returning({ id: dialogAttemptsTable.id });

  if (status === "done" && closed.length > 0) {
    const [row] = await db
      .select({ totalPoints: usersTable.totalPoints })
      .from(usersTable)
      .where(eq(usersTable.id, attempt.studentId));
    await db
      .update(usersTable)
      .set({ totalPoints: (row?.totalPoints ?? 0) + SCENARIO_POINTS, updatedAt: new Date() })
      .where(eq(usersTable.id, attempt.studentId));
  }

  return summary;
}

// ── Ученик: реплика ─────────────────────────────────────────────────────────
router.post("/scenario-attempts/:id/reply", requireAuth, async (req, res) => {
  const user = getUser(req);
  const id = Number(req.params["id"]);
  const found = await loadAttempt(id, user);
  if (!found) {
    res.status(404).json({ error: "Диалог не найден" });
    return;
  }
  if (found.attempt.studentId !== user.userId) {
    res.status(403).json({ error: "Это чужой диалог" });
    return;
  }
  if (found.attempt.status !== "active") {
    res.status(409).json({ error: "Это задание уже закрыто" });
    return;
  }
  if (!hasAnyAi()) {
    res.status(503).json({ error: "Снежа не настроена: на сервере нет ключа доступа к ИИ." });
    return;
  }

  const body = req.body as { text?: unknown; audioBase64?: unknown; mimeType?: unknown };
  let said = typeof body.text === "string" ? body.text.trim().slice(0, MAX_REPLY_LEN) : "";
  const hasAudio = typeof body.audioBase64 === "string" && body.audioBase64.length > 0;

  if (!said && !hasAudio) {
    res.status(400).json({ error: "Реплика не пришла: нужна запись или текст" });
    return;
  }

  // Запись расшифровываем тем же слоем, что и свободный разговор: двух разных
  // распознавателей в одном приложении быть не должно.
  if (!said) {
    const audio = Buffer.from(String(body.audioBase64), "base64");
    if (audio.length < MIN_AUDIO_BYTES) {
      res.status(422).json({ error: "Запись слишком короткая. Скажи целую фразу и нажми «Стоп»." });
      return;
    }
    if (audio.length > MAX_AUDIO_BYTES) {
      res.status(413).json({ error: "Запись слишком длинная. Говори покороче." });
      return;
    }
    const heard = await transcribe({ audio, declaredMime: body.mimeType, log: req.log });
    if (!heard.ok) {
      res.status(502).json({
        error: "Не удалось разобрать запись. Попробуй сказать ещё раз или напиши текстом.",
        detail: heard.detail,
      });
      return;
    }
    said = heard.text.trim().slice(0, MAX_REPLY_LEN);
    if (!said) {
      res.status(422).json({ error: "В записи не слышно речи. Попробуй снова." });
      return;
    }
  }

  // История: хвост беседы. Реплики ученика идут КАК СКАЗАНЫ, без исправлений —
  // это запись разговора, а не протокол того, как надо было.
  const previous = await db
    .select({ role: dialogTurnsTable.role, text: dialogTurnsTable.text })
    .from(dialogTurnsTable)
    .where(eq(dialogTurnsTable.attemptId, id))
    .orderBy(desc(dialogTurnsTable.at))
    .limit(HISTORY_LIMIT);

  const history = previous.reverse().map((t) => ({
    role: t.role === "student" ? ("user" as const) : ("assistant" as const),
    content: t.text,
  }));

  const [profile] = await db
    .select({ name: usersTable.name, knowledgeLevel: usersTable.knowledgeLevel })
    .from(usersTable)
    .where(eq(usersTable.id, user.userId));

  const levelKey = found.scenario.level ?? profile?.knowledgeLevel ?? null;

  const outcome = await chat({
    system: scenarioSystemPrompt({
      situation: found.scenario.situation,
      role: found.scenario.role,
      goal: found.scenario.goal,
      criteria: found.scenario.criteria ?? [],
      strictness: readStrictness(found.scenario.strictness),
      level: levelKey ? (LEVEL_HINT[levelKey] ?? levelKey) : null,
      studentName: profile?.name ?? null,
      turns: found.attempt.turns,
      turnsTarget: found.scenario.turnsTarget,
      goalReached: found.attempt.goalReached,
    }),
    history,
    message: said,
    log: req.log,
  });

  if (!outcome.ok) {
    req.log.error({ tried: outcome.tried, detail: outcome.detail }, "Ситуация: модель не ответила");
    res.status(502).json({ error: "Снежа не ответила.", detail: outcome.detail });
    return;
  }

  const verdict = parseScenarioVerdict(outcome.text);

  // Реплика ученика вместе с разбором: из этих строк собирается отчёт учителю.
  const [studentTurn] = await db
    .insert(dialogTurnsTable)
    .values({
      attemptId: id,
      role: "student",
      text: said,
      correct: verdict.ok,
      fixed: verdict.ok ? null : verdict.fixed || null,
      issue: verdict.ok ? null : verdict.issue || null,
    })
    .returning();

  const [aiTurn] = await db
    .insert(dialogTurnsTable)
    .values({ attemptId: id, role: "ai", text: verdict.reply })
    .returning();

  const turns = found.attempt.turns + 1;
  const mistakes = found.attempt.mistakes + (verdict.ok ? 0 : 1);
  // Цель не засчитываем с первой фразы: см. MIN_TURNS_FOR_GOAL.
  const goalReached = found.attempt.goalReached
    || (verdict.goalDone && !!found.scenario.goal && turns >= MIN_TURNS_FOR_GOAL);

  const [updated] = await db
    .update(dialogAttemptsTable)
    .set({ turns, mistakes, goalReached })
    .where(eq(dialogAttemptsTable.id, id))
    .returning();

  const complete = isAttemptComplete({
    turns,
    turnsTarget: found.scenario.turnsTarget,
    goalReached,
    hasGoal: !!found.scenario.goal,
  });

  let summary: string | null = null;
  if (complete) {
    summary = await closeAttempt(updated ?? found.attempt, found.scenario, "done", req.log);
  }

  res.json({
    student: {
      id: studentTurn!.id,
      role: "student",
      text: said,
      correct: verdict.ok,
      fixed: verdict.ok ? null : verdict.fixed || null,
      issue: verdict.ok ? null : verdict.issue || null,
      at: studentTurn!.at.toISOString(),
    },
    reply: {
      id: aiTurn!.id,
      role: "ai",
      text: verdict.reply,
      at: aiTurn!.at.toISOString(),
    },
    attempt: {
      id,
      status: complete ? "done" : "active",
      turns,
      turnsTarget: found.scenario.turnsTarget,
      mistakes,
      goalReached,
      summary,
    },
    /** Задание закрыто этой репликой: клиент показывает итог. */
    finished: complete,
    pointsEarned: complete ? SCENARIO_POINTS : 0,
  });
});

// ── Ученик: закончить досрочно ──────────────────────────────────────────────
//
// Отдельный статус stopped, а не done: учитель должен видеть разницу между
// «прошёл» и «вышел на середине». Очки за это не выдаются.
router.post("/scenario-attempts/:id/finish", requireAuth, async (req, res) => {
  const user = getUser(req);
  const id = Number(req.params["id"]);
  const found = await loadAttempt(id, user);
  if (!found) {
    res.status(404).json({ error: "Диалог не найден" });
    return;
  }
  if (found.attempt.studentId !== user.userId) {
    res.status(403).json({ error: "Это чужой диалог" });
    return;
  }
  if (found.attempt.status !== "active") {
    res.json({ status: found.attempt.status, summary: found.attempt.summary });
    return;
  }

  // Ни одной реплики — попытку удаляем: пустой отчёт учителю не нужен.
  if (found.attempt.turns === 0) {
    await db.delete(dialogAttemptsTable).where(eq(dialogAttemptsTable.id, id));
    res.json({ status: "discarded", summary: null });
    return;
  }

  const summary = await closeAttempt(found.attempt, found.scenario, "stopped", req.log);
  res.json({ status: "stopped", summary });
});

export default router;
