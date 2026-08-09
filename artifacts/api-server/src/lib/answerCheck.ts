// Проверка свободного ответа: письмом и голосом.
//
// Прежние упражнения были только с выбором из четырёх вариантов. Это узнавание:
// ребёнок опознаёт правильный ответ среди чужих, но сам вспомнить слово не
// обязан. Письмо и произношение требуют воспроизведения — а значит, ответ
// свободный, и сравнивать его посимвольно нельзя: «Кот.» и «кот» это один и тот
// же ответ, а отказ его принять учит ребёнка не языку, а аккуратности ввода.
//
// Что считается несущественным:
//   • регистр, пунктуация по краям, двойные пробелы;
//   • ё/е — на клавиатуре ребёнка «ё» часто просто нет;
//   • артикли (a/an/the) и частица to: «to run» и «run» — один ответ;
//   • одна опечатка в словах от MIN_FUZZY_LENGTH букв;
//   • русское окончание: «хорошо» и «хороший» — одно слово в разных формах.
//
// Короткие слова из нечёткого сравнения исключены намеренно: у трёхбуквенных
// одна замена — это обычно другое слово (cat/cut, hat/hot, big/bag), и прощать
// её значит засчитывать неверный ответ.
//
// Модуль чистый (без БД и express) — тесты в answerCheck.test.ts.

/** Со скольких букв прощаем одну опечатку. */
export const MIN_FUZZY_LENGTH = 5;

/** Сколько попыток даётся на произношение, прежде чем ответ считается неверным. */
export const SPEAK_MAX_ATTEMPTS = 3;

/**
 * Приведение ответа к сравнимому виду.
 *
 * Апострофы приводим к одному виду, а не удаляем: в «don't» он несёт смысл, и
 * «dont» — это всё-таки ошибка, которую прощает уже нечёткое сравнение.
 */
export function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/ё/g, "е")
    .replace(/[.,!?;:…"«»()\[\]]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Служебные слова, которые не влияют на правильность ответа.
 *
 * Русские предлоги сюда НЕ входят: «в школе» и «школа» — разные ответы, и
 * карточки-конструкции (in the end, on the wall) именно предлогом и учат.
 */
const OPTIONAL_WORDS = new Set(["a", "an", "the", "to"]);

/** Вариант ответа без артиклей и частицы to. */
export function stripOptionalWords(value: string): string {
  const words = value.split(" ").filter((w) => w && !OPTIONAL_WORDS.has(w));
  return words.length > 0 ? words.join(" ") : value;
}

// ── Форма русского слова ────────────────────────────────────────────────────
//
// ЗАЧЕМ. На карточке good ребёнок написал «хорошо» и получил «Неверно.
// Правильный ответ: хороший». Перевод в карточке верный (good —
// прилагательное), ответ ребёнка тоже верный — не сошлась только форма.
// Прощение одной опечатки здесь не спасало: «хорошо» и «хороший» отличаются на
// две правки.
//
// Русский флективный, и такие пары в каталоге исчисляются сотнями:
// плохой/плохо, быстрый/быстро, красивый/красиво, школа/школе, собака/собаки.
// Каждая — мина: ребёнок отвечает правильно, приложение спорит, слово уходит
// на повторение как невыученное.
//
// КАК. У обоих ответов отбрасывается окончание, и сравниваются основы.
//
// ЦЕНА, названная честно. «Дорога» и «дорогой» дают одну основу — такой ответ
// теперь пройдёт. Это осознанный размен: сказать ребёнку «неверно», когда он
// прав, дороже, чем изредка засчитать соседнее слово. Первое отбивает желание
// отвечать вообще, второе стоит одной неточной карточки.
//
// Два ограничителя не дают правилу расползтись:
//   • отбрасывается РОВНО ОДНО окончание — поэтому «работать» (→ «работа») и
//     «работа» (→ «работ») остаются разными ответами;
//   • основа не короче MIN_STEM_LENGTH — поэтому короткие слова не
//     затрагиваются вовсе: кот/кит, мышь, есть, стол/стул.

/** Короче этого основу не режем: у коротких слов окончание — это само слово. */
export const MIN_STEM_LENGTH = 4;

/**
 * Русские окончания, несущественные при сравнении ответов.
 *
 * Список отсортирован по длине при загрузке модуля: «ими» обязано сработать
 * раньше, чем «и», иначе от слова отрежется не тот кусок.
 */
const RU_ENDINGS: string[] = [
  // глагол: инфинитив, лицо, прошедшее время
  "ться", "тся", "ешь", "ишь", "ете", "ите", "ут", "ют", "ат", "ят",
  "ем", "ет", "ит", "ть", "ла", "ло", "ли", "л",
  // прилагательное и причастие
  "ого", "его", "ому", "ему", "ыми", "ими", "ая", "яя", "ое", "ее",
  "ые", "ие", "ый", "ий", "ой", "ую", "юю", "ым", "им", "ых", "их",
  // существительное: падежи и число
  "ами", "ями", "ах", "ях", "ам", "ям", "ов", "ев", "ей",
  // наречие и одиночные падежные окончания
  "а", "я", "у", "ю", "ы", "и", "е", "о", "ь",
].sort((a, b) => b.length - a.length);

/**
 * Слово целиком записано кириллицей — только такие разбираем по окончаниям.
 *
 * «ё» здесь ради прямых вызовов: в самом приложении слово доезжает сюда уже
 * нормализованным (ё заменена на е), но функция экспортирована, и без этой
 * буквы «ёжик» не считался бы русским словом.
 */
function isCyrillic(word: string): boolean {
  return /^[а-яё-]+$/.test(word);
}

/**
 * Основа русского слова: слово без одного окончания.
 *
 * Нерусское слово возвращается как есть, поэтому для английских ответов
 * сравнение основ вырождается в обычное равенство — и ничего не меняет.
 */
export function stemRu(word: string): string {
  if (!isCyrillic(word)) return word;
  for (const ending of RU_ENDINGS) {
    if (word.length - ending.length >= MIN_STEM_LENGTH && word.endsWith(ending)) {
      return word.slice(0, -ending.length);
    }
  }
  return word;
}

/**
 * Два ответа — одно и то же слово в разных формах.
 *
 * Сравниваем пословно: у ответов из нескольких слов форма должна сойтись у
 * каждого («хорошая погода» против «погоды» — разные ответы).
 */
export function sameStem(given: string, expected: string): boolean {
  const g = given.split(" ");
  const e = expected.split(" ");
  if (g.length !== e.length) return false;
  return g.every((word, i) => stemRu(word) === stemRu(e[i]!));
}

/**
 * Расстояние Левенштейна с ранним выходом: считаем только до предела, дальше
 * точное значение не нужно. Строки коротких слов, поэтому две строки таблицы —
 * достаточно.
 */
export function editDistance(a: string, b: string, limit: number = 1): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0]!;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
      if (curr[j]! < rowMin) rowMin = curr[j]!;
    }
    // Вся строка уже хуже предела — дальше только хуже.
    if (rowMin > limit) return limit + 1;
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[b.length]!;
}

/** Два ответа совпадают с точностью до одной опечатки. */
export function closeEnough(given: string, expected: string): boolean {
  if (given === expected) return true;
  // Опечатку прощаем по длине ОЖИДАЕМОГО ответа: иначе «a» против «and»
  // прошло бы как опечатка короткого ввода.
  if (expected.length < MIN_FUZZY_LENGTH) return false;
  return editDistance(given, expected, 1) <= 1;
}

export type AnswerVerdict = {
  /** Ответ принят. */
  correct: boolean;
  /** Принят с опечаткой — клиент показывает верное написание, но не наказывает. */
  typo: boolean;
  /** На какой из ожидаемых вариантов ответ похож больше всего. */
  matched?: string;
};

/**
 * Проверка письменного ответа.
 *
 * expected — все допустимые варианты: для перевода на русский это ВЕСЬ список
 * translationsRu, а не только первый. Ребёнок, написавший второй по счёту
 * верный перевод, ответил правильно, и спорить с ним нельзя.
 *
 * Порядок проверок важен. Сначала точное совпадение, затем другая форма того же
 * слова, и только потом опечатка: форма слова — это не описка, и помечать её
 * как «почти верно» нельзя. Извиняющаяся формулировка на верном ответе — тот же
 * упрёк, только тише.
 */
export function checkWritten(given: string, expected: string[]): AnswerVerdict {
  const g = normalizeAnswer(given);
  if (!g) return { correct: false, typo: false };

  const gBare = stripOptionalWords(g);
  for (const raw of expected) {
    const e = normalizeAnswer(raw);
    if (!e) continue;
    if (g === e) return { correct: true, typo: false, matched: raw };
    if (gBare === stripOptionalWords(e)) return { correct: true, typo: false, matched: raw };
  }
  for (const raw of expected) {
    const e = normalizeAnswer(raw);
    if (!e) continue;
    if (sameStem(gBare, stripOptionalWords(e))) {
      return { correct: true, typo: false, matched: raw };
    }
  }
  for (const raw of expected) {
    const e = normalizeAnswer(raw);
    if (!e) continue;
    if (closeEnough(g, e) || closeEnough(gBare, stripOptionalWords(e))) {
      return { correct: true, typo: true, matched: raw };
    }
  }
  return { correct: false, typo: false };
}

export type SpeechVerdict = AnswerVerdict & {
  /** Попытки ещё остались — клиент просит сказать слово снова. */
  retry: boolean;
  /** Сколько попыток осталось после этой. */
  attemptsLeft: number;
};

/**
 * Проверка произношения по расшифровке распознавания речи.
 *
 * Распознавание — не эталон: детский голос, микрофон телефона и шум комнаты
 * дают осечки на ровном месте. Поэтому, во-первых, опечатку прощаем как и в
 * письме, во-вторых, за одну неудачу ответ неверным не считаем: даётся
 * SPEAK_MAX_ATTEMPTS попытки, и только после них слово уходит на повтор.
 */
export function checkSpoken(
  transcript: string,
  expected: string[],
  attempt: number,
  maxAttempts: number = SPEAK_MAX_ATTEMPTS,
): SpeechVerdict {
  const verdict = checkWritten(transcript, expected);
  const used = Math.max(1, Math.round(attempt));
  const attemptsLeft = Math.max(0, maxAttempts - used);

  if (verdict.correct) return { ...verdict, retry: false, attemptsLeft };
  // Попытки не кончились — это ещё не ошибка, а просьба повторить.
  return { ...verdict, retry: attemptsLeft > 0, attemptsLeft };
}
