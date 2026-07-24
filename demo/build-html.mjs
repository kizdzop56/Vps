// Assembles the final self-contained HTML:
//   [prelude: shims + mock backend] -> [entry bundle (assets inlined)] -> [expo-av chunk] -> [loader wrapper]
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const WEB = "/agent/workspace/V1/artifacts/english-learning/static-build/web";
const B = "/agent/workspace/webapp-build";

// Auto-discover hashed bundle filenames (hashes change on every export).
const JS_DIR = path.join(WEB, "_expo/static/js/web");
const CSS_DIR = path.join(WEB, "_expo/static/css");
const entryName = readdirSync(JS_DIR).find((f) => f.startsWith("entry-") && f.endsWith(".js"));
const chunkName = readdirSync(JS_DIR).find((f) => f.startsWith("index-") && f.endsWith(".js"));
const cssName = readdirSync(CSS_DIR).find((f) => f.endsWith(".css"));
if (!entryName || !chunkName || !cssName) throw new Error("export bundles not found");
console.log("bundles:", entryName, chunkName, cssName);
const chunkStem = chunkName.replace(/\.js$/, "").slice(0, 14); // e.g. "index-d202a496"

const entryPath = path.join(JS_DIR, entryName);
const chunkPath = path.join(JS_DIR, chunkName);
const cssPath = path.join(CSS_DIR, cssName);

let entry = readFileSync(entryPath, "utf8");
const chunk = readFileSync(chunkPath, "utf8");
const css = readFileSync(cssPath, "utf8");
const assetMap = JSON.parse(readFileSync(path.join(B, "asset-map.json"), "utf8"));
const favicon = readFileSync(path.join(B, "favicon.txt"), "utf8").trim();
let mock = readFileSync(path.join(B, "mock-backend.js"), "utf8");
const prelude = readFileSync(path.join(B, "prelude.js"), "utf8");

// Embed the seed demo video (bytes -> data URL) into the mock's seed storage.
const seedVideoDataUrl = "data:video/mp4;base64," + readFileSync(path.join(B, "test-video.mp4")).toString("base64");
if (!mock.includes("__SEED_VIDEO_DATAURL__")) throw new Error("seed video placeholder missing in mock-backend.js");
mock = mock.replace("__SEED_VIDEO_DATAURL__", seedVideoDataUrl);

// 0. Surgical bundle patches.
// All previous behavior patches are now NATIVE in the source code (invite code
// visibility, per-tab guides, today-time counter, reading screen, media URLs),
// so the list is empty. Keep the mechanism for future hotfixes: each patch
// must match EXACTLY ONCE against the current minified bundle.
const bundlePatches = [];
for (const p of bundlePatches) {
  const count = entry.split(p.find).length - 1;
  if (count !== 1) throw new Error(`bundle patch "${p.name}": expected 1 match, got ${count}`);
  entry = entry.replace(p.find, p.replace);
  console.log(`bundle patch applied: ${p.name}`);
}

// 1. Inline assets into the entry bundle (exact string replacement)
let replaced = 0;
for (const [p, dataUri] of Object.entries(assetMap)) {
  const needle = `"${p}"`;
  if (entry.includes(needle)) {
    entry = entry.split(needle).join(`"${dataUri}"`);
    replaced++;
  } else {
    console.log("WARN: path not found in entry:", p.slice(0, 90));
  }
}
console.log(`assets inlined: ${replaced}/${Object.keys(assetMap).length}`);

// 2. Escape </script for inline embedding (safe inside JS strings/regexes)
const esc = (s) => s.replace(/<\/script/gi, "<\\/script");

const wrapper = `
(function(){
  var k='__loadBundleAsync';
  var orig = globalThis[k];
  globalThis[k] = function(u){
    if (String(u).indexOf('${chunkStem}') !== -1) return Promise.resolve();
    return orig ? orig(u) : Promise.resolve();
  };
})();`;

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
<title>English Learning App — демо</title>
<link rel="icon" href="${favicon}" />
<style id="expo-reset">
html, body { height: 100%; }
body { overflow: hidden; margin: 0; }
#root { display: flex; height: 100%; flex: 1; }
</style>
<style>${css}</style>
<style>
#_splash-screen{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#F8F5FF 0%,#D0C2FF 100%);font-family:-apple-system,BlinkMacSystemFont,sans-serif;transition:opacity .4s ease}
#_splash-screen.hidden{opacity:0;pointer-events:none}
#_splash-spin{width:36px;height:36px;border:3px solid rgba(100,60,220,.2);border-top-color:#6B3EDB;border-radius:50%;animation:_sp .7s linear infinite;margin-bottom:16px}
@keyframes _sp{to{transform:rotate(360deg)}}
#_splash-txt{color:#6B3EDB;font-size:15px;font-weight:500;opacity:.8}
</style>
</head>
<body>
<noscript>You need to enable JavaScript to run this app.</noscript>
<div id="root"></div>
<div id="_splash-screen"><div id="_splash-spin"></div><div id="_splash-txt">Загрузка приложения…</div></div>
<script>${esc(prelude)}</script>
<script>${esc(mock)}</script>
<script>${esc(entry)}</script>
<script>${esc(chunk)}</script>
<script>${esc(wrapper)}</script>
</body>
</html>`;

const out = path.join(B, "english-learning-demo.html");
writeFileSync(out, html);
console.log(`written: ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
