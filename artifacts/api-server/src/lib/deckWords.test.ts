/**
 * Тесты сборки колоды из каталога слов.
 * Запуск: pnpm exec tsx --test artifacts/api-server/src/lib/deckWords.test.ts
 *
 * Зависимостей нет — только node:test и node:assert, поэтому тест не тянет
 * за собой ни БД, ни express.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  chunked,
  orderByRequestedIds,
  planCatalogCopy,
  wordKey,
  wordKeySet,
  type CatalogWordRow,
} from "./deckWords";

function catalogWord(id: number, english: string, over: Partial<CatalogWordRow> = {}): CatalogWordRow {
  return {
    id,
    english,
    partOfSpeech: "noun",
    translationsRu: ["перевод"],
    ipa: "/test/",
    exampleEn: "An example.",
    exampleRu: "Пример.",
    cefrLevel: "A1",
    emoji: "🍎",
    ...over,
  };
}

// ── wordKey / wordKeySet ────────────────────────────────────────────────────

test("wordKey игнорирует регистр и лишние пробелы", () => {
  assert.equal(wordKey("  Apple "), "apple");
  assert.equal(wordKey("Take    OFF"), "take off");
  assert.equal(wordKey("apple"), wordKey("APPLE"));
});

test("wordKeySet собирает ключи уже имеющихся слов", () => {
  const set = wordKeySet([{ english: "Apple" }, { english: "take off" }]);
  assert.ok(set.has("apple"));
  assert.ok(set.has("take off"));
  assert.equal(set.size, 2);
});

// ── planCatalogCopy ─────────────────────────────────────────────────────────

test("planCatalogCopy переносит все поля слова в колоду-получателя", () => {
  const { rows, skipped } = planCatalogCopy(7, [catalogWord(1, "apple")], new Set());

  assert.equal(skipped, 0);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    deckId: 7,
    english: "apple",
    partOfSpeech: "noun",
    translationsRu: ["перевод"],
    ipa: "/test/",
    exampleEn: "An example.",
    exampleRu: "Пример.",
    cefrLevel: "A1",
    emoji: "🍎",
    sortOrder: 0,
  });
});

test("planCatalogCopy пропускает слова, которые уже есть в колоде", () => {
  const existing = wordKeySet([{ english: "Apple" }]);
  const { rows, skipped } = planCatalogCopy(7, [catalogWord(1, "apple"), catalogWord(2, "bread")], existing);

  assert.equal(skipped, 1);
  assert.deepEqual(rows.map((r) => r.english), ["bread"]);
});

test("planCatalogCopy убирает повторы внутри самой выборки", () => {
  // одно и то же слово выбрано из двух разных тематических колод
  const { rows, skipped } = planCatalogCopy(7, [
    catalogWord(1, "water"),
    catalogWord(2, "Water"),
    catalogWord(3, "bread"),
  ], new Set());

  assert.equal(skipped, 1);
  assert.deepEqual(rows.map((r) => r.english), ["water", "bread"]);
});

test("planCatalogCopy сохраняет порядок выбора в sortOrder и продолжает нумерацию", () => {
  const { rows } = planCatalogCopy(7, [
    catalogWord(1, "one"),
    catalogWord(2, "two"),
    catalogWord(3, "three"),
  ], new Set(), 12);

  assert.deepEqual(rows.map((r) => r.sortOrder), [12, 13, 14]);
});

test("planCatalogCopy не сбивает нумерацию sortOrder из-за пропущенных слов", () => {
  const existing = wordKeySet([{ english: "two" }]);
  const { rows } = planCatalogCopy(7, [
    catalogWord(1, "one"),
    catalogWord(2, "two"),
    catalogWord(3, "three"),
  ], existing, 0);

  // «two» отброшено — у оставшихся слов подряд идущие 0 и 1, без дырки
  assert.deepEqual(rows.map((r) => [r.english, r.sortOrder]), [["one", 0], ["three", 1]]);
});

test("planCatalogCopy отбрасывает пустые английские значения", () => {
  const { rows, skipped } = planCatalogCopy(7, [catalogWord(1, "   "), catalogWord(2, "bread")], new Set());

  assert.equal(skipped, 1);
  assert.deepEqual(rows.map((r) => r.english), ["bread"]);
});

// ── orderByRequestedIds ─────────────────────────────────────────────────────

test("orderByRequestedIds восстанавливает порядок выбора учителя", () => {
  // БД вернула строки в своём порядке
  const rows = [{ id: 3 }, { id: 1 }, { id: 2 }];
  const { ordered, missingIds } = orderByRequestedIds(rows, [2, 3, 1]);

  assert.deepEqual(ordered.map((r) => r.id), [2, 3, 1]);
  assert.deepEqual(missingIds, []);
});

test("orderByRequestedIds сообщает о ненайденных словах", () => {
  const { ordered, missingIds } = orderByRequestedIds([{ id: 1 }], [1, 42]);

  assert.deepEqual(ordered.map((r) => r.id), [1]);
  assert.deepEqual(missingIds, [42]);
});

test("orderByRequestedIds считает повторяющийся id один раз", () => {
  const { ordered, missingIds } = orderByRequestedIds([{ id: 1 }], [1, 1, 1]);

  assert.equal(ordered.length, 1);
  assert.deepEqual(missingIds, []);
});

// ── chunked ─────────────────────────────────────────────────────────────────

test("chunked режет массив на партии", () => {
  assert.deepEqual(chunked([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunked([], 2), []);
});

test("chunked по умолчанию использует партии по 100", () => {
  const parts = chunked(Array.from({ length: 250 }, (_, i) => i));
  assert.deepEqual(parts.map((p) => p.length), [100, 100, 50]);
});

test("chunked не принимает неположительный размер партии", () => {
  assert.throws(() => chunked([1, 2], 0));
});
