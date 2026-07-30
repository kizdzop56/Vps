// Шаг 1. Тематические словари Oxford Learner's Dictionaries.
//
//   node scripts/tools/lexicon/1-fetch-topics.mjs
//
// Каждая тема приложения собирается из тематических страниц Oxford. Страница темы
// отдаёт заголовочное слово, часть речи и официальную метку CEFR (belong-to) —
// то есть и тематическая привязка, и уровень берутся из одного проверенного
// источника, а не назначаются на глаз.
import { cachePath, fetchText, writeJson, decodeEntities, CEFR } from "./lib.mjs";

// Тема приложения → страницы тематического словаря Oxford.
export const THEME_TOPICS = {
  food: ["food", "drinks", "cooking-and-eating"],
  animals: ["animals", "birds", "fish-and-shellfish", "insects-worms-etc"],
  transport: ["transport-by-car-or-lorry", "transport-by-bus-and-train", "transport-by-air", "transport-by-water"],
  family: ["family-and-relationships", "life-stages"],
  home: ["houses-and-homes", "buildings", "gardens"],
  body_health: ["body", "health-and-fitness", "health-problems", "healthcare", "mental-health"],
  work: ["jobs", "working-life", "business", "money"],
  nature: ["plants-and-trees", "weather", "the-environment", "geography", "farming"],
  technology: ["computers", "phones-email-and-the-internet", "engineering", "scientific-research"],
  travel: ["holidays", "shopping", "hobbies"],
};

const BASE = "https://www.oxfordlearnersdictionaries.com/topic/";

// <li id="l2:food_and_drink:food_apple" data-hw="apple" ...>
//   <a href="/definition/english/apple">apple</a><span class="pos">noun</span>
//   <div><span class="belong-to">a1</span> ...
function parseTopic(html, topic) {
  const out = [];
  const re = /<li id="[^"]*"\s+data-hw="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = re.exec(html))) {
    const hw = decodeEntities(m[1]).trim();
    const body = m[2];
    const pos = (body.match(/<span class="pos">([^<]*)<\/span>/) || [])[1]?.trim() ?? "";
    const lvlRaw = (body.match(/<span class="belong-to">([^<]*)<\/span>/) || [])[1]?.trim().toUpperCase() ?? "";
    const href = (body.match(/href="([^"]*\/definition\/english\/[^"]*)"/) || [])[1] ?? "";
    if (!hw || !CEFR.includes(lvlRaw)) continue; // без официального уровня слово не берём
    out.push({ en: hw, pos, cefr: lvlRaw, href, topic });
  }
  return out;
}

async function main() {
  const result = {};
  for (const [theme, topics] of Object.entries(THEME_TOPICS)) {
    const words = new Map();
    for (const topic of topics) {
      const html = await fetchText(BASE + topic, { cacheFile: cachePath("topics", `${topic}.html`) });
      if (!html) { console.log(`  ⚠️  тема ${topic}: пусто`); continue; }
      const rows = parseTopic(html, topic);
      for (const r of rows) if (!words.has(r.en.toLowerCase())) words.set(r.en.toLowerCase(), r);
      console.log(`  ${theme}/${topic}: ${rows.length}`);
    }
    result[theme] = [...words.values()];
  }

  writeJson(cachePath("topics.json"), result);

  console.log("\nИтог по темам (слов с уровнем CEFR):");
  for (const [theme, words] of Object.entries(result)) {
    const byLevel = CEFR.map((l) => `${l}:${words.filter((w) => w.cefr === l).length}`).join(" ");
    console.log(`  ${theme.padEnd(12)} всего ${String(words.length).padStart(4)}   ${byLevel}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
