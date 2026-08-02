// Разовый скрипт-миграция: объединяет 20 узких тем, которые разложил
// reclassify-vocabulary.ts (каждая нарезана на части по 60 слов — «Тема (1/4)»
// и т.п.), в 13 более крупных колод на уровень (≤15, требование задачи) и
// убирает нарезку на части — колода теперь одна, даже если в ней 100+ слов.
//
// Слова НЕ перекачиваются из сети: вся работа — с уже существующими SeedWord
// в vocabulary-{level}.ts. Меняется только группировка theme/title/description
// и разбиение на колоды.
//
// Слова, которые в принципе не удалось бы отнести ни к одной из 13 групп
// (сейчас такого не бывает — MERGE_MAP покрывает все 20 исходных тем, но
// механизм оставлен для будущих слов вне схемы), уходят в отдельную СКРЫТУЮ
// колоду уровня (theme "misc_{level}", hidden: true): слова остаются в базе
// и участвуют в сквозной сессии/марафоне (visibleDeckIds() их не исключает),
// но не показываются в списке колод на экране «Слова» (GET /decks их
// отфильтровывает, см. routes/flashcards.ts).
//
// Запуск: pnpm --filter @workspace/scripts run repack-vocab
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { SeedDeck, SeedWord } from "./data/flashcards-data";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "data"); // scripts/src/data

const LEVELS = ["a1", "a2", "b1", "b2", "c1"] as const;
type Level = (typeof LEVELS)[number];

// ── 13 укрупнённых групп: ключ -> заголовок/эмодзи/описание ──────────────────
type GroupDef = { title: string; emoji: string; description: string };

const GROUPS: Record<string, GroupDef> = {
  daily_life: {
    title: "Повседневная жизнь", emoji: "🗓️",
    description: "Время, даты, погода, город и повседневные места.",
  },
  home_life: {
    title: "Дом и быт", emoji: "🏠",
    description: "Дом, быт и предметы обихода.",
  },
  food_drink: {
    title: "Еда и напитки", emoji: "🍔",
    description: "Еда, напитки, кухня и приготовление пищи.",
  },
  family_people: {
    title: "Семья и люди", emoji: "👪",
    description: "Семья, родственники и люди вообще.",
  },
  emotions_character: {
    title: "Эмоции и характер", emoji: "😊",
    description: "Чувства, настроение и черты характера.",
  },
  health_body: {
    title: "Здоровье и тело", emoji: "🏥",
    description: "Здоровье, тело и медицина.",
  },
  appearance_qualities: {
    title: "Внешность и качества", emoji: "👗",
    description: "Одежда, внешность и качества/описания предметов и понятий.",
  },
  leisure_culture: {
    title: "Хобби и культура", emoji: "🎨",
    description: "Спорт, увлечения, искусство и культура.",
  },
  travel_movement: {
    title: "Путешествия и движение", emoji: "✈️",
    description: "Поездки, транспорт, движение и действия.",
  },
  work_money: {
    title: "Работа и деньги", emoji: "💼",
    description: "Работа, учёба, бизнес и финансы.",
  },
  society_tech: {
    title: "Общество и технологии", emoji: "🏛️",
    description: "Общество, государство, техника и медиа.",
  },
  science_communication: {
    title: "Наука и общение", emoji: "🧠",
    description: "Мышление, наука, речь и общение.",
  },
  animals_nature: {
    title: "Животные и природа", emoji: "🌿",
    description: "Животные, растения и природные явления.",
  },
};
const GROUP_ORDER = Object.keys(GROUPS);

// Исходная тема (как её разложил reclassify-vocabulary.ts) -> укрупнённая группа.
// Ровно 20 ключей — по одному на каждую тему из THEMES в reclassify-vocabulary.ts.
const MERGE_MAP: Record<string, string> = {
  time_weather: "daily_life",
  city_places: "daily_life",
  home_life: "home_life",
  food_drink: "food_drink",
  family_people: "family_people",
  emotions_character: "emotions_character",
  health_body: "health_body",
  clothes_appearance: "appearance_qualities",
  qualities_description: "appearance_qualities",
  hobby_sport: "leisure_culture",
  art_culture: "leisure_culture",
  travel_transport: "travel_movement",
  actions_movement: "travel_movement",
  work_study: "work_money",
  money_shopping: "work_money",
  society_state: "society_tech",
  tech_media: "society_tech",
  science_thinking: "science_communication",
  communication_speech: "science_communication",
  animals_nature: "animals_nature",
};

// Тема в файле выглядит как "{baseKey}_{level}" или "{baseKey}_{level}_{part}"
// (нарезка reclassify-vocabulary.ts на части по 60 слов). Отрезаем всё начиная
// с суффикса уровня — восстанавливает baseKey и отбрасывает номер части.
function baseKeyOf(theme: string, level: Level): string {
  const marker = `_${level}`;
  const idx = theme.indexOf(marker);
  return idx === -1 ? theme : theme.slice(0, idx);
}

// ── Сериализация в TS (совпадает с reclassify-vocabulary.ts/import-vocabulary.ts) ─
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
  const hidden = d.hidden ? `\n    hidden: true,` : "";
  return `  {\n    theme: "${esc(d.theme)}",\n    title: "${esc(d.title)}",\n    emoji: "${esc(d.emoji)}",\n    description: "${esc(d.description)}",${cefr}${hidden}\n    words: [\n${words}\n    ],\n  },`;
}

function serializeFile(level: Level, decks: SeedDeck[]): string {
  const body = decks.map(serializeDeck).join("\n");
  return `// АВТОГЕНЕРИРОВАНО: scripts/src/repack-vocabulary.ts
// Слова взяты из уже разложенного датасета (reclassify-vocabulary.ts), заново
// из сети НЕ качались — 20 узких тем (нарезанных на части по 60 слов)
// объединены в ${GROUP_ORDER.length} укрупнённых колод без нарезки на части.
// Слова вне схемы (сейчас таких нет) лежат в скрытой колоде "misc_${level}".
import type { SeedDeck } from "./flashcards-data";

const decks: SeedDeck[] = [
${body}
];

export default decks;
`;
}

async function main() {
  const summary: Array<{ level: string; decks: number; words: number; misc: number }> = [];

  for (const level of LEVELS) {
    const file = path.join(DATA_DIR, `vocabulary-${level}.ts`);
    const fileUrl = `${pathToFileURL(file).href}?t=${Date.now()}`;
    const mod = await import(fileUrl);
    const oldDecks = mod.default as SeedDeck[];

    const byGroup = new Map<string, SeedWord[]>();
    const misc: SeedWord[] = [];
    let totalWords = 0;

    for (const d of oldDecks) {
      const base = baseKeyOf(d.theme, level);
      const group = MERGE_MAP[base];
      for (const w of d.words) {
        totalWords++;
        if (group) {
          if (!byGroup.has(group)) byGroup.set(group, []);
          byGroup.get(group)!.push(w);
        } else {
          // Тема из старого файла не покрыта MERGE_MAP — слово в схему сейчас
          // не попадает, уходит в скрытую misc-колоду уровня (не в никуда).
          misc.push(w);
        }
      }
    }

    const finalDecks: SeedDeck[] = [];
    for (const groupKey of GROUP_ORDER) {
      const words = byGroup.get(groupKey);
      if (!words || words.length === 0) continue;
      const def = GROUPS[groupKey]!;
      finalDecks.push({
        theme: `${groupKey}_${level}`,
        title: def.title,
        emoji: def.emoji,
        description: def.description,
        cefrLevel: level.toUpperCase(),
        words,
      });
    }

    if (misc.length > 0) {
      finalDecks.push({
        theme: `misc_${level}`,
        title: `Остальные слова ${level.toUpperCase()}`,
        emoji: "🗂️",
        description: "Слова уровня, не входящие ни в одну тематическую колоду. Не показываются в списке колод — доступны через «Учить слова» и марафон.",
        cefrLevel: level.toUpperCase(),
        hidden: true,
        words: misc,
      });
    }

    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(file, serializeFile(level, finalDecks), "utf-8");

    const visibleDecks = finalDecks.filter((d) => !d.hidden).length;
    summary.push({ level: level.toUpperCase(), decks: visibleDecks, words: totalWords - misc.length, misc: misc.length });
    console.log(`[${level.toUpperCase()}] ${visibleDecks} видимых колод, ${totalWords - misc.length} слов в них, ${misc.length} слов в скрытой misc.`);
  }

  console.log("\n| уровень | колод | слов в колодах | слов в скрытой misc |");
  console.log("|---|---|---|---|");
  for (const s of summary) {
    console.log(`| ${s.level} | ${s.decks} | ${s.words} | ${s.misc} |`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
