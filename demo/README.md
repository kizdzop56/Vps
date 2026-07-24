# Демо-сборка (один HTML со встроенным mock-бэкендом)

Скрипты, которые упаковывают web-версию приложения в один самодостаточный
HTML-файл для предпросмотра: реальный фронтенд + эмуляция API в браузере
(mock-backend.js перехватывает fetch /api/* и хранит данные в localStorage).

## Как собрать

1. Собрать web-экспорт приложения:
   pnpm --filter @workspace/english-learning exec expo export --platform web --output-dir static-build/web
2. Скорректировать пути в build-assets.mjs / build-html.mjs (см. константы WEB/B и хэши бандлов).
3. node build-assets.mjs   # пережимает картинки в data-URI карту
4. node build-html.mjs     # собирает english-learning-demo.html

## Важно

- build-html.mjs содержит "хирургические" патчи минифицированного бандла
  (bundlePatches) — при пересборке expo-экспорта минифицированные имена
  меняются, скрипт упадёт с ошибкой "expected 1 match" — патчи нужно
  перепроверить по исходникам.
- test-mock.mjs — Node-тесты поведения mock-бэкенда (63 проверки).
- api-contract.md — выжимка точного контракта API из artifacts/api-server.
- Демо-аккаунты: teacher/teacher123, student/student123. Сброс: открыть с #reset.
