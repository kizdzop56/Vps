// Production startup for single-container deployments (Render, Railway, Fly, VPS).
//
// Boot sequence:
//   1. (optional, RUN_DB_PUSH=true) push DB schema via drizzle-kit
//   1a. (always) ensure all tables + columns exist via scripts/ensure-columns.mjs
//   2. (optional, RUN_DB_SEED, on by default) run idempotent seed
//   3. start API server (bundled dist) on API_PORT
//   4. start static web server (Expo web export) on WEB_PORT
//   5. start reverse proxy on $PORT:  /api/* -> API, everything else -> web
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

// ---------- 1. DB schema + seed ----------
//
// Раньше оба шага включались одной переменной RUN_DB_SETUP, и она по умолчанию
// была включена. На бесплатном плане Render сервис засыпает после ~15 минут
// простоя, то есть холодные старты идут постоянно — и вместе с каждым в живую
// базу летел push-force схемы. Это ровно та операция, которая при расхождении
// схемы молча теряет данные.
//
// Теперь шаги независимы:
//   RUN_DB_PUSH=true   — применить схему (по умолчанию ВЫКЛЮЧЕНО, это делается
//                        осознанно, отдельным шагом деплоя);
//   RUN_DB_SEED=false  — не заводить тестовые аккаунты (по умолчанию включено,
//                        сид идемпотентен и нужен E2E-прогону).
// RUN_DB_SETUP=false по-прежнему выключает оба шага — старые окружения не
// ломаем.
const setupDisabled = process.env.RUN_DB_SETUP === "false";
const runDbPush = !setupDisabled && process.env.RUN_DB_PUSH === "true";
const runDbSeed = !setupDisabled && process.env.RUN_DB_SEED !== "false";

if (runDbPush) {
  console.log("[prod] DB setup: pushing schema…");
  const push = spawnSync("pnpm", ["--filter", "@workspace/db", "run", "push-force"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (push.status !== 0) {
    console.error("[prod] schema push failed — aborting startup");
    process.exit(1);
  }
}

// Всегда проверяем и дополняем схему — после push (если был), до сида.
// Скрипт добавляет недостающие таблицы и колонки и ничего не удаляет,
// поэтому безопасен на каждом старте.
spawnSync("node", ["scripts/ensure-columns.mjs"], { cwd: root, stdio: "inherit", env: process.env });

if (runDbSeed) {
  console.log("[prod] DB setup: seeding test accounts…");
  const seed = spawnSync("pnpm", ["--filter", "@workspace/scripts", "run", "seed"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (seed.status !== 0) {
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
  proxy.on("error", () => {
    res.writeHead(502);
    res.end("Service starting, please retry…");
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
