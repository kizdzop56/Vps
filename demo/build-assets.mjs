// Builds asset-map.json: bundle path string -> data URI.
// - App images (mascots/badges): resize to <=480px width, convert to WebP q80
// - Small library PNGs (react-navigation/expo-router icons): raw base64
// - Feather.ttf (both copies): raw base64 (needed for the icon font)
// - Unused big icon TTFs: SKIPPED (never requested at runtime — only Feather renders)
// - favicon.ico: emitted separately as favicon.txt
import sharp from "sharp";
import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import path from "node:path";

const WEB = "/agent/workspace/V1/artifacts/english-learning/static-build/web";
// Auto-discover the hashed entry bundle (hash changes on every export).
const JS_DIR = path.join(WEB, "_expo/static/js/web");
const entryName = readdirSync(JS_DIR).find((f) => f.startsWith("entry-") && f.endsWith(".js"));
if (!entryName) throw new Error("entry-*.js not found in " + JS_DIR);
const ENTRY = path.join(JS_DIR, entryName);
console.log("entry bundle:", entryName);

const entry = readFileSync(ENTRY, "utf8");
const paths = [...new Set([...entry.matchAll(/"(\/assets\/[^"]+)"/g)].map((m) => m[1]))];

const SKIP_FONTS = /vector-icons\/build\/vendor\/react-native-vector-icons\/Fonts\/(?!Feather)/;

const map = {};
let inlined = 0, skipped = 0, totalBytes = 0;

for (const p of paths) {
  const file = path.join(WEB, decodeURI(p));
  let size;
  try {
    size = statSync(file).size;
  } catch {
    console.log("MISSING on disk:", p);
    continue;
  }
  if (SKIP_FONTS.test(p)) {
    skipped++;
    continue; // unused icon font families
  }
  const ext = path.extname(file).toLowerCase();
  let dataUri;
  if ((ext === ".png" || ext === ".jpeg" || ext === ".jpg") && size > 60_000) {
    // big app image -> webp
    const buf = await sharp(file).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    dataUri = `data:image/webp;base64,${buf.toString("base64")}`;
  } else {
    const mime =
      ext === ".png" ? "image/png"
      : ext === ".jpeg" || ext === ".jpg" ? "image/jpeg"
      : ext === ".ttf" ? "font/ttf"
      : "application/octet-stream";
    dataUri = `data:${mime};base64,${readFileSync(file).toString("base64")}`;
  }
  map[p] = dataUri;
  inlined++;
  totalBytes += dataUri.length;
}

writeFileSync("/agent/workspace/webapp-build/asset-map.json", JSON.stringify(map));

// favicon
const fav = readFileSync(path.join(WEB, "favicon.ico"));
writeFileSync("/agent/workspace/webapp-build/favicon.txt", `data:image/x-icon;base64,${fav.toString("base64")}`);

console.log(`paths in bundle: ${paths.length}, inlined: ${inlined}, skipped fonts: ${skipped}`);
console.log(`asset map size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
for (const [p, d] of Object.entries(map)) {
  if (d.length > 200_000) console.log(`  big: ${(d.length / 1024).toFixed(0)}KB ${p.slice(0, 80)}`);
}
