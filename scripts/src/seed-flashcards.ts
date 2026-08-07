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
import { applyExampleFixes, fixFor } from "./data/example-fixes";
import { applyPolysemous, isAmbiguous } from "./data/polysemous";

// Ручные тематические колоды (flashcards-data.ts) + колоды, наполненные
// импортёром реального словаря (scripts/src/import-vocabulary.ts). Импортёр
// пишет в отдельные vocabulary-{level}.ts именно затем, чтобы не раздувать
// flashcards-data.ts до неуправляемого размера.
//
// Сверху накладываются два слоя ручной работы. Каталог автогенерирован, внутри
// него правки не живут — их затрёт следующий прогон генератора:
//   example-fixes.ts — исправленные примеры, части речи, транскрипции;
//   polysemous.ts    — многозначные слова: одиночная карточка убирается, каждый
//                      смысл заводится отдельным словосочетанием.
// Порядок важен: сначала правим то, что в каталоге есть, потом убираем
// одиночные карточки многозначных слов и добавляем фразы.
const {
  decks: ALL_DECKS,
  problems: PHRASE_PROBLEMS,
  removed: AMBIGUOUS_DROPPED,
  added: PHRASES_ADDED,
} = applyPolysemous(applyExampleFixes([...SEED_DECKS, ...VOCAB_DECKS]));

export async function seedFlashcards(): Promise<void> {
  let decksCreated = 0;
  let wordsAdded = 0;
  let emojiFilled = 0;
  let examplesFixed = 0;
  let ambiguousRemoved = 0;

  // Карточка, которая не доехала до базы, ничему не научит, а заметить это по
  // приложению почти невозможно — поэтому говорим вслух.
  for (const problem of PHRASE_PROBLEMS) {
    console.warn(`  ⚠️  Flashcards: карточка-фраза не добавлена — ${problem}`);
  }

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
          hidden: d.hidden ?? false,
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
          hidden: d.hidden ?? false,
          sortOrder: i,
        })
        .returning({ id: decksTable.id });
      deckId = row!.id;
      decksCreated++;
    }

    // Какие слова уже есть в колоде — не дублируем
    const rows = await db
      .select({
        id: wordsTable.id,
        english: wordsTable.english,
        emoji: wordsTable.emoji,
        partOfSpeech: wordsTable.partOfSpeech,
        ipa: wordsTable.ipa,
        exampleEn: wordsTable.exampleEn,
        exampleRu: wordsTable.exampleRu,
      })
      .from(wordsTable)
      .where(eq(wordsTable.deckId, deckId));

    // Одиночные карточки многозначных слов, оставшиеся от прежних прогонов.
    // Оставить их нельзя: карточка «chest» учит одному переводу из двух, и
    // рядом с фразами это ещё и путает. Удаление каскадом уносит прогресс
    // учеников ПО ЭТИМ карточкам (user_card_state) — другие слова не задеты,
    // но потеря настоящая, поэтому перечисляем слова вслух.
    const obsolete = rows.filter((w) => isAmbiguous(w.english));
    if (obsolete.length > 0) {
      await db.delete(wordsTable).where(inArray(wordsTable.id, obsolete.map((w) => w.id)));
      ambiguousRemoved += obsolete.length;
      console.warn(
        `  ⚠️  Flashcards: из колоды "${d.theme}" удалены одиночные карточки многозначных слов (прогресс по ним сброшен): ${obsolete.map((w) => w.english).join(", ")}`,
      );
    }

    const present = rows.filter((w) => !isAmbiguous(w.english));
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

    // Ручные правки примеров — та же история, что с картинками: слово уже лежит
    // в базе, а сид существующие слова не обновляет, поэтому исправленный пример
    // сам собой не доедет. Пишем только поля, которые правка задаёт явно, и
    // только когда значение действительно отличается: прогресс ученика
    // (user_card_state) живёт в отдельной таблице и не задевается.
    for (const row of present) {
      const fix = fixFor(row.english);
      if (!fix) continue;

      const patch: Partial<{
        partOfSpeech: string;
        ipa: string;
        exampleEn: string;
        exampleRu: string;
      }> = {};
      if (fix.pos !== undefined && row.partOfSpeech !== fix.pos) patch.partOfSpeech = fix.pos;
      if (fix.ipa !== undefined && row.ipa !== fix.ipa) patch.ipa = fix.ipa;
      if (fix.exEn !== undefined && row.exampleEn !== fix.exEn) patch.exampleEn = fix.exEn;
      if (fix.exRu !== undefined && row.exampleRu !== fix.exRu) patch.exampleRu = fix.exRu;
      if (Object.keys(patch).length === 0) continue;

      await db.update(wordsTable).set(patch).where(eq(wordsTable.id, row.id));
      examplesFixed++;
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

  console.log(`  🎴  Flashcards: колод создано ${decksCreated}, слов добавлено ${wordsAdded}, картинок проставлено ${emojiFilled}, примеров исправлено ${examplesFixed}, устаревших колод удалено ${stale.length} (всего колод в датасете ${ALL_DECKS.length}).`);
  console.log(`  🔀  Многозначные слова: одиночных карточек убрано из датасета ${AMBIGUOUS_DROPPED}, добавлено словосочетаний ${PHRASES_ADDED}, удалено из базы ${ambiguousRemoved}.`);
}
