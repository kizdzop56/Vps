// Флеш-карточки: колоды, изучение с интервальным повторением, placement-тест,
// статистика, свои колоды и импорт. Данные офлайн (сид), озвучка — на клиенте
// (Web Speech API). Для пользовательских слов перевод получаем через Google Translate.
import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  decksTable,
  wordsTable,
  userCardStateTable,
  placementResultsTable,
  flashcardSettingsTable,
  reviewLogTable,
  deckAssignmentsTable,
  teacherStudentsTable,
  parentChildrenTable,
} from "@workspace/db";
import { eq, and, or, isNull, inArray, lte, gte, sql } from "drizzle-orm";
import { requireAuth, getUser, isTeacher } from "../lib/auth";

const router = Router();

// Может ли `viewer` смотреть данные ученика `studentId`: сам ученик, админ,
// связанный учитель (accepted) или родитель ребёнка. Используется для чужой
// статистики слов и назначения колод.
async function canViewStudent(viewer: { userId: number; role: string }, studentId: number): Promise<boolean> {
  if (viewer.userId === studentId) return true;
  if (viewer.role === "admin") return true;
  if (isTeacher(viewer.role)) {
    const [ts] = await db.select({ id: teacherStudentsTable.id }).from(teacherStudentsTable).where(and(
      eq(teacherStudentsTable.teacherId, viewer.userId),
      eq(teacherStudentsTable.studentId, studentId),
      eq(teacherStudentsTable.status, "accepted"),
    ));
    if (ts) return true;
  }
  if (viewer.role === "parent") {
    const [pc] = await db.select({ id: parentChildrenTable.id }).from(parentChildrenTable).where(and(
      eq(parentChildrenTable.parentId, viewer.userId),
      eq(parentChildrenTable.studentId, studentId),
    ));
    if (pc) return true;
  }
  return false;
}

// ── Интервальное повторение ────────────────────────────────────────
// Интервал (в минутах) до следующего показа по уровню запоминания 0–5.
const INTERVAL_MIN: Record<number, number> = {
  0: 1,        // только что не знал → повтор почти сразу
  1: 30,       // ~30 минут
  2: 720,      // 12 часов
  3: 2880,     // 2 дня
  4: 10080,    // 1 неделя
  5: 43200,    // 1 месяц
};
const LEARNED_LEVEL = 4; // с этого уровня слово считаем «выученным»

function nextState(level: number, result: "know" | "dont"): { level: number; dueAt: Date } {
  let newLevel: number;
  if (result === "know") newLevel = Math.min(5, level + 1);
  else newLevel = Math.max(0, level - 2);
  const mins = result === "dont" ? 2 : (INTERVAL_MIN[newLevel] ?? 1);
  return { level: newLevel, dueAt: new Date(Date.now() + mins * 60_000) };
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// убрать null/undefined-поля, чтобы ответ соответствовал zod-схеме (optional)
function clean<T extends Record<string, any>>(o: T): T {
  const out: any = {};
  for (const k of Object.keys(o)) if (o[k] !== null && o[k] !== undefined) out[k] = o[k];
  return out;
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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
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
  if (!normalized || normalized.length > 80 || !/^[A-Za-z]+(?:[ A-Za-z'-]*[A-Za-z])?$/.test(normalized)) {
    return { ok: false, code: "invalid-format" };
  }

  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalized)}`
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

async function translateWithGoogle(english: string): Promise<string | null> {
  try {
    const apiKey = process.env["GOOGLE_TRANSLATE_API_KEY"]?.trim();

    if (apiKey) {
      // Официальный Cloud Translation Basic API v2.
      const url = new URL("https://translation.googleapis.com/language/translate/v2");
      url.searchParams.set("key", apiKey);
      url.searchParams.set("q", english);
      url.searchParams.set("source", "en");
      url.searchParams.set("target", "ru");
      url.searchParams.set("format", "text");
      const response = await fetch(url, { method: "POST" });
      if (!response.ok) return null;
      const data = await response.json() as { data?: { translations?: Array<{ translatedText?: unknown }> } };
      const translated = data.data?.translations?.[0]?.translatedText;
      return typeof translated === "string" && translated.trim() ? decodeHtmlEntities(translated).trim() : null;
    }

    // Совместимый резервный путь: позволяет карточкам работать до настройки API-ключа.
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", "en");
    url.searchParams.set("tl", "ru");
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", english);
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json() as unknown;
    const segments = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
    const translated = segments
      .map((segment) => Array.isArray(segment) && typeof segment[0] === "string" ? segment[0] : "")
      .join("")
      .trim();
    return translated ? decodeHtmlEntities(translated) : null;
  } catch {
    return null;
  }
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

function scoreToCefr(score: number): { level: string; message: string } {
  // Пороги пропорциональны общему числу вопросов (сейчас 15).
  if (score <= 2) return { level: "A1", message: "Начальный уровень — начинаем с основ." };
  if (score <= 6) return { level: "A2", message: "Базовые знания — уверенное начало." };
  if (score <= 9) return { level: "B1", message: "Средний уровень — хорошая база." };
  if (score <= 12) return { level: "B2", message: "Уверенный уровень — свободнее в общении." };
  if (score <= 14) return { level: "C1", message: "Продвинутый уровень." };
  return { level: "C2", message: "Уровень, близкий к носителю." };
}

// порядок уровней для подбора слов по уровню пользователя (и чуть выше)
const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];
function levelsUpTo(level: string | null | undefined): string[] {
  const idx = level ? CEFR_ORDER.indexOf(level) : 1; // по умолчанию до A2
  const top = Math.max(1, idx) + 1; // уровень пользователя и на один выше
  return CEFR_ORDER.slice(0, Math.min(CEFR_ORDER.length, top + 1));
}

// ── Настройки (создаём строку при первом обращении) ─────────────────────
async function ensureSettings(userId: number) {
  const [existing] = await db.select().from(flashcardSettingsTable).where(eq(flashcardSettingsTable.userId, userId));
  if (existing) return existing;
  const [row] = await db.insert(flashcardSettingsTable).values({ userId }).onConflictDoNothing().returning();
  if (row) return row;
  const [again] = await db.select().from(flashcardSettingsTable).where(eq(flashcardSettingsTable.userId, userId));
  return again!;
}

// ── GET /flashcards/settings ───────────────────────────────────────────
router.get("/flashcards/settings", requireAuth, async (req, res) => {
  const user = getUser(req);
  const s = await ensureSettings(user.userId);
  res.json(clean({ dailyNewLimit: s.dailyNewLimit, placementLevel: s.placementLevel, placementDone: s.placementDone }));
});

// ── PATCH /flashcards/settings ────────────────────────────────────────
router.patch("/flashcards/settings", requireAuth, async (req, res) => {
  const user = getUser(req);
  await ensureSettings(user.userId);
  const { dailyNewLimit } = req.body as { dailyNewLimit?: number };
  const set: any = { updatedAt: new Date() };
  if (typeof dailyNewLimit === "number" && dailyNewLimit >= 1 && dailyNewLimit <= 100) set.dailyNewLimit = dailyNewLimit;
  await db.update(flashcardSettingsTable).set(set).where(eq(flashcardSettingsTable.userId, user.userId));
  const s = await ensureSettings(user.userId);
  res.json(clean({ dailyNewLimit: s.dailyNewLimit, placementLevel: s.placementLevel, placementDone: s.placementDone }));
});

// ── GET /flashcards/placement ────────────────────────────────────────
router.get("/flashcards/placement", requireAuth, async (_req, res) => {
  res.json({
    total: PLACEMENT_QUESTIONS.length,
    questions: PLACEMENT_QUESTIONS.map((q) => ({ id: q.id, section: q.section, question: q.question, options: q.options })),
  });
});

// ── POST /flashcards/placement ──────────────────────────────────────
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

  await db.insert(placementResultsTable).values({
    userId: user.userId,
    score,
    total: PLACEMENT_QUESTIONS.length,
    cefrLevel: level,
    answers: PLACEMENT_QUESTIONS.map((q) => byId.get(q.id) ?? -1),
  });
  await ensureSettings(user.userId);
  await db.update(flashcardSettingsTable)
    .set({ placementLevel: level, placementDone: true, updatedAt: new Date() })
    .where(eq(flashcardSettingsTable.userId, user.userId));

  res.json({ score, total: PLACEMENT_QUESTIONS.length, cefrLevel: level, message });
});

// ── GET /flashcards/decks ────────────────────────────────────────────
router.get("/flashcards/decks", requireAuth, async (req, res) => {
  const user = getUser(req);

  // Колоды, назначенные этому пользователю учителем (отправленные ученику).
  const myAssignments = await db.select().from(deckAssignmentsTable)
    .where(eq(deckAssignmentsTable.studentId, user.userId));
  const assignedDeckIds = new Set(myAssignments.map((a) => a.deckId));

  // Системные + собственные + назначенные пользователю.
  const decks = await db.select().from(decksTable).where(or(
    isNull(decksTable.ownerId),
    eq(decksTable.ownerId, user.userId),
    assignedDeckIds.size > 0 ? inArray(decksTable.id, [...assignedDeckIds]) : sql`false`,
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

  const allWords = await db.select({ id: wordsTable.id, deckId: wordsTable.deckId }).from(wordsTable);
  const wordCountByDeck = new Map<number, number>();
  const wordToDeck = new Map<number, number>();
  for (const w of allWords) {
    wordCountByDeck.set(w.deckId, (wordCountByDeck.get(w.deckId) ?? 0) + 1);
    wordToDeck.set(w.id, w.deckId);
  }

  const states = await db.select().from(userCardStateTable).where(eq(userCardStateTable.userId, user.userId));
  const now = Date.now();
  const learnedByDeck = new Map<number, number>();
  const dueByDeck = new Map<number, number>();
  const introducedByDeck = new Map<number, number>();
  for (const st of states) {
    const dk = wordToDeck.get(st.wordId);
    if (dk === undefined) continue;
    introducedByDeck.set(dk, (introducedByDeck.get(dk) ?? 0) + 1);
    if (st.memoryLevel >= LEARNED_LEVEL) learnedByDeck.set(dk, (learnedByDeck.get(dk) ?? 0) + 1);
    if (st.dueAt.getTime() <= now) dueByDeck.set(dk, (dueByDeck.get(dk) ?? 0) + 1);
  }

  const result = decks
    .map((d) => {
      const wordCount = wordCountByDeck.get(d.id) ?? 0;
      const introduced = introducedByDeck.get(d.id) ?? 0;
      return clean({
        id: d.id,
        ownerId: d.ownerId ?? undefined,
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
      });
    })
    .sort((a, b) => Number(b.isSystem) - Number(a.isSystem));

  res.json(result);
});

// ── GET /flashcards/decks/:id/words ────────────────────────────────────
router.get("/flashcards/decks/:id/words", requireAuth, async (req, res) => {
  const deckId = Number(req.params["id"]);
  const words = await db.select().from(wordsTable).where(eq(wordsTable.deckId, deckId));
  res.json(words.map((w) => clean({
    id: w.id, deckId: w.deckId, english: w.english, partOfSpeech: w.partOfSpeech ?? undefined,
    translationsRu: w.translationsRu, ipa: w.ipa ?? undefined, exampleEn: w.exampleEn ?? undefined,
    exampleRu: w.exampleRu ?? undefined, cefrLevel: w.cefrLevel ?? undefined, audioUrl: w.audioUrl ?? undefined,
  })));
});

// ── POST /flashcards/decks (своя колода) ───────────────────────────────
router.post("/flashcards/decks", requireAuth, async (req, res) => {
  const user = getUser(req);
  const { title, theme, emoji, description } = req.body as { title: string; theme?: string; emoji?: string; description?: string };
  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title required" });
    return;
  }
  const [row] = await db.insert(decksTable).values({
    ownerId: user.userId, title: title.trim(), theme: theme ?? "custom",
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
  const deckId = Number(req.params["id"]);
  const { studentId } = req.body as { studentId?: number };
  if (!studentId || typeof studentId !== "number") { res.status(400).json({ error: "studentId required" }); return; }

  // Назначать может только владелец своей (не системной) колоды.
  const chk = await assertOwnDeck(deckId, user.userId);
  if (!chk.ok) { res.status(chk.status!).json({ error: chk.error }); return; }

  // И только своему ученику (связь teacher↔student, accepted) — или админ.
  const allowed = await canViewStudent(user, studentId);
  if (!allowed) { res.status(403).json({ error: "Можно отправлять колоды только своим ученикам" }); return; }

  await db.insert(deckAssignmentsTable)
    .values({ deckId, studentId, assignedBy: user.userId })
    .onConflictDoNothing();
  res.status(201).json({ deckId, studentId });
});

// ── DELETE /flashcards/decks/:id/assign/:studentId (отозвать колоду) ──────────
router.delete("/flashcards/decks/:id/assign/:studentId", requireAuth, async (req, res) => {
  const user = getUser(req);
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
  const deckId = Number(req.params["id"]);
  const chk = await assertOwnDeck(deckId, user.userId);
  if (!chk.ok) { res.status(chk.status!).json({ error: chk.error }); return; }
  const rows = await db.select({ studentId: deckAssignmentsTable.studentId }).from(deckAssignmentsTable)
    .where(eq(deckAssignmentsTable.deckId, deckId));
  res.json(rows.map((r) => r.studentId));
});

// ── PUT /flashcards/decks/:id/assignees (назначить колоду сразу нескольким) ───
// Раньше учитель мог выдать колоду только по одному ученику из его карточки:
// на группу из десяти человек это десять переходов и десять запросов. Здесь
// присылается итоговый список — сервер сам добавит новых и снимет лишних.
router.put("/flashcards/decks/:id/assignees", requireAuth, async (req, res) => {
  const user = getUser(req);
  const deckId = Number(req.params["id"]);
  const { studentIds } = req.body as { studentIds?: unknown };

  if (!Array.isArray(studentIds) || studentIds.some((id) => typeof id !== "number" || !Number.isFinite(id))) {
    res.status(400).json({ error: "studentIds must be an array of numbers" }); return;
  }

  const chk = await assertOwnDeck(deckId, user.userId);
  if (!chk.ok) { res.status(chk.status!).json({ error: chk.error }); return; }

  const wanted = [...new Set(studentIds as number[])];

  // Проверяем всех разом: если хоть один не свой ученик — не применяем ничего,
  // иначе учитель увидит половину сохранённого списка и не поймёт, что не так.
  const checks = await Promise.all(wanted.map(async (id) => ({ id, ok: await canViewStudent(user, id) })));
  const forbidden = checks.filter((c) => !c.ok).map((c) => c.id);
  if (forbidden.length > 0) {
    res.status(403).json({ error: "Можно отправлять колоды только своим ученикам", studentIds: forbidden }); return;
  }

  const current = await db.select({ studentId: deckAssignmentsTable.studentId })
    .from(deckAssignmentsTable).where(eq(deckAssignmentsTable.deckId, deckId));
  const currentSet = new Set(current.map((r) => r.studentId));
  const wantedSet = new Set(wanted);

  const toAdd = wanted.filter((id) => !currentSet.has(id));
  const toRemove = [...currentSet].filter((id) => !wantedSet.has(id));

  if (toAdd.length > 0) {
    await db.insert(deckAssignmentsTable)
      .values(toAdd.map((studentId) => ({ deckId, studentId, assignedBy: user.userId })))
      .onConflictDoNothing();
  }
  if (toRemove.length > 0) {
    await db.delete(deckAssignmentsTable).where(and(
      eq(deckAssignmentsTable.deckId, deckId),
      inArray(deckAssignmentsTable.studentId, toRemove),
    ));
  }

  res.json({ deckId, studentIds: wanted, added: toAdd.length, removed: toRemove.length });
});

// проверка, что колода принадлежит пользователю и не системная
async function assertOwnDeck(deckId: number, userId: number): Promise<{ ok: boolean; status?: number; error?: string }> {
  const [deck] = await db.select().from(decksTable).where(eq(decksTable.id, deckId));
  if (!deck) return { ok: false, status: 404, error: "Deck not found" };
  if (deck.isSystem || deck.ownerId !== userId) return { ok: false, status: 403, error: "Готовые колоды нельзя редактировать" };
  return { ok: true };
}

// ── POST /flashcards/decks/:id/words (добавить слово в свою колоду) ──────────
router.post("/flashcards/decks/:id/words", requireAuth, async (req, res) => {
  const user = getUser(req);
  const deckId = Number(req.params["id"]);
  const chk = await assertOwnDeck(deckId, user.userId);
  if (!chk.ok) { res.status(chk.status!).json({ error: chk.error }); return; }

  const b = req.body as { english: string; translationsRu?: string[]; ipa?: string; exampleEn?: string; exampleRu?: string; partOfSpeech?: string; cefrLevel?: string };
  if (!b.english || typeof b.english !== "string") { res.status(400).json({ error: "Введите английское слово." }); return; }

  const english = normalizeEnglishInput(b.english);
  const checked = await validateEnglishWord(english);
  if (!checked.ok) {
    const status = checked.code === "unavailable" ? 503 : checked.code === "not-found" ? 422 : 400;
    res.status(status).json({ error: validationErrorMessage(english || b.english.trim(), checked) });
    return;
  }

  let ru = Array.isArray(b.translationsRu)
    ? b.translationsRu.map((item) => String(item).trim()).filter(Boolean)
    : [];
  let { ipa, exampleEn, exampleRu, partOfSpeech, cefrLevel } = b;

  if (ru.length === 0) {
    const translated = await translateWithGoogle(checked.normalized);
    if (!translated) {
      res.status(503).json({ error: "Не удалось получить перевод через Google Translate. Попробуйте ещё раз или укажите перевод вручную." });
      return;
    }
    ru = [translated];
  }
  ipa = ipa || checked.ipa;

  const [row] = await db.insert(wordsTable).values({
    deckId, english: checked.normalized, partOfSpeech: partOfSpeech ?? null,
    translationsRu: ru, ipa: ipa ?? null, exampleEn: exampleEn ?? null, exampleRu: exampleRu ?? null,
    cefrLevel: cefrLevel ?? null,
  }).returning();

  res.status(201).json(clean({
    id: row!.id, deckId: row!.deckId, english: row!.english, partOfSpeech: row!.partOfSpeech ?? undefined,
    translationsRu: row!.translationsRu, ipa: row!.ipa ?? undefined, exampleEn: row!.exampleEn ?? undefined,
    exampleRu: row!.exampleRu ?? undefined, cefrLevel: row!.cefrLevel ?? undefined, audioUrl: row!.audioUrl ?? undefined,
  }));
});

// ── POST /flashcards/decks/:id/import (CSV/JSON) ──────────────────────────
router.post("/flashcards/decks/:id/import", requireAuth, async (req, res) => {
  const user = getUser(req);
  const deckId = Number(req.params["id"]);
  const chk = await assertOwnDeck(deckId, user.userId);
  if (!chk.ok) { res.status(chk.status!).json({ error: chk.error }); return; }

  const { format, content } = req.body as { format: "csv" | "json"; content: string };
  if (!content) { res.status(400).json({ error: "content required" }); return; }

  type Row = { english: string; ru: string[]; ipa?: string; exEn?: string; exRu?: string; pos?: string; cefr?: string };
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
  } catch (e) {
    res.status(400).json({ error: "Не удалось разобрать данные импорта" });
    return;
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
  res.json({ added, skipped: rows.length - added });
});

// ── GET /flashcards/study/:deckId ────────────────────────────────────
router.get("/flashcards/study/:deckId", requireAuth, async (req, res) => {
  const user = getUser(req);
  const deckId = Number(req.params["deckId"]);
  const [deck] = await db.select().from(decksTable).where(eq(decksTable.id, deckId));
  if (!deck) { res.status(404).json({ error: "Deck not found" }); return; }

  const settings = await ensureSettings(user.userId);
  const words = await db.select().from(wordsTable).where(eq(wordsTable.deckId, deckId));
  const states = await db.select().from(userCardStateTable).where(eq(userCardStateTable.userId, user.userId));
  const stateByWord = new Map(states.map((s) => [s.wordId, s]));

  // сколько новых слов уже введено сегодня В ЭТОЙ КОЛОДЕ — дневная норма
  // считается отдельно для каждой колоды (не глобально), чтобы лимит одной
  // колоды не блокировал изучение новых слов в других.
  const today = startOfToday().getTime();
  const deckWordIds = new Set(words.map((w) => w.id));
  const introducedToday = states.filter(
    (s) => s.createdAt.getTime() >= today && deckWordIds.has(s.wordId),
  ).length;
  const remainingNew = Math.max(0, settings.dailyNewLimit - introducedToday);

  const now = Date.now();
  const dueCards: any[] = [];
  const newCards: any[] = [];
  for (const w of words) {
    const st = stateByWord.get(w.id);
    const base = {
      id: w.id, deckId: w.deckId, english: w.english, partOfSpeech: w.partOfSpeech ?? undefined,
      translationsRu: w.translationsRu, ipa: w.ipa ?? undefined, exampleEn: w.exampleEn ?? undefined,
      exampleRu: w.exampleRu ?? undefined, cefrLevel: w.cefrLevel ?? undefined,
    };
    if (st) {
      if (st.dueAt.getTime() <= now) dueCards.push(clean({ ...base, memoryLevel: st.memoryLevel, introduced: true, isNew: false }));
    } else {
      newCards.push(clean({ ...base, memoryLevel: 0, introduced: false, isNew: true }));
    }
  }

  const introducedInDeck = words.filter((w) => stateByWord.has(w.id)).length;
  const needsIntro = deck.isSystem && introducedInDeck === 0;

  const limitedNew = newCards.slice(0, remainingNew);
  const cards = [...dueCards, ...limitedNew];

  res.json(clean({
    deckId, deckTitle: deck.title, isSystem: deck.isSystem, needsIntro,
    newCount: limitedNew.length, reviewCount: dueCards.length, cards,
  }));
});

// ── POST /flashcards/review ────────────────────────────────────────
router.post("/flashcards/review", requireAuth, async (req, res) => {
  const user = getUser(req);
  const { wordId, result } = req.body as { wordId: number; result: "know" | "dont" };
  if (!wordId || (result !== "know" && result !== "dont")) {
    res.status(400).json({ error: "wordId and result (know|dont) required" });
    return;
  }
  const [word] = await db.select({ id: wordsTable.id }).from(wordsTable).where(eq(wordsTable.id, wordId));
  if (!word) { res.status(404).json({ error: "Word not found" }); return; }

  const [existing] = await db.select().from(userCardStateTable)
    .where(and(eq(userCardStateTable.userId, user.userId), eq(userCardStateTable.wordId, wordId)));

  const prevLevel = existing?.memoryLevel ?? 0;
  const { level, dueAt } = nextState(prevLevel, result);

  if (existing) {
    await db.update(userCardStateTable).set({
      memoryLevel: level, dueAt, lastResult: result,
      timesSeen: existing.timesSeen + 1,
      timesCorrect: existing.timesCorrect + (result === "know" ? 1 : 0),
      introduced: true, updatedAt: new Date(),
    }).where(eq(userCardStateTable.id, existing.id));
  } else {
    await db.insert(userCardStateTable).values({
      userId: user.userId, wordId, memoryLevel: level, dueAt, introduced: true,
      timesSeen: 1, timesCorrect: result === "know" ? 1 : 0, lastResult: result,
    }).onConflictDoNothing();
  }

  await db.insert(reviewLogTable).values({ userId: user.userId, wordId, result, memoryLevelAfter: level });

  res.json({ wordId, memoryLevel: level, dueAt: dueAt.toISOString() });
});

// ── GET /flashcards/stats ────────────────────────────────────────────
router.get("/flashcards/stats", requireAuth, async (req, res) => {
  const user = getUser(req);

  // По умолчанию — статистика самого пользователя. Учитель/родитель/админ может
  // запросить статистику ученика через ?studentId= (раньше параметр игнорировался,
  // и на профиле ученика показывалась статистика самого смотрящего).
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

  // агрегат по последним 14 дням
  const days: { date: string; learned: number; reviews: number; correct: number }[] = [];
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const byDay = new Map<string, { reviews: number; correct: number; learned: number }>();
  for (const l of logs) {
    const key = fmt(l.reviewedAt);
    const e = byDay.get(key) ?? { reviews: 0, correct: 0, learned: 0 };
    e.reviews++;
    if (l.result === "know") e.correct++;
    if ((l.memoryLevelAfter ?? 0) === LEARNED_LEVEL) e.learned++; // достиг «выучено» в этот день
    byDay.set(key, e);
  }
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = fmt(d);
    const e = byDay.get(key) ?? { reviews: 0, correct: 0, learned: 0 };
    days.push({ date: key, learned: e.learned, reviews: e.reviews, correct: e.correct });
  }

  res.json({ totalLearned, totalWords, totalReviews, accuracy, daily: days, placementLevel });
});

// ── GET /flashcards/marathon ────────────────────────────────────────
// «Марафон слов»: все слова из готовых (системных) колод, соответствующие
// текущему уровню знаний пользователя. Считаем точность ответов именно по этим
// словам; когда пройдены все слова уровня и точность ≥ порога — приложение
// сообщает, что можно перейти на следующий уровень (подтверждается тестом).
const MARATHON_PASS = 75; // порог точности (%) для перехода на новый уровень

router.get("/flashcards/marathon", requireAuth, async (req, res) => {
  const user = getUser(req);
  const settings = await ensureSettings(user.userId);
  const level = settings.placementLevel ?? "A1";
  const idx = CEFR_ORDER.indexOf(level);
  const nextLevel = idx >= 0 && idx < CEFR_ORDER.length - 1 ? CEFR_ORDER[idx + 1] : null;

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
  let correct = 0;
  let answeredWords = 0; // сколько разных слов уровня пользователь уже отвечал
  const cards = words.map((w) => {
    const st = stateByWord.get(w.id);
    if (st) {
      seen += st.timesSeen;
      correct += st.timesCorrect;
      if (st.timesSeen > 0) answeredWords++;
    }
    return clean({
      id: w.id, deckId: w.deckId, english: w.english, partOfSpeech: w.partOfSpeech ?? undefined,
      translationsRu: w.translationsRu, ipa: w.ipa ?? undefined, exampleEn: w.exampleEn ?? undefined,
      exampleRu: w.exampleRu ?? undefined, cefrLevel: w.cefrLevel ?? undefined,
      memoryLevel: st?.memoryLevel ?? 0, introduced: st?.introduced ?? false, isNew: !st,
    });
  });
  // сначала слабо усвоенные слова (низкий уровень памяти) — их важнее подтянуть
  cards.sort((a: any, b: any) => (a.memoryLevel ?? 0) - (b.memoryLevel ?? 0));

  const totalWords = words.length;
  const accuracy = seen > 0 ? Math.round((correct / seen) * 100) : 0;
  const eligible =
    totalWords > 0 && answeredWords >= totalWords && accuracy >= MARATHON_PASS && nextLevel !== null;

  res.json(clean({
    level, nextLevel: nextLevel ?? undefined, totalWords, answeredWords,
    seen, correct, accuracy, threshold: MARATHON_PASS, eligible, cards,
  }));
});

export default router;
