// Шаг 2. Сверка кандидатов с Cambridge Dictionary.
//
//   node scripts/tools/lexicon/2-verify-words.mjs [тема ...]
//
// Кандидаты из тематических словарей Oxford (шаг 1) проверяются по статье
// Cambridge: слово остаётся только если у него есть напечатанные метка CEFR,
// британская транскрипция и русский перевод. Уровень карточки берём по
// Cambridge (English Vocabulary Profile), уровень Oxford сохраняем для сверки.
import { cachePath, readJson, writeJson, pool, CEFR } from "./lib.mjs";
import { fetchWord } from "./cambridge.mjs";

// Сколько слов вне списков Oxford 3000/5000 (метка c2) проверять на тему.
const C2_SAMPLE = Number(process.env.C2_SAMPLE ?? 320);

function candidates(entries) {
  const byLevel = (l) => entries.filter((e) => e.cefr === l);
  const core = ["A1", "A2", "B1", "B2", "C1"].flatMap(byLevel);
  // Пул «c2» у Oxford — это всё, что не вошло в 3000/5000, там много редкого
  // (aardvark, aioli). Берём выборку покороче: короткие слова заметно чаще
  // оказываются реальной лексикой уровня, а не узким термином.
  const rest = byLevel("C2")
    .slice()
    .sort((a, b) => a.en.length - b.en.length || a.en.localeCompare(b.en))
    .slice(0, C2_SAMPLE);
  return [...core, ...rest].filter((e) => /^[a-zA-Z][a-zA-Z '’\-]*$/.test(e.en) && e.en.split(/\s+/).length <= 3);
}

async function main() {
  const topics = readJson(cachePath("topics.json"));
  if (!topics) throw new Error("нет topics.json — сначала шаг 1");

  const only = process.argv.slice(2);
  const themes = only.length ? only : Object.keys(topics);

  for (const theme of themes) {
    const outFile = cachePath("verified", `${theme}.json`);
    const done = readJson(outFile, {});
    const list = candidates(topics[theme]);
    const todo = list.filter((e) => !(e.en.toLowerCase() in done));

    let ok = 0;
    let processed = 0;
    await pool(todo, 5, async (e) => {
      const r = await fetchWord(e.en).catch(() => null);
      processed++;
      // Уровень: метка Cambridge (English Vocabulary Profile) в приоритете,
      // при её отсутствии — метка Oxford со страницы тематического словаря.
      done[e.en.toLowerCase()] = r
        ? {
            en: e.en,
            pos: r.pos || e.pos,
            ipa: r.ipa,
            cefr: r.cefr || e.cefr,
            src: r.cefr ? "cambridge" : "oxford",
            cambridge: r.cefr,
            oxford: e.cefr,
            ru: r.translations,
            ex: r.examples,
            topic: e.topic,
          }
        : null;
      if (r) ok++;
      if (processed % 100 === 0) {
        writeJson(outFile, done);
        console.log(`  ${theme}: ${processed}/${todo.length} (подтверждено ${ok})`);
      }
    });

    writeJson(outFile, done);
    const good = Object.values(done).filter(Boolean);
    const byLevel = CEFR.map((l) => `${l}:${good.filter((w) => w.cefr === l).length}`).join(" ");
    console.log(`✔ ${theme.padEnd(12)} проверено ${list.length}, подтверждено ${good.length}   ${byLevel}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
