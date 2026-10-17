import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import teacherDecksRouter from "./routes/teacherDecks";
import { logger } from "./lib/logger";

const app: Express = express();

app.set("etag", false);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

const IMAGE_EXT = /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i;
const AUDIO_EXT = /\.(?:aac|flac|m4a|mp3|oga|ogg|opus|wav|weba)$/i;
const VIDEO_EXT = /\.(?:avi|m4v|mkv|mov|mp4|ogv|webm)$/i;

/** Parse only normal web URLs and same-origin app file URLs. */
function mediaUrlParts(value: unknown): URL | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  try {
    if (raw.startsWith("/api/storage/objects/")) return new URL(raw, "http://localhost");
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function isStoredFile(url: URL, kind: "image" | "audio" | "video"): boolean {
  return url.pathname.startsWith("/api/storage/objects/") && url.searchParams.get("kind") === kind;
}

function isImageLink(value: unknown): boolean {
  const url = mediaUrlParts(value);
  if (!url) return false;
  if (isStoredFile(url, "image") || IMAGE_EXT.test(url.pathname)) return true;

  // Links copied from image search often point directly to an image but use
  // query parameters instead of a file extension (e.g. encrypted-tbn*.gstatic.com).
  // Accept a normal HTTP(S) image URL here; React Native Image will load actual
  // images and report a broken/non-image page in the preview rather than
  // rejecting useful direct image URLs based only on their pathname.
  return url.protocol === "http:" || url.protocol === "https:";
}

function isAudioLink(value: unknown): boolean {
  const url = mediaUrlParts(value);
  return !!url && (AUDIO_EXT.test(url.pathname) || isStoredFile(url, "audio") || isYouTubeLink(url));
}

function isYouTubeLink(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const videoId = "[A-Za-z0-9_-]{6,20}";
  if (host === "youtu.be") return new RegExp(`^/${videoId}/?$`).test(url.pathname);
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "youtube-nocookie.com") return false;
  return (
    (url.pathname === "/watch" && new RegExp(`^${videoId}$`).test(url.searchParams.get("v") ?? "")) ||
    new RegExp(`^/(?:embed|shorts|live)/${videoId}/?$`).test(url.pathname)
  );
}

function isVideoLink(value: unknown): boolean {
  const url = mediaUrlParts(value);
  return !!url && (VIDEO_EXT.test(url.pathname) || isStoredFile(url, "video") || isYouTubeLink(url));
}

/** Reject unsupported/mismatched media before it is saved to the database. */
function validateAssignmentMedia(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.method !== "POST" || req.path !== "/api/assignments") return next();
  const body = req.body as { type?: unknown; mediaUrl?: unknown; imageUrl?: unknown };
  const type = body?.type;
  const mediaUrl = typeof body?.mediaUrl === "string" ? body.mediaUrl.trim() : "";
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";

  if (imageUrl && !isImageLink(imageUrl)) {
    res.status(400).json({ error: "Вставьте полную ссылку на изображение, начинающуюся с http:// или https://, либо загрузите файл." });
    return;
  }

  if (type === "audio" && !isAudioLink(mediaUrl)) {
    res.status(400).json({ error: "Для аудирования нужна прямая ссылка на аудиофайл MP3, M4A, WAV, OGG, AAC или FLAC либо корректная ссылка YouTube." });
    return;
  }
  if (type === "video" && !isVideoLink(mediaUrl)) {
    res.status(400).json({ error: "Для видео добавьте ссылку YouTube или прямую ссылку на файл MP4, WEBM, MOV, M4V, AVI или MKV." });
    return;
  }
  if (mediaUrl && type === "text_test" && !isVideoLink(mediaUrl)) {
    res.status(400).json({ error: "Дополнительное видео к тесту должно быть ссылкой YouTube или прямой ссылкой на видеофайл." });
    return;
  }
  if (mediaUrl && (type === "reading" || type === "free_form") && !isAudioLink(mediaUrl) && !isVideoLink(mediaUrl)) {
    res.status(400).json({ error: "Дополнительная ссылка должна вести на аудиофайл, видеофайл или YouTube-видео. Страницы общего доступа не поддерживаются." });
    return;
  }

  next();
}

// Validate media on the server too, so unsupported links cannot be saved even
// if a client-side check is bypassed.
app.use(validateAssignmentMedia);

// Для списка колод учителя не нужны тяжёлые данные прогресса по словам.
// Этот лёгкий маршрут отвечает раньше общего /flashcards/decks.
app.use("/api", teacherDecksRouter);
app.use("/api", router);

// JSON 404 для /api маршрутов, не совпавших с роутером.
// Без этого обработчика Express отдаёт HTML-страницу, и клиент падает
// на "Unexpected token '<'" при попытке JSON.parse.
app.use("/api", (_req: express.Request, res: express.Response) => {
  res.status(404).json({ error: "Not found" });
});

// Глобальный JSON-обработчик ошибок. Express распознаёт error handler
// по сигнатуре с 4 аргументами — все четыре обязательны.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const e = err as { status?: number; statusCode?: number; message?: string };
    logger.error(err);
    const status = e.status ?? e.statusCode ?? 500;
    res.status(status).json({ error: e.message ?? "Internal server error" });
  },
);

export default app;
