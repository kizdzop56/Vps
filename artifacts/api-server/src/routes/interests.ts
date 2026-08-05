// ─────────────────────────────────────────────────────────────────────────────
// Интересы ученика: «Игры», «Футбол», «Кино» и т. д.
//
// Зачем отдельным маршрутом, а не полем в PATCH /users/:id/profile: профиль
// обновляется частями (аватар, био, ник), и подмешивать туда массив тем —
// значит каждый раз пересылать его целиком и рисковать затереть чужой правкой.
// Здесь замена списка целиком, но только своего.
//
// Список хранится в users.interests (jsonb). null у старых строк = пусто.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";

const router = Router();

/** Больше десяти тем — это уже не интересы, а список всего на свете. */
const MAX_INTERESTS = 10;
const MAX_LEN = 24;

/** Чистим ввод: обрезаем, убираем пустые и повторы без учёта регистра. */
function normalize(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const value = String(item ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_LEN);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_INTERESTS) break;
  }
  return out;
}

// ── GET /users/:id/interests ────────────────────────────────────────────────
// Открыто всем авторизованным: интересы видит и учитель в профиле ученика.
router.get("/users/:id/interests", requireAuth, async (req, res) => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Неверный ID" });
    return;
  }
  const [row] = await db.select({ interests: usersTable.interests })
    .from(usersTable).where(eq(usersTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }
  res.json({ interests: row.interests ?? [] });
});

// ── PUT /users/:id/interests ────────────────────────────────────────────────
// Менять можно только свои: это личный выбор ученика, а не оценка учителя.
router.put("/users/:id/interests", requireAuth, async (req, res) => {
  const caller = getUser(req);
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Неверный ID" });
    return;
  }
  if (caller.userId !== id) {
    res.status(403).json({ error: "Менять интересы можно только у себя" });
    return;
  }

  const interests = normalize((req.body as { interests?: unknown })?.interests);
  await db.update(usersTable)
    .set({ interests, updatedAt: new Date() })
    .where(eq(usersTable.id, id));

  res.json({ interests });
});

export default router;
