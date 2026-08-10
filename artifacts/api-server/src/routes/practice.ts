// ─────────────────────────────────────────────────────────────────────────────
// Режим «Собери предложение»: выдача заданий и проверка ответа.
//
//   GET  /practice/sentences?count=8   — пачка заданий уровня ученика
//   POST /practice/sentences/check     — проверка собранного предложения
//
// ── Эталон не уезжает на клиент ─────────────────────────────────────────────
// В выдаче есть русский перевод и плитки, но НЕ английское предложение. Иначе
// верный ответ лежит в ответе сервера открытым текстом, и посмотреть его можно
// прямо в инструментах разработчика — задание превращается в кнопку.
//
// Эталон приходит вместе с вердиктом, то есть после ответа: там он и нужен,
// чтобы показать правильный вариант и разобрать ошибку.
//
// Из этого следует, что серверу надо помнить, какое задание он выдал. Список
// живёт в памяти рядом с пулом (см. lib/sentenceGen.ts) и по той же причине:
// задание нужно на один показ. Перезапуск сервера теряет список — тогда проверка
// честно отвечает «не удалось проверить», а не засчитывает ошибку.
//
// ── Про очки ────────────────────────────────────────────────────────────────
// Этот режим их пока не даёт. Прикрутить наспех нельзя: дневной потолок очков
// считается по журналу повторений СЛОВ (см. lib/srs.ts), и записывать туда
// предложения — значит испортить статистику по словам. Нужен отдельный счёт.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { db } from "@workspace/db";
import { flashcardSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";
import { takeTasks } from "../lib/sentenceGen";
import { checkSentence, isCefr, type Cefr, type SentenceTask } from "../lib/sentenceTask";

const router = Router();

/** Сколько заданий отдаём за один заход. Короткая сессия, как у слов. */
const DEFAULT_COUNT = 8;
const MAX_COUNT = 20;

/** Ответ длиннее этого — не ответ, а вставленный текст. */
const MAX_ANSWER_LEN = 300;

/**
 * Выданные задания: id → эталон.
 *
 * Ограничено по размеру, потому что иначе это утечка памяти: сервер живёт
 * неделями, а заданий за это время выдаётся тысячи. Старые вытесняются
 * первыми — они уже отвечены.
 */
const issued = new Map<string, { en: string; note?: string; level: Cefr }>();
const ISSUED_LIMIT = 3000;

function remember(id: string, value: { en: string; note?: string; level: Cefr }) {
  issued.set(id, value);
  if (issued.size > ISSUED_LIMIT) {
    // Map хранит порядок вставки, поэтому первый ключ — самый старый.
    const oldest = issued.keys().next();
    if (!oldest.done) issued.delete(oldest.value);
  }
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

/**
 * Уровень ученика. Тест не пройден — считаем начинающим: показать A1 человеку
 * с уровнем B2 не страшно, а обратное — стена в первом же задании.
 */
async function levelOf(userId: number): Promise<Cefr> {
  const [settings] = await db
    .select({ level: flashcardSettingsTable.placementLevel })
    .from(flashcardSettingsTable)
    .where(eq(flashcardSettingsTable.userId, userId));
  const level = settings?.level;
  return isCefr(level) ? level : "A1";
}

/**
 * Как отвечать: собирать из плиток или писать целиком.
 *
 * На A1 всегда плитки: написать фразу целиком новичок не может физически, и
 * упражнение превратилось бы в проверку раскладки клавиатуры.
 *
 * Дальше — через одно. Плитки это узнавание порядка, письмо — воспроизведение;
 * нужно и то, и другое, но письмо каждый раз слишком тяжело для темпа сессии.
 */
function modeFor(level: Cefr, index: number): "tiles" | "write" {
  if (level === "A1") return "tiles";
  return index % 2 === 1 ? "write" : "tiles";
}

// ── GET /practice/sentences ─────────────────────────────────────────────────
router.get("/practice/sentences", requireAuth, async (req, res) => {
  const user = getUser(req);

  const asked = Number(req.query["count"]);
  const count = Number.isFinite(asked)
    ? Math.max(1, Math.min(MAX_COUNT, Math.trunc(asked)))
    : DEFAULT_COUNT;

  // Уровень можно задать явно — это нужно учителю и для проверки режима.
  const requested = req.query["level"];
  const level = isCefr(requested) ? requested : await levelOf(user.userId);

  let tasks: SentenceTask[];
  try {
    tasks = await takeTasks(level, count);
  } catch (err) {
    req.log.error({ err, level }, "Не удалось собрать задания");
    res.status(503).json({ error: "Задания не готовы. Попробуй ещё раз через минуту." });
    return;
  }

  res.json({
    level,
    tasks: tasks.map((task, i) => {
      const id = nextId();
      remember(id, { en: task.en, level, ...(task.note ? { note: task.note } : {}) });
      return {
        id,
        ru: task.ru,
        tokens: task.tokens,
        mode: modeFor(level, i),
        // Сколько слов в ответе: подсказка по длине, а не сам ответ. Без неё
        // при письме непонятно, ждут фразу или одно слово.
        words: task.en.replace(/[.!?]+\s*$/, "").split(/\s+/).length,
      };
    }),
  });
});

// ── POST /practice/sentences/check ──────────────────────────────────────────
router.post("/practice/sentences/check", requireAuth, async (req, res) => {
  const body = req.body as { taskId?: unknown; given?: unknown };
  const taskId = typeof body.taskId === "string" ? body.taskId : "";
  const given = typeof body.given === "string" ? body.given.slice(0, MAX_ANSWER_LEN) : "";

  if (!taskId) {
    res.status(400).json({ error: "taskId required" });
    return;
  }

  const task = issued.get(taskId);
  if (!task) {
    // Сервер перезапустился между выдачей и ответом. Засчитывать ошибку за это
    // нельзя: ученик ни при чём. Клиент показывает «не удалось проверить» и
    // листает дальше, не портя статистику.
    res.json({ unknown: true, correct: false });
    return;
  }

  const verdict = checkSentence(given, task.en);
  res.json({
    correct: verdict.correct,
    // Эталон отдаём только сейчас — после ответа.
    expected: task.en,
    ...(task.note ? { note: task.note } : {}),
    ...(verdict.firstWrongWord ? { firstWrongWord: verdict.firstWrongWord } : {}),
    ...(verdict.missing?.length ? { missing: verdict.missing } : {}),
    ...(verdict.extra?.length ? { extra: verdict.extra } : {}),
  });
});

export default router;
