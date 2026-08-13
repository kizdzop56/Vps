// Проверки на уровне API: то, что можно спросить у сервера напрямую.
//
// Аккаунты — те самые, что создаёт scripts/src/seed.ts на каждом деплое
// (RUN_DB_SETUP=true). Если сид не прошёл, эти тесты первыми об этом скажут.
import { test, expect } from "@playwright/test";

const ACCOUNTS = [
  { role: "teacher", username: "teacher", password: "teacher123" },
  { role: "student", username: "student", password: "student123" },
  { role: "parent", username: "parent", password: "parent123" },
] as const;

test.describe("API: здоровье сервиса", () => {
  test("/api/healthz отвечает ok", async ({ request }) => {
    const res = await request.get("/api/healthz");
    expect(res.ok(), `healthz вернул ${res.status()}`).toBeTruthy();
    expect(await res.json()).toMatchObject({ status: "ok" });
  });

  test("неизвестный /api маршрут отдаёт JSON, а не HTML", async ({ request }) => {
    const res = await request.get("/api/this-route-does-not-exist");
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"] ?? "").toContain("application/json");
  });
});

test.describe("API: вход и роли", () => {
  for (const acc of ACCOUNTS) {
    test(`вход под ${acc.role} и его роль в /auth/me`, async ({ request }) => {
      const login = await request.post("/api/auth/login", {
        data: { username: acc.username, password: acc.password },
      });
      expect(login.ok(), `логин ${acc.username} вернул ${login.status()}`).toBeTruthy();

      const body = await login.json();
      expect(body.token, "сервер не вернул токен").toBeTruthy();
      expect(body.user?.role, "роль в ответе логина не совпала").toBe(acc.role);

      const me = await request.get("/api/auth/me", {
        headers: { authorization: `Bearer ${body.token}` },
      });
      expect(me.ok(), `/auth/me вернул ${me.status()}`).toBeTruthy();
      expect((await me.json()).role).toBe(acc.role);
    });
  }

  test("неверный пароль не пускает", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { username: "student", password: "definitely-not-the-password" },
    });
    expect(res.status()).toBe(401);
  });

  test("логин без пароля не падает пятисоткой", async ({ request }) => {
    const res = await request.post("/api/auth/login", { data: { username: "student" } });
    expect(res.status()).toBe(400);
  });
});

test.describe("API: доступ и роли", () => {
  test("защищённый маршрут без токена отдаёт 401", async ({ request }) => {
    const res = await request.get("/api/auth/me");
    expect(res.status()).toBe(401);
  });

  test("подделанный токен отдаёт 401", async ({ request }) => {
    const res = await request.get("/api/auth/me", {
      headers: { authorization: "Bearer not.a.real.token" },
    });
    expect(res.status()).toBe(401);
  });

  test("роль учителя нельзя получить без кода учителя", async ({ request }) => {
    const suffix = Date.now();
    const res = await request.post("/api/auth/register", {
      data: {
        username: `qa_teacher_${suffix}`,
        password: "qa-password-123",
        name: "QA",
        role: "teacher",
        email: `qa_teacher_${suffix}@example.com`,
      },
    });
    // Ожидаем отказ ДО создания пользователя: иначе в базе останется мусор,
    // а роль учителя достанется любому желающему.
    expect(res.status(), "регистрацию учителя без кода обязаны отклонить").toBe(403);
  });

  test("регистрация с некорректным email отклоняется", async ({ request }) => {
    const res = await request.post("/api/auth/register", {
      data: {
        username: `qa_bad_email_${Date.now()}`,
        password: "qa-password-123",
        name: "QA",
        role: "student",
        email: "это-не-email",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("неизвестная роль при регистрации отклоняется", async ({ request }) => {
    const suffix = Date.now();
    const res = await request.post("/api/auth/register", {
      data: {
        username: `qa_role_${suffix}`,
        password: "qa-password-123",
        name: "QA",
        role: "admin",
        email: `qa_role_${suffix}@example.com`,
      },
    });
    expect(res.status()).toBe(400);
  });
});
