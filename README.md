# English Learning App

Полная копия кода проекта V1 с доработками:

- **dev-kit** — локальный запуск одной командой: docker-compose (Postgres), `pnpm dev`, сид тестовых аккаунтов (см. `DEV.md`)
- **деплой на Render** — `Dockerfile`, `render.yaml`, `scripts/prod-start.mjs` (см. `DEPLOY.md`)
- **демо-сборка** — упаковка web-версии в один HTML с mock-бэкендом в браузере (см. `demo/README.md`)
- **хранилище файлов** — аватары и медиа заданий хранятся в любом S3-совместимом
  хранилище (Cloudflare R2, Backblaze B2, MinIO). Настройка и диагностика:
  `deploy-vps/STORAGE.md`, проверка — `pnpm storage:check`
- **раздел «Слова»** — тренажёр с пятью видами упражнений, интервальное
  повторение, очки за слова и цель дня в словах (см. `WORDS.md`; после деплоя
  нужен `pnpm db:push`), проверка датасета — `pnpm validate:flashcards`

Тестовые аккаунты: `teacher` / `teacher123`, `student` / `student123`.

> Бинарные ассеты (картинки/шрифты и собранный api-server/dist) импортируются из V1 автоматически workflow'ом `import-binary-assets` при первом push.