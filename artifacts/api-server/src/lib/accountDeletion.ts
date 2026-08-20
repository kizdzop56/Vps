// ─────────────────────────────────────────────────────────────────────────────
// Удаление аккаунта вместе со всеми его данными.
//
// ЗАЧЕМ ЭТО ОБЯЗАТЕЛЬНО. App Store требует возможность удалить аккаунт ИЗ
// ПРИЛОЖЕНИЯ с июня 2022 года, Google Play — своим User Data policy. Кнопка
// «выйти из аккаунта» требование НЕ ЗАМЕНЯЕТ: выход не удаляет данные.
//
// ── ПОЧЕМУ НЕ СПИСОК ТАБЛИЦ ВРУЧНУЮ ────────────────────────────────────────
// Схема большая и растёт: задания, сдачи, время, карточки, грамматика,
// рейд, чаты, календарь, сценарии, уведомления, связи. Рукописный список таблиц
// гарантированно отстанет от схемы, и тогда удаление навсегда сломается об foreign
// key — причём в продакшене и у живого человека, который просит его удалить.
//
// Поэтому список берётся ИЗ САМОЙ БАЗЫ: спрашиваем information_schema, какие таблицы
// вообще ссылаются на users.id. Новая таблица попадает в удаление сама, без правки
// этого файла.
//
// Ссылки с ON DELETE CASCADE / SET NULL / SET DEFAULT трогать не нужно — их разберёт
// сам Postgres. Вручную чистим только те, где правило NO ACTION/RESTRICT: именно они
// и блокируют удаление (submissions, time_sessions, voice_chat_sessions и т.д.).
//
// ── ПОРЯДОК УДАЛЕНИЯ ────────────────────────────────────────────────────────
// Порядок заранее неизвестен: таблица может быть связана не только с users, но и с
// другой такой же таблицей. Поэтому делаем несколько проходов: не удалось сейчас —
// пробуем на следующем круге, когда мешающие строки уже ушли. Каждое удаление
// обёрнуто в SAVEPOINT: в Postgres любая ошибка внутри транзакции обрушивает ВСЮ
// транзакцию, и без savepoint первый же неудачный порядок убил бы всю операцию.
//
// Всё идёт ОДНОЙ транзакцией: половина удалённого аккаунта хуже, чем целый.
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from "@workspace/db";
import { logger } from "./logger";

/** Столбец, который ссылается на users.id. */
interface UserReference {
  table: string;
  column: string;
  /** Правило удаления: CASCADE, SET NULL, NO ACTION, RESTRICT… */
  rule: string;
}

/** Сколько кругов делаем, разбирая взаимные связи между таблицами. */
const MAX_PASSES = 6;

/** Имена из information_schema всё равно проверяем: в SQL они подставляются текстом. */
function safeIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/**
 * Все ссылки на users.id в текущей схеме.
 *
 * Запрос по pg_catalog, а не по information_schema.constraint_column_usage:
 * последнее врёт на составных ключах и требует прав владельца на таблицу.
 */
async function referencesToUsers(): Promise<UserReference[]> {
  const { rows } = await pool.query<{ table: string; column: string; rule: string }>(
    `select
       child.relname                as table,
       att.attname                  as column,
       case con.confdeltype
         when 'a' then 'NO ACTION'
         when 'r' then 'RESTRICT'
         when 'c' then 'CASCADE'
         when 'n' then 'SET NULL'
         when 'd' then 'SET DEFAULT'
         else 'NO ACTION'
       end                          as rule
     from pg_constraint con
     join pg_class  child  on child.oid  = con.conrelid
     join pg_class  parent on parent.oid = con.confrelid
     join pg_namespace ns  on ns.oid     = child.relnamespace
     join unnest(con.conkey) with ordinality as k(attnum, ord) on true
     join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
     where con.contype = 'f'
       and parent.relname = 'users'
       and ns.nspname = any (current_schemas(false))`,
  );
  return rows.filter((r) => safeIdentifier(r.table) && safeIdentifier(r.column));
}

export interface PurgeReport {
  /** Из каких таблиц строки удалены явно. */
  cleared: string[];
  /** Таблицы, которые не поддались даже после всех проходов. */
  stuck: string[];
}

/**
 * Удалить пользователя и всё, что на него ссылается.
 *
 * Бросает исключение, если удалить не удалось: маршрут обязан вернуть ошибку,
 * а не сообщить «готово» на неудавшемся удалении данных.
 */
export async function purgeUser(userId: number): Promise<PurgeReport> {
  const refs = await referencesToUsers();

  // Сами чистим только то, что иначе заблокирует удаление. CASCADE и SET NULL
  // база сделает сама, и лезть туда руками значит дублировать правила схемы.
  const manual = refs.filter((r) => r.rule === "NO ACTION" || r.rule === "RESTRICT");

  const client = await pool.connect();
  const cleared = new Set<string>();
  let pending = [...manual];

  try {
    await client.query("begin");

    for (let pass = 0; pass < MAX_PASSES && pending.length > 0; pass++) {
      const failed: UserReference[] = [];

      for (const ref of pending) {
        await client.query("savepoint purge_step");
        try {
          await client.query(
            `delete from "${ref.table}" where "${ref.column}" = $1`,
            [userId],
          );
          await client.query("release savepoint purge_step");
          cleared.add(ref.table);
        } catch (err) {
          // Помешала чужая связь — откатываем только шаг и пробуем позже.
          await client.query("rollback to savepoint purge_step");
          await client.query("release savepoint purge_step");
          failed.push(ref);
        }
      }

      // Ни одной подвижки за проход — дальше крутить бессмысленно.
      if (failed.length === pending.length) {
        pending = failed;
        break;
      }
      pending = failed;
    }

    // Сама строка пользователя. Здесь же сработают все CASCADE-связи.
    const deleted = await client.query(`delete from "users" where "id" = $1`, [userId]);
    if (deleted.rowCount === 0) throw new Error("Пользователь не найден");

    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    logger.error({ err, userId }, "Удаление аккаунта не удалось");
    throw err;
  } finally {
    client.release();
  }

  const report: PurgeReport = {
    cleared: [...cleared].sort(),
    stuck: pending.map((r) => r.table),
  };
  logger.info({ userId, ...report }, "Аккаунт удалён вместе с данными");
  return report;
}
