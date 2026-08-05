import app from "./app";
import { logger } from "./lib/logger";
import { db, usersTable, timeSessionsTable, submissionsTable, authTokensTable } from "@workspace/db";
import { sql, eq, and, or, isNull } from "drizzle-orm";
import { startOverdueWatcher } from "./lib/autoCloseOverdue";
import { ensureSchema } from "./lib/ensureSchema";

// One-time cleanup: earlier avatar uploads stored uncompressed base64 data
// URIs (up to several MB) directly in avatar_url. Any user row that still has
// one of these bloats every list response (students, leaderboard, etc.) and
// can break avatar loading entirely. New uploads are compressed client-side
// and capped at 500KB server-side, so simply clear any legacy oversized value
// (user can re-upload — the new upload path keeps it small automatically).
async function cleanupOversizedAvatars() {
  try {
    const result = await db
      .update(usersTable)
      .set({ avatarUrl: null })
      .where(sql`length(${usersTable.avatarUrl}) > 500000`)
      .returning({ id: usersTable.id });
    if (result.length > 0) {
      logger.warn({ userIds: result.map((r: { id: number }) => r.id) }, "Cleared oversized legacy avatar_url values");
    }
  } catch (err) {
    logger.error({ err }, "Failed to clean up oversized avatars");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// One-time fix: session #51 was an orphaned session that ran for ~5 days
// (7165 min) due to the old bug where sessions were never capped. The fix caps
// that session to 0 and resets the user's cached total to 180 min (3 hours).
// The condition matches only that exact row — once corrected the block is a no-op.
async function fixLizaOrphanedSession() {
  try {
    const [session] = await db
      .select({ id: timeSessionsTable.id, durationMinutes: timeSessionsTable.durationMinutes })
      .from(timeSessionsTable)
      .where(and(eq(timeSessionsTable.id, 51), eq(timeSessionsTable.durationMinutes, 7165)));
    if (session) {
      await db
        .update(timeSessionsTable)
        .set({ durationMinutes: 0 })
        .where(eq(timeSessionsTable.id, 51));
      await db
        .update(usersTable)
        .set({ totalTimeMinutes: 180 })
        .where(eq(usersTable.id, 6));
      logger.info("Applied one-time time correction for user Лиза (orphaned session #51 reset)");
    }
  } catch (err) {
    logger.error({ err }, "Failed to apply Liza time fix");
  }
}

// Аккаунты БЕЗ email — это легаси-пользователи и ученики, созданные учителем.
// Они никогда не проходили верификацию, а AuthContext на фронтенде разлогинивает
// пользователя при emailVerified='false'. Поэтому их помечаем подтверждёнными.
//
// ВАЖНО: раньше здесь обновлялись ВСЕ пользователи с emailVerified='false', без
// условия на email. Это ломало регистрацию по почте — тот, кто зарегистрировался
// с email, становился подтверждённым сам, при следующем старте сервера, так и не
// введя код из письма. Функция описана как «one-time fix», но выполняется на
// КАЖДОМ старте, а на бесплатном плане Render сервис засыпает после ~15 минут
// простоя, то есть холодные старты идут постоянно.
//
// Условие на пустую строку — на случай, если email где-то сохранился как '' ,
// а не NULL.
async function verifyUsersWithoutEmail() {
  try {
    const result = await db
      .update(usersTable)
      .set({ emailVerified: "true" })
      .where(
        and(
          eq(usersTable.emailVerified, "false"),
          or(isNull(usersTable.email), eq(usersTable.email, "")),
        ),
      )
      .returning({ id: usersTable.id, username: usersTable.username });
    if (result.length > 0) {
      logger.info(
        { users: result.map((u: { id: number; username: string }) => u.username) },
        "Set emailVerified=true for accounts without an email address",
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to verify users without email");
  }
}

// One-time cleanup: delete user Анна (id=12) and all her data.
// submissions.studentId has no CASCADE so must be deleted explicitly first;
// submission_answers cascade from submissions. assigned_tasks, teacher_students,
// friendships all have onDelete:cascade from users so they clean up automatically.
async function deleteAnnaUser() {
  try {
    const [anna] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, 12));
    if (!anna) return; // Already deleted — no-op on every subsequent restart
    await db.delete(authTokensTable).where(eq(authTokensTable.userId, 12));
    await db.delete(submissionsTable).where(eq(submissionsTable.studentId, 12));
    await db.delete(timeSessionsTable).where(eq(timeSessionsTable.studentId, 12));
    await db.delete(usersTable).where(eq(usersTable.id, 12));
    logger.info("Deleted user Анна (id=12) and all related data");
  } catch (err) {
    logger.error({ err }, "Failed to delete user Анна");
  }
}

/**
 * Старт сервера.
 *
 * ensureSchema() идёт ПЕРЕД app.listen и с await. Если убрать его в общую
 * фоновую цепочку чисток, первые запросы придут на ещё не починенную базу и
 * упадут — а на холодном старте Render это ровно те запросы, ради которых
 * сервис и проснулся. Стоит это один ALTER ... IF NOT EXISTS на колонку.
 */
async function start() {
  await ensureSchema();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");

    // Background cleanup — must not block startup
    cleanupOversizedAvatars()
      .then(() => fixLizaOrphanedSession())
      .then(() => deleteAnnaUser())
      .then(() => verifyUsersWithoutEmail())
      .catch((err) => logger.error({ err }, "Startup background cleanup failed"));

    // Сторож сроков сдачи: закрывает задания, которые ученик не сдал вовремя,
    // и отправляет их учителю как «не сдано в срок». Идемпотентно, поэтому
    // безопасно и при старте, и по таймеру. На бесплатном Render сервис засыпает
    // после простоя — при следующем пробуждении задача догонит все пропущенные
    // сроки за время сна.
    startOverdueWatcher();
  });
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
