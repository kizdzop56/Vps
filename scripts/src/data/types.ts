// Типы офлайн-датасета флеш-карточек.
//
// Датасет разложен по файлам: scripts/src/data/decks/<тематика>.ts — колоды
// тематик на каждый уровень CEFR (собираются конвейером scripts/tools/lexicon),
// scripts/src/data/levels.ts — обзорные колоды «Топ слов» и «Фразы» по уровням.
// Всё вместе собирается в scripts/src/data/flashcards-data.ts.

export type SeedWord = {
  en: string;
  pos: string;          // part of speech: noun/verb/adj/...
  ru: string[];         // переводы
  ipa: string;          // транскрипция
  exEn: string;         // пример на английском
  exRu: string;         // перевод примера
  cefr: string;         // A1..C2
};

export type SeedDeck = {
  theme: string;        // стабильный ключ
  title: string;        // рус. название
  emoji: string;
  description: string;
  cefrLevel?: string;   // для колод «Топ-слова A1/...»
  words: SeedWord[];
};
