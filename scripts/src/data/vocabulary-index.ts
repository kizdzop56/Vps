// АВТОГЕНЕРИРОВАНО: scripts/src/import-vocabulary.ts
// Собирает все сгенерированные vocabulary-{level}.ts в один массив,
// подключаемый в flashcards-data.ts (SEED_DECKS).
import type { SeedDeck } from "./flashcards-data";
import a1Decks from "./vocabulary-a1";
import a2Decks from "./vocabulary-a2";
import b1Decks from "./vocabulary-b1";
import b2Decks from "./vocabulary-b2";
import c1Decks from "./vocabulary-c1";

export const VOCAB_DECKS: SeedDeck[] = [...a1Decks, ...a2Decks, ...b1Decks, ...b2Decks, ...c1Decks];
