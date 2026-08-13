// Разбор ошибок Postgres по коду.
//
// Нужен там, где отсутствующая колонка — ожидаемое состояние (миграция ещё не
// доехала), а любая другая ошибка ожидаемой не является. Раньше такие места
// ловили всё подряд одним catch, и обрыв соединения выглядел для кода ровно
// как «колонки нет» — с последствиями вплоть до бесконечной выдачи награды.
//
// Коды: https://www.postgresql.org/docs/current/errcodes-appendix.html

/** undefined_column: в запросе указана колонка, которой нет в таблице. */
export const UNDEFINED_COLUMN = "42703";

/** undefined_table: таблицы нет. Тот же случай — схема отстала от кода. */
export const UNDEFINED_TABLE = "42P01";

function errorCode(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string") return code;
  // Драйвер иногда прячет исходную ошибку в cause (обёртки drizzle).
  const cause = (err as { cause?: unknown }).cause;
  return cause && cause !== err ? errorCode(cause) : null;
}

/** Ошибка про отсутствующую колонку или таблицу, а не про что-то ещё. */
export function isMissingSchemaError(err: unknown): boolean {
  const code = errorCode(err);
  return code === UNDEFINED_COLUMN || code === UNDEFINED_TABLE;
}
