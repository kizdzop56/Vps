// Шаг 4. Готовые переводные пары «английское предложение → русский перевод».
//
//   node scripts/tools/lexicon/4-corpus-examples.mjs
//
// Reverso Context показывает пары из открытых параллельных корпусов OPUS и сам
// на них ссылается. Его веб-интерфейс закрылся защитой Cloudflare, поэтому пары
// берём из первоисточника — архивов OPUS. Результат тот же (те же корпуса), но
// воспроизводимый и без обхода защиты: скачиваем архивы, строим индекс
// «слово → подходящие пары» и складываем в кэш.
//
// Корпуса:
//   Tatoeba          — короткие бытовые фразы, лучший источник для A1–B1
//   TED2020          — устная речь докладов, B1–C1
//   News-Commentary  — публицистика, B2–C2
//   GlobalVoices     — новости, B2–C2
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { cachePath, readJson, writeJson, ensureDir } from "./lib.mjs";

const CORPORA = [
  { name: "Tatoeba", weight: 0 },
  { name: "TED2020", weight: 1 },
  { name: "News-Commentary", weight: 2 },
  { name: "GlobalVoices", weight: 3 },
];

const MAX_PER_TARGET = 6;

async function download(corpus) {
  const dir = cachePath("corpus", corpus);
  ensureDir(dir);
  const marker = path.join(dir, ".ready");
  if (existsSync(marker)) return dir;

  const api = `https://opus.nlpl.eu/opusapi/?corpus=${corpus}&source=en&target=ru&preprocessing=moses&version=latest`;
  const meta = JSON.parse(execFileSync("curl", ["-sL", "-m", "120", api], { encoding: "utf8" }));
  const url = meta.corpora?.[0]?.url;
  if (!url) throw new Error(`OPUS не отдал ссылку на ${corpus}`);

  const zip = path.join(dir, "en-ru.txt.zip");
  console.log(`  скачиваю ${corpus} (${meta.corpora[0].alignment_pairs} пар)…`);
  execFileSync("curl", ["-sL", "-m", "900", "-o", zip, url]);
  execFileSync("unzip", ["-o", "-q", zip, "-d", dir]);
  execFileSync("rm", ["-f", zip]);
  execFileSync("touch", [marker]);
  return dir;
}

function tokens(s) {
  return s.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
}

const CYRILLIC = /[а-яёА-ЯЁ]/;
const CJK = /[　-〿㐀-䶿一-鿿豈-﫿]/;

function usable(en, ru) {
  if (!en || !ru) return false;
  if (en.length > 130 || ru.length > 150) return false;
  if (!CYRILLIC.test(ru) || CJK.test(ru)) return false;
  if (/[<>{}[\]|@#_~*]|https?:/.test(en + ru)) return false;
  if (!/^[A-Z"'“]/.test(en) || !/[.!?]$/.test(en)) return false;
  if (!/[.!?]$/.test(ru)) return false;
  if (/\.\.\.|…/.test(en + ru)) return false;
  if ((en.match(/,/g) || []).length > 3) return false;
  const w = tokens(en);
  if (w.length < 4 || w.length > 14) return false;
  // соотношение длин — грубая защита от «пара не про то»
  const rw = ru.split(/\s+/).length;
  if (rw < 2 || rw > w.length * 2 + 4) return false;
  return true;
}

function loadTargets() {
  const single = new Set();
  const phrases = [];
  for (const kind of ["verified", "phrases"]) {
    const dir = cachePath(kind);
    if (!existsSync(dir)) continue;
    for (const f of execFileSync("ls", [dir], { encoding: "utf8" }).split("\n").filter(Boolean)) {
      const data = readJson(path.join(dir, f), {});
      for (const rec of Object.values(data)) {
        if (!rec?.en) continue;
        const en = rec.en.toLowerCase();
        if (/\s/.test(en)) phrases.push(en);
        else single.add(en);
      }
    }
  }
  return { single, phrases: [...new Set(phrases)] };
}

// Словоформы: индекс строим по основе, чтобы ловить travelled/travelling.
function stem(w) {
  return w.length > 5 ? w.slice(0, w.length - 2) : w;
}

// Проверка, что слово в предложении — действительно форма искомого слова, а не
// однокоренное покороче: иначе к карточке "weaken" прилетает пример со словом
// "weak". Форма может быть только длиннее основы, но не короче самого слова.
export function isFormOf(token, target) {
  if (token === target) return true;
  if (token.length < target.length - 1) return false;
  return token.startsWith(target.slice(0, target.length - 1));
}

async function main() {
  const { single, phrases } = loadTargets();
  console.log(`Цели: слов ${single.size}, фраз ${phrases.length}`);

  // основа → целевые слова
  const stemIndex = new Map();
  for (const w of single) {
    const s = stem(w);
    if (!stemIndex.has(s)) stemIndex.set(s, []);
    stemIndex.get(s).push(w);
  }
  // первое слово фразы → фразы
  const phraseIndex = new Map();
  for (const p of phrases) {
    const first = p.split(/\s+/)[0];
    if (!phraseIndex.has(first)) phraseIndex.set(first, []);
    phraseIndex.get(first).push(p);
  }

  const found = new Map(); // цель → [{en, ru, corpus, score}]

  for (const { name, weight } of CORPORA) {
    const dir = await download(name);
    const files = execFileSync("ls", [dir], { encoding: "utf8" }).split("\n").filter(Boolean);
    const enFile = files.find((f) => f.endsWith(".en"));
    const ruFile = files.find((f) => f.endsWith(".ru"));
    if (!enFile || !ruFile) { console.log(`  ⚠️  ${name}: не нашёл текстовые файлы`); continue; }

    const enStream = createInterface({ input: createReadStream(path.join(dir, enFile), "utf8"), crlfDelay: Infinity });
    const ruLines = readFileSync(path.join(dir, ruFile), "utf8").split("\n");

    let i = 0;
    let added = 0;
    for await (const enLine of enStream) {
      const ru = (ruLines[i] ?? "").trim();
      const en = enLine.trim();
      i++;
      if (!usable(en, ru)) continue;

      const ws = tokens(en);
      const seen = new Set();
      for (let k = 0; k < ws.length; k++) {
        const w = ws[k];
        for (const cand of [w, stem(w)]) {
          for (const target of stemIndex.get(cand) ?? []) {
            if (seen.has(target)) continue;
            if (!isFormOf(w, target)) continue;
            seen.add(target);
            const list = found.get(target) ?? [];
            if (list.length < MAX_PER_TARGET * 3) {
              list.push({ en, ru, corpus: name, score: weight * 100 + ws.length });
              found.set(target, list);
              added++;
            }
          }
        }
        for (const p of phraseIndex.get(w) ?? []) {
          if (seen.has(p)) continue;
          if (!en.toLowerCase().includes(p)) continue;
          seen.add(p);
          const list = found.get(p) ?? [];
          if (list.length < MAX_PER_TARGET * 3) {
            list.push({ en, ru, corpus: name, score: weight * 100 + ws.length });
            found.set(p, list);
            added++;
          }
        }
      }
    }
    console.log(`  ${name}: обработано ${i} строк, добавлено ${added} пар, целей с примерами ${found.size}`);
  }

  // оставляем по несколько лучших пар на цель: сначала простые короткие
  const out = {};
  for (const [target, list] of found) {
    out[target] = list.sort((a, b) => a.score - b.score).slice(0, MAX_PER_TARGET).map(({ en, ru, corpus }) => ({ en, ru, corpus }));
  }
  writeJson(cachePath("examples.json"), out);

  const covered = Object.keys(out).length;
  console.log(`\nПримеры найдены для ${covered} целей из ${single.size + phrases.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
