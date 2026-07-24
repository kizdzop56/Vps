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
- After the first successful deploy you can set `RUN_DB_SETUP=false` for faster
  boots (schema/seed are idempotent, so leaving it on is also fine).
