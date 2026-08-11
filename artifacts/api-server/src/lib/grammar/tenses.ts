// ─────────────────────────────────────────────────────────────────────────────
// Времена английского языка: правила, формулы и РАЗБОР ОШИБКИ.
//
// ── Почему здесь не просто правила ──────────────────────────────────────────
// Показать правило целиком после ошибки — почти то же, что не показать ничего.
// Ученик это правило уже читал и всё равно ошибся; повторное чтение того же
// абзаца ничего не добавит. Работает другое: назвать его СОБСТВЕННУЮ ошибку
// («ты забыл -s в третьем лице»), а правило дать следом, как обоснование.
//
// Этим занимается diagnose(): она сравнивает ответ с верным и распознаёт
// типовые промахи. Если промах не распознан, остаётся общее правило — но это
// последняя строчка, а не первая.
//
// ── Уровни ──────────────────────────────────────────────────────────────────
// Расставлены по школьной программе: Present Simple и Present Continuous на A1,
// Past Simple, Future Simple и Past Continuous на A2, Present Perfect на B1.
// Ученик A1 не должен получить задание на Present Perfect — это тест.
//
// Про Past Continuous отдельно: сперва он стоял на B1 рядом с перфектом, и
// ученик A2 его не видел вовсе. Это неверно. Прошедшее длительное вводится
// сразу за Past Simple («I was reading when he called»), а по конструкции оно
// проще перфекта: was/were плюс -ing, без третьей формы. Present Perfect на B1
// остаётся: там трудность не в форме, а в том, когда это время вообще уместно.
// ─────────────────────────────────────────────────────────────────────────────

import { verbByBase, type CefrLevel } from "./verbs";

export type TenseId =
  | "present_simple"
  | "present_continuous"
  | "past_simple"
  | "future_simple"
  | "present_perfect"
  | "past_continuous";

export type Tense = {
  id: TenseId;
  /** Название так, как его называет учебник. */
  title: string;
  /** Русское имя: ребёнок ищет глазами именно его. */
  titleRu: string;
  level: CefrLevel;
  /** Формула утверждения — короткая строка, её видно на карточке режима. */
  formula: string;
  /** Когда используется. Два-три пункта, не лекция. */
  usage: string[];
  /** Слова-маркеры: по ним время узнаётся в тексте. */
  markers: string[];
  /** Правило целиком — показывается в разборе после указания на ошибку. */
  rule: string;
};

export const TENSES: Tense[] = [
  {
    id: "present_simple",
    title: "Present Simple",
    titleRu: "Простое настоящее",
    level: "A1",
    formula: "I work · He works",
    usage: [
      "привычки и то, что повторяется: I go to school every day",
      "общие факты: water boils at 100 degrees",
      "расписания: the train leaves at six",
    ],
    markers: ["always", "usually", "often", "sometimes", "never", "every day", "on Mondays"],
    rule:
      "Глагол стоит в первой форме. Но с he, she, it добавляется -s: I work, но he works. " +
      "После -s, -sh, -ch, -x, -o добавляется -es: he watches, she goes. " +
      "Если слово кончается на согласную + y, то y меняется на i и добавляется -es: study → he studies. " +
      "В отрицании и вопросе появляется do/does, и тогда -s уходит к нему: he does not work, does he work?",
  },
  {
    id: "present_continuous",
    title: "Present Continuous",
    titleRu: "Настоящее длительное",
    level: "A1",
    formula: "I am working · He is working",
    usage: [
      "действие идёт прямо сейчас: I am reading a book",
      "временная ситуация: she is living with her aunt this month",
      "договорённость на будущее: we are meeting at five",
    ],
    markers: ["now", "right now", "at the moment", "today", "Look!", "Listen!"],
    rule:
      "Форма собирается из двух частей: be в нужном лице плюс глагол с -ing. " +
      "be выбирается по подлежащему: I am, he/she/it is, we/you/they are. " +
      "Обе части обязательны: без be получается не время, а просто -ing. " +
      "Немая -e на конце пропадает: make → making. Короткое слово с одной гласной удваивает согласную: run → running, sit → sitting.",
  },
  {
    id: "past_simple",
    title: "Past Simple",
    titleRu: "Простое прошедшее",
    level: "A2",
    formula: "I worked · I went",
    usage: [
      "законченное действие в прошлом: I saw him yesterday",
      "цепочка событий: she came in, sat down and opened the book",
      "привычка в прошлом: we played football every summer",
    ],
    markers: ["yesterday", "last week", "two days ago", "in 2010", "when I was small"],
    rule:
      "У правильных глаголов добавляется -ed: work → worked. У неправильных своя вторая форма, её надо помнить: go → went, see → saw. " +
      "Важно: в отрицании и вопросе стоит did, а сам глагол возвращается в ПЕРВУЮ форму — I did not go, did you go? " +
      "Вторая форма и did вместе не используются никогда.",
  },
  {
    id: "past_continuous",
    title: "Past Continuous",
    titleRu: "Прошедшее длительное",
    level: "A2",
    formula: "I was working · They were working",
    usage: [
      "действие шло в определённый момент прошлого: at seven I was having dinner",
      "длинное действие прервано коротким: I was reading when he called",
      "фон для рассказа: the sun was shining and birds were singing",
    ],
    markers: ["at that moment", "while", "when", "all day yesterday", "at five o'clock"],
    rule:
      "was или were плюс глагол с -ing. was — с I, he, she, it; were — с we, you, they. " +
      "Часто встречается в паре с Past Simple: длинное действие в Past Continuous, короткое, которое его прервало, — в Past Simple. " +
      "I was walking home when I met her.",
  },
  {
    id: "future_simple",
    title: "Future Simple",
    titleRu: "Простое будущее",
    level: "A2",
    formula: "I will work",
    usage: [
      "решение, принятое в момент речи: I will help you",
      "предсказание: it will rain tomorrow",
      "обещание: I will not tell anyone",
    ],
    markers: ["tomorrow", "next week", "in two days", "soon", "I think", "probably"],
    rule:
      "will плюс первая форма глагола, и одинаково для всех лиц: I will go, he will go. " +
      "После will никогда не бывает ни -s, ни -ed, ни второй формы. " +
      "Отрицание — will not (won't).",
  },
  {
    id: "present_perfect",
    title: "Present Perfect",
    titleRu: "Настоящее совершённое",
    level: "B1",
    formula: "I have worked · He has worked",
    usage: [
      "результат важен сейчас, а когда — не важно: I have lost my keys",
      "опыт за всю жизнь: she has been to Japan",
      "действие продолжается до сих пор: we have lived here for ten years",
    ],
    markers: ["already", "just", "yet", "ever", "never", "for", "since", "recently"],
    rule:
      "have или has плюс ТРЕТЬЯ форма глагола: I have seen, he has seen. has — только с he, she, it. " +
      "Ключевое отличие от Past Simple: здесь не называется точное время. " +
      "Поэтому yesterday, last week и ago с этим временем не сочетаются — с ними нужен Past Simple. " +
      "Зато already, just, yet, ever, never, for и since — его собственные слова.",
  },
];

const BY_ID = new Map(TENSES.map((t) => [t.id, t]));

export function tenseById(id: string): Tense | undefined {
  return BY_ID.get(id as TenseId);
}

// ── Разбор ошибки ───────────────────────────────────────────────────────────

export type Diagnosis = {
  /** Что именно сделано не так. Одна фраза, без «возможно» и «кажется». */
  headline: string;
  /** Пояснение к этой конкретной ошибке. */
  detail: string;
};

const BE_FORMS = new Set(["am", "is", "are", "was", "were", "be", "been", "being"]);

function words(value: string): string[] {
  return value.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Распознать типовой промах.
 *
 * Возвращает null, если ошибка не опознана — тогда клиент показывает общее
 * правило времени. Придумывать объяснение наугад нельзя: неверный разбор хуже
 * отсутствия разбора, потому что ученик ему поверит.
 *
 * @param given    что написал ученик
 * @param expected верный ответ (первый допустимый вариант)
 * @param tense    время задания
 * @param base     первая форма глагола, если задание про конкретный глагол
 */
export function diagnose(
  given: string,
  expected: string,
  tense: Tense,
  base?: string,
): Diagnosis | null {
  const g = words(given);
  const e = words(expected);
  if (g.length === 0) return null;

  const gs = g.join(" ");
  const es = e.join(" ");
  if (gs === es) return null;

  const verb = base ? verbByBase(base) : undefined;

  // ── Present Simple: третье лицо ──────────────────────────────────────────
  if (tense.id === "present_simple") {
    // Ученик написал первую форму там, где нужна форма на -s.
    if (es === `${gs}s` || es === `${gs}es`) {
      return {
        headline: "Забыто -s в третьем лице",
        detail:
          `С he, she и it глагол в Present Simple получает окончание: не «${gs}», а «${es}». ` +
          "Это единственное место, где глагол меняется в этом времени, поэтому его и забывают чаще всего.",
      };
    }
    // Обратная ошибка: -s там, где его быть не должно.
    if (gs === `${es}s` || gs === `${es}es`) {
      return {
        headline: "Лишнее -s",
        detail:
          `Окончание -s ставится только с he, she, it. Здесь подлежащее другое, поэтому глагол остаётся в первой форме: «${es}».`,
      };
    }
    // Вместо настоящего — прошедшее.
    if (verb && verb.past.includes(gs)) {
      return {
        headline: "Это вторая форма, то есть прошедшее время",
        detail:
          `«${gs}» — это ${verb.base} в прошедшем времени. Здесь речь о том, что происходит обычно, а не о прошлом, поэтому нужна форма «${es}».`,
      };
    }
  }

  // ── Present / Past Continuous: две части формы ───────────────────────────
  if (tense.id === "present_continuous" || tense.id === "past_continuous") {
    const hasBe = g.some((w) => BE_FORMS.has(w));
    const hasIng = g.some((w) => w.endsWith("ing"));

    if (hasIng && !hasBe) {
      return {
        headline: "Пропущен глагол be",
        detail:
          `Одного -ing недостаточно: время собирается из двух частей. Нужно «${es}». ` +
          (tense.id === "present_continuous"
            ? "be выбирается по подлежащему: I am, he/she/it is, we/you/they are."
            : "was — с I, he, she, it; were — с we, you, they."),
      };
    }
    if (hasBe && !hasIng) {
      return {
        headline: "Пропущено окончание -ing",
        detail: `be на месте, но сам глагол должен стоять с -ing: «${es}».`,
      };
    }
    // Перепутаны формы be при верном -ing.
    const gBe = g.find((w) => BE_FORMS.has(w));
    const eBe = e.find((w) => BE_FORMS.has(w));
    if (gBe && eBe && gBe !== eBe && hasIng) {
      return {
        headline: `Не та форма be: нужно ${eBe}, а не ${gBe}`,
        detail:
          tense.id === "present_continuous"
            ? "am идёт только с I, is — с he, she, it, are — с we, you, they."
            : "was идёт с I, he, she, it, а were — с we, you, they. Правильно: «" + es + "».",
      };
    }
  }

  // ── Past Simple ──────────────────────────────────────────────────────────
  if (tense.id === "past_simple" && verb) {
    if (gs === verb.base) {
      return {
        headline: "Это первая форма, а нужна вторая",
        detail:
          `${verb.base} — неправильный глагол, и в прошедшем времени у него своя форма: «${verb.past[0]}». ` +
          "Окончание -ed к нему не добавляется.",
      };
    }
    if (gs === `${verb.base}ed` || gs === `${verb.base}d`) {
      return {
        headline: "К неправильному глаголу добавлено -ed",
        detail:
          `${verb.base} не подчиняется общему правилу: его вторая форма — «${verb.past[0]}», а не «${gs}». ` +
          "Такие глаголы приходится запоминать, зато их не так много.",
      };
    }
    if (verb.participle.includes(gs)) {
      return {
        headline: "Это третья форма, а нужна вторая",
        detail:
          `«${gs}» — третья форма, она работает с have и has (Present Perfect). ` +
          `Для простого прошедшего нужна вторая: «${verb.past[0]}».`,
      };
    }
  }

  // ── Future Simple ────────────────────────────────────────────────────────
  if (tense.id === "future_simple") {
    if (g.includes("will") && verb && !g.includes(verb.base)) {
      return {
        headline: "После will глагол стоит в первой форме",
        detail: `will не меняет глагол: нужно «will ${verb.base}», а не «${gs}».`,
      };
    }
    if (!g.includes("will")) {
      return {
        headline: "Пропущено will",
        detail: `Будущее время собирается из will и первой формы: «${es}».`,
      };
    }
  }

  // ── Present Perfect ──────────────────────────────────────────────────────
  if (tense.id === "present_perfect") {
    const hasHave = g.includes("have") || g.includes("has");
    if (!hasHave) {
      return {
        headline: "Пропущено have или has",
        detail:
          `Present Perfect собирается из have/has и третьей формы: «${es}». ` +
          "has ставится только с he, she, it, в остальных случаях have.",
      };
    }
    if (g.includes("have") && e.includes("has")) {
      return {
        headline: "Нужно has, а не have",
        detail: "С he, she и it всегда has. Правильно: «" + es + "».",
      };
    }
    if (g.includes("has") && e.includes("have")) {
      return {
        headline: "Нужно have, а не has",
        detail: "has бывает только с he, she, it. С остальными подлежащими — have: «" + es + "».",
      };
    }
    if (verb && g.some((w) => verb.past.includes(w)) && !g.some((w) => verb.participle.includes(w))) {
      return {
        headline: "После have нужна третья форма, а не вторая",
        detail:
          `У ${verb.base} вторая форма «${verb.past[0]}», третья — «${verb.participle[0]}». ` +
          `С have и has работает только третья: «${es}».`,
      };
    }
  }

  // ── Общий случай: перепутано время ───────────────────────────────────────
  if (verb) {
    if (verb.past.includes(gs) && tense.id !== "past_simple") {
      return {
        headline: `Это ${verb.base} в прошедшем времени`,
        detail: `Задание на ${tense.title}, поэтому нужна форма «${es}».`,
      };
    }
    if (verb.participle.includes(gs) && tense.id !== "present_perfect") {
      return {
        headline: "Это третья форма",
        detail: `Третья форма работает с have и has. Для ${tense.title} нужно «${es}».`,
      };
    }
  }

  return null;
}
