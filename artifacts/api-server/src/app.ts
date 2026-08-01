import express, { type Express } from "express";
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
