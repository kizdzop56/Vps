// Флеш-карточки: колоды, изучение с интервальным повторением, placement-тест,
// статистика, свои колоды и импорт. Данные офлайн (сид), озвучка — на клиенте
// (Web Speech API). OpenAI используется опционально для автозаполнения своих слов.
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
} from "@workspace/db";
import { eq, and, or, isNull, inArray, lte, gte, sql } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";
import OpenAI from "openai";

const router = Router();

// ── Интервальное повторение ─────────────────────────────────────────────────
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

function getOpenAI(): OpenAI | null {
  const apiKey = process.env["OPENAI_API_KEY"] || process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  const baseURL = process.env["OPENAI_API_BASE"] || process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  if (!apiKey) return null;
  return new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
}

// ── Placement-тест (CEFR). Вопросы адаптированы, ответы держим на сервере. ────
type PQ = { id: number; section: string; question: string; options: string[]; answer: number };
const PLACEMENT_QUESTIONS: PQ[] = [
  { id: 1, section: "Grammar", question: "She ___ a teacher.", options: ["is", "are", "am", "be"], answer: 0 },
  { id: 2, section: "Grammar", question: "They ___ football every weekend.", options: ["play", "plays", "playing", "is play"], answer: 0 },
  { id: 3, section: "Grammar", question: "I ___ to London last year.", options: ["go", "went", "gone", "going"], answer: 1 },
  { id: 4, section: "Grammar", question: "There ___ any milk in the fridge.", options: ["isn't", "aren't", "wasn't", "not"], answer: 0 },
  { id: 5, section: "Grammar", question: "He ___ TV when I called him.", options: ["watched", "was watching", "watches", "watch"], answer: 1 },
  { id: 6, section: "Grammar", question: "If it rains, we ___ at home.", options: ["stay", "will stay", "stayed", "would stay"], answer: 1 },
  { id: 7, section: "Grammar", question: "I have lived here ___ 2010.", options: ["since", "for", "from", "during"], answer: 0 },
  { id: 8, section: "Grammar", question: "This book is ___ than that one.", options: ["interesting", "more interesting", "most interesting", "interestinger"], answer: 1 },
  { id: 9, section: "Grammar", question: "She asked me where I ___.", options: ["live", "lived", "living", "do live"], answer: 1 },
  { id: 10, section: "Grammar", question: "The report ___ by Friday.", options: ["must finish", "must be finished", "must finishing", "finished"], answer: 1 },
  { id: 11, section: "Grammar", question: "He talks as if he ___ everything.", options: ["knows", "knew", "know", "is knowing"], answer: 1 },
  { id: 12, section: "Grammar", question: "___ known earlier, I would have helped.", options: ["If I", "Had I", "Have I", "Should I"], answer: 1 },
  { id: 13, section: "Vocabulary", question: "The opposite of 'cheap' is:", options: ["expensive", "free", "rich", "small"], answer: 0 },
  { id: 14, section: "Vocabulary", question: "I'm looking ___ my keys.", options: ["for", "at", "after", "up"], answer: 0 },
  { id: 15, section: "Vocabulary", question: "Choose the synonym of 'begin':", options: ["finish", "start", "stop", "close"], answer: 1 },
  { id: 16, section: "Vocabulary", question: "We need to ___ a decision soon.", options: ["do", "make", "take", "get"], answer: 1 },
  { id: 17, section: "Vocabulary", question: "She is very ___; she always shares.", options: ["selfish", "generous", "lazy", "rude"], answer: 1 },
  { id: 18, section: "Vocabulary", question: "The weather was ___, so we cancelled the trip.", options: ["terrible", "delicious", "loud", "quiet"], answer: 0 },
  { id: 19, section: "Vocabulary", question: "'To give up' most nearly means:", options: ["to continue", "to stop trying", "to win", "to begin"], answer: 1 },
  { id: 20, section: "Vocabulary", question: "He was ___ for being late again.", options: ["praised", "blamed", "rewarded", "thanked"], answer: 1 },
  { id: 21, section: "Vocabulary", question: "'Ambiguous' most closely means:", options: ["perfectly clear", "open to more than one meaning", "completely wrong", "very technical"], answer: 1 },
  { id: 22, section: "Vocabulary", question: "The evidence was ___ to convince the jury.", options: ["insufficient", "sufficient", "superficial", "artificial"], answer: 1 },
  { id: 23, section: "Vocabulary", question: "'Meticulous' most nearly means:", options: ["careless", "very careful and precise", "extremely fast", "lazy"], answer: 1 },
  { id: 24, section: "Vocabulary", question: "Her ___ attitude made compromise impossible.", options: ["flexible", "cooperative", "intransigent", "friendly"], answer: 2 },
];

function scoreToCefr(score: number): { level: string; message: string } {
  if (score <= 4) return { level: "A1", message: "Начальный уровень — начинаем с основ." };
  if (score <= 9) return { level: "A2", message: "Базовые знания — уверенное начало." };
  if (score <= 14) return { level: "B1", message: "Средний уровень — хорошая база." };
  if (score <= 19) return { level: "B2", message: "Уверенный уровень — свободнее в общении." };
  if (score <= 22) return { level: "C1", message: "Продвинутый уровень." };
  return { level: "C2", message: "Уровень, близкий к носителю." };
}

// порядок уровней для подбора слов по уровню пользователя (и чуть выше)
const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];
function levelsUpTo(level: string | null | undefined): string[] {
  const idx = level ? CEFR_ORDER.indexOf(level) : 1; // по умолчанию до A2
  const top = Math.max(1, idx) + 1; // уровень пользователя и на один выше
  return CEFR_ORDER.slice(0, Math.min(CEFR_ORDER.length, top + 1));
}

// ── Настройки (создаём строку при первом обращении) ─────────────────────────
async function ensureSettings(userId: number) {
  const [existing] = await db.select().from(flashcardSettingsTable).where(eq(flashcardSettingsTable.userId, userId));
  if (existing) return existing;
  const [row] = await db.insert(flashcardSettingsTable).values({ userId }).onConflictDoNothing().returning();
  if (row) return row;
  const [again] = await db.select().from(flashcardSettingsTable).where(eq(flashcardSettingsTable.userId, userId));
  return again!;
}

// ── GET /flashcards/settings ────────────────────────────────────────────────
router.get("/flashcards/settings", requireAuth, async (req, res) => {
  const user = getUser(req);
  const s = await ensureSettings(user.userId);
  res.json(clean({ dailyNewLimit: s.dailyNewLimit, placementLevel: s.placementLevel, placementDone: s.placementDone }));
});

// ── PATCH /flashcards/settings ──────────────────────────────────────────────
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

// ── GET /flashcards/placement ───────────────────────────────────────────────
router.get("/flashcards/placement", requireAuth, async (_req, res) => {
  res.json({
    total: PLACEMENT_QUESTIONS.length,
    questions: PLACEMENT_QUESTIONS.map((q) => ({ id: q.id, section: q.section, question: q.question, options: q.options })),
  });
});

// ── POST /flashcards/placement ──────────────────────────────────────────────
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

// ── GET /flashcards/decks ───────────────────────────────────────────────────
router.get("/flashcards/decks", requireAuth, async (req, res) => {
  const user = getUser(req);

  const decks = await db.select().from(decksTable)
    .where(or(isNull(decksTable.ownerId), eq(decksTable.ownerId, user.userId)));

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
      });
    })
    .sort((a, b) => Number(b.isSystem) - Number(a.isSystem));

  res.json(result);
});

// ── GET /flashcards/decks/:id/words ─────────────────────────────────────────
router.get("/flashcards/decks/:id/words", requireAuth, async (req, res) => {
  const deckId = Number(req.params["id"]);
  const words = await db.select().from(wordsTable).where(eq(wordsTable.deckId, deckId));
  res.json(words.map((w) => clean({
    id: w.id, deckId: w.deckId, english: w.english, partOfSpeech: w.partOfSpeech ?? undefined,
    translationsRu: w.translationsRu, ipa: w.ipa ?? undefined, exampleEn: w.exampleEn ?? undefined,
    exampleRu: w.exampleRu ?? undefined, cefrLevel: w.cefrLevel ?? undefined, audioUrl: w.audioUrl ?? undefined,
  })));
});

// ── POST /flashcards/decks (своя колода) ────────────────────────────────────
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

// проверка, что колода принадлежит пользователю и не системная
async function assertOwnDeck(deckId: number, userId: number): Promise<{ ok: boolean; status?: number; error?: string }> {
  const [deck] = await db.select().from(decksTable).where(eq(decksTable.id, deckId));
  if (!deck) return { ok: false, status: 404, error: "Deck not found" };
  if (deck.isSystem || deck.ownerId !== userId) return { ok: false, status: 403, error: "Готовые колоды нельзя редактировать" };
  return { ok: true };
}

// автозаполнение слова (перевод/IPA/пример) через OpenAI (если доступен)
async function autofillWord(english: string): Promise<Partial<{ ru: string[]; ipa: string; exEn: string; exRu: string; pos: string; cefr: string }>> {
  const client = getOpenAI();
  if (!client) return {};
  try {
    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `For the English word "${english}" return strict JSON with keys: ru (array of 1-3 Russian translations), ipa (IPA transcription with slashes), pos (part of speech), exEn (one simple example sentence), exRu (its Russian translation), cefr (CEFR level A1-C2). JSON only.`,
      }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });
    const txt = r.choices[0]?.message?.content ?? "{}";
    const j = JSON.parse(txt);
    return {
      ru: Array.isArray(j.ru) ? j.ru : (j.ru ? [String(j.ru)] : undefined),
      ipa: j.ipa, exEn: j.exEn, exRu: j.exRu, pos: j.pos, cefr: j.cefr,
    };
  } catch {
    return {};
  }
}

// ── POST /flashcards/decks/:id/words (добавить слово в свою колоду) ──────────
router.post("/flashcards/decks/:id/words", requireAuth, async (req, res) => {
  const user = getUser(req);
  const deckId = Number(req.params["id"]);
  const chk = await assertOwnDeck(deckId, user.userId);
  if (!chk.ok) { res.status(chk.status!).json({ error: chk.error }); return; }

  const b = req.body as { english: string; translationsRu?: string[]; ipa?: string; exampleEn?: string; exampleRu?: string; partOfSpeech?: string; cefrLevel?: string };
  if (!b.english || typeof b.english !== "string") { res.status(400).json({ error: "english required" }); return; }

  let ru = Array.isArray(b.translationsRu) ? b.translationsRu.filter(Boolean) : [];
  let { ipa, exampleEn, exampleRu, partOfSpeech, cefrLevel } = b;

  if (ru.length === 0 || !ipa || !exampleEn) {
    const filled = await autofillWord(b.english.trim());
    if (ru.length === 0 && filled.ru) ru = filled.ru;
    ipa = ipa || filled.ipa;
    exampleEn = exampleEn || filled.exEn;
    exampleRu = exampleRu || filled.exRu;
    partOfSpeech = partOfSpeech || filled.pos;
    cefrLevel = cefrLevel || filled.cefr;
  }
  if (ru.length === 0) {
    res.status(400).json({ error: "Не удалось получить перевод автоматически — укажите перевод вручную (translationsRu)." });
    return;
  }

  const [row] = await db.insert(wordsTable).values({
    deckId, english: b.english.trim(), partOfSpeech: partOfSpeech ?? null,
    translationsRu: ru, ipa: ipa ?? null, exampleEn: exampleEn ?? null, exampleRu: exampleRu ?? null,
    cefrLevel: cefrLevel ?? null,
  }).returning();

  res.status(201).json(clean({
    id: row!.id, deckId: row!.deckId, english: row!.english, partOfSpeech: row!.partOfSpeech ?? undefined,
    translationsRu: row!.translationsRu, ipa: row!.ipa ?? undefined, exampleEn: row!.exampleEn ?? undefined,
    exampleRu: row!.exampleRu ?? undefined, cefrLevel: row!.cefrLevel ?? undefined, audioUrl: row!.audioUrl ?? undefined,
  }));
});

// ── POST /flashcards/decks/:id/import (CSV/JSON) ────────────────────────────
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

// ── GET /flashcards/study/:deckId ───────────────────────────────────────────
router.get("/flashcards/study/:deckId", requireAuth, async (req, res) => {
  const user = getUser(req);
  const deckId = Number(req.params["deckId"]);
  const [deck] = await db.select().from(decksTable).where(eq(decksTable.id, deckId));
  if (!deck) { res.status(404).json({ error: "Deck not found" }); return; }

  const settings = await ensureSettings(user.userId);
  const words = await db.select().from(wordsTable).where(eq(wordsTable.deckId, deckId));
  const states = await db.select().from(userCardStateTable).where(eq(userCardStateTable.userId, user.userId));
  const stateByWord = new Map(states.map((s) => [s.wordId, s]));

  // сколько новых слов уже введено сегодня (глобально) — для дневной нормы
  const today = startOfToday().getTime();
  const introducedToday = states.filter((s) => s.createdAt.getTime() >= today).length;
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

// ── POST /flashcards/review ─────────────────────────────────────────────────
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

// ── GET /flashcards/stats ───────────────────────────────────────────────────
router.get("/flashcards/stats", requireAuth, async (req, res) => {
  const user = getUser(req);
  const states = await db.select().from(userCardStateTable).where(eq(userCardStateTable.userId, user.userId));
  const logs = await db.select().from(reviewLogTable).where(eq(reviewLogTable.userId, user.userId));

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

  res.json({ totalLearned, totalWords, totalReviews, accuracy, daily: days });
});

export default router;
