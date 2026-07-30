import { randomUUID } from "crypto";
import {
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";
import type { ObjectAclPolicy, StoredObject } from "./objectAcl";
import { s3ClientFromEnv } from "./s3Client";
import type { S3Client } from "./s3Client";

/**
 * Объектное хранилище для медиа: аватары, фото/аудио/видео к заданиям,
 * голосовые записи учеников.
 *
 * Работает с любым S3-совместимым хранилищем (Cloudflare R2, Backblaze B2,
 * MinIO, Supabase Storage, Storj, AWS S3) — раньше здесь был Replit Object
 * Storage, затем Google Cloud Storage. Провайдер меняется переменными
 * окружения, без правок кода: см. `deploy-vps/STORAGE.md`.
 *
 * Схема загрузки: сервер выдаёт presigned PUT (15 минут), браузер грузит файл
 * напрямую в хранилище (минуя наш прокси и его лимиты на размер тела), затем
 * файл отдаётся обратно через `GET /api/storage/objects/<id>`.
 */

/** Префикс ключей в бакете. Позволяет держать в одном бакете и другие данные. */
function objectPrefix(): string {
  const raw = process.env.S3_PREFIX ?? "uploads";
  return raw.replace(/^\/+|\/+$/g, "");
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageNotConfiguredError extends Error {
  constructor() {
    super(
      "Объектное хранилище не настроено: задайте S3_ENDPOINT, S3_BUCKET, " +
        "S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY. Инструкция: deploy-vps/STORAGE.md"
    );
    this.name = "ObjectStorageNotConfiguredError";
    Object.setPrototypeOf(this, ObjectStorageNotConfiguredError.prototype);
  }
}

export interface UploadTarget {
  /** Presigned PUT — его отдаём браузеру. */
  uploadURL: string;
  /** Внутренний путь вида `/objects/<id>`, который сохраняется в БД. */
  objectPath: string;
}

export interface DownloadableObject {
  body: ReadableStream<Uint8Array> | null;
  contentType: string;
  contentLength: number | null;
  cacheControl: string;
}

export class ObjectStorageService {
  /**
   * Клиент создаётся лениво: сервер должен подниматься и без настроенного
   * хранилища (тогда роуты уходят в локальный дисковый фолбэк).
   */
  private client(): S3Client {
    const client = s3ClientFromEnv();
    if (!client) {
      throw new ObjectStorageNotConfiguredError();
    }
    return client;
  }

  /** `/objects/<id>` -> ключ в бакете. */
  private keyFromObjectPath(objectPath: string): string {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const id = objectPath.slice("/objects/".length);
    // Защита от выхода за пределы префикса.
    if (!id || id.includes("..")) {
      throw new ObjectNotFoundError();
    }
    const prefix = objectPrefix();
    return prefix ? `${prefix}/${id}` : id;
  }

  /**
   * Presigned PUT + путь объекта одним вызовом.
   *
   * Раньше путь вычислялся разбором подписанного URL
   * (`normalizeObjectEntityPath`), что зависело от домена конкретного
   * провайдера и ломалось при его смене. Теперь id генерируется здесь и
   * возвращается напрямую — парсить URL больше не нужно.
   */
  getUploadTarget(): UploadTarget {
    const id = randomUUID();
    const prefix = objectPrefix();
    const key = prefix ? `${prefix}/${id}` : id;

    return {
      uploadURL: this.client().presign({
        method: "PUT",
        key,
        expiresIn: 900,
      }),
      objectPath: `/objects/${id}`,
    };
  }

  /** Проверить, что объект существует. Иначе — ObjectNotFoundError. */
  async getObject(objectPath: string): Promise<StoredObject> {
    const key = this.keyFromObjectPath(objectPath);
    const exists = await this.client().objectExists(key);
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return { key };
  }

  /** Скачать объект для отдачи через наш прокси-роут. */
  async downloadObject(
    object: StoredObject,
    cacheTtlSec = 3600
  ): Promise<DownloadableObject> {
    const client = this.client();
    const aclPolicy = await getObjectAclPolicy(client, object);
    const isPublic = aclPolicy?.visibility === "public";

    const response = await client.getObject(object.key);
    const length = response.headers.get("content-length");

    return {
      body: response.body,
      // Тип берём из самого объекта: он сохраняется при загрузке из
      // Content-Type браузера. Без этого браузер не проигрывает аудио/видео.
      contentType:
        response.headers.get("content-type") || "application/octet-stream",
      contentLength: length ? Number(length) : null,
      cacheControl: `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
  }

  async setObjectAclPolicy(
    objectPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<void> {
    const object = await this.getObject(objectPath);
    await setObjectAclPolicy(this.client(), object, aclPolicy);
  }

  async canAccessObject({
    userId,
    object,
    requestedPermission,
  }: {
    userId?: string;
    object: StoredObject;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      client: this.client(),
      userId,
      object,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}
