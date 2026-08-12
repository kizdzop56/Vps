// ─────────────────────────────────────────────────────────────────────────────
// Разговор с AI-тьютором: расшифровка речи, ответ и озвучка.
//
// Порядок работы: реплика ученика → ответ языковой модели → озвучка ответа.
// Всё за один запрос: дробить на три было бы втрое больше кругов по сети на
// одну реплику.
//
// ── Реплика приходит двумя способами ────────────────────────────────────────
//   audioBase64 — запись голоса, её расшифровывает whisper;
//   text        — ученик написал руками.
//
// Дальше пути сходятся: ответ модели, озвучка, очки и журнал одинаковы. Письмо
// нужно не только для удобства (шумно, стесняется, нет микрофона) — оно ещё и
// обходит распознавание речи целиком, поэтому по нему видно, работает ли
// остальная часть раздела, когда микрофон подводит.
//
// ── ГРАБЛИ: ФОРМАТ ЗАПИСИ НЕЛЬЗЯ БРАТЬ ИЗ ЗАЯВЛЕННОГО ТИПА ──────────────────
// Whisper определяет формат по РАСШИРЕНИЮ ИМЕНИ ФАЙЛА, а не по содержимому.
// Сначала имя было прошито как «audio.m4a» — браузер пишет webm, и запись
// отвергалась. Починили, стали собирать имя из mimeType, присланного клиентом.
// Не помогло, и вот почему:
//
//   SAFARI НА IPHONE ВРЁТ О ФОРМАТЕ. MediaRecorder.isTypeSupported("audio/webm")
//   отвечает true, recorder.mimeType тоже говорит webm, а на выходе получается
//   mp4/aac. Файл называется audio.webm, внутри mp4 — whisper отказывается его
//   читать, и наружу это выходит как «не удалось разобрать запись».
//
// Поэтому формат теперь читается ИЗ САМИХ БАЙТОВ (см. sniffAudioExt). Заявленный
// тип остаётся только запасным вариантом, когда сигнатура неизвестна.
//
// ── ГРАБЛИ: МОДЕЛЬ МОЖЕТ БЫТЬ НЕДОСТУПНА ────────────────────────────────────
// Ключ OpenAI есть, а «gpt-4o-mini» на нём не открыта — или запрос идёт через
// прокси, где своя витрина моделей. Ответ на такой запрос — ошибка, и раньше
// наружу уходило безликое «Тьютор не ответил»: причина оставалась только в
// логах, а ученик видел неработающий раздел.
//
// Теперь модели перебираются по списку (CHAT_MODELS), и если не ответила ни
// одна, наружу идёт ТЕКСТ ОШИБКИ от OpenAI. Он не секретный: там написано
// «model not found» или «insufficient quota», и это ровно то, что нужно знать.
//
// ── Молчаливых заглушек нет ─────────────────────────────────────────────────
// Без ключа раздел раньше отвечал одной и той же заготовкой на любую реплику:
// формально работает, на деле — нет. Теперь это честный отказ, и его видно в
// интерфейсе (GET /voice-chat/status).
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
import OpenAI, { toFile } from "openai";

const router = Router();

function getOpenAI(): OpenAI | null {
  const apiKey = process.env["OPENAI_API_KEY"] || process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  const baseURL = process.env["OPENAI_API_BASE"] || process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

/**
 * Модели для ответа тьютора, в порядке предпочтения.
 *
 * Первой идёт заданная в окружении: если прокси знает только своё имя модели,
 * его достаточно прописать переменной, не трогая код. Дальше — самые
 * распространённые. Перебор нужен потому, что «модель не найдена» и «ключ не
 * работает» выглядят для ученика одинаково, а причины разные.
 */
const CHAT_MODELS = [
  process.env["OPENAI_CHAT_MODEL"],
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1-mini",
  "gpt-3.5-turbo",
].filter((m): m is string => !!m);

/** Модель озвучки: тоже может отсутствовать у прокси. */
const TTS_MODEL = process.env["OPENAI_TTS_MODEL"] || "tts-1";

/** Модель расшифровки речи. */
const STT_MODEL = process.env["OPENAI_STT_MODEL"] || "whisper-1";

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
 * что мельче, — это случайный тап по кнопке: whisper на таком файле отвечает
 * ошибкой, и ученик видел «не удалось разобрать запись» вместо «ты ничего не
 * сказал».
 */
const MIN_AUDIO_BYTES = 1200;

/** Письменная реплика длиннее этого — вставленный текст, а не фраза ребёнка. */
const MAX_TEXT_LEN = 500;

/**
 * Короткое человеческое описание ошибки от OpenAI.
 *
 * Уходит в интерфейс, поэтому обрезается: полный ответ библиотеки бывает в
 * несколько экранов, и ученику от него никакой пользы.
 */
function errorDetail(err: unknown): string {
  const anyErr = err as any;
  const raw =
    anyErr?.error?.message ??
    anyErr?.response?.data?.error?.message ??
    anyErr?.message ??
    String(err);
  return String(raw).slice(0, 300);
}

// ── Определение формата ─────────────────────────────────────────────────────

/** Расширения, которые понимает whisper. */
type AudioExt = "webm" | "mp4" | "m4a" | "ogg" | "wav" | "mp3" | "flac";

/** Расширение по заявленному типу. Запасной путь, если сигнатура неизвестна. */
const EXT_BY_MIME: Record<string, AudioExt> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/oga": "ogg",
  "audio/mp4": "mp4",
  "video/mp4": "mp4",
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

/** Тип без параметров: «audio/webm;codecs=opus» → «audio/webm». */
function baseMime(mimeType: unknown): string {
  return String(mimeType ?? "").split(";")[0]!.trim().toLowerCase();
}

/**
 * Формат по сигнатуре файла.
 *
 * Единственный надёжный способ: заявленному типу верить нельзя (см. шапку).
 * null — сигнатура незнакомая, тогда решает заявленный тип.
 */
function sniffAudioExt(buf: Buffer): AudioExt | null {
  if (buf.length < 12) return null;

  // Matroska / WebM: EBML-заголовок.
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";

  // ISO BMFF (mp4, m4a): «ftyp» на четвёртом байте. Здесь и лежит ловушка
  // Safari: тип заявлен webm, а сигнатура — mp4.
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12).trim().toLowerCase();
    // Марка M4A даёт .m4a, всё остальное (isom, mp42, iso5…) — .mp4. Whisper
    // читает оба, но точное расширение избавляет от лишних догадок.
    return brand.startsWith("m4a") ? "m4a" : "mp4";
  }

  const head = buf.toString("ascii", 0, 4);
  if (head === "OggS") return "ogg";
  if (head === "fLaC") return "flac";
  if (head === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") return "wav";
  if (head.startsWith("ID3")) return "mp3";
  // Кадр MPEG: 11 единичных бит подряд.
  if (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) return "mp3";

  return null;
}

/**
 * Имя файла для whisper и то, что об этом стоит записать в лог.
 *
 * Неизвестны и сигнатура, и тип — берём m4a: так пишут телефоны, и это самый
 * вероятный вариант из оставшихся.
 */
function resolveAudioName(buf: Buffer, mimeType: unknown): {
  fileName: string;
  ext: AudioExt;
  declared: string;
  sniffed: AudioExt | null;
} {
  const declared = baseMime(mimeType);
  const sniffed = sniffAudioExt(buf);
  const ext = sniffed ?? EXT_BY_MIME[declared] ?? "m4a";
  return { fileName: `audio.${ext}`, ext, declared, sniffed };
}

/** Тип для отправки: он должен соответствовать РЕАЛЬНОМУ формату, а не заявленному. */
const MIME_BY_EXT: Record<AudioExt, string> = {
  webm: "audio/webm",
  mp4: "audio/mp4",
  m4a: "audio/m4a",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  flac: "audio/flac",
};

// ── Ответ модели ────────────────────────────────────────────────────────────

type ChatOutcome =
  | { ok: true; text: string; model: string }
  | { ok: false; detail: string; tried: string[] };

/**
 * Спросить модель, перебирая доступные.
 *
 * Возвращает результат, а не бросает: вызывающему нужно знать не только «не
 * вышло», но и почему именно, чтобы сказать это ученику.
 */
async function askTutor(
  openai: OpenAI,
  history: { role: "user" | "assistant"; content: string }[],
  reply: string,
  log: { warn: (obj: unknown, msg: string) => void },
): Promise<ChatOutcome> {
  const tried: string[] = [];
  let lastDetail = "Модель не ответила";

  for (const model of CHAT_MODELS) {
    if (tried.includes(model)) continue;
    tried.push(model);
    try {
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
          { role: "user", content: reply },
        ],
      });
      const text = (response.choices[0]?.message?.content ?? "").trim();
      if (text) return { ok: true, text, model };
      lastDetail = "Модель вернула пустой ответ";
    } catch (err) {
      lastDetail = errorDetail(err);
      log.warn({ model, detail: lastDetail }, "Модель тьютора не ответила, пробуем следующую");
    }
  }

  return { ok: false, detail: lastDetail, tried };
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
// Экран спрашивает это ДО первой записи: иначе ученик говорит вслух, ждёт
// ответа и только потом узнаёт, что тьютор не настроен.
//
// ?probe=1 — проверка ЖИВЫМ запросом: какая модель отвечает и что именно
// говорит OpenAI, если не отвечает никакая. Нужна, чтобы разбираться без
// доступа к логам сервера.
router.get("/voice-chat/status", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const openai = getOpenAI();
  if (!openai) {
    res.json({ ready: false, reason: "Не задан OPENAI_API_KEY" });
    return;
  }

  if (req.query["probe"] !== "1") {
    res.json({ ready: true });
    return;
  }

  const outcome = await askTutor(openai, [], "Say OK.", req.log);
  if (outcome.ok) {
    res.json({ ready: true, probe: "ok", model: outcome.model });
    return;
  }
  res.json({
    ready: false,
    probe: "failed",
    tried: outcome.tried,
    reason: outcome.detail,
  });
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

  const openai = getOpenAI();
  if (!openai) {
    // Честный отказ вместо заготовки. Раньше тьютор отвечал одно и то же на
    // любую реплику, и понять, что ключа просто нет, было невозможно.
    res.status(503).json({
      error: "Голосовой тьютор не настроен: на сервере нет ключа OPENAI_API_KEY.",
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

    const audio = resolveAudioName(audioBuffer, mimeType);
    if (audio.sniffed && audio.declared && EXT_BY_MIME[audio.declared] !== audio.sniffed) {
      // Именно этот случай ломал раздел на iPhone. Строка в логе нужна, чтобы
      // в следующий раз не искать причину на ощупь.
      req.log.warn(
        { declared: audio.declared, sniffed: audio.sniffed, bytes: audioBuffer.length },
        "Клиент заявил один формат записи, а прислал другой",
      );
    }

    try {
      const audioFile = await toFile(audioBuffer, audio.fileName, {
        type: MIME_BY_EXT[audio.ext],
      });
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: STT_MODEL,
        language: "en",
      });
      studentTranscript = (transcription.text ?? "").trim();
    } catch (err) {
      const detail = errorDetail(err);
      req.log.error(
        { err, fileName: audio.fileName, declared: audio.declared, bytes: audioBuffer.length },
        "Failed to transcribe audio",
      );
      res.status(502).json({
        error: "Не удалось разобрать запись. Попробуй сказать ещё раз или переключись на «Писать».",
        detail,
      });
      return;
    }

    if (!studentTranscript) {
      res.status(422).json({ error: "В записи не слышно речи. Скажи фразу вслух и попробуй снова." });
      return;
    }
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
  const outcome = await askTutor(openai, conversationHistory, studentTranscript, req.log);
  if (!outcome.ok) {
    req.log.error({ tried: outcome.tried, detail: outcome.detail }, "Ни одна модель не ответила");
    // Причина уходит наружу: без неё «тьютор не ответил» неотличимо от
    // «модели нет на ключе» и «кончилась квота».
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
  // ответ, полезно и в письменном режиме.
  let aiAudioUrl: string | null = null;
  try {
    const ttsResponse = await openai.audio.speech.create({
      model: TTS_MODEL,
      voice: "nova",
      input: aiTranscript,
    });
    const audioArrayBuffer = await ttsResponse.arrayBuffer();
    aiAudioUrl = `data:audio/mp3;base64,${Buffer.from(audioArrayBuffer).toString("base64")}`;
  } catch (err) {
    req.log.warn({ detail: errorDetail(err) }, "Не удалось озвучить ответ");
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
