// Восстанавливает PNG-медали из их base64-версий (*.png.b64).
// Медали хранятся в git как текст (.b64), потому что бинарные файлы нельзя
// загрузить через GitHub API без повреждения. Скрипт запускается автоматически
// в postinstall (локально при `pnpm install` и при сборке Docker-образа),
// поэтому к моменту сборки фронтенда настоящие .png уже на месте. Идемпотентно.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const MEDALS = path.resolve(here, "../artifacts/english-learning/assets/badges/medals");

try {
  if (!fs.existsSync(MEDALS)) process.exit(0);
  const b64files = fs.readdirSync(MEDALS).filter((f) => f.endsWith(".png.b64"));
  let restored = 0;
  for (const f of b64files) {
    const pngPath = path.join(MEDALS, f.replace(/\.b64$/, ""));
    if (fs.existsSync(pngPath)) continue;
    fs.writeFileSync(pngPath, Buffer.from(fs.readFileSync(path.join(MEDALS, f), "utf8"), "base64"));
    restored++;
  }
  if (restored) console.log(`[decode-medals] восстановлено PNG-медалей: ${restored}`);
} catch (e) {
  console.error("[decode-medals] предупреждение:", e && e.message ? e.message : e);
}
