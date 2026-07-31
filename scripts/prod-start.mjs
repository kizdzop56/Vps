// Production startup for single-container deployments (Render, Railway, Fly, VPS).
//
// Boot sequence:
//   1. push DB schema (always, unless RUN_DB_PUSH=false)
//      + run idempotent seed (optional, RUN_DB_SETUP=true)
//   2. start API server (bundled dist) on API_PORT
//   3. start static web server (Expo web export) on WEB_PORT
//   4. start reverse proxy on $PORT:  /api/* -> API, everything else -> web
//
// The proxy pattern mirrors scripts/preview-proxy.mjs (and the Replit setup),
// so the frontend keeps calling the API on the same origin via relative /api.
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PORT = Number(process.env.PORT || 10000); // public port (Render sets PORT)
const API_PORT = Number(process.env.API_PORT || 8080);
const WEB_PORT = Number(process.env.WEB_PORT || 22710);

if (!process.env.DATABASE_URL) {
  console.error("[prod] DATABASE_URL is required");
  process.exit(1);
}

// ---------- 1. DB schema (always) + seed (optional) ----------
//
// Раньше обоими шагами управляла одна переменная RUN_DB_SETUP, и с
// RUN_DB_SETUP=false — как советует комментарий в render.yaml после первого
// деплоя — схема перестаёт раскатываться совсем. Дальше любой коммит, меняющий
// lib/db/src/schema, ломает боевой сервер: drizzle перечисляет в SELECT все
// колонки, и на недостающей колонке или таблице Postgres отвечает ошибкой, а
// эндпоинт — пятисоткой.
//
// Так и вышло: база отстала сразу на несколько коммитов — не было таблиц
// deck_assignments и messages и колонок words.emoji, user_card_state.lapses,
// flashcard_settings.daily_word_goal. У ученика не грузились колоды, у учителя
// не работали каталог слов и добавление слова, не открывался чат.
//
// Поэтому шаги разделены:
//   • схема — раскатывается ВСЕГДА. push идемпотентен: когда расхождений нет,
//     это несколько секунд и никаких изменений.
//   • сид (тестовые аккаунты, картинки к словам) — по-прежнему за RUN_DB_SETUP.
//
// Отказаться от push можно явно, через RUN_DB_PUSH=false, — тогда следить за
// схемой боевой базы придётся самому (`pnpm db:push`). См. DEPLOY.md.
const PUSH_ATTEMPTS = 2;
// Оба шага обязаны быть ограничены по времени. spawnSync без timeout ждёт
// бесконечно, а повисший push означает, что контейнер никогда не начнёт
// слушать порт: healthcheck не пройдёт и деплой встанет — это хуже той поломки,
// от которой push спасает.
const PUSH_TIMEOUT_MS = Number(process.env.DB_PUSH_TIMEOUT_MS || 90_000);
const SEED_TIMEOUT_MS = Number(process.env.DB_SEED_TIMEOUT_MS || 120_000);

/** Синхронная пауза между попытками — без спавна лишнего процесса. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runStep(name, args, timeoutMs) {
  const result = spawnSync("pnpm", args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    timeout: timeoutMs,
  });
  // При таймауте spawnSync убивает процесс: status === null, есть signal/error.
  const timedOut = result.error?.code === "ETIMEDOUT" || (result.status === null && !!result.signal);
  if (timedOut) {
    console.error(`[prod] ${name} timed out after ${Math.round(timeoutMs / 1000)}s`);
  }
  return { ok: result.status === 0, timedOut };
}

if (process.env.RUN_DB_PUSH === "false") {
  console.warn(
    "[prod] WARNING: RUN_DB_PUSH=false — schema push skipped. After any change to " +
    "lib/db/src/schema you must run `pnpm db:push` against this database yourself.",
  );
} else {
  let pushed = false;
  for (let attempt = 1; attempt <= PUSH_ATTEMPTS && !pushed; attempt++) {
    console.log(`[prod] DB setup: pushing schema… (attempt ${attempt}/${PUSH_ATTEMPTS})`);
    const { ok, timedOut } = runStep("schema push", ["--filter", "@workspace/db", "run", "push-force"], PUSH_TIMEOUT_MS);
    pushed = ok;
    // Повтор нужен ровно для одного случая: база на бесплатном тарифе просыпается
    // вместе с сервисом и первое соединение не успевает. Такая осечка приходит
    // быстро. Таймаут же говорит о структурной проблеме — второй заход только
    // отнимет ещё полторы минуты у старта, поэтому не повторяем.
    if (!pushed && timedOut) break;
    if (!pushed && attempt < PUSH_ATTEMPTS) {
      console.warn("[prod] schema push failed — retrying in 3s…");
      sleepSync(3000);
    }
  }
  if (pushed) {
    console.log("[prod] DB setup: schema is up to date");
  } else {
    // Раньше здесь был process.exit(1). Теперь push выполняется на каждом
    // старте, и ронять контейнер из-за разовой недоступности базы — значит
    // менять «часть функций не работает» на «не работает ничего». Приложение
    // поднимаем, но кричим в лог; вторая линия обороны — страховка схемы в
    // artifacts/api-server/src/lib/ensureSchema.ts, она досоздаёт недостающие
    // колонки уже из процесса сервера.
    console.error(
      "[prod] ERROR: schema push failed — starting anyway. Endpoints reading changed " +
      "tables may return 500 until the schema is pushed (see DEPLOY.md).",
    );
  }
}

// Сид идемпотентен, но нужен не на каждом старте — им управляет RUN_DB_SETUP.
if ((process.env.RUN_DB_SETUP ?? "true") !== "false") {
  console.log("[prod] DB setup: seeding test accounts…");
  const { ok } = runStep("seed", ["--filter", "@workspace/scripts", "run", "seed"], SEED_TIMEOUT_MS);
  if (!ok) {
    // Non-fatal: the app works without seed; log loudly and continue.
    console.error("[prod] WARNING: seed failed (continuing) — check DATABASE_URL/logs");
  }
}

// ---------- 2-3. children ----------
const children = [];
let shuttingDown = false;

function start(name, cmd, args, extraEnv) {
  const child = spawn(cmd, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tag = `[${name}]`;
  child.stdout.on("data", (d) => process.stdout.write(`${tag} ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`${tag} ${d}`));
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`[prod] ${name} exited unexpectedly (code ${code}) — shutting down`);
      shutdown(1);
    }
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {}
  }
  setTimeout(() => process.exit(code), 800);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("api", "node", ["--enable-source-maps", "artifacts/api-server/dist/index.mjs"], {
  PORT: String(API_PORT),
});
start("web", "node", ["artifacts/english-learning/server/serve.js"], {
  PORT: String(WEB_PORT),
});

// ---------- 4. reverse proxy on the public port ----------
function isApiPath(url) {
  const pathname = new URL(url || "/", "http://localhost").pathname;
  return pathname === "/api" || pathname.startsWith("/api/");
}

// Ответ об ошибке самого прокси. Для /api отдаём JSON: клиент разбирает каждый
// ответ как JSON и на текстовом теле спотыкался невнятным исключением разбора
// («The string did not match the expected pattern.» на iOS Safari) вместо
// объяснения. Остальные пути читает браузер, а не код, — там оставляем текст.
function failRequest(req, res, status, message) {
  // Ответ уже ушёл целиком — трогать нечего (destroy() здесь мог бы его обрезать).
  if (res.writableEnded) return;
  // Статус и заголовки уже отправлены — заменить их нельзя, только оборвать.
  if (res.headersSent) {
    res.destroy();
    return;
  }
  if (isApiPath(req.url)) {
    const body = JSON.stringify({ error: message });
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body),
      "cache-control": "no-store",
    });
    res.end(body);
    return;
  }
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(message);
}

// Сколько ждём ответа от своего же процесса. Запрос, висящий дольше, — это
// обычно зависший внешний вызов внутри обработчика: честный 504 в JSON лучше
// оборванного соединения или HTML-страницы от прокси хостинга.
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 60_000);

function proxyRequest(req, res, targetPort) {
  const options = {
    hostname: "127.0.0.1",
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${targetPort}` },
  };
  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxy.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    proxy.destroy();
    failRequest(req, res, 504, "Сервер не ответил вовремя. Попробуйте ещё раз.");
  });
  proxy.on("error", () => {
    failRequest(req, res, 502, "Сервер ещё запускается. Попробуйте через несколько секунд.");
  });
  req.pipe(proxy, { end: true });
}

const server = http.createServer((req, res) => {
  proxyRequest(req, res, isApiPath(req.url) ? API_PORT : WEB_PORT);
});

// WebSocket passthrough (e.g. future realtime features)
server.on("upgrade", (req, socket, head) => {
  const targetPort = isApiPath(req.url) ? API_PORT : WEB_PORT;
  const upstream = net.connect(targetPort, "127.0.0.1", () => {
    const headers = { ...req.headers, host: `localhost:${targetPort}` };
    const headerLines = Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${headerLines}\r\n\r\n`);
    if (head && head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[prod] proxy :${PORT} → /api/* → :${API_PORT}, /* → :${WEB_PORT}`);
});
