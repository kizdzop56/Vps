// ─────────────────────────────────────────────────────────────────────────────
// Рейд-босс: маршруты экрана.
//
//   GET  /raid/current   — босс, шкала, мой вклад, энергия, мана, вехи, лиги
//   POST /raid/ability   — спецатака за ману: power | aoe | shield
//   POST /raid/claim     — забрать все достигнутые вехи вклада
//   POST /raid/quest     — награда за дневное задание
//   POST /raid/chest     — сундук за итог закончившегося рейда
//   POST /raid/shop      — трата монет: мана или полная энергия
//
// Урон здесь НЕ наносится: его снимает перехватчик ответов (routes/raidHook.ts).
// Экран рейда только показывает состояние и распоряжается наградами.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { requireAuth, getUser } from "../lib/auth";
import {
  buy,
  claimChest,
  claimMilestones,
  claimQuest,
  isActionError,
  raidSnapshot,
  useAbility,
} from "../lib/raid";

const router = Router();

router.get("/raid/current", requireAuth, async (req, res) => {
  const user = getUser(req);
  res.json(await raidSnapshot(user.userId, new Date()));
});

router.post("/raid/ability", requireAuth, async (req, res) => {
  const user = getUser(req);
  const raw = (req.body as { ability?: unknown }).ability;
  const ability = raw === "power" || raw === "aoe" || raw === "shield" ? raw : null;
  if (!ability) {
    res.status(400).json({ error: "ability: ожидается power, aoe или shield" });
    return;
  }
  const result = await useAbility(user.userId, ability, new Date());
  if (isActionError(result)) {
    res.status(400).json(result);
    return;
  }
  res.json(await raidSnapshot(user.userId, new Date()));
});

router.post("/raid/claim", requireAuth, async (req, res) => {
  const user = getUser(req);
  const result = await claimMilestones(user.userId, new Date());
  if (isActionError(result)) {
    res.status(400).json(result);
    return;
  }
  // Отдаём и выданное, и новую картину: экран показывает награды окном, а
  // цифры под ним должны уже быть новыми.
  res.json({ granted: result.granted, raid: null, snapshot: await raidSnapshot(user.userId, new Date()) });
});

router.post("/raid/quest", requireAuth, async (req, res) => {
  const user = getUser(req);
  const result = await claimQuest(user.userId, new Date());
  if (isActionError(result)) {
    res.status(400).json(result);
    return;
  }
  res.json(await raidSnapshot(user.userId, new Date()));
});

router.post("/raid/chest", requireAuth, async (req, res) => {
  const user = getUser(req);
  const eventId = Number((req.body as { eventId?: unknown }).eventId);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    res.status(400).json({ error: "eventId required" });
    return;
  }
  const result = await claimChest(user.userId, eventId, new Date());
  if (isActionError(result)) {
    res.status(400).json(result);
    return;
  }
  res.json({ chest: result, snapshot: await raidSnapshot(user.userId, new Date()) });
});

router.post("/raid/shop", requireAuth, async (req, res) => {
  const user = getUser(req);
  const raw = (req.body as { item?: unknown }).item;
  const item = raw === "mana" || raw === "stamina" ? raw : null;
  if (!item) {
    res.status(400).json({ error: "item: ожидается mana или stamina" });
    return;
  }
  const result = await buy(user.userId, item, new Date());
  if (isActionError(result)) {
    res.status(400).json(result);
    return;
  }
  res.json(await raidSnapshot(user.userId, new Date()));
});

export default router;
