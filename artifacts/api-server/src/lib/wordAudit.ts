// ─────────────────────────────────────────────────────────────────────────────
// Аудит словарных данных: чистые функции без БД и сети.
//
// Проблема, ради которой модуль появился: в каталоге нашлись карточки, где
// пример-предложение не содержит самого изучаемого слова. Для ученика это хуже,
// чем отсутствие примера: он читает фразу как образец употребления и запоминает
// не то значение. Такие данные надо уметь находить пачкой и не показывать в
// приложении.
//
// Здесь только правила распознавания. Запросы к БД и перевод — в
// ../maintenance/auditWords.ts и routes/flashcards.ts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Итог проверки примера.
 *
 *   "yes"   — слово в примере точно есть (в той или иной форме);
 *   "maybe" — совпадения нет, но у слова неправильная форма или оно короткое,
 *             поэтому судить нельзя: такой пример помечаем, но не удаляем;
 *   "no"    — слова в примере нет, и объяснить это формой нельзя.
 */
export type ExampleVerdict = "yes" | "maybe" | "no";

/** Слова, которые в английском меняются не по правилам: форму не вывести суффиксом. */
const IRREGULAR = new Set([
  "be", "am", "is", "are", "was", "were", "been", "being",
  "have", "has", "had", "do", "does", "did", "done",
  "go", "went", "gone", "make", "made", "take", "took", "taken",
  "come", "came", "see", "saw", "seen", "get", "got", "gotten",
  "give", "gave", "given", "know", "knew", "known", "think", "thought",
  "say", "said", "tell", "told", "find", "found", "leave", "left",
  "feel", "felt", "keep", "kept", "bring", "brought", "buy", "bought",
  "catch", "caught", "teach", "taught", "eat", "ate", "eaten",
  "drink", "drank", "drunk", "run", "ran", "write", "wrote", "written",
  "read", "speak", "spoke", "spoken", "break", "broke", "broken",
  "choose", "chose", "chosen", "begin", "began", "begun",
  "child", "children", "man", "men", "woman", "women", "person", "people",
  "foot", "feet", "tooth", "teeth", "mouse", "mice", "goose", "geese",
]);

/** Привести к сравнимому виду: нижний регистр, только буквы, одиночные пробелы. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’‘']/g, "")       // don't → dont, чтобы апостроф не рвал слово
    .replace(/[^a-zа-яё]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Убрать служебную частицу инфинитива: в каталоге слова лежат как «to buy». */
export function stripInfinitive(english: string): string {
  const normalized = normalizeText(english);
  return normalized.startsWith("to ") ? normalized.slice(3) : normalized;
}

/**
 * Все формы слова, которые считаем тем же словом.
 *
 * Список намеренно порождающий, а не словарный: нам нужно не идеальное
 * морфологическое разбор, а защита от ложных срабатываний. Лишняя форма в
 * списке в худшем случае пропустит плохой пример, недостающая — удалит хороший.
 * Из двух ошибок вторая дороже.
 */
export function wordForms(english: string): string[] {
  const base = stripInfinitive(english);
  if (!base) return [];
  const forms = new Set<string>([base]);

  const last = base.at(-1) ?? "";
  const prev = base.at(-2) ?? "";

  forms.add(`${base}s`);
  forms.add(`${base}es`);
  forms.add(`${base}ed`);
  forms.add(`${base}d`);
  forms.add(`${base}ing`);
  forms.add(`${base}er`);
  forms.add(`${base}est`);

  // study → studies / studied; play → plays (гласная перед y правило не меняет)
  if (last === "y" && !"aeiou".includes(prev)) {
    const stem = base.slice(0, -1);
    forms.add(`${stem}ies`);
    forms.add(`${stem}ied`);
    forms.add(`${stem}ier`);
    forms.add(`${stem}iest`);
  }

  // make → making, write → writing (немая e отпадает)
  if (last === "e") {
    const stem = base.slice(0, -1);
    forms.add(`${stem}ing`);
    forms.add(`${stem}ed`);
  }

  // run → running, stop → stopped (удвоение конечной согласной)
  if (base.length >= 3 && !"aeiouy".includes(last) && "aeiou".includes(prev)) {
    forms.add(`${base}${last}ing`);
    forms.add(`${base}${last}ed`);
    forms.add(`${base}${last}er`);
  }

  return [...forms];
}

/**
 * Есть ли изучаемое слово в примере-предложении.
 *
 * Фразу («take care of») ищем целиком подстрокой: разбирать её по формам
 * бессмысленно. Одиночное слово ищем по токенам — подстрока дала бы ложное
 * «да» на art внутри start.
 *
 * Когда совпадения нет, различаем два случая. Если слово неправильное (go, be,
 * child) или совсем короткое, форму мы вывести не могли — это "maybe", такой
 * пример нельзя удалять автоматом. Во всех остальных случаях — "no".
 */
export function exampleMentionsWord(english: string, example: string | null | undefined): ExampleVerdict {
  const base = stripInfinitive(english);
  const text = normalizeText(example ?? "");
  if (!base || !text) return "maybe"; // нечего проверять — не наш случай

  if (base.includes(" ")) {
    return text.includes(base) ? "yes" : "no";
  }

  const tokens = new Set(text.split(" "));
  for (const form of wordForms(base)) {
    if (tokens.has(form)) return "yes";
  }

  // Слово могло войти в составное через дефис: «well-being» → «well being».
  if (text.split(" ").some((t) => t === base)) return "yes";

  if (IRREGULAR.has(base) || base.length <= 2) return "maybe";
  return "no";
}

/** Пример годен к показу: либо слово в нём есть, либо судить мы не беремся. */
export function exampleIsUsable(english: string, example: string | null | undefined): boolean {
  if (!example) return false;
  return exampleMentionsWord(english, example) !== "no";
}

// ── Переводы ────────────────────────────────────────────────────────────────

/**
 * Сравнение русских переводов «по сути»: регистр, ё/е, частица «то» и
 * возвратное «ся» не должны считаться расхождением.
 */
export function normalizeRu(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^а-я\s-]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Совпадает ли свежий перевод хоть с одним из сохранённых.
 *
 * Точного равенства мало: «костюм» и «костюм, комплект» — один и тот же ответ,
 * а «иск» и «костюм» — разные. Поэтому сверяем по отдельным словам перевода и
 * дополнительно допускаем общий корень длиной от 5 букв (падежи: «костюма»).
 */
export function translationMatches(fresh: string, stored: string[]): boolean {
  const target = normalizeRu(fresh);
  if (!target) return true; // перевода не получили — обвинять нечего

  const targetWords = new Set(target.split(/[\s,;/]+/).filter(Boolean));

  for (const item of stored) {
    const candidate = normalizeRu(item);
    if (!candidate) continue;
    if (candidate === target) return true;

    for (const word of candidate.split(/[\s,;/]+/).filter(Boolean)) {
      if (targetWords.has(word)) return true;
      for (const t of targetWords) {
        const shared = Math.min(word.length, t.length);
        if (shared >= 5 && word.slice(0, 5) === t.slice(0, 5)) return true;
      }
    }
  }
  return false;
}
