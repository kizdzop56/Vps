// ─────────────────────────────────────────────────────────────────────────────
// Запуск модульных тестов сервера.
//
//   pnpm --filter @workspace/api-server test
//   pnpm test          (из корня — прогонит все пакеты, где есть скрипт test)
//
// ── Почему не vitest ────────────────────────────────────────────────────────
// Тесты написаны на node:test и node:assert — они есть в самом Node, ставить
// ради них ничего не нужно. vitest притащил бы полсотни пакетов, а образ на
// Render ставит все зависимости при каждой сборке и уже упирался в лимит
// памяти. Платить минутами сборки за то, что решается этим файлом, незачем.
//
// ── Почему нельзя просто `node --test` ──────────────────────────────────────
// Две причины, и обе непреодолимы без сборки:
//   1. файлы на TypeScript — нативно Node их не исполняет (в 24-м уже умеет,
//      но на 20-м, который стоит в CI, нет);
//   2. модули импортируют друг друга без расширений («./srs»), а нативный ESM
//      требует «./srs.js». Переписывать импорты ради тестов — портить исходники.
//
// Поэтому каждый тест собирается esbuild-ом в самодостаточный .mjs (bundle
// разрешает и TypeScript, и безрасширенные пути), и уже его запускает
// node --test. esbuild здесь не новая зависимость: им же собирается сам сервер.
// ─────────────────────────────────────────────────────────────────────────────

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(root, "src");

/** Все *.test.ts внутри src, включая вложенные папки. */
function findTests(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findTests(full));
    else if (entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out.sort();
}

const tests = findTests(srcDir);
if (tests.length === 0) {
  console.error("Тестов не найдено — искали *.test.ts в src/");
  process.exit(1);
}

const outDir = mkdtempSync(path.join(tmpdir(), "api-server-tests-"));

try {
  await build({
    entryPoints: tests,
    outdir: outDir,
    // bundle обязателен: он и разрешает импорты без расширений, и втягивает
    // соседние модули, которые тест проверяет.
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    sourcemap: "inline",
    // Внешние пакеты не собираем: тесты трогают только чистые модули, а если
    // какой-то из них потянет @workspace/db, лучше упасть с внятной ошибкой
    // импорта, чем молча собрать в бандл драйвер базы.
    packages: "external",
    logLevel: "silent",
  });

  const built = readdirSync(outDir)
    .filter((f) => f.endsWith(".js") || f.endsWith(".mjs"))
    .map((f) => path.join(outDir, f));

  // --enable-source-maps: стек ошибки указывает на строку .ts, а не бандла.
  const run = spawnSync(process.execPath, ["--test", "--enable-source-maps", ...built], {
    stdio: "inherit",
    cwd: root,
  });

  process.exit(run.status ?? 1);
} catch (err) {
  console.error("Не удалось собрать тесты:", err);
  process.exit(1);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
