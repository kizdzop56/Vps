import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.set("etag", false);

// ── Доверие прокси ──────────────────────────────────────────────────────────
// Приложение всегда стоит за прокси: на Render — их балансировщик, внутри
// контейнера — scripts/prod-start.mjs, который разводит /api и статику. Без
// этой настройки req.ip у ВСЕХ запросов равен 127.0.0.1, и ограничение частоты
// (lib/rateLimit.ts) превращается в один общий счётчик на всех пользователей:
// один перебор пароля закрывает вход всей школе.
app.set("trust proxy", true);

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

// ── CORS ────────────────────────────────────────────────────────────────────
// Раньше стоял cors() без настроек, то есть Access-Control-Allow-Origin: * —
// любая страница в интернете могла обращаться к API от имени того, кто её
// открыл. Токен приложение держит не в cookie, поэтому катастрофы не было, но
// открытый доступ здесь не нужен вовсе: фронтенд ходит на СВОЙ origin через
// прокси, а мобильный клиент заголовок Origin не присылает.
//
// Поэтому:
//   • запрос без Origin (мобильное приложение, curl, серверные вызовы) —
//     пропускаем: CORS про браузеры, ограничивать здесь нечего;
//   • Origin из списка ALLOWED_ORIGINS (через запятую) — разрешаем;
//   • локальная разработка — разрешаем localhost и 127.0.0.1 на любом порту;
//   • всё остальное — без разрешающего заголовка, браузер сам не пустит.
const allowedOrigins = (process.env["ALLOWED_ORIGINS"] ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function originAllowed(origin: string): boolean {
  const clean = origin.replace(/\/$/, "");
  if (allowedOrigins.includes(clean)) return true;
  if (process.env["NODE_ENV"] !== "production" && LOCAL_ORIGIN.test(clean)) return true;
  // Свой же домен: EXPO_PUBLIC_DOMAIN задаётся, когда фронтенд собран под
  // конкретный адрес.
  const own = process.env["EXPO_PUBLIC_DOMAIN"]?.trim();
  if (own && clean === `https://${own.replace(/^https?:\/\//, "")}`) return true;
  return false;
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (originAllowed(origin)) {
        callback(null, true);
        return;
      }
      // Не ошибка: просто не выдаём разрешающий заголовок. Ошибка здесь
      // превратилась бы в 500 в логах на каждый чужой запрос.
      logger.warn({ origin }, "CORS: источник не в списке разрешённых");
      callback(null, false);
    },
    credentials: true,
  }),
);

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
