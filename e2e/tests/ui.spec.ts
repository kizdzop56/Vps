// Браузерный прогон: настоящий Chromium заходит под каждой ролью и обходит
// экраны приложения.
//
// Что считается падением:
//   1. вход не сработал (форма не пустила или не случился переход);
//   2. на экране пусто — белая страница вместо интерфейса;
//   3. ошибка в консоли или необработанное исключение на странице;
//   4. любой ответ сервера с кодом 5xx во время обхода.
//
// Экраны берутся из app/(main): группы в скобках в URL не попадают, поэтому
// путь до экрана — просто "/profile", "/flashcards" и так далее.
import { test, expect, type Page } from "@playwright/test";

type Role = "teacher" | "student" | "parent";

const CREDS: Record<Role, { username: string; password: string }> = {
  teacher: { username: "teacher", password: "teacher123" },
  student: { username: "student", password: "student123" },
  parent: { username: "parent", password: "parent123" },
};

const ROUTES: Record<Role, string[]> = {
  student: [
    "/profile",
    "/flashcards",
    "/assignments",
    "/leaderboard",
    "/friends",
    "/progress",
    "/timer",
    "/scenarios",
    "/calendar",
    "/history",
    "/raid",
  ],
  teacher: ["/profile", "/students", "/assignments", "/create-assignment", "/analysis", "/calendar"],
  parent: ["/profile", "/friends", "/progress"],
};

// Шум, который не является баго��: сообщения инструментов разработчика и
// отсутствующая иконка вкладки. Всё остальное — повод для тикета.
const IGNORED = [
  /React DevTools/i,
  /favicon/i,
  /Download the React/i,
  /\[expo\]/i,
];

function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  const keep = (text: string) => !IGNORED.some((re) => re.test(text));

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (keep(text)) problems.push(`консоль: ${text}`);
  });
  page.on("pageerror", (err) => {
    if (keep(err.message)) problems.push(`исключение на странице: ${err.message}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 500) problems.push(`${res.status()} от ${res.url()}`);
  });

  return problems;
}

async function login(page: Page, role: Role): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  const username = page.getByTestId("username-input");
  await expect(username, "экран входа не отрисовался").toBeVisible();
  await username.fill(CREDS[role].username);
  await page.getByTestId("password-input").fill(CREDS[role].password);
  await page.getByTestId("login-button").click();

  // Сообщение об ошибке важнее таймаута: по нему сразу видно, что именно
  // ответил сервер, вместо безликого «переход не случился».
  const error = page.getByText(/Неверный псевдоним|Ошибка соединения|Ошибка входа/);
  const outcome = await Promise.race([
    page.waitForURL(/profile/, { timeout: 45_000 }).then(() => "ok" as const),
    error.first().waitFor({ timeout: 45_000 }).then(() => "error" as const),
  ]);

  if (outcome === "error") {
    throw new Error(`Вход под ${role} не удался: ${await error.first().innerText()}`);
  }
}

async function screenIsAlive(page: Page, route: string): Promise<void> {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500); // даём экрану дорисоваться и дозагрузить данные

  const text = (await page.locator("body").innerText()).trim();
  expect(text.length, `экран ${route} пустой — белая страница`).toBeGreaterThan(20);
  expect(text, `экран ${route} показал экран ошибки`).not.toMatch(/Not Found|Something went wrong|Unexpected token/i);
}

test("неавторизованного посетителя уводит на вход", async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("username-input"), "с корня не попали на экран входа").toBeVisible({
    timeout: 45_000,
  });
  expect(problems, `проблемы на экране входа:\n${problems.join("\n")}`).toHaveLength(0);
});

for (const role of Object.keys(ROUTES) as Role[]) {
  test(`обход экранов под ${role}`, async ({ page }) => {
    const problems = watchProblems(page);

    await login(page, role);

    const broken: string[] = [];
    for (const route of ROUTES[role]) {
      try {
        await screenIsAlive(page, route);
      } catch (err) {
        broken.push(`${route}: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
    }

    expect(broken, `сломанные экраны под ${role}:\n${broken.join("\n")}`).toHaveLength(0);
    expect(problems, `ошибки в браузере под ${role}:\n${problems.join("\n")}`).toHaveLength(0);
  });
}
