// ─────────────────────────────────────────────────────────────────────────────
// Режим «Собери предложение»: правила уровня, проверка задания и проверка
// ответа ученика.
//
// ── Почему этот файл важнее генератора ──────────────────────────────────────
// Предложения пишет языковая модель. Значит, между моделью и ребёнком нет
// человека: что сгенерировалось, то и покажется. Модель послушная, но не
// надёжная — она путает местами языки, тащит Present Perfect в A1, пишет
// «Tom drinks beer» и вставляет в пример имя реального человека.
//
// Поэтому решение принято такое: генерация свободная, а ФИЛЬТР строгий и
// механический. Всё, что не проходит проверку, выбрасывается и до экрана не
// доходит. Пустая выдача лучше кривого задания: дырку в выдаче видно сразу и
// она чинится, а неверное правило ребёнок выучит и будет считать нормой.
//
// ── Что этот модуль НЕ умеет ────────────────────────────────────────────────
// Разобрать грамматику регулярными выражениями нельзя. Проверка ловит ЯВНЫЕ
// нарушения по маркерам («have been» на A1), а не строит разбор предложения.
// Это сознательный компромисс, и врать про него не надо: фильтр отсекает
// заметный брак, а не гарантирует безупречность.
//
// Модуль чистый: ни БД, ни express, ни сети. Тесты — sentenceTask.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Уровни, для которых есть задания. C2 нет: его нет и в каталоге слов. */
export type Cefr = "A1" | "A2" | "B1" | "B2" | "C1";

export const CEFR_LEVELS: Cefr[] = ["A1", "A2", "B1", "B2", "C1"];

export function isCefr(value: unknown): value is Cefr {
  return typeof value === "string" && (CEFR_LEVELS as string[]).includes(value);
}

/**
 * Задание одного показа.
 *
 * ru  — русский перевод: по нему ученик собирает фразу;
 * en  — эталон на английском;
 * tokens — плитки для сборки, включая лишние (порядок уже перемешан);
 * note — короткое пояснение к правилу, показывается после ответа.
 */
export type SentenceTask = {
  ru: string;
  en: string;
  tokens: string[];
  note?: string;
};

// ── Правила уровня ──────────────────────────────────────────────────────────

export type LevelRule = {
  /** Границы длины в словах. Единственная величина, которую можно мерить точно. */
  minWords: number;
  maxWords: number;
  /**
   * Конструкции, которых на этом уровне ещё не проходили. Ловятся по маркерам:
   * список заведомо неполный, задача — отсечь явное, а не разобрать язык.
   */
  forbid: { re: RegExp; what: string }[];
  /** Что разрешено — идёт в подсказку модели. Человеку тоже полезно. */
  allow: string;
};

/** Перфект: have/has/had + причастие. Ищем по вспомогательному глаголу. */
const PERFECT = /\b(have|has|had|'ve|'d)\s+(been|had|gone|done|seen|made|written|taken|given|found|come|got|known|[a-z]+ed)\b/i;
/** Пассив: to be + причастие + by. Без «by» слишком много ложных попаданий. */
const PASSIVE = /\b(is|are|was|were|be|been|being)\s+([a-z]+ed|written|taken|made|given|done|built|sent|shown)\s+by\b/i;
/** Условные и сослагательное. */
const CONDITIONAL = /\b(would|could have|should have|unless)\b/i;
/** Косвенная речь: «сказал, что …». */
const REPORTED = /\b(said|told|asked)\s+(that|him|her|them|me|us)\b/i;
/** Придаточные с относительными местоимениями. */
const RELATIVE = /\b(which|whose|whom)\b/i;
/** Продолженное время в прошлом. */
const CONTINUOUS_PAST = /\b(was|were)\s+[a-z]+ing\b/i;

export const LEVEL_RULES: Record<Cefr, LevelRule> = {
  A1: {
    minWords: 3,
    maxWords: 6,
    forbid: [
      { re: PERFECT, what: "Present/Past Perfect" },
      { re: PASSIVE, what: "пассивный залог" },
      { re: CONDITIONAL, what: "условные предложения" },
      { re: REPORTED, what: "косвенная речь" },
      { re: RELATIVE, what: "придаточные с which/whose" },
      { re: CONTINUOUS_PAST, what: "Past Continuous" },
      { re: /\b(if|because|although|while)\b/i, what: "сложные предложения" },
    ],
    allow: "Present Simple, Present Continuous, to be, can, have got. Только простые предложения.",
  },
  A2: {
    minWords: 4,
    maxWords: 9,
    forbid: [
      { re: PERFECT, what: "Present/Past Perfect" },
      { re: PASSIVE, what: "пассивный залог" },
      { re: CONDITIONAL, what: "условные предложения" },
      { re: REPORTED, what: "косвенная речь" },
      { re: RELATIVE, what: "придаточные с which/whose" },
    ],
    allow: "Present Simple, Present Continuous, Past Simple, will и going to, can/must/should, сравнительная степень, because и but.",
  },
  B1: {
    minWords: 5,
    maxWords: 12,
    forbid: [
      { re: PASSIVE, what: "пассивный залог" },
      { re: REPORTED, what: "косвенная речь" },
      { re: /\bcould have\b|\bshould have\b/i, what: "conditional perfect" },
    ],
    allow: "Всё из A2, плюс Present Perfect, Past Continuous, first conditional (if + will), модальные глаголы, инфинитив и герундий.",
  },
  B2: {
    minWords: 6,
    maxWords: 14,
    forbid: [],
    allow: "Все времена, пассивный залог, second и third conditional, косвенная речь, придаточные.",
  },
  C1: {
    minWords: 6,
    maxWords: 18,
    forbid: [],
    allow: "Любые конструкции, включая инверсию, сложные придаточные и идиоматику.",
  },
};

// ── Учебный этикет ──────────────────────────────────────────────────────────
//
// Список запрещённых тем. Он не про цензуру ради цензуры: приложением
// пользуются дети, задания приходят от модели без вычитки, и одно предложение
// про пиво в учебнике английского стоит доверия ко всему продукту.
//
// ── Ложное срабатывание опаснее пропуска ────────────────────────────────────
// Об этом легко не подумать, поэтому пишу прямо. Пропущенное плохое слово
// увидит пользователь и скажет. А выброшенное НОРМАЛЬНОЕ задание не увидит
// никто: заданий просто станет меньше, и виноват будет «плохой генератор».
//
// Отсюда два правила составления списков:
//
// 1. Слово попадает в список, только если оно однозначно про запрещённую тему.
//    Поэтому здесь нет: date (календарная дата, «What is the date today?» —
//    типовая фраза A1), bar («a bar of chocolate»), hit и beat («hit the ball»,
//    «beat the eggs»), police («My father is a police officer» — обычная
//    профессия), toilet («Where is the toilet?» учат все), shut («shut the
//    door»), fat и толстый («толстая книга»), вор (внутри «ворота» и «ворона»),
//    девушка и парень (по-русски это просто молодые люди).
//
// 2. Английские слова ищутся ЦЕЛИКОМ: иначе «gun» находится внутри «begun»,
//    «war» внутри «warm», «kill» внутри «skill».
//
// 3. Русские — по стему, но с ограничением на длину окончания (см.
//    MAX_RU_SUFFIX): «вином» и «вина» ловятся, «виноград» — нет.

const BANNED_EN = [
  // алкоголь, курение, наркотики
  "beer", "wine", "vodka", "whisky", "whiskey", "alcohol", "drunk", "pub",
  "cigarette", "cigarettes", "smoking", "tobacco", "vape", "drug", "drugs",
  // оружие и насилие
  "gun", "guns", "rifle", "pistol", "weapon", "weapons", "bomb", "war",
  "kill", "killed", "kills", "murder", "shoot", "fight", "fighting",
  "suicide", "die", "died", "dead", "death", "funeral", "grave",
  // политика и религия
  "politics", "political", "president", "election", "government", "minister",
  "protest", "revolution", "god", "prayer", "religion", "muslim",
  "christian", "jewish", "bible", "quran",
  // ставки и криминал
  "casino", "gamble", "gambling", "lottery", "steal", "stole", "thief",
  "prison", "jail", "crime", "criminal",
  // интимное
  "sex", "sexy", "kiss", "naked", "nude", "pregnant", "underwear",
  "girlfriend", "boyfriend", "dating", "divorce",
  // оскорбления
  "stupid", "idiot", "ugly", "hate", "disgusting",
];

/**
 * Сколько букв окончания допускается после русского стема.
 *
 * Три — это все падежные и родовые окончания («вином», «вина», «войны»), но
 * уже не корень другого слова: у «виноград» после «вино» стоит «град», четыре
 * буквы.
 */
export const MAX_RU_SUFFIX = 3;

/** Стемы записаны через Е: текст приводится к Е перед поиском. */
const BANNED_RU = [
  "пиво", "пива", "вино", "водка", "водки", "виски", "алкогол", "пьян",
  "сигарет", "курит", "курить", "табак", "наркотик",
  "пистолет", "ружь", "оруж", "бомба", "война", "войны",
  "убил", "убить", "убийств", "стрелял", "драка", "драть", "избил",
  "кровь", "самоубийств", "умер", "смерт", "мертв", "похорон", "могила",
  "политик", "президент", "выборы", "правительств", "министр",
  "протест", "революц", "церкв", "молитв", "религи", "библи", "коран",
  "казино", "лотере", "украл", "воровать", "тюрьм", "преступ",
  "секс", "поцелу", "голый", "беременн", "развод",
  "глупый", "идиот", "дурак", "уродлив", "ненавиж", "ненавид",
];

/**
 * Есть ли в тексте запрещённая тема. Возвращает найденное слово — оно уходит в
 * лог, чтобы было видно, что именно модель делает не так.
 */
export function hasBannedContent(text: string): string | null {
  const lower = text.toLowerCase().replace(/ё/g, "е");
  for (const word of BANNED_EN) {
    if (new RegExp(`\\b${word}\\b`, "i").test(lower)) return word;
  }
  for (const stem of BANNED_RU) {
    // Стем стоит в начале слова, а после него — не больше MAX_RU_SUFFIX букв.
    const re = new RegExp(`(^|[^а-я])${stem}[а-я]{0,${MAX_RU_SUFFIX}}(?![а-я])`, "i");
    if (re.test(lower)) return stem;
  }
  return null;
}

// ── Разбор предложения ──────────────────────────────────────────────────────

/** Слова предложения. */
export function words(sentence: string): string[] {
  return sentence.trim().split(/\s+/).filter(Boolean);
}

export function wordCount(sentence: string): number {
  return words(sentence).length;
}

/**
 * Плитки для сборки: слова предложения с сохранением апострофа внутри (don't,
 * I'm), но без точки в конце — точку ученик не собирает.
 *
 * Запятая остаётся приклеенной к слову: отдельная плитка с запятой выглядит
 * мусором, а поставить её в нужное место всё равно нельзя иначе.
 */
export function tokenize(en: string): string[] {
  return words(en.replace(/[.!?]+\s*$/, ""));
}

/** Собранное учеником предложение в сравнимом виде. */
export function normalizeSentence(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[.,!?;:…"«»()\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Сокращения раскрываем в полную форму.
 *
 * Нужно только для свободного ввода: при сборке из плиток форма задана самими
 * плитками. Ребёнок, написавший «I am» вместо «I'm», ответил верно, и спорить
 * с ним из-за апострофа нельзя.
 */
const CONTRACTIONS: [RegExp, string][] = [
  [/\bi'm\b/g, "i am"],
  [/\b(he|she|it|that|there|who|what)'s\b/g, "$1 is"],
  [/\b(you|we|they)'re\b/g, "$1 are"],
  [/\b(i|you|we|they)'ve\b/g, "$1 have"],
  [/\b(i|you|he|she|it|we|they)'ll\b/g, "$1 will"],
  [/\b(i|you|he|she|it|we|they)'d\b/g, "$1 would"],
  [/\bdon't\b/g, "do not"],
  [/\bdoesn't\b/g, "does not"],
  [/\bdidn't\b/g, "did not"],
  [/\bisn't\b/g, "is not"],
  [/\baren't\b/g, "are not"],
  [/\bwasn't\b/g, "was not"],
  [/\bweren't\b/g, "were not"],
  [/\bcan't\b/g, "can not"],
  [/\bcannot\b/g, "can not"],
  [/\bwon't\b/g, "will not"],
  [/\bhaven't\b/g, "have not"],
  [/\bhasn't\b/g, "has not"],
];

export function expandContractions(value: string): string {
  let out = value;
  for (const [re, to] of CONTRACTIONS) out = out.replace(re, to);
  return out.replace(/\s+/g, " ").trim();
}

/** Два предложения — одно и то же. Апостроф и пунктуация не считаются. */
export function sameSentence(given: string, expected: string): boolean {
  const g = normalizeSentence(given);
  const e = normalizeSentence(expected);
  if (g === e) return true;
  return expandContractions(g) === expandContractions(e);
}

export type SentenceVerdict = {
  correct: boolean;
  /** Первое место, где ответ разошёлся с эталоном (номер слова, с 1). */
  firstWrongWord?: number;
  /** Слова эталона, которых в ответе нет вовсе. */
  missing?: string[];
  /** Лишние слова ответа. */
  extra?: string[];
};

/**
 * Проверка собранного предложения.
 *
 * Возвращает не только «верно/неверно», но и место расхождения: экран
 * подсвечивает первое неверное слово, а не просто говорит «неправильно». Без
 * этого ученик перебирает порядок наугад.
 */
export function checkSentence(given: string, expected: string): SentenceVerdict {
  if (sameSentence(given, expected)) return { correct: true };

  const g = expandContractions(normalizeSentence(given)).split(" ").filter(Boolean);
  const e = expandContractions(normalizeSentence(expected)).split(" ").filter(Boolean);

  let firstWrongWord: number | undefined;
  for (let i = 0; i < Math.max(g.length, e.length); i++) {
    if (g[i] !== e[i]) { firstWrongWord = i + 1; break; }
  }

  const bag = (list: string[]) => {
    const m = new Map<string, number>();
    for (const w of list) m.set(w, (m.get(w) ?? 0) + 1);
    return m;
  };
  const gb = bag(g);
  const eb = bag(e);
  const missing: string[] = [];
  const extra: string[] = [];
  for (const [w, n] of eb) {
    const have = gb.get(w) ?? 0;
    for (let i = have; i < n; i++) missing.push(w);
  }
  for (const [w, n] of gb) {
    const need = eb.get(w) ?? 0;
    for (let i = need; i < n; i++) extra.push(w);
  }

  return { correct: false, firstWrongWord, missing, extra };
}

// ── Проверка задания перед показом ──────────────────────────────────────────

export type TaskCheck = { ok: true } | { ok: false; reason: string };

/** Только латиница, цифры и обычная пунктуация. */
const EN_ONLY = /^[A-Za-z0-9 ,.!?'\-:;]+$/;
/** Кириллица, цифры и пунктуация. */
const RU_ONLY = /^[А-Яа-яЁё0-9 ,.!?'\-:;()«»]+$/;

/**
 * Годится ли задание для показа ученику этого уровня.
 *
 * Порядок проверок от дешёвых к дорогим и от грубых к тонким: сперва поля на
 * месте и на нужном языке, потом этикет, потом длина, потом грамматика, и в
 * самом конце — собираются ли плитки в тот же ответ.
 *
 * Возврат с причиной, а не просто false: причина уходит в лог, и по ней видно,
 * что именно модель делает не так. Молчаливый отказ превратил бы отладку
 * генератора в гадание.
 */
export function validateTask(
  task: { ru?: unknown; en?: unknown; tokens?: unknown; note?: unknown },
  level: Cefr,
): TaskCheck {
  const en = typeof task.en === "string" ? task.en.trim() : "";
  const ru = typeof task.ru === "string" ? task.ru.trim() : "";

  if (!en) return { ok: false, reason: "нет английского предложения" };
  if (!ru) return { ok: false, reason: "нет русского перевода" };

  // Языки местами — самая частая ошибка модели, и её видно сразу.
  if (!EN_ONLY.test(en)) return { ok: false, reason: `в английском поле не латиница: ${en}` };
  if (!RU_ONLY.test(ru)) return { ok: false, reason: `в русском поле не кириллица: ${ru}` };

  // Предложение начинается с заглавной: иначе плитки выдают порядок — первая
  // плитка с большой буквы видна сразу, и собирать не надо.
  if (!/^[A-Z]/.test(en)) return { ok: false, reason: `предложение не с заглавной: ${en}` };

  const banned = hasBannedContent(`${en} ${ru}`);
  if (banned) return { ok: false, reason: `запрещённая тема: ${banned}` };

  const rule = LEVEL_RULES[level];
  const n = wordCount(en);
  if (n < rule.minWords || n > rule.maxWords) {
    return { ok: false, reason: `${n} слов, для ${level} нужно ${rule.minWords}–${rule.maxWords}` };
  }

  for (const f of rule.forbid) {
    if (f.re.test(en)) return { ok: false, reason: `${f.what} не по уровню ${level}: ${en}` };
  }

  // Плитки: если они не складываются в эталон, задание нерешаемо в принципе.
  if (task.tokens !== undefined) {
    if (!Array.isArray(task.tokens)) return { ok: false, reason: "плитки не массив" };
    const tiles = task.tokens.map((t) => String(t));
    const need = tokenize(en);
    const pool = [...tiles];
    for (const w of need) {
      const at = pool.findIndex((t) => t.toLowerCase() === w.toLowerCase());
      if (at < 0) return { ok: false, reason: `среди плиток нет слова «${w}»` };
      pool.splice(at, 1);
    }
  }

  return { ok: true };
}

// ── Лишние плитки ───────────────────────────────────────────────────────────

/**
 * Детерминированный генератор: порядок плиток стабилен для одного сида.
 * Тот же приём, что в wordExercise.ts — иначе задание перетасовывается на
 * каждом обновлении экрана.
 */
export function mulberry32(seed: number): () => number {
  let a = Math.trunc(seed) || 1;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/**
 * Сколько лишних плиток добавлять.
 *
 * Ноль лишних — и задание решается пересбором всего набора: раз все слова
 * нужны, думать над выбором не приходится. Слишком много — экран превращается
 * в поиск среди мусора. Две-четыре держат баланс: выбор есть, поле обозримо.
 */
export function decoyCount(sentenceWords: number): number {
  if (sentenceWords <= 4) return 2;
  if (sentenceWords <= 8) return 3;
  return 4;
}

/**
 * Набор плиток: слова предложения плюс лишние, всё перемешано.
 *
 * Лишние берутся из чужих предложений того же уровня — они на вид такие же,
 * как нужные. Взять их из словаря наугад нельзя: слово другого регистра или
 * другой части речи сразу отсекается на глаз, и лишняя плитка перестаёт
 * работать.
 *
 * Слово, которое уже есть в предложении, лишним не берётся: иначе на поле два
 * одинаковых слова, одно из них «неверное», и ученик получает ошибку за верный
 * ответ, ткнув не в ту плитку.
 */
export function buildTokens(en: string, decoyPool: string[], seed: number): string[] {
  const rng = mulberry32(seed);
  const need = tokenize(en);
  const lower = new Set(need.map((w) => w.toLowerCase()));

  const candidates = shuffle(
    decoyPool.filter((w) => /^[a-z][a-z'\-]*$/i.test(w) && !lower.has(w.toLowerCase())),
    rng,
  );

  const decoys: string[] = [];
  const want = decoyCount(need.length);
  for (const w of candidates) {
    if (decoys.length >= want) break;
    if (decoys.some((d) => d.toLowerCase() === w.toLowerCase())) continue;
    decoys.push(w.toLowerCase());
  }

  return shuffle([...need, ...decoys], rng);
}
