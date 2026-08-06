// ─────────────────────────────────────────────────────────────────────────────
// Английский Викисловарь как источник значений слова.
//
// Чем он отличается от всего, что пробовали раньше. У Викисловаря переводы
// привязаны К КОНКРЕТНОМУ ЗНАЧЕНИЮ, а не к слову целиком:
//
//   tie (noun)
//     • «A necktie…»                     → ru: галстук
//     • «The situation in which two or
//        more participants… placed
//        equally»                        → ru: ничья
//        пример: «It's two outs in the bottom of the ninth, tie score.»
//
// Отсюда сразу два вывода.
//
// Первый: по карточке «tie = галстук» мы можем НАЙТИ нужное значение — то, у
// которого русский перевод «галстук», — и взять пример именно из него. Ни
// машинного перевода, ни догадок о морфологии для этого не нужно.
//
// Второй: видно, откуда взялся баг в каталоге. Фраза про «tie score» — это
// дословно пример Викисловаря для значения «ничья». Импортёр брал примеры, не
// глядя на значение, и приклеил его к карточке про галстук.
//
// ── Какой вопрос словарю задавать можно, а какой нельзя ─────────────────────
// МОЖНО: «есть ли значение, чей перевод совпадает с переводом карточки?»
// Совпадение — это факт, и на нём можно строить выводы (findSense).
//
// НЕЛЬЗЯ: «верен ли перевод карточки?» Русские переводы в Викисловаре
// заполнены ВЫБОРОЧНО: у популярных значений есть, у прочих пусто, синонимы
// перечислены не полностью. Отсутствие совпадения — это незнание, а не
// доказательство ошибки.
//
// Такая функция здесь была (verdictFor), и отчёт на её основе помечал почти
// каждую карточку. Функция удалена намеренно, чтобы никто не построил на ней
// проверку заново.
//
// Данные отдаёт freedictionaryapi.com: тот же Викисловарь, но разобранный в
// JSON, без ключа и регистрации. Лицензия CC BY-SA 4.0.
// ─────────────────────────────────────────────────────────────────────────────

/** Одно значение слова: толкование, примеры и переводы именно этого значения. */
export type WordSense = {
  /** Толкование по-английски. */
  definition: string;
  /** Часть речи: noun, verb, adjective, adverb… */
  partOfSpeech: string;
  /** Примеры употребления ИМЕННО этого значения. */
  examples: string[];
  /** Русские переводы этого значения, без знаков ударения. */
  translationsRu: string[];
};

type ApiTranslation = { language?: { code?: unknown }; word?: unknown };
type ApiSense = {
  definition?: unknown;
  examples?: unknown;
  translations?: ApiTranslation[];
};
type ApiEntry = {
  language?: { code?: unknown };
  partOfSpeech?: unknown;
  senses?: ApiSense[];
};
type ApiResponse = { entries?: ApiEntry[] };

/**
 * Убрать знаки ударения из русского слова.
 *
 * В Викисловаре переводы записаны с ударением: «ку́хня», «гла́вный». Это
 * комбинирующий символ U+0301 — на вид его нет, но при сравнении строк он
 * рушит всё. Заодно приводим ё к е и убираем регистр: для сверки с карточкой
 * эти различия несущественны.
 */
export function cleanRu(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // все комбинирующие диакритики, включая ударение
    .normalize("NFC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim();
}

/** Слово для запроса: «to buy» ищем как «buy». */
function lookupForm(english: string): string {
  return english.trim().toLowerCase().replace(/^to\s+/, "");
}

/**
 * Загрузить все значения английского слова.
 *
 * Пустой массив — слова нет в словаре или сеть подвела. Отличать эти случаи
 * незачем: в обоих мы просто ничего не знаем и ничего не трогаем.
 */
export async function fetchSenses(english: string): Promise<WordSense[]> {
  const word = lookupForm(english);
  if (!word) return [];

  const url = new URL(
    `https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(word)}`,
  );
  url.searchParams.set("translations", "true");

  let data: ApiResponse;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return [];
    data = (await response.json()) as ApiResponse;
  } catch {
    return [];
  }

  const senses: WordSense[] = [];

  for (const entry of data.entries ?? []) {
    // В ответе бывают статьи других языков (то же написание в шведском и т.п.).
    if (entry.language?.code !== "en") continue;
    const partOfSpeech = typeof entry.partOfSpeech === "string" ? entry.partOfSpeech : "";

    for (const sense of entry.senses ?? []) {
      const definition = typeof sense.definition === "string" ? sense.definition.trim() : "";
      if (!definition) continue;

      const examples = Array.isArray(sense.examples)
        ? sense.examples.filter((e): e is string => typeof e === "string" && e.trim().length > 0)
        : [];

      const translationsRu: string[] = [];
      for (const t of sense.translations ?? []) {
        if (t?.language?.code !== "ru") continue;
        const word = typeof t.word === "string" ? cleanRu(t.word) : "";
        if (word && !translationsRu.includes(word)) translationsRu.push(word);
      }

      senses.push({ definition, partOfSpeech, examples, translationsRu });
    }
  }

  return senses;
}

/**
 * Найти значение, которому соответствует перевод карточки.
 *
 * Сравнение ТОЧНОЕ (после снятия ударений и приведения регистра). Это
 * сознательный отказ от «умного» сравнения: любые попытки сопоставлять русские
 * слова по основе уже приводили к тому, что проверка объявляла ошибкой
 * нормальные карточки. Лучше честно не найти совпадение, чем найти неверное.
 *
 * Не нашли — значит просто не знаем, какое из значений имелось в виду. Никаких
 * выводов о правильности перевода из этого не следует (см. шапку файла).
 *
 * Перевод карточки может быть списком («галстук, узел») — проверяем каждый
 * вариант отдельно.
 */
export function findSense(senses: WordSense[], translationsRu: string[]): WordSense | null {
  const wanted = new Set(
    translationsRu.flatMap((t) => t.split(/[,;/]/).map(cleanRu)).filter(Boolean),
  );
  if (wanted.size === 0) return null;

  for (const sense of senses) {
    for (const t of sense.translationsRu) {
      if (wanted.has(t)) return sense;
    }
  }
  return null;
}

/**
 * Пример употребления для нужного значения.
 *
 * Берём короткий: длинные цитаты из книг (в словаре они лежат отдельно, в
 * quotes, но и среди examples попадаются развесистые) ребёнок не дочитает.
 */
export function exampleFromSense(sense: WordSense): string | null {
  const usable = sense.examples
    .map((e) => e.trim())
    .filter((e) => e.length >= 10 && e.length <= 120)
    // Примеры вида «Oxford ties; Derby ties» — это перечисление, не предложение.
    .filter((e) => !e.includes(";"));
  if (usable.length === 0) return null;
  return [...usable].sort((a, b) => a.length - b.length)[0] ?? null;
}
