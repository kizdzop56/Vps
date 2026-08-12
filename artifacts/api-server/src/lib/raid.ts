// ─────────────────────────────────────────────────────────────────────────────
// Рейд-босс: правила события и весь счёт урона.
//
// Событие идёт неделю (пн 00:00 — вс 23:59). У босса общий на всех пул
// здоровья, каждый верный ответ снимает часть, итог общий: добили — победа всем,
// не добили — утешительный сундук.
//
// ── Здоровье босса ──────────────────────────────────────────────────────────
// HP считается от ЧИСЛА УЧЕНИКОВ в приложении так, чтобы босса сносили примерно
// за пять дней из семи: два дня в запасе на выходные и на тех, кто заходит
// через день.
//
//   HP = ученики * DAILY_DAMAGE_PER_STUDENT * TARGET_DAYS
//
// Дневная ставка взята из практики: около пятнадцати заданий в день по 35–45
// урона с учётом комбо и уязвимости. Формула из первоначальной задумки
// (100 000 * (1 + 0.05 * DAU)) не используется: при одном-двух учениках она
// давала босса, которого не убить никогда, а событие без победы бессмысленно.
//
// Считаем именно учеников, а не активных: рейд общий, и новичок, зашедший в
// среду, тоже часть сообщества. Учителя и родители не бьют — их и не считаем.
//
// ── Динамическая сложность ──────────────────────────────────────────────────
// Раз в час HP подгоняется под текущее число учеников, но не больше чем на 10%
// за раз и никогда ниже уже нанесённого урона: иначе всплеск регистраций делал
// бы босса непобиваемым для тех, кто бьёт его с понедельника. В последние сутки
// подгонка выключена — финиш не должен уезжать из-под ног.
//
// ── Один общий топ, без лиг ─────────────────────────────────────────────────
// Лиги по уровню профиля убраны. Затея была в том, чтобы новичок не сравнивал
// себя с ветераном, но на деле она давала обратное: в каждой лиге по одному
// человеку, три таблицы по одной строке и переключатель между пустотами. Рейд —
// событие ОБЩЕЕ, у него один босс и один пул здоровья, значит и таблица одна.
// Место считается по всем участникам рейда.
//
// ── Валюта одна: монеты ─────────────────────────────────────────────────────
// Монеты капают за попадания, дневное задание и сундуки. Тратятся на бафы
// (мощный удар, удвоение, щит) и на энергию. Маны в механике нет: два счётчика
// делали одно и то же.
//
// ── Дисциплина ──────────────────────────────────────────────────────────────
// recordRaidHit() вызывается ИЗ ПУТИ ОТВЕТА УЧЕНИКА и поэтому не имеет права
// падать: любая ошибка внутри логируется и превращается в null. Сломанный рейд
// не должен ломать тренажёр.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "@workspace/db";
import {
  usersTable,
  raidEventsTable,
  raidParticipantsTable,
  raidHitsTable,
  raidStateTable,
  type RaidEvent,
  type RaidState,
} from "@workspace/db";
import { and, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { logger } from "./logger";
import { startOfDay } from "./srs";
import { localDayKey } from "./timeStats";
import { EMPTY_LIFETIME, raidMedalCount, raidMedals, type RaidLifetime } from "./raidMedals";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// ── Теги заданий и слабости боссов ──────────────────────────────────────────

/** Чем является задание. По совпадению со слабостью босса бьёт сверхэффективно. */
export type RaidTag =
  | "grammar" | "tenses" | "prepositions"
  | "vocab" | "synonyms"
  | "listening" | "pronunciation"
  | "phrasal" | "idioms" | "wordorder";

export type RaidDifficulty = "easy" | "medium" | "hard";
export type RaidPhase = "normal" | "hardened" | "berserk";

/** Базовый урон по сложности задания. */
export const BASE_DAMAGE: Record<RaidDifficulty, number> = { easy: 10, medium: 25, hard: 50 };

export interface BossDef {
  key: string;
  name: string;
  short: string;
  about: string;
  /** Слабости. "all" — сезонный титан, уязвим ко всему. */
  weak: RaidTag[] | "all";
  /** Цвета тела: по ним клиент рисует босса, картинок в сборке нет. */
  colors: [string, string];
  seasonal: boolean;
}

export const BOSSES: readonly BossDef[] = [
  {
    key: "golem", name: "Грамматический Голем", short: "Голем",
    about: "Каменная кладка правил. Рассыпается от времён и предлогов.",
    weak: ["grammar", "tenses", "prepositions"], colors: ["#818cf8", "#4338ca"], seasonal: false,
  },
  {
    key: "dragon", name: "Лексический Дракон", short: "Дракон",
    about: "Копит слова, как золото. Слабее всего против словарного запаса.",
    weak: ["vocab", "synonyms"], colors: ["#c084fc", "#6d28d9"], seasonal: false,
  },
  {
    key: "phantom", name: "Фонетический Фантом", short: "Фантом",
    about: "Его почти не видно. Выдаёт себя на слух и в произношении.",
    weak: ["listening", "pronunciation"], colors: ["#67e8f9", "#0e7490"], seasonal: false,
  },
  {
    key: "elemental", name: "Идиоматический Элементаль", short: "Элементаль",
    about: "Собран из выражений, которые нельзя перевести дословно.",
    weak: ["phrasal", "idioms", "wordorder"], colors: ["#f9a8d4", "#be185d"], seasonal: false,
  },
  {
    key: "titan", name: "Экзаменационный Титан", short: "Титан",
    about: "Сезонный босс перед тестированием. Уязвим ко всему сразу.",
    weak: "all", colors: ["#fbbf24", "#b45309"], seasonal: true,
  },
];

export function bossByKey(key: string): BossDef {
  return BOSSES.find((b) => b.key === key) ?? BOSSES[0]!;
}

// ── Неделя события ──────────────────────────────────────────────────────────

export interface RaidWeek {
  /** «2026-W33». */
  key: string;
  startsAt: Date;
  endsAt: Date;
  /** Сквозной номер недели: по нему выбирается босс. */
  index: number;
}

/**
 * Окно недели по часовому поясу приложения.
 *
 * День берётся из startOfDay() — того же, по которому считаются дневные потолки
 * очков. Иначе рейд начинался бы в полночь UTC, то есть в три часа ночи для
 * Минска, и «понедельник» события не совпадал бы с понедельником ученика.
 */
export function weekWindow(now: Date = new Date()): RaidWeek {
  const today = startOfDay(now);
  const shift = (today.getDay() + 6) % 7; // 0 — понедельник
  const startsAt = startOfDay(new Date(today.getTime() - shift * DAY_MS));
  // Половина суток внутрь: так конец недели не съезжает при переводе часов.
  const endsAt = startOfDay(new Date(startsAt.getTime() + 7 * DAY_MS + DAY_MS / 2));

  // Номер недели по ISO: считаем по четвергу этой недели — он всегда лежит в том
  // году, которому неделя принадлежит.
  const thursday = new Date(Date.UTC(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate() + 3));
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / (7 * DAY_MS)) + 1;
  const year = thursday.getUTCFullYear();

  return {
    key: `${year}-W${String(week).padStart(2, "0")}`,
    startsAt,
    endsAt,
    index: year * 53 + week,
  };
}

/**
 * Босс недели.
 *
 * Четыре обычных босса идут по кругу, каждая восьмая неделя — сезонный титан:
 * иначе «сезонный» босс не наступал бы никогда, а расписание экзаменов сервер
 * не знает.
 */
export function bossForWeek(index: number): BossDef {
  const seasonal = BOSSES.find((b) => b.seasonal);
  if (seasonal && index % 8 === 7) return seasonal;
  const rotation = BOSSES.filter((b) => !b.seasonal);
  return rotation[((index % rotation.length) + rotation.length) % rotation.length]!;
}

// ── Здоровье босса ──────────────────────────────────────────────────────────

/** Сколько урона ученик успевает нанести за день без надрыва. */
export const DAILY_DAMAGE_PER_STUDENT = 600;
/** За сколько дней сообщество должно спокойно закрывать босса. */
export const TARGET_DAYS = 5;
/** Пол: даже у одного ученика босс должен жить несколько дней. */
export const MIN_HP = DAILY_DAMAGE_PER_STUDENT * TARGET_DAYS;

export function bossHp(students: number): number {
  const people = Math.max(1, Math.round(students));
  return Math.max(MIN_HP, people * DAILY_DAMAGE_PER_STUDENT * TARGET_DAYS);
}

export function phaseOf(hpLeft: number, hpTotal: number): RaidPhase {
  const share = hpTotal > 0 ? hpLeft / hpTotal : 0;
  if (share > 0.6) return "normal";
  if (share > 0.3) return "hardened";
  return "berserk";
}

/**
 * Множитель за уязвимость по фазе.
 *
 * Во второй фазе босс сопротивляется сильнее, но и награда за попадание по
 * слабости растёт до ×3 — именно это заставляет добирать нужные упражнения, а
 * не долбить самое привычное.
 */
export const VULN_MULT: Record<RaidPhase, number> = { normal: 1.5, hardened: 3, berserk: 2 };
/** В берсерке базовый урон любого задания выше на 50%. */
export const BERSERK_BASE_BONUS = 1.5;

// ── Энергия, монеты, бафы ───────────────────────────────────────────────────
//
// ЭНЕРГИЯ ТРАТИТСЯ НА ЛЮБОЙ ОТВЕТ, верный или нет. Раньше ошибка была
// бесплатной, и это ломало сразу две вещи:
//
//   • у заданий с выбором из четырёх вариантов пропадала цена ошибки. Можно было
//     тыкать наугад: неверный вариант ничего не стоит, верный даёт урон, то есть
//     энергия ограничивала не количество попыток, а количество попаданий;
//   • от накруток энергия перестала защищать: перебор вариантов бесконечен, а
//     ограничение считалось только по удачным.
//
// Теперь одна попытка = одна энергия. Отвечать всё равно можно и без неё
// (задание решается, урон не идёт), поэтому учиться энергия не запрещает.

export const STAMINA_MAX = 20;
export const STAMINA_REGEN_MS = 30 * MINUTE_MS;

/** Монеты за попадание и надбавки. Единственный постоянный доход. */
export const COINS_PER_HIT = 1;
export const COINS_SUPER_BONUS = 1;
export const COINS_CRIT_BONUS = 2;
/** Монеты за вход в новый день. */
export const DAILY_COINS = 10;
/** Монеты за каждые пять верных подряд. */
export const STREAK_COINS = 5;
export const STREAK_COINS_STEP = 5;

/** Цены бафов. Всё в монетах: другой валюты в рейде нет. */
export const POWER_COST = 40;
export const POWER_MULT = 3;
export const AOE_COST = 80;
export const AOE_TASKS = 5;
export const AOE_MULT = 2;
export const SHIELD_COST = 60;
export const STAMINA_COST = 50;

/** Пропуск сутки и больше — «языковая ржавчина» на два часа. */
export const RUST_AFTER_MS = 24 * HOUR_MS;
export const RUST_DURATION_MS = 2 * HOUR_MS;
export const RUST_MULT = 0.8;
/** Пять заданий подряд без ошибок снимают ржавчину досрочно. */
export const RUST_CLEAR_STREAK = 5;

/** Скин оружия из прошлого рейда. */
export const WEAPON_BONUS = 1.05;
/** Множитель урона за победу: 48 часов после сундука. */
export const BOOST_MULT = 1.5;
export const BOOST_MS = 48 * HOUR_MS;

/** Дневное задание рейда. */
export const QUEST_DAMAGE = 100;
export const QUEST_COINS = 40;

// ── Формула урона ───────────────────────────────────────────────────────────

export interface DamageInput {
  difficulty: RaidDifficulty;
  tags: RaidTag[];
  weak: RaidTag[] | "all";
  /** Серия верных ответов ВКЛЮЧАЯ текущий. */
  streak: number;
  phase: RaidPhase;
  crit: boolean;
  aoe: boolean;
  rusty: boolean;
  weapon: boolean;
  boosted: boolean;
}

export interface DamageBreakdown {
  damage: number;
  base: number;
  comboMult: number;
  vulnMult: number;
  superEffective: boolean;
  crit: boolean;
  aoe: boolean;
  rusty: boolean;
}

export function comboMult(streak: number): number {
  if (streak >= 10) return 2;
  if (streak >= 5) return 1.5;
  if (streak >= 3) return 1.2;
  return 1;
}

/**
 * Урон = (базовый * комбо) + бонус уязвимости, дальше множители состояния.
 *
 * Чистая функция: ни базы, ни времени. Всё, что влияет на цифру, приходит
 * аргументом — эту формулу должно быть можно проверить глазами и тестом.
 */
export function computeDamage(input: DamageInput): DamageBreakdown {
  const superEffective = input.weak === "all"
    ? true
    : input.tags.some((t) => (input.weak as RaidTag[]).includes(t));

  let base = BASE_DAMAGE[input.difficulty];
  if (input.phase === "berserk") base *= BERSERK_BASE_BONUS;
  if (input.weapon) base *= WEAPON_BONUS;

  const combo = comboMult(input.streak);
  const vuln = superEffective ? VULN_MULT[input.phase] : 1;

  // Форма записи ровно как в задумке: сначала база на комбо, потом добавка за
  // уязвимость. Умножение внутри — то же самое, но так видно, за что цифра.
  let damage = base * combo + base * combo * (vuln - 1);

  if (input.crit) damage *= POWER_MULT;
  if (input.aoe) damage *= AOE_MULT;
  if (input.boosted) damage *= BOOST_MULT;
  if (input.rusty) damage *= RUST_MULT;

  return {
    damage: Math.max(1, Math.round(damage)),
    base: Math.round(base),
    comboMult: combo,
    vulnMult: vuln,
    superEffective,
    crit: input.crit,
    aoe: input.aoe,
    rusty: input.rusty,
  };
}

// ── Вехи личного вклада ─────────────────────────────────────────────────────
//
// Шкала вех в клиенте пока скрыта (её попросили убрать до отдельного разговора),
// но счёт вкладу ведётся: убирать посчитанное ради временно спрятанного экрана
// значит потерять историю. Награды выдаются только по явному запросу
// claimMilestones — сам по себе счёт монет не двигает.

export interface MilestoneReward {
  coins: number;
  /** Полное восстановление энергии. */
  stamina: boolean;
  keys: number;
  cosmetic: string | null;
  weapon: string | null;
  label: string;
}

function reward(
  coins: number,
  extra: Partial<Omit<MilestoneReward, "coins" | "label">> & { label?: string } = {},
): MilestoneReward {
  const cosmetic = extra.cosmetic ?? null;
  const weapon = extra.weapon ?? null;
  const stamina = extra.stamina ?? false;
  const keys = extra.keys ?? 0;
  const parts: string[] = [`${coins} монет`];
  if (stamina) parts.push("полная энергия");
  if (keys > 0) parts.push(`${keys} ключ`);
  if (cosmetic) parts.push(cosmetic);
  if (weapon) parts.push(weapon);
  return { coins, stamina, keys, cosmetic, weapon, label: extra.label ?? parts.join(" · ") };
}

/** Двадцать вех по нанесённому за рейд урону. */
export const MILESTONES: readonly { at: number; reward: MilestoneReward }[] = [
  { at: 50, reward: reward(15) },
  { at: 100, reward: reward(20) },
  { at: 200, reward: reward(25, { stamina: true }) },
  { at: 350, reward: reward(30) },
  { at: 550, reward: reward(35, { cosmetic: "рамка «Трещина»" }) },
  { at: 800, reward: reward(40) },
  { at: 1100, reward: reward(45, { keys: 1 }) },
  { at: 1500, reward: reward(50) },
  { at: 2000, reward: reward(60, { stamina: true }) },
  { at: 2600, reward: reward(70, { cosmetic: "рамка «Пепел»" }) },
  { at: 3300, reward: reward(80) },
  { at: 4100, reward: reward(90, { keys: 1 }) },
  { at: 5000, reward: reward(100) },
  { at: 6000, reward: reward(110, { stamina: true }) },
  { at: 7200, reward: reward(120, { cosmetic: "стикер «Добито»" }) },
  { at: 8600, reward: reward(140) },
  { at: 10200, reward: reward(160, { keys: 1 }) },
  { at: 12000, reward: reward(180) },
  { at: 14000, reward: reward(200, { stamina: true }) },
  { at: 16500, reward: reward(300, { weapon: "скин оружия «Клинок слов»" }) },
];

/** Сколько вех уже достигнуто нанесённым уроном. */
export function milestonesReached(damage: number): number {
  let n = 0;
  for (const m of MILESTONES) if (damage >= m.at) n++;
  return n;
}

// ── Аудитория ───────────────────────────────────────────────────────────────

/**
 * Сколько в приложении учеников.
 *
 * Именно учеников: рейд бьют они, а учителя и родители в событии не участвуют.
 * При ошибке считаем одного — босс будет маленьким, но живым; наоборот было бы
 * хуже (непобиваемый босс из-за сбоя запроса).
 */
async function countStudents(): Promise<number> {
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(eq(usersTable.role, "student"));
    return Math.max(1, Number(row?.n ?? 1));
  } catch (err) {
    logger.error({ err }, "Рейд: не удалось посчитать учеников, беру одного");
    return 1;
  }
}

// ── Событие недели ──────────────────────────────────────────────────────────

/** Закрывает рейды, у которых кончилось время. */
async function resolveFinished(now: Date): Promise<void> {
  const stale = await db
    .select()
    .from(raidEventsTable)
    .where(and(eq(raidEventsTable.status, "active"), lte(raidEventsTable.endsAt, now)));
  for (const event of stale) {
    const won = event.damageDealt >= event.hpTotal;
    await db
      .update(raidEventsTable)
      .set({ status: won ? "won" : "lost", resolvedAt: now })
      .where(eq(raidEventsTable.id, event.id));
  }
}

/** Подгоняет HP под число учеников не чаще раза в час. */
async function tuneHp(event: RaidEvent, now: Date): Promise<RaidEvent> {
  if (now.getTime() - event.hpTunedAt.getTime() < HOUR_MS) return event;
  // Последние сутки не трогаем: менять финишную линию перед финишем нельзя.
  if (event.endsAt.getTime() - now.getTime() < DAY_MS) return event;

  const target = bossHp(await countStudents());
  const step = Math.max(1, Math.round(event.hpTotal * 0.1));
  const delta = Math.max(-step, Math.min(step, target - event.hpTotal));
  const hpTotal = Math.max(MIN_HP, event.damageDealt + 1, event.hpTotal + delta);

  const [updated] = await db
    .update(raidEventsTable)
    .set({ hpTotal, hpTunedAt: now })
    .where(eq(raidEventsTable.id, event.id))
    .returning();
  return updated ?? event;
}

/** Рейд текущей недели. Создаёт его, если недели ещё не было. */
export async function ensureRaidEvent(now: Date = new Date()): Promise<RaidEvent> {
  await resolveFinished(now);

  const week = weekWindow(now);
  let [event] = await db.select().from(raidEventsTable).where(eq(raidEventsTable.weekKey, week.key));

  if (!event) {
    const boss = bossForWeek(week.index);
    await db
      .insert(raidEventsTable)
      .values({
        boss: boss.key,
        weekKey: week.key,
        startsAt: week.startsAt,
        endsAt: week.endsAt,
        hpTotal: bossHp(await countStudents()),
        hpTunedAt: now,
      })
      .onConflictDoNothing();
    [event] = await db.select().from(raidEventsTable).where(eq(raidEventsTable.weekKey, week.key));
  }
  if (!event) throw new Error("Рейд недели не создался");

  if (event.status === "active") return await tuneHp(event, now);
  return event;
}

// ── Боевое состояние ученика ────────────────────────────────────────────────

async function ensureState(userId: number, now: Date): Promise<RaidState> {
  await db
    .insert(raidStateTable)
    .values({ userId, staminaAt: now, lastActiveAt: now })
    .onConflictDoNothing();
  const [row] = await db.select().from(raidStateTable).where(eq(raidStateTable.userId, userId));
  if (!row) throw new Error("Боевое состояние не создалось");
  return row;
}

type StatePatch = Partial<typeof raidStateTable.$inferInsert>;

async function applyPatch(userId: number, patch: StatePatch, now: Date): Promise<RaidState> {
  if (Object.keys(patch).length === 0) {
    const [row] = await db.select().from(raidStateTable).where(eq(raidStateTable.userId, userId));
    return row!;
  }
  const [row] = await db
    .update(raidStateTable)
    .set({ ...patch, updatedAt: now })
    .where(eq(raidStateTable.userId, userId))
    .returning();
  return row!;
}

/**
 * Приводит состояние к моменту «сейчас»: восстанавливает энергию, выдаёт монеты
 * за вход, вешает «ржавчину» за пропуск дней и обновляет отметку активности.
 *
 * Вызывается и на открытии экрана, и на каждом ударе: восстановление энергии
 * должно идти по часам, а не по заходам в раздел.
 */
export async function syncState(userId: number, now: Date = new Date()): Promise<RaidState> {
  const state = await ensureState(userId, now);
  const patch: StatePatch = {};

  // Энергия: +1 за каждые 30 минут, остаток времени не теряется.
  const staminaElapsed = now.getTime() - state.staminaAt.getTime();
  if (state.stamina >= STAMINA_MAX) {
    if (staminaElapsed > 0) patch.staminaAt = now;
  } else if (staminaElapsed >= STAMINA_REGEN_MS) {
    const gained = Math.floor(staminaElapsed / STAMINA_REGEN_MS);
    const stamina = Math.min(STAMINA_MAX, state.stamina + gained);
    patch.stamina = stamina;
    patch.staminaAt = stamina >= STAMINA_MAX
      ? now
      : new Date(state.staminaAt.getTime() + gained * STAMINA_REGEN_MS);
  }

  // Монеты за вход и сброс дневного задания.
  const today = localDayKey(now);
  if (state.bonusDay !== today) {
    patch.bonusDay = today;
    patch.coins = state.coins + DAILY_COINS;
    patch.questDay = today;
    patch.questClaimed = false;
  }

  // Пропуск сутки и больше: ржавчина, если нет щита. Щит одноразовый.
  const away = state.lastActiveAt ? now.getTime() - state.lastActiveAt.getTime() : 0;
  if (away >= RUST_AFTER_MS) {
    const shielded = !!state.shieldUntil && state.shieldUntil.getTime() > now.getTime();
    if (shielded) patch.shieldUntil = null;
    else patch.rustUntil = new Date(now.getTime() + RUST_DURATION_MS);
    patch.combo = 0;
    patch.cleanStreak = 0;
  }
  patch.lastActiveAt = now;

  return await applyPatch(userId, patch, now);
}

/**
 * Списать одну энергию за попытку.
 *
 * Отдельной функцией, потому что списание нужно в двух ветках (верный ответ и
 * ошибка), а вместе с ним нужно не забыть сдвинуть точку отсчёта восстановления:
 * пока запас полный, таймер не идёт, и первая же трата обязана его запустить —
 * иначе после суток простоя одна потраченная единица возвращалась бы мгновенно.
 */
function spendStamina(state: RaidState, patch: StatePatch, now: Date): void {
  if (state.stamina <= 0) return;
  patch.stamina = state.stamina - 1;
  if (state.stamina >= STAMINA_MAX) patch.staminaAt = now;
}

// ── Удар ────────────────────────────────────────────────────────────────────

export interface RaidHitInput {
  userId: number;
  correct: boolean;
  difficulty: RaidDifficulty;
  tags: RaidTag[];
  now?: Date;
}

export interface RaidHitResult extends DamageBreakdown {
  eventId: number;
  boss: string;
  bossName: string;
  combo: number;
  stamina: number;
  staminaMax: number;
  coins: number;
  /** Сколько монет принёс именно этот удар. */
  coinsEarned: number;
  aoeLeft: number;
  hpTotal: number;
  hpLeft: number;
  percentLeft: number;
  phase: RaidPhase;
  myDamage: number;
  killed: boolean;
  /** Урон не нанесён: закончилась энергия. */
  blocked: "stamina" | null;
  /** Ржавчина снята этим ответом. */
  rustCleared: boolean;
}

/** Пустой результат: ответ был, а урона нет (ошибка или нет энергии). */
async function idleResult(
  event: RaidEvent,
  boss: BossDef,
  state: RaidState,
  input: RaidHitInput,
  streak: number,
  blocked: "stamina" | null,
): Promise<RaidHitResult> {
  const hpLeft = Math.max(0, event.hpTotal - event.damageDealt);
  const [mine] = await db
    .select({ damage: raidParticipantsTable.damage })
    .from(raidParticipantsTable)
    .where(and(eq(raidParticipantsTable.eventId, event.id), eq(raidParticipantsTable.userId, input.userId)));
  return {
    eventId: event.id, boss: boss.key, bossName: boss.name,
    damage: 0, base: BASE_DAMAGE[input.difficulty], comboMult: comboMult(streak), vulnMult: 1,
    superEffective: false, crit: false, aoe: false, rusty: false,
    combo: streak, stamina: state.stamina, staminaMax: STAMINA_MAX,
    coins: state.coins, coinsEarned: 0, aoeLeft: state.aoeLeft,
    hpTotal: event.hpTotal, hpLeft,
    percentLeft: event.hpTotal > 0 ? Math.round((hpLeft / event.hpTotal) * 100) : 0,
    phase: phaseOf(hpLeft, event.hpTotal),
    myDamage: Number(mine?.damage ?? 0), killed: false, blocked,
    rustCleared: false,
  };
}

/**
 * Засчитать ответ ученика как удар по боссу.
 *
 * Возвращает null, если рейда нет или что-то сломалось: вызывающая сторона
 * (ответ в тренажёре) обязана продолжить работу как будто рейда не существует.
 */
export async function recordRaidHit(input: RaidHitInput): Promise<RaidHitResult | null> {
  const now = input.now ?? new Date();
  try {
    const event = await ensureRaidEvent(now);
    if (event.status !== "active") return null;

    const boss = bossByKey(event.boss);
    const state = await syncState(input.userId, now);
    const patch: StatePatch = {};

    // Ошибка: комбо всухую, урона нет — но попытка потрачена. Бесплатная ошибка
    // обесценивала бы энергию на заданиях с выбором: тыкай наугад, пока не
    // попадёшь (см. блок про энергию выше).
    if (!input.correct) {
      patch.combo = 0;
      patch.cleanStreak = 0;
      spendStamina(state, patch, now);
      const after = await applyPatch(input.userId, patch, now);
      return await idleResult(event, boss, after, input, 0, null);
    }

    // Энергия кончилась: задание решается, но урона не даёт — иначе энергия
    // превратилась бы в запрет учиться. Комбо при этом растёт: серия — это про
    // ответы, а не про запас сил.
    if (state.stamina <= 0) {
      const streak = state.combo + 1;
      patch.combo = streak;
      patch.cleanStreak = state.cleanStreak + 1;
      const after = await applyPatch(input.userId, patch, now);
      return await idleResult(event, boss, after, input, streak, "stamina");
    }

    const hpBefore = Math.max(0, event.hpTotal - event.damageDealt);
    const phase = phaseOf(hpBefore, event.hpTotal);
    const streak = state.combo + 1;
    const cleanStreak = state.cleanStreak + 1;

    const rusty = !!state.rustUntil && state.rustUntil.getTime() > now.getTime();
    const boosted = !!state.boostUntil && state.boostUntil.getTime() > now.getTime();
    const weapon = !!state.weaponSkin && state.weaponEventId !== event.id;

    const breakdown = computeDamage({
      difficulty: input.difficulty,
      tags: input.tags,
      weak: boss.weak,
      streak,
      phase,
      crit: state.powerArmed,
      aoe: state.aoeLeft > 0,
      rusty,
      weapon,
      boosted,
    });

    // Больше остатка не бьём: перебивать мёртвого босса незачем, а цифры
    // «нанесено больше, чем было» ломают шкалу.
    const damage = Math.min(breakdown.damage, Math.max(0, hpBefore));

    // Монеты за попадание: база плюс надбавки за сверхэффективность и крит,
    // плюс бонус за каждые пять верных подряд.
    let coinsEarned = COINS_PER_HIT;
    if (breakdown.superEffective) coinsEarned += COINS_SUPER_BONUS;
    if (breakdown.crit) coinsEarned += COINS_CRIT_BONUS;
    if (cleanStreak % STREAK_COINS_STEP === 0) coinsEarned += STREAK_COINS;

    patch.combo = streak;
    patch.cleanStreak = cleanStreak;
    patch.coins = state.coins + coinsEarned;
    spendStamina(state, patch, now);
    if (state.powerArmed) patch.powerArmed = false;
    if (state.aoeLeft > 0) patch.aoeLeft = state.aoeLeft - 1;

    // Ржавчина снимается пятью верными подряд.
    let rustCleared = false;
    if (rusty && cleanStreak >= RUST_CLEAR_STREAK) {
      patch.rustUntil = null;
      rustCleared = true;
    }

    const after = await applyPatch(input.userId, patch, now);

    // Общий пул: инкремент в базе, а не «прочитал — сложил — записал», иначе
    // два ученика, ответивших одновременно, затрут урон друг друга.
    const [eventAfter] = await db
      .update(raidEventsTable)
      .set({ damageDealt: sql`${raidEventsTable.damageDealt} + ${damage}` })
      .where(eq(raidEventsTable.id, event.id))
      .returning();

    const dealt = Number(eventAfter?.damageDealt ?? event.damageDealt + damage);
    const hpTotal = Number(eventAfter?.hpTotal ?? event.hpTotal);
    const hpLeft = Math.max(0, hpTotal - dealt);
    const killed = hpLeft <= 0 && event.status === "active";

    if (killed) {
      await db
        .update(raidEventsTable)
        .set({ status: "won", resolvedAt: now, killerUserId: input.userId })
        .where(and(eq(raidEventsTable.id, event.id), eq(raidEventsTable.status, "active")));
    }

    const [participant] = await db
      .insert(raidParticipantsTable)
      .values({
        eventId: event.id,
        userId: input.userId,
        damage,
        hits: 1,
        crits: breakdown.crit ? 1 : 0,
        bestCombo: streak,
        lastHitAt: now,
      })
      .onConflictDoUpdate({
        target: [raidParticipantsTable.eventId, raidParticipantsTable.userId],
        set: {
          damage: sql`${raidParticipantsTable.damage} + ${damage}`,
          hits: sql`${raidParticipantsTable.hits} + 1`,
          crits: sql`${raidParticipantsTable.crits} + ${breakdown.crit ? 1 : 0}`,
          bestCombo: sql`greatest(${raidParticipantsTable.bestCombo}, ${streak})`,
          lastHitAt: now,
        },
      })
      .returning();

    await db.insert(raidHitsTable).values({
      eventId: event.id,
      userId: input.userId,
      damage,
      tag: input.tags[0] ?? null,
      difficulty: input.difficulty,
      crit: breakdown.crit,
      superEffective: breakdown.superEffective,
      combo: streak,
      at: now,
    });

    return {
      ...breakdown,
      damage,
      eventId: event.id,
      boss: boss.key,
      bossName: boss.name,
      combo: streak,
      stamina: after.stamina,
      staminaMax: STAMINA_MAX,
      coins: after.coins,
      coinsEarned,
      aoeLeft: after.aoeLeft,
      hpTotal,
      hpLeft,
      percentLeft: hpTotal > 0 ? Math.round((hpLeft / hpTotal) * 100) : 0,
      phase: phaseOf(hpLeft, hpTotal),
      myDamage: Number(participant?.damage ?? damage),
      killed,
      blocked: null,
      rustCleared,
    };
  } catch (err) {
    logger.error({ err, userId: input.userId }, "Рейд: удар не засчитан");
    return null;
  }
}

// ── Экран рейда ─────────────────────────────────────────────────────────────

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

/** Сколько строк показываем в общем топе. */
const TOP_LIMIT = 20;

/**
 * Общий топ рейда по урону.
 *
 * Один на всех: лиг по уровню больше нет (см. шапку файла). Лимит есть, потому
 * что таблица едет вместе с остальной картиной рейда и не должна расти
 * бесконечно; своё место ученик видит отдельной строкой, даже если не попал в
 * первые двадцать.
 */
async function topRows(eventId: number, meId: number): Promise<RaidRow[]> {
  const rows = await db
    .select({
      userId: raidParticipantsTable.userId,
      damage: raidParticipantsTable.damage,
      hits: raidParticipantsTable.hits,
      crits: raidParticipantsTable.crits,
      name: usersTable.name,
      avatarEmoji: usersTable.avatarEmoji,
      avatarColor: usersTable.avatarColor,
      avatarUrl: usersTable.avatarUrl,
      level: usersTable.xpLevel,
    })
    .from(raidParticipantsTable)
    .innerJoin(usersTable, eq(usersTable.id, raidParticipantsTable.userId))
    .where(eq(raidParticipantsTable.eventId, eventId))
    .orderBy(desc(raidParticipantsTable.damage))
    .limit(TOP_LIMIT);

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    avatarEmoji: r.avatarEmoji ?? null,
    avatarColor: r.avatarColor ?? null,
    avatarUrl: r.avatarUrl ?? null,
    level: r.level,
    damage: r.damage,
    hits: r.hits,
    crits: r.crits,
    me: r.userId === meId,
  }));
}

/**
 * Итоги ученика по ВСЕМ рейдам: из них выводятся медали события.
 *
 * Одним запросом с join к событиям: победы считаются только там, где ученик
 * реально ударил (damage > 0) — «был в базе, но не бил» победой не считается.
 * При ошибке возвращаются нули: медали украшение, из-за них экран падать не
 * должен.
 */
async function raidLifetime(userId: number): Promise<RaidLifetime> {
  try {
    const [row] = await db
      .select({
        damage: sql<number>`coalesce(sum(${raidParticipantsTable.damage}), 0)::int`,
        hits: sql<number>`coalesce(sum(${raidParticipantsTable.hits}), 0)::int`,
        crits: sql<number>`coalesce(sum(${raidParticipantsTable.crits}), 0)::int`,
        bestCombo: sql<number>`coalesce(max(${raidParticipantsTable.bestCombo}), 0)::int`,
        raids: sql<number>`count(*)::int`,
        wins: sql<number>`count(*) filter (where ${raidEventsTable.status} = 'won' and ${raidParticipantsTable.damage} > 0)::int`,
      })
      .from(raidParticipantsTable)
      .innerJoin(raidEventsTable, eq(raidEventsTable.id, raidParticipantsTable.eventId))
      .where(eq(raidParticipantsTable.userId, userId));

    const [kills] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(raidEventsTable)
      .where(eq(raidEventsTable.killerUserId, userId));

    return {
      damage: Number(row?.damage ?? 0),
      hits: Number(row?.hits ?? 0),
      crits: Number(row?.crits ?? 0),
      bestCombo: Number(row?.bestCombo ?? 0),
      raids: Number(row?.raids ?? 0),
      wins: Number(row?.wins ?? 0),
      lastHits: Number(kills?.n ?? 0),
    };
  } catch (err) {
    logger.error({ err, userId }, "Рейд: итоги за всё время не посчитались");
    return { ...EMPTY_LIFETIME };
  }
}

/** Полная картина рейда для одного ученика. */
export async function raidSnapshot(userId: number, now: Date = new Date()): Promise<Record<string, unknown>> {
  const event = await ensureRaidEvent(now);
  const boss = bossByKey(event.boss);
  const state = await syncState(userId, now);

  const [participant] = await db
    .select()
    .from(raidParticipantsTable)
    .where(and(eq(raidParticipantsTable.eventId, event.id), eq(raidParticipantsTable.userId, userId)));

  const [me] = await db
    .select({ level: usersTable.xpLevel })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const level = Number(me?.level ?? 1);

  const myDamage = Number(participant?.damage ?? 0);
  const hpLeft = Math.max(0, event.hpTotal - event.damageDealt);
  const phase = phaseOf(hpLeft, event.hpTotal);

  // Место в общем топе: сколько участников набили больше.
  const [ahead] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(raidParticipantsTable)
    .where(and(
      eq(raidParticipantsTable.eventId, event.id),
      sql`${raidParticipantsTable.damage} > ${myDamage}`,
    ));

  const [fighters] = await db
    .select({ n: sql<number>`count(*)::int`, damage: sql<number>`coalesce(sum(${raidParticipantsTable.damage}), 0)::int` })
    .from(raidParticipantsTable)
    .where(eq(raidParticipantsTable.eventId, event.id));

  // Дневное задание: урон за сегодня по журналу ударов.
  const [today] = await db
    .select({ damage: sql<number>`coalesce(sum(${raidHitsTable.damage}), 0)::int` })
    .from(raidHitsTable)
    .where(and(eq(raidHitsTable.userId, userId), gte(raidHitsTable.at, startOfDay(now))));

  const recent = await db
    .select({
      damage: raidHitsTable.damage,
      crit: raidHitsTable.crit,
      superEffective: raidHitsTable.superEffective,
      combo: raidHitsTable.combo,
      at: raidHitsTable.at,
    })
    .from(raidHitsTable)
    .where(and(eq(raidHitsTable.eventId, event.id), eq(raidHitsTable.userId, userId)))
    .orderBy(desc(raidHitsTable.at))
    .limit(8);

  // Несобранный сундук за прошлый рейд: он и есть напоминание об итоге.
  const [pending] = await db
    .select({
      eventId: raidEventsTable.id,
      boss: raidEventsTable.boss,
      status: raidEventsTable.status,
      weekKey: raidEventsTable.weekKey,
      damage: raidParticipantsTable.damage,
    })
    .from(raidParticipantsTable)
    .innerJoin(raidEventsTable, eq(raidEventsTable.id, raidParticipantsTable.eventId))
    .where(and(
      eq(raidParticipantsTable.userId, userId),
      eq(raidParticipantsTable.chestClaimed, false),
      ne(raidEventsTable.status, "active"),
    ))
    .orderBy(desc(raidEventsTable.endsAt))
    .limit(1);

  const history = await db
    .select({
      weekKey: raidEventsTable.weekKey,
      boss: raidEventsTable.boss,
      status: raidEventsTable.status,
      hpTotal: raidEventsTable.hpTotal,
      damageDealt: raidEventsTable.damageDealt,
      myDamage: raidParticipantsTable.damage,
    })
    .from(raidEventsTable)
    .leftJoin(raidParticipantsTable, and(
      eq(raidParticipantsTable.eventId, raidEventsTable.id),
      eq(raidParticipantsTable.userId, userId),
    ))
    .where(ne(raidEventsTable.status, "active"))
    .orderBy(desc(raidEventsTable.endsAt))
    .limit(4);

  const rusty = !!state.rustUntil && state.rustUntil.getTime() > now.getTime();
  const boosted = !!state.boostUntil && state.boostUntil.getTime() > now.getTime();
  const shielded = !!state.shieldUntil && state.shieldUntil.getTime() > now.getTime();
  const weapon = !!state.weaponSkin && state.weaponEventId !== event.id;

  const lifetime = await raidLifetime(userId);
  const medals = raidMedals(lifetime);

  return {
    event: {
      id: event.id,
      boss: boss.key,
      bossName: boss.name,
      bossShort: boss.short,
      about: boss.about,
      weak: boss.weak === "all" ? ["all"] : boss.weak,
      colors: boss.colors,
      seasonal: boss.seasonal,
      weekKey: event.weekKey,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      status: event.status,
      hpTotal: event.hpTotal,
      hpLeft,
      damageDealt: event.damageDealt,
      percentLeft: event.hpTotal > 0 ? Math.round((hpLeft / event.hpTotal) * 1000) / 10 : 0,
      phase,
      vulnMult: VULN_MULT[phase],
      fighters: Number(fighters?.n ?? 0),
      killerUserId: event.killerUserId,
    },
    me: {
      damage: myDamage,
      hits: Number(participant?.hits ?? 0),
      crits: Number(participant?.crits ?? 0),
      bestCombo: Number(participant?.bestCombo ?? 0),
      combo: state.combo,
      rank: Number(ahead?.n ?? 0) + 1,
      level,
      share: Number(fighters?.damage ?? 0) > 0
        ? Math.round((myDamage / Number(fighters?.damage ?? 1)) * 1000) / 10
        : 0,
      stamina: state.stamina,
      staminaMax: STAMINA_MAX,
      staminaNextAt: state.stamina >= STAMINA_MAX
        ? null
        : new Date(state.staminaAt.getTime() + STAMINA_REGEN_MS).toISOString(),
      coins: state.coins,
      keys: state.keys,
      frames: state.frames ?? [],
      powerArmed: state.powerArmed,
      aoeLeft: state.aoeLeft,
      shielded,
      shieldUntil: state.shieldUntil?.toISOString() ?? null,
      rusty,
      rustUntil: state.rustUntil?.toISOString() ?? null,
      boosted,
      boostUntil: state.boostUntil?.toISOString() ?? null,
      weapon,
      weaponSkin: state.weaponSkin,
      title: state.title,
      titleUntil: state.titleUntil?.toISOString() ?? null,
      lastHero: event.killerUserId === userId,
      merciless: Number(participant?.crits ?? 0) >= 10,
    },
    quest: {
      need: QUEST_DAMAGE,
      done: Number(today?.damage ?? 0),
      claimed: state.questClaimed && state.questDay === localDayKey(now),
      coins: QUEST_COINS,
    },
    /** Бафы: всё покупается монетами. */
    abilities: {
      power: { cost: POWER_COST, mult: POWER_MULT, armed: state.powerArmed },
      aoe: { cost: AOE_COST, tasks: AOE_TASKS, mult: AOE_MULT, left: state.aoeLeft },
      shield: { cost: SHIELD_COST, active: shielded },
      stamina: { cost: STAMINA_COST, full: state.stamina >= STAMINA_MAX },
    },
    /** Один общий топ по урону. Лиг больше нет. */
    top: await topRows(event.id, userId),
    /** Медали события: выводятся из итогов за всё время, нигде не хранятся. */
    medals,
    medalCount: raidMedalCount(medals),
    lifetime,
    chest: pending
      ? {
        eventId: pending.eventId,
        bossName: bossByKey(pending.boss).name,
        status: pending.status,
        weekKey: pending.weekKey,
        damage: pending.damage,
        coins: pending.status === "won" ? 500 : 120,
      }
      : null,
    history: history.map((h) => ({
      weekKey: h.weekKey,
      bossName: bossByKey(h.boss).name,
      status: h.status,
      hpTotal: h.hpTotal,
      damageDealt: h.damageDealt,
      myDamage: Number(h.myDamage ?? 0),
    })),
    recent: recent.map((r) => ({
      damage: r.damage,
      crit: r.crit,
      superEffective: r.superEffective,
      combo: r.combo,
      at: r.at.toISOString(),
    })),
  };
}

// ── Действия ученика ────────────────────────────────────────────────────────

export type RaidActionError = { error: string };

function fail(error: string): RaidActionError {
  return { error };
}

export function isActionError(value: unknown): value is RaidActionError {
  return !!value && typeof value === "object" && "error" in (value as object);
}

export type RaidBuff = "power" | "aoe" | "shield" | "stamina";

/** Купить баф за монеты. */
export async function buyBuff(
  userId: number,
  buff: RaidBuff,
  now: Date = new Date(),
): Promise<RaidState | RaidActionError> {
  const state = await syncState(userId, now);

  if (buff === "power") {
    if (state.powerArmed) return fail("Мощный удар уже заряжен");
    if (state.coins < POWER_COST) return fail("Не хватает монет");
    return await applyPatch(userId, { coins: state.coins - POWER_COST, powerArmed: true }, now);
  }
  if (buff === "aoe") {
    if (state.aoeLeft > 0) return fail("Удвоение ещё действует");
    if (state.coins < AOE_COST) return fail("Не хватает монет");
    return await applyPatch(userId, { coins: state.coins - AOE_COST, aoeLeft: AOE_TASKS }, now);
  }
  if (buff === "stamina") {
    if (state.stamina >= STAMINA_MAX) return fail("Энергия и так полная");
    if (state.coins < STAMINA_COST) return fail("Не хватает монет");
    return await applyPatch(
      userId,
      { coins: state.coins - STAMINA_COST, stamina: STAMINA_MAX, staminaAt: now },
      now,
    );
  }
  if (state.shieldUntil && state.shieldUntil.getTime() > now.getTime()) return fail("Щит уже стоит");
  if (state.coins < SHIELD_COST) return fail("Не хватает монет");
  return await applyPatch(
    userId,
    { coins: state.coins - SHIELD_COST, shieldUntil: new Date(now.getTime() + 7 * DAY_MS) },
    now,
  );
}

export interface ClaimResult {
  granted: MilestoneReward[];
  coins: number;
  keys: number;
  frames: string[];
  weaponSkin: string | null;
}

/** Забрать все достигнутые вехи личного вклада. */
export async function claimMilestones(
  userId: number,
  now: Date = new Date(),
): Promise<ClaimResult | RaidActionError> {
  const event = await ensureRaidEvent(now);
  const [participant] = await db
    .select()
    .from(raidParticipantsTable)
    .where(and(eq(raidParticipantsTable.eventId, event.id), eq(raidParticipantsTable.userId, userId)));
  if (!participant) return fail("Ты ещё не бил этого босса");

  const reached = milestonesReached(participant.damage);
  if (reached <= participant.milestone) return fail("Новых вех пока нет");

  const state = await syncState(userId, now);
  const granted = MILESTONES.slice(participant.milestone, reached).map((m) => m.reward);

  let coins = state.coins;
  let keys = state.keys;
  let stamina = state.stamina;
  const frames = [...(state.frames ?? [])];
  let weaponSkin = state.weaponSkin;
  let weaponEventId = state.weaponEventId;

  for (const r of granted) {
    coins += r.coins;
    keys += r.keys;
    if (r.stamina) stamina = STAMINA_MAX;
    if (r.cosmetic && !frames.includes(r.cosmetic)) frames.push(r.cosmetic);
    if (r.weapon) {
      weaponSkin = r.weapon;
      // Скин работает со СЛЕДУЮЩЕГО рейда: в этом он уже отработал как награда.
      weaponEventId = event.id;
    }
  }

  await applyPatch(userId, { coins, keys, stamina, frames, weaponSkin, weaponEventId }, now);
  await db
    .update(raidParticipantsTable)
    .set({ milestone: reached })
    .where(eq(raidParticipantsTable.id, participant.id));

  return { granted, coins, keys, frames, weaponSkin };
}

/** Дневное задание рейда. */
export async function claimQuest(
  userId: number,
  now: Date = new Date(),
): Promise<RaidState | RaidActionError> {
  const state = await syncState(userId, now);
  const today = localDayKey(now);
  if (state.questClaimed && state.questDay === today) return fail("Награда за сегодня уже получена");

  const [row] = await db
    .select({ damage: sql<number>`coalesce(sum(${raidHitsTable.damage}), 0)::int` })
    .from(raidHitsTable)
    .where(and(eq(raidHitsTable.userId, userId), gte(raidHitsTable.at, startOfDay(now))));
  if (Number(row?.damage ?? 0) < QUEST_DAMAGE) return fail(`Нужно ${QUEST_DAMAGE} урона за день`);

  return await applyPatch(
    userId,
    { questDay: today, questClaimed: true, coins: state.coins + QUEST_COINS },
    now,
  );
}

export interface ChestResult {
  status: string;
  coins: number;
  title: string;
  boostUntil: string | null;
}

/** Сундук за итог закончившегося рейда. */
export async function claimChest(
  userId: number,
  eventId: number,
  now: Date = new Date(),
): Promise<ChestResult | RaidActionError> {
  const [row] = await db
    .select({
      participantId: raidParticipantsTable.id,
      damage: raidParticipantsTable.damage,
      claimed: raidParticipantsTable.chestClaimed,
      status: raidEventsTable.status,
      boss: raidEventsTable.boss,
    })
    .from(raidParticipantsTable)
    .innerJoin(raidEventsTable, eq(raidEventsTable.id, raidParticipantsTable.eventId))
    .where(and(eq(raidParticipantsTable.eventId, eventId), eq(raidParticipantsTable.userId, userId)));

  if (!row) return fail("В этом рейде тебя не было");
  if (row.status === "active") return fail("Рейд ещё идёт");
  if (row.claimed) return fail("Сундук уже открыт");
  if (row.damage <= 0) return fail("Нужен хотя бы один удар по боссу");

  const state = await syncState(userId, now);
  const won = row.status === "won";
  const coins = won ? 500 : 120;
  const title = won ? `Победитель ${bossByKey(row.boss).name}` : "Выживший";
  const boostUntil = won ? new Date(now.getTime() + BOOST_MS) : null;

  const patch: StatePatch = {
    coins: state.coins + coins,
    title,
    titleUntil: new Date(now.getTime() + 7 * DAY_MS),
  };
  if (boostUntil) patch.boostUntil = boostUntil;

  await applyPatch(userId, patch, now);
  await db
    .update(raidParticipantsTable)
    .set({ chestClaimed: true })
    .where(eq(raidParticipantsTable.id, row.participantId));

  return { status: row.status, coins, title, boostUntil: boostUntil?.toISOString() ?? null };
}
