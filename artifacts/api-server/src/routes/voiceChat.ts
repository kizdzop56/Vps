// ─────────────────────────────────────────────────────────────────────────────
// Разговор со Снежей: реплика ученика → разбор → ответ модели → озвучка.
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
// Дальше пути сходятся: разбор, ответ модели, озвучка, очки и журнал одинаковы.
// Письмо нужно не только для удобства (шумно, стесняется, нет микрофона) — оно
// ещё и обходит распознавание речи целиком, поэтому по нему видно, работает ли
// остальная часть раздела, когда микрофон подводит.
//
// ── ОЗВУЧКА НЕ ОБЯЗАТЕЛЬНА, НО И НЕ ОДНОРАЗОВА ─────────────────────────────
// Синтез иногда не удаётся: у моделей озвучки жёсткие лимиты, у Deepgram может
// кончиться квота. Терять из-за этого весь ответ нельзя — текст уже есть, и
// молчаливый ответ лучше потерянного.
//
// Но раньше такая реплика оставалась без звука НАВСЕГДА: аудио клали в базу
// вместе с сообщением, и второй попытки не существовало. Отсюда
// POST /voice-chat/speak: нажатие на реплику синтезирует её заново.
//
// ── ПЕРЕВОД РЕПЛИКИ ────────────────────────────────────────────────────────
// POST /voice-chat/translate переводит реплику Снежи на русский по требованию.
//
// Переводится ЦЕЛАЯ реплика, а не отдельные слова: у предложения контекст сам
// снимает многозначность, и это единственный безопасный способ применить
// машинный перевод (то же правило действует в карточках, см. шапку
// lib/phraseSource.ts).
//
// Перевод НЕ хранится в базе и не пишется в историю разговора. Он подсказка для
// ученика, а не часть беседы: попав в историю, он приехал бы модели во входе и
// она начала бы отвечать по-русски.
//
// ── Причина отказа уходит НАРУЖУ ────────────────────────────────────────────
// Ключ есть, а модель недоступна; квота кончилась; формат записи не принят —
// для ученика это всё выглядело одинаково: «не ответила». Поэтому в ответе есть
// поле detail с текстом ошибки от поставщика, и экран его показывает.
// Секретного там нет: «model not found», «quota exceeded».
//
// Причина приходит СРАЗУ ПО ВСЕМ попыткам: «модель: ошибка | модель: ошибка».
// Пока показывалась только последняя, отладка сводилась к угадыванию.
//
// ── Очки ────────────────────────────────────────────────────────────────────
// 5 очков за обмен репликами, но не больше DAILY_VOICE_POINTS_CAP в сутки —
// как в словах и грамматике. Без потолка разговор был единственным местом, где
// очки капали бесконечно.
//
// Очки идут и за неудачную попытку тоже. Ребёнок сказал фразу, ошибся и
// повторил правильно — это РАБОТА, и наказывать за неё нулём нельзя: иначе
// выгоднее говорить только заученное.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { db } from "@workspace/db";
import { voiceChatSessionsTable, voiceChatMessagesTable, usersTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { googleTranslate } from "@workspace/translate";
import { requireAuth, getUser } from "../lib/auth";
import { startOfLocalDay } from "../lib/timeStats";
import { aiProviders, chat, geminiModelReport, hasAnyAi, speak, transcribe } from "../lib/ai";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// КТО ОТВЕЧАЕТ И КАК ПРОВЕРЯЕТ
//
// Собеседник — Снежа, маскот приложения. Не «ассистент» и не «тьютор»: ребёнок
// разговаривает с тем, кого уже знает по остальным экранам, и это единственная
// причина, по которой он вообще начнёт говорить вслух на чужом языке.
//
// ── ОШИБКА ОСТАНАВЛИВАЕТ РАЗГОВОР ──────────────────────────────────────────
// Снежа проверяет каждую реплику. Есть ошибка — она называет её и просит
// сказать ту же фразу правильно, и разговор НЕ идёт дальше, пока фраза не
// прозвучит верно. Всё правильно — обычный ответ и следующий вопрос.
//
// Это отличается и от «молчать про ошибки» (тогда ребёнок закрепляет неверное),
// и от «поправить и поехали дальше» (исправление, которое не повторили вслух,
// не запоминается вообще).
//
// ── ОТВЕТ ПРИХОДИТ РАЗБОРОМ, А НЕ ТЕКСТОМ ──────────────────────────────────
// Модель обязана вернуть JSON: верна ли фраза, как она звучит правильно, что
// именно было не так (по-русски) и сама реплика Снежи.
//
// Почему не одним текстом: экрану нужно ЗНАТЬ, была ошибка или нет — от этого
// зависит, показывать ли разбор под своей репликой и просить ли повтор. Вытащить
// это из свободного текста нечем, кроме угадывания по словам, а угадывание тут
// ошибается на каждой второй фразе.
//
// Объяснение по-русски намеренно: ребёнок, который ошибся в английском, не
// поймёт объяснения ошибки на английском. Сама реплика Снежи при этом всегда
// английская — иначе разговор перестанет быть разговором на языке.
//
// ── ПОЧЕМУ НЕ БОЛЬШЕ ДВУХ ЗАХОДОВ ──────────────────────────────────────────
// Без предела ребёнок может застрять на одной фразе навсегда: он не понимает,
// чего от него хотят, и повторяет то же самое. Поэтому на третью попытку Снежа
// принимает фразу как есть и ведёт разговор дальше — упражнение важно, но
// бросить приложение из-за него важнее не дать.
// ─────────────────────────────────────────────────────────────────────────────

/** Столько раз просим повторить одну и ту же фразу. Дальше принимаем как есть. */
const MAX_RETRIES = 2;

function systemPrompt(retry: number): string {
  const base = `You are Snezha (Снежа), a friendly snow leopard cub. You chat in English with a child (age 5-18) who is learning English.
Speak as Snezha in the first person. Never say you are an AI, a model, an assistant or a tutor.

You ALWAYS answer with a single JSON object and nothing else. No markdown, no code fences:
{"ok": true|false, "fixed": "...", "issue": "...", "reply": "..."}

How to fill it:
- "ok": true if the student's last message is correct English, false if it has a real mistake in grammar, word choice, word order or spelling.
- "fixed": the same sentence written correctly. When "ok" is true, repeat their sentence unchanged.
- "issue": ONE short sentence IN RUSSIAN naming the mistake, for a child. Empty string when "ok" is true.
- "reply": what you say out loud, ALWAYS in English, 1-3 short sentences, always finished.

When "ok" is false: in "reply" tell them warmly what to fix, say the correct sentence, and ask them to repeat it. Do NOT ask a new question and do NOT continue the topic.
When "ok" is true: reply naturally, be warm, curious and playful, and end with one simple question to keep the conversation going.

Be gentle. Ignore missing capital letters, missing final punctuation and obvious speech-to-text noise: the child often speaks out loud and the text comes from a recognizer. Never mock a mistake.
Use only words a child knows.`;

  if (retry < MAX_RETRIES) return base;

  // Третья попытка: хватит. Ребёнок уже старался, дальше это не упражнение, а
  // тупик.
  return `${base}

IMPORTANT: the student has already tried this sentence several times. Set "ok" to true no matter what, praise the effort in "reply" and move the conversation on with a new question.`;
}

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

/** Столько символов озвучиваем и переводим: реплика Снежи всегда короче. */
const MAX_SPEAK_LEN = 700;

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
 * Модели то и дело оборачивают ответ в ```json, добавляют «Here is the JSON» или
 * ставят перевод строки перед объектом — при всём том, что их об этом прямо
 * просили не делать. Поэтому берём подстроку от первой «{» до последней «}»:
 * этого хватает во всех виденных случаях.
 *
 * НЕ РАЗОБРАЛОСЬ — не ошибка. Тогда весь текст считается репликой, а фраза
 * ученика — верной: потерять ответ целиком из-за формата хуже, чем один раз не
 * заметить ошибку в грамматике.
 */
function parseVerdict(raw: string): Verdict {
  const fallback: Verdict = { ok: true, fixed: "", issue: "", reply: raw.trim() };

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return fallback;

  try {
    const data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const reply = typeof data["reply"] === "string" ? data["reply"].trim() : "";
    // Реплики нет — объект бесполезен, что бы в нём ещё ни лежало.
    if (!reply) return fallback;

    return {
      // Явное false и только оно означает ошибку: пропущенное поле — это «всё
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

// ── Готов ли раздел к работе ────────────────────────────────────────────────
//
// Экран спрашивает это ДО первой записи: иначе ученик говорит вслух, ждёт
// ответа и только потом узнаёт, что раздел не настроен.
//
// ?probe=1 — проверка ЖИВЫМ запросом: какой поставщик и какая модель отвечают,
// а если никто — что именно они сказали и какие модели вообще доступны ключу.
router.get("/voice-chat/status", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const providers = aiProviders();

  if (!hasAnyAi()) {
    // Названа ровно одна переменная, потому что отвечать умеет только Gemini.
    // DEEPGRAM_API_KEY здесь не помощник: он про речь, а не про разговор.
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

// ── Перевод реплики на русский ──────────────────────────────────────────────
//
// Работает БЕЗ ключей ИИ: перевод идёт через @workspace/translate, то есть тем
// же путём, что переводы примеров в карточках. Поэтому раздел объясняет фразу
// даже когда сама Снежа отвечать не может.
//
// Модель для перевода не используется намеренно. Она справилась бы, но это
// лишний запрос к дорогому поставщику ради задачи, которую переводчик решает
// мгновенно и бесплатно.
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

// ── Озвучить текст по требованию ────────────────────────────────────────────
//
// Нужен, когда синтез при ответе не удался: ученик нажимает на реплику, и она
// озвучивается со второй попытки. Отдельный маршрут, а не поле сообщения,
// потому что причины отказа временные — лимит, квота, недоступная модель, — и
// повтор через минуту обычно проходит.
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
    // Честный отказ вместо заготовки. Раньше на любую реплику приходил один и
    // тот же текст, и понять, что ключа просто нет, было невозможно.
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
  const previousMessages = await db.select().from(voiceChatMessagesTable)
    .where(eq(voiceChatMessagesTable.sessionId, sessionId))
    .orderBy(voiceChatMessagesTable.createdAt);

  const history = previousMessages.slice(-10).map((m) => ({
    role: m.role === "student" ? "user" as const : "assistant" as const,
    content: m.transcript,
  }));

  // ── Разбор и ответ Снежи ──
  const outcome = await chat({
    system: systemPrompt(attempt),
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

  // Озвучка — не обязательна: текст ответа уже есть, и молчаливый ответ лучше,
  // чем потерянная реплика. Написавшему её тоже даём: слышать, как звучит
  // ответ, полезно и в письменном режиме. Не вышло — реплику можно озвучить
  // нажатием (POST /voice-chat/speak).
  //
  // Озвучиваем ТОЛЬКО reply: разбор ошибки написан по-русски, и английский
  // голос прочитал бы его как набор звуков.
  const voice = await speak({ text: aiTranscript, log: req.log });
  const aiAudioUrl = voice.ok ? voice.dataUrl : null;
  if (!voice.ok) {
    req.log.warn({ tried: voice.tried, detail: voice.detail }, "Ответ остался без озвучки");
  }

  // ── Записываем обе реплики ──
  //
  // В историю идёт то, что ученик сказал НА САМОМ ДЕЛЕ, а не исправленная
  // версия: это запись разговора, а не протокол того, как надо было.
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
    // ── Разбор фразы ──
    // ok       — фраза верна;
    // fixed    — как она звучит правильно (пусто, если и так верно);
    // issue    — что было не так, по-русски;
    // needsRetry — экран просит повторить, разговор дальше не идёт.
    correction: {
      ok: verdict.ok,
      fixed: verdict.ok ? "" : verdict.fixed,
      issue: verdict.ok ? "" : verdict.issue,
      needsRetry,
      attempt,
      maxRetries: MAX_RETRIES,
    },
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
