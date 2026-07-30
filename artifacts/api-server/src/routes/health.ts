import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { checkSchema } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// ── GET /api/healthz/db ──────────────────────────────────────────────────
// Диагностика состояния базы: доступна ли она и не отстала ли схема от кода.
// Нужна потому, что обычный /healthz отвечал 200 даже тогда, когда в базе не
// было таблиц conversations, messages и deck_assignments, — сервер считался
// здоровым, а чат и список колод отдавали 500.
//
// Открывается прямо в браузере, авторизация не требуется: наружу уходят только
// имена таблиц из открытого исходного кода, никаких данных пользователей.
router.get("/healthz/db", async (_req, res) => {
  try {
    const { ok, expectedCount, missingTables } = await checkSchema();
    res.status(ok ? 200 : 503).json({
      status: ok ? "ok" : "schema-drift",
      database: "reachable",
      expectedTables: expectedCount,
      missingTables,
      ...(ok ? {} : { hint: "Схема БД отстала от кода. Применить: pnpm db:push && pnpm seed" }),
    });
  } catch (err) {
    res.status(503).json({
      status: "error",
      database: "unreachable",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
