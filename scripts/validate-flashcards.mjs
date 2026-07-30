// Проверка офлайн-датасета флеш-карточек (scripts/src/data/flashcards-data.ts).
//
//   node scripts/validate-flashcards.mjs
//
// Зачем: датасет — обычный TS-литерал, который правится руками, а ошибки в нём
// попадают прямо в учебный материал (битый перевод, отсутствующая транскрипция,
// дубликат слова, уровень без колод). Тест зависимостей не требует и работает на
// любой версии Node: файл читается как текст, из него вырезается литерал массива.
// Поэтому запускать можно и до `pnpm install`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(here, "src/data/flashcards-data.ts");

const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"];
// Части речи, которые считаются словосочетанием/фразеологизмом (не одиночным словом).
const PHRASE_POS = new Set(["phrase", "idiom", "collocation", "phrasal verb"]);
const MIN_DECKS_PER_LEVEL = 2;

// ── загрузка датасета без tsc/tsx: вырезаем литерал массива ────────────
function loadDecks() {
  const src = readFileSync(FILE, "utf8");
  const start = src.indexOf("SEED_DECKS");
  if (start === -1) throw new Error("в файле нет SEED_DECKS");
  const open = src.indexOf("[", start);
  const close = src.lastIndexOf("];");
  if (open === -1 || close === -1 || close < open) throw new Error("не найден литерал массива SEED_DECKS");
  const literal = src.slice(open, close + 1);
  // Литерал — наш собственный файл в репозитории и содержит только строки,
  // массивы и объекты, поэтому вычисляем его напрямую.
  return new Function(`return ${literal};`)();
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

  // Требование задачи: в каждой колоде есть не только слова, но и словосочетания.
  if (phrasesHere === 0) err(`${D}: нет ни одного словосочетания/фразеологизма`);
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

for (const w of warnings) console.log(`⚠️  ${w}`);

if (errors.length > 0) {
  console.log("");
  for (const e of errors) console.log(`❌ ${e}`);
  console.log(`\n===== ошибок: ${errors.length} =====`);
  process.exit(1);
}

console.log(`\n===== датасет корректен, ошибок нет =====`);
