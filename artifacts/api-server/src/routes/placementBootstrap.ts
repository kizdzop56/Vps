import { Router } from "express";
import { db, flashcardSettingsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";
import { ensureSettings } from "../lib/flashcardsCore";

const router = Router();

// Учеников, чей профиль уже существовал до запуска обязательного placement-теста,
// переводим на A2 и не заставляем проходить тест повторно. Новые профили после
// этой даты получают стандартные настройки placementDone=false и видят тест.
const PLACEMENT_ROLLOUT_AT = new Date("2026-10-16T13:50:00.000Z");

// Этот обработчик стоит перед основным GET /flashcards/settings. Он исправляет
// только старые ученические профили, затем передаёт запрос стандартному роуту,
// который возвращает обычный объект настроек.
router.get("/flashcards/settings", requireAuth, async (req, _res, next) => {
  const { userId, role } = getUser(req);
  if (role !== "student") {
    next();
    return;
  }

  const [profile] = await db
    .select({ createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (profile && profile.createdAt < PLACEMENT_ROLLOUT_AT) {
    const settings = await ensureSettings(userId);
    if (!settings.placementDone) {
      await db.update(flashcardSettingsTable)
        .set({ placementLevel: "A2", placementDone: true, updatedAt: new Date() })
        .where(eq(flashcardSettingsTable.userId, userId));
    }
  }

  next();
});

export default router;
