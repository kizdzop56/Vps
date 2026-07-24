// Идемпотентный сидинг готовых (системных) колод флеш-карточек из офлайн-датасета.
// Безопасно запускать многократно: колода ищется по theme (среди системных,
// ownerId IS NULL); недостающие слова добавляются, существующие не трогаются
// (чтобы не сбрасывать прогресс пользователей через каскад user_card_state).
//
// Вызывается из seed.ts (pnpm seed) и может запускаться самостоятельно.
import { db, decksTable, wordsTable } from "@workspace/db";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { SEED_DECKS } from "./data/flashcards-data";

export async function seedFlashcards(): Promise<void> {
  let decksCreated = 0;
  let wordsAdded = 0;

  for (let i = 0; i < SEED_DECKS.length; i++) {
    const d = SEED_DECKS[i]!;

    // Найти существующую системную колоду с этой темой
    const existing = await db
      .select({ id: decksTable.id })
      .from(decksTable)
      .where(and(eq(decksTable.theme, d.theme), isNull(decksTable.ownerId)));

    let deckId: number;
    if (existing.length > 0) {
      deckId = existing[0]!.id;
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
      .select({ english: wordsTable.english })
      .from(wordsTable)
      .where(eq(wordsTable.deckId, deckId));
    const have = new Set(present.map((w) => w.english.toLowerCase()));

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

  console.log(`  🎴  Flashcards: колод создано ${decksCreated}, слов добавлено ${wordsAdded} (всего колод в датасете ${SEED_DECKS.length}).`);
}
