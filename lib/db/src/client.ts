// Пул соединений с Postgres, вынесенный в отдельный модуль.
//
// Отдельный файл нужен, чтобы не возникало циклического импорта: index.ts
// реэкспортирует schema-check.ts, а тому нужен пул. Импортируя пул отсюда, оба
// модуля остаются независимыми друг от друга.
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
