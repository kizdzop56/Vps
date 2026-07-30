// Шаг 3. Словосочетания, фразовые глаголы и идиомы.
//
//   node scripts/tools/lexicon/3-verify-phrases.mjs [тема ...]
//
// Кандидаты берутся из двух проверенных мест:
//   • многословные статьи тематических словарей Oxford (шаг 1);
//   • блоки «Phrasal Verbs», «Idioms» и тематические подборки на уже скачанных
//     страницах Cambridge для слов этой темы.
// Дальше каждая фраза проверяется по статье Cambridge: нужны метка CEFR и
// русский перевод. Транскрипция собирается из проверенных IPA слов-компонентов.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { cachePath, readJson, writeJson, pool, stripTags, decodeEntities, CEFR } from "./lib.mjs";
import { fetchPhrase, fetchWord, slugify } from "./cambridge.mjs";

const PLACEHOLDER = /\b(something|someone|sth|sb|one's|your|yourself|somebody)\b/i;

function harvestFromPage(html) {
  const out = new Set();

  // Тематические подборки внизу статьи: <span class="phrase haf">eat out</span>
  for (const m of html.matchAll(/<span class="phrase haf">([^<]+)<\/span>/g)) {
    out.add(decodeEntities(m[1]).trim());
  }

  // Разделы «Phrasal Verbs» и «Idioms»: <span class="x-h dx-h">eat out</span>
  for (const block of html.matchAll(/<div class="xref (?:phrasal_verbs|idioms)[^"]*"[\s\S]*?(?=<div class="xref|<\/section>|$)/g)) {
    for (const m of block[0].matchAll(/<span class="x-h dx-h">([\s\S]*?)<\/span>/g)) {
      out.add(stripTags(m[1]));
    }
  }
  return [...out];
}

function isGoodCandidate(p) {
  if (!p) return false;
  const tokens = p.split(/\s+/);
  if (tokens.length < 2 || tokens.length > 4) return false;
  if (PLACEHOLDER.test(p)) return false;
  return /^[a-zA-Z][a-zA-Z '’\-]*$/.test(p);
}

// Транскрипция фразы = склейка проверенных транскрипций её слов.
async function phraseIpa(phrase, ipaCache) {
  const parts = [];
  for (const token of phrase.toLowerCase().split(/\s+/)) {
    const clean = token.replace(/[^a-z'’\-]/g, "");
    if (!clean) return "";
    if (!(clean in ipaCache)) {
      const w = await fetchWord(clean).catch(() => null);
      ipaCache[clean] = w?.ipa ?? "";
    }
    if (!ipaCache[clean]) return "";
    parts.push(ipaCache[clean]);
  }
  return parts.join(" ");
}

async function main() {
  const topics = readJson(cachePath("topics.json"));
  const only = process.argv.slice(2);
  const themes = only.length ? only : Object.keys(topics);

  const ipaCache = readJson(cachePath("ipa.json"), {});

  for (const theme of themes) {
    const verified = readJson(cachePath("verified", `${theme}.json`), {});
    const words = Object.values(verified).filter(Boolean);
    for (const w of words) if (w.ipa && !/\s/.test(w.en)) ipaCache[w.en.toLowerCase()] = w.ipa;

    // кандидаты: многословные статьи Oxford + сборы со страниц Cambridge
    const cand = new Set();
    const oxfordLevel = {};   // фраза → уровень из тематического словаря Oxford
    for (const e of topics[theme]) {
      if (!isGoodCandidate(e.en)) continue;
      cand.add(e.en.toLowerCase());
      oxfordLevel[e.en.toLowerCase()] = e.cefr;
    }
    for (const w of words) {
      const file = cachePath("cambridge-en", `${slugify(w.en)}.html`);
      if (!existsSync(file)) continue;
      const html = readFileSync(file, "utf8");
      for (const p of harvestFromPage(html)) if (isGoodCandidate(p)) cand.add(p.toLowerCase());
    }

    const outFile = cachePath("phrases", `${theme}.json`);
    const done = readJson(outFile, {});
    // Кандидатов бывает несколько тысяч; берём порцию покороче — короткие
    // фразы почти всегда и есть ходовые словосочетания.
    const cap = Number(process.env.PHRASE_CAP ?? 900);
    const todo = [...cand]
      .filter((p) => !(p in done))
      .sort((a, b) => a.length - b.length || a.localeCompare(b))
      .slice(0, cap);
    console.log(`${theme}: кандидатов ${cand.size}, к проверке ${todo.length}`);

    let processed = 0;
    await pool(todo, 5, async (p) => {
      const r = await fetchPhrase(p).catch(() => null);
      processed++;
      const level = r?.cefr || oxfordLevel[p] || "";
      done[p] = r && level
        ? { en: p, cefr: level, src: r.cefr ? "cambridge" : "oxford", ru: r.translations, ex: r.examples }
        : null;
      if (processed % 100 === 0) {
        writeJson(outFile, done);
        console.log(`  ${theme}: ${processed}/${todo.length}`);
      }
    });

    // дособираем транскрипции для подтверждённых фраз
    for (const p of Object.keys(done)) {
      const rec = done[p];
      if (!rec || rec.ipa) continue;
      rec.ipa = await phraseIpa(rec.en, ipaCache);
    }

    writeJson(outFile, done);
    writeJson(cachePath("ipa.json"), ipaCache);

    const good = Object.values(done).filter((r) => r && r.ipa);
    const byLevel = CEFR.map((l) => `${l}:${good.filter((w) => w.cefr === l).length}`).join(" ");
    console.log(`✔ ${theme.padEnd(12)} фраз подтверждено ${good.length}   ${byLevel}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
