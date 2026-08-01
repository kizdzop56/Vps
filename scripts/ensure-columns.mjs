// Гарантирует колонки раздела «Слова». Идемпотентно, данные не трогает.
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("[cols] DATABASE_URL is required"); process.exit(0); }

const client = new pg.Client({
  connectionString: url,
  ...(/render\.com/.test(url) ? { ssl: { rejectUnauthorized: false } } : {}),
});

try {
  await client.connect();
  await client.query(`ALTER TABLE IF EXISTS words ADD COLUMN IF NOT EXISTS emoji text`);
  await client.query(`ALTER TABLE IF EXISTS user_card_state ADD COLUMN IF NOT EXISTS lapses integer NOT NULL DEFAULT 0`);
  await client.query(`ALTER TABLE IF EXISTS flashcard_settings ADD COLUMN IF NOT EXISTS daily_word_goal integer NOT NULL DEFAULT 10`);
  console.log("[cols] flashcard columns verified");
} catch (e) {
  console.error("[cols] WARNING:", e?.message ?? e);
} finally {
  await client.end().catch(() => {});
}
