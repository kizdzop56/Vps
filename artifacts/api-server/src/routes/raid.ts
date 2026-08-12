// ─────────────────────────────────────────────────────────────────────────────
// Рейд-босс: маршруты экрана и практики.
//
//   GET  /raid/current   — босс, шкала, мой вклад, энергия, монеты, лиги
//   GET  /raid/battle    — заход практики: задания, по которым бьют босса
//   POST /raid/answer    — ответ практики: проверка и урон
//   POST /raid/buy       — атака или баф за монеты: power | aoe | shield | stamina
//   POST /raid/quest     — награда за дневное задание
//   POST /raid/chest     — сундук за итог закончившегося рейда
//   POST /raid/claim     — забрать вехи вклада (экран вех сейчас скрыт)
//
// Ответы тренажёров «Учёбы» тоже бьют босса, но не здесь: их перехватывает
// routes/raidHook.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { requireAuth, getUser } from "../lib/auth";
import {
  buyBuff,
  claimChest,
  claimMilestones,
  claimQuest,
  isActionError,
  raidSnapshot,
  recordRaidHit,
  type RaidBuff,
} from "../lib/raid";
import { RAID_BATCH, buildRaidBatch, checkRaidAnswer } from "../lib/raidSession";

const router = Router();

/** Ответ длиннее этого — не ответ, а вставленный текст. */
const MAX_ANSWER_LEN = 200;

router.get("/raid/current", requireAuth, async (req, res) => {
  const user = getUser(req);
  res.json(await raidSnapshot(user.userId, new Date()));
});

// ── GET /raid/battle ────────────────────────────────────────────────────────
// Заход практики. Правильных ответов в задании нет: проверка целиком серверная,
// а способ ответа (и вместе с ним ставка урона) записан на сервере при выдаче.
router.get("/raid/battle", requireAuth, async (req, res) => {
  const user = getUser(req);
  const tasks = await buildRaidBatch(user.userId, new Date());
  res.json({ size: RAID_BATCH, tasks });
});

// ── POST /raid/answer ───────────────────────────────────────────────────────
//
// Возвращает только «верно или нет» и правильный ответ: разбора ошибок в рейде
// нет намеренно (см. шапку lib/raidSession.ts). Рядом кладём поле raid — по нему
// клиент рисует вылетающую цифру урона.
router.post("/raid/answer", requireAuth, async (req, res) => {
  const user = getUser(req);
  const body = req.body as { taskId?: unknown; given?: unknown };
  const taskId = Number(body.taskId);
  const given = typeof body.given === "string" ? body.given.slice(0, MAX_ANSWER_LEN) : "";

  if (!Number.isInteger(taskId) || taskId <= 0) {
    res.status(400).json({ error: "taskId required" });
    return;
  }

  const now = new Date();
  const verdict = await checkRaidAnswer(user.userId, taskId, given, now);
  if (!verdict) {
    // Либо задание чужое, либо на него уже отвечали: второй раз урон не идёт.
    res.status(400).json({ error: "Это задание уже закрыто" });
    return;
  }

  const raid = await recordRaidHit({
    userId: user.userId,
    correct: verdict.correct,
    difficulty: verdict.difficulty,
    tags: verdict.tags,
    now,
  });

  res.json({
    correct: verdict.correct,
    typo: verdict.typo,
    expected: verdict.expected,
    raid,
  });
});

router.post("/raid/buy", requireAuth, async (req, res) => {
  const user = getUser(req);
  const raw = (req.body as { buff?: unknown }).buff;
  const allowed: RaidBuff[] = ["power", "aoe", "shield", "stamina"];
  const buff = allowed.find((b) => b === raw);
  if (!buff) {
    res.status(400).json({ error: "buff: ожидается power, aoe, shield или stamina" });
    return;
  }
  const result = await buyBuff(user.userId, buff, new Date());
  if (isActionError(result)) {
    res.status(400).json(result);
    return;
  }
  res.json(await raidSnapshot(user.userId, new Date()));
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

router.post("/raid/claim", requireAuth, async (req, res) => {
  const user = getUser(req);
  const result = await claimMilestones(user.userId, new Date());
  if (isActionError(result)) {
    res.status(400).json(result);
    return;
  }
  res.json({ granted: result.granted, snapshot: await raidSnapshot(user.userId, new Date()) });
});

export default router;
