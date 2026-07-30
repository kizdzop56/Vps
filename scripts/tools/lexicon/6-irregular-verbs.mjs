// Шаг 6. Тематика «Неправильные глаголы».
//
//   node scripts/tools/lexicon/6-irregular-verbs.mjs
//
// Список глаголов берём из грамматического справочника Cambridge (таблица
// «Irregular verbs»): база, вторая и третья формы. Уровень, транскрипцию,
// перевод и примеры — как и везде, из статей Cambridge и корпусов OPUS.
// Одних глаголов на шесть колод мало, поэтому тема дополняется фразовыми
// глаголами, построенными на этих же неправильных глаголах (их Cambridge
// перечисляет в разделе Phrasal Verbs прямо в статье глагола).
import { readFileSync, existsSync } from "node:fs";
import { cachePath, fetchText, readJson, writeJson, pool, stripTags, CEFR } from "./lib.mjs";
import { fetchWord, fetchPhrase, slugify } from "./cambridge.mjs";

const TABLE = "https://dictionary.cambridge.org/grammar/british-grammar/irregular-verbs";
const OXFORD_LIST = "https://www.oxfordlearnersdictionaries.com/wordlists/oxford3000-5000";

// Списки Oxford 3000/5000 — запасной источник уровня, если Cambridge слово не разметил.
async function oxfordLevels() {
  const file = cachePath("oxford3000.json");
  const cached = readJson(file);
  if (cached) return cached;

  const html = await fetchText(OXFORD_LIST, { cacheFile: cachePath("oxford3000.html") });
  const map = {};
  for (const m of html.matchAll(/data-hw="([^"]+)"[\s\S]{0,600}?<span class="belong-to">([a-c][12])<\/span>/g)) {
    const w = m[1].trim().toLowerCase();
    const lvl = m[2].toUpperCase();
    if (!map[w] || CEFR.indexOf(lvl) < CEFR.indexOf(map[w])) map[w] = lvl;
  }
  writeJson(file, map);
  return map;
}

async function verbTable() {
  const file = cachePath("irregular.json");
  const cached = readJson(file);
  if (cached) return cached;

  const html = await fetchText(TABLE, { cacheFile: cachePath("irregular.html") });
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => stripTags(c[1])))
    .filter((r) => r.length >= 3 && /^[a-z]+$/.test(r[0]));

  const verbs = rows.map(([base, past, pp]) => ({ base, past, pp }));
  writeJson(file, verbs);
  return verbs;
}

// Фразовые глаголы и идиомы, построенные на неправильном глаголе: Cambridge
// перечисляет их прямо в статье глагола (разделы Phrasal Verbs и Idioms).
function harvestPhrasalVerbs(html) {
  const out = new Set();
  for (const block of html.matchAll(/<div class="xref (?:phrasal_verbs|idioms)[^"]*"[\s\S]*?(?=<div class="xref|<\/section>|$)/g)) {
    for (const m of block[0].matchAll(/<span class="x-h dx-h">([\s\S]*?)<\/span>/g)) {
      const p = stripTags(m[1]);
      if (/\b(something|someone|sth|sb|one's|yourself|somebody)\b/i.test(p)) continue;
      if (!/^[a-z][a-z '’-]*$/.test(p)) continue;
      const t = p.split(/\s+/);
      if (t.length < 2 || t.length > 4) continue;
      out.add(p);
    }
  }
  return [...out];
}

async function main() {
  const levels = await oxfordLevels();
  const verbs = await verbTable();
  console.log(`Неправильных глаголов в справочнике Cambridge: ${verbs.length}`);

  // ── сами глаголы ──────────────────────────────────────────────────────
  const words = {};
  await pool(verbs, 5, async (v) => {
    const r = await fetchWord(v.base).catch(() => null);
    if (!r) return;
    const cefr = r.cefr || levels[v.base] || "";
    if (!cefr) return;
    words[v.base] = {
      en: v.base,
      pos: "verb",
      ipa: r.ipa,
      cefr,
      src: r.cefr ? "cambridge" : "oxford",
      ru: r.translations,
      ex: r.examples,
      forms: [v.base, v.past, v.pp],
    };
  });
  writeJson(cachePath("verified", "irregular_verbs.json"), words);

  const byLevel = (obj) => CEFR.map((l) => `${l}:${Object.values(obj).filter((w) => w && w.cefr === l).length}`).join(" ");
  console.log(`✔ глаголов подтверждено ${Object.keys(words).length}   ${byLevel(words)}`);

  // ── фразовые глаголы на их основе ─────────────────────────────────────
  const candidates = new Set();
  for (const v of verbs) {
    const file = cachePath("cambridge-en", `${slugify(v.base)}.html`);
    if (!existsSync(file)) continue;
    for (const p of harvestPhrasalVerbs(readFileSync(file, "utf8"))) candidates.add(p);
  }
  console.log(`Кандидатов во фразовые глаголы: ${candidates.size}`);

  const phrases = readJson(cachePath("phrases", "irregular_verbs.json"), {});
  const todo = [...candidates].filter((p) => !(p in phrases));
  let n = 0;
  await pool(todo, 5, async (p) => {
    const r = await fetchPhrase(p).catch(() => null);
    n++;
    if (n % 100 === 0) console.log(`  фразы: ${n}/${todo.length}`);
    const base = p.split(/\s+/)[0];
    const cefr = r?.cefr || levels[p] || "";
    phrases[p] = r && cefr ? { en: p, cefr, src: r.cefr ? "cambridge" : "oxford", ru: r.translations, ex: r.examples, base } : null;
  });

  // транскрипция фразы — склейка проверенных транскрипций компонентов
  const ipaCache = readJson(cachePath("ipa.json"), {});
  for (const rec of Object.values(phrases)) {
    if (!rec || rec.ipa) continue;
    const parts = [];
    let ok = true;
    for (const token of rec.en.split(/\s+/)) {
      if (!(token in ipaCache)) {
        const w = await fetchWord(token).catch(() => null);
        ipaCache[token] = w?.ipa ?? "";
      }
      if (!ipaCache[token]) { ok = false; break; }
      parts.push(ipaCache[token]);
    }
    if (ok) rec.ipa = parts.join(" ");
  }

  writeJson(cachePath("phrases", "irregular_verbs.json"), phrases);
  writeJson(cachePath("ipa.json"), ipaCache);

  const good = Object.fromEntries(Object.entries(phrases).filter(([, r]) => r && r.ipa));
  console.log(`✔ фразовых глаголов подтверждено ${Object.keys(good).length}   ${byLevel(good)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
