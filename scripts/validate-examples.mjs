// Отчёт по примерам употребления в карточках-словах.
//
//   node scripts/validate-examples.mjs      (или pnpm validate:examples)
//
// Зачем: пример на карточке — единственное место, где ученик видит, как слово
// живёт в речи. В автогенерированном каталоге (vocabulary-{level}.ts) часть
// карточек осталась без примера, и правятся они не в самом каталоге, а слоями
// в scripts/src/data (генератор затирает каталог целиком):
//
//   example-fixes-{level}.ts — исправленные примеры, части речи, транскрипции;
//   polysemous.ts            — многозначные слова: одиночная карточка убрана,
//                              каждый смысл заведён словосочетанием.
//
// Скрипт показывает остаток без примера и ловит ошибки, которые иначе проходят
// молча: ключ правки, которого нет в датасете; один ключ в двух файлах уровней
// (при слиянии карт перетирается); многозначное слово с одним смыслом (слово
// просто потерялось бы); фраза в несуществующей колоде, чужого уровня или
// дублирующая каталог (сид её отбросит); фраза, в которой нет самого слова.
//
// Зависимостей нет и tsc не нужен: файлы читаются как текст, как и в
// validate-flashcards.mjs.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(here, "src/data");
const POLY = "polysemous.ts";
const SHOW = 12; // сколько слов показывать в списке по каждому уровню

// Карточка в датасете — однострочный литерал без вложенных фигурных скобок,
// поэтому «до ближайшей }» — надёжная граница: пример соседней карточки
// подхватить нельзя.
const WORD_RE =
  /\{\s*en:\s*"((?:[^"\\]|\\.)*)"[^}]*?exEn:\s*"((?:[^"\\]|\\.)*)"\s*,\s*exRu:\s*"((?:[^"\\]|\\.)*)"\s*,\s*cefr:\s*"([A-C][12])"/g;
const FIX_KEY_RE = /^\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*)):\s*\{/gm;
const DECK_THEME_RE = /^\s*theme:\s*"([^"]+)"/gm;
// В polysemous.ts слово и его фразы идут подряд, поэтому оба вида записей
// собираем одним проходом и фразу относим к последнему встреченному слову.
const POLY_RE =
  /word:\s*"([^"]+)"|theme:\s*"([^"]+)",\s*en:\s*"((?:[^"\\]|\\.)*)"[^}]*?cefr:\s*"([A-C][12])"/g;

const errors = [];
const dataFiles = readdirSync(DATA);
const catalogFiles = dataFiles
  .filter((f) => f === "flashcards-data.ts" || /^vocabulary-[a-c][12]\.ts$/.test(f))
  .sort();
const levelFixFiles = dataFiles.filter((f) => /^example-fixes-[a-c][12]\.ts$/.test(f)).sort();

// ── каталог: какие слова есть и у кого нет примера ─────────────────────────
const words = new Map(); // слово → { levels:Set, empty:boolean }
const themes = new Set();
for (const file of catalogFiles) {
  const src = readFileSync(path.join(DATA, file), "utf8");
  for (const m of src.matchAll(DECK_THEME_RE)) themes.add(m[1]);
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

// ── многозначные слова: одиночная карточка убрана, смыслы разложены по фразам ─
const ambiguous = new Map(); // слово → массив фраз
if (dataFiles.includes(POLY)) {
  const src = readFileSync(path.join(DATA, POLY), "utf8");
  let current = null;
  for (const m of src.matchAll(POLY_RE)) {
    if (m[1]) {
      current = m[1].trim().toLowerCase();
      if (!ambiguous.has(current)) ambiguous.set(current, []);
      continue;
    }
    if (!current) continue;
    ambiguous.get(current).push({ theme: m[2], en: m[3].trim(), cefr: m[4] });
  }

  for (const [word, list] of ambiguous) {
    if (!words.has(word)) {
      errors.push(`"${word}" (${POLY}): такого слова нет в каталоге — убирать нечего`);
    }
    if (list.length < 2) {
      errors.push(`"${word}" (${POLY}): указан ${list.length} смысл — слово потерялось бы совсем`);
    }
    for (const p of list) {
      if (!themes.has(p.theme)) {
        errors.push(`фраза "${p.en}": колоды "${p.theme}" нет в датасете — карточка не попадёт в базу`);
      }
      // Темы генерируются как {тема}_{уровень}, поэтому уровень колоды виден по
      // её имени: карточка чужого уровня сломала бы марафон и группировку.
      if (!p.theme.endsWith(`_${p.cefr.toLowerCase()}`)) {
        errors.push(`фраза "${p.en}": уровень ${p.cefr} не совпадает с колодой "${p.theme}"`);
      }
      if (words.has(p.en.toLowerCase())) {
        errors.push(`фраза "${p.en}" уже есть в каталоге — сид отбросит дубликат`);
      }
      // Фраза без самого слова учит чему-то другому, а нужный смысл так и не
      // появляется: обычная опечатка при заполнении.
      if (!new RegExp(`(^|[^a-z])${word}(s|es|ed|ing)?([^a-z]|$)`, "i").test(p.en)) {
        errors.push(`фраза "${p.en}" не содержит слова "${word}" — смысл не будет учиться`);
      }
    }
  }
}

// ── правки: ключи по файлам ───────────────────────────────────────────────
const fixed = new Map(); // ключ → файл, в котором объявлен
for (const file of levelFixFiles) {
  const src = readFileSync(path.join(DATA, file), "utf8");
  for (const m of src.matchAll(FIX_KEY_RE)) {
    const key = (m[1] ?? m[2]).trim().toLowerCase();
    // Служебные объекты в тех же файлах (тип ExampleFix и т.п.) ключами не считаем.
    if (["exen", "exru", "pos", "ipa"].includes(key)) continue;
    const seen = fixed.get(key);
    if (seen) {
      errors.push(`ключ "${key}" объявлен дважды: ${seen} и ${file} — при слиянии карт один перетрёт другой`);
    } else {
      fixed.set(key, file);
    }
  }
}

// ── отчёт по уровням ─────────────────────────────────────────────────────
// Многозначные слова в подсчёт не идут: их одиночных карточек в приложении
// больше нет, поэтому «пустой пример» у них ничего не значит.
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const byLevel = new Map(LEVELS.map((l) => [l, { total: 0, empty: [], covered: 0 }]));

for (const [word, { levels, empty }] of words) {
  if (ambiguous.has(word)) continue;
  for (const level of levels) {
    const bucket = byLevel.get(level);
    if (!bucket) continue;
    bucket.total++;
    if (!empty) continue;
    if (fixed.has(word)) bucket.covered++;
    else bucket.empty.push(word);
  }
}

const phraseCount = [...ambiguous.values()].reduce((n, list) => n + list.length, 0);
console.log(`Файлов каталога: ${catalogFiles.length}, уникальных карточек: ${words.size}`);
console.log(`Правок примеров: ${fixed.size}`);
console.log(`Многозначных слов: ${ambiguous.size} (одиночные карточки убраны), словосочетаний вместо них: ${phraseCount}\n`);

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
