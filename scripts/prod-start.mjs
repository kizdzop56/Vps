// Production startup for single-container deployments (Render, Railway, Fly, VPS).
//
// Boot sequence:
//   1. (optional, RUN_DB_SETUP=true) push DB schema + run idempotent seed
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

// ---------- 1. DB schema + seed (idempotent, safe on every boot) ----------
function pnpmRun(args) {
  return spawnSync("pnpm", args, { cwd: root, stdio: "inherit", env: process.env });
}

const pushSchema = () => pnpmRun(["--filter", "@workspace/db", "run", "push-force"]);
const runSeed = () => pnpmRun(["--filter", "@workspace/scripts", "run", "seed"]);
const checkSchema = () => pnpmRun(["--filter", "@workspace/scripts", "run", "check-schema"]);

if ((process.env.RUN_DB_SETUP ?? "true") !== "false") {
  console.log("[prod] DB setup: pushing schema…");
  const push = pushSchema();
  if (push.status !== 0) {
    console.error("[prod] schema push failed — aborting startup");
    process.exit(1);
  }
  console.log("[prod] DB setup: seeding test accounts…");
  const seed = runSeed();
  if (seed.status !== 0) {
    // Non-fatal: the app works without seed; log loudly and continue.
    console.error("[prod] WARNING: seed failed (continuing) — check DATABASE_URL/logs");
  }
} else {
  console.log("[prod] RUN_DB_SETUP=false — плановые push/seed пропущены");
}

// ---------- 1b. Схема БД проверяется ВСЕГДА ----------
// Так приложение однажды и сломалось: с RUN_DB_SETUP=false схема в базе
// осталась на состоянии до коммитов c93dec8 и 6915fd7 — в ней не было таблиц
// deck_assignments, conversations и messages. Сервер при этом стартовал, healthz
// отвечал 200, и только чат и список колод молча падали с 500. Проверка ниже
// выполняется независимо от RUN_DB_SETUP: пропуск сида не должен приводить к
// тому, что база структурно отстаёт от кода.
console.log("[prod] DB check: сверяю схему с кодом…");
if (checkSchema().status !== 0) {
  console.error("[prod] схема БД отстала от кода — применяю её принудительно");
  if (pushSchema().status !== 0) {
    console.error("[prod] не удалось применить схему — останавливаюсь");
    process.exit(1);
  }
  // Сид идемпотентный, но обязательный: системные колоды (в т.ч. уровневые
  // A1–C2) появляются в базе только через него.
  if (runSeed().status !== 0) {
    console.error("[prod] WARNING: seed failed after schema repair (continuing)");
  }
  if (checkSchema().status !== 0) {
    if (process.env.ALLOW_SCHEMA_DRIFT === "true") {
      console.error("[prod] WARNING: схема всё ещё неполная, но ALLOW_SCHEMA_DRIFT=true — стартую");
    } else {
      console.error("[prod] схема всё ещё неполная — останавливаюсь, чтобы не поднимать наполовину рабочее приложение");
      console.error("[prod] применить вручную: pnpm db:push && pnpm seed   (проверить: pnpm db:check)");
      console.error("[prod] чтобы всё-таки стартовать: ALLOW_SCHEMA_DRIFT=true");
      process.exit(1);
    }
  } else {
    console.log("[prod] схема БД восстановлена");
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
