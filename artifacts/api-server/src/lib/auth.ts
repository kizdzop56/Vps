// ─────────────────────────────────────────────────────────────────────────────
// Токены доступа и проверка прав.
//
// ── СЕКРЕТ НЕ ИМЕЕТ ЗНАЧЕНИЯ ПО УМОЛЧАНИЮ ───────────────────────────────────
// Раньше здесь стояло `process.env.SESSION_SECRET || "dev-secret-key"`. Это была
// дыра в полный рост: любой деплой, где переменную забыли задать (VPS, docker,
// чужая копия репозитория), подписывал токены строкой, которая лежит в открытом
// коде. Зная её, кто угодно собирает себе токен с любым userId и ролью admin —
// пароль при этом не нужен вообще.
//
// Теперь так:
//   • production без SESSION_SECRET — сервер НЕ ПОДНИМАЕТСЯ. Приложение, которое
//     работает, но принимает поддельные токены, хуже, чем приложение, которое
//     честно не стартует;
//   • разработка без SESSION_SECRET — секрет генерируется случайным на запуск
//     процесса. Локально всё работает, подделать нельзя, а перезапуск сервера
//     разлогинивает: это и есть напоминание задать переменную в .env.
//
// Секрет короче MIN_SECRET_LEN отклоняется: «123» ничем не лучше отсутствия.
//
// ── Гашение сессий ──────────────────────────────────────────────────────────
// Помимо подписи проверяется отметка «токены старше этого момента недействительны»
// (lib/sessionEpoch.ts). Благодаря ей смена пароля через восстановление реально
// выкидывает чужие устройства, а не оставляет им месяц доступа.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";
import { issuedBeforeRevocation, sessionsValidFrom } from "./sessionEpoch";

/** Минимальная длина секрета. Ниже — это не секрет, а видимость. */
const MIN_SECRET_LEN = 16;

function resolveSecret(): string {
  const fromEnv = process.env["SESSION_SECRET"]?.trim() ?? "";
  const production = process.env["NODE_ENV"] === "production";

  if (fromEnv.length >= MIN_SECRET_LEN) return fromEnv;

  if (production) {
    // Явное сообщение вместо стека: это ошибка настройки, а не кода.
    logger.fatal(
      "SESSION_SECRET не задан или короче 16 символов. Токены подписывать нечем — " +
        "запуск остановлен. Задайте переменную в окружении сервиса: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
    throw new Error("SESSION_SECRET is required in production (min 16 chars)");
  }

  const generated = crypto.randomBytes(32).toString("hex");
  logger.warn(
    "SESSION_SECRET не задан: сгенерирован временный секрет на время работы процесса. " +
      "После перезапуска все входы слетят. Для разработки допустимо, для сервера — нет.",
  );
  return generated;
}

const JWT_SECRET = resolveSecret();

export interface AuthPayload {
  userId: number;
  role: "student" | "parent" | "admin" | "teacher";
  /** Время выпуска токена (секунды эпохи). Подставляет jsonwebtoken. */
  iat?: number;
}

export function generateToken(payload: AuthPayload): string {
  return jwt.sign({ userId: payload.userId, role: payload.role }, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, JWT_SECRET) as AuthPayload;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let payload: AuthPayload;
  try {
    payload = verifyToken(token);
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  // Пароль сменили — прежние токены больше не годятся, даже если подпись верна.
  const epoch = await sessionsValidFrom(payload.userId);
  if (issuedBeforeRevocation(payload.iat, epoch)) {
    res.status(401).json({ error: "Session expired" });
    return;
  }

  (req as any).user = payload;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as AuthPayload;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export function getUser(req: Request): AuthPayload {
  return (req as any).user as AuthPayload;
}

export function isTeacher(role: string): boolean {
  return role === "admin" || role === "teacher";
}
