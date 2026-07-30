import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { isObjectStorageConfigured } from "../lib/s3Client";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Локальная папка хранения — фолбэк, когда объектное хранилище не настроено.
// На VPS переживает перезапуск; на Render (без persistent disk) файлы исчезают
// при каждом деплое, поэтому в проде нужно настроить S3-совместимое хранилище
// (см. deploy-vps/STORAGE.md). Логика совпадает с routes/upload.ts.
let localDir = path.resolve(process.cwd(), "../../uploads");
try {
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
} catch {
  localDir = "/tmp/uploads";
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
}

/**
 * Тип содержимого локального объекта хранится в соседнем файле `.type`.
 *
 * Раньше локальный режим отдавал ВСЁ как `image/jpeg` — аватары так работали,
 * а загруженные аудио и видео браузер отказывался проигрывать. Файлы на диске
 * лежат без расширения, поэтому определить тип по имени нельзя.
 */
function localTypePath(id: string): string {
  return path.join(localDir, `obj-${id}.type`);
}

function localObjectPath(id: string): string {
  return path.join(localDir, `obj-${id}`);
}

/** Валидный id локального объекта: без слэшей и переходов на уровень выше. */
// Параметр маршрута в типах Express может быть и массивом строк — принимаем
// такой вариант и отбраковываем его как небезопасный (иначе не сходятся типы).
function isSafeId(id: string | string[] | undefined): id is string {
  return typeof id === "string" && id.length > 0 && !id.includes("/") && !id.includes("..");
}

function readLocalContentType(id: string, kindHint?: string): string {
  try {
    const stored = fs.readFileSync(localTypePath(id), "utf8").trim();
    if (stored) return stored;
  } catch {
    // Файла типа нет — объект загружен до этого исправления.
  }
  // Фолбэк по подсказке ?kind= из ссылки, которую формирует фронтенд.
  if (kindHint === "image") return "image/jpeg";
  if (kindHint === "audio") return "audio/mpeg";
  if (kindHint === "video") return "video/mp4";
  return "application/octet-stream";
}

const RequestUploadUrlBody = z.object({
  name: z.string(),
  size: z.number(),
  contentType: z.string(),
});

router.post("/storage/request-upload-url", requireAuth, async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    if (isObjectStorageConfigured()) {
      // Presigned PUT: браузер грузит файл напрямую в хранилище.
      const { uploadURL, objectPath } = objectStorageService.getUploadTarget();
      res.json({ uploadURL, objectPath });
      return;
    }
    // Локальный режим: клиент делает PUT на наш же эндпоинт, а объект потом
    // отдаётся через GET /storage/objects/local/<id>.
    //
    // Ссылка ОТНОСИТЕЛЬНАЯ. Абсолютную строить нельзя: внутренний reverse proxy
    // (scripts/prod-start.mjs, preview-proxy.mjs) переписывает Host на
    // "localhost:8080", и клиент получал недостижимый
    // https://localhost:8080/api/... — именно из-за этого presigned-загрузка
    // аватара раньше не работала и её пришлось откатывать на multer.
    const id = randomUUID();
    res.json({
      uploadURL: `/api/storage/local-put/${id}`,
      objectPath: `/objects/local/${id}`,
    });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// Локальная загрузка: бинарное тело PUT-запроса пишем на диск.
router.put("/storage/local-put/:id", (req: Request, res: Response) => {
  const id = req.params["id"];
  if (!isSafeId(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  // Сохраняем тип, который прислал браузер, чтобы потом отдать его же.
  const contentType = (req.headers["content-type"] as string) || "";
  if (contentType) {
    try {
      fs.writeFileSync(localTypePath(id), contentType);
    } catch (err) {
      req.log.warn({ err }, "Could not persist local object content type");
    }
  }

  const out = fs.createWriteStream(localObjectPath(id));
  req.pipe(out);
  out.on("finish", () => res.status(200).json({ ok: true }));
  out.on("error", (err) => {
    req.log.error({ err }, "Error writing local object");
    res.status(500).json({ error: "Failed to store object" });
  });
});

router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path as string | string[];
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const kindHint =
      typeof req.query["kind"] === "string" ? req.query["kind"] : undefined;

    // Локальные объекты: /objects/local/<id> — отдаём с диска без авторизации,
    // чтобы обычный <Image src="…"> мог их показать.
    if (wildcardPath.startsWith("local/")) {
      const id = wildcardPath.slice("local/".length);
      if (!isSafeId(id)) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      const filepath = localObjectPath(id);
      if (!fs.existsSync(filepath)) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      res.setHeader("Content-Type", readLocalContentType(id, kindHint));
      res.setHeader("Cache-Control", "public, max-age=3600");
      fs.createReadStream(filepath).pipe(res);
      return;
    }

    const object = await objectStorageService.getObject(`/objects/${wildcardPath}`);
    const download = await objectStorageService.downloadObject(object);

    res.setHeader("Content-Type", download.contentType);
    res.setHeader("Cache-Control", download.cacheControl);
    if (download.contentLength !== null) {
      res.setHeader("Content-Length", String(download.contentLength));
    }

    if (download.body) {
      Readable.fromWeb(download.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
