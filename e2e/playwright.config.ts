import { defineConfig, devices } from "@playwright/test";

// Куда стучимся. По умолчанию — прод на Render; можно переопределить
// переменной BASE_URL (в том числе из Actions → Run workflow).
export const BASE_URL = process.env["BASE_URL"] ?? "https://v1-app-j975.onrender.com";

export default defineConfig({
  testDir: "./tests",
  // Бесплатный Render засыпает после ~15 минут простоя, первый ответ идёт до
  // минуты. globalSetup будит сервис ДО тестов, но запас всё равно нужен.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  globalSetup: "./wake.ts",
  // Один воркер: бесплатный инстанс не любит параллельную нагрузку, а
  // «упало из-за нагрузки» — самый бесполезный вид падения.
  workers: 1,
  retries: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "report.json" }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
});
