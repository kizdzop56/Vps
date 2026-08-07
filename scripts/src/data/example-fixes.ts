// Ручные правки карточек-слов: примеры употребления, части речи, транскрипция.
//
// Зачем отдельный слой. Каталог слов (vocabulary-{level}.ts) автогенерирован
// (repack-vocabulary.ts / reclassify-vocabulary.ts), поэтому любая правка внутри
// него живёт до следующего прогона генератора. Примеры там взяты из Викисловаря
// по значению, которое не всегда совпадает со значением карточки — ровно та
// проблема, о которой предупреждает WORDS.md: перевод от одного значения,
// пример от другого. Отсюда четыре вида брака:
//
//   1. примера нет вовсе (exEn/exRu — пустые строки);
//   2. пример не про то значение: spring «весна» → пример про вывих,
//      lemon «лимон» → про плохую машину;
//   3. пример нельзя показывать ребёнку: tea → про марихуану, sad → про
//      наркотики, town → про пистолеты, bad → про похищение детей;
//   4. производная форма получила пример базового слова: карточка breathing
//      «дыхание» показывала предложение про рыб и жабры.
//
// Пятый случай — слово с двумя ходовыми значениями — этим слоем не лечится: там
// проблема не в примере, а в самой карточке, которая учит одному переводу из
// двух. Такие слова живут словосочетаниями, см. polysemous.ts.
//
// Правки собираются руками, батчами, по одному файлу на уровень, и
// накладываются поверх датасета при сидинге (см. seed-flashcards.ts).
// Генератор их не затирает.
//
// Правила заполнения — в шапке example-fixes-a1.ts.
// Проверка покрытия: pnpm validate:examples

import type { SeedDeck } from "./flashcards-data";
import { A1_FIXES } from "./example-fixes-a1";
import { A2_FIXES } from "./example-fixes-a2";
import { B1_FIXES } from "./example-fixes-b1";

export type ExampleFix = {
  exEn?: string;
  exRu?: string;
  pos?: string;
  ipa?: string;
};

// Ключ — само слово, а не пара «слово + уровень»: одно и то же слово встречается
// в нескольких уровневых колодах (downstairs есть и в A1, и в A2) с одинаково
// сломанным примером, и правка должна доехать до всех копий. Из-за этого ключи
// между файлами уровней не должны пересекаться — при слиянии дубликат молча
// перетёрся бы. За этим следит pnpm validate:examples.
export const EXAMPLE_FIXES: Record<string, ExampleFix> = {
  ...A1_FIXES,
  ...A2_FIXES,
  ...B1_FIXES,
};

export function fixFor(en: string): ExampleFix | undefined {
  return EXAMPLE_FIXES[en.trim().toLowerCase()];
}

// Накладывает правки на датасет. Возвращает новые объекты: исходные литералы
// из vocabulary-{level}.ts не мутируются, чтобы генератор и тесты видели файлы
// такими, какие они на диске.
export function applyExampleFixes(decks: SeedDeck[]): SeedDeck[] {
  return decks.map((deck) => ({
    ...deck,
    words: deck.words.map((w) => {
      const fix = fixFor(w.en);
      if (!fix) return w;
      return {
        ...w,
        pos: fix.pos ?? w.pos,
        ipa: fix.ipa ?? w.ipa,
        exEn: fix.exEn ?? w.exEn,
        exRu: fix.exRu ?? w.exRu,
      };
    }),
  }));
}
