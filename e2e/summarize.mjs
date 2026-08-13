// Превращает report.json от Playwright в короткий markdown-отчёт.
//
// Отчёт уходит в GitHub Issue: оттуда его читает QA-агент и раскладывает
// падения по тикетам. Поэтому важны две вещи — имя теста и первая строка
// ошибки; портянка стека агенту только мешает.
import fs from "node:fs";

const reportPath = process.argv[2] ?? "report.json";
const baseUrl = process.env.BASE_URL ?? "неизвестно";
const runUrl = process.env.RUN_URL ?? "";

const stripAnsi = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, "");
const clamp = (s, max = 1200) => (s.length > max ? `${s.slice(0, max)}\n… обрезано` : s);

function collectFailures(report) {
  const failures = [];

  const walk = (suite, path) => {
    const title = [...path, suite.title].filter(Boolean);
    for (const spec of suite.specs ?? []) {
      if (spec.ok) continue;
      const results = (spec.tests ?? []).flatMap((t) => t.results ?? []);
      const message = results.map((r) => r.error?.message).filter(Boolean)[0] ?? "без сообщения";
      failures.push({
        name: [...title, spec.title].join(" › "),
        file: suite.file ?? spec.file ?? "",
        error: clamp(stripAnsi(message).trim()),
      });
    }
    for (const child of suite.suites ?? []) walk(child, title);
  };

  for (const suite of report.suites ?? []) walk(suite, []);
  return failures;
}

let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
} catch (err) {
  // Отчёта нет — прогон не дошёл даже до тестов (не проснулся сервис, упала
  // установка браузера). Это тоже сигнал, и молчать о нём нельзя.
  console.log(`## E2E-прогон не состоялся\n\n**Стенд:** ${baseUrl}\n\nОтчёт \`${reportPath}\` не прочитан: ${err.message}\n${runUrl ? `\n[Логи прогона](${runUrl})\n` : ""}`);
  process.exit(0);
}

const failures = collectFailures(report);
const stats = report.stats ?? {};

const lines = [];
lines.push(`## E2E-прогон: ${failures.length ? `падений ${failures.length}` : "всё зелено"}`);
lines.push("");
lines.push(`**Стенд:** ${baseUrl}`);
if (stats.expected != null) lines.push(`**Прошло:** ${stats.expected} · **Упало:** ${stats.unexpected ?? 0} · **Пропущено:** ${stats.skipped ?? 0}`);
if (runUrl) lines.push(`**Логи, скриншоты и видео:** ${runUrl}`);
lines.push("");

for (const f of failures) {
  lines.push(`### ${f.name}`);
  if (f.file) lines.push(`\`${f.file}\``);
  lines.push("");
  lines.push("```");
  lines.push(f.error);
  lines.push("```");
  lines.push("");
}

if (failures.length) {
  lines.push("---");
  lines.push("Каждое падение выше — отдельный баг. Скриншот и видео лежат в артефактах прогона.");
}

console.log(lines.join("\n"));
