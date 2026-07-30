// ─────────────────────────────────────────────────────────────────────────────
// Сборка колоды из каталога: чистые функции без БД и сети (покрыты deckWords.test.ts).
//
// Учитель собирает свою колоду из готового каталога слов (системные колоды по
// темам и уровням CEFR). Слово при этом *копируется* в колоду учителя: схема
// допускает одно слово в одной колоде (words.deckId NOT NULL), а прогресс
// ученика висит на word_id — значит у колоды учителя должен быть свой
// независимый набор карточек и свой прогресс.
//
// Здесь живут только правила отбора и раскладки строк. Запросы к БД, проверка
// написания и перевод остаются в routes/flashcards.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Строка слова из каталога — то, что нужно для копии (поля таблицы words). */
export type CatalogWordRow = {
  id: number;
  english: string;
  partOfSpeech: string | null;
  translationsRu: string[];
  ipa: string | null;
  exampleEn: string | null;
  exampleRu: string | null;
  cefrLevel: string | null;
  emoji: string | null;
};

/** Готовая к вставке строка слова в колоду-получателя. */
export type WordInsertRow = {
  deckId: number;
  english: string;
  partOfSpeech: string | null;
  translationsRu: string[];
  ipa: string | null;
  exampleEn: string | null;
  exampleRu: string | null;
  cefrLevel: string | null;
  emoji: string | null;
  sortOrder: number;
};

/** Ключ сравнения слов: без регистра и лишних пробелов — как в существующем импорте. */
export function wordKey(english: string): string {
  return english.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Множество ключей уже имеющихся в колоде слов. */
export function wordKeySet(words: Array<{ english: string }>): Set<string> {
  return new Set(words.map((w) => wordKey(w.english)));
}

/**
 * Копирование выбранных слов каталога в колоду.
 *
 * Отсеивает два вида дубликатов: слово уже есть в колоде-получателе и слово
 * повторяется внутри самой выборки (учитель мог выбрать одно и то же слово из
 * двух разных тематических колод). Порядок выбора сохраняем в sortOrder, чтобы
 * список слов в колоде выглядел так, как учитель его собирал.
 */
export function planCatalogCopy(
  deckId: number,
  catalog: CatalogWordRow[],
  existing: Set<string>,
  sortOrderStart = 0,
): { rows: WordInsertRow[]; skipped: number } {
  const rows: WordInsertRow[] = [];
  const seen = new Set(existing);
  let skipped = 0;

  for (const w of catalog) {
    const key = wordKey(w.english);
    if (!key || seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    rows.push({
      deckId,
      english: w.english,
      partOfSpeech: w.partOfSpeech,
      translationsRu: w.translationsRu,
      ipa: w.ipa,
      exampleEn: w.exampleEn,
      exampleRu: w.exampleRu,
      cefrLevel: w.cefrLevel,
      emoji: w.emoji,
      sortOrder: sortOrderStart + rows.length,
    });
  }

  return { rows, skipped };
}

/**
 * Порядок выбора учителя для копий из каталога.
 *
 * db.select(...).where(inArray(id, ids)) возвращает строки в порядке БД, а не в
 * порядке ids. Раскладываем найденные строки обратно по порядку выбора и заодно
 * сообщаем, какие id не нашлись (слово могли удалить, пока учитель собирал колоду).
 */
export function orderByRequestedIds<T extends { id: number }>(
  rows: T[],
  requestedIds: number[],
): { ordered: T[]; missingIds: number[] } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered: T[] = [];
  const missingIds: number[] = [];
  const seen = new Set<number>();

  for (const id of requestedIds) {
    if (seen.has(id)) continue; // один и тот же id в запросе — считаем один раз
    seen.add(id);
    const row = byId.get(id);
    if (row) ordered.push(row);
    else missingIds.push(id);
  }

  return { ordered, missingIds };
}

/** Вставка большими партиями: чанки как в существующем импорте CSV/JSON. */
export function chunked<T>(items: T[], size = 100): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Сколько слов из каталога разрешаем добавить одним вызовом — защита от случайного «выбрать всё». */
export const BULK_WORD_LIMIT = 300;

/**
 * Сколько слов из ручного ввода обрабатываем за один вызов.
 *
 * Лимит жёстче, чем у каталога: каждое такое слово проверяется во внешнем
 * словаре и переводится через Google Translate, то есть стоит сетевого запроса.
 */
export const MANUAL_WORD_LIMIT = 50;
