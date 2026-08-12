// Клиентский слой рейда. apiFetch берётся из useFlashcards — авторизация и
// разбор ошибок должны быть общими на всё приложение.
import { apiFetch } from "@/hooks/useFlashcards";

export type RaidPhase = "normal" | "hardened" | "berserk";
export type RaidLeague = "bronze" | "silver" | "gold";

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
  league: RaidLeague;
  leagueTitle: string;
  share: number;
  stamina: number;
  staminaMax: number;
  staminaNextAt: string | null;
  mana: number;
  manaMax: number;
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

export interface RaidMilestone {
  at: number;
  label: string;
  coins: number;
  mana: number;
  reached: boolean;
  claimed: boolean;
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
  quest: { need: number; done: number; claimed: boolean; coins: number; mana: number };
  abilities: {
    power: { cost: number; mult: number; armed: boolean };
    aoe: { cost: number; tasks: number; mult: number; left: number };
    shield: { cost: number; active: boolean };
  };
  shop: {
    mana: { coins: number; mana: number; label: string };
    stamina: { coins: number; label: string };
  };
  track: { claimed: number; ready: number; milestones: RaidMilestone[] };
  leagues: { key: RaidLeague; title: string; mine: boolean; rows: RaidRow[] }[];
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

export interface RaidGranted {
  coins: number;
  mana: number;
  stamina: boolean;
  keys: number;
  cosmetic: string | null;
  weapon: string | null;
  label: string;
}

export const raid = {
  current: () => apiFetch<RaidSnapshot>("/api/raid/current"),
  ability: (ability: "power" | "aoe" | "shield") =>
    apiFetch<RaidSnapshot>("/api/raid/ability", {
      method: "POST",
      body: JSON.stringify({ ability }),
    }),
  claim: () =>
    apiFetch<{ granted: RaidGranted[]; snapshot: RaidSnapshot }>("/api/raid/claim", { method: "POST" }),
  quest: () => apiFetch<RaidSnapshot>("/api/raid/quest", { method: "POST" }),
  chest: (eventId: number) =>
    apiFetch<{ chest: { status: string; coins: number; title: string }; snapshot: RaidSnapshot }>(
      "/api/raid/chest",
      { method: "POST", body: JSON.stringify({ eventId }) },
    ),
  shop: (item: "mana" | "stamina") =>
    apiFetch<RaidSnapshot>("/api/raid/shop", { method: "POST", body: JSON.stringify({ item }) }),
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

export default raid;
