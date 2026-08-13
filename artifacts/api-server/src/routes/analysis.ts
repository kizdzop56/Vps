// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analysis/ai — разбор успеваемости класса нейросетью.
//
// Экран «Анализ» показывает проценты и рекомендации по правилам. Правила видят
// только цифры; модель читает САМИ ОШИБКИ и говорит, какая тема провалена и что
// с ней делать. Отсюда и содержимое выгрузки: не только средние баллы, но и
// неверные ответы с формулировками ошибок из диалогов.
//
// ── Кэш обязателен ──────────────────────────────────────────────────────────
// Экран обновляется сам: при открытии вкладки, по свайпу и раз в тридцать
// секунд. Без кэша это означало бы обращение к модели каждые полминуты у
// каждого учителя — деньги и лимиты сгорели бы за день.
//
// Ключ кэша — отпечаток данных: число работ, последняя сдача, число ошибок.
// Появилась новая работа — отпечаток изменился, разбор пересчитается. Ничего не
// изменилось — отдаём прежний, сколько бы раз экран ни спросил. Плюс TTL: даже
// на неизменных данных разбор живёт не дольше CACHE_TTL_MS, чтобы советы не
// висели неделями.
//
// force=1 — пересчитать сейчас (кнопка «Обновить разбор» на экране).
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  teacherStudentsTable,
  assignmentsTable,
  assignedTasksTable,
  submissionsTable,
  submissionAnswersTable,
  dialogScenariosTable,
  dialogAttemptsTable,
  dialogTurnsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { requireAuth, getUser, isTeacher } from "../lib/auth";
import { chat, hasAnyAi } from "../lib/ai";
import {
  analysisSystemPrompt,
  buildAnalysisInput,
  parseAnalysisReport,
  type AnalysisReport,
  type StudentBrief,
} from "../lib/analysisReport";

const router = Router();

/** Сколько живёт готовый разбор, даже если данные не менялись. */
const CACHE_TTL_MS = 30 * 60 * 1000;

/** Учеников в одной выгрузке. Дальше запрос к модели становится неподъёмным. */
const MAX_STUDENTS = 30;

/** Ошибок на ученика. Двадцать однотипных промахов не добавляют смысла. */
const MISTAKES_PER_STUDENT = 8;

/** Ошибок из диалогов на ученика. */
const DIALOG_ISSUES_PER_STUDENT = 5;

/** Длина одной строки ошибки: длинный текст задания модели не нужен. */
const MAX_FIELD = 160;

type CacheEntry = { at: number; fingerprint: string; report: AnalysisReport };
const cache = new Map<number, CacheEntry>();

function clip(value: unknown, limit = MAX_FIELD): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

/** Дней с последнего захода. null — ни разу не заходил или неизвестно. */
function daysSince(date: Date | null): number | null {
  if (!date) return null;
  const ms = Date.now() - date.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / 86_400_000);
}

router.get("/analysis/ai", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const caller = getUser(req);
  if (!isTeacher(caller.role) && caller.role !== "admin") {
    res.status(403).json({ error: "Только для учителя" });
    return;
  }

  // ── Кто в классе ──
  const students = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      surname: usersTable.surname,
      username: usersTable.username,
      level: usersTable.knowledgeLevel,
      lastSeenAt: usersTable.lastSeenAt,
    })
    .from(teacherStudentsTable)
    .innerJoin(usersTable, eq(usersTable.id, teacherStudentsTable.studentId))
    .where(and(
      eq(teacherStudentsTable.teacherId, caller.userId),
      eq(teacherStudentsTable.status, "accepted"),
    ))
    .limit(MAX_STUDENTS);

  if (students.length === 0) {
    res.json({ ok: false, reason: "no_students", detail: "Нет принятых учеников" });
    return;
  }

  const ids = students.map((s) => s.id);

  // ── Сдачи: средний балл, разбивка по видам, работы на проверке ──
  const subs = await db
    .select({
      id: submissionsTable.id,
      studentId: submissionsTable.studentId,
      score: submissionsTable.score,
      status: submissionsTable.status,
      submittedAt: submissionsTable.submittedAt,
      type: assignmentsTable.type,
    })
    .from(submissionsTable)
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, submissionsTable.assignmentId))
    .where(inArray(submissionsTable.studentId, ids))
    .orderBy(desc(submissionsTable.submittedAt))
    .limit(400);

  // ── Просрочки: выдано, срок вышел, сдачи нет ──
  const overdueRows = await db
    .select({ studentId: assignedTasksTable.studentId })
    .from(assignedTasksTable)
    .leftJoin(submissionsTable, and(
      eq(submissionsTable.assignmentId, assignedTasksTable.assignmentId),
      eq(submissionsTable.studentId, assignedTasksTable.studentId),
    ))
    .where(and(
      eq(assignedTasksTable.teacherId, caller.userId),
      isNotNull(assignedTasksTable.dueAt),
      lt(assignedTasksTable.dueAt, new Date()),
      isNull(submissionsTable.id),
    ));

  const overdueBy = new Map<number, number>();
  for (const row of overdueRows) {
    overdueBy.set(row.studentId, (overdueBy.get(row.studentId) ?? 0) + 1);
  }

  // ── Сами ошибки: вопрос, ответ ученика, правильный ответ ──
  const wrong = await db
    .select({
      studentId: submissionsTable.studentId,
      submittedAt: submissionsTable.submittedAt,
      question: submissionAnswersTable.questionText,
      answer: submissionAnswersTable.studentAnswer,
      correct: submissionAnswersTable.correctAnswer,
    })
    .from(submissionAnswersTable)
    .innerJoin(submissionsTable, eq(submissionsTable.id, submissionAnswersTable.submissionId))
    .where(and(
      inArray(submissionsTable.studentId, ids),
      eq(submissionAnswersTable.isCorrect, false),
    ))
    .orderBy(desc(submissionsTable.submittedAt))
    .limit(300);

  // ── Ошибки в разговоре: они уже сформулированы по-русски одной фразой ──
  const dialogIssues = await db
    .select({
      studentId: dialogAttemptsTable.studentId,
      issue: dialogTurnsTable.issue,
      at: dialogTurnsTable.at,
    })
    .from(dialogTurnsTable)
    .innerJoin(dialogAttemptsTable, eq(dialogAttemptsTable.id, dialogTurnsTable.attemptId))
    .innerJoin(dialogScenariosTable, eq(dialogScenariosTable.id, dialogAttemptsTable.scenarioId))
    .where(and(
      eq(dialogScenariosTable.teacherId, caller.userId),
      inArray(dialogAttemptsTable.studentId, ids),
      isNotNull(dialogTurnsTable.issue),
    ))
    .orderBy(desc(dialogTurnsTable.at))
    .limit(200);

  // ── Сборка выгрузки ──
  const briefs: StudentBrief[] = students.map((s) => {
    const mine = subs.filter((x) => x.studentId === s.id);
    const graded = mine.filter((x) => x.status === "graded");
    const pending = mine.filter((x) => x.status === "pending").length;

    const byTypeMap = new Map<string, { sum: number; count: number }>();
    for (const row of graded) {
      const acc = byTypeMap.get(row.type) ?? { sum: 0, count: 0 };
      acc.sum += row.score ?? 0;
      acc.count += 1;
      byTypeMap.set(row.type, acc);
    }
    const byType = [...byTypeMap.entries()].map(([type, acc]) => ({
      type,
      average: acc.count > 0 ? Math.round(acc.sum / acc.count) : null,
      count: acc.count,
    }));

    const average = graded.length > 0
      ? Math.round(graded.reduce((sum, x) => sum + (x.score ?? 0), 0) / graded.length)
      : null;

    return {
      id: s.id,
      name: [s.name, s.surname].filter(Boolean).join(" ") || s.username,
      level: s.level,
      average,
      graded: graded.length,
      pending,
      overdue: overdueBy.get(s.id) ?? 0,
      byType,
      mistakes: wrong
        .filter((w) => w.studentId === s.id)
        .slice(0, MISTAKES_PER_STUDENT)
        .map((w) => ({
          question: clip(w.question),
          answer: clip(w.answer, 80),
          correct: clip(w.correct, 80),
        })),
      dialogIssues: dialogIssues
        .filter((d) => d.studentId === s.id)
        .slice(0, DIALOG_ISSUES_PER_STUDENT)
        .map((d) => clip(d.issue, 120))
        .filter(Boolean),
      daysSinceSeen: daysSince(s.lastSeenAt),
    };
  });

  const hasAnything = briefs.some((b) => b.graded > 0 || b.mistakes.length > 0 || b.dialogIssues.length > 0);
  if (!hasAnything) {
    res.json({
      ok: false,
      reason: "no_data",
      detail: "Ученики ещё не выполняли заданий — разбирать нечего",
    });
    return;
  }

  // Отпечаток данных: пока он тот же, пересчитывать нечего.
  const fingerprint = [
    briefs.length,
    subs.length,
    wrong.length,
    dialogIssues.length,
    subs[0]?.submittedAt?.getTime() ?? 0,
    [...overdueBy.values()].reduce((a, b) => a + b, 0),
  ].join(":");

  const force = req.query["force"] === "1";
  const cached = cache.get(caller.userId);
  if (!force && cached && cached.fingerprint === fingerprint && Date.now() - cached.at < CACHE_TTL_MS) {
    res.json({
      ok: true,
      report: cached.report,
      generatedAt: new Date(cached.at).toISOString(),
      cached: true,
    });
    return;
  }

  if (!hasAnyAi()) {
    res.json({
      ok: false,
      reason: "no_key",
      detail: "На сервере не задан ключ доступа к ИИ, разбор недоступен",
    });
    return;
  }

  const outcome = await chat({
    system: analysisSystemPrompt(),
    history: [],
    message: buildAnalysisInput(briefs),
    log: req.log,
  });

  if (!outcome.ok) {
    req.log.error({ tried: outcome.tried, detail: outcome.detail }, "Анализ: модель не ответила");
    // Прошлый разбор лучше пустоты: он мог устареть на одну работу, но в целом
    // верен, а учитель хотя бы что-то видит.
    if (cached) {
      res.json({
        ok: true,
        report: cached.report,
        generatedAt: new Date(cached.at).toISOString(),
        cached: true,
        stale: true,
      });
      return;
    }
    res.json({ ok: false, reason: "ai_failed", detail: outcome.detail });
    return;
  }

  const report = parseAnalysisReport(outcome.text, briefs);
  const at = Date.now();
  // Карта не должна расти бесконечно на большом воркспейсе.
  if (cache.size > 500) cache.clear();
  cache.set(caller.userId, { at, fingerprint, report });

  res.json({ ok: true, report, generatedAt: new Date(at).toISOString(), cached: false });
});

export default router;
