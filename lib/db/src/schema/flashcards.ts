// ─────────────────────────────────────────────────────────────────────────────
// Флеш-карточки для изучения слов (в стиле DuoCards) + CEFR placement-тест.
//
//   decks               — колоды (готовые системные + собственные пользователя)
//   words               — слова/карточки внутри колоды
//   user_card_state     — состояние карточки у пользователя (интервальное повторение)
//   placement_results   — результаты теста определения уровня (CEFR)
//   flashcard_settings  — настройки пользователя (дневная норма, уровень, флаг теста)
//   review_log          — журнал повторений (для статистики по дням)
// ─────────────────────────────────────────────────────────────────────────────
import { pgTable, text, serial, integer, timestamp, boolean, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Колода слов. ownerId = null → готовая (системная/библиотечная) колода, которую
// ученик не редактирует. ownerId задан → собственная колода пользователя.
export const decksTable = pgTable("decks", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  theme: text("theme"),                    // ключ темы: food/animals/transport/...
  description: text("description"),
  emoji: text("emoji"),                    // иконка колоды
  isSystem: boolean("is_system").notNull().default(false),
  cefrLevel: text("cefr_level"),           // для колод «Топ-слова A1/A2/...»
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Слово (карточка). Все данные офлайн: перевод(ы), транскрипция, пример EN+RU.
export const wordsTable = pgTable("words", {
  id: serial("id").primaryKey(),
  deckId: integer("deck_id").notNull().references(() => decksTable.id, { onDelete: "cascade" }),
  english: text("english").notNull(),
  partOfSpeech: text("part_of_speech"),
  translationsRu: jsonb("translations_ru").notNull().$type<string[]>(),
  ipa: text("ipa"),                        // транскрипция, напр. /ˈæpəl/
  exampleEn: text("example_en"),
  exampleRu: text("example_ru"),
  cefrLevel: text("cefr_level"),
  audioUrl: text("audio_url"),             // обычно null → озвучка через Web Speech API
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Состояние карточки у пользователя — ядро интервального повторения.
// memoryLevel 0–5: чем выше, тем длиннее интервал до следующего показа.
export const userCardStateTable = pgTable("user_card_state", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  wordId: integer("word_id").notNull().references(() => wordsTable.id, { onDelete: "cascade" }),
  memoryLevel: integer("memory_level").notNull().default(0),
  dueAt: timestamp("due_at").notNull().defaultNow(),
  introduced: boolean("introduced").notNull().default(false), // прошло ли знакомство/ввод в обучение
  timesSeen: integer("times_seen").notNull().default(0),
  timesCorrect: integer("times_correct").notNull().default(0),
  lastResult: text("last_result"),         // "know" | "dont"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("user_word_unique").on(t.userId, t.wordId)]);

// Результат placement-теста (CEFR). Первый вход ученика → тест → сюда.
export const placementResultsTable = pgTable("placement_results", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  cefrLevel: text("cefr_level").notNull(), // A1..C2
  answers: jsonb("answers").$type<number[]>(),
  takenAt: timestamp("taken_at").notNull().defaultNow(),
});

// Настройки раздела карточек у пользователя (одна строка на пользователя).
export const flashcardSettingsTable = pgTable("flashcard_settings", {
  userId: integer("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  dailyNewLimit: integer("daily_new_limit").notNull().default(12),
  placementLevel: text("placement_level"), // текущий CEFR-уровень (кэш последнего теста)
  placementDone: boolean("placement_done").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Журнал повторений — для графиков статистики (выучено по дням, % правильных).
export const reviewLogTable = pgTable("review_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  wordId: integer("word_id").notNull().references(() => wordsTable.id, { onDelete: "cascade" }),
  result: text("result").notNull(),        // "know" | "dont"
  memoryLevelAfter: integer("memory_level_after"),
  reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
});

// Назначение колоды ученику учителем. Учитель создаёт свою колоду (ownerId =
// учитель) и «отправляет» её ученику — появляется строка здесь. Ученик видит
// назначенные колоды в своём списке наравне с системными/собственными.
// assignedBy храним отдельно от owner — на будущее (кто именно назначил).
export const deckAssignmentsTable = pgTable("deck_assignments", {
  id: serial("id").primaryKey(),
  deckId: integer("deck_id").notNull().references(() => decksTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  assignedBy: integer("assigned_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [unique("deck_assignment_unique").on(t.deckId, t.studentId)]);

export const insertDeckSchema = createInsertSchema(decksTable).omit({ id: true, createdAt: true });
export const insertWordSchema = createInsertSchema(wordsTable).omit({ id: true, createdAt: true });
export type InsertDeck = z.infer<typeof insertDeckSchema>;
export type InsertWord = z.infer<typeof insertWordSchema>;
export type Deck = typeof decksTable.$inferSelect;
export type Word = typeof wordsTable.$inferSelect;
export type UserCardState = typeof userCardStateTable.$inferSelect;
export type PlacementResult = typeof placementResultsTable.$inferSelect;
export type FlashcardSettings = typeof flashcardSettingsTable.$inferSelect;
export type ReviewLog = typeof reviewLogTable.$inferSelect;
export type DeckAssignment = typeof deckAssignmentsTable.$inferSelect;
