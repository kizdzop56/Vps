// ─────────────────────────────────────────────────────────────────────────────
// Служебные операции над данными: запуск из браузера.
//
// Здесь ровно одна операция — заполнить пустые примеры употребления из Tatoeba
// (см. lib/tatoeba.ts). Запуск из браузера нужен потому, что шелла с доступом к
// базе на бесплатном хостинге нет, а владелец проекта работает с телефона.
//
// ── Что операция делает и чего НЕ делает ────────────────────────────────────
// ДОБАВЛЯЕТ пример там, где его нет. Всё.
//
// Не заменяет существующие примеры. Не удаляет их. Не трогает переводы. Это не
// осторожность ради осторожности: прошлая версия умела всё перечисленное и на
// живых данных предлагала стереть нормальные карточки. Операция, которая только
// заполняет пустоту, не может испортить данные в принципе — терять там нечего,
// а значит и проверять результат руками не нужно.
//
// Переводы автоматически не правятся вовсе: достоверного бесплатного источника
// словарных значений EN→RU нет, а машинный перевод врёт на идиомах и
// многозначных словах.
//
// ── Почему пакетами ─────────────────────────────────────────────────────────
// Каждое слово — запрос в Tatoeba, тысячи слов идут минутами и в таймаут прокси
// не уложатся. Страница берёт по 25 слов за раз и сама идёт до конца. Побочная
// польза: частые запросы не дают бесплатному хостингу уснуть посреди прогона.
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
import { exampleFor } from "../lib/tatoeba";
import { FILL_PAGE } from "./maintenancePage";

const router = Router();

/** Сколько слов за один запрос: больше — риск словить таймаут прокси. */
const BATCH_DEFAULT = 25;
const BATCH_MAX = 50;

/** Сколько запросов в Tatoeba держим одновременно: чужой сервис, ведём себя прилично. */
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
// Только системные колоды (чужие данные не трогаем) и только слова без примера:
// операция ничего не заменяет, поэтому остальные ей неинтересны.
const emptyExample = or(isNull(wordsTable.exampleEn), eq(wordsTable.exampleEn, ""));

async function countPending(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(wordsTable)
    .innerJoin(decksTable, eq(decksTable.id, wordsTable.deckId))
    .where(and(eq(decksTable.isSystem, true), emptyExample));
  return Number(row?.n ?? 0);
}

type PendingWord = { id: number; english: string; deckTitle: string };

async function loadPending(limit: number): Promise<PendingWord[]> {
  const rows = await db
    .select({
      id: wordsTable.id,
      english: wordsTable.english,
      deckTitle: decksTable.title,
    })
    .from(wordsTable)
    .innerJoin(decksTable, eq(decksTable.id, wordsTable.deckId))
    .where(and(eq(decksTable.isSystem, true), emptyExample))
    .orderBy(asc(wordsTable.id))
    .limit(limit);
  return rows as PendingWord[];
}

function intParam(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

// ── GET /maintenance/fill-examples/batch ────────────────────────────────────
// Заполнить очередную порцию. dry=1 — только показать, что нашлось.
//
// Смещения здесь нет намеренно: заполненные слова выпадают из выборки сами,
// поэтому «следующая порция» — это просто следующий запрос. При dry=1 выборка
// не меняется, и страница показывает одну порцию, не зацикливаясь.
router.get("/maintenance/fill-examples/batch", requireMaintenanceKey, async (req, res) => {
  const limit = Math.min(Math.max(intParam(req.query["limit"], BATCH_DEFAULT), 1), BATCH_MAX);
  const dry = req.query["dry"] === "1";

  const remaining = await countPending();
  const words = await loadPending(limit);

  if (words.length === 0) {
    res.json({ remaining: 0, checked: 0, filled: 0, items: [], done: true });
    return;
  }

  const items: Array<{ english: string; deck: string; en: string; ru: string; source: number }> = [];
  let filled = 0;

  for (let i = 0; i < words.length; i += CONCURRENCY) {
    const chunk = words.slice(i, i + CONCURRENCY);
    const found = await Promise.all(
      chunk.map(async (w) => ({ word: w, pair: await exampleFor(w.english) })),
    );

    for (const { word, pair } of found) {
      if (!pair) continue;
      items.push({
        english: word.english,
        deck: word.deckTitle,
        en: pair.en,
        ru: pair.ru,
        source: pair.sourceId,
      });
      if (dry) continue;
      await db
        .update(wordsTable)
        .set({ exampleEn: pair.en, exampleRu: pair.ru })
        .where(eq(wordsTable.id, word.id));
      filled += 1;
    }
  }

  res.json({
    remaining,
    checked: words.length,
    filled,
    items,
    // В сухом прогоне выборка не сдвинется, поэтому останавливаемся сразу:
    // иначе страница крутила бы одну и ту же порцию до бесконечности.
    done: dry || filled === 0,
  });
});

// ── GET /maintenance/fill-examples ──────────────────────────────────────────
router.get("/maintenance/fill-examples", requireMaintenanceKey, (_req, res) => {
  res.type("html").send(FILL_PAGE);
});

export default router;
