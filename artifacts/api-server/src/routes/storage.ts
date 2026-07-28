import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// GCS считаем настроенным только если заданы креды/эмулятор И приватная папка
// бакета. Иначе (типичный VPS без облачного объектного хранилища) переключаемся
// на локальный диск — так загрузка аватара работает «из коробки».
function gcsConfigured(): boolean {
  return Boolean(
    (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCS_EMULATOR_HOST) &&
      process.env.PRIVATE_OBJECT_DIR
  );
}

// Локальная папка хранения (на VPS переживает перезапуск; на эфемерных
// платформах — до следующего деплоя). Логика совпадает с routes/upload.ts.
let localDir = path.resolve(process.cwd(), "../../uploads");
try {
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
} catch {
  localDir = "/tmp/uploads";
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
}

function baseUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  const host = req.headers["host"] || "localhost";
  return `${proto}://${host}`;
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
    if (gcsConfigured()) {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath });
      return;
    }
    // Локальный режим: клиент делает PUT на наш же эндпоинт, а объект потом
    // отдаётся публично через GET /storage/objects/local/<id>.
    const id = randomUUID();
    const uploadURL = `${baseUrl(req)}/api/storage/local-put/${id}`;
    const objectPath = `/objects/local/${id}`;
    res.json({ uploadURL, objectPath });
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// Локальная загрузка: бинарное тело PUT-запроса пишем на диск.
router.put("/storage/local-put/:id", (req: Request, res: Response) => {
  const id = req.params["id"];
  if (!id || id.includes("/") || id.includes("..")) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const filepath = path.join(localDir, `obj-${id}`);
  const out = fs.createWriteStream(filepath);
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

    // Локальные объекты: /objects/local/<id> — отдаём с диска без авторизации,
    // чтобы обычный <Image src="…"> мог их показать.
    if (wildcardPath.startsWith("local/")) {
      const id = wildcardPath.slice("local/".length);
      if (!id || id.includes("/") || id.includes("..")) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      const filepath = path.join(localDir, `obj-${id}`);
      if (!fs.existsSync(filepath)) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
      // Аватары загружаются как JPEG; фиксируем тип явно, чтобы браузер
      // отрисовал картинку (файл на диске хранится без расширения).
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=3600");
      fs.createReadStream(filepath).pipe(res);
      return;
    }

    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
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
