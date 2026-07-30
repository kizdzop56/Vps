import type { S3Client } from "./s3Client";

/**
 * Права доступа к объектам хранилища.
 *
 * Политика лежит в пользовательских метаданных самого объекта, а не в ACL
 * бакета. Благодаря этому бакет может (и должен) быть полностью приватным:
 * наружу объекты отдаёт наш прокси-роут `GET /api/storage/objects/...`,
 * который и проверяет права.
 *
 * В S3 пользовательские метаданные передаются заголовками `x-amz-meta-*`,
 * а имя ключа не может содержать двоеточие — поэтому здесь `acl-policy`,
 * а не `custom:aclPolicy`, как было в реализации под Google Cloud.
 */
const ACL_POLICY_METADATA_KEY = "acl-policy";

/** Ссылка на объект в бакете. Аналог File из GCS SDK, но без зависимости. */
export interface StoredObject {
  key: string;
}

// Может расширяться под сценарии: список пользователей, домен email,
// участники группы, подписчики и т.п.
export enum ObjectAccessGroupType {}

export interface ObjectAccessGroup {
  type: ObjectAccessGroupType;
  // Идентификатор, по которому определяется членство. Формат зависит от типа
  // группы — id списка в БД, домен email, id группы.
  id: string;
}

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
  aclRules?: Array<ObjectAclRule>;
}

function isPermissionAllowed(
  requested: ObjectPermission,
  granted: ObjectPermission
): boolean {
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }
  return granted === ObjectPermission.WRITE;
}

abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  public readonly type: ObjectAccessGroupType;
  public readonly id: string;

  constructor(type: ObjectAccessGroupType, id: string) {
    this.type = type;
    this.id = id;
  }

  public abstract hasMember(userId: string): Promise<boolean>;
}

function createObjectAccessGroup(
  group: ObjectAccessGroup
): BaseObjectAccessGroup {
  switch (group.type) {
    // Реализовать под конкретный тип группы, например:
    // case "USER_LIST":
    //   return new UserListAccessGroup(group.id);
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

export async function setObjectAclPolicy(
  client: S3Client,
  object: StoredObject,
  aclPolicy: ObjectAclPolicy
): Promise<void> {
  const head = await client.headObject(object.key);
  if (!head) {
    throw new Error(`Object not found: ${object.key}`);
  }

  // Метаданные в S3 иммутабельны — replaceUserMetadata копирует объект сам в
  // себя с новыми метаданными, сохраняя исходный Content-Type.
  await client.replaceUserMetadata(
    object.key,
    { [ACL_POLICY_METADATA_KEY]: JSON.stringify(aclPolicy) },
    head.contentType ?? undefined
  );
}

export async function getObjectAclPolicy(
  client: S3Client,
  object: StoredObject
): Promise<ObjectAclPolicy | null> {
  const head = await client.headObject(object.key);
  const raw = head?.userMetadata?.[ACL_POLICY_METADATA_KEY];
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ObjectAclPolicy;
  } catch {
    // Битые метаданные не должны валить отдачу файла.
    return null;
  }
}

export async function canAccessObject({
  client,
  userId,
  object,
  requestedPermission,
}: {
  client: S3Client;
  userId?: string;
  object: StoredObject;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  const aclPolicy = await getObjectAclPolicy(client, object);
  if (!aclPolicy) {
    return false;
  }

  if (
    aclPolicy.visibility === "public" &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  if (!userId) {
    return false;
  }

  if (aclPolicy.owner === userId) {
    return true;
  }

  for (const rule of aclPolicy.aclRules || []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (
      (await accessGroup.hasMember(userId)) &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }

  return false;
}
