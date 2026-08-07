// ─────────────────────────────────────────────────────────────────────────────
// Служебные операции над каталогом слов: запуск из браузера.
//
// Страницей, а не скриптом, потому что шелла с доступом к базе на бесплатном
// хостинге нет, а владелец проекта работает с телефона.
//
// ── Что здесь есть ──────────────────────────────────────────────────────────
//
// 1. КОНСТРУКТОР КАРТОЧЕК (/maintenance/phrases) — главное.
//
//    Вводишь слово или конструкцию, получаешь СРАЗУ три вида карточек:
//
//      • значения слова — перевод и пример из одной записи Викисловаря;
//      • фразы с этим словом — предложение и перевод, написанные людьми;
//      • смысл идиомы, если введено устойчивое выражение.
//
//    Отмечаешь нужные, добавляешь в колоду. Раздельных режимов нет намеренно:
//    человек не должен заранее решать, слово он вводит или конструкцию.
//
//    Каждая карточка собрана так, что верна ПО ПОСТРОЕНИЮ — все поля приходят
//    из одного источника (подробно в lib/phraseSource.ts). Именно это снимает
//    боль прошлых заходов: перевод от одного значения с примером от другого
//    больше не встречается.
//
//    Отбор оставлен человеку. Автоматически определить, какая из восьми фраз
//    «живее», нельзя, а каждая попытка судить за человека здесь кончалась
//    порчей данных. Выбрать из готовых карточек — секунды: содержимое уже
//    верное, решается только вкус.
//
// 2. ПРИМЕРЫ К СЛОВАМ (/maintenance/fill-examples) — старый каталог.
//
//    Заполняет пустые примеры у карточек-слов. Пример берётся из Викисловаря и
//    только из того значения, чей перевод совпал с переводом карточки. Пишет
//    ТОЛЬКО туда, где примера нет: цена ошибки — стёртый хороший пример.
//
// ── Чего здесь нет и не будет ───────────────────────────────────────────────
// Проверки переводов у слов. Русские переводы в Викисловаре заполнены
// выборочно, поэтому «перевода карточки нет среди словарных» — это незнание, а
// не доказательство ошибки. Отчёт на таком основании помечал почти каждую
// карточку и удалён.
//
// ── Доступ ──────────────────────────────────────────────────────────────────
// Ключ MAINTENANCE_KEY из окружения. Не задан — маршрута нет вовсе (404, а не
// 403): наружу не должно торчать даже упоминание, что тут что-то есть.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { db } from "@workspace/db";
import { decksTable, wordsTable } from "@workspace/db";
import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { googleTranslate } from "@workspace/translate";
import { exampleFromSense, fetchSenses, findSense } from "../lib/wiktionary";
import { fetchIdiom, fetchPhrases, fetchWordCards } from "../lib/phraseSource";
import { EXAMPLES_PAGE, PHRASES_PAGE } from "./maintenancePage";

const router = Router();

/**
 * Сколько слов за один запрос при заполнении примеров.
 *
 * Каждое слово — это обращение в словарь и, если пример нашёлся, перевод
 * фразы. Порция маленькая: она должна укладываться в таймаут прокси и не
 * заставлять человека смотреть в неподвижный экран.
 */
const BATCH_DEFAULT = 10;
const BATCH_MAX = 30;

/** Сколько слов обрабатываем одновременно: сервисы чужие, ведём себя прилично. */
const CONCURRENCY = 3;

// ── Доступ по ключу ─────────────────────────────────────────────────────────
function keyMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual падает на буферах разной длины — сравниваем её отдельно.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function requireMaintenanceKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env["MAINTENANCE_KEY"]?.trim();
  if (!expected) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const provided = String(req.query["key"] ?? "");
  if (!provided || !keyMatches(provided, expected)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
}

function intParam(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// КОНСТРУКТОР КАРТОЧЕК
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /maintenance/phrases/find ───────────────────────────────────────────
// Найти карточки вокруг слова или конструкции. Ничего не пишет.
router.get("/maintenance/phrases/find", requireMaintenanceKey, async (req, res) => {
  const query = String(req.query["q"] ?? "").trim();
  if (!query) {
    res.status(400).json({ error: "Введите слово или фразу" });
    return;
  }

  const isSingleWord = !query.includes(" ") || /^to\s+\S+$/i.test(query);

  // Три источника разом: ждать их по очереди незачем. Слова ищем только для
  // одиночного ввода, идиому — только для многословного: у обычного слова
  // пометки idiomatic не бывает, а у выражения нет словарных «значений слова».
  const [words, phrases, idiom] = await Promise.all([
    isSingleWord ? fetchWordCards(query) : Promise.resolve([]),
    fetchPhrases(query),
    isSingleWord ? Promise.resolve(null) : fetchIdiom(query),
  ]);

  res.json({ query, words, phrases, idiom });
});

/**
 * Найти или создать колоду.
 *
 * Колода системная и БЕЗ cefrLevel — значит попадёт в тематические на экране
 * «Слова» (см. pickThemeDecks в app/(main)/flashcards.tsx). Уровень не ставим
 * намеренно: карточки отбирает человек, и раскладывать их по CEFR он не обязан.
 */
async function ensureDeck(title: string): Promise<number> {
  const clean = title.trim().slice(0, 60) || "Фразы";

  const [existing] = await db
    .select({ id: decksTable.id })
    .from(decksTable)
    .where(and(eq(decksTable.isSystem, true), eq(decksTable.title, clean)));
  if (existing) return existing.id;

  const [created] = await db
    .insert(decksTable)
    .values({
      ownerId: null,
      title: clean,
      theme: "phrases",
      description: "Живая речь: фразы и слова с проверенным переводом",
      emoji: "💬",
      isSystem: true,
      hidden: false,
    })
    .returning({ id: decksTable.id });

  return created!.id;
}

// ── POST /maintenance/phrases/add ───────────────────────────────────────────
// Добавить отобранные человеком карточки в колоду.
//
// Карточка ложится в существующую схему без изменений: english — слово или
// предложение, translationsRu — перевод, exampleEn/Ru — пример. Поэтому
// тренажёр, интервальные повторения, озвучка и голосовой ввод работают с ней
// сразу: для них это обычная карточка.
router.post("/maintenance/phrases/add", requireMaintenanceKey, async (req, res) => {
  const body = req.body as {
    deck?: unknown;
    cards?: Array<{
      en?: unknown;
      ru?: unknown;
      exampleEn?: unknown;
      exampleRu?: unknown;
      partOfSpeech?: unknown;
    }>;
  };

  const deckTitle = typeof body.deck === "string" ? body.deck : "";
  const incoming = Array.isArray(body.cards) ? body.cards : [];
  if (!deckTitle.trim()) {
    res.status(400).json({ error: "Укажите название колоды" });
    return;
  }
  if (incoming.length === 0) {
    res.status(400).json({ error: "Не выбрано ни одной карточки" });
    return;
  }

  const deckId = await ensureDeck(deckTitle);

  // Что уже лежит в колоде — чтобы не плодить дубликаты, и текущий порядок,
  // чтобы дописывать в конец.
  const present = await db
    .select({ english: wordsTable.english, sortOrder: wordsTable.sortOrder })
    .from(wordsTable)
    .where(eq(wordsTable.deckId, deckId));
  const have = new Set(present.map((w) => w.english.trim().toLowerCase()));
  let sortOrder = present.reduce((max, w) => Math.max(max, w.sortOrder), -1) + 1;

  const rows: Array<typeof wordsTable.$inferInsert> = [];
  let skipped = 0;

  for (const card of incoming) {
    const en = typeof card.en === "string" ? card.en.trim() : "";
    // Перевод может прийти списком («изменять, менять») — храним как есть.
    const ru = typeof card.ru === "string" ? card.ru.trim() : "";
    if (!en || !ru) { skipped += 1; continue; }

    const key = en.toLowerCase();
    if (have.has(key)) { skipped += 1; continue; }
    have.add(key);

    const exampleEn = typeof card.exampleEn === "string" ? card.exampleEn.trim() : "";
    const exampleRu = typeof card.exampleRu === "string" ? card.exampleRu.trim() : "";
    const pos = typeof card.partOfSpeech === "string" ? card.partOfSpeech.trim() : "";

    rows.push({
      deckId,
      english: en,
      translationsRu: ru.split(/\s*,\s*/).filter(Boolean),
      exampleEn: exampleEn || null,
      exampleRu: exampleRu || null,
      // У предложения части речи нет — тогда null.
      partOfSpeech: pos || null,
      cefrLevel: null,
      sortOrder: sortOrder++,
    });
  }

  if (rows.length > 0) await db.insert(wordsTable).values(rows);

  res.json({ deckId, deck: deckTitle.trim(), added: rows.length, skipped });
});

router.get("/maintenance/phrases", requireMaintenanceKey, (_req, res) => {
  res.type("html").send(PHRASES_PAGE);
});

// ─────────────────────────────────────────────────────────────────────────────
// ПРИМЕРЫ К СЛОВАМ (старый каталог)
// ─────────────────────────────────────────────────────────────────────────────

// Только системные колоды: колоды учителей и учеников — их данные.
const noExample = or(isNull(wordsTable.exampleEn), eq(wordsTable.exampleEn, ""));

type WordRow = {
  id: number;
  english: string;
  translationsRu: string[];
  deckTitle: string;
};

async function countPending(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(wordsTable)
    .innerJoin(decksTable, eq(decksTable.id, wordsTable.deckId))
    .where(and(eq(decksTable.isSystem, true), noExample));
  return Number(row?.n ?? 0);
}

/**
 * Слова без примера после курсора.
 *
 * Курсор — id последнего просмотренного слова. Со смещением прогон вставал
 * намертво: выборка каждый раз брала первые N слов без примера, заполненные
 * уходили, а те, для которых пример не нашёлся, оставались в начале — и
 * следующий запрос упирался в них же.
 */
async function loadAfter(after: number, limit: number): Promise<WordRow[]> {
  const rows = await db
    .select({
      id: wordsTable.id,
      english: wordsTable.english,
      translationsRu: wordsTable.translationsRu,
      deckTitle: decksTable.title,
    })
    .from(wordsTable)
    .innerJoin(decksTable, eq(decksTable.id, wordsTable.deckId))
    .where(and(eq(decksTable.isSystem, true), gt(wordsTable.id, after), noExample))
    .orderBy(asc(wordsTable.id))
    .limit(limit);
  return rows as WordRow[];
}

/**
 * Найти пример, показывающий НУЖНОЕ значение слова.
 *
 * Единственный путь: значение из Викисловаря, чей перевод совпал с переводом
 * карточки, и пример из этого же значения. Совпадение перевода — то, что
 * доказывает: пример про то самое.
 *
 * Русский перевод фразы получаем машинным переводом, и это безопасно:
 * переводится ЦЕЛОЕ ПРЕДЛОЖЕНИЕ, где контекст сам снимает многозначность.
 */
async function findExample(word: WordRow): Promise<{ en: string; ru: string } | null> {
  const senses = await fetchSenses(word.english);
  const sense = findSense(senses, word.translationsRu ?? []);
  if (!sense) return null;

  const en = exampleFromSense(sense);
  if (!en) return null;

  const ru = await googleTranslate(en, "en", "ru");
  return ru ? { en, ru } : null;
}

// ── GET /maintenance/fill-examples/batch ────────────────────────────────────
router.get("/maintenance/fill-examples/batch", requireMaintenanceKey, async (req, res) => {
  const limit = Math.min(Math.max(intParam(req.query["limit"], BATCH_DEFAULT), 1), BATCH_MAX);
  const after = intParam(req.query["after"], 0);
  const dry = req.query["dry"] === "1";

  const remaining = await countPending();
  const words = await loadAfter(after, limit);

  if (words.length === 0) {
    res.json({ remaining, checked: 0, filled: 0, items: [], nextAfter: null });
    return;
  }

  const items: Array<{
    english: string;
    ru: string;
    deck: string;
    en: string;
    exampleRu: string;
  }> = [];
  let filled = 0;

  for (let i = 0; i < words.length; i += CONCURRENCY) {
    const chunk = words.slice(i, i + CONCURRENCY);
    const found = await Promise.all(
      chunk.map(async (w) => ({ word: w, example: await findExample(w) })),
    );

    for (const { word, example } of found) {
      if (!example) continue;
      items.push({
        english: word.english,
        ru: (word.translationsRu ?? []).join(", "),
        deck: word.deckTitle,
        en: example.en,
        exampleRu: example.ru,
      });
      if (dry) continue;
      await db
        .update(wordsTable)
        .set({ exampleEn: example.en, exampleRu: example.ru })
        .where(eq(wordsTable.id, word.id));
      filled += 1;
    }
  }

  // Курсор двигаем ВСЕГДА, даже когда ничего не нашли: слова без примера
  // никуда не денутся, и без сдвига мы упёрлись бы в них навсегда.
  const lastId = words[words.length - 1]!.id;

  res.json({
    remaining,
    checked: words.length,
    filled,
    items,
    // Порция пришла неполной — значит каталог кончился.
    nextAfter: words.length < limit ? null : lastId,
  });
});

router.get("/maintenance/fill-examples", requireMaintenanceKey, (_req, res) => {
  res.type("html").send(EXAMPLES_PAGE);
});

export default router;
