# Deploying to Render (cloud preview / staging)

One-click-ish deployment of the full stack (API + web frontend + PostgreSQL)
using the [Blueprint](https://render.com/docs/infrastructure-as-code) in
`render.yaml`. You get a permanent public URL like `https://v1-app.onrender.com`
where you can log in and test everything from any device.

## Architecture (mirrors the Replit setup)

```
https://v1-app.onrender.com          Docker container on Render
        │                            ┌──────────────────────────────┐
        ▼                            │ proxy on $PORT               │
   [Render router] ────────────────▶ │   /api/* → API server :8080  │──▶ Render PostgreSQL
                                     │   /*     → static web :22710 │
                                     └──────────────────────────────┘
```

- The web frontend is a static **Expo web export** served by
  `artifacts/english-learning/server/serve.js`.
- The API is the esbuild bundle of `artifacts/api-server`.
- `scripts/prod-start.mjs` pushes the DB schema and runs the **idempotent seed**
  on boot (`RUN_DB_SETUP=true`), then starts all three processes.

## Steps

1. **Push this repo to GitHub** (with these files: `Dockerfile`, `.dockerignore`,
   `render.yaml`, `scripts/prod-start.mjs`).
2. Sign up / log in at [render.com](https://render.com) (GitHub login is easiest).
3. Click **New → Blueprint**.
4. **Connect your GitHub account** and select the repository (`V1`), branch `main`
   (or your feature branch).
5. Render reads `render.yaml` and shows the plan: web service `v1-app` +
   database `v1-db`. Click **Apply / Deploy Blueprint**.
6. Wait for the first build (~10–15 min: Docker build + Expo export).
7. Open `https://v1-app.onrender.com` (exact URL shown on the service page).

## Test accounts (seeded automatically on boot)

| Role    | Username  | Password     |
| ------- | --------- | ------------ |
| Teacher | `teacher` | `teacher123` |
| Student | `student` | `student123` |

Log in as teacher in one browser window and student in an incognito window.

## Limitations / notes

- **Free web service** sleeps after ~15 min idle; the first request after that
  takes up to a minute (cold start).
- **Free PostgreSQL expires after 30 days** — upgrade the DB plan to keep data.
- **File uploads (avatars)** are stored on the container's ephemeral disk and
  disappear on redeploy/restart. The Replit deployment used Replit Object
  Storage (`/api/storage` routes) — that feature requires an S3-compatible
  replacement outside Replit.
- **Email (Resend) and voice chat (OpenAI)** are optional: set `RESEND_API_KEY`
  / `OPENAI_API_KEY` in the Render dashboard (Environment) to enable them.
  Login works without email verification (the server auto-verifies users).
- **Automatic flashcard translations:** add `GOOGLE_TRANSLATE_API_KEY` in the
  Render dashboard under **Environment**. Create the key in a Google Cloud project
  with **Cloud Translation API** enabled, and restrict the key to that API. The
  application uses Google Cloud Translation Basic (v2) for English-to-Russian
  translations; without the key it uses a compatibility fallback, but the key is
  recommended for a reliable production deployment.
- After the first successful deploy you can set `RUN_DB_SETUP=false` for faster
  boots (schema/seed are idempotent, so leaving it on is also fine). **Но учтите:**
  при `RUN_DB_SETUP=false` схема больше не применяется, поэтому любой следующий
  коммит, добавляющий таблицу, оставит базу позади кода. См. раздел ниже.

## Troubleshooting: схема БД отстала от кода

Симптом: приложение стартует, `/api/healthz` отвечает 200, большинство экранов
работает — но отдельные разделы пустые или падают. В браузере это выглядело как
«The string did not match the expected pattern.» (так Safari сообщает, что
`res.json()` получил HTML-страницу ошибки Express) и как пустой раздел «Колоды
по уровням».

Причина: в базе не было таблиц, добавленных более поздними коммитами
(`deck_assignments`, `conversations`, `messages`), потому что схема на неё не
применялась. Postgres отвечал `relation ... does not exist` → 500.

Диагностика и лечение (работает на любом хостинге — Render, VPS, docker-compose):

```bash
# что именно не хватает в базе
pnpm db:check

# применить схему и досеять системные колоды (обе операции идемпотентны)
pnpm db:push && pnpm seed
```

То же самое видно из браузера, без доступа к серверу:

```
GET /api/healthz/db
→ { "status": "schema-drift", "missingTables": ["conversations", "messages"] }
```

Начиная с этой версии `scripts/prod-start.mjs` сверяет схему при **каждом**
старте, независимо от `RUN_DB_SETUP`, и при расхождении сам применяет её и
запускает сид. Если после этого таблиц всё ещё не хватает, процесс завершается с
ошибкой, а не поднимает наполовину рабочее приложение. Чтобы всё-таки
стартовать, задайте `ALLOW_SCHEMA_DRIFT=true`.
