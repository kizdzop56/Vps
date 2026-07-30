// Офлайн-датасет готовых (системных) колод флеш-карточек.
//
// Датасет разложен по файлам:
//   decks/<тематика>.ts — тематическая колода на каждый уровень CEFR
//                         (собираются конвейером scripts/tools/lexicon,
//                          источники: Oxford, Cambridge, корпуса OPUS);
//   levels.ts           — обзорные колоды «Топ слов и фраз» по уровням.
//
// Здесь всё это сводится в один список. Порядок важен: он задаёт sortOrder
// колод при сидинге, поэтому сначала идут обзорные колоды уровня, затем
// тематические — в том же порядке, в каком темы показываются в приложении.
import type { SeedDeck } from "./types";
import { LEVEL_DECKS } from "./levels";
import { FOOD_DECKS } from "./decks/food";
import { ANIMALS_DECKS } from "./decks/animals";
import { TRANSPORT_DECKS } from "./decks/transport";
import { FAMILY_DECKS } from "./decks/family";
import { HOME_DECKS } from "./decks/home";
import { BODY_HEALTH_DECKS } from "./decks/body_health";
import { WORK_DECKS } from "./decks/work";
import { NATURE_DECKS } from "./decks/nature";
import { TECHNOLOGY_DECKS } from "./decks/technology";
import { TRAVEL_DECKS } from "./decks/travel";
import { IRREGULAR_VERBS_DECKS } from "./decks/irregular_verbs";

export type { SeedWord, SeedDeck } from "./types";

const THEME_DECKS: SeedDeck[] = [
  ...FOOD_DECKS,
  ...ANIMALS_DECKS,
  ...TRANSPORT_DECKS,
  ...FAMILY_DECKS,
  ...HOME_DECKS,
  ...BODY_HEALTH_DECKS,
  ...WORK_DECKS,
  ...NATURE_DECKS,
  ...TECHNOLOGY_DECKS,
  ...TRAVEL_DECKS,
  ...IRREGULAR_VERBS_DECKS,
];

export const SEED_DECKS: SeedDeck[] = [...LEVEL_DECKS, ...THEME_DECKS];
