# V2 → VPS миграция: полный план

Анализ репозитория показал, что проект **уже частично готов** к не-Replit хостингу
(есть `Dockerfile`, `scripts/prod-start.mjs` с in-process reverse proxy и graceful
shutdown). Ниже — что реально нужно менять, что из твоего списка было неточным, и
скрытые нюансы, которых в списке не было.

Все конфиги лежат рядом: `Caddyfile`, `v2.service`, `docker-compose.prod.yml`,
`.env.production.example`, `backup-postgres.sh`.

---

## 0. Главное открытие: в проекте НЕТ Google OAuth

В коде `auth.ts` — **только JWT (Bearer token)**, без сессий, cookies и Google.
Авторизация: `Authorization: Bearer <jwt>`, секрет = `SESSION_SECRET`, срок 30 дней.

→ **Пункт 3 про Google OAuth и authorized redirect URIs отпадает.** Добавлять
редирект-домен в Google Cloud Console не нужно.

Что есть от Google — **`@google-cloud/storage`** для аватаров/объектов в
`objectStorage.ts`. Но сейчас он завязан на **Replit Object Storage sidecar**
(`http://127.0.0.1:1106/token`). Это и есть реальная GCS-зависимость — см. пункт 3.

---

## 1. Replit-зависимости (пункт 1) — почти не влияют на прод

- **`@replit/vite-plugin-*`** сидят **только** в `artifacts/mockup-sandbox/`
  (отдельный dev-пакет для макетов). В основной билд (`api-server` + Expo export)
  они **не входят** → на прод-сборку не влияют. Можно не трогать.
- **`preview-proxy.mjs`** — только dev. В проде используется
  `scripts/prod-start.mjs`, который сам раздаёт фронт через Express + свой
  in-process reverse proxy на `$PORT`. Запускать preview-proxy на VPS не нужно.
- **`REPLIT_*` / `REPL_ID`** env — действительно не будут на VPS. Их реально
  использует только `email.ts` (fallback `APP_URL` из `REPLIT_DEV_DOMAIN`) —
  поэтому **обязательно задай `APP_URL`** в `.env` (я добавил в шаблон).
- **`PORT`** — Render даёт `10000`, на VPS задай `3000` (шаблон так и сделан).
  Caddy проксирует на `127.0.0.1:3000`.

⚠️ **Нюанс:** `@replit/*` перечислены в `pnpm-workspace.yaml` (catalog + в
`minimumReleaseAgeExclude`). При `pnpm install --frozen-lockfile` на VPS они
будут скачиваться, но т.к. mockup-sandbox не билдится — это просто лишние пакеты,
не ошибка.

---

## 2. OpenAI (пункт 2) — уже готов к VPS

`voiceChat.ts` уже умеет брать ключ из обычного **`OPENAI_API_KEY`**
(фолбэк на `AI_INTEGRATIONS_OPENAI_API_KEY`). Replit AI Integrations не нужна.

→ Положи свой OpenAI-ключ в `OPENAI_API_KEY`. Опционально — `OPENAI_API_BASE`
для прокси. Оба в шаблоне `.env`. Ключ НЕ в коде, только в `.env` (chmod 600).

---

## 3. Объектное хранилище (пункт 3) — ЕСТЬ правка кода

> **АКТУАЛЬНО:** хранилище переведено с Google Cloud Storage на **любое
> S3-совместимое** (Cloudflare R2, Backblaze B2, MinIO, Supabase Storage).
> Платный аккаунт Google больше не нужен. Пошаговая настройка с бесплатными
> вариантами и обязательным правилом CORS: **[STORAGE.md](./STORAGE.md)**.
> Проверка настройки: `node scripts/storage-check.mjs --origin https://домен`.
>
> Нужны переменные `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
> `S3_SECRET_ACCESS_KEY` (+ необязательные `S3_REGION`, `S3_FORCE_PATH_STYLE`,
> `S3_PREFIX`). Переменные `GOOGLE_APPLICATION_CREDENTIALS`, `GCS_PROJECT_ID`,
> `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR` больше не используются.
>
> Раздел ниже описывает промежуточный этап миграции (Replit -> GCS) и оставлен
> как история решения.

### История: этап Replit -> GCS

Это главная реальная зависимость. `objectStorage.ts` конструирует GCS-клиент с
`external_account` кредами от Replit sidecar (`127.0.0.1:1106/token` и
`/credential`) и подписывает URL через sidecar-эндпоинт
`/object-storage/signed-object-url`. На VPS это **упадёт сразу**.

**Я уже внёс правку в `artifacts/api-server/src/lib/objectStorage.ts`:**
- Конструктор `Storage` теперь берёт `GCS_PROJECT_ID` и автоматически читает
  `GOOGLE_APPLICATION_CREDENTIALS` (стандартный путь GCS).
- `signObjectURL` использует нативную **GCS V4 signed URL** вместо sidecar.
- Добавлен warn, если креды не заданы.

**Что нужно сделать на VPS:**
1. Создать GCS-бакет + service account с ролью **Storage Object Admin**
   (и *Service Account Token Creator* для подписи URL).
2. Скачать JSON-ключ → `/opt/v2/secrets/gcs-service-account.json` (chmod 600).
3. Задать `GOOGLE_APPLICATION_CREDENTIALS`, `GCS_PROJECT_ID`,
   `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR` в `.env`
   (значения есть в шаблоне с примерами).

⚠️ Строку-путь `storage.googleapis.com` в `normalizeObjectEntityPath` менять не
нужно — это стандартный домен GCS, нативные signed URL возвращают именно его.

---

## 4. PostgreSQL (пункт 4) — OK, но нюанс по миграциям

`docker-compose.prod.yml` (приложен) поднимает Postgres 16, привязан к
`127.0.0.1:5432` (не наружу), с memory-tuning под 4 ГБ VPS и healthcheck.

⚠️ **Скрытый нюанс, важнее остальных:** в проекте **НЕТ папки миграций**.
`prod-start.mjs` на каждом буте запускает `drizzle-kit push --force` — это
**schema-push без версионирования**. На проде это рискованно:
- `push --force` может **молча изменить/дропнуть колонки** при правке схемы.
- Нет отката, нет истории миграций, нет ревью изменений БД.

**Рекомендация:** перейти на версионные миграции:
```bash
pnpm --filter @workspace/db exec drizzle-kit generate   # создаёт миграции из diff схемы
pnpm --filter @workspace/db exec drizzle-kit migrate    # применяет по порядку
```
Замени `push-force` в `prod-start.mjs` на `migrate`, а `db:push` оставь только
для локального дева. На первом деплое `push` допустим — но запланируй переход.

**Бэкапы:** `backup-postgres.sh` — `pg_dump` из контейнера, gzip, retention 14
дней, заготовка под offsite-копию в GCS/S3. Ставь в cron: `0 3 * * *`.

---

## 5. Сборка на сервере (пункт 5) — 4 ГБ RAM хватит, но осторожно

`Dockerfile` уже билдит на сервере: esbuild-bundle API + `expo export --platform
web`. Expo-web + typecheck — самый тяжёлый этап.

- **4 ГБ RAM** — достаточно для разового билда (проверено: esbuild лёгкий, Expo
  export тяжёлый но кратковременный). Закрывает `MemoryMax=3G` в systemd.
- Альтернатива — GitHub Actions: билдить dist/ в CI, деплоить артефакт.
  Папка `.github/workflows/import-assets.yml` уже есть — можно добавить
  `deploy.yml`. Это сложнее, но дешевле по RAM и чище для VPS с 2 ГБ.

**Решение для старта:** билд на VPS (проще). Когда VPS станет узким — переезжай
на CI-билд.

---

## 6. Процесс-менеджмент (пункт 6) — `v2.service` готов

`prod-start.mjs` уже ловит `SIGTERM`/`SIGINT` и корректно гасит дочерние процессы
(api + web + proxy). systemd-unit `v2.service` (приложен) ставит это на рельсы:
`Restart=on-failure`, hardening (`ProtectSystem=strict`, `NoNewPrivileges`,
`PrivateTmp`), `MemoryMax=3G`, логи в journald.

«Запустил в ssh и закрыл терминал» — действительно не вариант; systemd решает.

---

## 7. Reverse proxy + HTTPS (пunkt 7) — Caddy готов

`Caddyfile` (приложен): Caddy проксирует на `127.0.0.1:3000`, сам тянет Let's
Encrypt, добавляет HSTS/Referrer-Policy/X-Content-Type-Options, gzip+zstd,
`flush_interval -1` для стриминга (voice chat/audio). Express наружу НЕ смотрит.

---

## 8. Безопасность (punkt 8) — + критичное: токен в git-истории

- `ADMIN_CLEANUP_TOKEN = "evijswihv2627y9otobguo"` лежит в `.replit`
  (`[userenv.production]`). **Но в коде он нигде не используется** — это был
  Replit-артефакт. Опасность не в работе приложения, а в том, что **он в
  git-истории**. Смени значение (шаблон `.env` уже помечен `CHANGE_ME`) и
  считай старый скомпрометированным. Если токен где-то реальной защищал ресурс —
  ротируй там немедленно.
- `v2.service`: SSH по ключу, отключить root-пароль, fail2ban + ufw (22/80/443) —
  это host-hardening, делается на VPS вручную (стандартный гайд DigitalOcean).
- `.gitignore` уже содержит `.env`/`.env.*` (проверено) — коммит безопасен.
- `.env` на VPS — chmod 600, юзер `v2`, не в git.

---

## Сохранятся ли данные при деплое? (главное)

**Да, без потерь — при условии настройки GCS.** Разбор по типам данных:

| Данные | Хранилище | Сохранится? |
|---|---|---|
| Профили, задания, сабмишены, баллы, связи, календарь, voice-история | **PostgreSQL** (Drizzle) | ✅ Всегда (volume + бэкапы) |
| Аватары (фото), фото к заданиям, аудио, видео, записи учеников | **S3-совместимое хранилище** | ✅ Да, если оно настроено (см. [STORAGE.md](./STORAGE.md)) |

**Что было сделано, чтобы медиа не терялись:**
1. `objectStorage.ts` — Replit sidecar заменён на нативный GCS (`GOOGLE_APPLICATION_CREDENTIALS` + V4 signed URL).
2. **Все фронтенд-загрузки** переведены на GCS presigned-URL паттерн (фото, аудио, видео, записи).
3. **Аватары больше не хранятся как base64 в `users.avatarUrl`** — теперь это serve-URL на GCS-объект. Это убирает раздутие БД (и one-time cleanup в `index.ts` больше не нужен).
4. Multer-роут `/api/upload/*` оставлен как dev-fallback; прод его не вызывает.

**Условие «без потерь»:**
- PostgreSQL: `DATABASE_URL` + persistent volume (`v2-pgdata`) + `backup-postgres.sh` по cron.
- Хранилище: `S3_ENDPOINT` + `S3_BUCKET` + `S3_ACCESS_KEY_ID` + `S3_SECRET_ACCESS_KEY` в `.env` (см. `env.production.example`) **и правило CORS на бакете**.
- Без хранилища приложение не падает: файлы уходят на локальный диск контейнера. Профили/задания/баллы сохранятся всегда, но медиа **исчезнет при следующем деплое** (на Render persistent disk нет). Поэтому в проде хранилище обязательно.

---

## Полнота функционала на VPS (по модулям)

Разобран весь backend (`auth`, `users`, `assignments`, `submissions`,
`voiceChat`, `timeTracking`, `leaderboard`, `upload`, `storage`, `connections`,
`calendar`, `gamification`, `health`) — Replit-специфики за пределами
описанного выше (GCS, env-переменные) в них нет.

| Модуль | Работает на VPS? | Условие |
|---|---|---|
| Регистрация/логин (JWT, без cookies) | ✅ | `SESSION_SECRET` |
| Email-верификация | ✅ (или авто-верификация без ключа) | `RESEND_API_KEY` опционален |
| Задания / сабмишены / вопросы | ✅ | Postgres |
| Аватары / фото / аудио / видео / записи | ✅ | **нужно S3-совместимое хранилище** |
| Voice chat (OpenAI, обычный REST, не WebSocket) | ✅ | `OPENAI_API_KEY` |
| Геймификация / баллы / лидерборд | ✅ | Postgres |
| Календарь / тайм-трекинг | ✅ | Postgres |
| Connections (учитель↔ученик, друзья) | ✅ | Postgres |
| Healthcheck (`GET /api/healthz`) | ✅ уже есть | подключить к мониторингу |

Единственный блок, который требует доп. настройки — **долговременное хранение**
медиа (аватары, фото, аудио, видео). Загрузка работает и без него (локальный
диск), но файлы не переживают деплой. Все остальные фичи не имеют
Replit-зависимостей и работают сразу после настройки Postgres + `SESSION_SECRET`.

---

## Скрытые нюансы, которых НЕ было в твоём списке

1. **Object Storage жёстче, чем «создать бакет».** Нужна была **правка кода**
   (сделана), потому что аутентификация и подпись URL шли через Replit sidecar.
   Плюс два неочевидных момента, которых нет ни в одном чек-листе:
   **(а)** браузер грузит файл напрямую в бакет, поэтому на бакете обязательно
   нужно правило **CORS** — без него загрузка падает при верных ключах;
   **(б)** бакет должен остаться **приватным**: файлы отдаёт наш прокси-роут.

2. ~~**Нет healthcheck-эндпоинта.**~~ **УТОЧНЕНИЕ:** он есть —
   `GET /api/healthz` (в `routes/health.ts`), просто не был подключён
   к внешнему мониторингу. Используй его в Caddy/uptime-мониторе/cron.
   systemd `Type=simple` сам по себе знает только «жив ли процесс», не
   «отвечает ли» — навесь `curl -f http://127.0.0.1:3000/api/healthz` в cron
   или внешний uptime-чекер поверх домена.

3. ~~**Загрузка аватаров идёт ДВУМЯ путями.**~~ **РЕШЕНО:** все загрузки
   переведены на GCS. Multer/`routes/upload.ts` оставлен только как dev-fallback.

4. **Email fallback на `REPLIT_DEV_DOMAIN`.** Без `APP_URL` письма будут
   содержать ссылку `https://undefined`. Обязательно задай `APP_URL`.

5. **`push --force` на каждом буте** — см. пункт 4. Главная прод-риск-точка.

6. **`minimumReleaseAge: 1440`** в `pnpm-workspace.yaml` — пакеты младше суток
   не ставятся. На VPS с фиксированным `--frozen-lockfile` это не мешает, но если
   будешь добавлять пакеты — учти 24-часовой фильтр.

7. **`@replit/*` в `minimumReleaseAgeExclude`** — обход возрастного фильтра для
   Replit-пакетов. На VPS неактуально, но объясняет, почему `pnpm install` может
   тянуть `@replit/*` даже если они не нужны прод-билду.

8. **Логи:** структурированный лог уже есть (`pino` + `pino-http` в `app.ts`),
   выводится в journald через systemd. Не требует доработки.

9. **CORS/cookies:**.cookies в auth не используются (только Bearer), так что
   SameSite/cookie-domain/redirect-mismatch проблем нет — ещё одно упрощение
   против твоего списка.

10. **Frontend env build-time:** `EXPO_PUBLIC_DOMAIN` намеренно НЕ задаётся
    (фронт ходит на относительный `/api`). Не задавай его на VPS — иначе URL
    вшьётся в bundle и сломает перенос домена. Шаблон это отмечает.

---

## Порядок действий на VPS (чек-лист)

```bash
# 0. Подготовка VPS
sudo apt update && sudo apt install -y docker.io caddy git ufw fail2ban
sudo ufw allow 22,80,443/tcp && sudo ufw enable
sudo adduser --system --group v2

# 1. Клон + deps + билд
sudo -u v2 git clone https://github.com/kizdzop56/V2 /opt/v2/app
cd /opt/v2/app
corepack enable && corepack prepare pnpm@9.15.4 --activate
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/english-learning exec expo export --platform web --output-dir static-build/web

# 2. Postgres
cp deploy-vps/docker-compose.prod.yml /opt/v2/
cp deploy-vps/env.production.example /opt/v2/app/.env
# отредактируй /opt/v2/app/.env (DATABASE_URL, SESSION_SECRET, APP_URL,
#   S3_*, OPENAI_API_KEY)
sudo chown v2:v2 /opt/v2/app/.env && sudo chmod 600 /opt/v2/app/.env
POSTGRES_PASSWORD=... docker compose -f /opt/v2/docker-compose.prod.yml up -d

# 2b. Объектное хранилище (нужно, чтобы медиа не терялось при деплое)
# Полная пошаговая инструкция: deploy-vps/STORAGE.md
# - создать приватный бакет (Cloudflare R2 — 10 ГБ бесплатно, egress бесплатный)
# - создать ключ с правами Object Read & Write только на этот бакет
# - настроить CORS на бакете (обязательно, иначе загрузка из браузера упадёт)
# - в .env задать: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID,
#   S3_SECRET_ACCESS_KEY, S3_REGION, S3_FORCE_PATH_STYLE, S3_PREFIX
node scripts/storage-check.mjs --origin https://ваш-домен   # проверка настройки

# 3. Service + Caddy
sudo cp deploy-vps/v2.service /etc/systemd/system/
sudo cp deploy-vps/Caddyfile /etc/caddy/   # отредактируй домен
sudo systemctl daemon-reload
sudo systemctl enable --now caddy v2
sudo systemctl reload caddy

# 4. Backups cron
sudo cp deploy-vps/backup-postgres.sh /opt/v2/app/deploy-vps/
( sudo crontab -l; echo "0 3 * * * /opt/v2/app/deploy-vps/backup-postgres.sh >> /var/log/v2/backup.log 2>&1" ) | sudo crontab -

# 5. Проверка
curl -sf http://127.0.0.1:3000/api/healthz && echo "API OK"
node scripts/storage-check.mjs --origin https://ваш-домен
journalctl -u v2 -f
```

---

## Файлы в этой папке

| Файл | Назначение |
|---|---|
| `env.production.example` | Шаблон env со всеми переменными и комментариями |
| `STORAGE.md` | Настройка объектного хранилища: R2 / B2 / MinIO, CORS, диагностика |
| `Caddyfile` | Reverse proxy + авто-HTTPS + security headers |
| `v2.service` | systemd unit с graceful shutdown + hardening |
| `docker-compose.prod.yml` | Postgres 16, localhost-only, tuned под 4 ГБ |
| `backup-postgres.sh` | Ежедневный pg_dump + retention 14 дней |
| `README.md` | Этот файл |

## Код-правка (вне этой папки)

- `artifacts/api-server/src/lib/s3Client.ts` (новый) — подпись AWS SigV4 на
  встроенном `crypto`, без новых зависимостей. Тест на официальных векторах
  AWS: `s3Client.test.ts`.
- `artifacts/api-server/src/lib/objectStorage.ts`, `objectAcl.ts`,
  `routes/storage.ts` — Replit sidecar → GCS → **любое S3-совместимое
  хранилище**. Заодно исправлены: жёстко зашитый `image/jpeg` в локальном
  режиме и абсолютная ссылка загрузки, собранная из заголовка `Host`.
- `artifacts/english-learning/app/(main)/profile.tsx` — аватар переведён с
  multer на общий presigned-поток (на Render он исчезал при каждом деплое).
- `scripts/storage-check.mjs` (новый) — диагностика хранилища.

Подробности и причины каждой правки — в разделе «Что было изменено в коде»
в [STORAGE.md](./STORAGE.md). **Обязательно проверь typecheck/билд после pull.**
