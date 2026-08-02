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
  // Темы ниже добавлены для уровня B1 (глубже, чем базовый набор выше):
  // ключевые слова подобраны по фактическим B1-строкам в data/oxford-5k.csv
  // и data/oxford-phrase.csv, а не выдуманы — иначе классификация не сработает.
  city_transport: {
    title: "Город и транспорт", emoji: "🚌", description: "Городская жизнь, передвижение и транспорт.",
    words: new Set(["border","departure","arrival","destination","located","neighbourhood","signal","transport",
      "high street"]),
  },
  education: {
    title: "Образование", emoji: "🎓", description: "Учёба, экзамены и учебные заведения (глубже, чем «Работа и учёба»).",
    words: new Set(["academic","assignment","campus","grade","graduate","qualification","examine",
      "primary school","secondary school","higher education"]),
  },
  character_relationships: {
    title: "Характер и отношения", emoji: "🤝", description: "Черты характера, дружба и отношения между людьми.",
    words: new Set(["ambitious","apologize","attitude","confident","friendship","generous","honest","kind",
      "mood","reliable","respect","shy","supporter","get on with sb","get to know sb","care for sb",
      "attached to sb/sth","respect for sb/sth"]),
  },
  leisure_culture: {
    title: "Свободное время и культура", emoji: "🎭", description: "Искусство, культура и творческий досуг.",
    words: new Set(["ceremony","entertain","entertainment","exhibition","leisure","literature","performance",
      "poem","poetry","sculpture","talent","talented"]),
  },
  // Темы ниже добавлены для уровня B2 — абстрактнее, чем бытовой набор
  // A1/B1: общество, наука, экономика, медиа, экология, психология.
  // Ключевые слова подобраны по фактическим B2-строкам в data/oxford-5k.csv
  // и data/oxford-phrase.csv.
  society: {
    title: "Общество и социальные проблемы", emoji: "🏛️", description: "Общество, права и социальные проблемы.",
    words: new Set(["citizen","democracy","gender","homeless","immigration","justice","minority","racism",
      "refugee","welfare","human rights","role model","quality of life"]),
  },
  science_technology: {
    title: "Наука и технологии", emoji: "🔬", description: "Наука, исследования и инновации.",
    words: new Set(["artificial","genetic","hypothesis","innovation","innovative","technological"]),
  },
  economy_work: {
    title: "Экономика и работа", emoji: "📈", description: "Экономика, бизнес и рынок труда.",
    words: new Set(["contract","corporation","entrepreneur","income","industrial","inflation","investment",
      "labour","manufacture","manufacturing","negotiation","recession","recruitment","strike","workforce"]),
  },
  media_communication: {
    title: "Медиа и коммуникация", emoji: "📰", description: "Медиа, журналистика и коммуникация.",
    words: new Set(["broadcast","coverage","journalism","publication","case study"]),
  },
  ecology: {
    title: "Экология", emoji: "🌍", description: "Окружающая среда, климат и экология.",
    words: new Set(["conservation","drought","emission","fossil","greenhouse","sustainable","wildlife"]),
  },
  psychology_emotions: {
    title: "Психология и эмоции", emoji: "🧠", description: "Психология, поведение и внутренний мир человека.",
    words: new Set(["anxiety","awareness","depression","emotional","motivation","perception","psychological",
      "psychology","therapy","mental health"]),
  },
  // Темы ниже добавлены для уровня C1 — академическая и профессиональная
  // лексика. Ключевые слова подобраны по фактическим C1-строкам в
  // data/oxford-5k.csv и data/oxford-phrase.csv.
  politics_law: {
    title: "Политика и право", emoji: "⚖️", description: "Политика, государство и правовая система.",
    words: new Set(["ambassador","coalition","constitution","constitutional","diplomat","diplomatic",
      "governance","jurisdiction","lawsuit","legislation","legislative","prosecute","prosecution",
      "referendum","regime","sanction","sovereignty","treaty","tribunal","verdict"]),
  },
  philosophy_thinking: {
    title: "Философия и мышление", emoji: "💭", description: "Философия, рассуждение и абстрактное мышление.",
    words: new Set(["contemplate","dilemma","logic","morality","philosophical","premise","rational",
      "reasoning","for the sake of sb/sth","in the light of sth"]),
  },
  literature_art: {
    title: "Литература и искусство", emoji: "🎨", description: "Литература, искусство и литературная критика.",
    words: new Set(["aesthetic","composition","critique","imagery","ironic","irony","manuscript","verse"]),
  },
  research_argumentation: {
    title: "Исследования и аргументация", emoji: "🧪", description: "Научные исследования, доказательства и построение аргументов.",
    words: new Set(["contradiction","correlation","empirical","methodology","validity","be attributed to sb",
      "consistent with sth","in accordance with sth"]),
  },
  business_negotiation: {
    title: "Бизнес и переговоры", emoji: "🤵", description: "Бизнес, сделки и деловые переговоры.",
    words: new Set(["acquisition","compromise","deficit","merger","shareholder","surplus","turnover",
      "venture","on behalf of sb"]),
  },
  abstract_concepts: {
    title: "Абстрактные понятия", emoji: "🔷", description: "Абстрактные понятия и оттенки смысла.",
    words: new Set(["arbitrary","complexity","dimension","dynamic","entity","explicit","hierarchy",
      "inherent","spectrum","subtle","underlying","by means of sth"]),
  },
};

// На уровне B2+ бытовые темы (еда, дом, семья, животные, хобби/спорт,
// путешествия, город/транспорт) уже не нужны — слова этого уровня в них
// почти никогда не попадают, а если попадут (случайное совпадение ключа),
// такое слово лучше уйдёт в «Топ-слова уровня», чем раздует бытовую колоду
// абстрактным словом не по теме.
const HOUSEHOLD_THEME_KEYS = new Set([
  "food", "animals", "home", "family", "hobby_sport", "travel", "city_transport",
]);

function classifyTheme(word: string, exclude?: Set<string>): string | null {
  const key = word.toLowerCase();
  for (const [themeKey, def] of Object.entries(THEME_DEFS)) {
    if (exclude?.has(themeKey)) continue;
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
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\n");
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

    // theme -> собранные слова за этот прогон. Ключ темы всегда с суффиксом
    // уровня (_a1/_a2/...), чтобы темы разных уровней не совпадали друг с
    // другом (раньше "food" от A1 и "food" от A2 были бы одной и той же темой).
    const LEVEL_SUFFIX = `_${level.toLowerCase()}`;
    // На B2 и выше бытовые темы не используются (см. HOUSEHOLD_THEME_KEYS).
    const levelIdx = CEFR_LEVELS.indexOf(level);
    const excludeThemes = levelIdx >= CEFR_LEVELS.indexOf("B2") ? HOUSEHOLD_THEME_KEYS : undefined;
    const collected = new Map<string, SeedWord[]>();
    const TOP_THEME_KEY = `top${LEVEL_SUFFIX}`;
    const baseKeyOf = (themeKey: string): string | null =>
      themeKey === TOP_THEME_KEY ? null : themeKey.slice(0, -LEVEL_SUFFIX.length);

    for (const [i, cand] of candidates.entries()) {
      if (i > 0) await sleep(rateDelay());

      // Словосочетания/идиомы (несколько слов через пробел) — у dictionaryapi.dev
      // почти нет статей на такие фразы, поэтому для них IPA необязателен: если
      // перевод есть, слово всё равно включаем, просто без транскрипции.
      const isPhrase = /\s/.test(cand.word.trim());

      const dict = await lookupDictionary(cand.word);
      if (!isPhrase && (!dict || !dict.ipa)) {
        skipped.push({ word: cand.word, reason: "нет IPA в словаре (dictionaryapi.dev)" });
        continue;
      }

      const ru = await translateWithGoogle(cand.word);
      if (!ru) {
        skipped.push({ word: cand.word, reason: "нет достоверных данных: не удалось получить перевод" });
        continue;
      }

      let exEn = dict?.example ?? "";
      let exRu = "";
      if (exEn) {
        exRu = (await translateWithGoogle(exEn)) ?? "";
        if (!exRu) exEn = ""; // без перевода пример не показываем, но само слово не отбрасываем
      }

      const baseThemeKey = classifyTheme(cand.word, excludeThemes);
      const themeKey = baseThemeKey ? `${baseThemeKey}${LEVEL_SUFFIX}` : TOP_THEME_KEY;
      const word: SeedWord = {
        en: cand.word,
        pos: dict?.pos || cand.pos || (isPhrase ? "phrase" : "unknown"),
        ru: [ru],
        ipa: dict?.ipa ?? "",
        exEn,
        exRu,
        cefr: level,
      };
      if (!collected.has(themeKey)) collected.set(themeKey, []);
      collected.get(themeKey)!.push(word);
      existing.add(cand.word.toLowerCase());

      console.log(`  + ${cand.word} -> ${ru} [${themeKey}] ${word.ipa || "(без IPA)"}`);
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
      const isTop = themeKey === TOP_THEME_KEY;
      const baseKey = baseKeyOf(themeKey);
      const def = baseKey ? THEME_DEFS[baseKey] : undefined;
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
          // Каждая колода этого уровня помечена своим cefrLevel (не только "топ").
          cefrLevel: level,
          words,
        });
      }
    }

    // Колоды держим в размере 30–60 слов: те, что вышли за 60, режем на
    // равные части (part size <= 60), дописывая title/theme суффиксом (N/M).
    const MAX_DECK_SIZE = 60;
    const sized: SeedDeck[] = [];
    for (const deck of byTheme.values()) {
      if (deck.words.length <= MAX_DECK_SIZE) {
        sized.push(deck);
        continue;
      }
      const parts = Math.ceil(deck.words.length / MAX_DECK_SIZE);
      const chunkSize = Math.ceil(deck.words.length / parts);
      for (let p = 0; p < parts; p++) {
        const chunkWords = deck.words.slice(p * chunkSize, (p + 1) * chunkSize);
        if (chunkWords.length === 0) continue;
        sized.push({
          ...deck,
          theme: `${deck.theme}_${p + 1}`,
          title: `${deck.title} (${p + 1}/${parts})`,
          words: chunkWords,
        });
      }
    }

    const merged = sized;
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
