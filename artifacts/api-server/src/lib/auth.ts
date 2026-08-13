import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

// Секрет подписи токенов.
//
// Раньше здесь стоял дефолт "dev-secret-key", и сервер спокойно поднимался без
// настроенной переменной. Любой такой запуск (docker-compose, VPS, ручной
// прод-старт) означал, что токен с произвольным userId и ролью teacher можно
// подписать самому, зная одну строчку из публичного репозитория.
//
// В production переменная обязательна: без неё падаем на старте, как это уже
// сделано для PORT. В разработке допускаем локальный секрет, но громко об этом
// сообщаем.
const JWT_SECRET = resolveSecret();

function resolveSecret(): string {
  const fromEnv = process.env["SESSION_SECRET"];
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv;

  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "SESSION_SECRET environment variable is required in production but was not provided.",
    );
  }

  console.warn(
    "[auth] SESSION_SECRET не задан — используется локальный секрет для разработки. " +
      "В production сервер с таким запуском не стартует.",
  );
  return "dev-only-insecure-secret";
}

export interface AuthPayload {
  userId: number;
  role: "student" | "parent" | "admin" | "teacher";
}

export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, JWT_SECRET) as AuthPayload;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const payload = verifyToken(token);
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
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
