// Флеш-карточки: колоды, слова, каталог, импорт, назначения ученикам и
// placement-тест.
//
// Тренажёр (очередь, ответы, статистика, марафон) живёт в
// routes/flashcardsLearn.ts, общее для обеих половин — в lib/flashcardsCore.ts.
// Раньше всё это лежало в одном файле на две тысячи строк, и правку в нём
// нельзя было проверить глазами.
//
// Данные офлайн (сид), озвучка — через /api/tts. Для пользовательских слов
// перевод получаем через Google Translate.
import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  decksTable,
  wordsTable,
  placementResultsTable,
  flashcardSettingsTable,
  deckAssignmentsTable,
} from "@workspace/db";
import { eq, and, or, ne, asc, isNull, inArray, sql } from "drizzle-orm";
import { requireAuth, getUser, isTeacher } from "../lib/auth";
import { translateWithGoogle, translateRussianToEnglish } from "@workspace/translate";
import {
  BULK_WORD_LIMIT,
  MANUAL_WORD_LIMIT,
  chunked,
  orderByRequestedIds,
  planCatalogCopy,
  wordKey,
  wordKeySet,
  type WordInsertRow,
} from "../lib/deckWords";
import {
  CEFR_ORDER,
  assertOwnDeck,
  canViewStudent,
  clean,
  deckStats,
  ensureSettings,
  loadViewableDeck,
} from "../lib/flashcardsCore";

const router = Router();

// Английское слово или короткая фраза латиницей. Один и тот же критерий
// используют автоматическая проверка слова, ручное добавление и импорт.
const ENGLISH_INPUT_RE = /^[A-Za-z]+(?:[ A-Za-z'-]*[A-Za-z])?$/;
const ENGLISH_MAX_LEN = 80;

// Русское слово или словосочетание для добавления «с русской стороны»
const RUSSIAN_INPUT_RE = /^[А-Яа-яЁё]+(?:[ А-Яа-яЁё-]*[А-Яа-яЁё])?$/;
const RUSSIAN_MAX_LEN = 80;

function normalizeRussianInput(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

type DictionaryEntry = { phonetic?: string; phonetics?: Array<{ text?: string }> };
type WordCheck =
  | { ok: true; normalized: string; ipa?: string }
  | { ok: false; code: "invalid-format" | "not-found" | "unavailable"; suggestion?: string };

function normalizeEnglishInput(value: string): string {
  return value
    .trim()
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
}

async function getSpellingSuggestion(english: string): Promise<string | undefined> {
  try {
    const url = new URL("https://api.datamuse.com/sug");
    url.searchParams.set("s", english);
    url.searchParams.set("max", "1");
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const data = await response.json() as Array<{ word?: unknown }>;
    const candidate = typeof data[0]?.word === "string" ? normalizeEnglishInput(data[0].word) : "";
    return candidate && candidate.toLowerCase() !== english.toLowerCase() ? candidate : undefined;
  } catch {
    return undefined;
  }
}

async function validateEnglishWord(input: string): Promise<WordCheck> {
  const normalized = normalizeEnglishInput(input);
  if (!normalized || normalized.length > ENGLISH_MAX_LEN || !ENGLISH_INPUT_RE.test(normalized)) {
    return { ok: false, code: "invalid-format" };
  }

  try {
    // dictionaryapi.dev регистрозависим: "Russian" (Google Translate часто
    // возвращает перевод с заглавной буквы) даёт 404, а "russian" — находится.
    // Само сохраняемое слово (normalized) регистр не меняет — только запрос.
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalized.toLowerCase())}`
    );
    if (response.status === 404) {
      return { ok: false, code: "not-found", suggestion: await getSpellingSuggestion(normalized) };
    }
    if (!response.ok) return { ok: false, code: "unavailable" };

    const data = await response.json() as DictionaryEntry[];
    const entry = Array.isArray(data) ? data[0] : undefined;
    const ipa = entry?.phonetic?.trim() || entry?.phonetics?.map((item) => item.text?.trim()).find(Boolean);
    return { ok: true, normalized, ipa };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

function validationErrorMessage(input: string, check: Exclude<WordCheck, { ok: true }>): string {
  if (check.code === "invalid-format") {
    return "Введите английское слово или короткую фразу только латинскими буквами.";
  }
  if (check.code === "not-found") {
    return check.suggestion
      ? `Слово «${input}» не найдено. Возможно, вы имели в виду «${check.suggestion}»?`
      : `Слово «${input}» не найдено. Проверьте написание и попробуйте снова.`;
  }
  return "Сервис проверки слов временно недоступен. Попробуйте ещё раз немного позже.";
}

// Разрешить русское слово в английское: сначала ищем в каталоге, потом переводим.
// Возвращает данные карточки или текст ошибки.
async function resolveEnglishFromRussian(
  russian: string,
): Promise<{ ok: true; english: string; ipa?: string; translationsRu: string[] } | { ok: false; error: string }> {
  // 1. Поиск точного совпадения в каталоге системных слов — быстро и бесплатно.
  //    translations_ru хранится как jsonb-массив, @> проверяет вхождение элемента.
  const catalogHit = await db
    .select({ english: wordsTable.english, ipa: wordsTable.ipa, translationsRu: wordsTable.translationsRu })
    .from(wordsTable)
    .where(sql`${wordsTable.translationsRu}::jsonb @> ${JSON.stringify([russian])}::jsonb`)
    .limit(1);

  if (catalogHit[0]) {
    const hit = catalogHit[0];
    return {
      ok: true,
      english: hit.english,
      ipa: hit.ipa ?? undefined,
      translationsRu: (hit.translationsRu as string[]).length > 0 ? (hit.translationsRu as string[]) : [russian],
    };
  }

  // 2. Google Translate RU→EN
  const translated = await translateRussianToEnglish(russian);
  if (!translated) {
    return { ok: false, error: `Не удалось распознать слово «${russian}». Проверьте написание.` };
  }

  // 3. Проверяем полученное английское слово в словаре — только за IPA.
  //    Словарь знает far from все слова (имена, редкие термины, составные
  //    слова), но перевод у нас уже есть, так что 404 из словаря не повод
  //    отклонять слово целиком — отклоняем только если сам перевод не получен
  //    (случай выше) или переведённый текст в принципе не похож на слово.
  const english = normalizeEnglishInput(translated);
  if (!english || !ENGLISH_INPUT_RE.test(english)) {
    return { ok: false, error: `Не удалось распознать слово «${russian}». Проверьте написание.` };
  }
  const checked = await validateEnglishWord(english);
  return {
    ok: true,
    english: checked.ok ? (checked.normalized ?? english) : english,
    ipa: checked.ok ? checked.ipa : undefined,
    translationsRu: [russian],
  };
}

// ── Placement-тест (CEFR). Вопросы адаптированы, ответы держим на сервере. ────
type PQ = { id: number; section: string; question: string; options: string[]; answer: number };
const PLACEMENT_QUESTIONS: PQ[] = [
  // Грамматика — предложения с пропуском (от простого к сложному).
  { id: 1, section: "Grammar", question: "She ___ a teacher.", options: ["is", "are", "am", "be"], answer: 0 },
  { id: 2, section: "Grammar", question: "They ___ football every weekend.", options: ["play", "plays", "playing", "is play"], answer: 0 },
  { id: 3, section: "Grammar", question: "I ___ to London last year.", options: ["go", "went", "gone", "going"], answer: 1 },
  { id: 4, section: "Grammar", question: "If it rains, we ___ at home.", options: ["stay", "will stay", "stayed", "would stay"], answer: 1 },
  { id: 5, section: "Grammar", question: "The report ___ by Friday.", options: ["must finish", "must be finished", "must finishing", "finished"], answer: 1 },
  // Перевод слова — англ. слово и 4 варианта перевода на русский (от простого к сложному).
  { id: 6, section: "Translation", question: "Перевод слова «apple»:", options: ["яблоко", "груша", "стол", "окно"], answer: 0 },
  { id: 7, section: "Translation", question: "Перевод слова «dog»:", options: ["кошка", "собака", "птица", "рыба"], answer: 1 },
  { id: 8, section: "Translation", question: "Перевод слова «to buy»:", options: ["продавать", "покупать", "терять", "искать"], answer: 1 },
  { id: 9, section: "Translation", question: "Перевод слова «weather»:", options: ["время", "погода", "деньги", "дорога"], answer: 1 },
  { id: 10, section: "Translation", question: "Перевод слова «to improve»:", options: ["ухудшать", "улучшать", "забывать", "повторять"], answer: 1 },
  { id: 11, section: "Translation", question: "Перевод слова «achievement»:", options: ["поражение", "достижение", "обещание", "наказание"], answer: 1 },
  // Лексика — синонимы и словосочетания (сложнее).
  { id: 12, section: "Vocabulary", question: "The opposite of 'cheap' is:", options: ["expensive", "free", "rich", "small"], answer: 0 },
  { id: 13, section: "Vocabulary", question: "Choose the synonym of 'begin':", options: ["finish", "start", "stop", "close"], answer: 1 },
  { id: 14, section: "Vocabulary", question: "'To give up' most nearly means:", options: ["to continue", "to stop trying", "to win", "to begin"], answer: 1 },
  { id: 15, section: "Vocabulary", question: "'Meticulous' most nearly means:", options: ["careless", "very careful and precise", "extremely fast", "lazy"], answer: 1 },
];

/**
 * Балл теста → уровень CEFR.
 *
 * Потолок — C1, хотя в CEFR есть и C2. Причина простая: каталог слов доходит
 * ровно до C1. Пока тест выдавал C2, ученик с пятнадцатью верными ответами
 * получал уровень, на котором нет ни одного слова: марафон оставался пустым
 * навсегда, а перейти было некуда.
 */
function scoreToCefr(score: number): { level: string; message: string } {
  if (score <= 2) return { level: "A1", message: "Начальный уровень — начинаем с основ." };
  if (score <= 6) return { level: "A2", message: "Базовые знания — уверенное начало." };
  if (score <= 9) return { level: "B1", message: "Средний уровень — хорошая база." };
  if (score <= 12) return { level: "B2", message: "Уверенный уровень — свободнее в общении." };
  return { level: "C1", message: "Продвинутый уровень." };
}

/** Какой из двух уровней выше. Пустые значения считаем самым низким. */
function higherLevel(a: string | null | undefined, b: string): string {
  const ia = a ? CEFR_ORDER.indexOf(a) : -1;
  const ib = CEFR_ORDER.indexOf(b);
  return ia > ib ? a! : b;
}

// ── GET /flashcards/settings ───────────────────────────────────────────
router.get("/flashcards/settings", requireAuth, async (req, res) => {
  const user = getUser(req);
  const s = await ensureSettings(user.userId);
  res.json(clean({
    dailyNewLimit: s.dailyNewLimit, dailyWordGoal: s.dailyWordGoal,
    placementLevel: s.placementLevel, placementDone: s.placementDone,
  }));
});

// ── PATCH /flashcards/settings ────────────────────────────────────────
router.patch("/flashcards/settings", requireAuth, async (req, res) => {
  const user = getUser(req);
  await ensureSettings(user.userId);
  const { dailyNewLimit, dailyWordGoal } = req.body as { dailyNewLimit?: number; dailyWordGoal?: number };
  const set: any = { updatedAt: new Date() };
  if (typeof dailyNewLimit === "number" && dailyNewLimit >= 1 && dailyNewLimit <= 100) set.dailyNewLimit = dailyNewLimit;
  if (typeof dailyWordGoal === "number" && dailyWordGoal >= 1 && dailyWordGoal <= 100) set.dailyWordGoal = dailyWordGoal;
  await db.update(flashcardSettingsTable).set(set).where(eq(flashcardSettingsTable.userId, user.userId));
  const s = await ensureSettings(user.userId);
  res.json(clean({
    dailyNewLimit: s.dailyNewLimit, dailyWordGoal: s.dailyWordGoal,
    placementLevel: s.placementLevel, placementDone: s.placementDone,
  }));
});

// ── GET /flashcards/placement ────────────────────────────────────────
router.get("/flashcards/placement", requireAuth, async (_req, res) => {
  res.json({
    total: PLACEMENT_QUESTIONS.length,
    questions: PLACEMENT_QUESTIONS.map((q) => ({ id: q.id, section: q.section, question: q.question, options: q.options })),
  });
});

// ── POST /flashcards/placement ──────────────────────────────────────
//
// ТЕСТ ПОДНИМАЕТ УРОВЕНЬ, НО НЕ ОПУСКАЕТ. Этот же тест открывается по кнопке
// «Пройти тест на B1» из марафона — то есть ученик проходит его повторно, уже
// имея уровень. Раньше результат записывался как есть: ответив хуже, чем в
// первый раз (устал, торопился, попались другие вопросы), ребёнок терял
// уровень, хотя экран обещал ровно обратное — «подтверди новый уровень».
// Потерять выученное из-за одного неудачного теста нельзя.
router.post("/flashcards/placement", requireAuth, async (req, res) => {
  const user = getUser(req);
  const { answers } = req.body as { answers: { id: number; choice: number }[] };
  if (!Array.isArray(answers)) {
    res.status(400).json({ error: "answers required" });
    return;
  }
  const byId = new Map(answers.map((a) => [a.id, a.choice]));
  let score = 0;
  for (const q of PLACEMENT_QUESTIONS) if (byId.get(q.id) === q.answer) score++;
  const { level, message } = scoreToCefr(score);

  const settings = await ensureSettings(user.userId);
  const applied = higherLevel(settings.placementLevel, level);
  const keptHigher = applied !== level;

  await db.insert(placementResultsTable).values({
    userId: user.userId,
    score,
    total: PLACEMENT_QUESTIONS.length,
    // В историю пишем то, что тест реально показал: она должна оставаться
    // честной, даже если действующий уровень остался прежним.
    cefrLevel: level,
    answers: PLACEMENT_QUESTIONS.map((q) => byId.get(q.id) ?? -1),
  });
  await db.update(flashcardSettingsTable)
    .set({ placementLevel: applied, placementDone: true, updatedAt: new Date() })
    .where(eq(flashcardSettingsTable.userId, user.userId));

  res.json({
    score,
    total: PLACEMENT_QUESTIONS.length,
    cefrLevel: applied,
    // Что показал именно этот прогон — клиенту полезно для объяснения.
    testedLevel: level,
    message: keptHigher
      ? `В этот раз получилось ${level}. Твой уровень остаётся ${applied} — понижать его за один тест мы не будем.`
      : message,
  });
});

// ── GET /flashcards/decks ────────────────────────────────────────────
router.get("/flashcards/decks", requireAuth, async (req, res) => {
  const user = getUser(req);

  // Колоды, назначенные этому пользователю учителем (отправленные ученику).
  const myAssignments = await db.select().from(deckAssignmentsTable)
    .where(eq(deckAssignmentsTable.studentId, user.userId));
  const assignedDeckIds = new Set(myAssignments.map((a) => a.deckId));

  // Системные + собственные + назначенные пользователю. С ?mine=1 — только свои
  // колоды: этим списком учитель пользуется в разделе «Задания». Скрытые колоды
  // (misc_{level}: слова уровня без своей тематической колоды) в список не
  // попадают ни при каких условиях — их слова доступны только через сквозную
  // сессию/марафон (visibleDeckIds() их не исключает).
  const mineOnly = req.query["mine"] === "1" || req.query["mine"] === "true";
  const decks = mineOnly
    ? await db.select().from(decksTable).where(and(eq(decksTable.ownerId, user.userId), eq(decksTable.hidden, false)))
    : await db.select().from(decksTable).where(and(
      or(
        isNull(decksTable.ownerId),
        eq(decksTable.ownerId, user.userId),
        assignedDeckIds.size > 0 ? inArray(decksTable.id, [...assignedDeckIds]) : sql`false`,
      ),
      eq(decksTable.hidden, false),
    ));

  // Для колод, которыми владеет пользователь (учитель), — скольким ученикам они
  // назначены. Показываем это в UI конструктора.
  const ownedIds = decks.filter((d) => d.ownerId === user.userId).map((d) => d.id);
  const assignedCountByDeck = new Map<number, number>();
  if (ownedIds.length > 0) {
    const rows = await db.select({ deckId: deckAssignmentsTable.deckId })
      .from(deckAssignmentsTable).where(inArray(deckAssignmentsTable.deckId, ownedIds));
    for (const r of rows) assignedCountByDeck.set(r.deckId, (assignedCountByDeck.get(r.deckId) ?? 0) + 1);
  }

  // Имя владельца — для колод, назначенных ученику учителем: клиент показывает
  // бейдж «От {ownerName}». Тянем имена одним запросом, а не по одному на колоду.
  const ownerIds = [...new Set(decks.map((d) => d.ownerId).filter((id): id is number => id != null))];
  const ownerNameById = new Map<number, string>();
  if (ownerIds.length > 0) {
    const owners = await db.select({ id: usersTable.id, name: usersTable.name, surname: usersTable.surname })
      .from(usersTable).where(inArray(usersTable.id, ownerIds));
    for (const o of owners) ownerNameById.set(o.id, [o.name, o.surname].filter(Boolean).join(" "));
  }

  const {
    wordCount: wordCountByDeck,
    learned: learnedByDeck,
    due: dueByDeck,
    introduced: introducedByDeck,
  } = await deckStats(user.userId, decks.map((d) => d.id));

  const result = decks
    .map((d) => {
      const wordCount = wordCountByDeck.get(d.id) ?? 0;
      const introduced = introducedByDeck.get(d.id) ?? 0;
      return clean({
        id: d.id,
        ownerId: d.ownerId ?? undefined,
        ownerName: d.ownerId != null ? ownerNameById.get(d.ownerId) : undefined,
        // для сортировки «новые сверху» в общем списке заданий+колод (вкладка «Все»)
        createdAt: d.createdAt.toISOString(),
        title: d.title,
        theme: d.theme ?? undefined,
        description: d.description ?? undefined,
        emoji: d.emoji ?? undefined,
        isSystem: d.isSystem,
        cefrLevel: d.cefrLevel ?? undefined,
        wordCount,
        learnedCount: learnedByDeck.get(d.id) ?? 0,
        dueCount: dueByDeck.get(d.id) ?? 0,
        newCount: Math.max(0, wordCount - introduced),
        // назначена ли эта колода текущему пользователю (ученику) учителем
        assigned: assignedDeckIds.has(d.id) || undefined,
        // скольким ученикам колода назначена (для владельца-учителя)
        assignedCount: assignedCountByDeck.get(d.id) || undefined,
        // можно ли править колоду: своя и не системная. Клиент раньше выводил
        // это из !isSystem, и для ещё не загруженной колоды получал запрет.
        canEdit: (!d.isSystem && d.ownerId === user.userId) || undefined,
      });
    })
    .sort((a, b) => Number(b.isSystem) - Number(a.isSystem));

  res.json(result);
});

// ── GET /flashcards/decks/:id (одна колода) ────────────────────────────
// Страница колоды раньше искала свою колоду в полном списке всех колод: пока
// список грузился (а он был тяжёлым), колода считалась ненайденной — учитель
// видел вместо названия «Колода» и не получал формы добавления слов.
router.get("/flashcards/decks/:id", requireAuth, async (req, res) => {
  const user = getUser(req);
  const deckId = Number(req.params["id"]);
  const found = await loadViewableDeck(user, deckId);
  if (!found.ok) { res.status(found.status).json({ error: found.error }); return; }
  const { deck, isOwner, assigned } = found;

  const { wordCount, learned, due, introduced } = await deckStats(user.userId, [deckId]);
  const words = wordCount.get(deckId) ?? 0;
  const assignedCount = isOwner
    ? (await db.select({ n: sql<number>`count(*)::int` }).from(deckAssignmentsTable)
      .where(eq(deckAssignmentsTable.deckId, deckId)))[0]?.n
    : undefined;

  res.json(clean({
    id: deck.id,
    ownerId: deck.ownerId ?? undefined,
    title: deck.title,
    theme: deck.theme ?? undefined,
    description: deck.description ?? undefined,
    emoji: deck.emoji ?? undefined,
    isSystem: deck.isSystem,
    cefrLevel: deck.cefrLevel ?? undefined,
    wordCount: words,
    learnedCount: learned.get(deckId) ?? 0,
    dueCount: due.get(deckId) ?? 0,
    newCount: Math.max(0, words - (introduced.get(deckId) ?? 0)),
    assigned: assigned || undefined,
    assignedCount: Number(assignedCount) || undefined,
    canEdit: (!deck.isSystem && isOwner) || undefined,
  }));
});

// ── GET /flashcards/decks/:id/words ────────────────────────────────────
router.get("/flashcards/decks/:id/words", requireAuth, async (req, res) => {
  const user = getUser(req);
  const deckId = Number(req.params["id"]);
  // Раньше здесь не было ни проверки номера, ни проверки доступа: битый номер
  // колоды уходил в SQL как NaN и валил запрос пятисоткой.
  const found = await loadViewableDeck(user, deckId);
  if (!found.ok) { res.status(found.status).json({ error: found.error }); return; }
  const words = await db.select().from(wordsTable).where(eq(wordsTable.deckId, deckId));
  res.json(words.map((w) => clean({
    id: w.id, deckId: w.deckId, english: w.english, partOfSpeech: w.partOfSpeech ?? undefined,
    translationsRu: w.translationsRu, ipa: w.ipa ?? undefined, exampleEn: w.exampleEn ?? undefined,
    exampleRu: w.exampleRu ?? undefined, cefrLevel: w.cefrLevel ?? undefined, audioUrl: w.audioUrl ?? undefined,
    emoji: w.emoji ?? undefined,
  })));
});

// ── GET /flashcards/catalog/words (каталог слов для конструктора колоды) ──────
//
// Учитель набирал слова только руками — по одному или списком. При этом в базе
// уже лежит готовый каталог: системные колоды по темам и уровням A1–C1. Здесь он
// отдаётся с фильтрами и поиском, чтобы слова можно было отмечать галочками.
//
// Источник каталога — системные колоды (плюс свои, если includeOwn=1). Чужая
// приватная колода другого учителя источником быть не должна.
router.get("/flashcards/catalog/words", requireAuth, async (req, res) => {
  const user = getUser(req);
  const q = String(req.query["q"] ?? "").trim();
  const theme = String(req.query["theme"] ?? "").trim();
  const level = String(req.query["level"] ?? "").trim();
  const deckIdParam = Number(req.query["deckId"]);
  const excludeDeckId = Number(req.query["excludeDeckId"]);
  const includeOwn = String(req.query["includeOwn"] ?? "") === "1";
  const limit = Math.min(Math.max(Number(req.query["limit"]) || 60, 1), 200);
  const offset = Math.max(Number(req.query["offset"]) || 0, 0);

  // Какие колоды считаем источником каталога.
  const sourceFilters = [eq(decksTable.isSystem, true)];
  if (includeOwn) sourceFilters.push(eq(decksTable.ownerId, user.userId));
  const deckFilters = [or(...sourceFilters)!];
  if (Number.isFinite(deckIdParam) && deckIdParam > 0) deckFilters.push(eq(decksTable.id, deckIdParam));
  if (Number.isFinite(excludeDeckId) && excludeDeckId > 0) deckFilters.push(ne(decksTable.id, excludeDeckId));
  if (theme) deckFilters.push(eq(decksTable.theme, theme));

  const sourceDecks = await db.select({
    id: decksTable.id, title: decksTable.title, theme: decksTable.theme, emoji: decksTable.emoji,
  }).from(decksTable).where(and(...deckFilters));

  if (sourceDecks.length === 0) { res.json({ total: 0, words: [] }); return; }

  const deckById = new Map(sourceDecks.map((d) => [d.id, d]));
  const wordFilters = [inArray(wordsTable.deckId, [...deckById.keys()])];
  if (level) wordFilters.push(eq(wordsTable.cefrLevel, level));
  if (q) {
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    // Ищем и по английскому, и по переводу: учителю удобно набрать «яблоко».
    // translations_ru — jsonb-массив строк, а не текст: ILIKE по касту всего
    // массива в текст сравнивал бы «["яблоко","фрукт"]» целиком (со скобками
    // и кавычками) — при подстроках это работает лишь случайно и ломается
    // на границах элементов. Разворачиваем массив в строки через
    // jsonb_array_elements_text и матчим ILIKE каждый элемент отдельно.
    wordFilters.push(or(
      sql`${wordsTable.english} ILIKE ${like}`,
      sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(${wordsTable.translationsRu}) AS elem
        WHERE elem ILIKE ${like}
      )`,
    )!);
  }
  const where = and(...wordFilters);

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` }).from(wordsTable).where(where);

  const rows = await db.select().from(wordsTable).where(where)
    .orderBy(asc(wordsTable.deckId), asc(wordsTable.sortOrder), asc(wordsTable.id))
    .limit(limit).offset(offset);

  res.json({
    total,
    words: rows.map((w) => {
      const deck = deckById.get(w.deckId);
      return clean({
        id: w.id, deckId: w.deckId, english: w.english, partOfSpeech: w.partOfSpeech ?? undefined,
        translationsRu: w.translationsRu, ipa: w.ipa ?? undefined, exampleEn: w.exampleEn ?? undefined,
        exampleRu: w.exampleRu ?? undefined, cefrLevel: w.cefrLevel ?? undefined, emoji: w.emoji ?? undefined,
        // откуда слово — показываем подписью под словом в конструкторе
        deckTitle: deck?.title ?? undefined, theme: deck?.theme ?? undefined,
      });
    }),
  });
});

// ── POST /flashcards/decks (своя колода) ───────────────────────────────
router.post("/flashcards/decks", requireAuth, async (req, res) => {
  const user = getUser(req);
  const { title, theme, emoji, description } = req.body as { title: string; theme?: string; emoji?: string; description?: string };
  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title required" });
    return;
  }
  const themeTrimmed = typeof theme === "string" ? theme.trim() : "";
  if (themeTrimmed.length > 60) {
    res.status(400).json({ error: "theme: максимум 60 символов" });
    return;
  }
  const [row] = await db.insert(decksTable).values({
    ownerId: user.userId, title: title.trim(), theme: themeTrimmed || "custom",
    emoji: emoji ?? "📕", description: description ?? null, isSystem: false,
  }).returning();
  res.status(201).json(clean({
    id: row!.id, ownerId: row!.ownerId ?? undefined, title: row!.title, theme: row!.theme ?? undefined,
    description: row!.description ?? undefined, emoji: row!.emoji ?? undefined, isSystem: row!.isSystem,
    cefrLevel: row!.cefrLevel ?? undefined, wordCount: 0,
  }));
});

// ── DELETE /flashcards/decks/:id (удалить свою колоду) ──────────────────────
router.delete("/flashcards/decks/:id", requireAuth, async (req, res) => {
  const user = getUser(req);
  const deckId = Number(req.params["id"]);
  const chk = await assertOwnDeck(deckId, user.userId);
  if (!chk.ok) { res.status(chk.status!).json({ error: chk.error }); return; }
  // Каскад в схеме удалит слова → состояния карточек → журнал повторений.
  await db.delete(decksTable).where(eq(decksTable.id, deckId));
  res.status(204).end();
});

// ── POST /flashcards/decks/:id/assign (учитель → отправить колоду ученику) ────
router.post("/flashcards/decks/:id/assign", requireAuth, async (req, res) => {
  const user = getUser(req);
  if (!isTeacher(user.role) && user.role !== "admin") {
    res.status(403).json({ error: "Только учитель или администратор может управлять назначениями колод" });
    return;
  }
  const deckId = Number(req.params["id"]);
  // Принимаем и одного ученика, и сразу нескольких: учителю удобнее отправить
  // колоду всей группе одним действием.
  const body = req.body as { studentId?: number; studentIds?: number[] };
  const requested = Array.isArray(body.studentIds) && body.studentIds.length > 0
    ? body.studentIds.map(Number)
    : typeof body.studentId === "number" ? [body.studentId] : [];
  const ids = [...new Set(requested.filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) { res.status(400).json({ error: "Выберите, кому отправить колоду" }); return; }

  // Назначать может только владелец своей (не системной) колоды.
  const chk = await assertOwnDeck(deckId, user.userId);
  if (!chk.ok) { res.status(chk.status!).json({ error: chk.error }); return; }

  // И только своим ученикам (связь teacher↔student, accepted) — или админ.
  const checks = await Promise.all(ids.map(async (id) => [id, await canViewStudent(user, id)] as const));
  const allowed = checks.filter(([, ok]) => ok).map(([id]) => id);
  if (allowed.length === 0) { res.status(403).json({ error: "Можно отправлять колоды только своим ученикам" }); return; }

  await db.insert(deckAssignmentsTable)
    .values(allowed.map((studentId) => ({ deckId, studentId, assignedBy: user.userId })))
    .onConflictDoNothing();
  // studentId оставлен для совместимости со старым клиентом.
  res.status(201).json({ deckId, studentId: allowed[0], studentIds: allowed });
});

// ── DELETE /flashcards/decks/:id/assign/:studentId (отозвать колоду) ──────────
router.delete("/flashcards/decks/:id/assign/:studentId", requireAuth, async (req, res) => {
  const user = getUser(req);
  if (!isTeacher(user.role) && user.role !== "admin") {
    res.status(403).json({ error: "Только учитель или администратор может управлять назначениями колод" });
    return;
  }
  const deckId = Number(req.params["id"]);
  const studentId = Number(req.params["studentId"]);
  const chk = await assertOwnDeck(deckId, user.userId);
  if (!chk.ok) { res.status(chk.status!).json({ error: chk.error }); return; }
  await db.delete(deckAssignmentsTable)
    .where(and(eq(deckAssignmentsTable.deckId, deckId), eq(deckAssignmentsTable.studentId, studentId)));
  res.status(204).end();
});

// ── GET /flashcards/decks/:id/assignees (кому назначена колода) ─────────────
router.get("/flashcards/decks/:id/assignees", requireAuth, async (req, res) => {
  const user = getUser(req);
  if (!isTeacher(user.role) && user.role !== "admin") {
    res.status(403).json({ error: "Только учитель или администратор может управлять назначениями колод" });
    return;
  }
  const deckId = Number(req.params["id"]);
  const chk = await assertOwnDeck(deckId, user.userId);
  if (!chk.ok) { res.status(chk.status!).json({ error: chk.error }); return; }
  const rows = await db.select({ studentId: deckAssignmentsTable.studentId }).from(deckAssignmentsTable)
    .where(eq(deckAssignmentsTable.deckId, deckId));
  res.json(rows.map((r) => r.studentId));
});

// ── GET /flashcards/assignments?studentId=N (какие колоды уже у ученика) ────
// Раньше клиент спрашивал assignees по каждой колоде отдельно — открытие окна
// «Отправить колоду» стоило N+1 запросов.
router.get("/flashcards/assignments", requireAuth, async (req, res) => {
  const user = getUser(req);
  const studentId = Number(req.query["studentId"]);
  if (!Number.isInteger(studentId)) { res.status(400).json({ error: "studentId required" }); return; }
  if (!(await canViewStudent(user, studentId))) {
    res.status(403).json({ error: "Нет доступа к этому ученику" });
    return;
  }
  const rows = await db.select({ deckId: deckAssignmentsTable.deckId }).from(deckAssignmentsTable)
    .where(eq(deckAssignmentsTable.studentId, studentId));
  res.json(rows.map((r) => r.deckId));
});

// ── POST /flashcards/decks/:id/words (добавить слово в свою колоду) ──────────
router.post("/flashcards/decks/:id/words", requireAuth, async (req, res) => {
  const user = getUser(req);
  const deckId = Number(req.params["id"]);
  const chk = await assertOwnDeck(deckId, user.userId);
  if (!chk.ok) { res.status(chk.status!).json({ error: chk.error }); return; }

  const b = req.body as { english?: string; russian?: string; translationsRu?: string[]; ipa?: string; exampleEn?: string; exampleRu?: string; partOfSpeech?: string; cefrLevel?: string; emoji?: string };

  // Поддерживаем два режима ввода: английское слово (как раньше) и русское слово
  // (система сама переводит на английский и подтягивает транскрипцию).
  const hasEnglish = !!b.english && typeof b.english === "string" && b.english.trim().length > 0;
  const hasRussian = !!b.russian && typeof b.russian === "string" && b.russian.trim().length > 0;

  if (!hasEnglish && !hasRussian) {
    res.status(400).json({ error: "Введите английское или русское слово." });
    return;
  }

  let english: string;
  let ru: string[];
  let autoIpa: string | undefined;

  if (!hasEnglish && hasRussian) {
    // ── Путь «русское слово» ─────────────────────────────────────────────
    const ruNorm = normalizeRussianInput(b.russian!);
    if (!ruNorm || ruNorm.length > RUSSIAN_MAX_LEN || !RUSSIAN_INPUT_RE.test(ruNorm)) {
      res.status(400).json({ error: "Введите русское слово кириллицей (не более 80 символов)." });
      return;
    }
    const resolved = await resolveEnglishFromRussian(ruNorm);
    if (!resolved.ok) {
      res.status(400).json({ error: resolved.error });
      return;
    }
    english = resolved.english;
    autoIpa = resolved.ipa;
    ru = Array.isArray(b.translationsRu) && b.translationsRu.length > 0
      ? b.translationsRu.map((item) => String(item).trim()).filter(Boolean)
      : resolved.translationsRu;
  } else {
    // ── Путь «английское слово» (существующая логика) ────────────────────
    english = normalizeEnglishInput(b.english!);
    if (english.length > ENGLISH_MAX_LEN || !ENGLISH_INPUT_RE.test(english)) {
      res.status(400).json({ error: "Введите английское слово или короткую фразу только латинскими буквами." });
      return;
    }

    const manualRu = Array.isArray(b.translationsRu)
      ? b.translationsRu.map((item) => String(item).trim()).filter(Boolean)
      : [];

    // Словарь и Google Translate — внешние сервисы, и с хостинга они бывают
    // недоступны. Раньше любая их осечка возвращала 503 и слово не сохранялось,
    // даже когда учитель сам ввёл перевод. Теперь при своём переводе внешние
    // сервисы только подсказывают транскрипцию, а решение добавить слово — за
    // учителем: имена, фразы и термины словарь всё равно не знает.
    const checked = await validateEnglishWord(english);
    if (!checked.ok && manualRu.length === 0) {
      const status = checked.code === "unavailable" ? 503 : checked.code === "not-found" ? 422 : 400;
      res.status(status).json({ error: validationErrorMessage(english || b.english!.trim(), checked) });
      return;
    }

    english = checked.ok ? (checked.normalized ?? english) : english;
    ru = manualRu;
    if (ru.length === 0) {
      const translated = await translateWithGoogle(english);
      if (!translated) {
        res.status(422).json({ error: "Не удалось получить перевод автоматически. Впишите перевод вручную — так слово добавится наверняка." });
        return;
      }
      ru = [translated];
    }
    autoIpa = undefined;
  }

  // Одно и то же слово дважды в колоде только мешает учить.
  const [dup] = await db.select({ id: wordsTable.id }).from(wordsTable)
    .where(and(eq(wordsTable.deckId, deckId), sql`lower(${wordsTable.english}) = ${english.toLowerCase()}`));
  if (dup) { res.status(409).json({ error: `Слово «${english}» уже есть в этой колоде.` }); return; }

  const { exampleEn, exampleRu, partOfSpeech, cefrLevel, emoji } = b;
  const ipa = b.ipa || autoIpa;

  const [row] = await db.insert(wordsTable).values({
    deckId, english: english, partOfSpeech: partOfSpeech ?? null,
    translationsRu: ru, ipa: ipa ?? null, exampleEn: exampleEn ?? null, exampleRu: exampleRu ?? null,
    cefrLevel: cefrLevel ?? null, emoji: emoji ?? null,
  }).returning();

  res.status(201).json(clean({
    id: row!.id, deckId: row!.deckId, english: row!.english, partOfSpeech: row!.partOfSpeech ?? undefined,
    translationsRu: row!.translationsRu, ipa: row!.ipa ?? undefined, exampleEn: row!.exampleEn ?? undefined,
    exampleRu: row!.exampleRu ?? undefined, cefrLevel: row!.cefrLevel ?? undefined, audioUrl: row!.audioUrl ?? undefined,
    emoji: row!.emoji ?? undefined,
  }));
});

// ── POST /flashcards/decks/:id/words/bulk (подборка из каталога + свои слова) ─
//
// Одним вызовом кладём в колоду то, что учитель отметил в каталоге (wordIds), и
// то, что дописал руками (words). Отвечаем разбором: added / skipped / failed —
// одно плохое слово не должно рушить всю собранную подборку.
//
// Слова каталога копируются, а не связываются ссылкой: words.deckId NOT NULL, а
// прогресс ученика висит на word_id, поэтому у колоды учителя свой независимый
// набор карточек (подробнее — в lib/deckWords.ts).
router.post("/flashcards/decks/:id/words/bulk", requireAuth, async (req, res) => {
  const user = getUser(req);
  const deckId = Number(req.params["id"]);
  if (!Number.isInteger(deckId) || deckId <= 0) {
    res.status(400).json({ error: "Некорректный номер колоды" });
    return;
  }
  const chk = await assertOwnDeck(deckId, user.userId);
  if (!chk.ok) { res.status(chk.status!).json({ error: chk.error }); return; }

  const b = req.body as {
    wordIds?: unknown;
    words?: Array<{ english?: unknown; translationsRu?: unknown }>;
  };

  const wordIds = Array.isArray(b.wordIds)
    ? [...new Set(b.wordIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
    : [];
  const manual = Array.isArray(b.words) ? b.words.slice(0, MANUAL_WORD_LIMIT) : [];

  if (wordIds.length === 0 && manual.length === 0) {
    res.status(400).json({ error: "Не выбрано ни одного слова." });
    return;
  }
  if (wordIds.length > BULK_WORD_LIMIT) {
    res.status(400).json({ error: `За один раз можно добавить не больше ${BULK_WORD_LIMIT} слов.` });
    return;
  }

  // Слова, уже лежащие в колоде, и текущий порядок — чтобы не плодить дубликаты
  // и дописывать новые слова в конец списка.
  const present = await db.select({ english: wordsTable.english, sortOrder: wordsTable.sortOrder })
    .from(wordsTable).where(eq(wordsTable.deckId, deckId));
  const existing = wordKeySet(present);
  const nextSortOrder = present.reduce((max, w) => Math.max(max, w.sortOrder), -1) + 1;

  const failed: Array<{ english: string; reason: string }> = [];
  let skipped = 0;

  // ── 1. Копии из каталога ────────────────────────────────────────────────
  let catalogRows: WordInsertRow[] = [];
  if (wordIds.length > 0) {
    // Брать можно только из готовых колод и из своих собственных — чужая
    // приватная колода другого учителя источником быть не должна.
    const allowedDecks = await db.select({ id: decksTable.id }).from(decksTable).where(or(
      eq(decksTable.isSystem, true),
      eq(decksTable.ownerId, user.userId),
    ));
    const allowedDeckIds = new Set(allowedDecks.map((d) => d.id));

    const found = await db.select().from(wordsTable).where(inArray(wordsTable.id, wordIds));
    const visible = found.filter((w) => allowedDeckIds.has(w.deckId));
    const { ordered, missingIds } = orderByRequestedIds(visible, wordIds);
    skipped += missingIds.length;

    const planned = planCatalogCopy(deckId, ordered, existing, nextSortOrder);
    catalogRows = planned.rows;
    skipped += planned.skipped;
    for (const row of catalogRows) existing.add(wordKey(row.english));
  }

  // ── 2. Ручной ввод ──────────────────────────────────────────────────────
  const manualRows: WordInsertRow[] = [];
  for (const item of manual) {
    const raw = typeof item?.english === "string" ? item.english : "";
    const english = normalizeEnglishInput(raw);
    if (!english) { failed.push({ english: String(raw).trim(), reason: "Пустое слово." }); continue; }
    if (existing.has(wordKey(english))) { skipped++; continue; }

    let ru = Array.isArray(item.translationsRu)
      ? item.translationsRu.map((t) => String(t).trim()).filter(Boolean)
      : [];

    // Словарь может не знать слово (редкое, составное, имя) — если перевод уже
    // есть от пользователя, это не повод отклонять слово, как и в одиночном
    // добавлении. Отклоняем только формат/недоступность сервиса без перевода.
    const checked = await validateEnglishWord(english);
    if (!checked.ok && ru.length === 0) {
      failed.push({ english, reason: validationErrorMessage(english, checked) });
      continue;
    }
    const finalEnglish = checked.ok ? (checked.normalized ?? english) : english;
    if (existing.has(wordKey(finalEnglish))) { skipped++; continue; }

    if (ru.length === 0) {
      const translated = await translateWithGoogle(finalEnglish);
      if (!translated) {
        failed.push({ english: finalEnglish, reason: "Не удалось получить перевод. Укажите его вручную." });
        continue;
      }
      ru = [translated];
    }

    existing.add(wordKey(finalEnglish));
    manualRows.push({
      deckId, english: finalEnglish, partOfSpeech: null, translationsRu: ru,
      ipa: (checked.ok ? checked.ipa : undefined) ?? null, exampleEn: null, exampleRu: null, cefrLevel: null, emoji: null,
      sortOrder: nextSortOrder + catalogRows.length + manualRows.length,
    });
  }

  // ── 3. Вставка партиями ─────────────────────────────────────────────────
  const toInsert = [...catalogRows, ...manualRows];
  let added = 0;
  for (const chunk of chunked(toInsert)) {
    if (chunk.length === 0) continue;
    await db.insert(wordsTable).values(chunk);
    added += chunk.length;
  }

  res.status(added > 0 ? 201 : 200).json({ added, skipped, failed });
});

// Строка вида «word — перевод» из массового добавления. Разделителем считаем
// табуляцию, тире или «=»/«:»; дефис внутри слова (well-being) не разделитель,
// поэтому он должен быть окружён пробелами.
function splitWordLine(line: string): { english: string; ru: string[] } | null {
  const m = line.match(/^(.*?)(?:\t+|\s*[\u2014\u2013]\s*|\s+[-=:]\s+|\s*[=:]\s*)(.*)$/);
  if (!m) return null;
  const english = normalizeEnglishInput(m[1] ?? "");
  const ru = (m[2] ?? "").split(/[;,/]/).map((s) => s.trim()).filter(Boolean);
  if (!english || ru.length === 0) return null;
  return { english, ru };
}

// ── DELETE /flashcards/decks/:id/words/:wordId (убрать слово из своей колоды) ─
// Учитель ошибся при наборе — без удаления колоду пришлось бы пересоздавать.
router.delete("/flashcards/decks/:id/words/:wordId", requireAuth, async (req, res) => {
  const user = getUser(req);
  const deckId = Number(req.params["id"]);
  const wordId = Number(req.params["wordId"]);
  if (!Number.isInteger(wordId)) { res.status(400).json({ error: "Некорректный номер слова" }); return; }
  const chk = await assertOwnDeck(deckId, user.userId);
  if (!chk.ok) { res.status(chk.status!).json({ error: chk.error }); return; }
  // Каскад в схеме уберёт состояния карточек и журнал повторений по слову.
  const removed = await db.delete(wordsTable)
    .where(and(eq(wordsTable.id, wordId), eq(wordsTable.deckId, deckId))).returning();
  if (removed.length === 0) { res.status(404).json({ error: "Слово не найдено" }); return; }
  res.status(204).end();
});

// ── POST /flashcards/decks/:id/import (CSV/JSON/построчно) ────────────────
router.post("/flashcards/decks/:id/import", requireAuth, async (req, res) => {
  const user = getUser(req);
  const deckId = Number(req.params["id"]);
  const chk = await assertOwnDeck(deckId, user.userId);
  if (!chk.ok) { res.status(chk.status!).json({ error: chk.error }); return; }

  const { format, content } = req.body as { format: "csv" | "json" | "lines"; content: string };
  if (!content) { res.status(400).json({ error: "content required" }); return; }

  type Row = { english: string; ru: string[]; ipa?: string; exEn?: string; exRu?: string; pos?: string; cefr?: string; russian?: string };
  const rows: Row[] = [];
  try {
    if (format === "json") {
      const arr = JSON.parse(content);
      for (const it of Array.isArray(arr) ? arr : []) {
        const english = String(it.english ?? it.en ?? "").trim();
        if (!english) continue;
        const ruRaw = it.translationsRu ?? it.ru ?? it.translation ?? "";
        const ru = Array.isArray(ruRaw) ? ruRaw.map(String) : String(ruRaw).split(/[;,/]/).map((s) => s.trim()).filter(Boolean);
        rows.push({ english, ru, ipa: it.ipa, exEn: it.exampleEn ?? it.exEn, exRu: it.exampleRu ?? it.exRu, pos: it.partOfSpeech ?? it.pos, cefr: it.cefrLevel ?? it.cefr });
      }
    } else if (format === "lines") {
      // Построчно: «hello — привет». Самый быстрый способ набить колоду руками.
      // Строку без перевода не выбрасываем — перевод попробуем получить ниже.
      for (const line of content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
        const parsed = splitWordLine(line);
        if (parsed) { rows.push({ english: parsed.english, ru: parsed.ru }); continue; }
        // Строка целиком кириллицей — обрабатываем как русское слово
        if (/^[А-Яа-яЁё]/.test(line)) {
          const ruNorm = normalizeRussianInput(line);
          if (ruNorm && RUSSIAN_INPUT_RE.test(ruNorm) && ruNorm.length <= RUSSIAN_MAX_LEN) {
            rows.push({ english: "", ru: [], russian: ruNorm });
            continue;
          }
        }
        const english = normalizeEnglishInput(line);
        if (english && ENGLISH_INPUT_RE.test(english)) rows.push({ english, ru: [] });
      }
    } else {
      // CSV: english,translation[,ipa,exampleEn,exampleRu]  (перевод(ы) через ; или |)
      const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      let start = 0;
      if (lines[0] && /english/i.test(lines[0]) && /translat|перевод|ru/i.test(lines[0])) start = 1; // пропустить заголовок
      for (let i = start; i < lines.length; i++) {
        const cols = lines[i]!.split(/[,\t]/).map((c) => c.trim());
        const english = (cols[0] ?? "").trim();
        if (!english) continue;
        const ru = (cols[1] ?? "").split(/[;|]/).map((s) => s.trim()).filter(Boolean);
        rows.push({ english, ru, ipa: cols[2], exEn: cols[3], exRu: cols[4] });
      }
    }
  } catch {
    res.status(400).json({ error: "Не удалось разобрать данные импорта" });
    return;
  }

  // Строки с русским словом: разрешаем в английское (каталог → Google Translate + словарь).
  // Ошибочные строки записываем в failed без прерывания импорта.
  const russianRows = rows.filter((r) => r.russian && !r.english);
  for (let i = 0; i < russianRows.length; i += 3) {
    await Promise.all(russianRows.slice(i, i + 3).map(async (r) => {
      const resolved = await resolveEnglishFromRussian(r.russian!);
      if (resolved.ok) {
        r.english = resolved.english;
        if (!r.ru.length) r.ru = resolved.translationsRu;
        if (resolved.ipa) r.ipa = resolved.ipa;
      }
      // Если не удалось — строка останется с english="" и выпадет в пропущенные
    }));
  }

  // Строки без перевода дополняем автопереводом, но не блокируем весь импорт,
  // если Google Translate недоступен: такие строки просто попадут в пропущенные.
  const needTranslation = rows.filter((r) => r.ru.length === 0).slice(0, 40);
  for (let i = 0; i < needTranslation.length; i += 5) {
    await Promise.all(needTranslation.slice(i, i + 5).map(async (r) => {
      const translated = await translateWithGoogle(r.english);
      if (translated) r.ru = [translated];
    }));
  }

  // не дублируем существующие слова
  const present = await db.select({ english: wordsTable.english }).from(wordsTable).where(eq(wordsTable.deckId, deckId));
  const have = new Set(present.map((w) => w.english.toLowerCase()));

  const toInsert = rows
    .filter((r) => r.english && r.ru.length > 0 && !have.has(r.english.toLowerCase()))
    .map((r) => ({
      deckId, english: r.english, partOfSpeech: r.pos ?? null, translationsRu: r.ru,
      ipa: r.ipa ?? null, exampleEn: r.exEn ?? null, exampleRu: r.exRu ?? null, cefrLevel: r.cefr ?? null,
    }));

  let added = 0;
  for (let j = 0; j < toInsert.length; j += 100) {
    const chunk = toInsert.slice(j, j + 100);
    if (chunk.length) { await db.insert(wordsTable).values(chunk); added += chunk.length; }
  }
  // Возвращаем и сами пропущенные слова: учителю важно понять, что не попало
  // в колоду (дубликат или не удалось перевести), а не только их количество.
  const insertedSet = new Set(toInsert.map((r) => r.english.toLowerCase()));
  const skippedWords = rows
    .filter((r) => !insertedSet.has(r.english.toLowerCase()))
    .map((r) => r.english)
    .slice(0, 30);
  res.json({ added, skipped: rows.length - added, skippedWords });
});

export default router;
