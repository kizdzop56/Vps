#!/usr/bin/env node
/**
 * Сквозная проверка объектного хранилища (S3-совместимого).
 *
 * Запуск:
 *   node scripts/storage-check.mjs
 *   node scripts/storage-check.mjs --origin https://my-app.onrender.com
 *
 * Зависимостей НЕТ — только встроенный Node. Скрипт можно запустить прямо на
 * Render (Shell) или на VPS, без установки пакетов и без сборки проекта.
 *
 * Что проверяется по шагам:
 *   1. заданы ли переменные окружения;
 *   2. загрузка объекта (права на запись);
 *   3. HEAD (права на чтение метаданных, сохранился ли Content-Type);
 *   4. скачивание и побайтовое сравнение;
 *   5. работает ли presigned GET — именно так браузер получает файлы;
 *   6. CORS-preflight на presigned PUT — самая частая причина «настроил, а
 *      загрузка из браузера не работает»;
 *   7. удаление тестового объекта.
 *
 * Подпись SigV4 здесь реализована независимо от `artifacts/api-server/src/lib/
 * s3Client.ts`. Это сделано намеренно: скрипт остаётся автономным, а совпадение
 * двух независимых реализаций на живом бакете — дополнительная проверка. Логику
 * подписи приложения покрывает отдельный юнит-тест на векторах AWS
 * (`artifacts/api-server/src/lib/s3Client.test.ts`).
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ─── Мелкие утилиты вывода ───────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};
const ok = (m) => console.log(`${C.green}✓${C.reset} ${m}`);
const bad = (m) => console.log(`${C.red}✗${C.reset} ${m}`);
const warn = (m) => console.log(`${C.yellow}!${C.reset} ${m}`);
const info = (m) => console.log(`${C.dim}  ${m}${C.reset}`);
const step = (m) => console.log(`\n${C.bold}${m}${C.reset}`);

// ─── Загрузка .env без внешних зависимостей ──────────────────────────────────
function loadDotEnv() {
  for (const candidate of [".env", "../.env", "../../.env"]) {
    const file = path.resolve(process.cwd(), candidate);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let value = m[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // Переменные окружения важнее файла.
      if (process.env[key] === undefined) process.env[key] = value;
    }
    info(`переменные подхвачены из ${candidate}`);
    return;
  }
}

// ─── Минимальный SigV4 ───────────────────────────────────────────────────────
const sha256 = (d) => createHash("sha256").update(d).digest("hex");
const hmac = (k, d) => createHmac("sha256", k).update(d, "utf8").digest();
const EMPTY_SHA = sha256("");

const enc = (v, keepSlash = false) => {
  let out = encodeURIComponent(v).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  if (keepSlash) out = out.replace(/%2F/g, "/");
  return out;
};

const canonicalQuery = (params) =>
  Object.keys(params)
    .sort()
    .map((k) => `${enc(k)}=${enc(params[k])}`)
    .join("&");

function signingKey(secret, dateStamp, region) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), "s3"), "aws4_request");
}

function amzDates(date = new Date()) {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

class Probe {
  constructor(cfg) {
    this.cfg = cfg;
    const url = new URL(cfg.endpoint);
    this.host = cfg.forcePathStyle ? url.host : `${cfg.bucket}.${url.host}`;
    this.protocol = url.protocol;
    this.basePath = cfg.forcePathStyle ? `/${cfg.bucket}` : "";
  }

  target(key) {
    return {
      host: this.host,
      canonicalPath: `${this.basePath}/${enc(key, true)}`,
    };
  }

  presign(method, key, expiresIn = 300) {
    const { amzDate, dateStamp } = amzDates();
    const { host, canonicalPath } = this.target(key);
    const scope = `${dateStamp}/${this.cfg.region}/s3/aws4_request`;
    const params = {
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${this.cfg.accessKeyId}/${scope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expiresIn),
      "X-Amz-SignedHeaders": "host",
    };
    const query = canonicalQuery(params);
    const canonical = [
      method,
      canonicalPath,
      query,
      `host:${host}\n`,
      "host",
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const sts = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
    const sig = createHmac(
      "sha256",
      signingKey(this.cfg.secretAccessKey, dateStamp, this.cfg.region)
    )
      .update(sts, "utf8")
      .digest("hex");
    return `${this.protocol}//${host}${canonicalPath}?${query}&X-Amz-Signature=${sig}`;
  }

  async request(method, key, { body, contentType } = {}) {
    const { amzDate, dateStamp } = amzDates();
    const { host, canonicalPath } = this.target(key);
    const scope = `${dateStamp}/${this.cfg.region}/s3/aws4_request`;
    const payloadHash = body ? sha256(body) : EMPTY_SHA;

    const headers = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    if (contentType) headers["content-type"] = contentType;

    const names = Object.keys(headers).sort();
    const canonical = [
      method,
      canonicalPath,
      "",
      names.map((n) => `${n}:${headers[n]}\n`).join(""),
      names.join(";"),
      payloadHash,
    ].join("\n");
    const sts = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
    const sig = createHmac(
      "sha256",
      signingKey(this.cfg.secretAccessKey, dateStamp, this.cfg.region)
    )
      .update(sts, "utf8")
      .digest("hex");

    const { host: _h, ...send } = headers;
    return fetch(`${this.protocol}//${host}${canonicalPath}`, {
      method,
      headers: {
        ...send,
        Authorization:
          `AWS4-HMAC-SHA256 Credential=${this.cfg.accessKeyId}/${scope}, ` +
          `SignedHeaders=${names.join(";")}, Signature=${sig}`,
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  }
}

// ─── Подсказки по ошибкам ────────────────────────────────────────────────────
function explain(status, text) {
  if (status === 403 && /SignatureDoesNotMatch/i.test(text)) {
    return "Не совпала подпись — почти всегда неверный S3_SECRET_ACCESS_KEY, либо неверный S3_REGION (для R2 нужен auto).";
  }
  if (status === 403) {
    return "Доступ запрещён — у ключа нет прав на запись/чтение в этом бакете (нужны Object Read & Write).";
  }
  if (status === 404 && /NoSuchBucket/i.test(text)) {
    return "Бакет не найден — проверьте S3_BUCKET и что endpoint относится к тому же аккаунту.";
  }
  if (status === 400 && /InvalidRequest|AuthorizationHeaderMalformed/i.test(text)) {
    return "Провайдер не принял запрос — попробуйте переключить S3_FORCE_PATH_STYLE (true/false).";
  }
  if (status === 301 || status === 307) {
    return "Редирект — обычно неверный регион в S3_REGION или endpoint другого региона.";
  }
  return null;
}

async function bodyText(res) {
  try {
    return (await res.text()).slice(0, 400);
  } catch {
    return "";
  }
}

// ─── Основной сценарий ───────────────────────────────────────────────────────
async function main() {
  console.log(`${C.bold}Проверка объектного хранилища${C.reset}`);
  loadDotEnv();

  const originArgIndex = process.argv.indexOf("--origin");
  const origin =
    originArgIndex !== -1 ? process.argv[originArgIndex + 1] : process.env.APP_URL || null;

  step("1. Переменные окружения");
  const cfg = {
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    region: process.env.S3_REGION || "auto",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  };
  const prefix = (process.env.S3_PREFIX ?? "uploads").replace(/^\/+|\/+$/g, "");

  const missing = ["endpoint", "bucket", "accessKeyId", "secretAccessKey"].filter(
    (k) => !cfg[k]
  );
  if (missing.length) {
    const names = {
      endpoint: "S3_ENDPOINT",
      bucket: "S3_BUCKET",
      accessKeyId: "S3_ACCESS_KEY_ID",
      secretAccessKey: "S3_SECRET_ACCESS_KEY",
    };
    bad(`не заданы: ${missing.map((k) => names[k]).join(", ")}`);
    info("Приложение будет складывать файлы на локальный диск.");
    info("На Render это значит: файлы исчезнут при следующем деплое.");
    info("Инструкция по настройке: deploy-vps/STORAGE.md");
    process.exit(1);
  }

  ok("все обязательные переменные заданы");
  info(`endpoint        ${cfg.endpoint}`);
  info(`bucket          ${cfg.bucket}`);
  info(`region          ${cfg.region}`);
  info(`prefix          ${prefix || "(без префикса)"}`);
  info(`path-style      ${cfg.forcePathStyle}`);
  info(`access key      ${cfg.accessKeyId.slice(0, 4)}…${cfg.accessKeyId.slice(-4)}`);
  info(`secret key      ${"•".repeat(8)} (${cfg.secretAccessKey.length} символов)`);

  const probe = new Probe(cfg);
  const testKey = `${prefix ? `${prefix}/` : ""}__storage-check-${randomUUID()}.txt`;
  const payload = `storage check ${new Date().toISOString()}`;
  let failures = 0;
  let uploaded = false;

  step("2. Загрузка объекта (права на запись)");
  {
    const res = await probe.request("PUT", testKey, {
      body: payload,
      contentType: "text/plain; charset=utf-8",
    });
    if (res.ok) {
      uploaded = true;
      ok(`объект записан: ${testKey}`);
    } else {
      failures++;
      const text = await bodyText(res);
      bad(`не удалось записать: HTTP ${res.status}`);
      const hint = explain(res.status, text);
      if (hint) info(hint);
      if (text) info(`ответ: ${text}`);
      // Дальше идти незачем — всё остальное зависит от записи.
      console.log(`\n${C.red}Итог: хранилище не работает на записи.${C.reset}`);
      process.exit(1);
    }
  }

  step("3. HEAD (метаданные и Content-Type)");
  {
    const res = await probe.request("HEAD", testKey);
    if (res.ok) {
      const type = res.headers.get("content-type");
      ok(`метаданные читаются, Content-Type: ${type}`);
      if (!type || !type.startsWith("text/plain")) {
        warn("Content-Type не сохранился — аудио/видео могут не проигрываться");
      }
    } else {
      failures++;
      bad(`HEAD не прошёл: HTTP ${res.status}`);
    }
  }

  step("4. Скачивание и сверка содержимого");
  {
    const res = await probe.request("GET", testKey);
    if (res.ok) {
      const text = await res.text();
      if (text === payload) ok("содержимое совпало побайтово");
      else {
        failures++;
        bad("содержимое не совпало");
      }
    } else {
      failures++;
      bad(`GET не прошёл: HTTP ${res.status}`);
    }
  }

  step("5. Presigned GET (так браузер получает файлы)");
  {
    const url = probe.presign("GET", testKey);
    // Важно: без заголовков авторизации — подпись целиком в query string.
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      ok("presigned ссылка работает");
    } else {
      failures++;
      const text = await bodyText(res);
      bad(`presigned ссылка не работает: HTTP ${res.status}`);
      const hint = explain(res.status, text);
      if (hint) info(hint);
    }
  }

  step("6. CORS-preflight на presigned PUT");
  if (!origin) {
    warn("origin не указан — проверка пропущена");
    info("Запустите с --origin https://ваш-домен, либо задайте APP_URL");
    info("Без CORS браузер не сможет грузить файлы напрямую в бакет.");
  } else {
    const url = probe.presign("PUT", `${testKey}.cors`);
    const res = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
      signal: AbortSignal.timeout(30_000),
    });
    const allowOrigin = res.headers.get("access-control-allow-origin");
    const allowMethods = res.headers.get("access-control-allow-methods") || "";

    if (allowOrigin && (allowOrigin === "*" || allowOrigin === origin)) {
      ok(`CORS разрешает ${origin}`);
      if (allowMethods && !/PUT/i.test(allowMethods)) {
        failures++;
        bad(`но метод PUT не разрешён (allow-methods: ${allowMethods})`);
      }
    } else {
      failures++;
      bad(`CORS не настроен для ${origin}`);
      info(`preflight ответил HTTP ${res.status}, allow-origin: ${allowOrigin ?? "нет"}`);
      info("Добавьте CORS-правило на бакет: см. раздел «CORS» в deploy-vps/STORAGE.md");
    }
  }

  step("7. Удаление тестового объекта");
  if (uploaded) {
    const res = await probe.request("DELETE", testKey);
    if (res.ok || res.status === 204) ok("тестовый объект удалён");
    else warn(`не удалось удалить ${testKey} (HTTP ${res.status}) — удалите вручную`);
  }

  console.log("");
  if (failures === 0) {
    console.log(`${C.green}${C.bold}Итог: хранилище настроено правильно.${C.reset}`);
    console.log("Можно проверять загрузку аватара и медиа в самом приложении.");
  } else {
    console.log(`${C.red}${C.bold}Итог: проблем — ${failures}.${C.reset}`);
    console.log("Разберите пункты выше, отмеченные ✗, затем запустите проверку снова.");
    process.exit(1);
  }
}

// main() запускается только при прямом вызове файла, чтобы Probe можно было
// импортировать из тестов, не запуская проверку.
// fileURLToPath, а не import.meta.filename: последнее появилось лишь в Node 21,
// а на VPS системный node может быть старше.
const invokedDirectly =
  process.argv[1] != null &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`\n${C.red}Проверка упала с ошибкой:${C.reset}`, err?.message ?? err);
    if (err?.cause?.code === "ENOTFOUND") {
      console.error("Хост endpoint не разрешается в DNS — проверьте S3_ENDPOINT.");
    }
    process.exit(1);
  });
}

export { Probe };
