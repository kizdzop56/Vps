// ─────────────────────────────────────────────────────────────────────────────
// Служебные операции над каталогом слов: запуск из браузера.
//
// Страницей, а не скриптом, потому что шелла с доступом к базе на бесплатном
// хостинге нет, а владелец проекта работает с телефона.
//
// ── Две операции разного веса ───────────────────────────────────────────────
//
// 1. ПРИМЕРЫ — пишет в базу, но только туда, где примера НЕТ.
//
//    Источник примера выбирается так, чтобы он был про ТО ЖЕ значение, что и
//    перевод карточки. В Викисловаре переводы привязаны к конкретному значению
//    (см. lib/wiktionary.ts), поэтому по карточке «tie = галстук» находится
//    значение «necktie», и пример берётся из него, а не из «ничьей».
//
//    Не нашлось — берём пару из Tatoeba, где и фраза, и перевод написаны
//    людьми. Не нашлось и там — оставляем пусто.
//
//    Существующие примеры не трогаем. Цена ошибки — стёртый хороший пример,
//    а проверять тысячи строк руками никто не будет.
//
// 2. ПЕРЕВОДЫ — только отчёт, в базу не пишет ничего.
//
//    Показывает карточки, где у слова в Викисловаре есть русские переводы, но
//    перевода карточки среди них нет. Автоматических правок здесь не будет:
//    словарь покрывает не всё, а выбор значения — человеческое решение.
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
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { googleTranslate } from "@workspace/translate";
import { exampleFor as tatoebaExample } from "../lib/tatoeba";
import {
  allTranslations,
  exampleFromSense,
  fetchSenses,
  findSense,
  verdictFor,
} from "../lib/wiktionary";

const router = Router();

/** Сколько слов за один запрос: больше — риск словить таймаут прокси. */
const BATCH_DEFAULT = 20;
const BATCH_MAX = 50;

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

// ── Выборки ─────────────────────────────────────────────────────────────────
// Только системные колоды: колоды учителей и учеников — их данные.
const noExample = or(isNull(wordsTable.exampleEn), eq(wordsTable.exampleEn, ""));

type WordRow = {
  id: number;
  english: string;
  translationsRu: string[];
  deckTitle: string;
};

const wordColumns = {
  id: wordsTable.id,
  english: wordsTable.english,
  translationsRu: wordsTable.translationsRu,
  deckTitle: decksTable.title,
};

async function countWhere(extra?: ReturnType<typeof or>): Promise<number> {
  const where = extra ? and(eq(decksTable.isSystem, true), extra) : eq(decksTable.isSystem, true);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(wordsTable)
    .innerJoin(decksTable, eq(decksTable.id, wordsTable.deckId))
    .where(where);
  return Number(row?.n ?? 0);
}

async function loadWords(
  limit: number,
  offset: number,
  extra?: ReturnType<typeof or>,
): Promise<WordRow[]> {
  const where = extra ? and(eq(decksTable.isSystem, true), extra) : eq(decksTable.isSystem, true);
  const rows = await db
    .select(wordColumns)
    .from(wordsTable)
    .innerJoin(decksTable, eq(decksTable.id, wordsTable.deckId))
    .where(where)
    // Порядок обязан быть стабильным: страница ходит по offset, и без
    // сортировки СУБД вольна вернуть строки как угодно.
    .orderBy(asc(wordsTable.id))
    .limit(limit)
    .offset(offset);
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
//
// Смещения нет намеренно: заполненные слова выпадают из выборки сами, поэтому
// «следующая порция» — просто следующий запрос. Прогон можно прервать в любой
// момент и продолжить позже с того же места.
router.get("/maintenance/fill-examples/batch", requireMaintenanceKey, async (req, res) => {
  const limit = Math.min(Math.max(intParam(req.query["limit"], BATCH_DEFAULT), 1), BATCH_MAX);
  const dry = req.query["dry"] === "1";

  const remaining = await countWhere(noExample);
  const words = await loadWords(limit, 0, noExample);

  if (words.length === 0) {
    res.json({ remaining: 0, checked: 0, filled: 0, items: [], done: true });
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

  res.json({
    remaining,
    checked: words.length,
    filled,
    items,
    // В сухом прогоне выборка не сдвинется — останавливаемся сразу, иначе
    // страница крутила бы одну и ту же порцию до бесконечности.
    done: dry || filled === 0,
  });
});

// ── GET /maintenance/check-translations/batch ───────────────────────────────
// ТОЛЬКО ОТЧЁТ. В базу не пишет ничего и никогда.
router.get("/maintenance/check-translations/batch", requireMaintenanceKey, async (req, res) => {
  const limit = Math.min(Math.max(intParam(req.query["limit"], BATCH_DEFAULT), 1), BATCH_MAX);
  const offset = intParam(req.query["offset"], 0);

  const total = await countWhere();
  const words = await loadWords(limit, offset);

  if (words.length === 0) {
    res.json({ total, offset, checked: 0, items: [], nextOffset: null });
    return;
  }

  const items: Array<{ english: string; ru: string; deck: string; known: string }> = [];

  for (let i = 0; i < words.length; i += CONCURRENCY) {
    const chunk = words.slice(i, i + CONCURRENCY);
    const checked = await Promise.all(
      chunk.map(async (w) => ({ word: w, senses: await fetchSenses(w.english) })),
    );

    for (const { word, senses } of checked) {
      // "unknown" (у словаря нет русских переводов) в отчёт не идёт: молчание
      // словаря — это не претензия к карточке.
      if (verdictFor(senses, word.translationsRu ?? []) !== "no") continue;
      items.push({
        english: word.english,
        ru: (word.translationsRu ?? []).join(", "),
        deck: word.deckTitle,
        known: allTranslations(senses).slice(0, 8).join(", "),
      });
    }
  }

  const nextOffset = offset + words.length;
  res.json({
    total,
    offset,
    checked: words.length,
    items,
    nextOffset: nextOffset >= total ? null : nextOffset,
  });
});

// ── Страницы ────────────────────────────────────────────────────────────────
import { EXAMPLES_PAGE, TRANSLATIONS_PAGE } from "./maintenancePage";

router.get("/maintenance/fill-examples", requireMaintenanceKey, (_req, res) => {
  res.type("html").send(EXAMPLES_PAGE);
});

router.get("/maintenance/check-translations", requireMaintenanceKey, (_req, res) => {
  res.type("html").send(TRANSLATIONS_PAGE);
});

export default router;
