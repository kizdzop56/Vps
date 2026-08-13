// ─────────────────────────────────────────────────────────────────────────────
// Досрочное гашение выданных токенов.
//
// ── Зачем ───────────────────────────────────────────────────────────────────
// Токен доступа живёт 30 дней и проверяется только подписью: сервер не хранит
// список выданных токенов, поэтому «выйти на всех устройствах» технически не
// существовало. Из этого следовал неприятный сценарий: у человека угнали пароль,
// он сменил его через восстановление — и всё равно чужая сессия продолжала
// работать месяц.
//
// ── Как ─────────────────────────────────────────────────────────────────────
// У пользователя есть отметка «токены, выданные раньше этого момента, больше не
// действуют» (users.sessions_valid_from). В токене уже есть время выпуска (iat),
// сравнение одно. Список токенов хранить не нужно.
//
// ── Цена ────────────────────────────────────────────────────────────────────
// Проверка идёт на каждом запросе, поэтому значение кэшируется в памяти на
// CACHE_MS. Итого примерно один запрос в минуту на активного пользователя.
//
// Колонка читается СВОИМ запросом (db.execute), а не через схему drizzle,
// намеренно: drizzle перечисляет в SELECT все колонки схемы, и колонка, которая
// ещё не доехала до базы, уронила бы каждый запрос к users. Здесь же худшее
// последствие — отметка не читается, и досрочного гашения просто нет.
//
// Если колонки нет, повторные попытки прекращаются на MISSING_RETRY_MS, а не
// навсегда: «навсегда» уже однажды вышло дырой в награде за цель дня, где один
// сбой соединения выключал проверку до перезапуска процесса.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/** Насколько доверяем прочитанному значению. */
const CACHE_MS = 60_000;
/** Как долго не трогаем базу после ошибки «нет колонки». */
const MISSING_RETRY_MS = 5 * 60_000;

interface Entry {
  /** Секунды эпохи, 0 — гасить нечего. */
  epoch: number;
  readAt: number;
}

const cache = new Map<number, Entry>();
let unavailableUntil = 0;

function rowsOf(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  return (result as { rows?: any[] })?.rows ?? [];
}

/**
 * С какого момента токены пользователя считаются действительными.
 * Возвращает секунды эпохи; 0 — ограничения нет.
 */
export async function sessionsValidFrom(userId: number): Promise<number> {
  const now = Date.now();

  const cached = cache.get(userId);
  if (cached && now - cached.readAt < CACHE_MS) return cached.epoch;
  if (now < unavailableUntil) return cached?.epoch ?? 0;

  try {
    const result: any = await db.execute(
      sql`select extract(epoch from sessions_valid_from)::bigint as epoch from users where id = ${userId}`,
    );
    const raw = rowsOf(result)[0]?.epoch;
    const epoch = raw === null || raw === undefined ? 0 : Number(raw);
    const value = Number.isFinite(epoch) ? epoch : 0;
    cache.set(userId, { epoch: value, readAt: now });
    return value;
  } catch (err) {
    // Чаще всего это отсутствующая колонка на не обновлённой базе. Молчим
    // недолго и пробуем снова: сервер должен работать в любом случае.
    unavailableUntil = now + MISSING_RETRY_MS;
    logger.warn({ err }, "sessions_valid_from недоступна: досрочное гашение токенов отключено на 5 минут");
    return cached?.epoch ?? 0;
  }
}

/**
 * Погасить все ранее выданные токены пользователя.
 *
 * Отметка ставится на СЕКУНДУ ВПЕРЁД. Причина приземлённая: iat в токене — целые
 * секунды, и токен, выпущенный в той же секунде, что и сброс пароля, иначе
 * оказался бы «выпущен не раньше» отметки и выжил. Секунда вперёд гасит и его.
 */
export async function revokeSessions(userId: number): Promise<void> {
  try {
    await db.execute(
      sql`update users set sessions_valid_from = now() + interval '1 second' where id = ${userId}`,
    );
    cache.delete(userId);
  } catch (err) {
    logger.error({ err, userId }, "Не удалось погасить прежние токены пользователя");
  }
}

/** Токен выпущен до момента гашения? */
export function issuedBeforeRevocation(issuedAtSeconds: number | undefined, epoch: number): boolean {
  if (epoch <= 0) return false;
  if (!issuedAtSeconds || !Number.isFinite(issuedAtSeconds)) return true;
  return issuedAtSeconds < epoch;
}
