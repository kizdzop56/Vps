// Отчёт по примерам употребления в карточках-словах.
//
//   node scripts/validate-examples.mjs      (или pnpm validate:examples)
//
// Зачем: пример на карточке — единственное место, где ученик видит, как слово
// живёт в речи. В автогенерированном каталоге (vocabulary-{level}.ts) часть
// карточек осталась без примера, и правятся они не в самом каталоге, а слоем
// scripts/src/data/example-fixes*.ts (генератор затирает каталог целиком).
// Скрипт показывает, сколько ещё не покрыто, и ловит две ошибки, которые иначе
// проходят молча: ключ правки, которого нет в датасете, и один ключ в двух
// файлах уровней (при слиянии карт он перетирается).
//
// Зависимостей нет и tsc не нужен: файлы читаются как текст, как и в
// validate-flashcards.mjs.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(here, "src/data");
const SHOW = 12; // сколько слов показывать в списке по каждому уровню

// Карточка в датасете — однострочный литерал без вложенных фигурных скобок,
// поэтому «до ближайшей }» — надёжная граница: пример соседней карточки
// подхватить нельзя.
const WORD_RE =
  /\{\s*en:\s*"((?:[^"\\]|\\.)*)"[^}]*?exEn:\s*"((?:[^"\\]|\\.)*)"\s*,\s*exRu:\s*"((?:[^"\\]|\\.)*)"\s*,\s*cefr:\s*"([A-C][12])"/g;
const FIX_KEY_RE = /^\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*)):\s*\{/gm;

const dataFiles = readdirSync(DATA);
const catalogFiles = dataFiles
  .filter((f) => f === "flashcards-data.ts" || /^vocabulary-[a-c][12]\.ts$/.test(f))
  .sort();
const fixFiles = dataFiles.filter((f) => /^example-fixes-[a-c][12]\.ts$/.test(f)).sort();

const words = new Map(); // слово → { levels:Set, empty:boolean }
for (const file of catalogFiles) {
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

const errors = [];
const fixed = new Map(); // ключ → файл, в котором объявлен
for (const file of fixFiles) {
  const src = readFileSync(path.join(DATA, file), "utf8");
  for (const m of src.matchAll(FIX_KEY_RE)) {
    const key = (m[1] ?? m[2]).trim().toLowerCase();
    // Служебные объекты в тех же файлах (тип ExampleFix и т.п.) ключами не считаем.
    if (["exen", "exru", "pos", "ipa"].includes(key)) continue;
    const seen = fixed.get(key);
    if (seen) errors.push(`ключ "${key}" объявлен дважды: ${seen} и ${file} — при слиянии карт один перетрёт другой`);
    else fixed.set(key, file);
  }
}

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

console.log(`Файлов каталога: ${catalogFiles.length}, уникальных карточек: ${words.size}`);
console.log(`Файлов правок: ${fixFiles.length}, правок всего: ${fixed.size}\n`);

let remaining = 0;
for (const level of LEVELS) {
  const { total, empty, covered } = byLevel.get(level);
  if (total === 0) continue;
  remaining += empty.length;
  const withExample = total - empty.length;
  const pct = Math.round((withExample / total) * 100);
  console.log(`${level}: карточек ${total}, без примера ${empty.length + covered} (правками закрыто ${covered}), с примером ${pct}%`);
  if (empty.length > 0) {
    console.log(`   осталось: ${empty.slice(0, SHOW).join(", ")}${empty.length > SHOW ? `, … ещё ${empty.length - SHOW}` : ""}`);
  }
}

// Ключ правки, которого нет в датасете — опечатка: правка не применится никогда.
for (const [key, file] of fixed) {
  if (!words.has(key)) errors.push(`"${key}" (${file}): такого слова нет в датасете — правка не применится`);
}

if (errors.length > 0) {
  console.log("");
  for (const e of errors) console.log(`❌ ${e}`);
  console.log(`\n===== ошибок: ${errors.length} =====`);
  process.exit(1);
}

console.log(`\n===== без примера осталось ${remaining} карточек =====`);
