// ─────────────────────────────────────────────────────────────────────────────
// Рейд-босс: недельное событие на всё сообщество.
//
// Четыре таблицы, и у каждой своя причина существовать отдельно:
//
//   raid_events       — сам рейд недели: кто босс, сколько у него HP, сколько
//                       уже снято, чем кончилось. Одна строка на неделю, ключ
//                       недели уникален — параллельных рейдов не бывает.
//   raid_participants — вклад одного ученика в один рейд. Агрегат, а не сумма
//                       по журналу: рейтинг и вехи спрашиваются на каждом
//                       открытии экрана, а журнал растёт весь год.
//   raid_hits         — журнал ударов. Нужен для дневного задания («нанеси 100
//                       урона»), ленты последних ударов и разбора аномалий.
//   raid_state        — боевое состояние ученика МЕЖДУ рейдами: энергия, мана,
//                       комбо, бафы, монеты, скин оружия. Живёт вне события,
//                       потому что комбо и энергия не обнуляются в полночь
//                       воскресенья вместе с боссом.
//
// Почему боевое состояние не в users: это данные одной фичи, и они меняются на
// каждый ответ. В users уже двенадцать колонок геймификации, и каждая новая
// колонка там — это лишний UPDATE в таблице, которую читает всё приложение.
// ─────────────────────────────────────────────────────────────────────────────
import {
  pgTable, serial, integer, text, boolean, timestamp, date, jsonb, index, unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Рейд одной недели. */
export const raidEventsTable = pgTable("raid_events", {
  id: serial("id").primaryKey(),
  /** Ключ босса: golem | dragon | phantom | elemental | titan. */
  boss: text("boss").notNull(),
  /** Неделя по ISO: «2026-W33». Уникален — один рейд на неделю. */
  weekKey: text("week_key").notNull(),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  /** Полный пул здоровья. Пересчитывается раз в час под активную аудиторию. */
  hpTotal: integer("hp_total").notNull(),
  /** Сколько урона нанесено всем сообществом. */
  damageDealt: integer("damage_dealt").notNull().default(0),
  /** active | won | lost. */
  status: text("status").notNull().default("active"),
  /** Кто нанёс добивающий удар. */
  killerUserId: integer("killer_user_id"),
  /** Когда HP последний раз подгонялся под аудиторию. */
  hpTunedAt: timestamp("hp_tuned_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("raid_event_week_unique").on(t.weekKey)]);

/** Вклад ученика в один рейд. */
export const raidParticipantsTable = pgTable("raid_participants", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => raidEventsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  damage: integer("damage").notNull().default(0),
  hits: integer("hits").notNull().default(0),
  /** Критических ударов за рейд: из них считается достижение. */
  crits: integer("crits").notNull().default(0),
  bestCombo: integer("best_combo").notNull().default(0),
  /** Сколько вех личного вклада уже выдано. */
  milestone: integer("milestone").notNull().default(0),
  /** Сундук за итог рейда получен. */
  chestClaimed: boolean("chest_claimed").notNull().default(false),
  lastHitAt: timestamp("last_hit_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  unique("raid_participant_unique").on(t.eventId, t.userId),
  index("raid_participants_event_damage_idx").on(t.eventId, t.damage),
]);

/** Один удар. */
export const raidHitsTable = pgTable("raid_hits", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => raidEventsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  damage: integer("damage").notNull().default(0),
  /** Тег задания, по которому считалась уязвимость: vocab, tenses, … */
  tag: text("tag"),
  /** easy | medium | hard. */
  difficulty: text("difficulty").notNull(),
  crit: boolean("crit").notNull().default(false),
  /** Сверхэффективный удар: тег совпал со слабостью босса. */
  superEffective: boolean("super_effective").notNull().default(false),
  combo: integer("combo").notNull().default(0),
  at: timestamp("at").notNull().defaultNow(),
}, (t) => [
  index("raid_hits_user_time_idx").on(t.userId, t.at),
  index("raid_hits_event_time_idx").on(t.eventId, t.at),
]);

/** Боевое состояние ученика. Одна строка на человека, живёт между рейдами. */
export const raidStateTable = pgTable("raid_state", {
  userId: integer("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  /** Энергия: одна единица за задание, +1 за 30 минут, максимум 20. */
  stamina: integer("stamina").notNull().default(20),
  /** От какого момента отсчитывается восстановление. */
  staminaAt: timestamp("stamina_at").notNull().defaultNow(),
  mana: integer("mana").notNull().default(0),
  /** День, за который уже выдана мана за вход. */
  manaDay: date("mana_day"),
  /** Текущая серия верных ответов. Ошибка сбрасывает. */
  combo: integer("combo").notNull().default(0),
  /** Серия без ошибок для маны и снятия «ржавчины». */
  cleanStreak: integer("clean_streak").notNull().default(0),
  /** Мощный удар заряжен: следующий верный ответ бьёт втройне. */
  powerArmed: boolean("power_armed").notNull().default(false),
  /** Сколько заданий осталось под удвоением. */
  aoeLeft: integer("aoe_left").notNull().default(0),
  /** Щит от штрафа за пропуск дней. */
  shieldUntil: timestamp("shield_until"),
  /** Дебаф «Языковая ржавчина»: урон ниже до этого момента. */
  rustUntil: timestamp("rust_until"),
  /** Множитель урона за победу над боссом (48 часов). */
  boostUntil: timestamp("boost_until"),
  /** Когда ученик последний раз что-то делал: по этому считается пропуск. */
  lastActiveAt: timestamp("last_active_at"),
  /** Монеты события. Тратятся внутри рейда. */
  coins: integer("coins").notNull().default(0),
  /** Ключи к лутбоксам. */
  keys: integer("keys").notNull().default(0),
  /** Косметика: рамки и стикеры. */
  frames: jsonb("frames").$type<string[]>(),
  /** Скин оружия с последней веха-награды: +5% базового урона. */
  weaponSkin: text("weapon_skin"),
  /** В каком рейде скин получен: в нём же он бонуса не даёт. */
  weaponEventId: integer("weapon_event_id"),
  /** Титул и до какого момента он держится. */
  title: text("title"),
  titleUntil: timestamp("title_until"),
  /** День дневного задания и выдана ли за него награда. */
  questDay: date("quest_day"),
  questClaimed: boolean("quest_claimed").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type RaidEvent = typeof raidEventsTable.$inferSelect;
export type RaidParticipant = typeof raidParticipantsTable.$inferSelect;
export type RaidHit = typeof raidHitsTable.$inferSelect;
export type RaidState = typeof raidStateTable.$inferSelect;
