// GET /api/tts?wordId=N  — аудио по ID слова из базы
// GET /api/tts?text=T   — аудио для произвольного текста (без кэша в БД)
// GET /api/tts?key=SHA  — подача из кэша (S3/диск) по sha256
//
// Приоритет источников:
//   1. Кэш (local ./uploads/tts/<sha256>.mp3 или S3)
//   2. dictionaryapi.dev (Wiktionary MP3, живая запись носителя — только
//      одиночные слова, у фраз/идиом такой записи в принципе не бывает)
//   3. Deepgram Aura-2 TTS — всё остальное: словосочетания, идиомы и
//      одиночные слова, для которых dictionaryapi.dev ничего не нашёл.
//      Отдаёт готовый mp3 (в отличие от Gemini, PCM разбирать не нужно).
//   4. Gemini TTS — если когда-нибудь будет добавлен (сейчас нет)
//   5. Azure Speech TTS (en-US-AriaNeural) — если заданы AZURE_SPEECH_KEY + AZURE_SPEECH_REGION
//   6. 404 JSON
//
// После первого успешного поиска аудио кэшируется и words.audio_url
// обновляется → повторные запросы идут прямо в кэш.
import { Router } from "express";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@workspace/db";
import { wordsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { s3ClientFromEnv } from "../lib/s3Client";

const router = Router();

// Валидация: латиница, пробел, дефис, апостроф и базовая пунктуация
// (.,!?;:()) — не более 200 символов. Раньше пунктуация была под запретом
// (только буквы/пробел/дефис/апостроф) и лимит был 80 символов — из-за этого
// падали любые тексты со знаками препинания и примеры-предложения на
// карточках ("This is an important question." — точка в конце, часто длиннее
// 80 символов).
const TEXT_RE = /^[a-zA-Z][a-zA-Z\s\-'.,!?;:()]*$/;
const TEXT_MAX = 200;

/**
 * Версия правил синтеза. Входит в ключ кэша.
 *
 * Менять при КАЖДОМ изменении того, как текст превращается в звук: смена
 * голоса, модели, обработки текста. Иначе ученики продолжат слушать записи,
 * сделанные по старым правилам, — кэш вечный и сам не протухает.
 *
 * v2 — speakableText(): к фразе добавляется точка (см. ниже).
 */
const TTS_VERSION = "v2";

// ── Локальный кэш ──────────────────────────────────────────────────────────
let ttsDir = path.resolve(process.cwd(), "../../uploads/tts");
try {
  if (!existsSync(ttsDir)) mkdirSync(ttsDir, { recursive: true });
} catch {
  ttsDir = "/tmp/uploads/tts";
  if (!existsSync(ttsDir)) mkdirSync(ttsDir, { recursive: true });
}

/** Ключ кэша для текста. Версия внутри: правила синтеза меняются — ключ тоже. */
function cacheKeyFor(text: string): string {
  return createHash("sha256")
    .update(`${TTS_VERSION}:${text.toLowerCase().trim()}`)
    .digest("hex");
}

/**
 * Текст, который уходит в синтезатор.
 *
 * ЗАЧЕМ ТОЧКА. Нейронный TTS выбирает мелодику фразы по знакам препинания.
 * Кусок вроде «take care of» без точки для него — начало предложения, у
 * которого дальше обязано быть дополнение: голос идёт вверх и обрывается на
 * полуслове. Ребёнок слышит, что запись «хочет сказать что-то ещё».
 *
 * С точкой тот же фрагмент читается как законченная реплика, с падающей
 * интонацией. Особенно заметно на глагольных связках и фразах с предлогом на
 * конце («take care of», «look forward to», «give up on»).
 *
 * В кэш и в базу идёт ЧИСТЫЙ текст карточки: точка нужна только синтезатору и
 * не должна протекать в данные слова.
 */
function speakableText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  // Уже есть завершающий знак — не трогаем: примеры-предложения приходят
  // с собственной пунктуацией.
  if (/[.!?;:]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

function localTtsPath(key: string): string {
  return path.join(ttsDir, `${key}.mp3`);
}

function s3TtsKey(key: string): string {
  const prefix = (process.env["S3_PREFIX"] ?? "uploads").replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/tts/${key}.mp3` : `tts/${key}.mp3`;
}

/** Читает аудио из S3 или диска. null — не найдено. */
async function readFromCache(key: string): Promise<Buffer | null> {
  const s3 = s3ClientFromEnv();
  if (s3) {
    try {
      const resp = await s3.getObject(s3TtsKey(key));
      return Buffer.from(await resp.arrayBuffer());
    } catch {
      // Нет в S3 — пробуем диск
    }
  }
  const localPath = localTtsPath(key);
  if (existsSync(localPath)) {
    try {
      return await readFile(localPath);
    } catch {
      return null;
    }
  }
  return null;
}

/** Сохраняет аудио в S3 (если настроен) или на диск. */
async function saveToCache(key: string, buf: Buffer): Promise<void> {
  const s3 = s3ClientFromEnv();
  if (s3) {
    try {
      await s3.putObject(s3TtsKey(key), buf, "audio/mpeg");
      return;
    } catch {
      // S3 недоступен — сохраняем на диск
    }
  }
  await writeFile(localTtsPath(key), buf);
}

// ── Внешние источники ──────────────────────────────────────────────────────

/** Ищет URL mp3-записи носителя в dictionaryapi.dev (только одиночные слова). */
async function fetchDictionaryAudioUrl(word: string): Promise<string | null> {
  if (word.includes(" ")) return null; // словарь не содержит фраз
  try {
    const resp = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json() as Array<{ phonetics?: Array<{ audio?: string }> }>;
    const phonetics = data[0]?.phonetics ?? [];
    const urls = phonetics.map((p) => p.audio ?? "").filter(Boolean);
    // Предпочитаем en-US, затем en-GB, затем первый непустой
    return (
      urls.find((u) => u.includes("-us")) ??
      urls.find((u) => u.includes("-uk") || u.includes("-gb")) ??
      urls[0] ??
      null
    );
  } catch {
    return null;
  }
}

/** Скачивает аудио по URL. */
async function downloadUrl(url: string): Promise<Buffer | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Deepgram Aura-2 TTS: aura-2-thalia-en (женский голос en-US, чёткий и
 * энергичный — подходит и для отдельных слов, и для фраз/идиом). Отдаёт
 * готовый mp3 напрямую, в отличие от Gemini не нужно собирать PCM самим.
 * Любая ошибка или отсутствие ключа — null, ничего не роняем.
 */
async function deepgramTts(text: string): Promise<Buffer | null> {
  const key = process.env["DEEPGRAM_API_KEY"]?.trim();
  if (!key) return null;
  try {
    const resp = await fetch(
      "https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${key}`,
          "Content-Type": "application/json",
        },
        // speakableText, а не сырой текст: без точки фраза читается как
        // оборванное начало предложения.
        body: JSON.stringify({ text: speakableText(text) }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

/** Azure Cognitive Services TTS: нейронный голос en-US-AriaNeural. */
async function azureTts(text: string): Promise<Buffer | null> {
  const key = process.env["AZURE_SPEECH_KEY"]?.trim();
  const region = process.env["AZURE_SPEECH_REGION"]?.trim();
  if (!key || !region) return null;
  // Экранируем XML-спецсимволы в тексте
  const safe = speakableText(text).replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] ?? c)
  );
  const ssml = `<speak version='1.0' xml:lang='en-US'><voice xml:lang='en-US' name='en-US-AriaNeural'>${safe}</voice></speak>`;
  try {
    const resp = await fetch(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          "User-Agent": "EnglishLearning/1.0",
        },
        body: ssml,
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

// ── Роут ───────────────────────────────────────────────────────────────────

// Без requireAuth: аудио слов (mp3-записи носителей/TTS) — не приватные
// данные, а <audio src="...">, new Audio(url) и expo-av грузят звук напрямую
// по URL и не умеют слать заголовок Authorization, поэтому роут был
// фактически недоступен из плеера (сплошные 401).
router.get("/tts", async (req, res) => {
  const keyParam = req.query["key"];
  const wordIdParam = req.query["wordId"];
  const textParam = req.query["text"];

  // ── Режим подачи из кэша по sha256-ключу ──────────────────────────────
  if (typeof keyParam === "string" && keyParam) {
    const buf = await readFromCache(keyParam).catch(() => null);
    if (!buf) {
      req.log.warn({ key: keyParam }, "tts: cache key not found");
      res.status(404).json({ error: "Audio not found in cache" });
      return;
    }
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(buf);
    return;
  }

  // ── Разбор входных параметров ──────────────────────────────────────────
  let text: string;
  let wordId: number | null = null;

  if (typeof wordIdParam === "string" && wordIdParam) {
    wordId = Number(wordIdParam);
    if (!Number.isInteger(wordId) || wordId <= 0) {
      req.log.warn({ wordIdParam }, "tts: invalid wordId");
      res.status(400).json({ error: "Invalid wordId" });
      return;
    }
    const [word] = await db
      .select({ english: wordsTable.english, audioUrl: wordsTable.audioUrl })
      .from(wordsTable)
      .where(eq(wordsTable.id, wordId));
    if (!word) {
      req.log.warn({ wordId }, "tts: word not found");
      res.status(404).json({ error: "Word not found" });
      return;
    }
    text = word.english;

    // Ссылка на наш кэш. Используем её ТОЛЬКО если ключ соответствует текущей
    // версии правил синтеза: иначе мы бы вечно отдавали запись, сделанную по
    // старым правилам, в обход всей логики ниже. Не совпало — идём дальше и
    // перезаписываем ссылку свежим ключом.
    if (word.audioUrl?.startsWith("/api/tts?key=")) {
      const storedKey = word.audioUrl.slice("/api/tts?key=".length);
      if (storedKey === cacheKeyFor(text)) {
        const cached = await readFromCache(storedKey).catch(() => null);
        if (cached) {
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          res.send(cached);
          return;
        }
      }
      // Ключ устарел или файла нет — озвучим заново ниже.
    }

    // Если audio_url — внешний URL (напр. из fetch-audio скрипта) — скачиваем и кэшируем
    if (word.audioUrl?.startsWith("http")) {
      const cacheKey = cacheKeyFor(text);
      const cachedBuf = await readFromCache(cacheKey).catch(() => null);
      if (cachedBuf) {
        // Обновляем ссылку в БД на кэшированную (фоново)
        db.update(wordsTable).set({ audioUrl: `/api/tts?key=${cacheKey}` })
          .where(eq(wordsTable.id, wordId!)).catch(() => {});
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.send(cachedBuf);
        return;
      }
      // Скачиваем внешний URL и кэшируем
      const downloaded = await downloadUrl(word.audioUrl).catch(() => null);
      if (downloaded) {
        saveToCache(cacheKey, downloaded).catch(() => {});
        db.update(wordsTable).set({ audioUrl: `/api/tts?key=${cacheKey}` })
          .where(eq(wordsTable.id, wordId!)).catch(() => {});
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.send(downloaded);
        return;
      }
      // Внешний URL недоступен — продолжаем поиск ниже
    }
  } else if (typeof textParam === "string" && textParam) {
    text = textParam.trim();
  } else {
    req.log.warn({ query: req.query }, "tts: neither wordId nor text provided");
    res.status(400).json({ error: "Provide wordId or text" });
    return;
  }

  // ── Валидация текста ───────────────────────────────────────────────────
  if (!text || text.length > TEXT_MAX || !TEXT_RE.test(text)) {
    req.log.warn({ text, length: text?.length ?? 0 }, "tts: text rejected by validation");
    res.status(400).json({ error: "Invalid text: latin letters, spaces, and .,!?;:()-' only, max 200 chars" });
    return;
  }

  const cacheKey = cacheKeyFor(text);

  // ── Кэш ───────────────────────────────────────────────────────────────
  const cached = await readFromCache(cacheKey).catch(() => null);
  if (cached) {
    if (wordId) {
      db.update(wordsTable).set({ audioUrl: `/api/tts?key=${cacheKey}` })
        .where(eq(wordsTable.id, wordId)).catch(() => {});
    }
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(cached);
    return;
  }

  // ── 1. dictionaryapi.dev (живая запись носителя, только одиночные слова) ─
  let audioBuf: Buffer | null = null;
  const dictUrl = await fetchDictionaryAudioUrl(text).catch(() => null);
  if (dictUrl) {
    audioBuf = await downloadUrl(dictUrl).catch(() => null);
  }

  // ── 2. Deepgram Aura-2 (всё остальное: фразы, идиомы, слова без записи) ──
  if (!audioBuf) {
    audioBuf = await deepgramTts(text).catch(() => null);
  }

  // ── 3. Gemini TTS — пока не подключен ────────────────────────────────────

  // ── 4. Azure TTS ───────────────────────────────────────────────────────
  if (!audioBuf) {
    audioBuf = await azureTts(text).catch(() => null);
  }

  if (!audioBuf) {
    req.log.warn(
      { text, wordId, hasDeepgramKey: !!process.env["DEEPGRAM_API_KEY"], hasAzureKey: !!process.env["AZURE_SPEECH_KEY"] },
      "tts: no audio source produced audio for this text",
    );
    res.status(404).json({ error: "Audio not available for this text" });
    return;
  }

  // ── Кэширование + обновление БД (фоново, не блокируем ответ) ──────────
  saveToCache(cacheKey, audioBuf).then(() => {
    if (wordId) {
      db.update(wordsTable).set({ audioUrl: `/api/tts?key=${cacheKey}` })
        .where(eq(wordsTable.id, wordId!)).catch(() => {});
    }
  }).catch(() => {});

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(audioBuf);
});

export default router;
