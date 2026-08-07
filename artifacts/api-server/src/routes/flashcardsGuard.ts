// ─────────────────────────────────────────────────────────────────────────────
// Страж доступа к тренажёру колоды.
//
// GET /flashcards/study/:deckId оказался единственным маршрутом колод БЕЗ
// проверки прав. Соседние (/decks/:id, /decks/:id/words) спрашивают
// loadViewableDeck, а этот просто доставал колоду по номеру — то есть любой
// авторизованный ученик мог открыть приватную колоду чужого учителя, зная её
// id, и пройти по ней тренировку. Заодно битый номер уходил в SQL как NaN и
// валил запрос пятисоткой вместо внятного ответа.
//
// ── Почему отдельным файлом, а не правкой обработчика ───────────────────────
// routes/flashcards.ts — 90 КБ. Переписывать его целиком ради шести строк
// проверки опаснее самой дыры: одна потерянная строка в таком файле кладёт весь
// раздел. Страж регистрируется ДО flashcardsRouter (см. routes/index.ts) и
// встаёт на пути запроса первым: либо пропускает дальше через next(), либо
// отвечает отказом. Сам обработчик тренировки не меняется.
//
// Правила доступа повторяют loadViewableDeck: системная колода, своя,
// назначенная учителем — или роль администратора.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { db } from "@workspace/db";
import { decksTable, deckAssignmentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";

const router = Router();

router.get("/flashcards/study/:deckId", requireAuth, async (req, res, next) => {
  const user = getUser(req);
  const deckId = Number(req.params["deckId"]);

  // Раньше NaN просто уходил в запрос и ронял его пятисоткой.
  if (!Number.isInteger(deckId) || deckId <= 0) {
    res.status(400).json({ error: "Некорректный номер колоды" });
    return;
  }

  const [deck] = await db
    .select({ id: decksTable.id, ownerId: decksTable.ownerId, isSystem: decksTable.isSystem })
    .from(decksTable)
    .where(eq(decksTable.id, deckId));

  if (!deck) {
    res.status(404).json({ error: "Колода не найдена" });
    return;
  }

  // Системную колоду и свою собственную можно всегда, админа не ограничиваем.
  if (deck.isSystem || deck.ownerId === user.userId || user.role === "admin") {
    next();
    return;
  }

  // Остаётся один законный случай: колоду прислал учитель.
  const [assigned] = await db
    .select({ id: deckAssignmentsTable.id })
    .from(deckAssignmentsTable)
    .where(and(
      eq(deckAssignmentsTable.deckId, deckId),
      eq(deckAssignmentsTable.studentId, user.userId),
    ));

  if (assigned) {
    next();
    return;
  }

  res.status(403).json({ error: "Нет доступа к этой колоде" });
});

export default router;
