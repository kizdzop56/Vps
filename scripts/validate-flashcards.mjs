// Проверка офлайн-датасета флеш-карточек.
//
//   node scripts/validate-flashcards.mjs
//
// Зачем: датасет — обычные TS-литералы, ошибки в них попадают прямо в учебный
// материал (битый перевод, отсутствующая транскрипция, дубликат слова, уровень
// без колод). Тест зависимостей не требует и работает на любой версии Node:
// файлы читаются как текст, из них вырезаются литералы массивов. Поэтому
// запускать можно и до `pnpm install`.
//
// Читаются все части датасета: scripts/src/data/levels.ts (обзорные колоды по
// уровням) и scripts/src/data/decks/*.ts (тематические колоды на каждый уровень).
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(here, "src/data");
const DECKS_DIR = path.join(DATA_DIR, "decks");

const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"];
// Части речи, которые считаются словосочетанием/фразеологизмом (не одиночным словом).
const PHRASE_POS = new Set(["phrase", "idiom", "collocation", "phrasal verb"]);
const MIN_DECKS_PER_LEVEL = 2;
// Сколько карточек ожидаем в тематической колоде уровня.
const MIN_CARDS_PER_DECK = 12;

// ── загрузка датасета без tsc/tsx: вырезаем литералы массивов ──────────
function loadFile(file) {
  const src = readFileSync(file, "utf8");
  const marker = src.indexOf("SeedDeck[] = ");
  if (marker === -1) return [];
  const open = src.indexOf("[", marker);
  const close = src.lastIndexOf("];");
  if (open === -1 || close === -1 || close < open) {
    throw new Error(`${path.basename(file)}: не найден литерал массива колод`);
  }
  const literal = src.slice(open, close + 1);
  // Литералы — наши собственные файлы в репозитории, внутри только строки,
  // массивы и объекты, поэтому вычисляем их напрямую.
  return new Function(`return ${literal};`)();
}

function loadDecks() {
  const files = [
    path.join(DATA_DIR, "levels.ts"),
    ...readdirSync(DECKS_DIR).filter((f) => f.endsWith(".ts")).sort().map((f) => path.join(DECKS_DIR, f)),
  ];
  const decks = [];
  for (const file of files) {
    for (const deck of loadFile(file)) decks.push({ ...deck, __file: path.basename(file) });
  }
  return decks;
}

const errors = [];
const warnings = [];
const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const CYRILLIC = /[а-яёА-ЯЁ]/;
const LATIN = /[a-zA-Z]/;
// Диапазоны CJK — попадают в текст при копировании/ошибках раскладки.
const CJK = /[　-〿㐀-䶿一-鿿豈-﫿]/;

function checkRussian(label, text) {
  if (CJK.test(text)) err(`${label}: посторонние иероглифы CJK → ${JSON.stringify(text)}`);
  if (!CYRILLIC.test(text)) err(`${label}: нет кириллицы → ${JSON.stringify(text)}`);
  // Слово со смешанной раскладкой (латиница внутри русского слова) — частая
  // опечатка вида "galочки", которую глазами не видно.
  for (const token of text.split(/[\s.,!?()«»"'—–:;]+/)) {
    if (token && CYRILLIC.test(token) && LATIN.test(token)) {
      err(`${label}: смешанная раскладка в слове "${token}" → ${JSON.stringify(text)}`);
    }
  }
}

let decks;
try {
  decks = loadDecks();
} catch (e) {
  console.error(`❌ не удалось разобрать датасет: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(decks) || decks.length === 0) {
  console.error("❌ SEED_DECKS пуст");
  process.exit(1);
}

const themes = new Set();
const decksByLevel = new Map();
let totalEntries = 0;
let totalPhrases = 0;

for (const d of decks) {
  const D = `колода "${d?.theme ?? "?"}"`;

  for (const field of ["theme", "title", "emoji", "description"]) {
    if (!d?.[field] || typeof d[field] !== "string") err(`${D}: пустое поле ${field}`);
  }
  if (d?.title) checkRussian(`${D}.title`, d.title);
  if (d?.description) checkRussian(`${D}.description`, d.description);

  if (themes.has(d.theme)) err(`${D}: theme дублируется — сид ищет колоду по theme, будет коллизия`);
  themes.add(d.theme);

  if (d.cefrLevel !== undefined) {
    if (!CEFR.includes(d.cefrLevel)) err(`${D}: cefrLevel "${d.cefrLevel}" вне A1..C2`);
    else decksByLevel.set(d.cefrLevel, (decksByLevel.get(d.cefrLevel) ?? 0) + 1);
  }

  if (!Array.isArray(d.words) || d.words.length === 0) {
    err(`${D}: нет карточек`);
    continue;
  }

  const seen = new Map();
  let phrasesHere = 0;

  for (const w of d.words) {
    totalEntries++;
    const W = `${D}, карточка "${w?.en ?? "?"}"`;

    if (!w?.en || typeof w.en !== "string") { err(`${W}: пустое en`); continue; }

    // Сид дедуплицирует слова внутри колоды по lower(english): дубликат просто
    // не попадёт в базу, то есть карточка будет молча потеряна.
    const key = w.en.toLowerCase();
    if (seen.has(key)) err(`${D}: дубликат "${w.en}" — сид его отбросит`);
    seen.set(key, true);

    if (!w.pos) err(`${W}: не указана часть речи (pos)`);
    if (PHRASE_POS.has(w.pos)) { phrasesHere++; totalPhrases++; }

    if (!Array.isArray(w.ru) || w.ru.length === 0) err(`${W}: нет переводов ru`);
    else w.ru.forEach((r, i) => checkRussian(`${W}.ru[${i}]`, r));

    if (!w.ipa) err(`${W}: нет транскрипции ipa`);
    else if (!/^\/.+\/$/.test(w.ipa)) err(`${W}: ipa должна быть в слешах → ${JSON.stringify(w.ipa)}`);

    if (!w.exEn) err(`${W}: нет примера exEn`);
    else if (!LATIN.test(w.exEn)) err(`${W}: exEn без латиницы → ${JSON.stringify(w.exEn)}`);

    if (!w.exRu) err(`${W}: нет перевода примера exRu`);
    else checkRussian(`${W}.exRu`, w.exRu);

    if (!CEFR.includes(w.cefr)) err(`${W}: cefr "${w.cefr}" вне A1..C2`);

    // В уровневой колоде все карточки должны быть её уровня, иначе марафон и
    // группировка по уровням покажут не то, что обещает название колоды.
    if (d.cefrLevel && w.cefr !== d.cefrLevel) {
      err(`${W}: уровень карточки ${w.cefr} ≠ уровень колоды ${d.cefrLevel}`);
    }
  }

  // В колоде должны быть не только слова, но и словосочетания. Исключение —
  // уровень A1: словарь размечает единицы многословных статей этого уровня, и
  // добирать их «на глаз» значило бы вносить непроверенные данные.
  if (phrasesHere === 0 && d.cefrLevel !== "A1") {
    err(`${D}: нет ни одного словосочетания/фразеологизма`);
  }

  if (d.words.length < MIN_CARDS_PER_DECK) {
    warn(`${D}: всего ${d.words.length} карточек (ожидается ≥${MIN_CARDS_PER_DECK})`);
  }
}

// Каждый уровень CEFR должен предлагать колоды: placement-тест умеет выдать
// любой уровень вплоть до C2, и ученик не должен попасть в пустой раздел.
for (const level of CEFR) {
  const n = decksByLevel.get(level) ?? 0;
  if (n === 0) err(`уровень ${level}: нет ни одной колоды`);
  else if (n < MIN_DECKS_PER_LEVEL) warn(`уровень ${level}: только ${n} колода (ожидается ≥${MIN_DECKS_PER_LEVEL})`);
}

// ── отчёт ──────────────────────────────────────────────────────────────
console.log(`Колод: ${decks.length}`);
console.log(`Карточек: ${totalEntries} (из них словосочетаний/фразеологизмов: ${totalPhrases})`);
console.log(`Колод по уровням: ${CEFR.map((l) => `${l}:${decksByLevel.get(l) ?? 0}`).join("  ")}`);

// Тематика должна быть представлена на каждом уровне: ключ темы — <тема>_<уровень>.
const byBaseTheme = new Map();
for (const d of decks) {
  const m = /^(.+)_(a1|a2|b1|b2|c1|c2)$/.exec(d.theme);
  if (!m) continue;
  if (!byBaseTheme.has(m[1])) byBaseTheme.set(m[1], new Set());
  byBaseTheme.get(m[1]).add(m[2].toUpperCase());
}
for (const [base, levels] of byBaseTheme) {
  const missing = CEFR.filter((l) => !levels.has(l));
  if (missing.length) err(`тематика "${base}": нет колод на уровнях ${missing.join(", ")}`);
}
console.log(`Тематик с колодами на все уровни: ${[...byBaseTheme].filter(([, l]) => l.size === CEFR.length).length} из ${byBaseTheme.size}`);

for (const w of warnings) console.log(`⚠️  ${w}`);

if (errors.length > 0) {
  console.log("");
  for (const e of errors) console.log(`❌ ${e}`);
  console.log(`\n===== ошибок: ${errors.length} =====`);
  process.exit(1);
}

console.log(`\n===== датасет корректен, ошибок нет =====`);
