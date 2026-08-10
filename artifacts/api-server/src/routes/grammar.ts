// ─────────────────────────────────────────────────────────────────────────────
// Раздел «Составлять»: неправильные глаголы, времена, сборка предложений.
//
// Маршруты:
//   GET  /grammar/overview        — режимы, времена и сколько заданий доступно
//   GET  /grammar/session         — подборка заданий (?mode=&tense=)
//   POST /grammar/check           — проверка ответа с разбором ошибки
//
// ── Уровень один на всё приложение ──────────────────────────────────────────
// Берётся из flashcard_settings.placement_level — оттуда же, откуда его берут
// слова. Свой уровень для грамматики был бы вторым источником правды: ученик
// проходит тест один раз, а уровней у него становится два, и они разъезжаются.
//
// ── БД не трогается ─────────────────────────────────────────────────────────
// Ни таблиц, ни миграций: задания лежат в коде, а прогресс на этом шаге не
// хранится — сессия считает попытки сама и показывает итог. Так раздел
// выкатывается без риска для базы; хранение добавим, когда станет ясно, что
// именно стоит хранить (какие формы даются тяжелее всего — вот это полезно,
// а «сколько заходов сделано» никому не нужно).
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { requireAuth, getUser } from "../lib/auth";
import { ensureSettings } from "../lib/flashcardsCore";
import { LEVEL_ORDER, fitsLevel, verbsUpTo, type CefrLevel } from "../lib/grammar/verbs";
import { TENSES } from "../lib/grammar/tenses";
import { ASSEMBLE_TASKS, TENSE_GAP_TASKS, VERB_GAP_TASKS } from "../lib/grammar/tasks";
import {
  SESSION_SIZE,
  buildGrammarSession,
  checkGrammarAnswer,
  type GrammarMode,
} from "../lib/grammar/engine";

const router = Router();

/** Ответ длиннее этого — не ответ, а вставленный текст. */
const MAX_ANSWER_LEN = 200;

const MODES: GrammarMode[] = ["verbs", "tense", "build"];

function isMode(value: unknown): value is GrammarMode {
  return typeof value === "string" && MODES.includes(value as GrammarMode);
}

/**
 * Уровень ученика. Не прошёл тест — считаем A1, как и марафон слов: показать
 * начинающему задания B2 хуже, чем показать слишком простые.
 */
async function levelOf(userId: number): Promise<CefrLevel> {
  const settings = await ensureSettings(userId);
  const raw = settings.placementLevel ?? "A1";
  return (LEVEL_ORDER.includes(raw as CefrLevel) ? raw : "A1") as CefrLevel;
}

// ── GET /grammar/overview ───────────────────────────────────────────────────
router.get("/grammar/overview", requireAuth, async (req, res) => {
  const user = getUser(req);
  const level = await levelOf(user.userId);

  const verbTasks = VERB_GAP_TASKS.filter((t) => fitsLevel(t.level, level));
  const tenseTasks = TENSE_GAP_TASKS.filter((t) => fitsLevel(t.level, level));
  const buildTasks = ASSEMBLE_TASKS.filter((t) => fitsLevel(t.level, level));

  // Времена показываем только те, что уже проходят на этом уровне, и рядом —
  // сколько по каждому есть заданий. Время без заданий в списке выглядело бы
  // как сломанная кнопка.
  const tenses = TENSES.filter((t) => fitsLevel(t.level, level)).map((t) => ({
    id: t.id,
    title: t.title,
    titleRu: t.titleRu,
    level: t.level,
    formula: t.formula,
    usage: t.usage,
    markers: t.markers,
    rule: t.rule,
    taskCount: tenseTasks.filter((x) => x.tense === t.id).length,
  }));

  res.json({
    level,
    sessionSize: SESSION_SIZE,
    modes: [
      {
        id: "verbs",
        title: "Неправильные глаголы",
        subtitle: "вставь нужную форму в предложение",
        taskCount: verbTasks.length,
        verbCount: verbsUpTo(level).length,
      },
      {
        id: "tense",
        title: "Времена",
        subtitle: "выбери время и тренируй его правила",
        taskCount: tenseTasks.length,
        tenseCount: tenses.filter((t) => t.taskCount > 0).length,
      },
      {
        id: "build",
        title: "Собери предложение",
        subtitle: "по русскому переводу, из слов",
        taskCount: buildTasks.length,
      },
    ],
    tenses,
  });
});

// ── GET /grammar/session ────────────────────────────────────────────────────
router.get("/grammar/session", requireAuth, async (req, res) => {
  const user = getUser(req);
  const mode = req.query["mode"];
  if (!isMode(mode)) {
    res.status(400).json({ error: "mode: ожидается verbs, tense или build" });
    return;
  }

  const level = await levelOf(user.userId);
  const tense = typeof req.query["tense"] === "string" ? String(req.query["tense"]) : undefined;

  const { cards, total } = buildGrammarSession({ mode, level, tense, now: new Date() });

  // Пустая подборка — это не ошибка, а сообщение: на этом уровне заданий ещё
  // нет. Клиент объясняет её текстом, поэтому отвечаем 200 с нулём.
  res.json({ mode, level, tense, total, cards });
});

// ── POST /grammar/check ─────────────────────────────────────────────────────
//
// Эталон берётся из банка по номеру задания, а не из тела запроса: иначе клиент
// мог бы прислать свой «правильный ответ» и засчитать себе что угодно. Ровно та
// же причина, что у проверки свободного ответа в словах.
router.post("/grammar/check", requireAuth, async (req, res) => {
  const body = req.body as { taskId?: unknown; given?: unknown };
  const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
  const given = typeof body.given === "string" ? body.given.slice(0, MAX_ANSWER_LEN) : "";

  if (!taskId) {
    res.status(400).json({ error: "taskId required" });
    return;
  }

  const verdict = checkGrammarAnswer(taskId, given);
  if (!verdict) {
    res.status(404).json({ error: "Задание не найдено" });
    return;
  }

  res.json(verdict);
});

export default router;
