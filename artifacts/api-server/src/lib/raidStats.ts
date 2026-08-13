// ─────────────────────────────────────────────────────────────────────────────
// Итоги рейдов за всё время: из них считаются МЕДАЛИ ПРОФИЛЯ.
//
// ── Почему медали рейда переехали в профиль ─────────────────────────────────
// Сначала у рейда был свой блок медалей во вкладке события. Это было ошибкой
// сразу с двух стор:
//
//   • витрина наград в профиле — единственное место, где ученик смотрит, что он
//     собрал. Вторая витрина в другой вкладке делит коллекцию надвое, и общий
//     счётчик «14 из 50» перестаёт быть общим;
//   • у рейдовых медалей был свой вид, свой каталог и свои правила показа —
//     то есть вторая реализация того же самого, которая неизбежно разъезжается
//     с первой при любой правке оформления.
//
// Теперь рейдовые медали живут в общем каталоге (english-learning/constants/
// achievements.ts) наравне с остальными, а этот файл отдаёт единственное, чего
// им не хватало: показатели события.
//
// ── Ничего не хранится ──────────────────────────────────────────────────────
// Все величины ВЫВОДЯТСЯ из raid_participants и raid_events. Отдельной таблицы
// «выданных рейдовых медалей» нет и не будет: показатели меняются только вверх,
// значит такая таблица была бы второй копией правды. Факт выдачи медали пишется
// туда же, куда и у остальных наград — в user_achievements.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "@workspace/db";
import { raidEventsTable, raidParticipantsTable } from "@workspace/db";
import { and, eq, gt, sql } from "drizzle-orm";
import { logger } from "./logger";

/** Показатели рейдов одного ученика за всё время. */
export interface RaidAchievementStats {
  /** Урон по всем боссам суммарно. */
  raidDamage: number;
  /** Ударов, дошедших до босса. */
  raidHits: number;
  /** Критических ударов мощной атакой. */
  raidCrits: number;
  /** Лучшее комбо за всю историю. */
  raidBestCombo: number;
  /** Рейдов, закончившихся победой сообщества (и он в них бил). */
  raidWins: number;
  /** Сколько раз добивающий удар был его. */
  raidLastHits: number;
  /**
   * Ключи боссов, которых он помогал добить: golem, dragon, phantom,
   * elemental, titan. Из них считаются медали за каждого босса отдельно.
   */
  raidBosses: string[];
}

export const EMPTY_RAID_STATS: RaidAchievementStats = {
  raidDamage: 0,
  raidHits: 0,
  raidCrits: 0,
  raidBestCombo: 0,
  raidWins: 0,
  raidLastHits: 0,
  raidBosses: [],
};

/**
 * Итоги рейдов ученика.
 *
 * Три коротких запроса вместо одного: суммы, победы по боссам и добивающие
 * удары живут в разных разрезах, и склеивать их в один SQL значило бы получить
 * либо повторный подсчёт сумм, либо нечитаемый запрос.
 *
 * При ошибке возвращаются нули: медали — украшение, из-за них профиль падать не
 * должен. Именно так этот код и ведёт себя на базе, куда таблицы рейда ещё не
 * приехали.
 */
export async function raidAchievementStats(userId: number): Promise<RaidAchievementStats> {
  try {
    const [totals] = await db
      .select({
        damage: sql<number>`coalesce(sum(${raidParticipantsTable.damage}), 0)::int`,
        hits: sql<number>`coalesce(sum(${raidParticipantsTable.hits}), 0)::int`,
        crits: sql<number>`coalesce(sum(${raidParticipantsTable.crits}), 0)::int`,
        bestCombo: sql<number>`coalesce(max(${raidParticipantsTable.bestCombo}), 0)::int`,
        // Победой считается рейд, в котором ученик РЕАЛЬНО бил: «был в базе, но
        // не ударил ни разу» победой не считается.
        wins: sql<number>`count(*) filter (where ${raidEventsTable.status} = 'won' and ${raidParticipantsTable.damage} > 0)::int`,
      })
      .from(raidParticipantsTable)
      .innerJoin(raidEventsTable, eq(raidEventsTable.id, raidParticipantsTable.eventId))
      .where(eq(raidParticipantsTable.userId, userId));

    // Каких боссов он помогал добить. Один босс может встретиться в нескольких
    // неделях — важен сам факт, поэтому группировка по ключу.
    const bosses = await db
      .select({ boss: raidEventsTable.boss })
      .from(raidParticipantsTable)
      .innerJoin(raidEventsTable, eq(raidEventsTable.id, raidParticipantsTable.eventId))
      .where(and(
        eq(raidParticipantsTable.userId, userId),
        eq(raidEventsTable.status, "won"),
        gt(raidParticipantsTable.damage, 0),
      ))
      .groupBy(raidEventsTable.boss);

    const [kills] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(raidEventsTable)
      .where(eq(raidEventsTable.killerUserId, userId));

    return {
      raidDamage: Number(totals?.damage ?? 0),
      raidHits: Number(totals?.hits ?? 0),
      raidCrits: Number(totals?.crits ?? 0),
      raidBestCombo: Number(totals?.bestCombo ?? 0),
      raidWins: Number(totals?.wins ?? 0),
      raidLastHits: Number(kills?.n ?? 0),
      raidBosses: bosses.map((b) => b.boss).filter(Boolean),
    };
  } catch (err) {
    logger.error({ err, userId }, "Рейд: итоги за всё время не посчитались");
    return { ...EMPTY_RAID_STATS, raidBosses: [] };
  }
}
