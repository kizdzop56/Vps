# English Learning App

Полная копия кода проекта V1 с доработками:

- **dev-kit** — локальный запуск одной командой: docker-compose (Postgres), `pnpm dev`, сид тестовых аккаунтов (см. `DEV.md`)
- **деплой на Render** — `Dockerfile`, `render.yaml`, `scripts/prod-start.mjs` (см. `DEPLOY.md`)
- **демо-сборка** — упаковка web-версии в один HTML с mock-бэкендом в браузере (см. `demo/README.md`)

Тестовые аккаунты: `teacher` / `teacher123`, `student` / `student123`.

> Бинарные ассеты (картинки/шрифты и собранный api-server/dist) импортируются из V1 автоматически workflow'ом `import-binary-assets` при первом push.