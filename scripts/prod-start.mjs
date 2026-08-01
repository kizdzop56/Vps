// Production startup for single-container deployments (Render, Railway, Fly, VPS).
//
// Boot sequence:
//   1. (optional, RUN_DB_SETUP=true) push DB schema via drizzle-kit
//   1a. (always) ensure all flashcard tables + missing columns exist via direct SQL
//   2. (optional, RUN_DB_SETUP=true) run idempotent seed
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

// ---------- Ensure all tables + missing columns (always, even RUN_DB_SETUP=false) ----------
// Все CREATE TABLE IF NOT EXISTS и ALTER TABLE … ADD COLUMN IF NOT EXISTS — идемпотентны.
// Ошибка логируется, но не роняет старт.
// Порядок создания таблиц соблюдает FK-зависимости:
//   decks → words → user_card_state / review_log
//   users (уже существует до этого шага) → все остальные
async function ensureFlashcardSchema() {
  const dbUrl = process.env.DATABASE_URL;
  let ClientClass;
  try {
    const pg = await import("pg");
    // поддерживаем и ESM-default, и CJS-экспорт
    ClientClass = pg.default?.Client ?? pg.Client;
  } catch (e) {
    console.error("[prod] ensureFlashcardSchema: не удалось загрузить pg —", e.message);
    return;
  }

  // Render добавляет SSL-требование; отключаем проверку сертификата для внутреннего соединения
  const ssl = dbUrl.includes("render.com") ? { rejectUnauthorized: false } : undefined;
  const client = new ClientClass({ connectionString: dbUrl, ssl });

  try {
    await client.connect();

    // ── Колонки в основных таблицах ──────────────────────────────────────────

    // Список просмотренных вкладок онбординга (гайд «Снежа»)
    await client.query(
      "ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS onboarding_seen jsonb",
    );

    // ── Flashcard-таблицы (в порядке FK-зависимостей) ────────────────────────

    // 1. decks — не зависит от других flashcard-таблиц
    await client.query(`
      CREATE TABLE IF NOT EXISTS decks (
        id            serial      PRIMARY KEY,
        owner_id      integer     REFERENCES users(id) ON DELETE CASCADE,
        title         text        NOT NULL,
        theme         text,
        description   text,
        emoji         text,
        is_system     boolean     NOT NULL DEFAULT false,
        cefr_level    text,
        sort_order    integer     NOT NULL DEFAULT 0,
        created_at    timestamp   NOT NULL DEFAULT now()
      )
    `);

    // 2. words — зависит от decks
    await client.query(`
      CREATE TABLE IF NOT EXISTS words (
        id              serial    PRIMARY KEY,
        deck_id         integer   NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        english         text      NOT NULL,
        part_of_speech  text,
        translations_ru jsonb     NOT NULL,
        ipa             text,
        example_en      text,
        example_ru      text,
        cefr_level      text,
        audio_url       text,
        emoji           text,
        sort_order      integer   NOT NULL DEFAULT 0,
        created_at      timestamp NOT NULL DEFAULT now()
      )
    `);

    // 3. user_card_state — зависит от users + words
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_card_state (
        id             serial    PRIMARY KEY,
        user_id        integer   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        word_id        integer   NOT NULL REFERENCES words(id) ON DELETE CASCADE,
        memory_level   integer   NOT NULL DEFAULT 0,
        due_at         timestamp NOT NULL DEFAULT now(),
        introduced     boolean   NOT NULL DEFAULT false,
        times_seen     integer   NOT NULL DEFAULT 0,
        times_correct  integer   NOT NULL DEFAULT 0,
        lapses         integer   NOT NULL DEFAULT 0,
        last_result    text,
        created_at     timestamp NOT NULL DEFAULT now(),
        updated_at     timestamp NOT NULL DEFAULT now(),
        CONSTRAINT user_word_unique UNIQUE (user_id, word_id)
      )
    `);

    // 4. placement_results — зависит от users
    await client.query(`
      CREATE TABLE IF NOT EXISTS placement_results (
        id          serial    PRIMARY KEY,
        user_id     integer   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        score       integer   NOT NULL,
        total       integer   NOT NULL,
        cefr_level  text      NOT NULL,
        answers     jsonb,
        taken_at    timestamp NOT NULL DEFAULT now()
      )
    `);

    // 5. flashcard_settings — зависит от users
    await client.query(`
      CREATE TABLE IF NOT EXISTS flashcard_settings (
        user_id          integer   PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        daily_new_limit  integer   NOT NULL DEFAULT 12,
        daily_word_goal  integer   NOT NULL DEFAULT 10,
        placement_level  text,
        placement_done   boolean   NOT NULL DEFAULT false,
        updated_at       timestamp NOT NULL DEFAULT now()
      )
    `);

    // 6. review_log — зависит от users + words
    await client.query(`
      CREATE TABLE IF NOT EXISTS review_log (
        id                  serial    PRIMARY KEY,
        user_id             integer   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        word_id             integer   NOT NULL REFERENCES words(id) ON DELETE CASCADE,
        result              text      NOT NULL,
        memory_level_after  integer,
        reviewed_at         timestamp NOT NULL DEFAULT now()
      )
    `);

    // 7. deck_assignments — зависит от decks + users
    await client.query(`
      CREATE TABLE IF NOT EXISTS deck_assignments (
        id           serial    PRIMARY KEY,
        deck_id      integer   NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        student_id   integer   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assigned_by  integer   REFERENCES users(id) ON DELETE SET NULL,
        created_at   timestamp NOT NULL DEFAULT now(),
        CONSTRAINT deck_assignment_unique UNIQUE (deck_id, student_id)
      )
    `);

    // ── Недостающие колонки в уже существующих таблицах ──────────────────────

    await client.query(
      "ALTER TABLE IF EXISTS words ADD COLUMN IF NOT EXISTS emoji text",
    );
    await client.query(
      "ALTER TABLE IF EXISTS user_card_state ADD COLUMN IF NOT EXISTS lapses integer NOT NULL DEFAULT 0",
    );
    await client.query(
      "ALTER TABLE IF EXISTS flashcard_settings ADD COLUMN IF NOT EXISTS daily_word_goal integer NOT NULL DEFAULT 10",
    );

    console.log("[prod] ensureFlashcardSchema: таблицы и колонки готовы");
  } catch (e) {
    console.error("[prod] ensureFlashcardSchema: ошибка (старт продолжается):", e.message);
  } finally {
    try {
      await client.end();
    } catch {}
  }
}

// ---------- 1. DB schema + seed (idempotent, safe on every boot) ----------
const runDbSetup = (process.env.RUN_DB_SETUP ?? "true") !== "false";

if (runDbSetup) {
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

// Всегда проверяем схему — после push (если был), до сида
await ensureFlashcardSchema();

if (runDbSetup) {
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
