// Шаг 5. Сборка колод из проверенных данных.
//
//   node scripts/tools/lexicon/5-build-decks.mjs
//
// На каждую тематику — шесть колод (A1…C2). В карточку попадает только то, что
// подтверждено источником:
//   слово и уровень   — тематический словарь Oxford + метка Cambridge (EVP);
//   транскрипция      — Cambridge (у фраз — склейка транскрипций слов);
//   перевод           — Cambridge English–Russian;
//   пример и перевод  — готовая пара из параллельного корпуса OPUS.
// Карточка без любого из полей не собирается, а отбрасывается.
import { writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { cachePath, readJson, ROOT, CEFR, ensureDir } from "./lib.mjs";

const TARGET_SIZE = 30;
const PHRASES_TARGET = 8;

const THEMES = {
  food:        { title: "Еда и напитки",     emoji: "🍔", what: "еде, напитках и застолье" },
  animals:     { title: "Животные",          emoji: "🐾", what: "животных, птицах и насекомых" },
  transport:   { title: "Транспорт",         emoji: "🚗", what: "транспорте и дорожном движении" },
  family:      { title: "Семья",             emoji: "👨‍👩‍👧", what: "семье, родственниках и отношениях" },
  home:        { title: "Дом",               emoji: "🏠", what: "доме, квартире и быте" },
  body_health: { title: "Тело и здоровье",   emoji: "🩺", what: "теле, здоровье и медицине" },
  work:        { title: "Работа и карьера",  emoji: "💼", what: "работе, профессиях и деньгах" },
  nature:      { title: "Природа",           emoji: "🌿", what: "природе, погоде и экологии" },
  technology:  { title: "Технологии",        emoji: "💻", what: "технике, интернете и науке" },
  travel:      { title: "Путешествия",       emoji: "✈️", what: "путешествиях, отдыхе и покупках" },
  irregular_verbs: { title: "Неправильные глаголы", emoji: "🔤", what: "неправильных глаголах, фразовых глаголах и идиомах на их основе" },
};

const LEVEL_HINT = {
  A1: "первые слова темы",
  A2: "базовый набор для простых разговоров",
  B1: "уверенная лексика для повседневных ситуаций",
  B2: "развёрнутая лексика, включая абстрактные понятия",
  C1: "продвинутая лексика и точные формулировки",
  C2: "тонкие оттенки значения и редкая лексика",
};

// ── чистка данных ────────────────────────────────────────────────────────
const CYRILLIC = /[а-яёА-ЯЁ]/;
const LATIN = /[a-zA-Z]/;
const CJK = /[　-〿㐀-䶿一-鿿豈-﫿]/;

// Валидатор датасета ругается на слово, где перемешаны кириллица и латиница
// (частая опечатка). В переводах из словаря такое тоже встречается — отсеиваем.
function mixedScript(text) {
  for (const token of text.split(/[\s.,!?()«»"'—–:;]+/)) {
    if (token && CYRILLIC.test(token) && LATIN.test(token)) return true;
  }
  return false;
}

function cleanRu(list) {
  const take = (maxLen) => {
    const out = [];
    for (let t of list) {
      t = t.replace(/\s+/g, " ").replace(/[.,;]+$/, "").trim();
      if (!t || !CYRILLIC.test(t) || CJK.test(t) || mixedScript(t)) continue;
      if (t.length > maxLen) continue;
      if (/^\(/.test(t)) continue;
      if (/и т\.\s*д|и т\.\s*п/.test(t)) continue;   // описательное толкование, а не перевод
      if (!out.includes(t)) out.push(t);
      if (out.length === 3) break;
    }
    return out;
  };
  // Сначала короткие переводы; длинное толкование берём, только если другого нет.
  const short = take(40);
  return short.length ? short : take(60);
}

function goodExample(pair) {
  if (!pair) return null;
  const { en, ru } = pair;
  if (!en || !ru) return null;
  if (!CYRILLIC.test(ru) || CJK.test(ru) || mixedScript(ru)) return null;
  // Реплики в кавычках («"A cat?" asked the old man.») на карточке смотрятся
  // странно — берём обычные повествовательные предложения.
  if (/["“”«»]/.test(en) || /["“”«»]/.test(ru)) return null;
  // финальный знак у пары должен совпадать: иначе перевод явно «не про то»
  const endEn = en.slice(-1);
  const endRu = ru.slice(-1);
  if (".!?".includes(endEn) && ".!?".includes(endRu) && endEn !== endRu) return null;
  return pair;
}

// Пример обязан содержать само слово (в любой форме) — страховка от пары,
// которая подобралась по однокоренному слову.
function mentions(sentence, target) {
  const tokens = sentence.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
  const parts = target.toLowerCase().split(/\s+/);
  return parts.every((part) =>
    tokens.some((t) => t === part || (t.length >= part.length - 1 && t.startsWith(part.slice(0, part.length - 1))))
  );
}

const PARTICLES = new Set(["up", "out", "off", "on", "in", "away", "back", "over", "down", "through", "round", "about", "after", "into", "for", "with", "to"]);

function posFor(rec) {
  const en = rec.en;
  if (/\s/.test(en)) {
    const tokens = en.split(/\s+/);
    if (tokens.length === 2 && PARTICLES.has(tokens[1])) return "phrasal verb";
    if (tokens.length >= 3) return "idiom";
    return "collocation";
  }
  const pos = (rec.pos || "").toLowerCase();
  if (pos.startsWith("noun")) return "noun";
  if (pos.startsWith("verb")) return "verb";
  if (pos.startsWith("adject")) return "adjective";
  if (pos.startsWith("adverb")) return "adverb";
  if (pos.startsWith("prepos")) return "preposition";
  if (pos.startsWith("conjunc")) return "conjunction";
  if (pos.startsWith("pronoun")) return "pronoun";
  if (pos.startsWith("determin")) return "determiner";
  if (pos.startsWith("number")) return "number";
  if (pos.startsWith("exclam")) return "exclamation";
  return pos || "noun";
}

// Карточка целиком: собирается, только если есть все поля из источников.
function makeCard(rec, examples, level) {
  const ru = cleanRu(rec.ru ?? []);
  if (!ru.length) return null;
  if (!rec.ipa) return null;

  const pool = examples[rec.en.toLowerCase()] ?? [];
  const pair = pool.map(goodExample).find((p) => p && mentions(p.en, rec.en));
  if (!pair) return null;

  // У неправильных глаголов к переводу примера дописываем три формы — так же,
  // как было в прежней колоде: «(go — went — gone)».
  const forms = rec.forms ? ` (${rec.forms.join(" — ")})` : "";

  return {
    en: rec.en,
    pos: posFor(rec),
    ru,
    ipa: `/${rec.ipa}/`,
    exEn: pair.en,
    exRu: pair.ru + forms,
    cefr: level,
    corpus: pair.corpus,
  };
}

// Порядок отбора: сначала слова, размеченные самим Cambridge (English
// Vocabulary Profile), потом короткие и частотные — они полезнее в колоде.
function rank(rec) {
  return (rec.src === "cambridge" ? 0 : 1000) + rec.en.length;
}

function buildTheme(theme, examples, usedGlobally) {
  const words = Object.values(readJson(cachePath("verified", `${theme}.json`), {})).filter(Boolean);
  const phrases = Object.values(readJson(cachePath("phrases", `${theme}.json`), {})).filter((r) => r && r.ipa);

  // Тема неправильных глаголов собирает свои фразовые глаголы и идиомы по всему
  // кэшу: они рассыпаны по тематическим файлам, а построены на тех же глаголах.
  if (theme === "irregular_verbs") {
    const bases = new Set(Object.keys(readJson(cachePath("verified", "irregular_verbs.json"), {})));
    const known = new Set(phrases.map((p) => p.en));
    for (const file of readdirSync(cachePath("phrases"))) {
      for (const rec of Object.values(readJson(path.join(cachePath("phrases"), file), {}))) {
        if (!rec || !rec.ipa || known.has(rec.en)) continue;
        if (!bases.has(rec.en.split(/\s+/)[0])) continue;
        known.add(rec.en);
        phrases.push(rec);
      }
    }
  }

  const usedInTheme = new Set();
  const decks = [];

  for (const level of CEFR) {
    const cards = [];

    const pick = (pool, limit, globalDedup = true) => {
      for (const rec of pool.slice().sort((a, b) => rank(a) - rank(b))) {
        if (cards.length >= limit) break;
        const key = rec.en.toLowerCase();
        if (usedInTheme.has(key)) continue;          // внутри темы слово только раз
        if (globalDedup && usedGlobally.has(key)) continue;  // слова стараемся не повторять между темами
        const card = makeCard(rec, examples, level);
        if (!card) continue;
        cards.push(card);
        usedInTheme.add(key);
      }
    };

    // Сначала словосочетания: их мало, и они не должны вытесняться словами.
    // Между темами фразы повторяться могут — на нижних уровнях словарь размечает
    // считаные единицы, и запрет на повтор оставил бы колоды вовсе без фраз.
    pick(phrases.filter((p) => p.cefr === level), PHRASES_TARGET, false);
    const phraseCount = cards.length;
    pick(words.filter((w) => w.cefr === level && /\s/.test(w.en) === false), TARGET_SIZE);

    // если из-за глобальной дедупликации не добрали — разрешаем повтор из другой темы
    if (cards.length < TARGET_SIZE) {
      for (const rec of [...phrases, ...words].filter((r) => r.cefr === level).sort((a, b) => rank(a) - rank(b))) {
        if (cards.length >= TARGET_SIZE) break;
        const key = rec.en.toLowerCase();
        if (usedInTheme.has(key)) continue;
        const card = makeCard(rec, examples, level);
        if (!card) continue;
        cards.push(card);
        usedInTheme.add(key);
      }
    }

    for (const c of cards) usedGlobally.add(c.en.toLowerCase());

    decks.push({ theme: `${theme}_${level.toLowerCase()}`, level, cards, phraseCount });
  }

  return decks;
}

// ── запись файла темы ────────────────────────────────────────────────────
const q = (s) => JSON.stringify(s);

function renderTheme(theme, decks) {
  const meta = THEMES[theme];
  const head = `// Тематические колоды «${meta.title}» на все уровни CEFR.
//
// Файл собран скриптом scripts/tools/lexicon/5-build-decks.mjs из проверенных
// источников: слова и уровни — тематический словарь Oxford и метки Cambridge
// (English Vocabulary Profile), транскрипция и переводы — Cambridge Dictionary,
// примеры с переводом — параллельные корпуса OPUS. Править руками не нужно:
// прогоните конвейер заново.
import type { SeedDeck } from "../types";

export const ${theme.toUpperCase()}_DECKS: SeedDeck[] = [
`;

  const body = decks
    .map((d) => {
      const words = d.cards
        .map((c) => `      { en: ${q(c.en)}, pos: ${q(c.pos)}, ru: [${c.ru.map(q).join(", ")}], ipa: ${q(c.ipa)}, exEn: ${q(c.exEn)}, exRu: ${q(c.exRu)}, cefr: ${q(c.cefr)} },`)
        .join("\n");
      return `  {
    theme: ${q(d.theme)},
    title: ${q(`${meta.title} · ${d.level}`)},
    emoji: ${q(meta.emoji)},
    description: ${q(`Слова и словосочетания о ${meta.what} — ${LEVEL_HINT[d.level]}.`)},
    cefrLevel: ${q(d.level)},
    words: [
${words}
    ],
  },`;
    })
    .join("\n");

  return `${head}${body}
];
`;
}

function main() {
  const examples = readJson(cachePath("examples.json"), {});
  const outDir = path.join(ROOT, "scripts/src/data/decks");
  ensureDir(outDir);

  const usedGlobally = new Set();
  const summary = [];

  for (const theme of Object.keys(THEMES)) {
    const decks = buildTheme(theme, examples, usedGlobally);
    writeFileSync(path.join(outDir, `${theme}.ts`), renderTheme(theme, decks));
    summary.push([theme, decks]);
  }

  console.log("тема".padEnd(13) + CEFR.map((l) => l.padStart(9)).join(""));
  let total = 0;
  for (const [theme, decks] of summary) {
    const row = decks.map((d) => `${d.cards.length}/${d.phraseCount}`.padStart(9)).join("");
    total += decks.reduce((s, d) => s + d.cards.length, 0);
    console.log(theme.padEnd(13) + row);
  }
  console.log(`\nвсего карточек: ${total} (в ячейке «карточек/из них словосочетаний»)`);
}

main();
