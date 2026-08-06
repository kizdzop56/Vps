/**
 * Аудит словарных данных: неверные переводы и примеры без изучаемого слова.
 *
 * Зачем: в каталоге нашлись карточки, где перевод не соответствует слову.
 * Типовая причина — многозначность: импортёр брал первое значение из
 * автоперевода, и в колоде про одежду «suit» превращался в «иск». Ребёнок учит
 * слово по этой карточке и запоминает неверное значение, а варианты ответа в
 * тренажёре строятся из тех же переводов — ошибка размножается.
 *
 * Просмотреть тысячи слов руками нельзя, поэтому проверку делает скрипт.
 *
 * ── Как проверяется перевод ─────────────────────────────────────────────────
 * Проверка ДВУСТОРОННЯЯ. Односторонней мало: у слова бывает несколько честных
 * переводов, и несовпадение с автопереводом само по себе не ошибка.
 *
 *   1. EN→RU. Свежий перевод сверяется с сохранёнными (translationMatches:
 *      по отдельным словам и общему корню, чтобы «костюм» и «костюм, комплект»
 *      считались одним ответом). Совпало — карточка чистая, второй запрос не
 *      тратим.
 *   2. Не совпало → RU→EN на сохранённом переводе. Если обратный перевод даёт
 *      исходное английское слово, сохранённый вариант — законное второе
 *      значение, и трогать его нельзя.
 *   3. Обратный перевод не вернул слово → перевод признаётся ошибочным.
 *
 * В любом случае, когда свежий перевод не совпал с первым сохранённым, он
 * встаёт в начало списка: первый элемент — это то, что видно на карточке и что
 * уходит в варианты ответа. Прежние значения остаются следом, их не выбрасываем.
 *
 * ── Как проверяется пример ──────────────────────────────────────────────────
 * Пример обязан содержать само изучаемое слово (lib/wordAudit.ts, с учётом
 * форм). Пример без слова — не пример, а посторонняя фраза; такие стираем.
 * Спорные случаи (неправильные глаголы, слова из двух букв) модуль помечает
 * как «не берусь судить», и они не удаляются.
 *
 * ── Запуск ──────────────────────────────────────────────────────────────────
 * Из корня репозитория:
 *   pnpm exec tsx artifacts/api-server/src/maintenance/auditWords.ts
 *   pnpm exec tsx artifacts/api-server/src/maintenance/auditWords.ts --apply
 *
 * Опции:
 *   --apply            записать изменения (без него — сухой прогон, отчёт)
 *   --limit=<n>        сколько слов взять за прогон (по умолчанию все)
 *   --offset=<n>       с какого слова начать — для прогона частями
 *   --deck=<id>        только одна колода
 *   --examples-only    не трогать переводы, чистить только примеры
 *   --translations-only  не трогать примеры
 *   --concurrency=<n>  сколько запросов перевода параллельно (по умолчанию 4)
 *
 * Бесплатный путь Google Translate душит по частоте, поэтому запросы идут
 * небольшими партиями с паузой, а прогон можно бить на части через
 * --limit/--offset. С GOOGLE_TRANSLATE_API_KEY ограничение мягче.
 */
import { asc, eq } from "drizzle-orm";
import { googleTranslate } from "@workspace/translate";
import {
  exampleMentionsWord,
  stripInfinitive,
  translationMatches,
} from "../lib/wordAudit";

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
const examplesOnly = args.includes("--examples-only");
const translationsOnly = args.includes("--translations-only");

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

// Пауза между партиями запросов: бесплатный путь Google Translate отвечает
// пустотой, если долбить его без остановки.
const BATCH_PAUSE_MS = 350;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Разбор одного слова ─────────────────────────────────────────────────────
type WordRow = {
  id: number;
  deckId: number;
  english: string;
  translationsRu: string[];
  exampleEn: string | null;
  exampleRu: string | null;
};

type Finding = {
  word: WordRow;
  deckTitle: string;
  /** Перевод признан ошибочным: обратный перевод не вернул исходное слово. */
  wrongTranslation: boolean;
  /** Свежий перевод, который стоит поставить первым. */
  freshRu: string | null;
  /** Пример не содержит изучаемого слова. */
  badExample: boolean;
  /** Перевод не удалось получить — сеть или лимит. Такие пропускаем. */
  skipped: boolean;
};

async function inspect(word: WordRow, deckTitle: string): Promise<Finding> {
  const base: Finding = {
    word, deckTitle,
    wrongTranslation: false, freshRu: null, badExample: false, skipped: false,
  };

  // ── Пример ────────────────────────────────────────────────────────────────
  if (!translationsOnly && word.exampleEn) {
    base.badExample = exampleMentionsWord(word.english, word.exampleEn) === "no";
  }

  if (examplesOnly) return base;

  // ── Перевод: шаг 1, EN→RU ─────────────────────────────────────────────────
  const lookup = stripInfinitive(word.english);
  const fresh = await googleTranslate(lookup, "en", "ru");
  if (!fresh) {
    base.skipped = true;
    return base;
  }

  const stored = word.translationsRu ?? [];
  if (translationMatches(fresh, stored)) return base;

  // Свежий перевод расходится с сохранённым — он должен встать первым.
  base.freshRu = fresh;

  // ── Перевод: шаг 2, RU→EN ─────────────────────────────────────────────────
  // Сохранённый вариант может быть законным вторым значением. Проверяем, ведёт
  // ли он обратно к тому же английскому слову.
  const primary = stored[0];
  if (!primary) {
    base.wrongTranslation = true; // переводов нет вообще
    return base;
  }

  const back = await googleTranslate(primary, "ru", "en");
  if (!back) {
    base.skipped = true;
    return base;
  }

  const backBase = stripInfinitive(back);
  base.wrongTranslation = backBase !== lookup;
  return base;
}

// ── Основной проход ─────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const mode = apply ? "ЗАПИСЬ" : "сухой прогон";
  const scope = examplesOnly ? "только примеры" : translationsOnly ? "только переводы" : "переводы и примеры";
  console.log(`\n🔍 Аудит слов (${mode}, ${scope})`);
  console.log(`   запросов параллельно: ${concurrency}`);
  if (process.env["GOOGLE_TRANSLATE_API_KEY"]?.trim()) {
    console.log("   перевод: официальный Cloud Translation API");
  } else {
    console.log("   перевод: бесплатный резервный путь (возможны пропуски по лимиту)");
  }

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
      exampleEn: wordsTable.exampleEn,
      exampleRu: wordsTable.exampleRu,
    })
    .from(wordsTable)
    .orderBy(asc(wordsTable.id))) as WordRow[];

  // Отбор в одном месте: только готовый каталог (колоды учителей и учеников —
  // их данные, чужие переводы мы переписывать не вправе) и, если задано,
  // одна колода из --deck.
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

  const findings: Finding[] = [];
  let done = 0;

  for (let i = 0; i < slice.length; i += concurrency) {
    const batch = slice.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((w) => inspect(w, deckById.get(w.deckId)?.title ?? `колода #${w.deckId}`)),
    );
    findings.push(...results);

    done += batch.length;
    if (done % 100 < concurrency) {
      process.stdout.write(`   …проверено ${done} из ${slice.length}\r`);
    }
    if (i + concurrency < slice.length) await sleep(BATCH_PAUSE_MS);
  }
  process.stdout.write("\n");

  const wrong = findings.filter((f) => f.wrongTranslation);
  const reordered = findings.filter((f) => !f.wrongTranslation && f.freshRu);
  const badExamples = findings.filter((f) => f.badExample);
  const skipped = findings.filter((f) => f.skipped);

  // ── Отчёт ─────────────────────────────────────────────────────────────────
  if (wrong.length > 0) {
    console.log(`\n❌ Неверный перевод (${wrong.length}):`);
    for (const f of wrong.slice(0, 60)) {
      console.log(
        `   • ${f.word.english} [${f.deckTitle}]: было «${f.word.translationsRu.join(", ")}» → «${f.freshRu}»`,
      );
    }
    if (wrong.length > 60) console.log(`   … и ещё ${wrong.length - 60}`);
  }

  if (reordered.length > 0) {
    console.log(`\n🔀 Основное значение не первое (${reordered.length}):`);
    for (const f of reordered.slice(0, 30)) {
      console.log(
        `   • ${f.word.english} [${f.deckTitle}]: «${f.word.translationsRu.join(", ")}» → вперёд «${f.freshRu}»`,
      );
    }
    if (reordered.length > 30) console.log(`   … и ещё ${reordered.length - 30}`);
  }

  if (badExamples.length > 0) {
    console.log(`\n📝 Пример без изучаемого слова (${badExamples.length}):`);
    for (const f of badExamples.slice(0, 40)) {
      console.log(`   • ${f.word.english} [${f.deckTitle}]: «${f.word.exampleEn}»`);
    }
    if (badExamples.length > 40) console.log(`   … и ещё ${badExamples.length - 40}`);
  }

  if (skipped.length > 0) {
    console.log(`\n⏭  Пропущено (перевод не получен): ${skipped.length}`);
    console.log("   Прогоните эти слова ещё раз позже — скорее всего, сработал лимит.");
  }

  const changes = wrong.length + reordered.length + badExamples.length;
  if (changes === 0) {
    console.log("\n✅ Расхождений не найдено.\n");
    return;
  }

  if (!apply) {
    console.log(`\n📊 Итог: к исправлению ${changes} записей.`);
    console.log("   Это был сухой прогон. Повторите с --apply, чтобы записать изменения.\n");
    return;
  }

  // ── Запись ────────────────────────────────────────────────────────────────
  let updated = 0;
  for (const f of findings) {
    const patch: { translationsRu?: string[]; exampleEn?: null; exampleRu?: null } = {};

    if (f.freshRu) {
      // Свежий перевод — первым, прежние значения сохраняем следом без дублей.
      const rest = f.word.translationsRu.filter(
        (t) => t.trim().toLowerCase() !== f.freshRu!.trim().toLowerCase(),
      );
      // У заведомо неверного перевода прежние значения не сохраняем: это не
      // второе значение слова, а чужой перевод.
      patch.translationsRu = f.wrongTranslation ? [f.freshRu] : [f.freshRu, ...rest];
    }

    if (f.badExample) {
      // Пример стираем целиком, вместе с русским: без английского он бессмыслен.
      patch.exampleEn = null;
      patch.exampleRu = null;
    }

    if (Object.keys(patch).length === 0) continue;
    await db.update(wordsTable).set(patch).where(eq(wordsTable.id, f.word.id));
    updated += 1;
  }

  console.log(`\n📊 Итог: обновлено записей ${updated}.`);
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
