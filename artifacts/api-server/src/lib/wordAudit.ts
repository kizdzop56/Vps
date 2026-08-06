// ─────────────────────────────────────────────────────────────────────────────
// Аудит словарных данных: чистые функции без БД и сети.
//
// Проблема, ради которой модуль появился: в каталоге нашлись карточки, где
// пример-предложение не содержит самого изучаемого слова. Для ученика это хуже,
// чем отсутствие примера: он читает фразу как образец употребления и запоминает
// не то значение. Такие данные надо уметь находить пачкой и не показывать в
// приложении.
//
// Проверок две, и вторая важнее первой:
//
//   1. Слово вообще есть в примере (exampleMentionsWord) — грубый фильтр.
//   2. Пример в ТОМ ЖЕ значении, что и перевод карточки (exampleSenseMatches).
//      Первая проверка пропускает худший класс ошибок: «tie» переведено как
//      «галстук», а пример — «tie score» про ничью в игре. Слово на месте,
//      значение чужое, и ребёнок учит по такой карточке ерунду.
//
// Здесь только правила распознавания. Запросы к БД, словарю и перевод — в
// wordAuditRun.ts, maintenance/auditWords.ts и routes/maintenance.ts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Итог проверки.
 *
 *   "yes"   — всё сходится;
 *   "maybe" — судить нельзя (неправильная форма, слишком короткое слово,
 *             нет данных): помечаем, но НЕ удаляем;
 *   "no"    — расхождение доказано.
 *
 * Различие между "maybe" и "no" — главное в модуле. Ошибка в сторону "no"
 * стирает нормальные данные, и это дороже, чем пропустить плохую карточку.
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
 * Список намеренно порождающий, а не словарный: нам нужен не морфологический
 * разбор, а защита от ложных срабатываний. Лишняя форма в списке в худшем
 * случае пропустит плохой пример, недостающая — удалит хороший. Из двух ошибок
 * вторая дороже.
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

// ── Значение примера ────────────────────────────────────────────────────────

/** Минимальная длина основы для сравнения: короче — слишком много ложных совпадений. */
const RU_STEM = 5;

/**
 * Русский глагол в инфинитиве? У них при спряжении меняется сама основа
 * («бежать» → «бежит»), и вывести её правилом нельзя — такие случаи мы не
 * судим.
 */
function looksLikeVerb(word: string): boolean {
  return /(ться|тись|ть|ти|чь)$/.test(word);
}

/**
 * Основа русского слова для сравнения с текстом: отрезаем хвост, который
 * меняется в падежах и числах. Точность здесь не нужна, нужна устойчивость:
 * «яблоко» и «яблоки» должны сойтись, «галстук» и «счёт» — нет.
 */
export function ruStem(word: string): string {
  const clean = normalizeRu(word);
  if (clean.length <= RU_STEM) return clean;
  return clean.slice(0, Math.max(RU_STEM, clean.length - 3));
}

/**
 * Пример показывает ТО ЖЕ значение слова, что и перевод карточки?
 *
 * Проверка идёт со стороны русского: если карточка учит слову «галстук», в
 * переводе примера обязан быть галстук. Пример «tie score» → «ничейный счёт»
 * формально содержит слово tie, но учит другому значению — именно это и надо
 * поймать, английская сторона тут бессильна.
 *
 * Сравниваем по основе, иначе падежи и числа пойдут за расхождение. Глаголы
 * и короткие слова не судим: у первых меняется сама основа, у вторых основа
 * слишком куцая, чтобы что-то доказывать.
 */
export function exampleSenseMatches(
  translationsRu: string[],
  exampleRu: string | null | undefined,
): ExampleVerdict {
  const text = normalizeRu(exampleRu ?? "");
  if (!text) return "maybe"; // перевода примера нет — сравнивать не с чем

  const words = translationsRu
    .flatMap((t) => normalizeRu(t).split(/[\s,;/]+/))
    .filter(Boolean);
  if (words.length === 0) return "maybe";

  for (const word of words) {
    if (text.includes(ruStem(word))) return "yes";
  }

  // Ни одно значение не нашлось. Обвинять можно, только если хотя бы одно слово
  // перевода поддаётся сравнению: не глагол и достаточно длинное.
  const judgeable = words.some((w) => !looksLikeVerb(w) && w.length >= RU_STEM);
  return judgeable ? "no" : "maybe";
}
