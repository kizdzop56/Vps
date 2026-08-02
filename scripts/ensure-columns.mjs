// ─────────────────────────────────────────────────────────────────────────────
// Страховка схемы БД перед стартом приложения.
//
// Зачем: на Render `drizzle-kit push` иногда выходит с кодом 0, но объекты в
// базе не появляются. Сервис поднимается, а разделы отвечают 500: «Слова»
// падает на words.emoji и отсутствующей таблице deck_assignments, онбординг —
// на users.onboarding_seen.
//
// Всё ниже аддитивно и идемпотентно (IF NOT EXISTS): повторный запуск ничего
// не делает, данные и прогресс учеников не трогаются.
// ─────────────────────────────────────────────────────────────────────────────
import pg from "pg";
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[cols] DATABASE_URL не задан — пропускаю проверку схемы");
  process.exit(0);
}
// Порядок важен: сначала таблицы, потом колонки к ним.
const statements = [
  `CREATE TABLE IF NOT EXISTS deck_assignments (
     id serial PRIMARY KEY,
     deck_id integer NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
     student_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     assigned_by integer REFERENCES users(id) ON DELETE SET NULL,
     created_at timestamp NOT NULL DEFAULT now(),
     CONSTRAINT deck_assignment_unique UNIQUE (deck_id, student_id)
   )`,
  `CREATE TABLE IF NOT EXISTS review_log (
     id serial PRIMARY KEY,
     user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     word_id integer NOT NULL REFERENCES words(id) ON DELETE CASCADE,
     result text NOT NULL,
     memory_level_after integer,
     reviewed_at timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS placement_results (
     id serial PRIMARY KEY,
     user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     score integer NOT NULL,
     total integer NOT NULL,
     cefr_level text NOT NULL,
     answers jsonb,
     taken_at timestamp NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS flashcard_settings (
     user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     daily_new_limit integer NOT NULL DEFAULT 12,
     daily_word_goal integer NOT NULL DEFAULT 10,
     placement_level text,
     placement_done boolean NOT NULL DEFAULT false,
     updated_at timestamp NOT NULL DEFAULT now()
   )`,
  `ALTER TABLE IF EXISTS words ADD COLUMN IF NOT EXISTS emoji text`,
  `ALTER TABLE IF EXISTS user_card_state ADD COLUMN IF NOT EXISTS lapses integer NOT NULL DEFAULT 0`,
  `ALTER TABLE IF EXISTS flashcard_settings ADD COLUMN IF NOT EXISTS daily_word_goal integer NOT NULL DEFAULT 10`,
  `ALTER TABLE IF EXISTS words ADD COLUMN IF NOT EXISTS audio_url text`,
  `ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS onboarding_seen jsonb`,
  // Скрытые системные колоды (misc_{level}): слова участвуют в сессии/марафоне,
  // но колода не показывается в списке колод на экране «Слова».
  `ALTER TABLE IF EXISTS decks ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false`,
];
const client = new pg.Client({
  connectionString: url,
  ...(/render\.com/.test(url) ? { ssl: { rejectUnauthorized: false } } : {}),
});
let failed = 0;
try {
  await client.connect();
  for (const sql of statements) {
    try {
      await client.query(sql);
    } catch (e) {
      failed++;
      console.error("[cols] не выполнено:", (e?.message ?? e), "|", sql.split("\n")[0]);
    }
  }
  console.log(
    failed === 0
      ? "[cols] схема проверена: всё на месте"
      : `[cols] схема проверена, инструкций с ошибкой: ${failed}`,
  );
} catch (e) {
  console.error("[cols] WARNING: не удалось подключиться к базе:", e?.message ?? e);
} finally {
  await client.end().catch(() => {});
}
