// Клиентский слой рейда. apiFetch берётся из useFlashcards — авторизация и
// разбор ошибок должны быть общими на всё приложение.
//
// Валюта в рейде одна: монеты. Маны нет, атаки и бафы покупаются монетами.
//
// Задание боя приходит с номером ВЫДАЧИ (taskId): правильного ответа в нём нет,
// способ ответа выбрал сервер, и ответ отправляется по этому номеру. Поэтому
// клиент не может ни подсмотреть ответ, ни выдать выбор за сборку ради урона.
//
// Лиг по уровню профиля больше нет: топ рейда один на всех (см. шапку
// api-server/src/lib/raid.ts).
//
// Медалей в снимке тоже нет: награды за рейды стали обычными медалями витрины
// в профиле (constants/raidAchievements.ts), а показатели для них приходят с
// остальной статистикой в /gamification/stats.
import { apiFetch } from "@/hooks/useFlashcards";

export type RaidPhase = "normal" | "hardened" | "berserk";
export type RaidBuff = "power" | "aoe" | "shield" | "stamina";

export interface RaidEventInfo {
  id: number;
  boss: string;
  bossName: string;
  bossShort: string;
  about: string;
  weak: string[];
  colors: [string, string];
  seasonal: boolean;
  weekKey: string;
  startsAt: string;
  endsAt: string;
  status: "active" | "won" | "lost";
  hpTotal: number;
  hpLeft: number;
  damageDealt: number;
  percentLeft: number;
  phase: RaidPhase;
  vulnMult: number;
  fighters: number;
  killerUserId: number | null;
}

export interface RaidMe {
  damage: number;
  hits: number;
  crits: number;
  bestCombo: number;
  combo: number;
  rank: number;
  level: number;
  share: number;
  stamina: number;
  staminaMax: number;
  staminaNextAt: string | null;
  coins: number;
  keys: number;
  frames: string[];
  powerArmed: boolean;
  aoeLeft: number;
  shielded: boolean;
  shieldUntil: string | null;
  rusty: boolean;
  rustUntil: string | null;
  boosted: boolean;
  boostUntil: string | null;
  weapon: boolean;
  weaponSkin: string | null;
  title: string | null;
  titleUntil: string | null;
  lastHero: boolean;
  merciless: boolean;
}

export interface RaidRow {
  userId: number;
  name: string;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
  level: number;
  damage: number;
  hits: number;
  crits: number;
  me: boolean;
}

export interface RaidSnapshot {
  event: RaidEventInfo;
  me: RaidMe;
  quest: { need: number; done: number; claimed: boolean; coins: number };
  abilities: {
    power: { cost: number; mult: number; armed: boolean };
    aoe: { cost: number; tasks: number; mult: number; left: number };
    shield: { cost: number; active: boolean };
    stamina: { cost: number; full: boolean };
  };
  /** Общий топ по урону. */
  top: RaidRow[];
  chest: {
    eventId: number;
    bossName: string;
    status: "won" | "lost";
    weekKey: string;
    damage: number;
    coins: number;
  } | null;
  history: {
    weekKey: string;
    bossName: string;
    status: string;
    hpTotal: number;
    damageDealt: number;
    myDamage: number;
  }[];
  recent: { damage: number; crit: boolean; superEffective: boolean; combo: number; at: string }[];
}

/** Задание боя. Правильного ответа в нём нет: проверка серверная. */
export interface RaidTask {
  /** Номер выданного задания: с ним же уходит ответ. */
  taskId: number;
  kind: "word" | "grammar";
  prompt: string;
  hint?: string;
  input: "choice" | "type" | "assemble";
  options?: string[];
  tiles?: string[];
  answerLang?: "ru" | "en";
  /** Ставка урона: easy | medium | hard. */
  damage: "easy" | "medium" | "hard";
  tags: string[];
  listen?: boolean;
  wordId?: number;
}

export interface RaidBattle {
  size: number;
  tasks: RaidTask[];
}

/** Что сервер сказал про удар. Разбора ошибки в рейде нет намеренно. */
export interface RaidAnswer {
  correct: boolean;
  typo: boolean;
  expected: string[];
  raid: {
    damage: number;
    combo: number;
    comboMult: number;
    crit: boolean;
    superEffective: boolean;
    stamina: number;
    staminaMax: number;
    coins: number;
    coinsEarned: number;
    aoeLeft: number;
    hpTotal: number;
    hpLeft: number;
    percentLeft: number;
    phase: RaidPhase;
    myDamage: number;
    killed: boolean;
    blocked: string | null;
    bossName: string;
  } | null;
}

export const raid = {
  current: () => apiFetch<RaidSnapshot>("/api/raid/current"),
  battle: () => apiFetch<RaidBattle>("/api/raid/battle"),
  answer: (taskId: number, given: string) =>
    apiFetch<RaidAnswer>("/api/raid/answer", {
      method: "POST",
      body: JSON.stringify({ taskId, given }),
    }),
  buy: (buff: RaidBuff) =>
    apiFetch<RaidSnapshot>("/api/raid/buy", { method: "POST", body: JSON.stringify({ buff }) }),
  quest: () => apiFetch<RaidSnapshot>("/api/raid/quest", { method: "POST" }),
  chest: (eventId: number) =>
    apiFetch<{ chest: { status: string; coins: number; title: string }; snapshot: RaidSnapshot }>(
      "/api/raid/chest",
      { method: "POST", body: JSON.stringify({ eventId }) },
    ),
};

/** Название фазы человеческим языком. */
export function phaseTitle(phase: RaidPhase): string {
  if (phase === "berserk") return "Берсерк";
  if (phase === "hardened") return "Босс усилился";
  return "Обычный режим";
}

/** Что фаза значит для урона. */
export function phaseAbout(phase: RaidPhase): string {
  if (phase === "berserk") return "Все задания бьют на 50% сильнее. Добивайте.";
  if (phase === "hardened") return "Попадание по слабости даёт втрое больше урона.";
  return "Попадание по слабости даёт в полтора раза больше урона.";
}

/** Понятное имя тега слабости. */
export function tagTitle(tag: string): string {
  switch (tag) {
    case "grammar": return "грамматика";
    case "tenses": return "времена";
    case "prepositions": return "предлоги";
    case "vocab": return "словарный запас";
    case "synonyms": return "синонимы";
    case "listening": return "аудирование";
    case "pronunciation": return "произношение";
    case "phrasal": return "фразовые глаголы";
    case "idioms": return "устойчивые выражения";
    case "wordorder": return "порядок слов";
    case "all": return "все типы заданий";
    default: return tag;
  }
}

/** Ставка урона задания словами. */
export function damageTitle(level: "easy" | "medium" | "hard"): string {
  if (level === "hard") return "50 урона";
  if (level === "medium") return "25 урона";
  return "10 урона";
}

export default raid;
