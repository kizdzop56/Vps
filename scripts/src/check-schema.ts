// Проверка того, что схема в реальной БД не отстала от кода.
//
// Зачем это нужно. Приложение сломалось так: в задеплоенной базе не было таблиц
// `deck_assignments` (появилась в коммите c93dec8) и `conversations` /
// `messages` (коммит 6915fd7), потому что схема на этой базе не применялась.
// Postgres отвечал `relation ... does not exist`, Express отдавал HTML-страницу
// 500, клиент делал res.json() и показывал «The string did not match the
// expected pattern.». Приложение при этом считалось запущенным: healthz отвечал
// 200, большинство экранов работало, а чат и список колод были сломаны молча.
//
// Скрипт завершается с кодом 1, если каких-то таблиц не хватает. Хостинг
// значения не имеет: работает локально, в docker-compose и на VPS.
//
// Использование:
//   pnpm db:check
import "./load-env";
import { checkSchema, pool } from "@workspace/db";

async function main(): Promise<void> {
  try {
    const { ok, expectedCount, missingTables } = await checkSchema();

    if (ok) {
      console.log(`  ✅  Схема БД актуальна: все ${expectedCount} таблиц на месте.`);
    } else {
      console.error(
        `  ❌  В базе не хватает таблиц (${missingTables.length} из ${expectedCount}): ${missingTables.join(", ")}`,
      );
      console.error("      Схема в БД отстала от кода — часть API будет отвечать 500.");
      console.error("      Применить схему: pnpm db:push && pnpm seed");
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("  ❌  Проверка схемы: не удалось обратиться к базе.");
    console.error(`      ${err instanceof Error ? err.message : String(err)}`);
    console.error("      Проверьте DATABASE_URL и доступность Postgres.");
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

void main();
