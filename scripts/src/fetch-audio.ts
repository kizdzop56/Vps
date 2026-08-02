// Скрипт массового прогрева кэша TTS-аудио для всех слов без audio_url.
//
// Алгоритм на каждое слово:
//   1. dictionaryapi.dev — запись живого носителя (предпочитаем en-US),
//      только одиночные слова — у фраз/идиом такой записи не бывает
//   2. Deepgram Aura-2 TTS (aura-2-thalia-en) — всё остальное: словосочетания,
//      идиомы и слова, для которых dictionaryapi.dev ничего не нашёл. Готовый
//      mp3, PCM собирать не нужно. Нужен DEEPGRAM_API_KEY.
//   3. Azure TTS (en-US-AriaNeural) — если заданы AZURE_SPEECH_KEY + AZURE_SPEECH_REGION
//   4. Пропустить
//
// Аудио кэшируется в ./uploads/tts/<sha256>.mp3 (или S3 если настроен),
// ссылка сохраняется в words.audio_url.
//
// Запуск:  pnpm --filter @workspace/scripts run fetch-audio
import "./load-env";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, pool, wordsTable } from "@workspace/db";
import { isNull, or, eq } from "drizzle-orm";

// Пауза между запросами (мс) — не словить rate-limit dictionaryapi.dev
const PAUSE_MS = 600;
// Пауза перед Deepgram / Azure TTS (мс)
const DEEPGRAM_PAUSE_MS = 200;
const AZURE_PAUSE_MS = 200;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let ttsDir = path.resolve(root, "uploads/tts");
try {
  if (!existsSync(ttsDir)) mkdirSync(ttsDir, { recursive: true });
} catch {
  ttsDir = "/tmp/uploads/tts";
  if (!existsSync(ttsDir)) mkdirSync(ttsDir, { recursive: true });
}

function sha256(text: string): string {
  return createHash("sha256").update(text.toLowerCase().trim()).digest("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchDictAudioUrl(word: string): Promise<string | null> {
  if (word.includes(" ")) return null;
  try {
    const resp = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json() as Array<{ phonetics?: Array<{ audio?: string }> }>;
    const phonetics = data[0]?.phonetics ?? [];
    const urls = phonetics.map((p) => p.audio ?? "").filter(Boolean);
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
 * Deepgram Aura-2 TTS: aura-2-thalia-en. Готовый mp3, PCM собирать не нужно.
 * Обрабатывает 429 (rate limit) одним повтором после паузы — прогрев кэша
 * гоняет сотни/тысячи слов подряд, и лимит легко словить.
 */
async function deepgramTts(text: string, retrying = false): Promise<Buffer | null> {
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
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (resp.status === 429 && !retrying) {
      const retryAfterMs = Number(resp.headers.get("retry-after")) * 1000 || 2_000;
      await sleep(retryAfterMs);
      return deepgramTts(text, true);
    }
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

async function azureTts(text: string): Promise<Buffer | null> {
  const key = process.env["AZURE_SPEECH_KEY"]?.trim();
  const region = process.env["AZURE_SPEECH_REGION"]?.trim();
  if (!key || !region) return null;
  const safe = text.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] ?? c)
  );
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
        body: `<speak version='1.0' xml:lang='en-US'><voice xml:lang='en-US' name='en-US-AriaNeural'>${safe}</voice></speak>`,
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!resp.ok) return null;
    return Buffer.from(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

async function saveAndRecord(wordId: number, text: string, buf: Buffer): Promise<void> {
  const key = sha256(text);
  const localPath = path.join(ttsDir, `${key}.mp3`);
  await writeFile(localPath, buf);
  await db.update(wordsTable).set({ audioUrl: `/api/tts?key=${key}` }).where(eq(wordsTable.id, wordId));
}

async function main() {
  // Все слова без audio_url (или с пустым)
  const words = await db
    .select({ id: wordsTable.id, english: wordsTable.english })
    .from(wordsTable)
    .where(or(isNull(wordsTable.audioUrl), eq(wordsTable.audioUrl, "")));

  console.log(`🎙  Слов без аудио: ${words.length}`);
  if (words.length === 0) {
    console.log("Кэш уже заполнен — выходим.");
    return;
  }

  // Отдельная статистика по одиночным словам и словосочетаниям/идиомам:
  // dictionaryapi.dev в принципе не знает записей носителей для фраз, поэтому
  // для них раньше единственным источником оставался Azure (или ничего).
  const stats = {
    word: { dict: 0, deepgram: 0, azure: 0, skipped: 0, total: 0 },
    phrase: { dict: 0, deepgram: 0, azure: 0, skipped: 0, total: 0 },
  };
  let errs = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const isPhrase = /\s/.test(word.english.trim());
    const bucket = isPhrase ? stats.phrase : stats.word;
    bucket.total++;
    const pct = Math.round(((i + 1) / words.length) * 100);
    process.stdout.write(`[${pct}%] ${word.english.padEnd(30, " ")} `);

    await sleep(PAUSE_MS);

    try {
      // 1. dictionaryapi.dev — живая запись носителя, только одиночные слова
      const dictUrl = await fetchDictAudioUrl(word.english);
      if (dictUrl) {
        const buf = await downloadUrl(dictUrl);
        if (buf) {
          await saveAndRecord(word.id, word.english, buf);
          process.stdout.write(`✓ dict\n`);
          bucket.dict++;
          continue;
        }
      }

      // 2. Deepgram Aura-2 — всё остальное: фразы, идиомы, слова без записи
      await sleep(DEEPGRAM_PAUSE_MS);
      const dgBuf = await deepgramTts(word.english);
      if (dgBuf) {
        await saveAndRecord(word.id, word.english, dgBuf);
        process.stdout.write(`✓ deepgram\n`);
        bucket.deepgram++;
        continue;
      }

      // 3. Azure TTS
      await sleep(AZURE_PAUSE_MS);
      const azBuf = await azureTts(word.english);
      if (azBuf) {
        await saveAndRecord(word.id, word.english, azBuf);
        process.stdout.write(`✓ azure\n`);
        bucket.azure++;
        continue;
      }
    } catch (e: any) {
      process.stdout.write(`✗ ошибка: ${e?.message ?? String(e)}\n`);
      errs++;
      continue;
    }

    process.stdout.write(`— пропущено\n`);
    bucket.skipped++;
  }

  const foundOf = (b: typeof stats.word) => b.dict + b.deepgram + b.azure;
  console.log(`\n✅ Готово. Ошибок: ${errs}\n`);
  console.log("| тип | всего | со звуком | dict | deepgram | azure | без звука |");
  console.log("|---|---|---|---|---|---|---|");
  for (const [label, b] of [["слова", stats.word], ["фразы/идиомы", stats.phrase]] as const) {
    console.log(`| ${label} | ${b.total} | ${foundOf(b)} | ${b.dict} | ${b.deepgram} | ${b.azure} | ${b.skipped} |`);
  }
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error("❌ Ошибка:", e);
    await pool.end().catch(() => {});
    process.exit(1);
  });
