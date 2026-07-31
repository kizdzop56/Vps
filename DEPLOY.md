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
- **File uploads (avatars, assignment photos/audio/video, student recordings)**
  need object storage. Without it they go to the container's ephemeral disk and
  **disappear on every redeploy** — Render's free plan has no persistent disk.
  The app now works with any S3-compatible provider; Cloudflare R2 gives 10 GB
  free with free egress. Set `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY` under **Environment**, add a CORS rule on the bucket,
  then verify from the Render Shell:
  `node scripts/storage-check.mjs --origin https://your-app.onrender.com`.
  Full walkthrough: [`deploy-vps/STORAGE.md`](./deploy-vps/STORAGE.md).
- **Email (Resend)** — needed for the sign-up confirmation code and password
  reset. Set `RESEND_API_KEY` in the Render dashboard (Environment), plus
  `APP_URL=https://your-app.onrender.com` so reset links resolve. The sender
  domain must be **verified** in Resend (Domains → Verify), otherwise every
  send fails with `domain is not verified` even with a valid key; override the
  sender with `EMAIL_FROM` if you use a different domain.
  Accounts **without** an email address (students created by a teacher) are
  auto-verified on boot; accounts that registered with an email must enter the
  code from the message.
- **Voice chat (OpenAI)** is optional: set `OPENAI_API_KEY` to enable it.
- **Automatic flashcard translations:** add `GOOGLE_TRANSLATE_API_KEY` in the
  Render dashboard under **Environment**. Create the key in a Google Cloud project
  with **Cloud Translation API** enabled, and restrict the key to that API. The
  application uses Google Cloud Translation Basic (v2) for English-to-Russian
  translations; without the key it uses a compatibility fallback, but the key is
  recommended for a reliable production deployment.
- `RUN_DB_SETUP=false` skips only the **seed** (the demo teacher/student/parent
  accounts). The schema push is separate and always runs — see below.

## Database schema on boot

`scripts/prod-start.mjs` runs two independent steps:

| Step | Controlled by | Default |
|---|---|---|
| `drizzle-kit push` (schema) | `RUN_DB_PUSH` | **always runs** |
| idempotent seed (demo accounts) | `RUN_DB_SETUP` | runs |

The push is idempotent: with no drift it takes a few seconds and changes nothing.
It is deliberately **not** tied to `RUN_DB_SETUP`, because that coupling caused a
silent production outage.

### What went wrong before

`RUN_DB_SETUP=false` was set for faster boots — as this file used to recommend —
and from then on the schema was never pushed again. The database fell several
commits behind: the `deck_assignments` and `messages` tables were missing, as were
the `words.emoji`, `user_card_state.lapses` and `flashcard_settings.daily_word_goal`
columns.

Drizzle lists every mapped column in its `SELECT`s, so one missing column or table
makes Postgres answer `column "..." does not exist` and the endpoint return `500`.
The result: students saw "Колоды не загрузились", teachers could not open the word
catalogue or add a word, and chat would not open — all with the unhelpful iOS
Safari message `The string did not match the expected pattern.`

### If you turn the push off anyway

`RUN_DB_PUSH=false` is an escape hatch for people who manage migrations
themselves. After **any** change under `lib/db/src/schema` you then have to push
by hand:

```bash
DATABASE_URL='postgres://…production…' pnpm db:push
```

### Safety net

Even with the push disabled or failing, the API server compares the database with
the drizzle schema on boot and adds columns that are safe to add to a populated
table — nullable ones, and `NOT NULL` ones with a simple default. See
`artifacts/api-server/src/lib/ensureSchema.ts`; added columns are logged as
`Schema guard: added missing columns`.

It intentionally does **not** create tables, change types, add `NOT NULL` columns
without a default, or manage indexes and foreign keys — that is `drizzle-kit push`'s
job. When the guard finds such drift it logs it loudly and tells you to push.
