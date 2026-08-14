// ─────────────────────────────────────────────────────────────────────────────
// Шина ударов по боссу.
//
// Цифра урона вылетает ТОЛЬКО из боя рейда (POST /raid/answer). Раньше сюда же
// подмешивались ответы тренажёра слов и грамматики — любое верное слово вне
// вкладки «Рейд» тоже било босса, и ученик, зашедший просто поучить слова,
// видел урон по боссу поверх карточки. Это отключено на сервере
// (routes/raidHook.ts больше не перехватывает эти пути), а здесь WATCHED
// сужен до одного пути — незачем перехватывать fetch к тренажёрам, если
// сервер туда давно не кладёт поле raid.
//
// Слушаем сеть, а не экран боя напрямую: оверлей живёт в раскладке вкладок и
// рисует цифру поверх экрана боя, откуда бы запрос ни ушёл.
//
// Перехват НЕ МЕНЯЕТ ответ: тело читается из клона, оригинал уходит вызывающему
// как был.
// ─────────────────────────────────────────────────────────────────────────────

/** Удар, о котором рассказал сервер. */
export interface RaidHitEvent {
  damage: number;
  crit: boolean;
  superEffective: boolean;
  combo: number;
  comboMult: number;
  stamina: number;
  coins: number;
  coinsEarned: number;
  percentLeft: number;
  phase: string;
  killed: boolean;
  /** Урон не нанесён: кончилась энергия. */
  blocked: string | null;
  rustCleared: boolean;
  bossName: string;
}

type Listener = (event: RaidHitEvent) => void;

const listeners = new Set<Listener>();

export function onRaidHit(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitRaidHit(event: RaidHitEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      /* один слушатель не должен ломать остальных */
    }
  }
}

/** Достаёт удар из ответа сервера. null — в ответе рейда нет. */
export function pickRaidHit(payload: unknown): RaidHitEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const raid = (payload as { raid?: unknown }).raid;
  if (!raid || typeof raid !== "object") return null;
  const r = raid as Record<string, unknown>;
  if (typeof r["damage"] !== "number") return null;
  return {
    damage: Number(r["damage"] ?? 0),
    crit: !!r["crit"],
    superEffective: !!r["superEffective"],
    combo: Number(r["combo"] ?? 0),
    comboMult: Number(r["comboMult"] ?? 1),
    stamina: Number(r["stamina"] ?? 0),
    coins: Number(r["coins"] ?? 0),
    coinsEarned: Number(r["coinsEarned"] ?? 0),
    percentLeft: Number(r["percentLeft"] ?? 0),
    phase: String(r["phase"] ?? "normal"),
    killed: !!r["killed"],
    blocked: typeof r["blocked"] === "string" ? r["blocked"] : null,
    rustCleared: !!r["rustCleared"],
    bossName: String(r["bossName"] ?? "Босс"),
  };
}

/** Единственный путь, из которого приходит урон. */
const WATCHED = ["/api/raid/answer"];

let installed = false;

/**
 * Один раз подменить fetch, чтобы ловить удары.
 *
 * Флаг installed обязателен: при горячей перезагрузке модуль выполняется
 * заново, и без него обёртки наматывались бы друг на друга слоями.
 */
export function installRaidFetchHook(): void {
  if (installed) return;
  const scope = globalThis as unknown as { fetch?: (...args: any[]) => Promise<any> };
  const original = scope.fetch;
  if (typeof original !== "function") return;
  installed = true;

  scope.fetch = async (...args: any[]) => {
    const response = await original(...args);
    try {
      const first = args[0];
      const url = typeof first === "string" ? first : String(first?.url ?? "");
      if (response?.ok && WATCHED.some((p) => url.includes(p)) && typeof response.clone === "function") {
        // Клон: оригинальное тело обязано остаться нечитанным, иначе экран
        // получит пустой ответ.
        response
          .clone()
          .json()
          .then((data: unknown) => {
            const hit = pickRaidHit(data);
            if (hit) emitRaidHit(hit);
          })
          .catch(() => {});
      }
    } catch {
      /* перехват — украшение, ронять запрос он не имеет права */
    }
    return response;
  };
}

export default onRaidHit;
