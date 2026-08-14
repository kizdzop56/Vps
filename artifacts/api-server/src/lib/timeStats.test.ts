/**
 * Тесты чистой логики подсчёта времени.
 * Запуск: pnpm --filter @workspace/api-server test
 *
 * Зависимостей нет — только node:test и node:assert, поэтому тест не тянет
 * за собой ни БД, ни express.
 *
 * ── Про запас поверх heartbeat ──────────────────────────────────────────────
 * Первая версия этих тестов ждала, что брошенная сессия получит
 * HEARTBEAT_GRACE_MINUTES сверху подтверждённого времени. Потом по тому же багу
 * прошли второй раз: запас начислялся ЛЮБОЙ брошенной сессии, даже той, где
 * heartbeat не подтвердил ни одной минуты, и на свежем входе «Сегодня»
 * показывало полторы минуты занятий вместо нуля.
 *
 * Сейчас правило простое: пропал клиент — засчитываем ровно то, что подтвердил
 * heartbeat, без надбавок. Запас остался только потолком для УЖЕ ЗАКРЫТЫХ
 * сессий (страховка от старых раздутых строк), и это проверяется отдельно.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  countEarlyBirdDays,
  closedSessionMinutes,
  isSessionStale,
  liveSessionMinutes,
  orphanSessionEnd,
  orphanSessionMinutes,
  startOfLocalDay,
  wallMinutes,
  type SessionLike,
} from "./timeStats";

const TZ = "Europe/Minsk";
const utc = (iso: string) => new Date(iso);

function session(started: string, ended: string | null, durationMinutes: number | null): SessionLike {
  return { startedAt: utc(started), endedAt: ended ? utc(ended) : null, durationMinutes };
}

// Сценарий из бага: ученик открыл приложение в 08:03 по Минску, через 2 минуты
// закрыл вкладку (beforeunload не сработал), вернулся в 09:32 — и видел
// «Сегодня: 1 ч 29 мин».
const NOW = utc("2026-07-26T06:32:00Z"); // 09:32 по Минску
const abandoned = session("2026-07-26T05:03:00Z", null, 2);

test("брошенная сессия распознаётся и не получает время отсутствия", () => {
  assert.equal(Math.round(wallMinutes(abandoned, NOW)), 89);
  assert.equal(isSessionStale(abandoned, NOW), true);
  // Ровно то, что подтвердил heartbeat: две минуты, без надбавки.
  assert.equal(orphanSessionMinutes(abandoned, NOW), 2);
  assert.equal(orphanSessionEnd(abandoned, NOW).toISOString(), "2026-07-26T05:05:00.000Z");
});

test("живая сессия считается полностью", () => {
  const live = session("2026-07-26T06:02:00Z", null, 30);
  assert.equal(isSessionStale(live, NOW), false);
  assert.equal(Math.round(liveSessionMinutes(live, NOW)), 30);
});

test("сессия без единого heartbeat не даёт ни минуты", () => {
  // Ровно тот случай, из-за которого «Сегодня» подрастало само: клиент открыл
  // приложение, ни разу не отчитался и пропал. Подтверждённого времени нет —
  // значит и занятия нет.
  const ghost = session("2026-07-26T03:12:00Z", null, null);
  assert.equal(liveSessionMinutes(ghost, NOW), 0);
  assert.equal(orphanSessionMinutes(ghost, NOW), 0);
});

test("закрытой сессии запас остаётся потолком: старые раздутые строки срезаются", () => {
  // Древняя запись: календарно час, heartbeat подтвердил 3 минуты. Берём
  // подтверждённое плюс запас, а не весь час.
  const legacy = session("2026-07-26T05:00:00Z", "2026-07-26T06:00:00Z", 3);
  assert.equal(closedSessionMinutes(legacy), 5);
});

test("короткая сессия не схлопывается в ноль", () => {
  const short = session("2026-07-26T06:31:20Z", "2026-07-26T06:32:00Z", 1);
  const minutes = closedSessionMinutes(short);
  assert.ok(minutes > 0.6 && minutes < 0.7, `ожидали ~0.67, получили ${minutes}`);
});

test("«Жаворонок»: пять разных утренних дней", () => {
  const sessions = [20, 21, 22, 23, 24].map((d) =>
    session(`2026-07-${d}T04:30:00Z`, `2026-07-${d}T04:50:00Z`, 20)
  );
  assert.equal(countEarlyBirdDays(sessions, NOW, TZ), 5);
});

test("«Жаворонок»: пять перезаходов за одно утро = один день", () => {
  const sessions = [0, 3, 6, 9, 12].map((i) =>
    session(`2026-07-20T04:${30 + i}:00Z`, `2026-07-20T04:${40 + i}:00Z`, 10)
  );
  assert.equal(countEarlyBirdDays(sessions, NOW, TZ), 1);
});

test("«Жаворонок»: 09:32 по Минску — это уже не утро", () => {
  const sessions = [20, 21, 22, 23, 24].map((d) =>
    session(`2026-07-${d}T06:32:00Z`, `2026-07-${d}T07:00:00Z`, 28)
  );
  assert.equal(countEarlyBirdDays(sessions, NOW, TZ), 0);
});

test("«Жаворонок»: заглянул на минуту — не занятие", () => {
  const sessions = [20, 21, 22, 23, 24].map((d) =>
    session(`2026-07-${d}T04:00:00Z`, `2026-07-${d}T04:01:00Z`, 1)
  );
  assert.equal(countEarlyBirdDays(sessions, NOW, TZ), 0);
});

test("сутки начинаются по локальному времени, а не по UTC", () => {
  // 01:30 ночи 27 июля по Минску
  const night = utc("2026-07-26T22:30:00Z");
  assert.equal(startOfLocalDay(night, TZ).toISOString(), "2026-07-26T21:00:00.000Z");
});
