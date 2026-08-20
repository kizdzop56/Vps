// ─────────────────────────────────────────────────────────────────────────────
// Рейд-босс: недельное событие на всё сообщество.
//
// Пять таблиц, и у каждой своя причина существовать отдельно:
//
//   raid_events       — сам рейд недели: кто босс, сколько у него HP, сколько
//                       уже снято, чем кончилось. Одна строка на неделю.
//   raid_participants — вклад одного ученика в один рейд (агрегат для рейтинга).
//   raid_hits         — журнал ударов (дневное задание, лента попаданий).
//   raid_tasks        — журнал ВЫДАННЫХ заданий боя (см. ниже).
//   raid_state        — боевое состояние ученика МЕЖДУ рейдами: энергия, комбо,
//                       сумка бафов, монеты, скин оружия.
//
// Почему боевое состояние не в users: это данные одной фичи, и они меняются на
// каждый ответ. Каждая новая колонка в users — лишний UPDATE в таблице, которую
// читает всё приложение.
//
// ── СУМКА ОТДЕЛЬНО, АКТИВАЦИЯ ОТДЕЛЬНО ──────────────────────────────
// Купленный баф БОЛЬШЕ НЕ СРАБАТЫВАЕТ САМ. Покупка кладёт его в сумку, а
// применяет его ученик сам в бою, когда считает нужным. Поэтому у каждого
// бафа ДВА счёта, и путать их нельзя:
//
//   запас («stock»)   — сколько куплено и лежит в сумке: power_stacks,
//                     aoe_stock, stamina_stock, hints;
//   активное состояние — что уже применено и ждёт ответа: power_armed,
//                     aoe_left.
//
// Без этого разделения мощный удар тратился на СЛЕДУЮЩИЙ же верный ответ после
// покупки, даже если это было самое простое задание захода: усиление уходило в
// никуда, а решал за ученика порядок выдачи заданий, а не он сам.
//
// ── Валюта одна: монеты ─────────────────────────────────────────────────
// Мана из механики убрана: два счётчика делали одно и то же.
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
  /** Полный пул здоровья. Пересчитывается раз в час под число учеников. */
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

/**
 * Журнал выданных заданий боя.
 *
 * Три задачи разом, и ни одна не решается без записи на сервере:
 *
 * 1. ПОДБОРКА НЕ ПОВТОРЯЕТСЯ. Слово, которое уже спрашивали, следующий заход
 *    не берёт, а если берёт — берёт ДРУГИМ способом.
 * 2. СЛОЖНОСТЬ НЕ ПОДДЕЛАТЬ. Ставка урона зависит от способа ответа, а способ
 *    выбрал и записал сервер.
 * 3. ПОДСКАЗКА. Правильного ответа у клиента нет вовсе, поэтому частичную
 *    подсказку (убрать неверный вариант, открыть часть букв) собирает сервер по
 *    этой же записи — см. buildRaidHint в api-server/src/lib/raidSession.ts.
 *
 * Здесь же гасится повторная отправка: answered_at заполняется на первом ответе.
 */
export const raidTasksTable = pgTable("raid_tasks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  /** word | grammar. */
  kind: text("kind").notNull(),
  /** Номер слова или номер задания банка грамматики. */
  ref: text("ref").notNull(),
  /** Способ, которым спросили: от него зависят эталон ответа и ставка урона. */
  mode: text("mode").notNull(),
  /** easy | medium | hard — ставка урона, посчитанная при выдаче. */
  difficulty: text("difficulty").notNull(),
  /** Теги задания: по ним считается попадание по слабости босса. */
  tags: jsonb("tags").$type<string[]>(),
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  answeredAt: timestamp("answered_at"),
  correct: boolean("correct"),
}, (t) => [
  index("raid_tasks_user_time_idx").on(t.userId, t.issuedAt),
  index("raid_tasks_user_ref_idx").on(t.userId, t.ref),
]);

/** Боевое состояние ученика. Одна строка на человека, живёт между рейдами. */
export const raidStateTable = pgTable("raid_state", {
  userId: integer("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  /** Энергия: одна единица за задание, +1 за 30 минут, максимум 20. */
  stamina: integer("stamina").notNull().default(20),
  /** От какого момента отсчитывается восстановление. */
  staminaAt: timestamp("stamina_at").notNull().defaultNow(),
  /** Текущая серия верных ответов. Ошибка сбрасывает. */
  combo: integer("combo").notNull().default(0),
  /** Серия без ошибок: по ней капают монеты и снимается «ржавчина». */
  cleanStreak: integer("clean_streak").notNull().default(0),
  /**
   * Мощный удар НАГОТОВЕ: ученик жал кнопку в бою, и следующий верный ответ
   * уйдёт критом. АКТИВАЦИЯ, не покупка: купленный запас лежит в
   * power_stacks и сам не срабатывает.
   */
  powerArmed: boolean("power_armed").notNull().default(false),
  /** Запас мощных ударов в сумке: куплены и ещё не применены. */
  powerStacks: integer("power_stacks").notNull().default(0),
  /** Запас AOE-ударов в сумке. Один применённый даёт пачку усиленных заданий. */
  aoeStock: integer("aoe_stock").notNull().default(0),
  /** Сколько заданий сейчас под удвоением (активное состояние, не запас). */
  aoeLeft: integer("aoe_left").notNull().default(0),
  /** Запас колб полной энергии: применяются вручную, когда закончилась энергия. */
  staminaStock: integer("stamina_stock").notNull().default(0),
  /**
   * Свитки подсказки: один свиток = одна подсказка на задание: лишний
   * неверный вариант убран или открыта часть букв. Полного ответа подсказка
   * не даёт никогда.
   */
  hints: integer("hints").notNull().default(0),
  /** Щит от штрафа за пропуск дней. Пассивный: работает между заходами. */
  shieldUntil: timestamp("shield_until"),
  /** Дебаф «Языковая ржавчина»: урон ниже до этого момента. */
  rustUntil: timestamp("rust_until"),
  /** Множитель урона за победу над боссом (48 часов). */
  boostUntil: timestamp("boost_until"),
  /** Когда ученик последний раз что-то делал: по этому считается пропуск. */
  lastActiveAt: timestamp("last_active_at"),
  /** Монеты события — единственная валюта рейда. */
  coins: integer("coins").notNull().default(0),
  /** День, за который уже выдана монета за вход. */
  bonusDay: date("bonus_day"),
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
export type RaidTaskRow = typeof raidTasksTable.$inferSelect;
export type RaidState = typeof raidStateTable.$inferSelect;
