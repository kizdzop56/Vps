# Local development & manual testing

> Looking for a public URL instead? See [DEPLOY.md](./DEPLOY.md) — one-blueprint
> deployment to Render (API + web + PostgreSQL).

Run the full app locally (API + Expo web + Postgres) so you can log in and click
through every feature as a **teacher** and as a **student**.

## Prerequisites

- Node.js 20+ and pnpm (`corepack enable pnpm`)
- Docker (for the local Postgres) — or your own Postgres 16

## First-time setup

```bash
cp .env.example .env          # 1) config (defaults work out of the box)
docker compose up -d          # 2) start Postgres
pnpm install                  # 3) install dependencies
pnpm db:push                  # 4) create the database schema
pnpm seed                     # 5) create test accounts (teacher + student)
```

## Run

```bash
pnpm dev                      # starts API + Expo web + preview proxy
```

Then open **http://localhost:5000**.

The proxy routes `/api/*` to the API server and everything else to the Expo web
dev server — the same setup used on Replit.

## Test accounts (created by `pnpm seed`)

| Role     | Username  | Password     |
| -------- | --------- | ------------ |
| Teacher  | `teacher` | `teacher123` |
| Student  | `student` | `student123` |

They are already linked (teacher ↔ student), so teacher features
(assignments, submissions, calendar, results) have data to work with.

## Testing both roles at once

Open the app twice in **separate sessions** so the two logins don't collide:

- Window 1 (normal): log in as `teacher`
- Window 2 (incognito / another browser): log in as `student`

## Notes

- Email verification is **not** required locally: `pnpm seed` marks the test
  accounts verified, and accounts without an email address (students created by
  a teacher) are auto-verified on startup. An account that registers WITH an
  email must enter the 6-digit code — without `RESEND_API_KEY` the code is only
  printed to the server log, so grab it from there.
- `RESEND_API_KEY` (email) and `OPENAI_API_KEY` (voice chat) are optional; leave
  them blank unless you want to test those specific features.
- The first `pnpm dev` may ask to install Expo web dependencies — accept it.
- Ports: API `8080`, Expo `22710`, proxy `5000` (see `scripts/preview-proxy.mjs`).

## Stop

`Ctrl+C` stops `pnpm dev`. Stop Postgres with `docker compose down`
(add `-v` to also wipe the database).
