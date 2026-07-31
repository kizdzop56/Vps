import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
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

app.use("/api", router);

// ─────────────────────────────────────────────────────────────────────────────
// Ответы об ошибках всегда в JSON.
//
// Без этих двух обработчиков express отвечает своей HTML-страницей: на неизвестный
// путь — «Cannot GET /api/...», на исключение в обработчике — «Internal Server
// Error» внутри <pre>. Клиент же на каждый ответ делает res.json(), поэтому вместо
// понятной ошибки получал исключение разбора JSON и показывал его текст
// пользователю. На iOS Safari это выглядело как «The string did not match the
// expected pattern.» — учитель видел это вместо причины сбоя.
//
// Настоящую ошибку пишем в лог (pino, с id запроса), наружу отдаём короткое
// сообщение по-русски: тексты из поля error клиент показывает как есть.
// ─────────────────────────────────────────────────────────────────────────────

// 404 — путь не подошёл ни одному маршруту.
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Неизвестный запрос к серверу.", path: req.originalUrl });
});

// Любое исключение из обработчика. В express 5 сюда попадают и ошибки из async-функций.
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  // Ответ уже начал уходить клиенту — остаётся только оборвать его.
  if (res.headersSent) { next(err); return; }

  const anyErr = err as { status?: number; statusCode?: number; message?: string; type?: string };
  const status = anyErr?.status ?? anyErr?.statusCode ?? 500;

  (req.log ?? logger).error({ err, url: req.originalUrl, method: req.method }, "Unhandled request error");

  if (status === 400 && anyErr?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Тело запроса повреждено — сервер не смог его разобрать." });
    return;
  }
  if (status === 413) {
    res.status(413).json({ error: "Файл слишком большой." });
    return;
  }
  if (status < 500) {
    res.status(status).json({ error: anyErr?.message ?? "Некорректный запрос." });
    return;
  }

  // Пятисотку наружу не расшифровываем: текст ошибки БД пользователю ничего не
  // объясняет, а в логах он есть целиком. Вне production отдаём для отладки.
  res.status(500).json({
    error: "Внутренняя ошибка сервера. Попробуйте ещё раз, а если повторится — сообщите нам.",
    ...(process.env["NODE_ENV"] === "production" ? {} : { detail: anyErr?.message }),
  });
});

export default app;
