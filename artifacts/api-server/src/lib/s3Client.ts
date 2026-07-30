/**
 * Минимальный S3-совместимый клиент на встроенном crypto — без @aws-sdk/*.
 *
 * Почему не SDK: в `build.mjs` пакеты `@aws-sdk/*` перечислены в esbuild
 * `external`, то есть они НЕ попадают в бандл и должны физически лежать в
 * node_modules на сервере. Добавление зависимости потребовало бы менять
 * `pnpm-lock.yaml` и ломало бы `pnpm install --frozen-lockfile` на VPS.
 * Нам нужны всего четыре операции (подписать PUT, прочитать объект, проверить
 * существование, обновить метаданные), поэтому подписываем AWS Signature V4
 * руками — это ~150 строк и ноль новых зависимостей.
 *
 * Совместимо с любым S3 API: Cloudflare R2, Backblaze B2, MinIO, Supabase
 * Storage, Storj, Wasabi, Hetzner, iDrive e2, собственно AWS S3.
 *
 * Корректность подписи проверяется двумя способами:
 *  - `s3Client.test.ts` — официальные тестовые векторы AWS SigV4;
 *  - `scripts/storage-check.mjs` — сквозная проверка против живого бакета.
 */
import { createHash, createHmac } from "crypto";

const ALGORITHM = "AWS4-HMAC-SHA256";
const DEFAULT_SERVICE = "s3";
const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
const EMPTY_BODY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export interface S3Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  /**
   * true  -> https://endpoint/bucket/key   (R2, MinIO, B2 — всегда работает)
   * false -> https://bucket.endpoint/key   (virtual-hosted style)
   */
  forcePathStyle: boolean;
  /**
   * Имя сервиса в scope подписи. Всегда "s3" для реальных хранилищ; поле
   * существует только чтобы прогонять официальные тестовые векторы AWS,
   * где сервис называется "service".
   */
  service?: string;
}

/**
 * RFC 3986 percent-encoding. `encodeURIComponent` не кодирует !'()* — AWS
 * требует, чтобы они были закодированы, иначе подпись не совпадёт.
 */
function uriEncode(value: string, encodeSlash = true): string {
  let out = encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  if (!encodeSlash) {
    out = out.replace(/%2F/g, "/");
  }
  return out;
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

/** 20260730T120000Z и 20260730 */
function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

function signingKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

/** Канонический query string: параметры отсортированы по байтам имени. */
function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(params[k] ?? "")}`)
    .join("&");
}

export class S3Client {
  private readonly config: S3Config;
  private readonly endpointHost: string;
  private readonly endpointProtocol: string;
  private readonly service: string;

  constructor(config: S3Config) {
    this.config = config;
    this.service = config.service ?? DEFAULT_SERVICE;
    const url = new URL(config.endpoint);
    this.endpointHost = url.host;
    this.endpointProtocol = url.protocol;
  }

  /** host для заголовка + canonical path для подписи. */
  private resolveTarget(key: string): { host: string; canonicalPath: string } {
    const encodedKey = uriEncode(key, false);
    if (this.config.forcePathStyle) {
      return {
        host: this.endpointHost,
        canonicalPath: `/${this.config.bucket}/${encodedKey}`,
      };
    }
    return {
      host: `${this.config.bucket}.${this.endpointHost}`,
      canonicalPath: `/${encodedKey}`,
    };
  }

  private buildUrl(host: string, canonicalPath: string, query: string): string {
    return `${this.endpointProtocol}//${host}${canonicalPath}${query ? `?${query}` : ""}`;
  }

  /**
   * Presigned URL (авторизация через query string). Именно его отдаём браузеру,
   * чтобы файл шёл напрямую в хранилище, минуя наш сервер.
   *
   * Подписываем только заголовок `host`. Content-Type, который браузер пришлёт
   * при PUT, останется неподписанным — S3 его проигнорирует при проверке
   * подписи, но сохранит как тип объекта. Это делает загрузку устойчивой:
   * несовпадение Content-Type не ломает подпись.
   */
  presign(options: {
    method: "GET" | "PUT" | "HEAD" | "DELETE";
    key: string;
    expiresIn: number;
    query?: Record<string, string>;
    now?: Date;
  }): string {
    const { method, key, expiresIn } = options;
    const now = options.now ?? new Date();
    const { amzDate, dateStamp } = formatAmzDate(now);
    const { host, canonicalPath } = this.resolveTarget(key);
    const scope = `${dateStamp}/${this.config.region}/${this.service}/aws4_request`;

    const params: Record<string, string> = {
      ...(options.query ?? {}),
      "X-Amz-Algorithm": ALGORITHM,
      "X-Amz-Credential": `${this.config.accessKeyId}/${scope}`,
      "X-Amz-Date": amzDate,
      "X-Amz-Expires": String(expiresIn),
      "X-Amz-SignedHeaders": "host",
    };

    const query = canonicalQuery(params);
    const canonicalRequest = [
      method,
      canonicalPath,
      query,
      `host:${host}\n`,
      "host",
      UNSIGNED_PAYLOAD,
    ].join("\n");

    const stringToSign = [
      ALGORITHM,
      amzDate,
      scope,
      sha256Hex(canonicalRequest),
    ].join("\n");

    const signature = createHmac(
      "sha256",
      signingKey(
        this.config.secretAccessKey,
        dateStamp,
        this.config.region,
        this.service
      )
    )
      .update(stringToSign, "utf8")
      .digest("hex");

    return this.buildUrl(host, canonicalPath, `${query}&X-Amz-Signature=${signature}`);
  }

  /**
   * Подписать запрос заголовком Authorization — чистая функция, без сети.
   * Вынесена отдельно, чтобы подпись можно было проверить тестом на
   * официальных векторах AWS (см. `s3Client.test.ts`).
   */
  signRequest(options: {
    method: "GET" | "PUT" | "HEAD" | "DELETE";
    key: string;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    body?: Buffer | string;
    now?: Date;
  }): { url: string; headers: Record<string, string>; signature: string } {
    const { method, key } = options;
    const now = options.now ?? new Date();
    const { amzDate, dateStamp } = formatAmzDate(now);
    const { host, canonicalPath } = this.resolveTarget(key);
    const scope = `${dateStamp}/${this.config.region}/${this.service}/aws4_request`;

    const payloadHash = options.body ? sha256Hex(options.body) : EMPTY_BODY_SHA256;

    const headers: Record<string, string> = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...Object.fromEntries(
        Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
      ),
    };

    const sortedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = sortedHeaderNames
      .map((name) => `${name}:${String(headers[name]).trim()}\n`)
      .join("");
    const signedHeaders = sortedHeaderNames.join(";");

    const query = canonicalQuery(options.query ?? {});
    const canonicalRequest = [
      method,
      canonicalPath,
      query,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const stringToSign = [
      ALGORITHM,
      amzDate,
      scope,
      sha256Hex(canonicalRequest),
    ].join("\n");

    const signature = createHmac(
      "sha256",
      signingKey(
        this.config.secretAccessKey,
        dateStamp,
        this.config.region,
        this.service
      )
    )
      .update(stringToSign, "utf8")
      .digest("hex");

    const authorization =
      `${ALGORITHM} Credential=${this.config.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      url: this.buildUrl(host, canonicalPath, query),
      headers: { ...headers, authorization },
      signature,
    };
  }

  /**
   * Запрос от имени сервера. Используется для HEAD/GET/COPY — то, что делает
   * сам API, а не браузер.
   */
  async signedFetch(options: {
    method: "GET" | "PUT" | "HEAD" | "DELETE";
    key: string;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    body?: Buffer | string;
    now?: Date;
  }): Promise<Response> {
    const signed = this.signRequest(options);

    // `host` подставляет fetch сам — передавать его руками нельзя.
    const { host: _omitHost, ...sendHeaders } = signed.headers;

    return fetch(signed.url, {
      method: options.method,
      headers: sendHeaders,
      body: options.body,
      signal: AbortSignal.timeout(30_000),
    });
  }

  /** Существует ли объект. */
  async objectExists(key: string): Promise<boolean> {
    const res = await this.signedFetch({ method: "HEAD", key });
    if (res.status === 404) return false;
    if (!res.ok) {
      throw new Error(`HEAD ${key} failed: ${res.status} ${res.statusText}`);
    }
    return true;
  }

  /** Метаданные объекта: тип, размер и пользовательские x-amz-meta-*. */
  async headObject(key: string): Promise<{
    contentType: string | null;
    contentLength: number | null;
    userMetadata: Record<string, string>;
  } | null> {
    const res = await this.signedFetch({ method: "HEAD", key });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`HEAD ${key} failed: ${res.status} ${res.statusText}`);
    }

    const userMetadata: Record<string, string> = {};
    res.headers.forEach((value, name) => {
      if (name.toLowerCase().startsWith("x-amz-meta-")) {
        userMetadata[name.toLowerCase().slice("x-amz-meta-".length)] = value;
      }
    });

    const length = res.headers.get("content-length");
    return {
      contentType: res.headers.get("content-type"),
      contentLength: length ? Number(length) : null,
      userMetadata,
    };
  }

  /** Скачать объект (тело — стрим, отдаём как есть в наш прокси-роут). */
  async getObject(key: string): Promise<Response> {
    const res = await this.signedFetch({ method: "GET", key });
    if (!res.ok) {
      throw new Error(`GET ${key} failed: ${res.status} ${res.statusText}`);
    }
    return res;
  }

  /**
   * Обновить пользовательские метаданные. В S3 метаданные иммутабельны,
   * поэтому объект копируется сам в себя с METADATA_DIRECTIVE=REPLACE.
   */
  async replaceUserMetadata(
    key: string,
    metadata: Record<string, string>,
    contentType?: string
  ): Promise<void> {
    const metaHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(metadata)) {
      metaHeaders[`x-amz-meta-${k}`] = v;
    }

    const res = await this.signedFetch({
      method: "PUT",
      key,
      headers: {
        "x-amz-copy-source": `/${this.config.bucket}/${uriEncode(key, false)}`,
        "x-amz-metadata-directive": "REPLACE",
        ...(contentType ? { "content-type": contentType } : {}),
        ...metaHeaders,
      },
    });

    if (!res.ok) {
      throw new Error(
        `Metadata update for ${key} failed: ${res.status} ${res.statusText}`
      );
    }
  }

  /** Загрузить объект напрямую с сервера (используется в самопроверке). */
  async putObject(
    key: string,
    body: Buffer | string,
    contentType = "application/octet-stream"
  ): Promise<void> {
    const res = await this.signedFetch({
      method: "PUT",
      key,
      body,
      headers: { "content-type": contentType },
    });
    if (!res.ok) {
      throw new Error(`PUT ${key} failed: ${res.status} ${res.statusText}`);
    }
  }

  async deleteObject(key: string): Promise<void> {
    const res = await this.signedFetch({ method: "DELETE", key });
    if (!res.ok && res.status !== 404) {
      throw new Error(`DELETE ${key} failed: ${res.status} ${res.statusText}`);
    }
  }
}

/**
 * Собрать клиент из переменных окружения. null — если хранилище не настроено
 * (тогда роуты уходят в локальный дисковый фолбэк).
 */
export function s3ClientFromEnv(): S3Client | null {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return new S3Client({
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    // R2 требует "auto"; MinIO/AWS — конкретный регион.
    region: process.env.S3_REGION || "auto",
    // По умолчанию path-style: работает у R2, MinIO и B2 без сюрпризов с DNS.
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  });
}

export function isObjectStorageConfigured(): boolean {
  return s3ClientFromEnv() !== null;
}
