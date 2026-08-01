// Импортёр реального словаря CEFR в датасет флеш-карточек.
//
// Источники (только они, ничего не выдумываем):
//  - слова + уровень CEFR: github.com/nalgeon/words — data/oxford-5k.csv
//    (Oxford 3000/5000 с уровнями) и data/oxford-phrase.csv (словосочетания).
//    Кэшируется в scripts/data/, чтобы не дёргать сеть на каждый запуск.
//  - IPA, часть речи, пример предложения: api.dictionaryapi.dev — тот же
//    источник, что уже используется в validateEnglishWord (routes/flashcards.ts).
//  - перевод EN->RU (слова и примера): @workspace/translate (тот же Google
//    Translate, что и в routes/flashcards.ts — вынесен в общий модуль).
//
// Запуск:
//   pnpm --filter @workspace/scripts run import-vocab -- --level=A1 --limit=200
//   pnpm --filter @workspace/scripts run import-vocab -- --level=A1 --theme=food
//   pnpm --filter @workspace/scripts run import-vocab -- --level=A1,A2 --limit=500
//
// Результат пишется в scripts/src/data/vocabulary-{level}.ts (по одному файлу
// на уровень, идемпотентно: повторный запуск дополняет, а не дублирует) и
// собирается в scripts/src/data/vocabulary-index.ts, который читает
// flashcards-data.ts, чтобы добавить слова в SEED_DECKS для сидинга.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { translateWithGoogle } from "@workspace/translate";
import { SEED_DECKS, type SeedDeck, type SeedWord } from "./data/flashcards-data";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data"); // scripts/data (кэш CSV)
const OUT_DIR = path.resolve(__dirname, "data"); // scripts/src/data (генерируемые файлы)

const OXFORD_WORDS_URL = "https://raw.githubusercontent.com/nalgeon/words/main/data/oxford-5k.csv";
const OXFORD_PHRASES_URL = "https://raw.githubusercontent.com/nalgeon/words/main/data/oxford-phrase.csv";

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
type CefrLevel = (typeof CEFR_LEVELS)[number];

// ── CLI-аргументы ────────────────────────────────────────────────────────────
type Args = { levels: CefrLevel[]; limit: number; theme?: string };

function parseArgs(argv: string[]): Args {
  const map = new Map<string, string>();
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) map.set(m[1]!, m[2]!);
  }
  const levelArg = (map.get("level") ?? "A1").toUpperCase();
  const levels = levelArg
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is CefrLevel => (CEFR_LEVELS as readonly string[]).includes(s));
  if (levels.length === 0) {
    throw new Error(`Некорректный --level. Допустимые значения: ${CEFR_LEVELS.join(", ")}`);
  }
  const limit = Number(map.get("limit") ?? "200");
  const theme = map.get("theme")?.trim() || undefined;
  return { levels, limit: Number.isFinite(limit) && limit > 0 ? limit : 200, theme };
}

// ── Темы: ключ -> заголовок/эмодзи/описание + список ключевых слов ───────────
// Слово попадает в первую подходящую тему по точному совпадению. Всё, что не
// попало ни в одну тему, уходит в бакет уровня «Топ-слова {LEVEL}»
// (cefrLevel заполняется — это то, чего сейчас не хватает готовым колодам).
type ThemeDef = { title: string; emoji: string; description: string; words: Set<string> };

const THEME_DEFS: Record<string, ThemeDef> = {
  food: {
    title: "Еда и напитки", emoji: "🍔", description: "Базовые слова о еде, напитках и приёме пищи.",
    words: new Set(["food","drink","eat","meal","breakfast","lunch","dinner","bread","meat","fish","fruit",
      "vegetable","apple","banana","orange","potato","tomato","onion","rice","meat","chicken","beef","pork",
      "milk","cheese","butter","egg","sugar","salt","pepper","coffee","tea","juice","water","wine","beer",
      "cook","cooking","recipe","kitchen","restaurant","menu","waiter","hungry","thirsty","taste","delicious",
      "sweet","sour","bitter","spicy","fresh","snack","dessert","cake","chocolate","soup","sandwich","pizza"]),
  },
  animals: {
    title: "Животные", emoji: "🐾", description: "Домашние и дикие животные.",
    words: new Set(["animal","dog","cat","bird","fish","horse","cow","sheep","pig","chicken","duck","rabbit",
      "mouse","lion","tiger","elephant","bear","wolf","fox","monkey","snake","insect","bee","butterfly","spider",
      "pet","wild","zoo","farm","tail","wing","paw"]),
  },
  home: {
    title: "Дом и быт", emoji: "🏠", description: "Дом, комнаты и предметы обихода.",
    words: new Set(["house","home","room","kitchen","bedroom","bathroom","garden","door","window","wall","roof",
      "floor","furniture","table","chair","bed","sofa","lamp","key","clean","cleaning","cook","wash","tidy",
      "flat","apartment","address","neighbour","neighbor","rent"]),
  },
  family: {
    title: "Семья", emoji: "👪", description: "Родственники и семейные отношения.",
    words: new Set(["family","mother","father","parent","child","children","son","daughter","brother","sister",
      "grandmother","grandfather","husband","wife","baby","aunt","uncle","cousin","relative","marriage","marry",
      "wedding","birth","born"]),
  },
  work_study: {
    title: "Работа и учёба", emoji: "💼", description: "Профессии, офис, школа и учёба.",
    words: new Set(["work","job","office","company","business","boss","colleague","employee","employer","career",
      "salary","meeting","project","task","school","student","teacher","class","lesson","homework","exam","test",
      "university","study","learn","education","degree","subject","course","skill","interview","apply"]),
  },
  hobby_sport: {
    title: "Хобби и спорт", emoji: "⚽", description: "Спорт, увлечения и свободное время.",
    words: new Set(["sport","football","basketball","tennis","swim","swimming","run","running","gym","exercise",
      "team","game","play","player","match","ball","hobby","music","dance","paint","draw","read","reading",
      "book","movie","film","art","photography","chess","fun","free time"]),
  },
  travel: {
    title: "Путешествия", emoji: "✈️", description: "Транспорт, поездки и туризм.",
    words: new Set(["travel","trip","journey","holiday","vacation","tourist","tourism","hotel","airport","flight",
      "plane","train","bus","car","taxi","ship","ticket","passport","luggage","map","abroad","country","city",
      "visit","tour","guide","beach","mountain","road","drive"]),
  },
  health: {
    title: "Здоровье", emoji: "🏥", description: "Здоровье, тело и болезни.",
    words: new Set(["health","healthy","doctor","hospital","nurse","medicine","illness","disease","pain","sick",
      "ill","body","head","hand","arm","leg","eye","ear","heart","blood","fever","cough","injury","treatment",
      "exercise","diet","rest","sleep"]),
  },
  emotions: {
    title: "Эмоции", emoji: "😊", description: "Чувства, настроение и характер.",
    words: new Set(["happy","sad","angry","afraid","scared","surprised","excited","nervous","worried","calm",
      "proud","bored","tired","love","hate","like","enjoy","fear","hope","feel","feeling","emotion","mood",
      "smile","cry","laugh","kind","friendly","shy","brave"]),
  },
  technology: {
    title: "Технологии", emoji: "💻", description: "Компьютеры, интернет и гаджеты.",
    words: new Set(["computer","internet","phone","mobile","email","website","app","software","password",
      "screen","keyboard","mouse","download","upload","online","digital","technology","device","camera","video",
      "message","text","call","network","data","file","print"]),
  },
  money: {
    title: "Деньги", emoji: "💰", description: "Деньги, покупки и финансы.",
    words: new Set(["money","price","cost","pay","payment","buy","sell","shop","shopping","store","market",
      "bank","cash","card","credit","expensive","cheap","free","bill","salary","save","spend","budget","rich",
      "poor","loan","currency","coin","dollar"]),
  },
};

function classifyTheme(word: string): string | null {
  const key = word.toLowerCase();
  for (const [themeKey, def] of Object.entries(THEME_DEFS)) {
    if (def.words.has(key)) return themeKey;
  }
  return null;
}

// ── Скачивание/кэш CSV ───────────────────────────────────────────────────────
async function fetchCached(url: string, cacheFile: string): Promise<string> {
  const cachePath = path.join(DATA_DIR, cacheFile);
  if (existsSync(cachePath)) {
    return readFileSync(cachePath, "utf-8");
  }
  mkdirSync(DATA_DIR, { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось скачать ${url}: HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(cachePath, text, "utf-8");
  return text;
}

// Простой CSV-парсер: файлы nalgeon/words не содержат кавычек/экранированных
// запятых в интересующих нас колонках (word, level, pos).
function parseCsv(text: string): Array<{ word: string; level: string; pos: string }> {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rows: Array<{ word: string; level: string; pos: string }> = [];
  for (let i = 1; i < lines.length; i++) { // пропускаем заголовок
    const cols = lines[i]!.split(",");
    const word = (cols[0] ?? "").trim();
    const level = (cols[1] ?? "").trim().toUpperCase();
    const pos = (cols[2] ?? "").trim();
    if (word && level) rows.push({ word, level, pos });
  }
  return rows;
}

// ── dictionaryapi.dev ────────────────────────────────────────────────────────
type DictEntry = {
  phonetic?: string;
  phonetics?: Array<{ text?: string }>;
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{ definition?: string; example?: string }>;
  }>;
};

type DictLookup = { ipa?: string; pos?: string; example?: string } | null;

async function lookupDictionary(word: string): Promise<DictLookup> {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`);
    if (!res.ok) return null;
    const data = await res.json() as DictEntry[];
    const entry = Array.isArray(data) ? data[0] : undefined;
    if (!entry) return null;
    const ipa = entry.phonetic?.trim() || entry.phonetics?.map((p) => p.text?.trim()).find(Boolean);
    const pos = entry.meanings?.[0]?.partOfSpeech;
    let example: string | undefined;
    for (const meaning of entry.meanings ?? []) {
      for (const def of meaning.definitions ?? []) {
        if (def.example) { example = def.example; break; }
      }
      if (example) break;
    }
    return { ipa, pos, example };
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rateDelay = () => 300 + Math.floor(Math.random() * 300); // 300–600 мс

// ── Существующий датасет (идемпотентность) ───────────────────────────────────
function existingWordKeys(): Set<string> {
  const keys = new Set<string>();
  for (const deck of SEED_DECKS) {
    for (const w of deck.words) keys.add(w.en.trim().toLowerCase());
  }
  return keys;
}

// Читает уже сгенерированные vocabulary-{level}.ts (если есть), чтобы при
// повторном запуске не задваивать слова и дополнять существующие колоды.
async function loadExistingLevelDecks(level: CefrLevel): Promise<SeedDeck[]> {
  const file = path.join(OUT_DIR, `vocabulary-${level.toLowerCase()}.ts`);
  if (!existsSync(file)) return [];
  const fileUrl = `${pathToFileURL(file).href}?t=${Date.now()}`;
  const mod = await import(fileUrl).catch(() => null);
  return (mod?.default as SeedDeck[] | undefined) ?? [];
}

// ── Сериализация в TS ────────────────────────────────────────────────────────
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function serializeWord(w: SeedWord): string {
  const ru = w.ru.map((r) => `"${esc(r)}"`).join(", ");
  return `      { en: "${esc(w.en)}", pos: "${esc(w.pos)}", ru: [${ru}], ipa: "${esc(w.ipa)}", exEn: "${esc(w.exEn)}", exRu: "${esc(w.exRu)}", cefr: "${w.cefr}" },`;
}

function serializeDeck(d: SeedDeck): string {
  const words = d.words.map(serializeWord).join("\n");
  const cefr = d.cefrLevel ? `\n    cefrLevel: "${d.cefrLevel}",` : "";
  return `  {\n    theme: "${esc(d.theme)}",\n    title: "${esc(d.title)}",\n    emoji: "${esc(d.emoji)}",\n    description: "${esc(d.description)}",${cefr}\n    words: [\n${words}\n    ],\n  },`;
}

function serializeFile(level: CefrLevel, decks: SeedDeck[]): string {
  const body = decks.map(serializeDeck).join("\n");
  return `// АВТОГЕНЕРИРОВАНО: scripts/src/import-vocabulary.ts --level=${level}
// Источник слов: github.com/nalgeon/words (Oxford 3000/5000, data/oxford-5k.csv,
// data/oxford-phrase.csv). IPA/пример: api.dictionaryapi.dev. Перевод: Google
// Translate (@workspace/translate). Ручные правки будут перезаписаны при
// повторном запуске импортёра — правьте flashcards-data.ts для ручных колод.
import type { SeedDeck } from "./flashcards-data";

const decks: SeedDeck[] = [
${body}
];

export default decks;
`;
}

// Пересобирает scripts/src/data/vocabulary-index.ts — статический список всех
// сгенерированных vocabulary-{level}.ts, который подключается в flashcards-data.ts.
function rewriteIndex(levelsPresent: CefrLevel[]) {
  const imports = levelsPresent
    .map((l) => `import ${l.toLowerCase()}Decks from "./vocabulary-${l.toLowerCase()}";`)
    .join("\n");
  const spread = levelsPresent.map((l) => `...${l.toLowerCase()}Decks`).join(", ");
  const content = `// АВТОГЕНЕРИРОВАНО: scripts/src/import-vocabulary.ts
// Собирает все сгенерированные vocabulary-{level}.ts в один массив,
// подключаемый в flashcards-data.ts (SEED_DECKS).
import type { SeedDeck } from "./flashcards-data";
${imports}

export const VOCAB_DECKS: SeedDeck[] = [${spread}];
`;
  writeFileSync(path.join(OUT_DIR, "vocabulary-index.ts"), content, "utf-8");
}

// ── Основной сценарий ────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Импорт словаря: уровни=${args.levels.join(",")} limit=${args.limit} theme=${args.theme ?? "все"}`);

  const [wordsCsv, phrasesCsv] = await Promise.all([
    fetchCached(OXFORD_WORDS_URL, "oxford-5k.csv"),
    fetchCached(OXFORD_PHRASES_URL, "oxford-phrase.csv"),
  ]);
  const rows = [...parseCsv(wordsCsv), ...parseCsv(phrasesCsv)];

  const existing = existingWordKeys();
  const skipped: Array<{ word: string; reason: string }> = [];
  const touchedLevels = new Set<CefrLevel>();

  for (const level of args.levels) {
    // Кандидаты: нужный уровень, уникальные по слову (берём первую часть речи),
    // ещё не в датасете, при необходимости — только нужная тема.
    const seenInBatch = new Set<string>();
    let candidates = rows.filter((r) => r.level === level);
    const deduped: typeof candidates = [];
    for (const r of candidates) {
      const key = r.word.toLowerCase();
      if (seenInBatch.has(key) || existing.has(key)) continue;
      seenInBatch.add(key);
      deduped.push(r);
    }
    candidates = deduped;

    if (args.theme) {
      candidates = candidates.filter((r) => classifyTheme(r.word) === args.theme);
    }
    candidates = candidates.slice(0, args.limit);

    console.log(`\n[${level}] кандидатов после фильтров: ${candidates.length}`);

    // theme -> собранные слова за этот прогон
    const collected = new Map<string, SeedWord[]>();
    const TOP_THEME_KEY = `top-${level.toLowerCase()}`;

    for (const [i, cand] of candidates.entries()) {
      if (i > 0) await sleep(rateDelay());

      const dict = await lookupDictionary(cand.word);
      if (!dict || !dict.ipa) {
        skipped.push({ word: cand.word, reason: "нет IPA в словаре (dictionaryapi.dev)" });
        continue;
      }

      const ru = await translateWithGoogle(cand.word);
      if (!ru) {
        skipped.push({ word: cand.word, reason: "не удалось получить перевод" });
        continue;
      }

      let exEn = dict.example ?? "";
      let exRu = "";
      if (exEn) {
        exRu = (await translateWithGoogle(exEn)) ?? "";
        if (!exRu) exEn = ""; // без перевода пример не показываем, но само слово не отбрасываем
      }

      const themeKey = classifyTheme(cand.word) ?? TOP_THEME_KEY;
      const word: SeedWord = {
        en: cand.word,
        pos: dict.pos || cand.pos || "unknown",
        ru: [ru],
        ipa: dict.ipa,
        exEn,
        exRu,
        cefr: level,
      };
      if (!collected.has(themeKey)) collected.set(themeKey, []);
      collected.get(themeKey)!.push(word);
      existing.add(cand.word.toLowerCase());

      console.log(`  + ${cand.word} -> ${ru} [${themeKey}] ${dict.ipa}`);
    }

    if (collected.size === 0) {
      console.log(`[${level}] новых слов не добавлено.`);
      continue;
    }

    // Сливаем с уже сгенерированным файлом уровня (идемпотентно).
    const existingDecks = await loadExistingLevelDecks(level);
    const byTheme = new Map<string, SeedDeck>();
    for (const d of existingDecks) byTheme.set(d.theme, d);

    for (const [themeKey, words] of collected) {
      const def = THEME_DEFS[themeKey];
      const isTop = themeKey === TOP_THEME_KEY;
      const existingDeck = byTheme.get(themeKey);
      if (existingDeck) {
        existingDeck.words.push(...words);
      } else {
        byTheme.set(themeKey, {
          theme: themeKey,
          title: isTop ? `Топ-слова ${level}` : def!.title,
          emoji: isTop ? "⭐" : def!.emoji,
          description: isTop
            ? `Самые частотные слова уровня ${level} (Oxford 3000/5000), не вошедшие в тематические колоды.`
            : def!.description,
          cefrLevel: isTop ? level : undefined,
          words,
        });
      }
    }

    const merged = Array.from(byTheme.values());
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(path.join(OUT_DIR, `vocabulary-${level.toLowerCase()}.ts`), serializeFile(level, merged), "utf-8");
    touchedLevels.add(level);
    console.log(`[${level}] записано ${merged.reduce((s, d) => s + d.words.length, 0)} слов в ${merged.length} колодах -> scripts/src/data/vocabulary-${level.toLowerCase()}.ts`);
  }

  // Пересобираем индекс по ВСЕМ уровням, для которых когда-либо был файл (не
  // только затронутым сейчас), чтобы не потерять ранее импортированные уровни.
  const allLevelsPresent = CEFR_LEVELS.filter((l) => existsSync(path.join(OUT_DIR, `vocabulary-${l.toLowerCase()}.ts`)));
  if (allLevelsPresent.length > 0) rewriteIndex(allLevelsPresent);

  console.log(`\n── Пропущено: ${skipped.length} ──`);
  for (const s of skipped) console.log(`  - ${s.word}: ${s.reason}`);
  console.log(`\nГотово.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
