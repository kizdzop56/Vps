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
//   • одна опечатка в словах от MIN_FUZZY_LENGTH букв.
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
