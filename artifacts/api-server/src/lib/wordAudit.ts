// ─────────────────────────────────────────────────────────────────────────────
// Аудит словарных данных: чистые функции без БД и сети.
//
// Проблема, ради которой модуль появился: в каталоге нашлись карточки, где
// перевод не соответствует слову, а пример-предложение либо отсутствует, либо
// показывает чужое значение. Для ученика это хуже пустоты: он читает фразу как
// образец употребления и запоминает не то.
//
// ── Чего этот модуль НЕ делает ──────────────────────────────────────────────
// Не считает машинный перевод истиной. Две вещи ломают такую логику начисто:
//
//   • ИДИОМЫ. «A piece of cake» — это «проще простого», а машина переводит
//     «кусок торта». Сравнив человеческий перевод с машинным, проверка объявит
//     ошибкой ПРАВИЛЬНЫЙ перевод и заменит его дословной чушью. Поэтому
//     словосочетания (isPhrase) никогда не правятся автоматически — только
//     помечаются на ручную проверку.
//
//   • МНОГОЗНАЧНОСТЬ. У «tie» есть и галстук, и ничья, и «связывать». Сравнение
//     с одним «главным» переводом объявляет ошибкой любое другое значение,
//     хотя все они верные. Поэтому сверяемся со ВСЕМ списком значений слова
//     (translationMatches принимает варианты), и перевод считается ошибочным,
//     только если не совпал ни с одним.
//
// Здесь только правила распознавания. Сеть (перевод, словарь) — в
// wordAuditRun.ts, запросы к БД — в maintenance/auditWords.ts и
// routes/maintenance.ts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Итог проверки.
 *
 *   "yes"   — всё сходится;
 *   "maybe" — судить нельзя (идиома, неправильная форма, короткое слово, нет
 *             данных): помечаем, но НЕ трогаем;
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
 * Словосочетание, а не отдельное слово.
 *
 * Главный признак «здесь может быть идиома»: у устойчивых выражений смысл не
 * складывается из слов, и машинный перевод им не судья. Инфинитивное «to»
 * словосочетанием не делает — «to buy» это обычный глагол.
 */
export function isPhrase(english: string): boolean {
  return stripInfinitive(english).includes(" ");
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
 * Сравнение русских переводов «по сути»: регистр, ё/е и дефисы не должны
 * считаться расхождением.
 */
export function normalizeRu(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^а-я\s-]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Разбить перевод на отдельные слова: «костюм, комплект» → [костюм, комплект]. */
function ruWords(value: string): string[] {
  return normalizeRu(value).split(/[\s,;/]+/).filter(Boolean);
}

/** Два русских слова — про одно и то же? Общий корень от 5 букв покрывает падежи. */
function sameRuWord(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5);
}

/**
 * Совпадает ли хоть один из ЗНАЧЕНИЙ слова с хоть одним сохранённым переводом.
 *
 * Ключевое здесь — «хоть один». У многозначного слова несколько верных
 * переводов: «tie» это и галстук, и ничья, и «связывать». Если сравнивать
 * сохранённый перевод с одним лишь «главным» вариантом от Google, то любое
 * другое верное значение выглядит ошибкой. Поэтому на вход идёт весь список
 * значений (см. wordSenses в @workspace/translate), и расхождением считается
 * только полное непопадание.
 *
 * Точного равенства строк мало: «костюм» и «костюм, комплект» — один ответ,
 * а «иск» и «костюм» — разные. Сверяем по отдельным словам и общему корню.
 */
export function translationMatches(fresh: string | string[], stored: string[]): boolean {
  const senses = (Array.isArray(fresh) ? fresh : [fresh]).flatMap(ruWords);
  if (senses.length === 0) return true; // переводов не получили — обвинять нечего

  for (const item of stored) {
    for (const word of ruWords(item)) {
      for (const sense of senses) {
        if (sameRuWord(word, sense)) return true;
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
 * («бежать» → «бежит»), и вывести её правилом нельзя — такие случаи не судим.
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
 * Сравниваем по основе, иначе падежи и числа пойдут за расхождение. Не судим
 * три случая: идиомы (в переводе примера дословного смысла может не быть
 * вовсе), глаголы (меняется основа) и короткие слова (основа слишком куцая,
 * чтобы что-то доказывать).
 */
export function exampleSenseMatches(
  translationsRu: string[],
  exampleRu: string | null | undefined,
  opts: { phrase?: boolean } = {},
): ExampleVerdict {
  if (opts.phrase) return "maybe"; // идиому по словам не проверить

  const text = normalizeRu(exampleRu ?? "");
  if (!text) return "maybe"; // перевода примера нет — сравнивать не с чем

  const words = translationsRu.flatMap(ruWords);
  if (words.length === 0) return "maybe";

  for (const word of words) {
    if (text.includes(ruStem(word))) return "yes";
  }

  // Ни одно значение не нашлось. Обвинять можно, только если хотя бы одно слово
  // перевода поддаётся сравнению: не глагол и достаточно длинное.
  const judgeable = words.some((w) => !looksLikeVerb(w) && w.length >= RU_STEM);
  return judgeable ? "no" : "maybe";
}
