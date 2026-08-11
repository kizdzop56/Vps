// ─────────────────────────────────────────────────────────────────────────────
// Раздел «Составлять»: формы глаголов, неправильные глаголы, времена, сборка.
//
// Маршруты:
//   GET  /grammar/overview        — режимы, времена, буквы и объём банка
//   GET  /grammar/session         — подборка (?mode=&tense=&letter=&round=)
//   POST /grammar/check           — проверка ответа, разбор ошибки, очки
//   GET  /grammar/stats           — точность по темам: что даётся хуже всего
//
// ── Уровень один на всё приложение ──────────────────────────────────────────
// Берётся из flashcard_settings.placement_level — оттуда же, откуда его берут
// слова. Свой уровень для грамматики был бы вторым источником правды: ученик
// проходит тест один раз, а уровней у него становится два, и они разъезжаются.
//
// ── Что хранится ────────────────────────────────────────────────────────────
// Одна строка на ответ в grammar_log: задание, режим, тема, способ ответа,
// результат и начисленные очки. Ровно то, из чего считаются дневной потолок,
// «слабые места», знакомость глагола и курсор ротации, и ничего больше.
//
// ── Почему знакомость и курсор считает сервер ───────────────────────────────
// Обе величины живут в журнале и обязаны переживать выход из раздела и
// переустановку приложения.
//
// От знакомости зависит способ ответа в режиме форм: незнакомый глагол —
// варианты, знакомый — письмо.
//
// От курсора зависит, какую порцию банка ученик увидит. Раньше курсор жил в
// состоянии экрана, и выход в оглавление обнулял его: ученик решал двенадцать
// заданий, входил снова и получал ТЕ ЖЕ двенадцать. Номер захода от клиента
// остался, но теперь он лишь подстраховка на случай недоехавших ответов —
// движок берёт максимум из двух (см. шапку engine.ts).
//
// ── Буквы ───────────────────────────────────────────────────────────────────
// Формы глаголов разложены по первой букве, как в таблице в конце учебника.
// Курсор у каждой буквы СВОЙ: занятия по букве B не должны прокручивать букву C,
// иначе ученик, открыв C, начнёт не с начала и решит, что часть глаголов
// пропала. Поэтому в режиме форм израсходованные заходы считаются по первой
// букве темы (topic там — первая форма глагола).
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, grammarLogTable } from "@workspace/db";
import { and, eq, gte, sql, type SQL } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";
import { ensureSettings } from "../lib/flashcardsCore";
import { startOfDay } from "../lib/srs";
import { LEVEL_ORDER, fitsLevel, verbByBase, verbsUpTo, type CefrLevel } from "../lib/grammar/verbs";
import { TENSES, tenseById } from "../lib/grammar/tenses";
import { ASSEMBLE_TASKS, VERB_GAP_TASKS } from "../lib/grammar/tasks";
import { TENSE_GAP_TASKS } from "../lib/grammar/tenseBank";
import {
  FORM_MASTERY_HITS,
  formLetterGroups,
  formTasksUpTo,
  normalizeLetter,
  verbLetter,
} from "../lib/grammar/forms";
import {
  SESSION_SIZE,
  batchCount,
  buildGrammarSession,
  checkGrammarAnswer,
  findTask,
  type GrammarMode,
} from "../lib/grammar/engine";
import {
  DAILY_GRAMMAR_POINTS_CAP,
  awardableGrammarPoints,
  pointsForAnswer,
  topicStats,
  type GrammarInput,
} from "../lib/grammar/points";

const router = Router();

/** Ответ длиннее этого — не ответ, а вставленный текст. */
const MAX_ANSWER_LEN = 200;

/** Сколько последних ответов читаем для статистики по темам. */
const STATS_LIMIT = 600;

/** Потолок номера захода: дальше это уже не занятие, а перебор банка. */
const MAX_ROUND = 50;

const MODES: GrammarMode[] = ["forms", "verbs", "tense", "build"];
const INPUTS: GrammarInput[] = ["type", "choice", "assemble"];

function isMode(value: unknown): value is GrammarMode {
  return typeof value === "string" && MODES.includes(value as GrammarMode);
}

/** Номер захода из запроса: мусор считаем первым заходом. */
function readRound(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_ROUND, Math.trunc(n));
}

/**
 * Способ ответа приходит от клиента, и подделать его можно.
 *
 * Так и оставлено осознанно: ставки отличаются на ОДНО очко при дневном потолке
 * 30, то есть выгода от подлога — три очка за час занятий. Проверка обошлась бы
 * несоизмеримо дороже: сервер не помнит выданные сессии, и пришлось бы хранить
 * состав каждой. Неизвестное значение считаем самым дешёвым.
 */
function readInput(value: unknown): GrammarInput {
  return typeof value === "string" && INPUTS.includes(value as GrammarInput)
    ? (value as GrammarInput)
    : "choice";
}

/**
 * Уровень ученика. Не прошёл тест — считаем A1, как и марафон слов: показать
 * начинающему задания B2 хуже, чем показать слишком простые.
 */
async function levelOf(userId: number): Promise<CefrLevel> {
  const settings = await ensureSettings(userId);
  const raw = settings.placementLevel ?? "A1";
  return (LEVEL_ORDER.includes(raw as CefrLevel) ? raw : "A1") as CefrLevel;
}

/** Сколько очков за грамматику начислено сегодня. */
async function earnedToday(userId: number): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${grammarLogTable.pointsEarned}), 0)::int` })
    .from(grammarLogTable)
    .where(and(
      eq(grammarLogTable.userId, userId),
      gte(grammarLogTable.answeredAt, startOfDay()),
    ));
  return Number(row?.total ?? 0);
}

/**
 * Сколько заходов ученик уже израсходовал в этой подборке.
 *
 * Это и есть курсор ротации: по нему движок выбирает порцию банка. Считается по
 * журналу, а не по счётчику на экране, именно потому, что экран закрывается —
 * а вернувшись, ученик обязан получить СЛЕДУЮЩИЕ двенадцать заданий, а не те же.
 *
 * Времена и буквы считаются по отдельности: у каждой подборки свой банк, и общий
 * счётчик гонял бы курсор Past Simple вперёд из-за занятий по Present Perfect, а
 * букву C — из-за занятий по букве B.
 *
 * Деление с округлением вниз: половина захода курсор не двигает — ученик не
 * дошёл до конца порции, и показать её остаток честнее, чем перескочить.
 */
async function consumedRounds(
  userId: number,
  mode: GrammarMode,
  opts: { tense?: string; letter?: string | null } = {},
): Promise<number> {
  const where: SQL[] = [
    eq(grammarLogTable.userId, userId),
    eq(grammarLogTable.mode, mode),
  ];
  if (mode === "tense" && opts.tense) where.push(eq(grammarLogTable.topic, opts.tense));
  // В режиме форм тема — первая форма глагола, поэтому буква группы это её
  // первая буква. Значение параметризовано драйвером, да и проверено на
  // единственную латинскую букву заранее.
  if (mode === "forms" && opts.letter) {
    where.push(sql`upper(left(${grammarLogTable.topic}, 1)) = ${opts.letter}`);
  }

  const [row] = await db
    .select({ answers: sql<number>`count(*)::int` })
    .from(grammarLogTable)
    .where(and(...where));

  return Math.floor(Number(row?.answers ?? 0) / SESSION_SIZE);
}

/**
 * Глаголы, формы которых ученик уже знает.
 *
 * Знание = FORM_MASTERY_HITS верных ответов по этому глаголу в режиме форм. По
 * таким глаголам спрашиваем письмом, по остальным даём варианты: выбирать среди
 * четырёх форму, которую видишь впервые, ещё имеет смысл, а писать её наугад —
 * нет.
 *
 * Считается по всей истории, а не по последним ответам: здесь не «в форме ли
 * ученик сейчас», а «видел ли он этот глагол вообще».
 */
async function masteredVerbs(userId: number): Promise<Set<string>> {
  const rows = await db
    .select({
      topic: grammarLogTable.topic,
      hits: sql<number>`count(*)::int`,
    })
    .from(grammarLogTable)
    .where(and(
      eq(grammarLogTable.userId, userId),
      eq(grammarLogTable.mode, "forms"),
      eq(grammarLogTable.correct, true),
    ))
    .groupBy(grammarLogTable.topic);

  const out = new Set<string>();
  for (const row of rows) {
    if (row.topic && Number(row.hits) >= FORM_MASTERY_HITS) out.add(row.topic);
  }
  return out;
}

/** Тема задания: время или глагол. По ней собирается статистика. */
function topicOf(taskId: string): { mode: GrammarMode; topic: string | null } | null {
  const found = findTask(taskId);
  if (!found) return null;
  if (found.kind === "forms") return { mode: "forms", topic: found.task.verb.base };
  if (found.kind === "tense") return { mode: "tense", topic: found.task.tense };
  if (found.kind === "verbs") return { mode: "verbs", topic: found.task.base };
  // У сборки предложений темы нет: это порядок слов вообще, а не одно правило.
  return { mode: "build", topic: null };
}

// ── GET /grammar/overview ───────────────────────────────────────────────────
router.get("/grammar/overview", requireAuth, async (req, res) => {
  const user = getUser(req);
  const level = await levelOf(user.userId);

  const formTasks = formTasksUpTo(level);
  const verbTasks = VERB_GAP_TASKS.filter((t) => fitsLevel(t.level, level));
  const tenseTasks = TENSE_GAP_TASKS.filter((t) => fitsLevel(t.level, level));
  const buildTasks = ASSEMBLE_TASKS.filter((t) => fitsLevel(t.level, level));

  // Времена показываем только те, что уже проходят на этом уровне, и рядом —
  // сколько по каждому есть заданий. Время без заданий в списке выглядело бы
  // как сломанная кнопка.
  const tenses = TENSES.filter((t) => fitsLevel(t.level, level)).map((t) => {
    const count = tenseTasks.filter((x) => x.tense === t.id).length;
    return {
      id: t.id,
      title: t.title,
      titleRu: t.titleRu,
      level: t.level,
      formula: t.formula,
      usage: t.usage,
      markers: t.markers,
      rule: t.rule,
      taskCount: count,
      // Сколько заходов подряд можно сделать, ни разу не повторившись.
      batches: batchCount(count, SESSION_SIZE),
    };
  });

  const today = await earnedToday(user.userId);
  const mastered = await masteredVerbs(user.userId);

  /** Знакомые глаголы уровня: по ним вопросы идут письмом. */
  const knownBases = [...mastered].filter((b) => {
    const verb = verbByBase(b);
    return !!verb && fitsLevel(verb.level, level);
  });

  // Буквы: как в таблице в конце учебника. Пустые не отдаём вовсе — на A1 и A2
  // нет ни одного глагола на A, и кнопка «на букву A» была бы сломанной.
  const verbLetters = formLetterGroups(level).map((group) => ({
    ...group,
    // Сколько глаголов группы уже знакомы: по этой цифре видно, что буква
    // закрывается, и она же отвечает на «я выучила букву B или нет».
    knownVerbs: knownBases.filter((b) => verbLetter(b) === group.letter).length,
  }));

  res.json({
    level,
    sessionSize: SESSION_SIZE,
    // Прогресс дня по разделу: сколько очков уже взято и где потолок.
    pointsToday: today,
    pointsCap: DAILY_GRAMMAR_POINTS_CAP,
    modes: [
      {
        id: "forms",
        title: "Формы глаголов",
        subtitle: "сами формы: «покупать» — buy — bought",
        taskCount: formTasks.length,
        batches: batchCount(formTasks.length, SESSION_SIZE),
        verbCount: verbsUpTo(level).length,
        knownVerbs: knownBases.length,
        letterCount: verbLetters.length,
      },
      {
        id: "verbs",
        title: "Глагол в предложении",
        subtitle: "вставить нужную форму: написать или выбрать",
        taskCount: verbTasks.length,
        batches: batchCount(verbTasks.length, SESSION_SIZE),
        verbCount: verbsUpTo(level).length,
      },
      {
        id: "tense",
        title: "Времена",
        subtitle: "утверждение, отрицание и вопрос по правилам времени",
        taskCount: tenseTasks.length,
        batches: batchCount(tenseTasks.length, SESSION_SIZE),
        tenseCount: tenses.filter((t) => t.taskCount > 0).length,
      },
      {
        id: "build",
        title: "Собери предложение",
        subtitle: "по русскому переводу, из слов",
        taskCount: buildTasks.length,
        batches: batchCount(buildTasks.length, SESSION_SIZE),
      },
    ],
    tenses,
    verbLetters,
  });
});

// ── GET /grammar/session ────────────────────────────────────────────────────
router.get("/grammar/session", requireAuth, async (req, res) => {
  const user = getUser(req);
  const mode = req.query["mode"];
  if (!isMode(mode)) {
    res.status(400).json({ error: "mode: ожидается forms, verbs, tense или build" });
    return;
  }

  const level = await levelOf(user.userId);
  const tense = typeof req.query["tense"] === "string" ? String(req.query["tense"]) : undefined;
  // Буква приходит из адреса, поэтому проверяется здесь: мусор считаем
  // «без буквы», а не пустой подборкой.
  const letter = mode === "forms" ? normalizeLetter(req.query["letter"]) : null;
  const round = readRound(req.query["round"]);
  // Курсор из журнала: он и двигает подборку между входами в раздел.
  const consumed = await consumedRounds(user.userId, mode, { tense, letter });
  // Лишний запрос делаем только там, где он влияет на подборку.
  const mastered = mode === "forms" ? await masteredVerbs(user.userId) : undefined;

  const session = buildGrammarSession({
    mode,
    level,
    tense,
    ...(letter ? { letter } : {}),
    round,
    consumed,
    mastered,
    now: new Date(),
  });

  // Пустая подборка — это не ошибка, а сообщение: на этом уровне заданий ещё
  // нет. Клиент объясняет её текстом, поэтому отвечаем 200 с нулём.
  res.json({ mode, level, tense, ...session });
});

// ── POST /grammar/check ─────────────────────────────────────────────────────
//
// Эталон берётся из банка по номеру задания, а не из тела запроса: иначе клиент
// мог бы прислать свой «правильный ответ» и засчитать себе что угодно. Ровно та
// же причина, что у проверки свободного ответа в словах.
router.post("/grammar/check", requireAuth, async (req, res) => {
  const user = getUser(req);
  const body = req.body as { taskId?: unknown; given?: unknown; input?: unknown };
  const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
  const given = typeof body.given === "string" ? body.given.slice(0, MAX_ANSWER_LEN) : "";
  const input = readInput(body.input);

  if (!taskId) {
    res.status(400).json({ error: "taskId required" });
    return;
  }

  const verdict = checkGrammarAnswer(taskId, given);
  const meta = topicOf(taskId);
  if (!verdict || !meta) {
    res.status(404).json({ error: "Задание не найдено" });
    return;
  }

  // Очки: ставка по способу ответа, дальше дневной потолок.
  const earned = await earnedToday(user.userId);
  const pointsEarned = awardableGrammarPoints(
    pointsForAnswer(input, verdict.correct),
    earned,
  );

  await db.insert(grammarLogTable).values({
    userId: user.userId,
    taskId,
    mode: meta.mode,
    topic: meta.topic,
    input,
    correct: verdict.correct,
    typo: verdict.typo,
    pointsEarned,
  });

  if (pointsEarned > 0) {
    const [row] = await db
      .select({ totalPoints: usersTable.totalPoints })
      .from(usersTable)
      .where(eq(usersTable.id, user.userId));
    await db
      .update(usersTable)
      .set({ totalPoints: (row?.totalPoints ?? 0) + pointsEarned, updatedAt: new Date() })
      .where(eq(usersTable.id, user.userId));
  }

  res.json({
    ...verdict,
    pointsEarned,
    pointsToday: earned + pointsEarned,
    pointsCap: DAILY_GRAMMAR_POINTS_CAP,
  });
});

// ── GET /grammar/stats ──────────────────────────────────────────────────────
//
// Точность по темам за последние ответы: слабое вперёд. Единственная статистика,
// ради которой стоит вести журнал — по ней видно, чем заняться. Счётчик заходов
// в этот ответ намеренно не входит.
router.get("/grammar/stats", requireAuth, async (req, res) => {
  const user = getUser(req);

  const logs = await db
    .select({
      topic: grammarLogTable.topic,
      mode: grammarLogTable.mode,
      correct: grammarLogTable.correct,
      answeredAt: grammarLogTable.answeredAt,
    })
    .from(grammarLogTable)
    .where(eq(grammarLogTable.userId, user.userId))
    .orderBy(sql`${grammarLogTable.answeredAt} desc`)
    .limit(STATS_LIMIT);

  const stats = topicStats(logs);

  // Название темы понятным текстом: id времени и первая форма глагола ученику
  // ничего не говорят. Подставляем здесь, а не на клиенте: и правила, и таблица
  // форм живут на сервере.
  const named = stats.map((s) => {
    if (s.mode === "tense") {
      const tense = tenseById(s.topic);
      return { ...s, title: tense?.title ?? s.topic, subtitle: tense?.titleRu ?? "" };
    }
    const verb = verbByBase(s.topic);
    return {
      ...s,
      title: s.topic,
      subtitle: verb ? `${verb.past[0]} · ${verb.participle[0]} — ${verb.ru}` : "",
    };
  });

  const [totals] = await db
    .select({
      answers: sql<number>`count(*)::int`,
      correct: sql<number>`count(*) filter (where ${grammarLogTable.correct})::int`,
    })
    .from(grammarLogTable)
    .where(eq(grammarLogTable.userId, user.userId));

  const answers = Number(totals?.answers ?? 0);
  const correct = Number(totals?.correct ?? 0);

  res.json({
    answers,
    correct,
    accuracy: answers > 0 ? Math.round((correct / answers) * 100) : 0,
    pointsToday: await earnedToday(user.userId),
    pointsCap: DAILY_GRAMMAR_POINTS_CAP,
    topics: named,
    weak: named.filter((t) => t.weak),
  });
});

export default router;
