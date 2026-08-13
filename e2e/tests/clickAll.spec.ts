// Нажать каждую кнопку на каждом экране.
//
// Обход в ui.spec.ts проверяет, что экран открылся и не сыпет ошибками. Этого
// мало: мёртвые кнопки и пустые данные живут ВНУТРИ экранов, за нажатием.
//
// Что делает этот прогон для каждой роли:
//   1. открывает экран;
//   2. собирает все интерактивные элементы (кнопки, ссылки, роли button/tab,
//      элементы с testID и с обработчиком нажатия);
//   3. нажимает каждый по очереди, после каждого нажатия смотрит, что
//      изменилось, и возвращается на исходный экран.
//
// Находки делятся по типу, потому что чинятся они по-разному:
//   МЁРТВАЯ КНОПКА  — нажатие ничего не изменило: ни экрана, ни разметки, ни
//                     запроса. Обработчик не привязан или молча падает.
//   ОТКАЗ СЕРВЕРА   — нажатие ушло в API и получило 4xx/5xx.
//   ИСКЛЮЧЕНИЕ      — нажатие уронило JS.
//   ПУСТОЙ ЭКРАН    — перешли по нажатию и попали в пустоту.
//
// Прогон длинный по своей природе: элементов на экранах много. Поэтому он
// живёт отдельным файлом и в CI запускается отдельной job.
import { test, expect, type Locator, type Page } from "@playwright/test";

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

// Нажатия, после которых прогон закончится досрочно или испортит данные.
// Выход из аккаунта и удаление проверяются отдельно, руками.
const SKIP_LABELS = [
  /выйти|выход|log ?out|sign ?out/i,
  /удалить|удаление|delete|remove/i,
  /сменить пароль|изменить пароль/i,
  /отписаться|отвязать/i,
];

const IGNORED_CONSOLE = [
  /React DevTools/i,
  /favicon/i,
  /Download the React/i,
  /\[expo\]/i,
  /Failed to load resource/i, // придёт из обработчика ответов, с адресом
];

/** Сколько элементов проверяем на одном экране. Защита от бесконечной ленты. */
const MAX_ELEMENTS_PER_SCREEN = 40;

type Finding = { screen: string; label: string; kind: string; detail: string };

/** Наблюдатель за ошибками страницы: собирает всё, что случилось за нажатие. */
function createWatcher(page: Page) {
  let apiFailures: string[] = [];
  let exceptions: string[] = [];
  let apiCalls = 0;

  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("/api/")) return;
    apiCalls++;
    if (res.status() >= 400) apiFailures.push(`${res.status()} на ${res.request().method()} ${url}`);
  });
  page.on("pageerror", (err) => {
    exceptions.push(err.message);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    exceptions.push(`консоль: ${text}`);
  });

  return {
    reset() {
      apiFailures = [];
      exceptions = [];
      apiCalls = 0;
    },
    get state() {
      return { apiFailures: [...apiFailures], exceptions: [...exceptions], apiCalls };
    },
  };
}

async function login(page: Page, role: Role): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const username = page.getByTestId("username-input");
  await expect(username, "экран входа не отрисовался").toBeVisible({ timeout: 45_000 });
  await username.fill(CREDS[role].username);
  await page.getByTestId("password-input").fill(CREDS[role].password);
  await page.getByTestId("login-button").click();
  await page.waitForURL(/profile/, { timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

async function openScreen(page: Page, route: string): Promise<void> {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
}

/**
 * Как называется элемент в отчёте.
 *
 * Expo web рисует кнопки как div с обработчиком, поэтому доступного имени часто
 * нет. Тогда берём видимый текст, затем testID, затем позицию — лишь бы автор
 * мог найти кнопку глазами.
 */
async function describe(el: Locator, index: number): Promise<string> {
  const parts: string[] = [];
  const text = (await el.innerText().catch(() => "")).trim().split("\n")[0];
  if (text) parts.push(`«${text.slice(0, 60)}»`);
  const testId = await el.getAttribute("data-testid").catch(() => null);
  if (testId) parts.push(`testID=${testId}`);
  const aria = await el.getAttribute("aria-label").catch(() => null);
  if (aria && !text) parts.push(`aria=${aria}`);
  if (parts.length === 0) {
    const box = await el.boundingBox().catch(() => null);
    parts.push(box ? `элемент без подписи (${Math.round(box.x)},${Math.round(box.y)})` : "элемент без подписи");
  }
  return `#${index + 1} ${parts.join(" ")}`;
}

/** Слепок состояния экрана: по нему видно, отреагировало ли нажатие. */
async function snapshot(page: Page): Promise<{ url: string; text: string; nodes: number }> {
  return {
    url: page.url(),
    text: (await page.locator("body").innerText().catch(() => "")).trim(),
    nodes: await page.locator("body *").count().catch(() => 0),
  };
}

async function clickables(page: Page): Promise<Locator[]> {
  // Expo web не ставит role="button" на TouchableOpacity, зато оставляет
  // tabindex и обработчик нажатия. Поэтому ищем и по семантике, и по признакам
  // интерактивности, а затем отбрасываем то, во что нельзя ткнуть.
  const candidates = page.locator(
    [
      "button",
      "[role='button']",
      "[role='tab']",
      "[role='link']",
      "[role='switch']",
      "[role='checkbox']",
      "a[href]",
      "[data-testid]",
      "div[tabindex='0']",
    ].join(", "),
  );

  const total = await candidates.count();
  const result: Locator[] = [];
  for (let i = 0; i < total && result.length < MAX_ELEMENTS_PER_SCREEN; i++) {
    const el = candidates.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    if (!(await el.isEnabled().catch(() => false))) continue;
    const box = await el.boundingBox().catch(() => null);
    if (!box || box.width < 8 || box.height < 8) continue; // невидимая обёртка
    // Поля ввода нажатием не проверяются: там нужен ввод текста, это отдельная
    // проверка на конкретный сценарий.
    const tag = await el.evaluate((node) => node.tagName.toLowerCase()).catch(() => "");
    if (tag === "input" || tag === "textarea" || tag === "select") continue;
    result.push(el);
  }
  return result;
}

async function checkScreen(
  page: Page,
  watcher: ReturnType<typeof createWatcher>,
  route: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  await openScreen(page, route);

  const elements = await clickables(page);
  const labels: string[] = [];
  for (let i = 0; i < elements.length; i++) labels.push(await describe(elements[i]!, i));

  for (let i = 0; i < elements.length; i++) {
    const label = labels[i]!;
    if (SKIP_LABELS.some((re) => re.test(label))) continue;

    // Экран пересоздаётся после каждого возврата, поэтому элементы ищем заново
    // по индексу: сохранённый Locator к этому моменту уже мог отвалиться.
    const fresh = (await clickables(page))[i];
    if (!fresh) continue;

    const before = await snapshot(page);
    watcher.reset();

    try {
      await fresh.click({ timeout: 5000 });
    } catch (err) {
      findings.push({
        screen: route,
        label,
        kind: "НЕ НАЖИМАЕТСЯ",
        detail: err instanceof Error ? err.message.split("\n")[0]! : String(err),
      });
      continue;
    }

    await page.waitForTimeout(1200);
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

    const after = await snapshot(page);
    const { apiFailures, exceptions, apiCalls } = watcher.state;

    for (const detail of exceptions) {
      findings.push({ screen: route, label, kind: "ИСКЛЮЧЕНИЕ", detail });
    }
    for (const detail of apiFailures) {
      findings.push({ screen: route, label, kind: "ОТКАЗ СЕРВЕРА", detail });
    }

    const navigated = after.url !== before.url;
    const changed = after.text !== before.text || Math.abs(after.nodes - before.nodes) > 2;

    if (navigated && after.text.length < 20) {
      findings.push({
        screen: route,
        label,
        kind: "ПУСТОЙ ЭКРАН",
        detail: `перешли на ${after.url} и там пусто`,
      });
    }

    // Ничего не изменилось и в сеть никто не ходил — нажатие ушло в пустоту.
    if (!navigated && !changed && apiCalls === 0 && exceptions.length === 0) {
      findings.push({
        screen: route,
        label,
        kind: "МЁРТВАЯ КНОПКА",
        detail: "после нажатия не изменилось ничего: ни экран, ни разметка, ни запросы",
      });
    }

    // Возвращаемся на исходный экран: следующий элемент проверяем из того же
    // состояния, иначе индексы поедут и отчёт станет бессмысленным.
    if (after.url !== before.url) await openScreen(page, route);
    else if (changed) {
      // Могло открыться модальное окно: пробуем закрыть, иначе перезагружаем.
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(400);
      const now = await snapshot(page);
      if (now.text !== before.text) await openScreen(page, route);
    }
  }

  return findings;
}

function report(role: Role, findings: Finding[]): string {
  if (findings.length === 0) return "";
  const byScreen = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byScreen.get(f.screen) ?? [];
    list.push(f);
    byScreen.set(f.screen, list);
  }
  const lines = [`Находки под ${role}: ${findings.length}`];
  for (const [screen, list] of byScreen) {
    lines.push(`\n  экран ${screen}`);
    for (const f of list) lines.push(`    [${f.kind}] ${f.label} → ${f.detail}`);
  }
  return lines.join("\n");
}

for (const role of Object.keys(ROUTES) as Role[]) {
  test(`нажать каждую кнопку под ${role}`, async ({ page }) => {
    // Прогон намеренно долгий: на экране десятки элементов, каждый нажимаем и
    // ждём реакции.
    test.setTimeout(20 * 60 * 1000);

    const watcher = createWatcher(page);
    await login(page, role);

    const findings: Finding[] = [];
    for (const route of ROUTES[role]) {
      findings.push(...(await checkScreen(page, watcher, route)));
    }

    expect(findings, report(role, findings)).toHaveLength(0);
  });
}
