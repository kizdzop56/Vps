// Идемпотентный сидинг готовых (системных) колод флеш-карточек из офлайн-датасета.
// Безопасно запускать многократно: колода ищется по theme (среди системных,
// ownerId IS NULL); недостающие слова добавляются, существующие не трогаются
// (чтобы не сбрасывать прогресс пользователей через каскад user_card_state).
//
// Вызывается из seed.ts (pnpm seed) и может запускаться самостоятельно.
import { db, decksTable, wordsTable } from "@workspace/db";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { SEED_DECKS, emojiFor } from "./data/flashcards-data";
import { VOCAB_DECKS } from "./data/vocabulary-index";

// Ручные тематические колоды (flashcards-data.ts) + колоды, наполненные
// импортёром реального словаря (scripts/src/import-vocabulary.ts). Импортёр
// пишет в отдельные vocabulary-{level}.ts именно затем, чтобы не раздувать
// flashcards-data.ts до неуправляемого размера.
const ALL_DECKS = [...SEED_DECKS, ...VOCAB_DECKS];

export async function seedFlashcards(): Promise<void> {
  let decksCreated = 0;
  let wordsAdded = 0;
  let emojiFilled = 0;

  for (let i = 0; i < ALL_DECKS.length; i++) {
    const d = ALL_DECKS[i]!;

    // Найти существующую системную колоду с этой темой
    const existing = await db
      .select({ id: decksTable.id })
      .from(decksTable)
      .where(and(eq(decksTable.theme, d.theme), isNull(decksTable.ownerId)));

    let deckId: number;
    if (existing.length > 0) {
      deckId = existing[0]!.id;
      // Колода уже существует — подтягиваем метаданные из датасета. Нужно потому,
      // что уровень (cefrLevel), название, описание и порядок могут появиться или
      // измениться уже после того, как колода была создана на работающей базе
      // (без этого группировка по уровням не увидит старые колоды). Слова при
      // этом НЕ трогаются, поэтому прогресс учеников (user_card_state) сохраняется.
      await db
        .update(decksTable)
        .set({
          title: d.title,
          description: d.description,
          emoji: d.emoji,
          cefrLevel: d.cefrLevel ?? null,
          sortOrder: i,
        })
        .where(eq(decksTable.id, deckId));
    } else {
      const [row] = await db
        .insert(decksTable)
        .values({
          ownerId: null,
          title: d.title,
          theme: d.theme,
          description: d.description,
          emoji: d.emoji,
          isSystem: true,
          cefrLevel: d.cefrLevel ?? null,
          sortOrder: i,
        })
        .returning({ id: decksTable.id });
      deckId = row!.id;
      decksCreated++;
    }

    // Какие слова уже есть в колоде — не дублируем
    const present = await db
      .select({ id: wordsTable.id, english: wordsTable.english, emoji: wordsTable.emoji })
      .from(wordsTable)
      .where(eq(wordsTable.deckId, deckId));
    const have = new Set(present.map((w) => w.english.toLowerCase()));

    // Картинки-подсказки для слов, которые уже лежат в базе: карта эмодзи
    // появилась позже самих слов, поэтому на работающей базе (Render) их нужно
    // дозаполнить — иначе картинку увидят только новые колоды. Сами слова и
    // прогресс учеников (user_card_state) при этом не трогаются.
    for (const row of present) {
      const emoji = emojiFor(row.english);
      if (!emoji || row.emoji === emoji) continue;
      await db.update(wordsTable).set({ emoji }).where(eq(wordsTable.id, row.id));
      emojiFilled++;
    }

    const toInsert = d.words
      .filter((w) => !have.has(w.en.toLowerCase()))
      .map((w, idx) => ({
        deckId,
        english: w.en,
        partOfSpeech: w.pos,
        translationsRu: w.ru,
        ipa: w.ipa,
        exampleEn: w.exEn,
        exampleRu: w.exRu,
        cefrLevel: w.cefr,
        emoji: emojiFor(w.en) ?? null,
        sortOrder: idx,
      }));

    if (toInsert.length > 0) {
      // порциями, чтобы не упереться в лимит параметров
      for (let j = 0; j < toInsert.length; j += 100) {
        await db.insert(wordsTable).values(toInsert.slice(j, j + 100));
      }
      wordsAdded += toInsert.length;
    }
  }

  // Удаление устаревших системных колод (например, старые «Топ-слова A2 (N/16)»
  // после пересборки датасета на другое число колод/уровней). Раньше сид только
  // добавлял — колоды, которых больше нет в ALL_DECKS, навсегда оставались в БД.
  // Удаляем ТОЛЬКО системные колоды (ownerId IS NULL): пользовательские и
  // назначенные ученикам колоды всегда принадлежат конкретному ownerId и сюда
  // не попадают ни при каких условиях.
  const currentThemes = new Set(ALL_DECKS.map((d) => d.theme));
  const systemDecks = await db
    .select({ id: decksTable.id, theme: decksTable.theme, title: decksTable.title })
    .from(decksTable)
    .where(isNull(decksTable.ownerId));
  const stale = systemDecks.filter((d) => !d.theme || !currentThemes.has(d.theme));

  if (stale.length > 0) {
    console.log(`  🗑️  Flashcards: найдено ${stale.length} устаревших системных колод к удалению:`);
    for (const d of stale) console.log(`      - theme="${d.theme}" title="${d.title}" (id=${d.id})`);

    await db.delete(decksTable).where(inArray(decksTable.id, stale.map((d) => d.id)));

    console.log(
      `  🗑️  Flashcards: удалено ${stale.length} устаревших системных колод: ${stale.map((d) => d.theme ?? `id:${d.id}`).join(", ")}.`,
    );
  }

  console.log(`  🎴  Flashcards: колод создано ${decksCreated}, слов добавлено ${wordsAdded}, картинок проставлено ${emojiFilled}, устаревших колод удалено ${stale.length} (всего колод в датасете ${ALL_DECKS.length}).`);
}
