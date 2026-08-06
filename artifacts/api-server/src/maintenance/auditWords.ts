/**
 * Аудит словарных данных: переводы, примеры употребления и части речи.
 *
 * Зачем: в каталоге нашлись карточки, где данные не соответствуют слову.
 *
 *   • Перевод не тот. Многозначность: импортёр брал первое значение
 *     автоперевода, и в колоде про одежду «suit» превращался в «иск».
 *   • Пример не в том значении. «tie» переведено как «галстук», а пример —
 *     «tie score» про ничью в игре: слово на месте, смысл чужой.
 *   • Примера нет вовсе.
 *   • Часть речи от балды: у наречия «daily» стоит Noun.
 *
 * Цена ошибки двойная: ребёнок учит неверное значение, а из тех же переводов
 * строятся варианты ответа в тренажёре. Просмотреть тысячи слов руками нельзя,
 * поэтому проверку делает скрипт.
 *
 * Правила отбора живут в ../lib/wordAudit.ts (чистые функции, покрыты тестами),
 * сам прогон — в ../lib/wordAuditRun.ts. Тот же модуль использует веб-страница
 * /api/maintenance/audit-words: логика обязана быть общей, иначе данные будет
 * править то одна версия правил, то другая.
 *
 * Здесь остаётся только работа с БД, аргументы и отчёт.
 *
 * ── Запуск ──────────────────────────────────────────────────────────────────
 * Из корня репозитория:
 *   pnpm exec tsx artifacts/api-server/src/maintenance/auditWords.ts
 *   pnpm exec tsx artifacts/api-server/src/maintenance/auditWords.ts --apply
 *
 * Опции:
 *   --apply              записать изменения (без него — сухой прогон, отчёт)
 *   --limit=<n>          сколько слов взять за прогон (по умолчанию все)
 *   --offset=<n>         с какого слова начать — для прогона частями
 *   --deck=<id>          только одна колода
 *   --examples-only      не трогать переводы
 *   --translations-only  не трогать примеры
 *   --concurrency=<n>    сколько слов проверять параллельно (по умолчанию 4)
 *
 * Бесплатный путь Google Translate душит по частоте, поэтому прогон можно бить
 * на части через --limit/--offset. С GOOGLE_TRANSLATE_API_KEY лимит мягче.
 */
import { asc, eq } from "drizzle-orm";
import {
  inspectBatch,
  patchFor,
  type AuditFinding,
  type AuditScope,
  type AuditWordRow,
} from "../lib/wordAuditRun";

// @workspace/db бросает исключение прямо при импорте, если нет DATABASE_URL,
// поэтому сначала подтягиваем .env и только потом импортируем БД.
function loadEnv(): void {
  if (process.env["DATABASE_URL"]) return;
  for (const file of [".env", ".env.local", "../../.env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // файла нет — это нормально, пробуем следующий
    }
    if (process.env["DATABASE_URL"]) return;
  }
}

loadEnv();

const { db, pool, wordsTable, decksTable } = await import("@workspace/db");

// ── Аргументы ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const apply = args.includes("--apply");

const scope: AuditScope = {
  examplesOnly: args.includes("--examples-only"),
  translationsOnly: args.includes("--translations-only"),
};

function optionValue(name: string): string | null {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function numberOption(name: string, fallback: number | null): number | null {
  const raw = optionValue(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    console.error(`❌ --${name} должен быть неотрицательным целым, получено: ${raw}`);
    process.exit(1);
  }
  return value;
}

const limit = numberOption("limit", null);
const offset = numberOption("offset", 0) ?? 0;
const deckFilter = numberOption("deck", null);
const concurrency = Math.min(Math.max(numberOption("concurrency", 4) ?? 4, 1), 8);

// ── Отчёт ───────────────────────────────────────────────────────────────────
function printGroup(title: string, lines: string[], cap = 50): void {
  if (lines.length === 0) return;
  console.log(`\n${title} (${lines.length}):`);
  for (const line of lines.slice(0, cap)) console.log(`   • ${line}`);
  if (lines.length > cap) console.log(`   … и ещё ${lines.length - cap}`);
}

// ── Основной проход ─────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const mode = apply ? "ЗАПИСЬ" : "сухой прогон";
  const what = scope.examplesOnly
    ? "только примеры"
    : scope.translationsOnly
      ? "только переводы"
      : "переводы, примеры и части речи";
  console.log(`\n🔍 Аудит слов (${mode}, ${what})`);
  console.log(`   слов параллельно: ${concurrency}`);
  console.log(
    process.env["GOOGLE_TRANSLATE_API_KEY"]?.trim()
      ? "   перевод: официальный Cloud Translation API"
      : "   перевод: бесплатный резервный путь (возможны пропуски по лимиту)",
  );

  const deckRows = await db
    .select({ id: decksTable.id, title: decksTable.title, isSystem: decksTable.isSystem })
    .from(decksTable);
  const deckById = new Map(deckRows.map((d) => [d.id, d]));

  const words = (await db
    .select({
      id: wordsTable.id,
      deckId: wordsTable.deckId,
      english: wordsTable.english,
      translationsRu: wordsTable.translationsRu,
      partOfSpeech: wordsTable.partOfSpeech,
      exampleEn: wordsTable.exampleEn,
      exampleRu: wordsTable.exampleRu,
    })
    .from(wordsTable)
    .orderBy(asc(wordsTable.id))) as AuditWordRow[];

  // Отбор в одном месте: только готовый каталог (колоды учителей и учеников —
  // их данные, чужие переводы мы переписывать не вправе) и, если задано, одна
  // колода из --deck.
  const catalog = words.filter((w) => {
    if (deckFilter !== null && w.deckId !== deckFilter) return false;
    return deckById.get(w.deckId)?.isSystem === true;
  });
  const slice = catalog.slice(offset, limit === null ? undefined : offset + limit);

  console.log(`   слов в каталоге: ${catalog.length}, проверяем: ${slice.length} (с ${offset})\n`);
  if (slice.length === 0) {
    console.log("Нечего проверять.");
    return;
  }

  // Прогресс печатаем сами: inspectBatch о консоли ничего не знает, поэтому
  // гоняем его порциями и между ними отчитываемся.
  const findings: AuditFinding[] = [];
  const CHUNK = 40;
  for (let i = 0; i < slice.length; i += CHUNK) {
    findings.push(...(await inspectBatch(slice.slice(i, i + CHUNK), scope, concurrency)));
    process.stdout.write(`   …проверено ${Math.min(i + CHUNK, slice.length)} из ${slice.length}\r`);
  }
  process.stdout.write("\n");

  const deckTitle = (f: AuditFinding) => deckById.get(f.word.deckId)?.title ?? `колода #${f.word.deckId}`;

  printGroup(
    "❌ Неверный перевод",
    findings
      .filter((f) => f.wrongTranslation)
      .map((f) => `${f.word.english} [${deckTitle(f)}]: «${f.word.translationsRu.join(", ")}» → «${f.freshRu}»`),
  );

  printGroup(
    "🔀 Основное значение не первое",
    findings
      .filter((f) => !f.wrongTranslation && f.freshRu)
      .map((f) => `${f.word.english} [${deckTitle(f)}]: вперёд «${f.freshRu}»`),
    30,
  );

  printGroup(
    "🎭 Пример о другом значении",
    findings
      .filter((f) => f.senseMismatch)
      .map((f) => `${f.word.english} [${deckTitle(f)}]: «${f.word.exampleEn}» → ${f.newExample ? `«${f.newExample.en}»` : "убрать"}`),
  );

  printGroup(
    "📝 В примере нет слова",
    findings
      .filter((f) => f.badExample)
      .map((f) => `${f.word.english} [${deckTitle(f)}]: «${f.word.exampleEn}» → ${f.newExample ? `«${f.newExample.en}»` : "убрать"}`),
  );

  printGroup(
    "➕ Примера не было, нашёлся",
    findings
      .filter((f) => f.missingExample && f.newExample)
      .map((f) => `${f.word.english} [${deckTitle(f)}]: «${f.newExample!.en}»`),
    30,
  );

  printGroup(
    "🏷 Часть речи",
    findings
      .filter((f) => f.freshPos)
      .map((f) => `${f.word.english} [${deckTitle(f)}]: ${f.word.partOfSpeech} → ${f.freshPos}`),
    30,
  );

  const emptyStill = findings.filter((f) => f.missingExample && !f.newExample).length;
  if (emptyStill > 0) {
    console.log(`\n📭 Без примера и замены не нашлось: ${emptyStill}`);
    console.log("   Словарь не дал подходящей фразы. Такие карточки остаются как есть.");
  }

  const skipped = findings.filter((f) => f.skipped).length;
  if (skipped > 0) {
    console.log(`\n⏭  Пропущено (перевод не получен): ${skipped}`);
    console.log("   Прогоните эти слова ещё раз позже — скорее всего, сработал лимит.");
  }

  const patches = findings.map((f) => ({ f, patch: patchFor(f) })).filter((p) => p.patch !== null);

  if (patches.length === 0) {
    console.log("\n✅ Расхождений не найдено.\n");
    return;
  }

  if (!apply) {
    console.log(`\n📊 Итог: к исправлению ${patches.length} карточек.`);
    console.log("   Это был сухой прогон. Повторите с --apply, чтобы записать изменения.\n");
    return;
  }

  for (const { f, patch } of patches) {
    await db.update(wordsTable).set(patch!).where(eq(wordsTable.id, f.word.id));
  }

  console.log(`\n📊 Итог: обновлено карточек ${patches.length}.`);
  console.log("   Изменения записаны.\n");
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("❌ Аудит не удался:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
