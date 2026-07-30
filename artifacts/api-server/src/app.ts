import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
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

// ── Ответы об ошибках всегда в JSON ──────────────────────────────────────
// По умолчанию Express отдаёт на непойманное исключение и на несуществующий
// маршрут HTML-страницу («<!DOCTYPE html>… Internal Server Error»). Клиент при
// этом делает res.json() и получает не ошибку сервера, а невнятную ошибку
// парсера: в Safari это «The string did not match the expected pattern.»,
// в Chrome — «Unexpected token <». Настоящая причина полностью теряется.
//
// Ниже — два обработчика, которые гарантируют, что из /api ВСЕГДА приходит
// JSON вида { error, ... }. Это единственный способ увидеть реальную ошибку
// на клиенте, и он не зависит от хостинга (Render, VPS, docker-compose).

// 404 для всего, что не подошло ни к одному роуту /api/*.
app.use("/api", (req: Request, res: Response) => {
  res.status(404).json({
    error: "Not Found",
    message: `Маршрут ${req.method} ${req.originalUrl.split("?")[0]} не существует`,
  });
});

// HTTP-статус, если ошибка его несёт (например, невалидный JSON в теле запроса
// приходит от express.json() как ошибка со status 400).
function errorStatus(err: unknown): number {
  if (typeof err !== "object" || err === null) return 500;
  const candidate = err as { status?: unknown; statusCode?: unknown };
  const raw = typeof candidate.status === "number" ? candidate.status : candidate.statusCode;
  return typeof raw === "number" && raw >= 400 && raw <= 599 ? raw : 500;
}

// Централизованный обработчик ошибок. В Express 5 сюда попадают и отклонённые
// промисы из async-роутов, поэтому отдельный asyncHandler не нужен.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const status = errorStatus(err);

  // Полный стек — только в логи сервера.
  logger.error({ err, url: req.originalUrl, method: req.method }, "Unhandled request error");

  if (res.headersSent) return;

  // Короткий текст ошибки отдаём клиенту намеренно: без него диагностика
  // продакшена сводится к угадыванию (ровно так и потерялось «relation
  // "conversations" does not exist»). Стек и детали наружу не уходят.
  const message =
    err instanceof Error && err.message ? err.message : "Непредвиденная ошибка сервера";

  res.status(status).json({
    error: status === 500 ? "Internal Server Error" : "Request Error",
    message,
  });
});

export default app;
