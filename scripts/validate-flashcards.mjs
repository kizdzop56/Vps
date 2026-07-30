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

// ── загрузка датасета без tsc/tsx: вырезаем литерал по балансу скобок ──────
// Раньше конец массива искался как последний "];" в файле. После появления в
// том же файле других объявлений (карта картинок и функция emojiFor) такой
// поиск ловил чужую строку, поэтому границы литерала считаем по скобкам,
// пропуская строки и комментарии.
function extractLiteral(src, name, openChar) {
  const closeChar = openChar === "[" ? "]" : "}";
  const start = src.indexOf(`const ${name}`);
  if (start === -1) throw new Error(`в файле нет ${name}`);
  // Литерал начинается после «=», иначе за начало массива можно принять скобки
  // из аннотации типа (SeedDeck[]).
  const eq = src.indexOf("=", start);
  const open = eq === -1 ? -1 : src.indexOf(openChar, eq);
  if (open === -1) throw new Error(`не найдено начало литерала ${name}`);

  let depth = 0;
  let quote = null;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    const prev = src[i - 1];
    if (quote) {
      if (ch === quote && prev !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
    if (ch === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i === -1) break; continue; }
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`не закрыт литерал ${name}`);
}

// Литералы — наш собственный файл в репозитории, в них только строки, массивы
// и объекты, поэтому вычисляем их напрямую.
function loadDecks() {
  return new Function(`return ${extractLiteral(readFileSync(FILE, "utf8"), "SEED_DECKS", "[")};`)();
}

function loadEmojiLiteral() {
  return extractLiteral(readFileSync(FILE, "utf8"), "WORD_EMOJI", "{");
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

// ── карта картинок-подсказок (WORD_EMOJI) ─────────────────────────────────
// Картинка показывается на лице карточки, поэтому ключ обязан совпадать со
// словом из датасета: опечатка в ключе — молча потерянная картинка.
const allWords = new Set();
for (const d of decks) for (const w of d.words ?? []) if (w?.en) allWords.add(w.en.toLowerCase());

let emojiCount = 0;
try {
  const literal = loadEmojiLiteral();
  const map = new Function(`return ${literal};`)();
  const keys = Object.keys(map);
  emojiCount = keys.length;

  // Дубликат ключа в объекте JS молча перетирается — ловим по тексту литерала.
  const declared = (literal.match(/(^|[\s{,])([a-z][a-z'\- ]*)\s*:/gi) ?? []).length;
  if (declared !== keys.length) {
    err(`WORD_EMOJI: объявлено ${declared} ключей, уникальных ${keys.length} — есть дубликат ключа`);
  }

  if (emojiCount < 20) err(`WORD_EMOJI: всего ${emojiCount} картинок — карта почти пуста`);

  const usage = new Map();
  for (const [key, value] of Object.entries(map)) {
    const K = `WORD_EMOJI["${key}"]`;
    if (key !== key.trim().toLowerCase()) err(`${K}: ключ должен быть словом в нижнем регистре без пробелов по краям`);
    if (!allWords.has(key)) err(`${K}: такого слова нет в датасете — картинка никогда не покажется`);
    if (typeof value !== "string" || value.length === 0) { err(`${K}: пустая картинка`); continue; }
    if (LATIN.test(value) || CYRILLIC.test(value)) err(`${K}: в картинке буквы → ${JSON.stringify(value)}`);
    // Эмодзи бывает составным (флаги, семьи, модификаторы), но не текстом.
    if ([...value].length > 8) err(`${K}: слишком длинная картинка → ${JSON.stringify(value)}`);
    usage.set(value, (usage.get(value) ?? 0) + 1);
  }

  for (const [value, n] of usage) {
    if (n >= 4) warn(`картинка ${value} повторяется у ${n} слов — ребёнку будет сложно их различать`);
  }
} catch (e) {
  err(`WORD_EMOJI: не удалось разобрать карту картинок — ${e.message}`);
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
console.log(`Картинок-подсказок: ${emojiCount}`);

for (const w of warnings) console.log(`⚠️  ${w}`);

if (errors.length > 0) {
  console.log("");
  for (const e of errors) console.log(`❌ ${e}`);
  console.log(`\n===== ошибок: ${errors.length} =====`);
  process.exit(1);
}

console.log(`\n===== датасет корректен, ошибок нет =====`);
