// ─────────────────────────────────────────────────────────────────────────────
// Ограничение частоты запросов.
//
// ── Зачем ───────────────────────────────────────────────────────────────────
// Вход и отправка кода на почту не были ограничены никак. Отсюда два реальных
// сценария: пароль ученика подбирается перебором со скоростью сети, а кнопка
// «отправить код заново» превращается в рассылку писем на чужой адрес (и в счёт
// от почтового провайдера).
//
// ── Почему свой, а не готовый пакет ─────────────────────────────────────────
// Сервис живёт одним процессом на Render, общего хранилища нет, а лишняя
// зависимость означает правку lock-файла и новую пересборку образа. Счётчик в
// памяти закрывает ровно ту задачу, которая стоит: осложнить перебор. При
// перезапуске счётчики обнуляются — на бесплатном плане сервис засыпает и это
// нормально: окна здесь минутные, а не суточные.
//
// ── Ключ ────────────────────────────────────────────────────────────────────
// По умолчанию адрес запроса. Для входа и восстановления пароля дополнительно
// учитывается логин или email: иначе один человек за общим NAT (школьный
// класс, домашний роутер) блокирует остальных, а перебор одного аккаунта с
// разных адресов остаётся незамеченным.
//
// ВАЖНО: адрес берётся из req.ip, и он верен только при app.set("trust proxy").
// Приложение стоит за прокси (Render и локальный scripts/prod-start.mjs), без
// этой настройки все запросы приходят с 127.0.0.1 и лимит становится общим на
// всех сразу.
// ─────────────────────────────────────────────────────────────────────────────
import type { Request, Response, NextFunction } from "express";

interface Hit {
  count: number;
  /** Когда окно закрывается (мс эпохи). */
  resetAt: number;
}

export interface RateLimitRule {
  /** Длина окна в миллисекундах. */
  windowMs: number;
  /** Сколько запросов разрешено в окне. */
  max: number;
  /** Что ответить при превышении. */
  message?: string;
  /**
   * Дополнительная часть ключа помимо адреса: логин, email. Возвращённое
   * значение приводится к нижнему регистру и обрезается.
   */
  keyOf?: (req: Request) => string | undefined;
}

/** Как часто выметаем истёкшие записи. */
const SWEEP_MS = 60_000;

const buckets = new Map<string, Hit>();

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, hit] of buckets) {
    if (hit.resetAt <= now) buckets.delete(key);
  }
}, SWEEP_MS);
// Таймер не должен держать процесс живым при остановке сервера.
sweeper.unref?.();

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

/**
 * Middleware, ограничивающий частоту.
 *
 * @param name пространство имён счётчика: у «входа» и «регистрации» свои окна,
 *   даже если запрос пришёл с одного адреса.
 */
export function rateLimit(name: string, rule: RateLimitRule) {
  const message = rule.message ?? "Слишком много попыток. Попробуйте позже.";

  return (req: Request, res: Response, next: NextFunction): void => {
    const extra = rule.keyOf?.(req)?.toString().trim().toLowerCase().slice(0, 120) ?? "";
    const key = `${name}|${clientIp(req)}|${extra}`;
    const now = Date.now();

    const hit = buckets.get(key);
    if (!hit || hit.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
      next();
      return;
    }

    hit.count += 1;
    if (hit.count > rule.max) {
      const retryAfter = Math.max(1, Math.ceil((hit.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: message, retryAfter });
      return;
    }

    next();
  };
}

/** Сбросить счётчик после удачного действия (например, верного пароля). */
export function clearRateLimit(name: string, req: Request, extra?: string): void {
  const tail = extra?.trim().toLowerCase().slice(0, 120) ?? "";
  buckets.delete(`${name}|${clientIp(req)}|${tail}`);
}

/** Только для тестов: полная очистка счётчиков. */
export function resetAllRateLimits(): void {
  buckets.clear();
}
