// ─────────────────────────────────────────────────────────────────────────────
// Общий слой доступа к ИИ: ответ модели, распознавание речи, озвучка.
//
// ── Зачем один файл на три задачи ───────────────────────────────────────────
// Раньше всё это лежало прямо в routes/voiceChat.ts и было прибито к одному
// поставщику. Стоило понадобиться другому — и пришлось бы переписывать
// маршрут, а вместе с ним трогать проверку прав, очки и журнал, которые к ИИ
// отношения не имеют. Теперь маршрут просто просит «ответь», «расшифруй»,
// «озвучь».
//
// ── Порядок поставщиков ─────────────────────────────────────────────────────
// Первым идёт GOOGLE AI STUDIO (Gemini): это основной ключ проекта, он умеет
// все три задачи. Вторым — Deepgram, только речь: распознавание и озвучка.
//
// Порядок именно такой, а не «что первое ответит»: у поставщиков разная цена и
// разное качество, и решать это должен человек, а не случай.
//
// Ни один не обязателен, и отсутствие ключа не ошибка: слой честно отвечает,
// что сделать нечего, и называет причину.
//
// ── ПОЧЕМУ DEEPGRAM НУЖЕН, А НЕ «НА ВСЯКИЙ СЛУЧАЙ» ─────────────────────────
// Это ЕДИНСТВЕННЫЙ распознаватель здесь, который спокойно читает то, что
// пишет браузер (webm/opus в Chrome, mp4 в Safari). Gemini такие форматы
// принимает через раз (см. ГРАБЛИ ниже). Если убрать ключ Deepgram, голосовой
// разговор с тьютором начнёт отказывать на части устройств.
//
// ── ГРАБЛИ: GEMINI TTS ОТДАЁТ СЫРОЙ PCM ────────────────────────────────────
// Обычные синтезаторы возвращают готовый mp3. Gemini возвращает НЕОБРАБОТАННЫЕ
// сэмплы (audio/L16, обычно 24 кГц, моно) без всякого заголовка. Ни браузер, ни
// expo-av такой файл не проиграют: они не знают ни частоты, ни разрядности.
//
// Поэтому заголовок WAV собирается здесь руками (pcmToWav). Сорок четыре байта,
// зато не нужна библиотека и не нужно перекодировать звук.
//
// ── ГРАБЛИ: ФОРМАТ ЗАПИСИ И GEMINI ─────────────────────────────────────────
// Документация Gemini перечисляет wav, mp3, aiff, aac, ogg и flac. Браузер
// пишет webm (Chrome) или mp4 (Safari) — ни того, ни другого в списке нет.
// На практике часть таких записей принимается, часть отвергается, и заранее
// это не проверить.
//
// Поэтому запись уходит как есть, а при отказе пробуется Deepgram: он
// webm/opus читает без разговоров, а ключ у проекта уже есть — им озвучиваются
// слова (см. routes/tts.ts).
// ─────────────────────────────────────────────────────────────────────────────

/** Одна реплика в истории разговора. */
export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Куда пишем причины отказов. Совпадает с req.log у pino. */
export type AiLog = {
  warn: (obj: unknown, msg: string) => void;
};

export type ChatResult =
  | { ok: true; text: string; provider: string; model: string }
  | { ok: false; detail: string; tried: string[] };

export type TranscribeResult =
  | { ok: true; text: string; provider: string }
  | { ok: false; detail: string; tried: string[] };

export type SpeechResult =
  | { ok: true; dataUrl: string; provider: string }
  | { ok: false; detail: string; tried: string[] };

// ── Ключи ───────────────────────────────────────────────────────────────────
//
// Читаются при каждом вызове, а не один раз при старте: на Render переменные
// подхватываются перезапуском, но код не должен кэшировать их сам — иначе
// «ключ добавил, а не работает» превращается в загадку.

function googleKey(): string | null {
  return (
    process.env["GOOGLE_AI_API_KEY"]?.trim() ||
    process.env["GEMINI_API_KEY"]?.trim() ||
    process.env["GOOGLE_API_KEY"]?.trim() ||
    null
  );
}

function deepgramKey(): string | null {
  return process.env["DEEPGRAM_API_KEY"]?.trim() || null;
}

// ── Модели ──────────────────────────────────────────────────────────────────

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Модели Gemini для ответа тьютора, в порядке предпочтения.
 *
 * Первой идёт заданная переменной: имена моделей у Google меняются чаще, чем
 * выходят наши правки, и переименование не должно требовать коммита.
 */
function geminiChatModels(): string[] {
  return [
    process.env["GOOGLE_AI_CHAT_MODEL"]?.trim(),
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
  ].filter((m): m is string => !!m);
}

/** Модели Gemini для распознавания речи: те же, что и для текста. */
function geminiSttModels(): string[] {
  return [
    process.env["GOOGLE_AI_STT_MODEL"]?.trim(),
    ...geminiChatModels(),
  ].filter((m): m is string => !!m);
}

/** Модель Gemini для озвучки. Отдельная: обычные модели звук не синтезируют. */
function geminiTtsModels(): string[] {
  return [
    process.env["GOOGLE_AI_TTS_MODEL"]?.trim(),
    "gemini-2.5-flash-preview-tts",
  ].filter((m): m is string => !!m);
}

/** Голос Gemini. Kore — ровный женский, хорошо слышен на телефоне. */
function geminiVoice(): string {
  return process.env["GOOGLE_AI_TTS_VOICE"]?.trim() || "Kore";
}

/** Сколько ждём ответа. Ребёнок держит телефон в руке — вечность недопустима. */
const CHAT_TIMEOUT_MS = 25_000;
const STT_TIMEOUT_MS = 30_000;
const TTS_TIMEOUT_MS = 30_000;

// ── Разбор ошибок ───────────────────────────────────────────────────────────

/**
 * Короткое человеческое описание ошибки.
 *
 * Уходит в интерфейс, поэтому обрезается: полный ответ бывает в несколько
 * экранов, и ученику от него никакой пользы. Но сам текст важен — именно в нём
 * написано «model not found» или «quota exceeded», без чего все отказы выглядят
 * одинаково.
 */
export function errorDetail(err: unknown): string {
  const anyErr = err as any;
  const raw =
    anyErr?.error?.message ??
    anyErr?.response?.data?.error?.message ??
    anyErr?.message ??
    String(err);
  return String(raw).slice(0, 300);
}

/** Ошибка из тела ответа HTTP. И Google, и Deepgram кладут её в error.message. */
async function httpDetail(resp: Response): Promise<string> {
  const text = await resp.text().catch(() => "");
  try {
    const data = JSON.parse(text);
    const message = data?.error?.message ?? data?.message ?? data?.err_msg;
    if (message) return String(message).slice(0, 300);
  } catch {
    /* не JSON — отдадим начало как есть */
  }
  return `HTTP ${resp.status}${text ? `: ${text.slice(0, 200)}` : ""}`;
}

// ── Формат записи ───────────────────────────────────────────────────────────

/** Расширения, которые понимают распознаватели речи. */
export type AudioExt = "webm" | "mp4" | "m4a" | "ogg" | "wav" | "mp3" | "flac" | "aac";

const EXT_BY_MIME: Record<string, AudioExt> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/oga": "ogg",
  "audio/mp4": "mp4",
  "video/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
};

const MIME_BY_EXT: Record<AudioExt, string> = {
  webm: "audio/webm",
  mp4: "audio/mp4",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  flac: "audio/flac",
  aac: "audio/aac",
};

/** Тип без параметров: «audio/webm;codecs=opus» → «audio/webm». */
function baseMime(mimeType: unknown): string {
  return String(mimeType ?? "").split(";")[0]!.trim().toLowerCase();
}

/**
 * Формат по сигнатуре файла.
 *
 * Единственный надёжный способ: Safari на iPhone заявляет audio/webm, а пишет
 * mp4, и по названию формат определять нельзя (см. шапку routes/voiceChat.ts).
 * null — сигнатура незнакомая, тогда решает заявленный тип.
 */
export function sniffAudioExt(buf: Buffer): AudioExt | null {
  if (buf.length < 12) return null;

  // Matroska / WebM: EBML-заголовок.
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";

  // ISO BMFF (mp4, m4a): «ftyp» на четвёртом байте.
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12).trim().toLowerCase();
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

export type AudioFormat = {
  ext: AudioExt;
  mimeType: string;
  fileName: string;
  /** Что заявил клиент. Для лога: по нему видно, какой браузер врёт. */
  declared: string;
  /** Что оказалось на самом деле. null — сигнатура незнакомая. */
  sniffed: AudioExt | null;
};

/** Настоящий формат записи и имя файла для тех, кто смотрит на расширение. */
export function resolveAudioFormat(buf: Buffer, declaredMime: unknown): AudioFormat {
  const declared = baseMime(declaredMime);
  const sniffed = sniffAudioExt(buf);
  const ext = sniffed ?? EXT_BY_MIME[declared] ?? "m4a";
  return {
    ext,
    mimeType: MIME_BY_EXT[ext],
    fileName: `audio.${ext}`,
    declared,
    sniffed,
  };
}

// ── Ответ модели ────────────────────────────────────────────────────────────

async function geminiChat(
  key: string,
  system: string,
  history: ChatTurn[],
  message: string,
  log: AiLog,
): Promise<ChatResult> {
  const tried: string[] = [];
  let detail = "Gemini не ответил";

  // В Gemini ответ модели называется «model», а не «assistant».
  const contents = [
    ...history.map((t) => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  for (const model of geminiChatModels()) {
    if (tried.includes(`gemini:${model}`)) continue;
    tried.push(`gemini:${model}`);
    try {
      const resp = await fetch(`${GEMINI_API}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          // Роль тьютора задаётся отдельным полем, а не первой репликой: иначе
          // модель начинает считать её частью разговора и пересказывать.
          system_instruction: { parts: [{ text: system }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
        }),
        signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
      });
      if (!resp.ok) {
        detail = await httpDetail(resp);
        log.warn({ provider: "gemini", model, detail }, "Модель не ответила, пробуем следующую");
        continue;
      }
      const data = await resp.json() as any;
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p: any) => p?.text ?? "").join("").trim();
      if (text) return { ok: true, text, provider: "gemini", model };
      // Пустой ответ бывает при срабатывании фильтров безопасности: причина
      // лежит в finishReason, и без неё это выглядит как молчание без повода.
      detail = `Пустой ответ (finishReason: ${data?.candidates?.[0]?.finishReason ?? "неизвестно"})`;
      log.warn({ provider: "gemini", model, detail }, "Модель вернула пустой ответ");
    } catch (err) {
      detail = errorDetail(err);
      log.warn({ provider: "gemini", model, detail }, "Запрос к модели не удался");
    }
  }

  return { ok: false, detail, tried };
}

/**
 * Спросить модель.
 *
 * Возвращает результат, а не бросает: вызывающему нужно знать не только «не
 * вышло», но и почему именно — эту причину видит ученик на экране.
 *
 * Поставщик один: текст умеет только Gemini. Deepgram — про речь, не про
 * разговор.
 */
export async function chat(opts: {
  system: string;
  history: ChatTurn[];
  message: string;
  log: AiLog;
}): Promise<ChatResult> {
  const google = googleKey();
  if (!google) {
    return {
      ok: false,
      detail: "Не задан ключ GOOGLE_AI_API_KEY",
      tried: [],
    };
  }
  return geminiChat(google, opts.system, opts.history, opts.message, opts.log);
}

// ── Распознавание речи ──────────────────────────────────────────────────────

/**
 * Задание для Gemini: расшифровать запись.
 *
 * Просим ТОЛЬКО текст: без этого модель добавляет вежливое «Sure, here is the
 * transcription», и оно попадает в реплику ученика.
 */
const STT_PROMPT =
  "Transcribe this audio to text exactly as spoken. " +
  "Reply with the transcription only, no comments, no quotes. " +
  "If there is no speech, reply with an empty string.";

async function geminiTranscribe(
  key: string,
  audio: Buffer,
  format: AudioFormat,
  log: AiLog,
): Promise<TranscribeResult> {
  const tried: string[] = [];
  let detail = "Gemini не расшифровал запись";
  const base64 = audio.toString("base64");

  for (const model of geminiSttModels()) {
    if (tried.includes(`gemini:${model}`)) continue;
    tried.push(`gemini:${model}`);
    try {
      const resp = await fetch(`${GEMINI_API}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: STT_PROMPT },
              { inline_data: { mime_type: format.mimeType, data: base64 } },
            ],
          }],
          generationConfig: { temperature: 0 },
        }),
        signal: AbortSignal.timeout(STT_TIMEOUT_MS),
      });
      if (!resp.ok) {
        detail = await httpDetail(resp);
        // Тот самый случай из шапки: формат записи может оказаться не из
        // списка поддерживаемых. Пишем формат рядом с ошибкой, иначе причину
        // придётся угадывать.
        log.warn(
          { provider: "gemini", model, mimeType: format.mimeType, detail },
          "Расшифровка не удалась",
        );
        continue;
      }
      const data = await resp.json() as any;
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p: any) => p?.text ?? "").join("").trim();
      // Пустая строка — это законный ответ «речи нет», а не ошибка.
      return { ok: true, text, provider: "gemini" };
    } catch (err) {
      detail = errorDetail(err);
      log.warn({ provider: "gemini", model, detail }, "Расшифровка не удалась");
    }
  }

  return { ok: false, detail, tried };
}

/**
 * Deepgram: самый спокойный к формату. Ключ у проекта уже есть — им
 * озвучиваются слова (routes/tts.ts), и распознавание идёт по тому же ключу.
 */
async function deepgramTranscribe(
  key: string,
  audio: Buffer,
  format: AudioFormat,
  log: AiLog,
): Promise<TranscribeResult> {
  const model = process.env["DEEPGRAM_STT_MODEL"]?.trim() || "nova-3";
  try {
    const resp = await fetch(
      `https://api.deepgram.com/v1/listen?model=${encodeURIComponent(model)}&language=en&smart_format=true`,
      {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": format.mimeType },
        body: new Uint8Array(audio),
        signal: AbortSignal.timeout(STT_TIMEOUT_MS),
      },
    );
    if (!resp.ok) {
      const detail = await httpDetail(resp);
      log.warn({ provider: "deepgram", model, detail }, "Расшифровка не удалась");
      return { ok: false, detail, tried: [`deepgram:${model}`] };
    }
    const data = await resp.json() as any;
    const text = String(
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "",
    ).trim();
    return { ok: true, text, provider: "deepgram" };
  } catch (err) {
    const detail = errorDetail(err);
    log.warn({ provider: "deepgram", model, detail }, "Расшифровка не удалась");
    return { ok: false, detail, tried: [`deepgram:${model}`] };
  }
}

/**
 * Расшифровать запись.
 *
 * Порядок: Gemini → Deepgram. Первый — потому что это основной ключ проекта;
 * второй — потому что он спокойнее относится к webm и mp4 из браузера, и
 * именно он спасает разговор на тех устройствах, где Gemini запись не принял.
 */
export async function transcribe(opts: {
  audio: Buffer;
  declaredMime: unknown;
  log: AiLog;
}): Promise<TranscribeResult & { format: AudioFormat }> {
  const format = resolveAudioFormat(opts.audio, opts.declaredMime);

  if (format.sniffed && format.declared && EXT_BY_MIME[format.declared] !== format.sniffed) {
    // Ловушка Safari: заявлен один формат, прислан другой. Строка в логе нужна,
    // чтобы в следующий раз не искать причину на ощупь.
    opts.log.warn(
      { declared: format.declared, sniffed: format.sniffed, bytes: opts.audio.length },
      "Клиент заявил один формат записи, а прислал другой",
    );
  }

  const tried: string[] = [];
  let detail = "Не задан ни один ключ для распознавания речи";

  const google = googleKey();
  if (google) {
    const result = await geminiTranscribe(google, opts.audio, format, opts.log);
    if (result.ok) return { ...result, format };
    tried.push(...result.tried);
    detail = result.detail;
  }

  const deepgram = deepgramKey();
  if (deepgram) {
    const result = await deepgramTranscribe(deepgram, opts.audio, format, opts.log);
    if (result.ok) return { ...result, format };
    tried.push(...result.tried);
    detail = result.detail;
  }

  return { ok: false, detail, tried, format };
}

// ── Озвучка ─────────────────────────────────────────────────────────────────

/**
 * Заголовок WAV поверх сырых сэмплов.
 *
 * Gemini отдаёт PCM без всякой обёртки (см. ГРАБЛИ в шапке). Сорок четыре байта
 * заголовка превращают его в файл, который играют и браузер, и телефон.
 */
export function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1, bitsPerSample = 16): Buffer {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4); // размер файла без первых 8 байт
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);             // длина блока fmt
  header.writeUInt16LE(1, 20);              // 1 = несжатый PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

/** Частота из строки вида «audio/L16;codec=pcm;rate=24000». */
function rateFromMime(mimeType: string): number {
  const match = /rate=(\d+)/i.exec(mimeType);
  const rate = match ? Number(match[1]) : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : 24_000;
}

async function geminiSpeak(key: string, text: string, log: AiLog): Promise<SpeechResult> {
  const tried: string[] = [];
  let detail = "Gemini не озвучил ответ";

  for (const model of geminiTtsModels()) {
    if (tried.includes(`gemini:${model}`)) continue;
    tried.push(`gemini:${model}`);
    try {
      const resp = await fetch(`${GEMINI_API}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiVoice() } },
            },
          },
        }),
        signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
      });
      if (!resp.ok) {
        detail = await httpDetail(resp);
        log.warn({ provider: "gemini", model, detail }, "Озвучка не удалась");
        continue;
      }
      const data = await resp.json() as any;
      const part = (data?.candidates?.[0]?.content?.parts ?? [])
        .find((p: any) => p?.inlineData?.data || p?.inline_data?.data);
      const inline = part?.inlineData ?? part?.inline_data;
      if (!inline?.data) {
        detail = "В ответе нет звука";
        log.warn({ provider: "gemini", model, detail }, "Озвучка не удалась");
        continue;
      }
      const pcm = Buffer.from(inline.data, "base64");
      const wav = pcmToWav(pcm, rateFromMime(String(inline.mimeType ?? inline.mime_type ?? "")));
      return {
        ok: true,
        dataUrl: `data:audio/wav;base64,${wav.toString("base64")}`,
        provider: "gemini",
      };
    } catch (err) {
      detail = errorDetail(err);
      log.warn({ provider: "gemini", model, detail }, "Озвучка не удалась");
    }
  }

  return { ok: false, detail, tried };
}

/** Deepgram Aura-2: отдаёт готовый mp3, тот же голос, что у слов в карточках. */
async function deepgramSpeak(key: string, text: string, log: AiLog): Promise<SpeechResult> {
  const model = process.env["DEEPGRAM_TTS_MODEL"]?.trim() || "aura-2-thalia-en";
  try {
    const resp = await fetch(
      `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=mp3`,
      {
        method: "POST",
        headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
      },
    );
    if (!resp.ok) {
      const detail = await httpDetail(resp);
      log.warn({ provider: "deepgram", model, detail }, "Озвучка не удалась");
      return { ok: false, detail, tried: [`deepgram:${model}`] };
    }
    const mp3 = Buffer.from(await resp.arrayBuffer());
    return {
      ok: true,
      dataUrl: `data:audio/mp3;base64,${mp3.toString("base64")}`,
      provider: "deepgram",
    };
  } catch (err) {
    const detail = errorDetail(err);
    log.warn({ provider: "deepgram", model, detail }, "Озвучка не удалась");
    return { ok: false, detail, tried: [`deepgram:${model}`] };
  }
}

/**
 * Озвучить текст.
 *
 * Озвучка НЕ обязательна: текст ответа уже есть, и молчаливый ответ лучше, чем
 * потерянная реплика. Поэтому вызывающий вправе просто не показывать звук.
 */
export async function speak(opts: { text: string; log: AiLog }): Promise<SpeechResult> {
  const tried: string[] = [];
  let detail = "Не задан ни один ключ для озвучки";

  const google = googleKey();
  if (google) {
    const result = await geminiSpeak(google, opts.text, opts.log);
    if (result.ok) return result;
    tried.push(...result.tried);
    detail = result.detail;
  }

  const deepgram = deepgramKey();
  if (deepgram) {
    const result = await deepgramSpeak(deepgram, opts.text, opts.log);
    if (result.ok) return result;
    tried.push(...result.tried);
    detail = result.detail;
  }

  return { ok: false, detail, tried };
}

// ── Что вообще настроено ────────────────────────────────────────────────────

/**
 * Какие поставщики доступны. Нужно экрану и диагностике: «ключа нет» и «ключ
 * есть, но модель отказала» — разные беды, и лечатся они по-разному.
 */
export function aiProviders(): { google: boolean; deepgram: boolean } {
  return {
    google: !!googleKey(),
    deepgram: !!deepgramKey(),
  };
}

/**
 * Можно ли вообще разговаривать с тьютором.
 *
 * Смотрим ТОЛЬКО на ключ Google: ответ модели умеет один он. С одним лишь
 * Deepgram получится расшифровать речь, но отвечать будет некому — раздел
 * окажется бесполезным, и лучше сказать это сразу.
 */
export function hasAnyAi(): boolean {
  return !!googleKey();
}
