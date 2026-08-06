// ─────────────────────────────────────────────────────────────────────────────
// Аудит словарных данных: чистые функции без БД и сети.
//
// Проблема, ради которой модуль появился: в каталоге нашлись карточки, где
// перевод не соответствует слову, а пример-предложение либо отсутствует, либо
// показывает чужое значение. Для ученика это хуже пустоты: он читает фразу как
// образец употребления и запоминает не то.
//
// ── Главное правило ─────────────────────────────────────────────────────────
// Ошибка в сторону «no» стирает нормальные данные. Это дороже, чем пропустить
// плохую карточку, поэтому во всех сомнительных случаях модуль обязан отвечать
// "maybe". Проверено на живых данных: первая версия резала «кухня» из «на
// кухне» и «дикий» из «дикие», потому что сравнивала обрезки слов по длине.
//
// ── Чего этот модуль НЕ делает ──────────────────────────────────────────────
// Не считает машинный перевод истиной. Две вещи ломают такую логику начисто:
//
//   • ИДИОМЫ. «A piece of cake» — это «проще простого», а машина переводит
//     «кусок торта». Сравнив человеческий перевод с машинным, проверка объявит
//     ошибкой ПРАВИЛЬНЫЙ перевод. Поэтому словосочетания (isPhrase) никогда не
//     правятся автоматически — только помечаются на ручную проверку.
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
 */
export type ExampleVerdict = "yes" | "maybe" | "no";

/**
 * Слова, которые в английском меняются не по правилам: форму не вывести
 * суффиксом. Список длинный намеренно — каждое пропущенное слово превращается
 * в ложное «в примере нет слова» и стирает нормальный пример.
 */
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
  "grow", "grew", "grown", "sit", "sat", "stand", "stood",
  "lose", "lost", "meet", "met", "pay", "paid", "put",
  "send", "sent", "spend", "spent", "win", "won",
  "wear", "wore", "worn", "sleep", "slept", "hold", "held",
  "understand", "understood", "fall", "fell", "fallen",
  "feed", "fed", "fly", "flew", "flown", "forget", "forgot", "forgotten",
  "hear", "heard", "hide", "hid", "hit", "hurt", "let",
  "lie", "lay", "lend", "lent", "light", "lit", "mean", "meant",
  "ride", "rode", "ring", "rang", "rise", "rose", "sell", "sold",
  "shine", "shone", "shoot", "shot", "show", "shown", "shut",
  "sing", "sang", "sink", "sank", "swim", "swam",
  "throw", "threw", "thrown", "wake", "woke", "cut", "cost",
  "build", "built", "burn", "burnt", "deal", "dealt", "dig", "dug",
  "draw", "drew", "drive", "drove", "driven",
  "child", "children", "man", "men", "woman", "women", "person", "people",
  "foot", "feet", "tooth", "teeth", "mouse", "mice", "goose", "geese",
]);

/** Служебные слова фразы: их отсутствие в примере ничего не доказывает. */
const STOP_WORDS = new Set([
  "a", "an", "the", "to", "of", "in", "on", "at", "up", "out", "off",
  "for", "with", "by", "from", "into", "over", "down", "away", "back",
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
 * случае пропустит плохой пример, недостающая — удалит хороший.
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

/** Нашлась ли хоть одна форма слова среди слов текста. */
function hasAnyForm(word: string, tokens: Set<string>): boolean {
  for (const form of wordForms(word)) {
    if (tokens.has(form)) return true;
  }
  return false;
}

/**
 * Есть ли изучаемое слово в примере-предложении.
 *
 * Одиночное слово ищем по словам текста, а не подстрокой: подстрока дала бы
 * ложное «да» на art внутри start.
 *
 * Фразу сначала пробуем найти целиком, а если не вышло — по частям, каждую со
 * своими формами. Целиком её искать недостаточно: «grow up» в примере
 * «I grew up in a small village» стоит в прошедшем времени, и дословного
 * совпадения нет. Служебные слова (up, of, the) при разборе игнорируем — их
 * отсутствие ничего не доказывает.
 *
 * Неправильный глагол или слово из двух букв переводят вердикт в "maybe":
 * форму мы вывести не могли, значит и обвинять не вправе.
 */
export function exampleMentionsWord(english: string, example: string | null | undefined): ExampleVerdict {
  const base = stripInfinitive(english);
  const text = normalizeText(example ?? "");
  if (!base || !text) return "maybe"; // нечего проверять — не наш случай

  const tokens = new Set(text.split(" "));

  if (!base.includes(" ")) {
    if (hasAnyForm(base, tokens)) return "yes";
    if (IRREGULAR.has(base) || base.length <= 2) return "maybe";
    return "no";
  }

  // ── Фраза ─────────────────────────────────────────────────────────────────
  if (text.includes(base)) return "yes";

  const parts = base.split(" ").filter((p) => p && !STOP_WORDS.has(p));
  if (parts.length === 0) return "maybe"; // фраза из одних служебных слов

  let unsure = false;
  for (const part of parts) {
    if (hasAnyForm(part, tokens)) continue;
    if (IRREGULAR.has(part) || part.length <= 2) { unsure = true; continue; }
    return "no";
  }
  return unsure ? "maybe" : "yes";
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
  return normalizeRu(value).split(/[\s,;/-]+/).filter(Boolean);
}

/**
 * Окончания русских слов, от длинных к коротким. Порядок обязателен: сначала
 * пробуем отрезать «ами», иначе «а» съест только последнюю букву и основы
 * «яблоками» и «яблоко» не сойдутся.
 */
const RU_ENDINGS = [
  "иями", "ями", "ами", "ому", "ему", "ого", "его", "ыми", "ими",
  "ей", "ой", "ый", "ий", "ая", "яя", "ое", "ее", "ые", "ие",
  "ах", "ях", "ам", "ям", "ов", "ев", "ом", "ем", "ую", "юю",
  "а", "я", "о", "е", "ы", "и", "у", "ю", "ь", "й",
];

/** Минимальная длина основы: на огрызке короче доказать ничего нельзя. */
const MIN_STEM = 4;

/**
 * Основа русского слова: отрезаем окончание, которое меняется в падежах,
 * числах и роде.
 *
 * Раньше здесь была обрезка по длине (первые пять букв), и она проваливалась
 * ровно там, где нужна: «кухня» не находилась в «на кухне», «дикий» в «дикие»,
 * «стена» в «на стене» — слова короткие, резать было нечего. Из-за этого
 * нормальные примеры объявлялись негодными и стирались.
 *
 * Точность морфологии здесь не нужна, нужна устойчивость: одинаковые слова в
 * разных формах должны давать одну основу, разные слова — разные.
 */
export function ruStem(word: string): string {
  const clean = normalizeRu(word);
  for (const ending of RU_ENDINGS) {
    if (clean.length - ending.length >= MIN_STEM && clean.endsWith(ending)) {
      return clean.slice(0, -ending.length);
    }
  }
  return clean;
}

/** Два русских слова — про одно и то же? Сравниваем по основе. */
function sameRuWord(a: string, b: string): boolean {
  if (a === b) return true;
  const sa = ruStem(a);
  const sb = ruStem(b);
  // Основа короче минимума ничего не доказывает: требуем точного совпадения.
  if (sa.length < MIN_STEM || sb.length < MIN_STEM) return a === b;
  return sa === sb;
}

/**
 * Совпадает ли хоть одно ЗНАЧЕНИЕ слова с хоть одним сохранённым переводом.
 *
 * Ключевое здесь — «хоть одно». У многозначного слова несколько верных
 * переводов: «tie» это и галстук, и ничья, и «связывать». Если сравнивать
 * сохранённый перевод с одним лишь «главным» вариантом от Google, то любое
 * другое верное значение выглядит ошибкой. Поэтому на вход идёт весь список
 * значений (см. wordSenses в @workspace/translate), и расхождением считается
 * только полное непопадание.
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

/**
 * Русский глагол в инфинитиве? У них при спряжении меняется сама основа
 * («бежать» → «бежит»), и вывести её правилом нельзя — такие случаи не судим.
 */
function looksLikeVerb(word: string): boolean {
  return /(ться|тись|ть|ти|чь)$/.test(word);
}

/**
 * Пример показывает ТО ЖЕ значение слова, что и перевод карточки?
 *
 * Проверка идёт со стороны русского: если карточка учит слову «галстук», в
 * переводе примера обязан быть галстук. Пример «tie score» → «ничейный счёт»
 * формально содержит слово tie, но учит другому значению — именно это и надо
 * поймать, английская сторона тут бессильна.
 *
 * Сравниваем по основам ОТДЕЛЬНЫХ СЛОВ текста, а не подстрокой: подстрока
 * находила бы «дом» внутри «домкрата». Не судим четыре случая: идиомы (в
 * переводе примера дословного смысла может не быть вовсе), глаголы (меняется
 * основа), короткие слова и составные переводы вроде «приём пищи» — в живой
 * фразе такое почти никогда не стоит целиком.
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

  const tokens = text.split(/[\s,;/-]+/).filter(Boolean);
  for (const word of words) {
    for (const token of tokens) {
      if (sameRuWord(word, token)) return "yes";
    }
  }

  // Ни одно значение не нашлось. Обвинять можно, только если хотя бы одно слово
  // перевода поддаётся сравнению: не глагол и достаточно длинное.
  const judgeable = words.some((w) => !looksLikeVerb(w) && ruStem(w).length >= MIN_STEM);
  return judgeable ? "no" : "maybe";
}
