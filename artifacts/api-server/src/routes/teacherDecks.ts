import { Router } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, decksTable, deckAssignmentsTable, wordsTable } from "@workspace/db";
import { getUser, requireAuth } from "../lib/auth";

const router = Router();

/**
 * Быстрый список собственных колод для экрана «Задания».
 *
 * Общий список /flashcards/decks считает учебную статистику по каждому слову.
 * Для карточек учителя эти данные не нужны, но тяжёлый подсчёт задерживал
 * ответ и оставлял весь экран заданий на бесконечном индикаторе загрузки.
 * Здесь возвращаем только поля, которые нужны списку созданных колод.
 */
router.get("/flashcards/decks", requireAuth, async (req, res, next) => {
  const mineOnly = req.query["mine"] === "1" || req.query["mine"] === "true";
  if (!mineOnly) {
    next();
    return;
  }

  const user = getUser(req);
  const decks = await db.select().from(decksTable).where(and(
    eq(decksTable.ownerId, user.userId),
    eq(decksTable.hidden, false),
  ));
  const ids = decks.map((deck) => deck.id);

  const wordCounts = ids.length
    ? await db.select({ deckId: wordsTable.deckId, count: sql<number>`count(*)::int` })
      .from(wordsTable).where(inArray(wordsTable.deckId, ids)).groupBy(wordsTable.deckId)
    : [];
  const assignedCounts = ids.length
    ? await db.select({ deckId: deckAssignmentsTable.deckId, count: sql<number>`count(*)::int` })
      .from(deckAssignmentsTable).where(inArray(deckAssignmentsTable.deckId, ids))
      .groupBy(deckAssignmentsTable.deckId)
    : [];

  const wordsByDeck = new Map(wordCounts.map((row) => [row.deckId, Number(row.count)]));
  const assignedByDeck = new Map(assignedCounts.map((row) => [row.deckId, Number(row.count)]));

  res.json(decks.map((deck) => ({
    id: deck.id,
    ownerId: deck.ownerId ?? undefined,
    title: deck.title,
    theme: deck.theme ?? undefined,
    description: deck.description ?? undefined,
    emoji: deck.emoji ?? undefined,
    isSystem: deck.isSystem,
    cefrLevel: deck.cefrLevel ?? undefined,
    createdAt: deck.createdAt.toISOString(),
    wordCount: wordsByDeck.get(deck.id) ?? 0,
    assignedCount: assignedByDeck.get(deck.id) || undefined,
    canEdit: !deck.isSystem && deck.ownerId === user.userId || undefined,
  })));
});

export default router;
