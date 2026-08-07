// Отчёт по примерам употребления в карточках-словах.
//
//   node scripts/validate-examples.mjs      (или pnpm validate:examples)
//
// Зачем: пример на карточке — единственное место, где ученик видит, как слово
// живёт в речи. В автогенерированном каталоге (vocabulary-{level}.ts) часть
// карточек осталась без примера, и правятся они не в самом каталоге, а слоем
// scripts/src/data/example-fixes.ts (генератор затирает каталог целиком).
// Скрипт показывает, сколько ещё не покрыто, и ловит опечатки в ключах правок:
// ключ, которого нет в датасете, — молча потерянная правка.
//
// Зависимостей нет и tsc не нужен: файлы читаются как текст, как и в
// validate-flashcards.mjs.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(here, "src/data");
const FIXES = path.join(DATA, "example-fixes.ts");
const SHOW = 12; // сколько слов показывать в списке по каждому уровню

// Карточка в датасете — однострочный литерал без вложенных фигурных скобок,
// поэтому «до ближайшей }» — надёжная граница: пример соседней карточки
// подхватить нельзя.
const WORD_RE =
  /\{\s*en:\s*"((?:[^"\\]|\\.)*)"[^}]*?exEn:\s*"((?:[^"\\]|\\.)*)"\s*,\s*exRu:\s*"((?:[^"\\]|\\.)*)"\s*,\s*cefr:\s*"([A-C][12])"/g;
const FIX_KEY_RE = /^\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*)):\s*\{/gm;

const files = readdirSync(DATA)
  .filter((f) => f === "flashcards-data.ts" || /^vocabulary-[a-c][12]\.ts$/.test(f))
  .sort();

const words = new Map(); // слово → { levels:Set, empty:boolean }
for (const file of files) {
  const src = readFileSync(path.join(DATA, file), "utf8");
  for (const m of src.matchAll(WORD_RE)) {
    const [, en, exEn, exRu, cefr] = m;
    const key = en.trim().toLowerCase();
    const entry = words.get(key) ?? { levels: new Set(), empty: false };
    entry.levels.add(cefr);
    if (!exEn.trim() || !exRu.trim()) entry.empty = true;
    words.set(key, entry);
  }
}

if (words.size === 0) {
  console.error("❌ не удалось разобрать ни одной карточки — изменился формат датасета?");
  process.exit(1);
}

const fixSrc = readFileSync(FIXES, "utf8");
const fixed = new Set();
for (const m of fixSrc.matchAll(FIX_KEY_RE)) fixed.add((m[1] ?? m[2]).trim().toLowerCase());
// Служебные объекты в том же файле (тип ExampleFix и т.п.) ключами не считаем.
for (const junk of ["exen", "exru", "pos", "ipa"]) fixed.delete(junk);

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const byLevel = new Map(LEVELS.map((l) => [l, { total: 0, empty: [], covered: 0 }]));

for (const [word, { levels, empty }] of words) {
  for (const level of levels) {
    const bucket = byLevel.get(level);
    if (!bucket) continue;
    bucket.total++;
    if (!empty) continue;
    if (fixed.has(word)) bucket.covered++;
    else bucket.empty.push(word);
  }
}

console.log(`Файлов датасета: ${files.length}, уникальных карточек: ${words.size}`);
console.log(`Ручных правок: ${fixed.size}\n`);

let remaining = 0;
for (const level of LEVELS) {
  const { total, empty, covered } = byLevel.get(level);
  if (total === 0) continue;
  remaining += empty.length;
  const done = covered + (total - empty.length - covered);
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  console.log(`${level}: карточек ${total}, без примера ${empty.length + covered} (правками закрыто ${covered}), с примером ${pct}%`);
  if (empty.length > 0) {
    console.log(`   осталось: ${empty.slice(0, SHOW).join(", ")}${empty.length > SHOW ? `, … ещё ${empty.length - SHOW}` : ""}`);
  }
}

// Ключ правки, которого нет в датасете — опечатка: правка не применится никогда.
const unknown = [...fixed].filter((w) => !words.has(w));
if (unknown.length > 0) {
  console.log(`\n❌ ключи правок, которых нет в датасете (${unknown.length}): ${unknown.join(", ")}`);
  console.log("   поправьте ключ в scripts/src/data/example-fixes.ts — иначе правка не применится");
  process.exit(1);
}

console.log(`\n===== без примера осталось ${remaining} карточек =====`);
