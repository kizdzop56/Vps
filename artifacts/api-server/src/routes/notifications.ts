// ─────────────────────────────────────────────────────────────────────────────
// Уведомления: лента, отметка о показе, отметка о прочтении.
//
// GET  /notifications        — пересобрать и отдать ленту
// POST /notifications/seen   — всплывающее окно показано
// POST /notifications/read   — уведомление открыто (гасит счётчик)
//
// Показ и прочтение разведены намеренно: окно всплывает один раз, а счётчик у
// колокольчика держится до тех пор, пока ученик не откроет уведомление.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";
import { FEED_LIMIT, syncNotifications } from "../lib/notifications";
import { logger } from "../lib/logger";

const router = Router();

type Row = typeof notificationsTable.$inferSelect;

function toDto(row: Row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
    read: row.readAt !== null,
    seen: row.seenAt !== null,
    meta: (row.meta ?? {}) as Record<string, unknown>,
  };
}

/** Разбирает список id из тела запроса: чужие id отсеет сам запрос по userId. */
function parseIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v > 0)
    .slice(0, FEED_LIMIT);
}

async function readFeed(userId: number) {
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    // Вторая сортировка по id нужна для событий одной секунды: без неё порядок
    // между ними меняется от запроса к запросу, и список прыгает.
    .orderBy(desc(notificationsTable.createdAt), desc(notificationsTable.id))
    .limit(FEED_LIMIT);

  const items = rows.map(toDto);
  return {
    items,
    // Счётчик считается по этому же окну: непрочитанного старше шестидесяти
    // последних событий не бывает — всё, что вытеснено, давно показано.
    unreadCount: items.filter((n) => !n.read).length,
    unseen: items.filter((n) => !n.seen),
  };
}

router.get("/notifications", requireAuth, async (req, res) => {
  const user = getUser(req);
  try {
    await syncNotifications(user.userId);
  } catch (err) {
    // Сборка сорвалась — отдаём то, что уже накоплено. Пустой экран профиля
    // из-за ленты уведомлений был бы куда хуже, чем устаревшая лента.
    logger.error({ err, userId: user.userId }, "Не удалось пересобрать ленту уведомлений");
  }
  res.json(await readFeed(user.userId));
});

router.post("/notifications/seen", requireAuth, async (req, res) => {
  const user = getUser(req);
  const ids = parseIds((req.body ?? {}).ids);
  if (ids.length === 0) {
    res.json(await readFeed(user.userId));
    return;
  }

  await db
    .update(notificationsTable)
    .set({ seenAt: new Date() })
    .where(and(
      eq(notificationsTable.userId, user.userId),
      inArray(notificationsTable.id, ids),
      isNull(notificationsTable.seenAt),
    ));

  res.json(await readFeed(user.userId));
});

router.post("/notifications/read", requireAuth, async (req, res) => {
  const user = getUser(req);
  const body = (req.body ?? {}) as { ids?: unknown; all?: unknown };
  const ids = parseIds(body.ids);
  const all = body.all === true;

  if (!all && ids.length === 0) {
    res.status(400).json({ error: "ids or all required" });
    return;
  }

  const stamp = new Date();
  // Прочитанное считается и показанным: окно уже не нужно.
  const patch = { readAt: stamp, seenAt: stamp };

  await db
    .update(notificationsTable)
    .set(patch)
    .where(all
      ? and(eq(notificationsTable.userId, user.userId), isNull(notificationsTable.readAt))
      : and(eq(notificationsTable.userId, user.userId), inArray(notificationsTable.id, ids)));

  res.json(await readFeed(user.userId));
});

export default router;
