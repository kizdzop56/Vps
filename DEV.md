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

- Email verification is **not** required locally — the server auto-verifies all
  users on startup, and `pnpm seed` marks the test accounts verified.
- `RESEND_API_KEY` (email) and `OPENAI_API_KEY` (voice chat) are optional; leave
  them blank unless you want to test those specific features.
- The first `pnpm dev` may ask to install Expo web dependencies — accept it.
- Ports: API `8080`, Expo `22710`, proxy `5000` (see `scripts/preview-proxy.mjs`).

## Stop

`Ctrl+C` stops `pnpm dev`. Stop Postgres with `docker compose down`
(add `-v` to also wipe the database).

## Датасет флеш-карточек

Готовые (системные) колоды лежат в `scripts/src/data`:

| Файл | Что внутри |
| --- | --- |
| `types.ts` | типы `SeedWord` / `SeedDeck` |
| `levels.ts` | обзорные колоды уровня: «Топ слов и фраз A1…C2» и подборки фраз |
| `decks/<тематика>.ts` | тематика на каждом уровне: `food_a1`, `food_a2`, … `food_c2` |
| `flashcards-data.ts` | сборка всего в один `SEED_DECKS` |

Каждая из 11 тематик (еда, животные, транспорт, семья, дом, тело и здоровье,
работа, природа, технологии, путешествия, неправильные глаголы) представлена
шестью колодами — по одной на уровень CEFR, в среднем по 30 карточек.

Проверка датасета (без установки зависимостей):

```bash
pnpm validate:flashcards
```

### Откуда берутся данные

Файлы `decks/*.ts` собираются конвейером `scripts/tools/lexicon` и руками не
правятся. Каждое поле карточки берётся из внешнего источника, а карточка, у
которой хотя бы одного поля нет, просто не попадает в датасет:

| Поле | Источник |
| --- | --- |
| слово, тематика | тематические словари Oxford Learner's Dictionaries |
| уровень CEFR | метка Cambridge (English Vocabulary Profile), иначе списки Oxford 3000/5000 |
| транскрипция | Cambridge Dictionary (у словосочетаний — склейка транскрипций слов) |
| перевод | Cambridge English–Russian |
| пример и его перевод | готовые переводные пары из корпусов OPUS (Tatoeba, TED2020, News-Commentary, GlobalVoices) |
| формы неправильных глаголов | грамматический справочник Cambridge |

Полный прогон (скачивание кэшируется в `scripts/.cache/`, в git не попадает):

```bash
node scripts/tools/lexicon/1-fetch-topics.mjs      # тематические пулы слов
node scripts/tools/lexicon/2-verify-words.mjs      # сверка слов со словарём
node scripts/tools/lexicon/3-verify-phrases.mjs    # словосочетания и фразовые глаголы
node scripts/tools/lexicon/4-corpus-examples.mjs   # примеры с переводом из корпусов
node scripts/tools/lexicon/6-irregular-verbs.mjs   # неправильные глаголы
node scripts/tools/lexicon/5-build-decks.mjs       # сборка decks/*.ts
pnpm validate:flashcards
```
