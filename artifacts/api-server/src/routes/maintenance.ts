// ─────────────────────────────────────────────────────────────────────────────
// Служебные операции над каталогом слов: запуск из браузера.
//
// Страницей, а не скриптом, потому что шелла с доступом к базе на бесплатном
// хостинге нет, а владелец проекта работает с телефона.
//
// ── Единственная операция: заполнить пустые примеры ─────────────────────────
// Источник примера выбирается так, чтобы он был про ТО ЖЕ значение, что и
// перевод карточки. В Викисловаре переводы привязаны к конкретному значению
// (см. lib/wiktionary.ts), поэтому по карточке «tie = галстук» находится
// значение «necktie», и пример берётся из него, а не из «ничьей».
//
// Не нашлось — берём пару из Tatoeba, где и фраза, и перевод написаны людьми.
// Не нашлось и там — оставляем пусто.
//
// Пишем ТОЛЬКО туда, где примера нет. Существующие не трогаем: цена ошибки —
// стёртый хороший пример, а проверять тысячи строк руками никто не будет.
//
// ── Чего здесь нет и не будет ───────────────────────────────────────────────
// Проверки переводов. Такой отчёт был и помечал почти каждую карточку, то есть
// не нёс информации.
//
// Причина в данных, а не в коде: русские переводы в английском Викисловаре
// заполнены выборочно — у популярных значений есть, у прочих пусто, синонимы
// перечислены не полностью. Из «перевода карточки нет среди словарных» НЕ
// следует «перевод неверный»: пробел в словаре не доказательство ошибки.
//
// Чтобы утверждать обратное, нужен словарь с полным покрытием значений EN→RU.
// В открытом доступе у проекта такого нет.
//
// Важно, что подбор примеров использует тот же словарь КОРРЕКТНО: мы не
// спрашиваем «верен ли перевод», мы ищем значение, где перевод СОВПАЛ.
// Совпадение — факт, и на нём выводы строить можно; отсутствие совпадения —
// не факт, а незнание.
//
// ── Курсор по id, а не смещение ─────────────────────────────────────────────
// Обход идёт через `after` — id последнего просмотренного слова. Со смещением
// заполнение вставало намертво: выборка каждый раз брала первые N слов без
// примера, заполненные уходили, а те, для которых пример не нашёлся, оставались
// в начале — и следующий запрос упирался в них же.
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
import { exampleFor as tatoebaExample } from "../lib/tatoeba";
import { exampleFromSense, fetchSenses, findSense } from "../lib/wiktionary";
import { EXAMPLES_PAGE } from "./maintenancePage";

const router = Router();

/**
 * Сколько слов за один запрос.
 *
 * Каждое слово — это несколько обращений в сеть (словарь, иногда Tatoeba и
 * перевод фразы), поэтому порция маленькая: она должна укладываться в таймаут
 * прокси и не заставлять человека смотреть в неподвижный экран минуту.
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

// ── Выборка ─────────────────────────────────────────────────────────────────
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
 * Курсор — id последнего просмотренного слова. Порядок по id обязателен: без
 * него СУБД вольна вернуть строки как угодно, и курсор потеряет смысл.
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

function intParam(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

// ── Подбор примера ──────────────────────────────────────────────────────────
type FoundExample = { en: string; ru: string; source: "wiktionary" | "tatoeba" };

/**
 * Найти пример, показывающий нужное значение слова.
 *
 * Сначала Викисловарь: там переводы привязаны к значениям, поэтому можно взять
 * пример именно того значения, которому учит карточка. Русский перевод этой
 * фразы получаем машинным переводом — и это безопасно: переводится ЦЕЛОЕ
 * ПРЕДЛОЖЕНИЕ, где контекст сам снимает многозначность. Ломался машинный
 * перевод именно на отдельных словах и идиомах.
 *
 * Не вышло — Tatoeba: там пара «фраза + перевод» целиком написана людьми.
 */
async function findExample(word: WordRow): Promise<FoundExample | null> {
  const senses = await fetchSenses(word.english);
  const sense = findSense(senses, word.translationsRu ?? []);

  if (sense) {
    const en = exampleFromSense(sense);
    if (en) {
      const ru = await googleTranslate(en, "en", "ru");
      if (ru) return { en, ru, source: "wiktionary" };
    }
  }

  const pair = await tatoebaExample(word.english);
  if (pair) return { en: pair.en, ru: pair.ru, source: "tatoeba" };

  return null;
}

// ── GET /maintenance/fill-examples/batch ────────────────────────────────────
// Заполнить очередную порцию пустых примеров. dry=1 — только показать.
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
    source: string;
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
        source: example.source,
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

// ── GET /maintenance/fill-examples ──────────────────────────────────────────
router.get("/maintenance/fill-examples", requireMaintenanceKey, (_req, res) => {
  res.type("html").send(EXAMPLES_PAGE);
});

export default router;
