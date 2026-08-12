// ─────────────────────────────────────────────────────────────────────────────
// Разговор с AI-тьютором: расшифровка речи, ответ и озвучка.
//
// Порядок работы: запись ученика → whisper переводит её в текст → языковая
// модель отвечает как детский преподаватель → tts озвучивает ответ. Всё за один
// запрос: дробить на три было бы втрое больше кругов по сети на одну реплику.
//
// ── ГРАБЛИ: имя файла решает всё ────────────────────────────────────────────
// Whisper определяет формат записи по РАСШИРЕНИЮ ИМЕНИ ФАЙЛА, а не по
// содержимому. Раньше имя было прошито как «audio.m4a», а браузер пишет webm или
// mp4 — и запись отвергалась как битая. Наружу это выходило не ошибкой, а
// бессмысленным ответом: расшифровка подменялась заглушкой, модель отвечала на
// заглушку, и раздел выглядел неработающим.
//
// Поэтому клиент присылает НАСТОЯЩИЙ тип записи, а имя собирается из него.
//
// ── Молчаливых заглушек больше нет ──────────────────────────────────────────
// Без ключа OpenAI раздел раньше отвечал одной и той же заготовкой на любую
// реплику: формально работает, на деле — нет. Теперь это честный отказ с
// внятной причиной, и его видно в интерфейсе.
//
// ── Очки ────────────────────────────────────────────────────────────────────
// 5 очков за обмен репликами, но не больше DAILY_VOICE_POINTS_CAP в сутки —
// как в словах и грамматике. Без потолка разговор был единственным местом, где
// очки капали бесконечно, и качать их болтовнёй было выгоднее любой учёбы.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { db } from "@workspace/db";
import { voiceChatSessionsTable, voiceChatMessagesTable, usersTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";
import { startOfLocalDay } from "../lib/timeStats";
import OpenAI, { toFile } from "openai";

const router = Router();

function getOpenAI(): OpenAI | null {
  const apiKey = process.env["OPENAI_API_KEY"] || process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  const baseURL = process.env["OPENAI_API_BASE"] || process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

const POINTS_PER_VOICE_EXCHANGE = 5;

/** Дневной потолок очков за разговоры. Тот же порядок, что у слов и грамматики. */
const DAILY_VOICE_POINTS_CAP = 30;

/** Больше пяти мегабайт — это уже не реплика ребёнка, а присланный файл. */
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

/**
 * Расширение файла по типу записи.
 *
 * Ключ — тип без параметров: браузер присылает «audio/webm;codecs=opus», а
 * решает здесь только первая часть.
 */
const EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/oga": "ogg",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
};

/** Имя файла для whisper. Неизвестный тип считаем m4a: так пишут телефоны. */
function audioFileName(mimeType: unknown): string {
  const base = String(mimeType ?? "").split(";")[0]!.trim().toLowerCase();
  return `audio.${EXT_BY_MIME[base] ?? "m4a"}`;
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

// ── Готов ли раздел к работе ────────────────────────────────────────────────
//
// Экран спрашивает это ДО первой записи. Иначе ученик говорит вслух, ждёт
// ответа и только потом узнаёт, что тьютор не настроен, — а запись уже потрачена.
router.get("/voice-chat/status", requireAuth, async (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ ready: getOpenAI() !== null });
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
  const { audioBase64, mimeType } = req.body as { audioBase64?: unknown; mimeType?: unknown };

  if (typeof audioBase64 !== "string" || !audioBase64) {
    res.status(400).json({ error: "Запись не пришла" });
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

  const openai = getOpenAI();
  if (!openai) {
    // Честный отказ вместо заготовки. Раньше тьютор отвечал одно и то же на
    // любую реплику, и понять, что ключа просто нет, было невозможно.
    res.status(503).json({
      error: "Голосовой тьютор не настроен: на сервере нет ключа OPENAI_API_KEY.",
    });
    return;
  }

  const audioBuffer = Buffer.from(audioBase64, "base64");
  if (audioBuffer.length === 0) {
    res.status(400).json({ error: "Запись пустая — скажи фразу вслух и попробуй снова" });
    return;
  }
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    res.status(413).json({ error: "Запись слишком длинная. Говори покороче — одной-двумя фразами." });
    return;
  }

  // ── Речь в текст ──
  let studentTranscript = "";
  try {
    const audioFile = await toFile(audioBuffer, audioFileName(mimeType), {
      type: String(mimeType ?? "audio/m4a").split(";")[0],
    });
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "en",
    });
    studentTranscript = (transcription.text ?? "").trim();
  } catch (err) {
    req.log.error({ err }, "Failed to transcribe audio");
    // Раньше здесь подставлялась заглушка, модель отвечала на неё, и ученик
    // получал бессмысленный ответ вместо объяснения. Ошибку надо назвать.
    res.status(502).json({ error: "Не удалось разобрать запись. Попробуй сказать ещё раз, чуть ближе к микрофону." });
    return;
  }

  if (!studentTranscript) {
    res.status(422).json({ error: "В записи не слышно речи. Скажи фразу вслух и попробуй снова." });
    return;
  }

  // ── Контекст разговора ──
  const previousMessages = await db.select().from(voiceChatMessagesTable)
    .where(eq(voiceChatMessagesTable.sessionId, sessionId))
    .orderBy(voiceChatMessagesTable.createdAt);

  const conversationHistory = previousMessages.slice(-10).map(m => ({
    role: m.role === "student" ? "user" as const : "assistant" as const,
    content: m.transcript,
  }));

  // ── Ответ тьютора ──
  let aiTranscript = "";
  let aiAudioUrl: string | null = null;
  try {
    const chatResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a friendly and encouraging English language tutor for children (ages 5-18). 
Help students improve their English speaking skills through natural conversation.
Keep responses short (1-3 sentences), encouraging, and age-appropriate.
Gently correct grammar mistakes by modeling correct usage in your response.
Always respond in English. Ask simple questions to keep the conversation going.`,
        },
        ...conversationHistory,
        { role: "user", content: studentTranscript },
      ],
    });
    aiTranscript = (chatResponse.choices[0]?.message?.content ?? "").trim();
  } catch (err) {
    req.log.error({ err }, "Failed to get AI response");
    res.status(502).json({ error: "Тьютор не ответил. Попробуй ещё раз через минуту." });
    return;
  }

  if (!aiTranscript) {
    res.status(502).json({ error: "Тьютор не ответил. Попробуй ещё раз через минуту." });
    return;
  }

  // Озвучка — не обязательна: текст ответа уже есть, и молчаливый ответ лучше,
  // чем потерянная реплика.
  try {
    const ttsResponse = await openai.audio.speech.create({
      model: "tts-1",
      voice: "nova",
      input: aiTranscript,
    });
    const audioArrayBuffer = await ttsResponse.arrayBuffer();
    aiAudioUrl = `data:audio/mp3;base64,${Buffer.from(audioArrayBuffer).toString("base64")}`;
  } catch (err) {
    req.log.error({ err }, "Failed to synthesize speech");
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
  });
});

export default router;
