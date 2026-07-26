/**
 * Разовая чистка данных после фикса учёта учебного времени.
 *
 * Зачем: сам подсчёт уже исправлен (см. ../lib/timeStats.ts), но в БД остались
 * строки, созданные СТАРЫМ кодом. Раньше брошенная сессия (закрыли вкладку,
 * beforeunload не сработал) закрывалась только при следующем входе и получала
 * ВСЁ время отсутствия — до 240 минут. Пока такие строки лежат в time_sessions,
 * профиль честно показывает фантомные часы («зашёл — уже 1 ч 29 мин»), а вместе
 * с ними висят награды, которые ученик не заслужил.
 *
 * Что делает скрипт:
 *   1. Находит фантомные сессии. Признак: сессия закрыта ровно в тот момент,
 *      когда началась следующая, длилась дольше допустимой паузы, и ей засчитано
 *      всё календарное время (heartbeat тогда ещё не писался). Таким сессиям
 *      проставляется время в пределах допуска heartbeat.
 *   2. Пересчитывает users.totalTimeMinutes по исправленным сессиям.
 *   3. Снимает награды за время (time_*) и «Жаворонка» (early_*), если условие
 *      больше не выполняется. Остальные награды НЕ трогает: очки, стрик и
 *      задания посчитаны честно, и отбирать их нельзя.
 *
 * По умолчанию скрипт ничего не пишет — только отчёт. Запуск из корня репозитория:
 *   pnpm exec tsx artifacts/api-server/src/maintenance/fixLegacyStudyTime.ts
 *   pnpm exec tsx artifacts/api-server/src/maintenance/fixLegacyStudyTime.ts --apply
 *
 * Опции:
 *   --apply           записать изменения (без него — сухой прогон)
 *   --user=<id>       обработать только одного пользователя
 *   --before=<ISO>    считать «старыми» сессии, закрытые до этого момента
 *                     (по умолчанию — момент запуска; укажите время деплоя
 *                     фикса, если запускаете скрипт сильно позже)
 */
import { eq, inArray } from "drizzle-orm";
import {
  closedSessionMinutes,
  countEarlyBirdDays,
  APP_TIMEZONE,
  HEARTBEAT_GRACE_MINUTES,
  STALE_SESSION_GAP_MINUTES,
  type SessionLike,
} from "../lib/timeStats";

// @workspace/db бросает исключение прямо при импорте, если нет DATABASE_URL,
// поэтому сначала подтягиваем .env и только потом импортируем БД.
function loadEnv(): void {
  if (process.env["DATABASE_URL"]) return;
  for (const file of [".env", ".env.local", "../../.env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // файла нет — это нормально, пробуем следующий
    }
    if (process.env["DATABASE_URL"]) return;
  }
}

loadEnv();

const { db, pool, usersTable, userAchievementsTable, timeSessionsTable } = await import("@workspace/db");

// ── Аргументы ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const apply = args.includes("--apply");

function optionValue(name: string): string | null {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

const onlyUserRaw = optionValue("user");
const onlyUserId = onlyUserRaw === null ? null : Number(onlyUserRaw);
if (onlyUserId !== null && !Number.isInteger(onlyUserId)) {
  console.error(`❌ --user должен быть числом, получено: ${onlyUserRaw}`);
  process.exit(1);
}

const beforeRaw = optionValue("before");
const legacyBefore = beforeRaw === null ? new Date() : new Date(beforeRaw);
if (Number.isNaN(legacyBefore.getTime())) {
  console.error(`❌ --before должен быть датой в формате ISO, получено: ${beforeRaw}`);
  process.exit(1);
}

// ── Распознавание фантомных сессий ──────────────────────────────────────────

/** Насколько близко endedAt должен совпасть с началом следующей сессии. */
const SAME_MOMENT_MS = 5_000;

type SessionRow = {
  id: number;
  startedAt: Date;
  endedAt: Date | null;
  durationMinutes: number | null;
};

function spanMinutes(session: SessionRow): number {
  const end = session.endedAt ? session.endedAt.getTime() : Date.now();
  return Math.max(0, (end - session.startedAt.getTime()) / 60_000);
}

/**
 * Сессия закрыта старым кодом «задним числом при следующем входе»?
 * Открытые сессии не трогаем — их новая логика и так ограничивает по heartbeat.
 */
function isLegacyOrphan(session: SessionRow, next: SessionRow | undefined): boolean {
  if (!session.endedAt) return false;
  if (session.endedAt.getTime() >= legacyBefore.getTime()) return false;
  if (!next) return false;
  if (Math.abs(next.startedAt.getTime() - session.endedAt.getTime()) > SAME_MOMENT_MS) return false;

  const span = spanMinutes(session);
  if (span <= STALE_SESSION_GAP_MINUTES) return false;

  // Засчитано всё календарное время — значит heartbeat не участвовал.
  const credited = session.durationMinutes ?? span;
  return credited >= span - 1;
}

/** Сколько минут оставить фантомной сессии: подтверждений нет, значит только допуск. */
function trimmedMinutes(session: SessionRow): number {
  return Math.min(session.durationMinutes ?? HEARTBEAT_GRACE_MINUTES, HEARTBEAT_GRACE_MINUTES);
}

// ── Награды, которые могли открыться из-за раздутого времени ────────────────
// Порог берём прямо из id: time_30 → 30 минут, early_5 → 5 утренних дней.
function thresholdFor(achievementId: string, prefix: string): number | null {
  if (!achievementId.startsWith(prefix)) return null;
  const value = Number(achievementId.slice(prefix.length));
  return Number.isFinite(value) ? value : null;
}

// ── Основной проход ─────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`\n🧹 Чистка учебного времени (${apply ? "ЗАПИСЬ" : "сухой прогон"})`);
  console.log(`   часовой пояс: ${APP_TIMEZONE}`);
  console.log(`   старыми считаем сессии, закрытые до ${legacyBefore.toISOString()}\n`);

  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      totalTimeMinutes: usersTable.totalTimeMinutes,
    })
    .from(usersTable);

  const targets = onlyUserId === null ? users : users.filter((u) => u.id === onlyUserId);
  if (targets.length === 0) {
    console.log("Пользователи не найдены — нечего чистить.");
    return;
  }

  let trimmedSessions = 0;
  let revokedAchievements = 0;
  let touchedUsers = 0;

  for (const user of targets) {
    const sessions: SessionRow[] = await db
      .select({
        id: timeSessionsTable.id,
        startedAt: timeSessionsTable.startedAt,
        endedAt: timeSessionsTable.endedAt,
        durationMinutes: timeSessionsTable.durationMinutes,
      })
      .from(timeSessionsTable)
      .where(eq(timeSessionsTable.studentId, user.id))
      .orderBy(timeSessionsTable.startedAt);

    // 1. Подрезаем фантомные сессии (в памяти, чтобы сразу посчитать итоги).
    const corrected: SessionLike[] = [];
    const patches: { id: number; endedAt: Date; durationMinutes: number; was: number }[] = [];

    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i]!;
      const next = sessions[i + 1];

      if (isLegacyOrphan(session, next)) {
        const minutes = trimmedMinutes(session);
        const endedAt = new Date(session.startedAt.getTime() + minutes * 60_000);
        patches.push({ id: session.id, endedAt, durationMinutes: minutes, was: Math.round(spanMinutes(session)) });
        corrected.push({ startedAt: session.startedAt, endedAt, durationMinutes: minutes });
        continue;
      }

      corrected.push({
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        durationMinutes: session.durationMinutes,
      });
    }

    // 2. Пересчитываем накопленное время. В users.totalTimeMinutes лежат только
    //    закрытые сессии — открытая добавляется на лету при чтении статистики.
    const recomputedTotal = Math.round(
      corrected
        .filter((s) => s.endedAt !== null)
        .reduce((sum, s) => sum + closedSessionMinutes(s), 0)
    );
    const earlyBirdDays = countEarlyBirdDays(corrected);
    const storedTotal = user.totalTimeMinutes ?? 0;

    // 3. Награды за время и утренние занятия, которые больше не заслужены.
    const medals = await db
      .select({ id: userAchievementsTable.id, achievementId: userAchievementsTable.achievementId })
      .from(userAchievementsTable)
      .where(eq(userAchievementsTable.userId, user.id));

    const toRevoke = medals.filter((medal) => {
      const timeNeeded = thresholdFor(medal.achievementId, "time_");
      if (timeNeeded !== null) return recomputedTotal < timeNeeded;
      const morningsNeeded = thresholdFor(medal.achievementId, "early_");
      if (morningsNeeded !== null) return earlyBirdDays < morningsNeeded;
      return false;
    });

    const hasChanges = patches.length > 0 || recomputedTotal !== storedTotal || toRevoke.length > 0;
    if (!hasChanges) continue;

    touchedUsers += 1;
    console.log(`👤 ${user.username} (id ${user.id})`);
    for (const patch of patches) {
      console.log(`   • сессия #${patch.id}: ${patch.was} мин → ${patch.durationMinutes} мин`);
    }
    if (recomputedTotal !== storedTotal) {
      console.log(`   • всего времени: ${storedTotal} мин → ${recomputedTotal} мин`);
    }
    if (toRevoke.length > 0) {
      console.log(`   • снимаем награды: ${toRevoke.map((m) => m.achievementId).join(", ")}`);
    }
    console.log(`   • утренних дней: ${earlyBirdDays}`);

    trimmedSessions += patches.length;
    revokedAchievements += toRevoke.length;

    if (!apply) continue;

    for (const patch of patches) {
      await db
        .update(timeSessionsTable)
        .set({ endedAt: patch.endedAt, durationMinutes: patch.durationMinutes })
        .where(eq(timeSessionsTable.id, patch.id));
    }
    if (recomputedTotal !== storedTotal) {
      await db
        .update(usersTable)
        .set({ totalTimeMinutes: recomputedTotal })
        .where(eq(usersTable.id, user.id));
    }
    if (toRevoke.length > 0) {
      await db
        .delete(userAchievementsTable)
        .where(inArray(userAchievementsTable.id, toRevoke.map((m) => m.id)));
    }
  }

  console.log(
    `\n📊 Итог: пользователей ${touchedUsers}, подрезано сессий ${trimmedSessions}, снято наград ${revokedAchievements}`
  );
  if (!apply) {
    console.log("   Это был сухой прогон. Повторите с --apply, чтобы записать изменения.\n");
  } else {
    console.log("   Изменения записаны.\n");
  }
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("❌ Чистка не удалась:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
