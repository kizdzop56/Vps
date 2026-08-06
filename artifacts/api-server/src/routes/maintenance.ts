// ─────────────────────────────────────────────────────────────────────────────
// Служебные операции над данными: запуск из браузера.
//
// Зачем маршрут существует. Аудит словаря живёт скриптом
// (maintenance/auditWords.ts), но запустить его можно только там, где есть шелл
// и доступ к базе. На бесплатном хостинге шелла нет, а с телефона тем более —
// то есть проверка, написанная ради исправления боевых данных, недоступна тому,
// кому она нужна. Здесь то же самое отдаётся страницей.
//
// ── Почему пакетами, а не одним запросом ────────────────────────────────────
// Перевод тысяч слов идёт минутами и не уложится в таймаут прокси. Поэтому
// страница берёт по 40 слов за запрос и сама идёт до конца, показывая прогресс.
// Побочная польза: частые запросы не дают бесплатному сервису уснуть посреди
// прогона.
//
// ── Доступ ──────────────────────────────────────────────────────────────────
// Ключ MAINTENANCE_KEY из окружения. Если он не задан, маршрута НЕТ вовсе —
// отвечаем 404, а не 403: наружу не должно торчать даже упоминание, что по
// этому адресу что-то есть. Сравнение ключа timingSafeEqual, чтобы его нельзя
// было подобрать по времени ответа.
//
// Роль admin здесь не подошла бы: страницу открывают из адресной строки, а
// заголовок Authorization туда не подставить.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { db } from "@workspace/db";
import { decksTable, wordsTable } from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  inspectBatch,
  patchFor,
  type AuditScope,
  type AuditWordRow,
} from "../lib/wordAuditRun";

const router = Router();

/** Сколько слов проверяем за один запрос: больше — риск словить таймаут прокси. */
const BATCH_DEFAULT = 40;
const BATCH_MAX = 100;

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
  // Ключ не настроен — считаем, что раздела не существует.
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

// ── Выборка каталога ────────────────────────────────────────────────────────
// Проверяем только СИСТЕМНЫЕ колоды: переводы в колодах учителей и учеников —
// их данные, переписывать их мы не вправе.
function catalogFilter(deckId: number | null) {
  return deckId === null
    ? eq(decksTable.isSystem, true)
    : and(eq(decksTable.isSystem, true), eq(wordsTable.deckId, deckId));
}

async function countCatalog(deckId: number | null): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(wordsTable)
    .innerJoin(decksTable, eq(decksTable.id, wordsTable.deckId))
    .where(catalogFilter(deckId));
  return Number(row?.n ?? 0);
}

async function loadCatalogPage(
  deckId: number | null,
  offset: number,
  limit: number,
): Promise<Array<AuditWordRow & { deckTitle: string }>> {
  const rows = await db
    .select({
      id: wordsTable.id,
      deckId: wordsTable.deckId,
      english: wordsTable.english,
      translationsRu: wordsTable.translationsRu,
      exampleEn: wordsTable.exampleEn,
      exampleRu: wordsTable.exampleRu,
      deckTitle: decksTable.title,
    })
    .from(wordsTable)
    .innerJoin(decksTable, eq(decksTable.id, wordsTable.deckId))
    .where(catalogFilter(deckId))
    // Порядок обязан быть стабильным: страница ходит по offset, и без
    // сортировки СУБД вольна вернуть строки как угодно — часть слов проверялась
    // бы дважды, часть не проверялась бы вовсе.
    .orderBy(asc(wordsTable.id))
    .limit(limit)
    .offset(offset);
  return rows as Array<AuditWordRow & { deckTitle: string }>;
}

function intParam(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

// ── GET /maintenance/audit-words/batch ──────────────────────────────────────
// Проверить очередную пачку слов. apply=1 — записать исправления.
router.get("/maintenance/audit-words/batch", requireMaintenanceKey, async (req, res) => {
  const offset = intParam(req.query["offset"], 0);
  const limit = Math.min(Math.max(intParam(req.query["limit"], BATCH_DEFAULT), 1), BATCH_MAX);
  const apply = req.query["apply"] === "1";
  const deckRaw = req.query["deck"];
  const deckId = deckRaw === undefined || deckRaw === "" ? null : intParam(deckRaw, 0);

  const scope: AuditScope = {
    examplesOnly: req.query["scope"] === "examples",
    translationsOnly: req.query["scope"] === "translations",
  };

  const total = await countCatalog(deckId);
  const words = await loadCatalogPage(deckId, offset, limit);

  if (words.length === 0) {
    res.json({ total, offset, checked: 0, updated: 0, skipped: 0, items: [], nextOffset: null });
    return;
  }

  const titleById = new Map(words.map((w) => [w.id, w.deckTitle]));
  const findings = await inspectBatch(words, scope);

  const items: Array<{
    id: number;
    english: string;
    deck: string;
    kind: "wrong" | "reordered" | "example";
    before: string;
    after: string;
  }> = [];
  let updated = 0;
  let skipped = 0;

  for (const finding of findings) {
    if (finding.skipped) skipped += 1;

    const deck = titleById.get(finding.word.id) ?? "";
    const stored = finding.word.translationsRu.join(", ");

    if (finding.freshRu) {
      items.push({
        id: finding.word.id,
        english: finding.word.english,
        deck,
        kind: finding.wrongTranslation ? "wrong" : "reordered",
        before: stored,
        after: finding.freshRu,
      });
    }
    if (finding.badExample) {
      items.push({
        id: finding.word.id,
        english: finding.word.english,
        deck,
        kind: "example",
        before: finding.word.exampleEn ?? "",
        after: "пример убран",
      });
    }

    if (!apply) continue;
    const patch = patchFor(finding);
    if (!patch) continue;
    await db.update(wordsTable).set(patch).where(eq(wordsTable.id, finding.word.id));
    updated += 1;
  }

  const nextOffset = offset + words.length;
  res.json({
    total,
    offset,
    checked: words.length,
    updated,
    skipped,
    items,
    nextOffset: nextOffset >= total ? null : nextOffset,
  });
});

// ── GET /maintenance/audit-words ────────────────────────────────────────────
// Страница-обёртка: сама ходит по пачкам и показывает, что нашлось.
router.get("/maintenance/audit-words", requireMaintenanceKey, (_req, res) => {
  res.type("html").send(PAGE);
});

export default router;
