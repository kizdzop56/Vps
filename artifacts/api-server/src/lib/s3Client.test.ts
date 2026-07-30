/**
 * Проверка ручной реализации AWS Signature V4 в `s3Client.ts`.
 *
 * Подпись написана руками (почему — см. комментарий в s3Client.ts), поэтому
 * тест построен как двойная сверка:
 *
 *  1. В тесте лежит НЕЗАВИСИМАЯ эталонная реализация SigV4 (`referenceSign`),
 *     написанная прямо по спецификации.
 *  2. Эталонная реализация привязана к официальному вектору AWS SigV4 test
 *     suite `get-vanilla` — если она сама неверна, тест падает первым же
 *     assert'ом и врать про боевой клиент не может.
 *  3. Канонический запрос боевого клиента сверяется с ОПУБЛИКОВАННЫМ AWS
 *     хешем canonical request из документации S3 (3bfa2928…).
 *  4. И только потом эталоном проверяется вывод боевого клиента.
 *
 * Такая схема ловит расхождение, даже если ошибка в production-коде и в тесте
 * была бы одинаковой: пункты 2 и 3 закреплены внешними эталонами AWS.
 *
 * Запуск: pnpm exec tsx --test artifacts/api-server/src/lib/s3Client.test.ts
 * Зависимостей нет — только node:test, node:assert и crypto.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "crypto";
import { S3Client } from "./s3Client";

// Канонические тестовые креды из документации AWS.
const ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE";
const SECRET_KEY = "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY";

const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");
const hmac = (key: string | Buffer, data: string) =>
  createHmac("sha256", key).update(data, "utf8").digest();

/**
 * Эталонная реализация SigV4 по спецификации — независимая от s3Client.ts.
 * Принимает готовый canonical request, чтобы не дублировать логику его сборки.
 */
function referenceSign(params: {
  canonicalRequest: string;
  amzDate: string;
  dateStamp: string;
  region: string;
  service: string;
  secretKey: string;
}): string {
  const scope = `${params.dateStamp}/${params.region}/${params.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    params.amzDate,
    scope,
    sha256Hex(params.canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${params.secretKey}`, params.dateStamp);
  const kRegion = hmac(kDate, params.region);
  const kService = hmac(kRegion, params.service);
  const kSigning = hmac(kService, "aws4_request");

  return createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Привязка эталонной реализации к официальному вектору AWS
// ─────────────────────────────────────────────────────────────────────────────

test("эталонная реализация воспроизводит официальный вектор AWS get-vanilla", () => {
  // Вектор get-vanilla из AWS Signature V4 test suite.
  const canonicalRequest = [
    "GET",
    "/",
    "",
    "host:example.amazonaws.com\nx-amz-date:20150830T123600Z\n",
    "host;x-amz-date",
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  ].join("\n");

  const signature = referenceSign({
    canonicalRequest,
    amzDate: "20150830T123600Z",
    dateStamp: "20150830",
    region: "us-east-1",
    service: "service",
    secretKey: SECRET_KEY,
  });

  assert.equal(
    signature,
    "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    "эталонная реализация в тесте расходится с официальным вектором AWS — " +
      "дальше ей нельзя проверять боевой клиент"
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Канонический запрос боевого клиента против опубликованного хеша AWS
// ─────────────────────────────────────────────────────────────────────────────

/** Сценарий presigned GET из документации S3 (query-string authentication). */
const S3_DOC_PRESIGN = {
  amzDate: "20130524T000000Z",
  dateStamp: "20130524",
  region: "us-east-1",
  bucket: "examplebucket",
  key: "test.txt",
  expiresIn: 86400,
  host: "examplebucket.s3.amazonaws.com",
  /** Canonical request ровно в том виде, как он напечатан в документации AWS. */
  canonicalRequest: [
    "GET",
    "/test.txt",
    "X-Amz-Algorithm=AWS4-HMAC-SHA256" +
      "&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request" +
      "&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host",
    "host:examplebucket.s3.amazonaws.com\n",
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n"),
  /** Хеш canonical request, ОПУБЛИКОВАННЫЙ AWS для этого примера. */
  publishedHash:
    "3bfa292879f6447bbcda7001decf97f4a54dc650c8942174ae0a9121cf58ad04",
};

test("canonical request из документации AWS сходится с её же хешем", () => {
  // Страховка от опечатки при переносе вектора в тест.
  assert.equal(
    sha256Hex(S3_DOC_PRESIGN.canonicalRequest),
    S3_DOC_PRESIGN.publishedHash,
    "вектор перенесён из документации с искажением"
  );
});

test("presigned URL клиента совпадает с эталоном для вектора AWS", () => {
  const client = new S3Client({
    endpoint: "https://s3.amazonaws.com",
    bucket: S3_DOC_PRESIGN.bucket,
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    region: S3_DOC_PRESIGN.region,
    // В примерах AWS используется virtual-hosted style.
    forcePathStyle: false,
  });

  const url = new URL(
    client.presign({
      method: "GET",
      key: S3_DOC_PRESIGN.key,
      expiresIn: S3_DOC_PRESIGN.expiresIn,
      now: new Date("2013-05-24T00:00:00Z"),
    })
  );

  const expected = referenceSign({
    canonicalRequest: S3_DOC_PRESIGN.canonicalRequest,
    amzDate: S3_DOC_PRESIGN.amzDate,
    dateStamp: S3_DOC_PRESIGN.dateStamp,
    region: S3_DOC_PRESIGN.region,
    service: "s3",
    secretKey: SECRET_KEY,
  });

  assert.equal(url.host, S3_DOC_PRESIGN.host, "virtual-hosted style собран неверно");
  assert.equal(url.pathname, "/test.txt");
  assert.equal(
    url.searchParams.get("X-Amz-Signature"),
    expected,
    "подпись presigned URL расходится с эталоном"
  );

  // Обязательные параметры presigned URL.
  assert.equal(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.equal(
    url.searchParams.get("X-Amz-Credential"),
    `${ACCESS_KEY}/20130524/us-east-1/s3/aws4_request`
  );
  assert.equal(url.searchParams.get("X-Amz-Date"), S3_DOC_PRESIGN.amzDate);
  assert.equal(url.searchParams.get("X-Amz-Expires"), "86400");
  assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "host");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Header-авторизация (её использует сам сервер для HEAD/GET/COPY)
// ─────────────────────────────────────────────────────────────────────────────

test("header-авторизация клиента совпадает с эталоном", () => {
  const client = new S3Client({
    endpoint: "https://s3.amazonaws.com",
    bucket: "examplebucket",
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    region: "us-east-1",
    forcePathStyle: false,
  });

  const signed = client.signRequest({
    method: "GET",
    key: "test.txt",
    headers: { Range: "bytes=0-9" },
    now: new Date("2013-05-24T00:00:00Z"),
  });

  const emptyBodyHash =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  // Заголовки в canonical request: строго по алфавиту, значения обрезаны.
  const canonicalRequest = [
    "GET",
    "/test.txt",
    "",
    `host:examplebucket.s3.amazonaws.com\nrange:bytes=0-9\n` +
      `x-amz-content-sha256:${emptyBodyHash}\nx-amz-date:20130524T000000Z\n`,
    "host;range;x-amz-content-sha256;x-amz-date",
    emptyBodyHash,
  ].join("\n");

  const expected = referenceSign({
    canonicalRequest,
    amzDate: "20130524T000000Z",
    dateStamp: "20130524",
    region: "us-east-1",
    service: "s3",
    secretKey: SECRET_KEY,
  });

  assert.equal(signed.signature, expected, "подпись Authorization расходится с эталоном");
  assert.match(
    signed.headers["authorization"] ?? "",
    /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date/,
    "подписанные заголовки должны быть отсортированы по алфавиту"
  );
  assert.equal(signed.headers["x-amz-content-sha256"], emptyBodyHash);
});

test("тело запроса попадает в payload hash", () => {
  const client = new S3Client({
    endpoint: "https://s3.amazonaws.com",
    bucket: "b",
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    region: "us-east-1",
    forcePathStyle: true,
  });

  const signed = client.signRequest({ method: "PUT", key: "k", body: "hello" });
  assert.equal(signed.headers["x-amz-content-sha256"], sha256Hex("hello"));
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Сборка URL и кодирование ключей
// ─────────────────────────────────────────────────────────────────────────────

const pathStyleClient = () =>
  new S3Client({
    endpoint: "https://abc123.r2.cloudflarestorage.com",
    bucket: "media",
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    region: "auto",
    forcePathStyle: true,
  });

test("path-style кладёт бакет в путь (R2, MinIO)", () => {
  const url = new URL(
    pathStyleClient().presign({
      method: "PUT",
      key: "uploads/file.jpg",
      expiresIn: 900,
    })
  );

  assert.equal(url.host, "abc123.r2.cloudflarestorage.com");
  assert.equal(url.pathname, "/media/uploads/file.jpg");
  assert.ok(url.searchParams.get("X-Amz-Signature"));
});

test("слэши в ключе сохраняются, спецсимволы кодируются", () => {
  const client = pathStyleClient();

  // Слэш — разделитель пути, кодировать нельзя.
  assert.equal(
    new URL(client.presign({ method: "GET", key: "a/b/c.txt", expiresIn: 60 }))
      .pathname,
    "/media/a/b/c.txt"
  );

  // Пробел и скобки обязаны быть percent-encoded: encodeURIComponent сам по себе
  // скобки не кодирует, и это классическая причина SignatureDoesNotMatch.
  const tricky = client.presign({
    method: "GET",
    key: "my file (1).jpg",
    expiresIn: 60,
  });
  assert.ok(
    tricky.includes("my%20file%20%281%29.jpg"),
    `спецсимволы закодированы неверно: ${tricky}`
  );
});

test("регион, ключ и метод влияют на подпись", () => {
  const sigOf = (url: string) => new URL(url).searchParams.get("X-Amz-Signature");
  const at = new Date("2026-07-30T12:00:00Z");
  const base = pathStyleClient();

  const other = new S3Client({
    endpoint: "https://abc123.r2.cloudflarestorage.com",
    bucket: "media",
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    region: "eu-central-1",
    forcePathStyle: true,
  });

  const a = sigOf(base.presign({ method: "GET", key: "f.txt", expiresIn: 60, now: at }));
  const b = sigOf(other.presign({ method: "GET", key: "f.txt", expiresIn: 60, now: at }));
  const c = sigOf(base.presign({ method: "GET", key: "g.txt", expiresIn: 60, now: at }));
  const d = sigOf(base.presign({ method: "PUT", key: "f.txt", expiresIn: 60, now: at }));

  assert.notEqual(a, b, "регион должен влиять на подпись");
  assert.notEqual(a, c, "имя объекта должно влиять на подпись");
  assert.notEqual(a, d, "HTTP-метод должен влиять на подпись");
});
