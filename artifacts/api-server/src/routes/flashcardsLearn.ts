// ─────────────────────────────────────────────────────────────────────────────
// Тренажёр слов: очередь, ответы, статистика, марафон.
//
// Вторая половина раздела «Слова». Первая (колоды, каталог, импорт, назначения
// ученикам) живёт в routes/flashcards.ts, общее для обеих — в
// lib/flashcardsCore.ts. Раньше всё это лежало в одном файле на две тысячи
// строк, и правку в нём нельзя было проверить глазами.
//
// Маршруты:
//   GET  /flashcards/study/:deckId — тренировка одной колоды
//   GET  /flashcards/session       — сквозная сессия по всем колодам
//   GET  /flashcards/hard          — «сложные слова»
//   POST /flashcards/review        — ответ ученика: оценка, интервал, очки
//   GET  /flashcards/stats         — статистика и график по дням
//   GET  /flashcards/marathon      — зал повторений выученного
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  decksTable,
  wordsTable,
  userCardStateTable,
  flashcardSettingsTable,
  reviewLogTable,
} from "@workspace/db";
import { eq, and, desc, gte, lt, inArray } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";
import {
  LEARNED_LEVEL,
  awardablePoints,
  countsAsLapse,
  gradeFromAnswer,
  gradeFromLegacy,
  isHardCard,
  isLearned,
  legacyResultFromGrade,
  nextReviewState,
  pointsEarnedToday,
  pointsForReview,
  reachedLearned,
  startOfDay,
  type AnswerInfo,
  type Grade,
} from "../lib/srs";
import { interleaveQueue } from "../lib/wordExercise";
import { MARATHON_MAX_CARDS, pickMarathonCards } from "../lib/wordQueue";
import { localDayKey, startOfLocalDay } from "../lib/timeStats";
import {
  availableCefrLevels,
  buildTrainerQueue,
  canViewStudent,
  clean,
  dailyWordProgress,
  ensureSettings,
  loadViewableDeck,
  nextAvailableLevel,
  stateForHard,
  toWordLike,
  trainerCard,
  visibleDeckIds,
} from "../lib/flashcardsCore";

const router = Router();

// ── GET /flashcards/study/:deckId ───────────────────────────────────────────
//
// ДОСТУП ПРОВЕРЯЕТСЯ. Раньше здесь стоял простой поиск колоды по номеру — это
// был единственный маршрут колод без проверки прав, и любой авторизованный
// ученик мог открыть приватную колоду чужого учителя, зная её id. Заодно
// нечисловой номер уходил в SQL как NaN и валил запрос пятисоткой.
router.get("/flashcards/study/:deckId", requireAuth, async (req, res) => {
  const user = getUser(req);
  const deckId = Number(req.params["deckId"]);
  const found = await loadViewableDeck(user, deckId);
  if (!found.ok) { res.status(found.status).json({ error: found.error }); return; }
  const { deck } = found;

  const settings = await ensureSettings(user.userId);
  const words = await db.select().from(wordsTable).where(eq(wordsTable.deckId, deckId));
  const states = await db.select().from(userCardStateTable).where(eq(userCardStateTable.userId, user.userId));
  const stateByWord = new Map(states.map((s) => [s.wordId, s]));

  // Сколько новых слов уже введено сегодня В ЭТОЙ КОЛОДЕ — дневная норма
  // считается отдельно для каждой колоды (не глобально), чтобы лимит одной
  // колоды не блокировал изучение новых слов в других.
  const nowDate = new Date();
  const today = startOfDay(nowDate).getTime();
  const deckWordIds = new Set(words.map((w) => w.id));
  const introducedToday = states.filter(
    (s) => s.createdAt.getTime() >= today && deckWordIds.has(s.wordId),
  ).length;
  const remainingNew = Math.max(0, settings.dailyNewLimit - introducedToday);

  // Отвлекающие варианты берём из слов того же уровня во всех доступных колодах:
  // внутри одной маленькой колоды похожих слов может не хватить на четыре
  // варианта, и упражнение пришлось бы упрощать.
  const poolDeckIds = await visibleDeckIds(user.userId);
  const poolWords = poolDeckIds.length > 0
    ? await db.select().from(wordsTable).where(inArray(wordsTable.deckId, poolDeckIds))
    : words;
  const allPool = poolWords.map(toWordLike);

  const now = nowDate.getTime();
  const dueCards: any[] = [];
  const newCards: any[] = [];
  const ordered = [...words].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  for (const w of ordered) {
    const st = stateByWord.get(w.id);
    const card = trainerCard(w, st, allPool, nowDate);
    if (st) {
      if (st.dueAt.getTime() <= now) dueCards.push(card);
    } else {
      newCards.push(card);
    }
  }

  const introducedInDeck = words.filter((w) => stateByWord.has(w.id)).length;
  const needsIntro = deck.isSystem && introducedInDeck === 0;

  const limitedNew = newCards.slice(0, remainingNew);
  // повторения и новые слова идут вперемешку — так сессия не распадается на
  // «скучный блок повторений» и «блок новых слов»
  const cards = interleaveQueue(dueCards, limitedNew);
  const progress = await dailyWordProgress(user.userId, settings.dailyWordGoal, nowDate);

  res.json(clean({
    deckId, deckTitle: deck.title, isSystem: deck.isSystem, needsIntro,
    newCount: limitedNew.length, reviewCount: dueCards.length, ...progress, cards,
  }));
});

// ── GET /flashcards/session ─────────────────────────────────────────────────
// Сквозная сессия по всем колодам: одна кнопка «Учить слова» вместо обхода
// колод вручную. Новые слова — по уровню подготовки, повторения — только те,
// что ещё не выучены (выученные живут в марафоне).
router.get("/flashcards/session", requireAuth, async (req, res) => {
  const user = getUser(req);
  res.json(await buildTrainerQueue(user.userId, "all", new Date()));
});

// ── GET /flashcards/hard ────────────────────────────────────────────────────
// «Сложные слова»: то, на чём ребёнок регулярно спотыкается.
router.get("/flashcards/hard", requireAuth, async (req, res) => {
  const user = getUser(req);
  res.json(await buildTrainerQueue(user.userId, "hard", new Date()));
});

// ── POST /flashcards/review ─────────────────────────────────────────────────
const GRADES: Grade[] = ["again", "hard", "good", "easy"];

router.post("/flashcards/review", requireAuth, async (req, res) => {
  const user = getUser(req);
  const body = req.body as {
    wordId: number;
    grade?: Grade;
    answer?: AnswerInfo;
    mode?: string;
    result?: "know" | "dont";
  };
  const wordId = Number(body.wordId);

  // Оценку принимаем в трёх видах:
  //   grade  — явная оценка (знакомство: «понятно» / «ещё раз»);
  //   answer — сам ответ ученика: верно/неверно, попытки, время → оценку считает
  //            сервер (одни правила для всех упражнений, см. lib/srs.ts);
  //   result — старый формат know/dont: его присылает уже развёрнутый клиент,
  //            поэтому поддержку оставляем, чтобы обновление не ломало прод.
  let grade: Grade | null = null;
  if (body.grade && GRADES.includes(body.grade)) grade = body.grade;
  else if (body.answer && typeof body.answer.correct === "boolean") grade = gradeFromAnswer(body.answer);
  else if (body.result === "know" || body.result === "dont") grade = gradeFromLegacy(body.result);

  if (!wordId || !grade) {
    res.status(400).json({ error: "wordId and grade (again|hard|good|easy) or answer.correct required" });
    return;
  }

  const [word] = await db.select({ id: wordsTable.id }).from(wordsTable).where(eq(wordsTable.id, wordId));
  if (!word) { res.status(404).json({ error: "Word not found" }); return; }

  const now = new Date();
  const settings = await ensureSettings(user.userId);
  const [existing] = await db.select().from(userCardStateTable)
    .where(and(eq(userCardStateTable.userId, user.userId), eq(userCardStateTable.wordId, wordId)));

  const prevLevel = existing?.memoryLevel ?? 0;
  const { level, dueAt, intervalMinutes } = nextReviewState(prevLevel, grade, now);
  const correct = grade !== "again";
  const legacyResult = legacyResultFromGrade(grade);
  const dayStart = startOfDay(now);

  // Раньше здесь читался ВЕСЬ журнал повторений пользователя — на каждый ответ.
  // Нужны от него ровно две вещи, и обе достаются узкими запросами: сколько
  // очков начислено сегодня и какие слова доходили до «выучено» раньше (чтобы
  // бонус за слово не выдался второй раз).
  const todayLogs = await db.select().from(reviewLogTable).where(and(
    eq(reviewLogTable.userId, user.userId),
    gte(reviewLogTable.reviewedAt, dayStart),
  ));
  const learnedEarlier = await db.select({ wordId: reviewLogTable.wordId }).from(reviewLogTable).where(and(
    eq(reviewLogTable.userId, user.userId),
    lt(reviewLogTable.reviewedAt, dayStart),
    gte(reviewLogTable.memoryLevelAfter, LEARNED_LEVEL),
  ));
  const learnedBefore = new Set(learnedEarlier.map((r) => r.wordId));

  const learnedToday = todayLogs.some((l) => l.wordId === wordId && isLearned(l.memoryLevelAfter ?? 0));
  const justLearned = reachedLearned(prevLevel, level) && !learnedBefore.has(wordId) && !learnedToday;

  if (existing) {
    await db.update(userCardStateTable).set({
      memoryLevel: level, dueAt, lastResult: legacyResult,
      timesSeen: existing.timesSeen + 1,
      timesCorrect: existing.timesCorrect + (correct ? 1 : 0),
      lapses: existing.lapses + (countsAsLapse(prevLevel, grade) ? 1 : 0),
      introduced: true, updatedAt: now,
    }).where(eq(userCardStateTable.id, existing.id));
  } else {
    await db.insert(userCardStateTable).values({
      userId: user.userId, wordId, memoryLevel: level, dueAt, introduced: true,
      timesSeen: 1, timesCorrect: correct ? 1 : 0, lastResult: legacyResult,
    }).onConflictDoNothing();
  }

  // grade пишем рядом с result: по нему дневной потолок очков считается точно,
  // а не по завышенной ставке «любой верный ответ стоит два очка».
  await db.insert(reviewLogTable).values({
    userId: user.userId, wordId, result: legacyResult, grade,
    memoryLevelAfter: level, reviewedAt: now,
  });

  // Очки за слова: раньше карточки не давали ничего, очки приносили только
  // задания. Дневной потолок не даёт «нафармить» баллы перелистыванием.
  const earnedToday = pointsEarnedToday(todayLogs, dayStart, learnedBefore);
  const pointsEarned = awardablePoints(pointsForReview(grade, justLearned), earnedToday);
  if (pointsEarned > 0) {
    const [userRow] = await db.select({ totalPoints: usersTable.totalPoints })
      .from(usersTable).where(eq(usersTable.id, user.userId));
    await db.update(usersTable)
      .set({ totalPoints: (userRow?.totalPoints ?? 0) + pointsEarned, updatedAt: now })
      .where(eq(usersTable.id, user.userId));
  }

  const progress = await dailyWordProgress(user.userId, settings.dailyWordGoal, now);

  res.json({
    wordId, grade, memoryLevel: level, dueAt: dueAt.toISOString(), intervalMinutes,
    learned: isLearned(level), justLearned, pointsEarned, ...progress,
  });
});

// ── GET /flashcards/stats ───────────────────────────────────────────────────
router.get("/flashcards/stats", requireAuth, async (req, res) => {
  const user = getUser(req);

  // По умолчанию — статистика самого пользователя. Учитель/родитель/админ может
  // запросить статистику ученика через ?studentId=.
  const requested = Number(req.query["studentId"]);
  const targetId = Number.isFinite(requested) && requested > 0 ? requested : user.userId;
  if (targetId !== user.userId) {
    const allowed = await canViewStudent(user, targetId);
    if (!allowed) { res.status(403).json({ error: "Нет доступа к статистике этого ученика" }); return; }
  }

  const states = await db.select().from(userCardStateTable).where(eq(userCardStateTable.userId, targetId));
  const logs = await db.select().from(reviewLogTable).where(eq(reviewLogTable.userId, targetId));

  // CEFR-уровень из placement-теста (для отображения учителю/родителю).
  const [settings] = await db.select().from(flashcardSettingsTable).where(eq(flashcardSettingsTable.userId, targetId));
  const placementLevel = settings?.placementLevel ?? null;

  const totalWords = states.length;
  const totalLearned = states.filter((s) => s.memoryLevel >= LEARNED_LEVEL).length;
  const totalReviews = logs.length;
  const correct = logs.filter((l) => l.result === "know").length;
  const accuracy = totalReviews > 0 ? Math.round((correct / totalReviews) * 100) : 0;

  // Когда каждое слово впервые дошло до «выучено». Условие именно isLearned, а
  // не равенство порогу: при перескоке уровня (оценка «легко») слово иначе не
  // попадало в статистику вовсе.
  const firstLearnedAt = new Map<number, Date>();
  for (const l of [...logs].sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime())) {
    if (isLearned(l.memoryLevelAfter ?? 0) && !firstLearnedAt.has(l.wordId)) {
      firstLearnedAt.set(l.wordId, l.reviewedAt);
    }
  }

  // Агрегат по последним 14 дням.
  //
  // Ключ дня — localDayKey (часовой пояс приложения). Раньше группировка шла
  // по toISOString(), то есть по UTC, а сами 14 дней перебирались локальной
  // датой: для Минска всё, что сделано после полуночи, попадало во вчерашний
  // столбец, а «сегодня» стояло пустым до трёх часов ночи.
  const days: { date: string; learned: number; reviews: number; correct: number }[] = [];
  const byDay = new Map<string, { reviews: number; correct: number; learned: number }>();
  const bump = (key: string, patch: Partial<{ reviews: number; correct: number; learned: number }>) => {
    const e = byDay.get(key) ?? { reviews: 0, correct: 0, learned: 0 };
    e.reviews += patch.reviews ?? 0;
    e.correct += patch.correct ?? 0;
    e.learned += patch.learned ?? 0;
    byDay.set(key, e);
  };
  for (const l of logs) bump(localDayKey(l.reviewedAt), { reviews: 1, correct: l.result === "know" ? 1 : 0 });
  for (const at of firstLearnedAt.values()) bump(localDayKey(at), { learned: 1 });

  const midnight = startOfLocalDay(Date.now()).getTime();
  const DAY_MS = 24 * 60 * 60 * 1000;
  for (let i = 13; i >= 0; i--) {
    // Отступаем половиной суток внутрь дня: так ключ не съезжает на границе
    // перевода часов, когда сутки короче или длиннее 24 часов.
    const key = localDayKey(midnight - i * DAY_MS + DAY_MS / 2);
    const e = byDay.get(key) ?? { reviews: 0, correct: 0, learned: 0 };
    days.push({ date: key, learned: e.learned, reviews: e.reviews, correct: e.correct });
  }

  // Сегодняшний срез: прогресс к цели дня по словам и число сложных слов —
  // это же видят учитель и родитель, когда открывают статистику ученика.
  const dayStart = startOfDay().getTime();
  const logsToday = logs.filter((l) => l.reviewedAt.getTime() >= dayStart);
  const wordsToday = new Set(logsToday.map((l) => l.wordId)).size;
  const learnedToday = [...firstLearnedAt.values()].filter((at) => at.getTime() >= dayStart).length;
  const hardCount = states.filter((st) => isHardCard(stateForHard(st))).length;
  const dailyWordGoal = settings?.dailyWordGoal ?? 10;

  res.json({
    totalLearned, totalWords, totalReviews, accuracy, daily: days, placementLevel,
    wordsToday, learnedToday, reviewsToday: logsToday.length,
    dailyWordGoal, goalReached: wordsToday >= dailyWordGoal, hardCount,
  });
});

// ── GET /flashcards/marathon ────────────────────────────────────────────────
//
// «Марафон слов» — зал повторений: сюда попадают ТОЛЬКО выученные слова уровня
// (уровень памяти ≥ LEARNED_LEVEL), у которых наступил срок. Всё, что ещё не
// усвоено, живёт в разделе «Учить слова».
//
// ── Условия перехода на следующий уровень ───────────────────────────────────
// Раньше их было невозможно выполнить, и это была не строгость, а ошибка:
//
//   1. Требовалось ответить на ВСЕ слова уровня. При шести новых словах за
//      сессию тысяча слов A2 — это больше полугода ежедневных занятий.
//   2. Точность считалась за всю историю (timesSeen/timesCorrect копятся
//      вечно). Ученик, начинавший с ошибок, не мог отыграть 75% никогда:
//      каждый следующий верный ответ двигал среднее на доли процента.
//
// Теперь порог такой: пройдено не меньше MARATHON_ANSWERED_RATIO слов уровня, а
// точность считается по последним MARATHON_ACCURACY_WINDOW ответам — по свежему
// состоянию, а не по всей биографии. Минимум ответов (MARATHON_MIN_ANSWERS)
// нужен, чтобы уровень нельзя было «сдать» с трёх удачных карточек.
const MARATHON_PASS = 75;          // порог точности (%) для перехода
const MARATHON_ANSWERED_RATIO = 0.6; // какую долю слов уровня надо пройти
const MARATHON_ACCURACY_WINDOW = 200; // по скольким последним ответам считаем точность
const MARATHON_MIN_ANSWERS = 30;   // меньше — судить о точности не по чему

router.get("/flashcards/marathon", requireAuth, async (req, res) => {
  const user = getUser(req);
  const settings = await ensureSettings(user.userId);
  const level = settings.placementLevel ?? "A1";

  // Следующий уровень ищем среди тех, на которые РЕАЛЬНО есть слова. Каталог
  // заканчивается на C1, а раньше следующий брался просто следующим в списке
  // CEFR: ученик на C1 получал предложение перейти на C2, где ноль слов, и
  // марафон превращался в тупик без выхода.
  const available = await availableCefrLevels();
  const nextLevel = nextAvailableLevel(level, available);

  // слова уровня только из готовых (системных) колод
  const rows = await db
    .select()
    .from(wordsTable)
    .innerJoin(decksTable, eq(wordsTable.deckId, decksTable.id))
    .where(and(eq(decksTable.isSystem, true), eq(wordsTable.cefrLevel, level)));
  const words = rows.map((r) => r.words);

  const states = await db.select().from(userCardStateTable).where(eq(userCardStateTable.userId, user.userId));
  const stateByWord = new Map(states.map((s) => [s.wordId, s]));

  let seen = 0;
  let lifetimeCorrect = 0;
  let answeredWords = 0; // сколько разных слов уровня пользователь уже отвечал
  for (const w of words) {
    const st = stateByWord.get(w.id);
    if (!st) continue;
    seen += st.timesSeen;
    lifetimeCorrect += st.timesCorrect;
    if (st.timesSeen > 0) answeredWords++;
  }

  // Точность по СВЕЖИМ ответам на слова этого уровня.
  const levelWordIds = words.map((w) => w.id);
  const recent = levelWordIds.length > 0
    ? await db
      .select({ result: reviewLogTable.result })
      .from(reviewLogTable)
      .where(and(
        eq(reviewLogTable.userId, user.userId),
        inArray(reviewLogTable.wordId, levelWordIds),
      ))
      .orderBy(desc(reviewLogTable.reviewedAt))
      .limit(MARATHON_ACCURACY_WINDOW)
    : [];
  const recentCorrect = recent.filter((r) => r.result === "know").length;
  const accuracy = recent.length > 0 ? Math.round((recentCorrect / recent.length) * 100) : 0;

  const now = new Date();
  const allPool = words.map(toWordLike);

  // Отбор и порядок — в lib/wordQueue.ts (модуль без БД, покрыт тестами).
  const { picked, learnedCount, dueNow } = pickMarathonCards(
    words,
    (w) => stateByWord.get(w.id),
    now,
    MARATHON_MAX_CARDS,
  );
  const cards = picked.map((w) => trainerCard(w, stateByWord.get(w.id), allPool, now));

  const totalWords = words.length;
  const answeredTarget = Math.ceil(totalWords * MARATHON_ANSWERED_RATIO);
  const eligible =
    totalWords > 0 &&
    nextLevel !== null &&
    answeredWords >= answeredTarget &&
    recent.length >= MARATHON_MIN_ANSWERS &&
    accuracy >= MARATHON_PASS;
  const progress = await dailyWordProgress(user.userId, settings.dailyWordGoal, now);

  res.json(clean({
    level, nextLevel: nextLevel ?? undefined, totalWords, answeredWords,
    // Сколько слов уровня нужно пройти для перехода — клиент показывает это
    // вместо прежнего «все до единого».
    answeredTarget,
    // Сколько слов уровня уже выучено (весь зал повторений) и сколько из них
    // созрело к повторению прямо сейчас — по ним клиент объясняет пустой экран.
    learnedCount, dueNow,
    seen, correct: lifetimeCorrect,
    accuracy, recentAnswers: recent.length, minAnswers: MARATHON_MIN_ANSWERS,
    threshold: MARATHON_PASS, eligible, ...progress, cards,
  }));
});

export default router;
