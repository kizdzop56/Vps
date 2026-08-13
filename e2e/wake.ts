// Прогрев инстанса перед прогоном.
//
// На бесплатном плане Render сервис засыпает, и первый запрос после сна идёт
// до минуты. Без прогрева каждый ночной прогон падал бы на таймауте первого
// теста — то есть сообщал бы о несуществующем баге и прятал настоящие.
import { request } from "@playwright/test";
import { BASE_URL } from "./playwright.config";

const WAKE_TIMEOUT_MS = 4 * 60 * 1000;
const RETRY_DELAY_MS = 10_000;

export default async function globalSetup(): Promise<void> {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const deadline = Date.now() + WAKE_TIMEOUT_MS;
  let lastError = "ответа не было";

  while (Date.now() < deadline) {
    try {
      const res = await ctx.get("/api/healthz", { timeout: 30_000 });
      if (res.ok()) {
        console.log(`[wake] сервис отвечает: ${BASE_URL}`);
        await ctx.dispose();
        return;
      }
      lastError = `HTTP ${res.status()}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }

  await ctx.dispose();
  throw new Error(`Сервис не ответил за 4 минуты (${BASE_URL}). Последняя ошибка: ${lastError}`);
}
