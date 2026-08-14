// ─────────────────────────────────────────────────────────────────────────────
// Разговор со Снежей: реплика ученика → разбор → ответ модели.
//
// ── Про поставщиков здесь НИЧЕГО нет ────────────────────────────────────────
// Раньше маршрут напрямую знал про поставщика: и модель ответа, и
// распознавание, и озвучку. Стоило понадобиться другому — и правка задевала
// проверку прав, очки и журнал, которые к ИИ отношения не имеют.
//
// Теперь всё это за общим слоем (lib/ai.ts): маршрут просит «ответь»,
// «расшифруй», «озвучь». Кто именно это сделал — Gemini или Deepgram —
// маршрут не знает и знать не должен.
//
// ── РАЗГОВОР ПРОДОЛЖАЕТСЯ ПОСЛЕ ПЕРЕЗАГРУЗКИ ───────────────────────────────
// Реплики всегда писались в базу, но клиент о них не спрашивал: обновил
// страницу — и лента пустая, хотя разговор лежит на сервере целиком.
//
// GET /voice-chat/latest отдаёт ПОСЛЕДНИЙ разговор ученика вместе с репликами.
// Экран забирает его при открытии и продолжает с того же места, а модель
// получает ту же историю — значит и контекст беседы не теряется.
//
// ── СНЕЖА ЗНАЕТ, С КЕМ ГОВОРИТ ─────────────────────────────────────────────
// Она переспрашивала имя в каждом разговоре, потому что в задании о человеке не
// было ни слова.
//
// Теперь в задание уходит короткая справка: имя, возраст, уровень и интересы —
// всё это уже лежит в профиле (users), заполняется при регистрации и в блоке
// «О себе». Отдельного хранилища «памяти» не появилось намеренно: держать
// второй набор тех же фактов означало бы, что они разойдутся.
//
// ── УРОВЕНЬ — ИЗ PLACEMENT-ТЕСТА, А НЕ ИЗ ВОЗРАСТА ──────────────────────────
// usersTable.knowledgeLevel выставляется ОДИН РАЗ при регистрации по возрасту
// ребёнка (lib/knowledgeLevel.ts) и никогда не обновляется — это грубая
// прикидка, а не измеренный уровень. Реальный, проверенный уровень (CEFR:
// A1..C1) живёт в flashcardSettingsTable.placementLevel и обновляется каждым
// прохождением теста на уровень. Именно на него ориентируются разделы «Слова»
// и «Грамматика» — и разговор со Снежей должен видеть тот же уровень, а не
// какой-то свой. loadProfile() ниже предпочитает placementLevel, а к
// knowledgeLevel обращается только если тест ещё ни разу не пройден.
//
// Интересы важнее, чем кажется: имея «футбол» и «игры», Снежа спрашивает о том,
// о чём ребёнку есть что сказать. Разговор на чужом языке и без того трудный,
// чтобы вести его о погоде.
//
// ── ГРАБЛИ: ЗВУК В ОТВЕТЕ РВАЛ ЗАПРОС НА МОБИЛЬНОЙ СЕТИ ────────────────────
// Ответ на реплику раньше содержал ГОТОВУЮ ОЗВУЧКУ прямо в JSON:
// data:audio/mp3;base64,... то есть несколько сотен килобайт на каждое
// сообщение.
//
// На вайфае это незаметно. На 3G запрос висел десятки секунд и рвался, а Safari
// сообщал ровно «Load failed» — ни кода, ни причины.
//
// Теперь маршрут отдаёт ТОЛЬКО ТЕКСТ: ответ весит около килобайта и приходит
// сразу. Звук клиент берёт вторым запросом (POST /voice-chat/speak).
//
// ── Реплика приходит двумя способами ────────────────────────────────────────
//   audioBase64 — запись голоса, её расшифровывает распознаватель;
//   text        — ученик написал руками.
//
// ── ПЕРЕВОД РЕПЛИКИ ────────────────────────────────────────────────────────
// POST /voice-chat/translate переводит реплику Снежи на русский по требованию.
// Переводится ЦЕЛАЯ реплика: у предложения контекст сам снимает
// многозначность. Перевод не хранится и в историю не попадает — иначе он
// приехал бы модели во входе, и она начала бы отвечать по-русски.
//
// ── Очки ────────────────────────────────────────────────────────────────────
// 5 очков за обмен репликами, но не больше DAILY_VOICE_POINTS_CAP в сутки.
// Очки идут и за неудачную попытку тоже: ребёнок сказал фразу, ошибся и
// повторил правильно — это РАБОТА.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { db } from "@workspace/db";
import { voiceChatSessionsTable, voiceChatMessagesTable, usersTable, flashcardSettingsTable } from "@workspace/db";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { googleTranslate } from "@workspace/translate";
import { requireAuth, getUser } from "../lib/auth";
import { startOfLocalDay } from "../lib/timeStats";
import { aiProviders, chat, geminiModelReport, hasAnyAi, speak, transcribe } from "../lib/ai";
// Тот же словарь уровней, что у ситуаций от учителя (routes/scenarios.ts).
// Раньше тут была своя копия, понимавшая только старую возрастную шкалу
// (starter/beginner/...) и вообще не знавшая букв CEFR (A1-C1) — реальный
// уровень из placement-теста тихо терялся при попытке найти его в словаре.
import { LEVEL_HINT } from "../lib/scenarioChat";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// КТО ОТВЕЧАЕТ И КАК ПРОВЕРЯЕТ
//
// Собеседник — Снежа, маскот приложения. Не «ассистент» и не «тьютор»: ребёнок
// разговаривает с тем, кого уже знает по остальным экранам.
//
// ── ОШИБКА ОСТАНАВЛИВАЕТ РАЗГОВОР ──────────────────────────────────────────
// Снежа проверяет каждую реплику. Есть ошибка — она называет её и просит
// сказать ту же фразу правильно, и разговор НЕ идёт дальше, пока фраза не
// прозвучит верно.
//
// ── РУССКАЯ РЕПЛИКА — ТОЖЕ СЛУЧАЙ ДЛЯ РАЗБОРА ──────────────────────────────
// Русская фраза считается ошибкой: в fixed уходит ЕЁ ПЕРЕВОД на английский, в
// issue — «ты написал по-русски, скажи это по-английски». Ученику остаётся
// повторить готовую английскую фразу.
//
// ── ОТВЕТ ПРИХОДИТ РАЗБОРОМ, А НЕ ТЕКСТОМ ──────────────────────────────────
// Модель обязана вернуть JSON: верна ли фраза, как она звучит правильно, что
// именно было не так (по-русски) и сама реплика Снежи. Экрану нужно ЗНАТЬ, была
// ошибка или нет — из свободного текста это не вытащить.
//
// ── ПОЧЕМУ НЕ БОЛЬШЕ ДВУХ ЗАХОДОВ ──────────────────────────────────────────
// Без предела ребёнок застревает на одной фразе навсегда. На третью попытку
// Снежа принимает фразу как есть и ведёт разговор дальше.
// ─────────────────────────────────────────────────────────────────────────────

/** Столько раз просим повторить одну и ту же фразу. Дальше принимаем как есть. */
const MAX_RETRIES = 2;

type StudentProfile = {
  name: string;
  age: number | null;
  level: string | null;
  bio: string | null;
  interests: string[];
};

/**
 * Справка о собеседнике для модели.
 *
 * Пустые поля не пишем вовсе: строка «Age: null» модель прочитает буквально и
 * начнёт про это спрашивать.
 */
function profileBlock(p: StudentProfile | null): string {
  if (!p) return "";
  const facts: string[] = [`The student's name is ${p.name}.`];
  if (p.age) facts.push(`They are ${p.age} years old.`);
  const level = p.level ? LEVEL_HINT[p.level] : null;
  if (level) facts.push(`Their English level: ${level} — keep your words that simple.`);
  if (p.interests.length > 0) {
    facts.push(`They like: ${p.interests.slice(0, 6).join(", ")}. Ask about these things.`);
  }
  if (p.bio) facts.push(`About them: ${p.bio.slice(0, 200)}`);

  return `\n\nWHAT YOU ALREADY KNOW ABOUT THE STUDENT (never ask about it again, use it naturally):\n${facts.join("\n")}`;
}

function systemPrompt(retry: number, profile: StudentProfile | null): string {
  const base = `You are Snezha (Снежа), a friendly snow leopard cub. You chat in English with a child (age 5-18) who is learning English.
Speak as Snezha in the first person. Never say you are an AI, a model, an assistant or a tutor.

You ALWAYS answer with a single JSON object and nothing else. No markdown, no code fences:
{"ok": true|false, "fixed": "...", "issue": "...", "reply": "..."}

How to fill it:
- "ok": true if the student's last message is correct English, false if it has a real mistake in grammar, word choice, word order or spelling.
- "fixed": the same sentence written correctly in English. When "ok" is true, repeat their sentence unchanged.
- "issue": ONE short sentence IN RUSSIAN naming the mistake, for a child. Empty string when "ok" is true.
- "reply": what you say out loud, ALWAYS in English, 1-3 short sentences, always finished.

When "ok" is false: in "reply" tell them warmly what to fix, say the correct sentence, and ask them to repeat it. Do NOT ask a new question and do NOT continue the topic.
When "ok" is true: reply naturally, be warm, curious and playful, and end with one simple question to keep the conversation going.

IF THE STUDENT WRITES IN RUSSIAN (or any language other than English), treat it as a mistake: set "ok" to false, put the ENGLISH TRANSLATION of what they wanted to say into "fixed", and in "issue" say in Russian that they wrote in Russian and should say the same thing in English. Stay calm and kind about it.

A single word or a name is a valid answer when the question allows it: "Sego" answering "What is your name?" is correct English, not a mistake.
Never ask the same question twice in one conversation, and never ask about something you were already told.
Be gentle. Ignore missing capital letters, missing final punctuation and obvious speech-to-text noise: the child often speaks out loud and the text comes from a recognizer. Never mock a mistake.
Use only words a child knows.`;

  const withProfile = base + profileBlock(profile);

  if (retry < MAX_RETRIES) return withProfile;

  // Третья попытка: хватит. Ребёнок уже старался, дальше это не упражнение, а
  // тупик.
  return `${withProfile}

IMPORTANT: the student has already tried this sentence several times. Set "ok" to true no matter what, praise the effort in "reply" and move the conversation on with a new question.`;
}

/** Справка о собеседнике из профиля. Ошибку глотаем: разговор важнее справки. */
async function loadProfile(userId: number): Promise<StudentProfile | null> {
  try {
    const [row] = await db
      .select({
        name: usersTable.name,
        age: usersTable.age,
        knowledgeLevel: usersTable.knowledgeLevel,
        bio: usersTable.bio,
        interests: usersTable.interests,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!row) return null;

    // Реальный уровень (CEFR, из последнего placement-теста) важнее возрастной
    // прикидки knowledgeLevel: та выставляется один раз при регистрации и
    // никогда не меняется, а тест как раз для того и существует, чтобы знать
    // настоящий уровень ученика. Нет результата теста — используем прикидку,
    // это лучше, чем совсем ничего не сказать модели про уровень.
    const [settings] = await db
      .select({ placementLevel: flashcardSettingsTable.placementLevel })
      .from(flashcardSettingsTable)
      .where(eq(flashcardSettingsTable.userId, userId));

    return {
      name: row.name,
      age: row.age ?? null,
      level: settings?.placementLevel || row.knowledgeLevel || null,
      bio: row.bio ?? null,
      interests: Array.isArray(row.interests) ? row.interests.filter((i) => typeof i === "string") : [],
    };
  } catch {
    return null;
  }
}

const POINTS_PER_VOICE_EXCHANGE = 5;

/** Дневной потолок очков за разговоры. Тот же порядок, что у слов и грамматики. */
const DAILY_VOICE_POINTS_CAP = 30;

/** Больше пяти мегабайт — это уже не реплика ребёнка, а присланный файл. */
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

/**
 * Минимальный размер записи. Полсекунды речи весит заметно больше; всё, что
 * мельче, — случайный тап по кнопке.
 */
const MIN_AUDIO_BYTES = 1200;

/** Письменная реплика длиннее этого — вставленный текст, а не фраза ребёнка. */
const MAX_TEXT_LEN = 500;

/** Столько символов озвучиваем и переводим: реплика Снежи всегда короче. */
const MAX_SPEAK_LEN = 700;

/**
 * Сколько реплик восстанавливать и сколько отдавать модели.
 *
 * Не весь разговор: он может идти неделями, а во входе модели каждая реплика
 * стоит денег и места. Двадцати хватает, чтобы помнить, о чём речь.
 */
const RESUME_LIMIT = 40;
const HISTORY_LIMIT = 20;

// ── Разбор ответа модели ────────────────────────────────────────────────────

type Verdict = {
  ok: boolean;
  fixed: string;
  issue: string;
  reply: string;
};

/**
 * Вытащить JSON из ответа модели.
 *
 * Модели то и дело оборачивают ответ в ```json или добавляют «Here is the JSON»,
 * при всём том, что их об этом просили не делать. Поэтому берём подстроку от
 * первой «{» до последней «}».
 *
 * НЕ РАЗОБРАЛОСЬ — не ошибка: весь текст считается репликой, а фраза ученика
 * верной. Потерять ответ целиком из-за формата хуже, чем один раз не заметить
 * ошибку в грамматике.
 */
function parseVerdict(raw: string): Verdict {
  const fallback: Verdict = { ok: true, fixed: "", issue: "", reply: raw.trim() };

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return fallback;

  try {
    const data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const reply = typeof data["reply"] === "string" ? data["reply"].trim() : "";
    if (!reply) return fallback;

    return {
      // Явное false и только оно означает ошибку: пропущенное поле — «всё
      // хорошо», иначе на любой заминке модели ребёнок получал бы придирку.
      ok: data["ok"] !== false,
      fixed: typeof data["fixed"] === "string" ? data["fixed"].trim() : "",
      issue: typeof data["issue"] === "string" ? data["issue"].trim() : "",
      reply,
    };
  } catch {
    return fallback;
  }
}

/** Сколько очков за разговоры уже начислено сегодня. */
async function voicePointsToday(userId: number): Promise<number> {
  try {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${voiceChatSessionsTable.pointsEarned}), 0)::int` })
      .from(voiceChatSessionsTable)
      .where(and(
        eq(voiceChatSessionsTable.studentId, userId),
        gte(voiceChatSessionsTable.updatedAt, startOfLocalDay()),
      ));
    return Number(row?.total ?? 0);
  } catch {
    // Не смогли посчитать — начисляем как обычно: потолок это защита от
    // накрутки, а не повод отменить награду за честную работу.
    return 0;
  }
}

router.get("/voice-chat/sessions", requireAuth, async (req, res) => {
  const user = getUser(req);
  const studentId = req.query["studentId"] ? Number(req.query["studentId"]) : null;

  const targetId = (user.role === "admin" || user.role === "parent") && studentId
    ? studentId
    : user.userId;

  const sessions = await db.select({
    id: voiceChatSessionsTable.id,
    studentId: voiceChatSessionsTable.studentId,
    studentName: usersTable.name,
    messageCount: voiceChatSessionsTable.messageCount,
    pointsEarned: voiceChatSessionsTable.pointsEarned,
    createdAt: voiceChatSessionsTable.createdAt,
    updatedAt: voiceChatSessionsTable.updatedAt,
  }).from(voiceChatSessionsTable)
    .leftJoin(usersTable, eq(voiceChatSessionsTable.studentId, usersTable.id))
    .where(eq(voiceChatSessionsTable.studentId, targetId));

  res.json(sessions);
});

// ── Последний разговор с репликами ──────────────────────────────────────────
//
// Этим экран восстанавливается после перезагрузки страницы. Отдельный маршрут, а
// не «список сессий, потом сессия по номеру»: клиенту нужен ровно последний
// разговор, и два запроса подряд ради этого — лишний обмен на медленной сети.
//
// Пустой ответ (session: null) — законное состояние: ученик здесь впервые.
router.get("/voice-chat/latest", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const user = getUser(req);

  const [session] = await db
    .select({
      id: voiceChatSessionsTable.id,
      messageCount: voiceChatSessionsTable.messageCount,
      pointsEarned: voiceChatSessionsTable.pointsEarned,
      createdAt: voiceChatSessionsTable.createdAt,
      updatedAt: voiceChatSessionsTable.updatedAt,
    })
    .from(voiceChatSessionsTable)
    .where(eq(voiceChatSessionsTable.studentId, user.userId))
    .orderBy(desc(voiceChatSessionsTable.updatedAt))
    .limit(1);

  if (!session) {
    res.json({ session: null, messages: [] });
    return;
  }

  // Берём ХВОСТ разговора: он может быть длинным, а нужны последние реплики.
  // Сортируем по убыванию, режем и переворачиваем — иначе пришлось бы тащить
  // всё и отрезать на клиенте.
  const tail = await db
    .select({
      id: voiceChatMessagesTable.id,
      role: voiceChatMessagesTable.role,
      transcript: voiceChatMessagesTable.transcript,
      createdAt: voiceChatMessagesTable.createdAt,
    })
    .from(voiceChatMessagesTable)
    .where(eq(voiceChatMessagesTable.sessionId, session.id))
    .orderBy(desc(voiceChatMessagesTable.createdAt))
    .limit(RESUME_LIMIT);

  res.json({ session, messages: tail.reverse() });
});

// ── Готов ли раздел к работе ────────────────────────────────────────────────
//
// Экран спрашивает это ДО первой записи: иначе ученик говорит вслух, ждёт
// ответа и только потом узнаёт, что раздел не настроен.
router.get("/voice-chat/status", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const providers = aiProviders();

  if (!hasAnyAi()) {
    res.json({
      ready: false,
      providers,
      reason: "Не задан ключ GOOGLE_AI_API_KEY — без него Снеже нечем отвечать",
    });
    return;
  }

  if (req.query["probe"] !== "1") {
    res.json({ ready: true, providers });
    return;
  }

  const report = await geminiModelReport(req.log, req.query["fresh"] === "1");

  const outcome = await chat({
    system: "You are a test probe. Reply with the single word OK.",
    history: [],
    message: "Say OK.",
    log: req.log,
  });
  if (outcome.ok) {
    res.json({
      ready: true,
      providers,
      probe: "ok",
      provider: outcome.provider,
      model: outcome.model,
      answer: outcome.text.slice(0, 80),
      models: report,
    });
    return;
  }
  res.json({
    ready: false,
    providers,
    probe: "failed",
    tried: outcome.tried,
    reason: outcome.detail,
    models: report,
  });
});

// ── Что видит наш ключ ──────────────────────────────────────────────────────
router.get("/voice-chat/models", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!hasAnyAi()) {
    res.json({ error: "Не задан ключ GOOGLE_AI_API_KEY", listed: 0, chat: [], tts: [], generateContent: [] });
    return;
  }
  res.json(await geminiModelReport(req.log, req.query["fresh"] === "1"));
});

// ── Перевод реплики на русский ──────────────────────────────────────────────
//
// Работает БЕЗ ключей ИИ: перевод идёт через @workspace/translate, тем же путём,
// что переводы примеров в карточках.
router.post("/voice-chat/translate", requireAuth, async (req, res) => {
  const { text } = req.body as { text?: unknown };
  const value = typeof text === "string" ? text.trim() : "";

  if (!value) {
    res.status(400).json({ error: "Нечего переводить" });
    return;
  }
  if (value.length > MAX_SPEAK_LEN) {
    res.status(413).json({ error: "Слишком длинный текст для перевода" });
    return;
  }

  const ru = await googleTranslate(value, "en", "ru");
  if (!ru) {
    req.log.warn({ length: value.length }, "Перевод реплики не удался");
    res.status(502).json({
      error: "Не удалось перевести. Попробуй ещё раз.",
      detail: "Переводчик не ответил",
    });
    return;
  }

  res.json({ text: ru });
});

// ── Озвучить текст ──────────────────────────────────────────────────────────
//
// ЕДИНСТВЕННЫЙ путь к звуку: ответ на реплику озвучку больше не содержит.
router.post("/voice-chat/speak", requireAuth, async (req, res) => {
  const { text } = req.body as { text?: unknown };
  const value = typeof text === "string" ? text.trim() : "";

  if (!value) {
    res.status(400).json({ error: "Нечего озвучивать" });
    return;
  }
  if (value.length > MAX_SPEAK_LEN) {
    res.status(413).json({ error: "Слишком длинный текст для озвучки" });
    return;
  }

  const voice = await speak({ text: value, log: req.log });
  if (!voice.ok) {
    req.log.warn({ tried: voice.tried, detail: voice.detail }, "Озвучка не удалась");
    res.status(502).json({
      error: "Не удалось озвучить ответ.",
      detail: voice.detail,
      tried: voice.tried,
    });
    return;
  }

  res.json({ audioUrl: voice.dataUrl, provider: voice.provider });
});

router.post("/voice-chat/sessions", requireAuth, async (req, res) => {
  const user = getUser(req);
  const [session] = await db.insert(voiceChatSessionsTable).values({
    studentId: user.userId,
    messageCount: 0,
    pointsEarned: 0,
  }).returning();

  const [userData] = await db.select({ name: usersTable.name })
    .from(usersTable).where(eq(usersTable.id, user.userId));

  res.status(201).json({
    ...session,
    studentName: userData?.name || "",
  });
});

router.get("/voice-chat/sessions/:id", requireAuth, async (req, res) => {
  const id = Number(req.params["id"]);

  const [session] = await db.select({
    id: voiceChatSessionsTable.id,
    studentId: voiceChatSessionsTable.studentId,
    studentName: usersTable.name,
    messageCount: voiceChatSessionsTable.messageCount,
    pointsEarned: voiceChatSessionsTable.pointsEarned,
    createdAt: voiceChatSessionsTable.createdAt,
    updatedAt: voiceChatSessionsTable.updatedAt,
  }).from(voiceChatSessionsTable)
    .leftJoin(usersTable, eq(voiceChatSessionsTable.studentId, usersTable.id))
    .where(eq(voiceChatSessionsTable.id, id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const messages = await db.select().from(voiceChatMessagesTable)
    .where(eq(voiceChatMessagesTable.sessionId, id))
    .orderBy(voiceChatMessagesTable.createdAt);

  res.json({ ...session, messages });
});

router.post("/voice-chat/sessions/:id/messages", requireAuth, async (req, res) => {
  const sessionId = Number(req.params["id"]);
  const user = getUser(req);
  const { audioBase64, mimeType, text, retry } = req.body as {
    audioBase64?: unknown;
    mimeType?: unknown;
    text?: unknown;
    /** Сколько раз ученик уже пробовал сказать ЭТУ фразу. Считает клиент. */
    retry?: unknown;
  };

  const written = typeof text === "string" ? text.trim() : "";
  const hasAudio = typeof audioBase64 === "string" && audioBase64.length > 0;
  // Счётчику попыток верим от клиента: врать себе в свою же сторону смысла нет,
  // а серверу хранить его негде — в таблице сообщений такого поля не существует.
  const attempt = Number.isFinite(Number(retry)) ? Math.max(0, Math.min(9, Number(retry))) : 0;

  if (!hasAudio && !written) {
    res.status(400).json({ error: "Реплика не пришла: нужна запись или текст" });
    return;
  }
  if (written.length > MAX_TEXT_LEN) {
    res.status(413).json({ error: "Слишком длинная реплика. Напиши покороче — одной-двумя фразами." });
    return;
  }

  // Чужую сессию дописывать нельзя: номер сессии приходит из адреса.
  const [session] = await db.select({
    id: voiceChatSessionsTable.id,
    studentId: voiceChatSessionsTable.studentId,
    messageCount: voiceChatSessionsTable.messageCount,
    pointsEarned: voiceChatSessionsTable.pointsEarned,
  }).from(voiceChatSessionsTable).where(eq(voiceChatSessionsTable.id, sessionId));

  if (!session) {
    res.status(404).json({ error: "Разговор не найден" });
    return;
  }
  if (session.studentId !== user.userId) {
    res.status(403).json({ error: "Это чужой разговор" });
    return;
  }

  if (!hasAnyAi()) {
    res.status(503).json({
      error: "Снежа не настроена: на сервере нет ключа доступа к ИИ.",
    });
    return;
  }

  // ── Реплика ученика: из текста или из записи ──
  let studentTranscript = written;

  if (!studentTranscript) {
    const audioBuffer = Buffer.from(String(audioBase64), "base64");
    if (audioBuffer.length === 0) {
      res.status(400).json({ error: "Запись пустая — скажи фразу вслух и попробуй снова" });
      return;
    }
    if (audioBuffer.length < MIN_AUDIO_BYTES) {
      res.status(422).json({
        error: "Запись слишком короткая. Держи кнопку дольше: скажи целую фразу, потом нажми «Стоп».",
      });
      return;
    }
    if (audioBuffer.length > MAX_AUDIO_BYTES) {
      res.status(413).json({ error: "Запись слишком длинная. Говори покороче — одной-двумя фразами." });
      return;
    }

    const heard = await transcribe({
      audio: audioBuffer,
      declaredMime: mimeType,
      log: req.log,
    });

    if (!heard.ok) {
      req.log.error(
        { tried: heard.tried, detail: heard.detail, format: heard.format.ext },
        "Запись не расшифрована ни одним поставщиком",
      );
      res.status(502).json({
        error: "Не удалось разобрать запись. Попробуй сказать ещё раз или переключись на «Писать».",
        detail: heard.detail,
        tried: heard.tried,
      });
      return;
    }

    studentTranscript = heard.text.trim();
    if (!studentTranscript) {
      res.status(422).json({ error: "В записи не слышно речи. Скажи фразу вслух и попробуй снова." });
      return;
    }
  }

  // ── Контекст разговора ──
  //
  // Хвост, а не весь разговор: он может идти неделями, и каждая реплика во
  // входе модели стоит денег и места.
  const previousMessages = await db
    .select({
      role: voiceChatMessagesTable.role,
      transcript: voiceChatMessagesTable.transcript,
      createdAt: voiceChatMessagesTable.createdAt,
    })
    .from(voiceChatMessagesTable)
    .where(eq(voiceChatMessagesTable.sessionId, sessionId))
    .orderBy(desc(voiceChatMessagesTable.createdAt))
    .limit(HISTORY_LIMIT);

  const history = previousMessages.reverse().map((m) => ({
    role: m.role === "student" ? "user" as const : "assistant" as const,
    content: m.transcript,
  }));

  // ── Разбор и ответ Снежи ──
  //
  // Профиль тянем параллельно истории: он нужен, чтобы Снежа не переспрашивала
  // имя, но ждать его отдельным кругом незачем.
  const profile = await loadProfile(user.userId);

  const outcome = await chat({
    system: systemPrompt(attempt, profile),
    history,
    message: studentTranscript,
    log: req.log,
  });
  if (!outcome.ok) {
    req.log.error({ tried: outcome.tried, detail: outcome.detail }, "Ни одна модель не ответила");
    res.status(502).json({
      error: "Снежа не ответила.",
      detail: outcome.detail,
      tried: outcome.tried,
    });
    return;
  }

  const verdict = parseVerdict(outcome.text);
  const aiTranscript = verdict.reply;
  // Ошибка есть, но заходов больше не даём — экран не должен просить повтор.
  const needsRetry = !verdict.ok && attempt < MAX_RETRIES;

  // ── Записываем обе реплики ──
  //
  // В историю идёт то, что ученик сказал НА САМОМ ДЕЛЕ, а не исправленная
  // версия: это запись разговора, а не протокол того, как надо было.
  //
  // audioUrl всегда null: озвучка едет отдельным запросом.
  const [studentMsg] = await db.insert(voiceChatMessagesTable).values({
    sessionId,
    role: "student",
    audioUrl: null,
    transcript: studentTranscript,
  }).returning();

  const [aiMsg] = await db.insert(voiceChatMessagesTable).values({
    sessionId,
    role: "ai",
    audioUrl: null,
    transcript: aiTranscript,
  }).returning();

  // ── Очки: ставка за обмен, дальше дневной потолок ──
  const earnedToday = await voicePointsToday(user.userId);
  const pointsEarned = Math.max(
    0,
    Math.min(POINTS_PER_VOICE_EXCHANGE, DAILY_VOICE_POINTS_CAP - earnedToday),
  );

  await db.update(voiceChatSessionsTable)
    .set({
      messageCount: (session.messageCount || 0) + 2,
      pointsEarned: (session.pointsEarned || 0) + pointsEarned,
      updatedAt: new Date(),
    })
    .where(eq(voiceChatSessionsTable.id, sessionId));

  if (pointsEarned > 0) {
    const [userData] = await db.select({ totalPoints: usersTable.totalPoints })
      .from(usersTable).where(eq(usersTable.id, user.userId));
    await db.update(usersTable)
      .set({ totalPoints: (userData?.totalPoints || 0) + pointsEarned })
      .where(eq(usersTable.id, user.userId));
  }

  res.json({
    studentMessage: studentMsg,
    aiMessage: aiMsg,
    pointsEarned,
    pointsToday: earnedToday + pointsEarned,
    pointsCap: DAILY_VOICE_POINTS_CAP,
    correction: {
      ok: verdict.ok,
      fixed: verdict.ok ? "" : verdict.fixed,
      issue: verdict.ok ? "" : verdict.issue,
      needsRetry,
      attempt,
      maxRetries: MAX_RETRIES,
    },
    provider: outcome.provider,
    model: outcome.model,
  });
});

export default router;
