// ─────────────────────────────────────────────────────────────────────────────
// Разговор с AI-тьютором: реплика ученика → ответ модели → озвучка.
//
// ── Про поставщиков здесь НИЧЕГО нет ────────────────────────────────────────
// Раньше маршрут напрямую знал про поставщика: и модель ответа, и
// распознавание, и озвучку. Стоило понадобиться другому — и правка задевала
// проверку прав, очки и журнал, которые к ИИ отношения не имеют.
//
// Теперь всё это за общим слоем (lib/ai.ts): маршрут просит «ответь»,
// «расшифруй», «озвучь». Кто именно это сделал — Gemini или Deepgram —
// маршрут не знает и знать не должен. Порядок поставщиков, выбор модели и
// разбор их ошибок живут в одном месте.
//
// ── Реплика приходит двумя способами ────────────────────────────────────────
//   audioBase64 — запись голоса, её расшифровывает распознаватель;
//   text        — ученик написал руками.
//
// Дальше пути сходятся: ответ модели, озвучка, очки и журнал одинаковы. Письмо
// нужно не только для удобства (шумно, стесняется, нет микрофона) — оно ещё и
// обходит распознавание речи целиком, поэтому по нему видно, работает ли
// остальная часть раздела, когда микрофон подводит.
//
// ── ОЗВУЧКА НЕ ОБЯЗАТЕЛЬНА, НО И НЕ ОДНОРАЗОВА ─────────────────────────────
// Синтез иногда не удаётся: у моделей озвучки Gemini жёсткие лимиты, у
// Deepgram кончается квота. Терять из-за этого весь ответ нельзя — текст уже
// есть, и молчаливый ответ лучше потерянного.
//
// Но раньше такая реплика оставалась без звука НАВСЕГДА: аудио клали в базу
// вместе с сообщением, и второй попытки не существовало. Отсюда
// POST /voice-chat/speak: нажатие на реплику синтезирует её заново. Это же
// снимает нагрузку с ответа — озвучка перестала быть единственным шансом.
//
// ── Причина отказа уходит НАРУЖУ ────────────────────────────────────────────
// Ключ есть, а модель недоступна; квота кончилась; формат записи не принят —
// для ученика это всё выглядело одинаково: «тьютор не ответил». Поэтому в
// ответе есть поле detail с текстом ошибки от поставщика, и экран его
// показывает. Секретного там нет: «model not found», «quota exceeded».
//
// Причина приходит СРАЗУ ПО ВСЕМ попыткам: «модель: ошибка | модель: ошибка».
// Пока показывалась только последняя, отладка сводилась к угадыванию — именно
// на этом мы потеряли заход с выключенными моделями Google.
//
// ── Очки ────────────────────────────────────────────────────────────────────
// 5 очков за обмен репликами, но не больше DAILY_VOICE_POINTS_CAP в сутки —
// как в словах и грамматике. Без потолка разговор был единственным местом, где
// очки капали бесконечно.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { db } from "@workspace/db";
import { voiceChatSessionsTable, voiceChatMessagesTable, usersTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";
import { startOfLocalDay } from "../lib/timeStats";
import { aiProviders, chat, geminiModelReport, hasAnyAi, speak, transcribe } from "../lib/ai";

const router = Router();

const SYSTEM_PROMPT = `You are a friendly and encouraging English language tutor for children (ages 5-18).
Help students improve their English speaking skills through natural conversation.
Keep responses short (1-3 sentences), encouraging, and age-appropriate.
Gently correct grammar mistakes by modeling correct usage in your response.
Always respond in English. Ask simple questions to keep the conversation going.`;

const POINTS_PER_VOICE_EXCHANGE = 5;

/** Дневной потолок очков за разговоры. Тот же порядок, что у слов и грамматики. */
const DAILY_VOICE_POINTS_CAP = 30;

/** Больше пяти мегабайт — это уже не реплика ребёнка, а присланный файл. */
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

/**
 * Минимальный размер записи.
 *
 * Полсекунды речи в любом из используемых форматов весит заметно больше. Всё,
 * что мельче, — это случайный тап по кнопке: распознаватель на таком файле
 * отвечает ошибкой, и ученик видел «не удалось разобрать запись» вместо «ты
 * ничего не сказал».
 */
const MIN_AUDIO_BYTES = 1200;

/** Письменная реплика длиннее этого — вставленный текст, а не фраза ребёнка. */
const MAX_TEXT_LEN = 500;

/** Столько символов озвучиваем по требованию: ответ тьютора всегда короче. */
const MAX_SPEAK_LEN = 700;

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

// ── Готов ли раздел к работе ────────────────────────────────────────────────
//
// Экран спрашивает это ДО первой записи: иначе ученик говорит вслух, ждёт
// ответа и только потом узнаёт, что тьютор не настроен.
//
// ?probe=1 — проверка ЖИВЫМ запросом: какой поставщик и какая модель отвечают,
// а если никто — что именно они сказали и какие модели вообще доступны ключу.
// Нужна, чтобы разбираться без доступа к логам сервера.
router.get("/voice-chat/status", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const providers = aiProviders();

  if (!hasAnyAi()) {
    // Названа ровно одна переменная, потому что отвечать умеет только Gemini.
    // DEEPGRAM_API_KEY здесь не помощник: он про речь, а не про разговор.
    res.json({
      ready: false,
      providers,
      reason: "Не задан ключ GOOGLE_AI_API_KEY — без него тьютору нечем отвечать",
    });
    return;
  }

  if (req.query["probe"] !== "1") {
    res.json({ ready: true, providers });
    return;
  }

  // Список моделей — в ответ проверки всегда: «модель не найдена» без того, что
  // НАЙДЕНО, ничего не объясняет.
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
//
// Отдельно от проверки: список моделей нужен и когда всё работает — например,
// чтобы выбрать имя для GOOGLE_AI_CHAT_MODEL. Живого запроса к модели здесь
// нет, поэтому вызов бесплатный.
router.get("/voice-chat/models", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!hasAnyAi()) {
    res.json({ error: "Не задан ключ GOOGLE_AI_API_KEY", listed: 0, chat: [], tts: [], generateContent: [] });
    return;
  }
  res.json(await geminiModelReport(req.log, req.query["fresh"] === "1"));
});

// ── Озвучить текст по требованию ────────────────────────────────────────────
//
// Нужен, когда синтез при ответе не удался: ученик нажимает на реплику, и она
// озвучивается со второй попытки. Отдельный маршрут, а не поле сообщения,
// потому что причины отказа временные — лимит, квота, недоступная модель, — и
// повтор через минуту обычно проходит.
//
// Ответ отдаётся data-URL, как и при обычном обмене: клиент уже умеет его
// играть, и хранить лишний файл на диске не нужно.
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
    req.log.warn({ tried: voice.tried, detail: voice.detail }, "Озвучка по требованию не удалась");
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
  const { audioBase64, mimeType, text } = req.body as {
    audioBase64?: unknown;
    mimeType?: unknown;
    text?: unknown;
  };

  const written = typeof text === "string" ? text.trim() : "";
  const hasAudio = typeof audioBase64 === "string" && audioBase64.length > 0;

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
    // Честный отказ вместо заготовки. Раньше тьютор отвечал одно и то же на
    // любую реплику, и понять, что ключа просто нет, было невозможно.
    res.status(503).json({
      error: "Тьютор не настроен: на сервере нет ключа доступа к ИИ.",
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
  const previousMessages = await db.select().from(voiceChatMessagesTable)
    .where(eq(voiceChatMessagesTable.sessionId, sessionId))
    .orderBy(voiceChatMessagesTable.createdAt);

  const history = previousMessages.slice(-10).map((m) => ({
    role: m.role === "student" ? "user" as const : "assistant" as const,
    content: m.transcript,
  }));

  // ── Ответ тьютора ──
  const outcome = await chat({
    system: SYSTEM_PROMPT,
    history,
    message: studentTranscript,
    log: req.log,
  });
  if (!outcome.ok) {
    req.log.error({ tried: outcome.tried, detail: outcome.detail }, "Ни одна модель не ответила");
    res.status(502).json({
      error: "Тьютор не ответил.",
      detail: outcome.detail,
      tried: outcome.tried,
    });
    return;
  }
  const aiTranscript = outcome.text;

  // Озвучка — не обязательна: текст ответа уже есть, и молчаливый ответ лучше,
  // чем потерянная реплика. Написавшему её тоже даём: слышать, как звучит
  // ответ, полезно и в письменном режиме. Не вышло — реплику можно озвучить
  // нажатием (POST /voice-chat/speak).
  const voice = await speak({ text: aiTranscript, log: req.log });
  const aiAudioUrl = voice.ok ? voice.dataUrl : null;
  if (!voice.ok) {
    req.log.warn({ tried: voice.tried, detail: voice.detail }, "Ответ остался без озвучки");
  }

  // ── Записываем обе реплики ──
  const [studentMsg] = await db.insert(voiceChatMessagesTable).values({
    sessionId,
    role: "student",
    audioUrl: null,
    transcript: studentTranscript,
  }).returning();

  const [aiMsg] = await db.insert(voiceChatMessagesTable).values({
    sessionId,
    role: "ai",
    audioUrl: aiAudioUrl,
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
    // Кто ответил. Не украшение: по этому полю видно, что переключение
    // поставщика реально состоялось, без чтения логов.
    provider: outcome.provider,
    model: outcome.model,
    // Почему ответ без звука. Экран это не показывает, но при разборе видно
    // сразу: «нет ключа», «квота», «нет модели озвучки».
    speechDetail: voice.ok ? undefined : voice.detail,
  });
});

export default router;
