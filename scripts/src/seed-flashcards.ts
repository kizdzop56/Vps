// Идемпотентный сидинг готовых (системных) колод флеш-карточек из офлайн-датасета.
// Безопасно запускать многократно: колода ищется по theme (среди системных,
// ownerId IS NULL); недостающие слова добавляются, существующие не трогаются
// (чтобы не сбрасывать прогресс пользователей через каскад user_card_state).
//
// Вызывается из seed.ts (pnpm seed) и может запускаться самостоятельно.
import { db, decksTable, wordsTable } from "@workspace/db";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { SEED_DECKS } from "./data/flashcards-data";

// Темы, которые раньше были одной колодой без уровня, а теперь разложены по
// колодам <тема>_<уровень>. На работающей базе такие колоды уже существуют
// вместе с прогрессом учеников, поэтому их не удаляем, а разбираем: каждое
// слово переезжает в колоду своего уровня по той же теме. Строки words
// сохраняют id, значит user_card_state и журнал повторений остаются целыми.
const LEGACY_THEMES = [
  "food", "animals", "transport", "family", "home",
  "body_health", "work", "nature", "technology", "travel", "irregular_verbs",
];

async function migrateLegacyDecks(): Promise<void> {
  let moved = 0;
  let removed = 0;

  for (const theme of LEGACY_THEMES) {
    const [legacy] = await db
      .select({ id: decksTable.id })
      .from(decksTable)
      .where(and(eq(decksTable.theme, theme), isNull(decksTable.ownerId)));
    if (!legacy) continue;

    // куда переселять: колоды этой темы по уровням
    const targets = await db
      .select({ id: decksTable.id, cefrLevel: decksTable.cefrLevel })
      .from(decksTable)
      .where(and(isNull(decksTable.ownerId), inArray(
        decksTable.theme,
        ["a1", "a2", "b1", "b2", "c1", "c2"].map((l) => `${theme}_${l}`),
      )));
    const byLevel = new Map(targets.map((t) => [t.cefrLevel, t.id]));
    if (!byLevel.size) continue;

    const words = await db
      .select({ id: wordsTable.id, english: wordsTable.english, cefrLevel: wordsTable.cefrLevel })
      .from(wordsTable)
      .where(eq(wordsTable.deckId, legacy.id));

    for (const w of words) {
      // Уровень слова известен из старого датасета; если нет — считаем начальным.
      const targetId = byLevel.get(w.cefrLevel ?? "A1") ?? byLevel.get("A1");
      if (!targetId) continue;

      // Если такое слово в целевой колоде уже есть, старую карточку не дублируем:
      // прогресс по ней всё равно привязан к её собственному id, а две одинаковые
      // карточки в одной колоде сбивают повторение.
      const [clash] = await db
        .select({ id: wordsTable.id })
        .from(wordsTable)
        .where(and(eq(wordsTable.deckId, targetId), eq(wordsTable.english, w.english)));
      if (clash) continue;

      await db.update(wordsTable).set({ deckId: targetId }).where(eq(wordsTable.id, w.id));
      moved++;
    }

    const left = await db.select({ id: wordsTable.id }).from(wordsTable).where(eq(wordsTable.deckId, legacy.id));
    if (left.length === 0) {
      await db.delete(decksTable).where(eq(decksTable.id, legacy.id));
      removed++;
    }
  }

  if (moved || removed) {
    console.log(`  ↪️  Миграция старых колод: перенесено слов ${moved}, удалено пустых колод ${removed}.`);
  }
}

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

  // Разбор старых безуровневых колод — только после того, как колоды по уровням
  // уже созданы: словам нужно куда переезжать.
  await migrateLegacyDecks();

  console.log(`  🎴  Flashcards: колод создано ${decksCreated}, слов добавлено ${wordsAdded} (всего колод в датасете ${SEED_DECKS.length}).`);
}
