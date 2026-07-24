// One-command dev orchestrator: runs the API server, the Expo web dev server,
// and the preview proxy together, with prefixed logs.
//
//   pnpm dev        ->  open http://localhost:5000
//
// Prerequisites: Postgres running (docker compose up -d), .env present,
// `pnpm db:push` and (optionally) `pnpm seed` already run.
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- Load .env (simple parser; never overrides already-set variables) ---
const envPath = path.join(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let val = m[2];
    if (/^".*"$/.test(val) || /^'.*'$/.test(val)) val = val.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

if (!process.env.DATABASE_URL) {
  console.error(
    "[dev] DATABASE_URL is not set.\n" +
      "      1) cp .env.example .env\n" +
      "      2) docker compose up -d\n" +
      "      3) pnpm db:push  (&& pnpm seed)\n",
  );
  process.exit(1);
}

// Ports MUST match scripts/preview-proxy.mjs
const API_PORT = "8080";
const EXPO_PORT = "22710";
const PROXY_PORT = "5000";

const procs = [
  {
    name: "api",
    color: "\x1b[36m",
    cmd: "pnpm",
    args: ["--filter", "@workspace/api-server", "run", "dev"],
    env: { ...process.env, PORT: API_PORT, NODE_ENV: "development" },
  },
  {
    name: "expo",
    color: "\x1b[35m",
    cmd: "pnpm",
    args: [
      "--filter",
      "@workspace/english-learning",
      "exec",
      "expo",
      "start",
      "--web",
      "--port",
      EXPO_PORT,
    ],
    env: {
      ...process.env,
      NODE_ENV: "development",
      CI: "1",
      BROWSER: "none",
      EXPO_NO_TELEMETRY: "1",
    },
  },
  {
    name: "proxy",
    color: "\x1b[32m",
    cmd: "node",
    args: ["scripts/preview-proxy.mjs"],
    env: { ...process.env },
  },
];

const RESET = "\x1b[0m";
const children = [];
let shuttingDown = false;

function log(name, color, data) {
  for (const line of data.toString().split("\n")) {
    if (line.length) process.stdout.write(`${color}[${name}]${RESET} ${line}\n`);
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {}
  }
  setTimeout(() => process.exit(0), 500);
}

for (const p of procs) {
  const child = spawn(p.cmd, p.args, { cwd: root, env: p.env });
  child.stdout.on("data", (d) => log(p.name, p.color, d));
  child.stderr.on("data", (d) => log(p.name, p.color, d));
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.log(`\n[dev] "${p.name}" exited (code ${code}). Shutting down.`);
      shutdown();
    }
  });
  children.push(child);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(
  `[dev] api:${API_PORT}  expo:${EXPO_PORT}  proxy:${PROXY_PORT}\n` +
    `[dev] Open  ->  http://localhost:${PROXY_PORT}\n`,
);
