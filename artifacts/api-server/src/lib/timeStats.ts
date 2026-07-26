/**
 * Единая логика подсчёта учебного времени и «утренних» дней.
 *
 * Зачем нужен этот модуль:
 * Раньше брошенная сессия (пользователь закрыл вкладку или свернул браузер, а
 * beforeunload/visibilitychange не сработали — на мобильном Safari это обычное
 * дело) закрывалась только при следующем входе и получала ВСЁ время отсутствия
 * (до 240 минут). Из-за этого:
 *   - «Сегодня» показывало часы, которых не было (зашёл — уже 1 ч 29 мин);
 *   - награды за время (time_30, time_120) выдавались сами собой;
 *   - «Жаворонок» считал каждое открытие приложения за отдельное занятие.
 *
 * Теперь источник правды — heartbeat: клиент раз в 60 секунд стучится в
 * POST /api/users/ping, который обновляет durationMinutes ОТКРЫТОЙ сессии.
 * Всё, что позже последнего heartbeat + небольшой запас, временем занятия не
 * считается.
 *
 * Второй заход по тому же багу: запас в HEARTBEAT_GRACE_MINUTES начислялся
 * ЛЮБОЙ брошенной сессии, даже той, где heartbeat не подтвердил ни одной
 * минуты. Плюс durationMinutes округлялся вверх (Math.round), и по этому
 * округлённому значению задним числом ставился endedAt — 30-секундный заход
 * превращался в полноценную минуту. В сумме на свежем входе «Сегодня»
 * показывало 1 мин 29 с вместо нуля. Теперь запас не даётся вовсе: пропал
 * клиент — засчитываем ровно то, что подтвердил heartbeat.
 *
 * Модуль намеренно без внешних зависимостей (чистые функции) — так его проще
 * тестировать и переиспользовать в роутах.
 */

export type SessionLike = {
  startedAt: Date;
  endedAt: Date | null;
  durationMinutes: number | null;
};

/** Интервал heartbeat на клиенте (StudentTimerManager) — 60 секунд. */
export const HEARTBEAT_INTERVAL_MINUTES = 1;

/**
 * Запас поверх последнего heartbeat. Используется только как потолок для УЖЕ
 * ЗАКРЫТЫХ сессий (страховка от старых «раздутых» строк). Открытым сессиям
 * запас больше не начисляется — см. liveSessionMinutes.
 */
export const HEARTBEAT_GRACE_MINUTES = 2;

/**
 * Если сессия молчит дольше — считаем её брошенной. Один пропущенный
 * heartbeat (60 с) + минута на сетевые задержки: столько живой клиент
 * молчать не должен.
 */
export const STALE_SESSION_GAP_MINUTES = HEARTBEAT_INTERVAL_MINUTES + 1;

/** Жёсткий потолок на одну сессию (страховка от мусорных данных). */
export const MAX_ORPHAN_MINUTES = 240;

/** «Утро» для награды «Жаворонок»: занятие начато с 5:00 до 9:00 по локальному времени. */
export const EARLY_BIRD_START_HOUR = 5;
export const EARLY_BIRD_END_HOUR = 9;

/** Меньше этого времени за утро — не занятие, а случайный заход. */
export const EARLY_BIRD_MIN_MINUTES = 5;

/**
 * Часовой пояс приложения. В БД время хранится в UTC, а «сегодня» и «до 9 утра»
 * должны считаться по времени учеников, а не по времени сервера (на Render это UTC).
 */
export const APP_TIMEZONE = process.env["APP_TIMEZONE"] || "Europe/Minsk";

const MS_PER_MINUTE = 60_000;

function toMs(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

/** Календарное время сессии: от начала до конца (или до «сейчас», если открыта). */
export function wallMinutes(session: SessionLike, now: Date | number = Date.now()): number {
  const end = session.endedAt ? session.endedAt.getTime() : toMs(now);
  return Math.max(0, (end - session.startedAt.getTime()) / MS_PER_MINUTE);
}

/** Минуты, подтверждённые последним heartbeat. */
export function heartbeatMinutes(session: SessionLike): number {
  return Math.max(0, session.durationMinutes ?? 0);
}

/** Сессия давно не подавала признаков жизни → она брошена. */
export function isSessionStale(session: SessionLike, now: Date | number = Date.now()): boolean {
  return wallMinutes(session, now) - heartbeatMinutes(session) > STALE_SESSION_GAP_MINUTES;
}

/**
 * Сколько минут засчитывать ОТКРЫТОЙ сессии.
 * Живая сессия (heartbeat свежий) → реальное календарное время: следующий ping
 * его подтвердит.
 * Брошенная → ровно то, что подтверждено heartbeat, без надбавок. Надбавка
 * ломала счётчик «Сегодня»: любое возвращение в приложение дарило до двух
 * минут занятия, которых не было.
 */
export function liveSessionMinutes(session: SessionLike, now: Date | number = Date.now()): number {
  const credited = isSessionStale(session, now)
    ? heartbeatMinutes(session)
    : wallMinutes(session, now);
  return Math.max(0, Math.min(credited, MAX_ORPHAN_MINUTES));
}

/**
 * Точное (не округлённое) время брошенной сессии. Нужно для endedAt: если
 * округлить, отчёты по таймстампам разойдутся с реальностью в большую сторону.
 */
export function orphanSessionMinutesExact(session: SessionLike, now: Date | number = Date.now()): number {
  return liveSessionMinutes(session, now);
}

/**
 * Сколько минут записать брошенной сессии в durationMinutes (целочисленное поле).
 * Именно floor, а не round: округление вверх превращало 30-секундный заход в
 * целую минуту, и «Сегодня» подрастало само по себе. floor совпадает с тем, как
 * durationMinutes пишет /api/users/ping.
 */
export function orphanSessionMinutes(session: SessionLike, now: Date | number = Date.now()): number {
  return Math.floor(orphanSessionMinutesExact(session, now));
}

/**
 * Момент, которым нужно пометить endedAt брошенной сессии: не «сейчас», а когда
 * ученик реально ушёл. Иначе endedAt - startedAt в отчётах снова даст часы.
 */
export function orphanSessionEnd(session: SessionLike, now: Date | number = Date.now()): Date {
  return new Date(session.startedAt.getTime() + orphanSessionMinutesExact(session, now) * MS_PER_MINUTE);
}

/**
 * Минуты закрытой сессии. Берём точный интервал по таймстампам (иначе короткие
 * сессии округляются в ноль и «Сегодня» обнуляется между заходами), но не больше
 * подтверждённого heartbeat — это отсекает старые «раздутые» записи.
 */
export function closedSessionMinutes(session: SessionLike): number {
  const span = wallMinutes(session, session.endedAt ?? Date.now());
  if (session.durationMinutes === null || session.durationMinutes === undefined) {
    // Legacy rows created before heartbeat tracking have no trustworthy end
    // marker. Never replay the whole gap on the next login (for example, 1h29).
    return Math.min(span, HEARTBEAT_GRACE_MINUTES);
  }
  return Math.min(span, heartbeatMinutes(session) + HEARTBEAT_GRACE_MINUTES);
}

/** Минуты любой сессии — открытой или закрытой. */
export function sessionMinutes(session: SessionLike, now: Date | number = Date.now()): number {
  return session.endedAt ? closedSessionMinutes(session) : liveSessionMinutes(session, now);
}

// ── Локальное время ─────────────────────────────────────────────────────────

type LocalParts = {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    // Невалидный APP_TIMEZONE не должен ронять сервер — падаем обратно в UTC.
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  }
  formatterCache.set(timeZone, formatter);
  return formatter;
}

export function localParts(date: Date | number, timeZone: string = APP_TIMEZONE): LocalParts {
  const value = date instanceof Date ? date : new Date(date);
  const map: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(value)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map["year"] ?? 0),
    month: Number(map["month"] ?? 1),
    day: Number(map["day"] ?? 1),
    hour: Number(map["hour"] ?? 0),
    minute: Number(map["minute"] ?? 0),
    second: Number(map["second"] ?? 0),
  };
}

/** Час по локальному времени (0-23). */
export function localHour(date: Date | number, timeZone: string = APP_TIMEZONE): number {
  return localParts(date, timeZone).hour;
}

/** Ключ локального дня в формате YYYY-MM-DD — для группировки по дням. */
export function localDayKey(date: Date | number, timeZone: string = APP_TIMEZONE): string {
  const p = localParts(date, timeZone);
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  return `${p.year}-${mm}-${dd}`;
}

/** Смещение часового пояса в миллисекундах для конкретного момента. */
function timeZoneOffsetMs(date: Date | number, timeZone: string): number {
  const ms = Math.floor(toMs(date) / 1000) * 1000;
  const p = localParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - ms;
}

/** Начало локальных суток (в UTC) для указанного момента. */
export function startOfLocalDay(now: Date | number = Date.now(), timeZone: string = APP_TIMEZONE): Date {
  const p = localParts(now, timeZone);
  const midnightUtc = Date.UTC(p.year, p.month - 1, p.day);
  // Первое приближение по текущему смещению, затем уточнение — на случай
  // перевода часов между полуночью и «сейчас».
  let guess = midnightUtc - timeZoneOffsetMs(now, timeZone);
  guess = midnightUtc - timeZoneOffsetMs(guess, timeZone);
  return new Date(guess);
}

/** Начало локальной недели (в UTC). weekStartsOn: 0 — воскресенье, 1 — понедельник. */
export function startOfLocalWeek(
  now: Date | number = Date.now(),
  timeZone: string = APP_TIMEZONE,
  weekStartsOn: 0 | 1 = 0,
): Date {
  const dayStart = startOfLocalDay(now, timeZone);
  const weekday = new Date(dayStart.getTime() + timeZoneOffsetMs(dayStart, timeZone)).getUTCDay();
  const back = (weekday - weekStartsOn + 7) % 7;
  return startOfLocalDay(dayStart.getTime() - back * 24 * 60 * MS_PER_MINUTE, timeZone);
}

// ── Награда «Жаворонок» ─────────────────────────────────────────────────────

/**
 * Считает УТРЕННИЕ ДНИ, а не сессии: за один день можно получить максимум одно
 * «утреннее занятие», и только если утром реально позанимались
 * EARLY_BIRD_MIN_MINUTES минут. Раньше здесь считались все строки time_sessions
 * с часом < 9 по UTC — то есть пять перезаходов подряд в 11 утра по Минску
 * мгновенно открывали «Жаворонка».
 */
export function countEarlyBirdDays(
  sessions: SessionLike[],
  now: Date | number = Date.now(),
  timeZone: string = APP_TIMEZONE,
): number {
  const minutesPerDay = new Map<string, number>();
  for (const session of sessions) {
    const hour = localHour(session.startedAt, timeZone);
    if (hour < EARLY_BIRD_START_HOUR || hour >= EARLY_BIRD_END_HOUR) continue;
    const key = localDayKey(session.startedAt, timeZone);
    minutesPerDay.set(key, (minutesPerDay.get(key) ?? 0) + sessionMinutes(session, now));
  }
  let days = 0;
  for (const minutes of minutesPerDay.values()) {
    if (minutes >= EARLY_BIRD_MIN_MINUTES) days += 1;
  }
  return days;
}
