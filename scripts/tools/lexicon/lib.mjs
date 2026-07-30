// Общая инфраструктура выкачки лексики из проверенных источников.
//
// Всё, что скачано, кладётся в scripts/.cache/lexicon/** — повторные прогоны
// берут данные из кэша и не бьют по сайтам. Кэш в гите не хранится (.gitignore),
// но датасет из него воспроизводим: удалил кэш → прогнал заново → те же файлы.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const CACHE = path.join(ROOT, "scripts/.cache/lexicon");

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"];

export function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

export function cachePath(...parts) {
  const p = path.join(CACHE, ...parts);
  ensureDir(path.dirname(p));
  return p;
}

export function readJson(file, fallback = null) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  writeFileSync(file, JSON.stringify(data, null, 2));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Вежливая выкачка: троттлинг, ретраи с экспоненциальной паузой, кэш на диск.
export async function fetchText(url, { cacheFile, headers = {}, retries = 3, delayMs = 350, method = "GET", body = null } = {}) {
  if (cacheFile && existsSync(cacheFile)) return readFileSync(cacheFile, "utf8");

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        body,
        headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9,ru;q=0.8", ...headers },
        redirect: "follow",
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 404 || res.status === 302) {
        if (cacheFile) { ensureDir(path.dirname(cacheFile)); writeFileSync(cacheFile, ""); }
        return "";
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (cacheFile) { ensureDir(path.dirname(cacheFile)); writeFileSync(cacheFile, text); }
      await sleep(delayMs);
      return text;
    } catch (e) {
      lastErr = e;
      await sleep(800 * (attempt + 1));
    }
  }
  throw new Error(`не удалось скачать ${url}: ${lastErr?.message}`);
}

// Пул с ограниченной параллельностью — чтобы не устраивать источникам флуд.
export async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await worker(items[idx], idx);
      } catch (e) {
        out[idx] = { __error: e.message };
      }
    }
  });
  await Promise.all(runners);
  return out;
}

export function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&hellip;/g, "…")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

export function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}
