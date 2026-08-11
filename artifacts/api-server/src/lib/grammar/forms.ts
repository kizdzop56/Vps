// ─────────────────────────────────────────────────────────────────────────────
// Режим «Формы глаголов»: сами формы, до всяких предложений.
//
// ── Зачем он нужен ──────────────────────────────────────────────────────────
// Раздел неправильных глаголов начинался сразу с предложений, куда надо вставить
// нужную форму. Для того, кто формы уже знает, это хорошее упражнение. Для
// остальных — тупик: незнакомый глагол в предложении не выводится ни из
// контекста, ни из правила, и единственный выход оттуда — «Не знаю». Сначала
// формы, потом их применение.
//
// Устройство взято из карточек слов, потому что задача та же: запомнить пары.
//   «покупать» → buy      (первая форма: само слово)
//   buy → bought          (вторая форма, Past Simple)
//   buy → bought          (третья форма, после have/has)
//
// ── Банк выводится из таблицы, а не пишется руками ──────────────────────────
// Задания собираются из IRREGULAR_VERBS. Написать их отдельным списком значило
// бы продублировать все формы во втором месте — и на первой же правке таблицы
// ученик получил бы «неверно» на верном ответе. Номер задания кодирует глагол и
// форму (vf:past:buy), поэтому проверка ответа находит эталон там же, в таблице.
//
// ── Все три формы спрашиваются с самого начала ──────────────────────────────
// Сначала третья форма была закрыта до B1 — по аналогии с заданиями-
// предложениями, где она появляется вместе с Present Perfect. Для предложений
// это верно: «I have lost my keys» до перфекта взяться неоткуда. Для ТАБЛИЦЫ
// форм — нет.
//
// Неправильные глаголы учат столбиком, все три формы сразу: go — went — gone.
// Это одна единица заучивания, её и спрашивают целиком в любой школе. Разрезать
// её по уровням значит заставить ученика через год вернуться к тем же двадцати
// знакомым глаголам и доучивать третью колонку отдельно — а это ровно тот
// случай, когда повторное заучивание идёт тяжелее первого.
//
// Поэтому уровень задания равен уровню глагола: у глагола A1 спрашиваются все
// три формы, у глагола C1 — тоже все три, но не раньше C1. Где эта форма
// работает, написано прямо в подсказке: «третья форма (после have/has)».
//
// ── Группы по первой букве ──────────────────────────────────────────────────
// Глаголы можно учить и подряд, и по буквам: «неправильные глаголы на B», потом
// на C. Так их учат по таблице в учебнике, и так же выглядит любой список
// глаголов в справочнике — ученик приходит с этой привычкой, а не с нашей.
//
// Практическая польза не в алфавите, а в РАЗМЕРЕ: группа из шести глаголов
// закрывается за один присест, и «выучила глаголы на B» — проверяемый результат.
// «Учу неправильные глаголы» результатом не является никогда.
//
// Буква берётся у ПЕРВОЙ формы (buy → B), а не у перевода: в таблице учебника
// глагол стоит именно по ней, и искать его ученик будет там же. Группы
// вычисляются из таблицы, поэтому новый глагол попадает в свою букву сам, и
// пустых букв в списке не бывает по построению.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeAnswer } from "../answerCheck";
import {
  IRREGULAR_VERBS,
  fitsLevel,
  verbByBase,
  verbsUpTo,
  type CefrLevel,
  type IrregularVerb,
} from "./verbs";

/** Что спрашиваем. */
export type VerbFormKind = "toEn" | "past" | "participle";

/**
 * Префикс номера задания.
 *
 * Задания этого режима не лежат в массиве, а вычисляются, поэтому номер должен
 * сам себя объяснять: по нему проверка восстанавливает глагол и форму.
 */
export const FORM_ID_PREFIX = "vf";

/**
 * Сколько верных ответов по глаголу считаем знанием.
 *
 * До этого числа глагол даётся ВАРИАНТАМИ: первое знакомство с формой — это
 * узнавание, писать наугад тут нечего. Дальше только письмо: узнавание форму не
 * закрепляет, а ученик, который «узнаёт» bought среди четырёх, в предложении её
 * всё равно не напишет.
 */
export const FORM_MASTERY_HITS = 3;

export type FormTask = {
  id: string;
  kind: VerbFormKind;
  /** Уровень задания. Равен уровню самого глагола — см. шапку файла. */
  level: CefrLevel;
  verb: IrregularVerb;
};

export function formTaskId(kind: VerbFormKind, base: string): string {
  return `${FORM_ID_PREFIX}:${kind}:${base}`;
}

function taskFor(kind: VerbFormKind, verb: IrregularVerb): FormTask {
  return {
    id: formTaskId(kind, verb.base),
    kind,
    // Все три формы — одна единица заучивания, поэтому и уровень у них общий:
    // уровень глагола.
    level: verb.level,
    verb,
  };
}

const KINDS: VerbFormKind[] = ["toEn", "past", "participle"];

/** Сколько вопросов приходится на один глагол: по одному на каждую форму. */
export const QUESTIONS_PER_VERB = KINDS.length;

function isKind(value: string): value is VerbFormKind {
  return (KINDS as string[]).includes(value);
}

/**
 * Восстановить задание по номеру.
 *
 * Возвращает null на любой мусор: проверка ответа обязана отвечать «задание не
 * найдено», а не падать пятисоткой на подделанном номере.
 */
export function parseFormTask(id: string): FormTask | null {
  if (!id.startsWith(`${FORM_ID_PREFIX}:`)) return null;
  const [, kind = "", base = ""] = id.split(":");
  if (!isKind(kind) || !base) return null;
  const verb = verbByBase(base);
  if (!verb) return null;
  return taskFor(kind, verb);
}

/** Все задания режима: три на каждый глагол. */
export function allFormTasks(): FormTask[] {
  const out: FormTask[] = [];
  for (const verb of IRREGULAR_VERBS) {
    for (const kind of KINDS) out.push(taskFor(kind, verb));
  }
  return out;
}

/** Задания уровня ученика и ниже. */
export function formTasksUpTo(level: CefrLevel): FormTask[] {
  return allFormTasks().filter((t) => fitsLevel(t.level, level));
}

// ── Буквы ───────────────────────────────────────────────────────────────────

/**
 * Буква глагола: первая буква ПЕРВОЙ формы, заглавная.
 *
 * Не перевода: в таблице учебника глагол стоит по английскому слову, и ученик
 * будет искать его там же. «Покупать» на «П» не найдётся ни в одном справочнике.
 */
export function verbLetter(verb: IrregularVerb): string {
  return (verb.base.charAt(0) ?? "").toUpperCase();
}

/** Буква из запроса в сравнимом виде. Пусто — значит буква не выбрана. */
export function normalizeLetter(value: unknown): string {
  if (typeof value !== "string") return "";
  const letter = value.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(letter) ? letter : "";
}

export type LetterGroup = {
  letter: string;
  /** Сколько глаголов в группе. */
  verbCount: number;
  /** Сколько вопросов: по три на глагол. */
  taskCount: number;
  /** Сколько глаголов группы ученик уже знает — по ним вопросы идут письмом. */
  knownVerbs: number;
};

/**
 * Группы букв для уровня ученика.
 *
 * Только буквы, у которых на этом уровне есть глаголы: буква без заданий в
 * списке — это сломанная кнопка. Порядок алфавитный, потому что вся затея
 * именно про алфавит: искать «глаголы на S» ученик будет там, где ожидает.
 *
 * Числа отдаются сразу, без второго запроса: без них ученик не поймёт, во что
 * жмёт, а группа из одного глагола (на A1 таких несколько) должна честно
 * говорить, что она из одного глагола.
 */
export function verbLetterGroups(
  level: CefrLevel,
  mastered: ReadonlySet<string> = new Set(),
): LetterGroup[] {
  const groups = new Map<string, { verbCount: number; knownVerbs: number }>();

  for (const verb of verbsUpTo(level)) {
    const letter = verbLetter(verb);
    if (!letter) continue;
    const row = groups.get(letter) ?? { verbCount: 0, knownVerbs: 0 };
    row.verbCount += 1;
    if (mastered.has(verb.base)) row.knownVerbs += 1;
    groups.set(letter, row);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, row]) => ({
      letter,
      verbCount: row.verbCount,
      taskCount: row.verbCount * QUESTIONS_PER_VERB,
      knownVerbs: row.knownVerbs,
    }));
}

/**
 * Задания одной буквы.
 *
 * Буква не задана или не латинская — отдаём весь уровень: «все подряд» это
 * законный режим, а не ошибка, и падать тут не на чем.
 */
export function formTasksByLetter(level: CefrLevel, letter: unknown): FormTask[] {
  const want = normalizeLetter(letter);
  const pool = formTasksUpTo(level);
  if (!want) return pool;
  return pool.filter((t) => verbLetter(t.verb) === want);
}

/**
 * Глаголы с ОДИНАКОВЫМ переводом: «класть» — это и put, и lay.
 *
 * Свой глагол идёт первым: он показывается как эталонный ответ после ошибки.
 */
function synonymBases(verb: IrregularVerb): string[] {
  const ru = normalizeAnswer(verb.ru);
  const same = IRREGULAR_VERBS
    .filter((v) => v.base !== verb.base && normalizeAnswer(v.ru) === ru)
    .map((v) => v.base);
  return [verb.base, ...same];
}

/**
 * Верные ответы.
 *
 * Массив, а не строка, по двум причинам: у части глаголов две равноправные формы
 * (learnt и learned), и объявлять одну правильной значит спорить с учебником; а у
 * вопроса про перевод верным может быть другой глагол с тем же переводом.
 */
export function formAnswers(task: FormTask): string[] {
  if (task.kind === "toEn") return synonymBases(task.verb);
  return task.kind === "past" ? task.verb.past : task.verb.participle;
}

/** Все три формы одной строкой: показывается после ошибки. */
export function formLine(verb: IrregularVerb): string {
  return `${verb.base} · ${verb.past.join(" / ")} · ${verb.participle.join(" / ")}`;
}

/** Название формы человеческим языком — оно же подсказка на карточке. */
export function formHint(kind: VerbFormKind): string {
  if (kind === "toEn") return "первая форма";
  return kind === "past" ? "вторая форма (Past Simple)" : "третья форма (после have/has)";
}

/**
 * Что показать на карточке.
 *
 * В toEn спрашиваем перевод, поэтому крупно стоит русское слово, а английского
 * на экране нет вовсе — иначе задание отвечает само на себя.
 */
export function formCard(task: FormTask): { text: string; ru: string; hint: string } {
  if (task.kind === "toEn") {
    return {
      text: `«${task.verb.ru}»`,
      ru: "как это будет по-английски",
      hint: formHint(task.kind),
    };
  }
  return {
    text: task.verb.base,
    ru: task.verb.ru,
    hint: formHint(task.kind),
  };
}

/**
 * Правило под разбором: таблица форм этого глагола.
 *
 * Общего правила у неправильных глаголов нет — это и делает их неправильными.
 * Поэтому вместо правила показываются все три формы: единственное, что здесь
 * можно выучить.
 *
 * Про третью форму сказано, ГДЕ она работает. Спрашивают её теперь с A1, то есть
 * задолго до Present Perfect, и без этой строчки ученик заучивал бы слово, не
 * понимая, зачем оно.
 */
export function formRule(verb: IrregularVerb): {
  title: string;
  text: string;
  usage: string[];
  markers: string[];
} {
  return {
    title: `${verb.base} — ${verb.ru}`,
    text:
      `${formLine(verb)}. ` +
      "Первая форма — само слово, вторая работает в простом прошедшем, третья — после have и has. " +
      "Общего правила тут нет, эти три формы просто запоминают вместе, как одно слово.",
    usage: [
      `Past Simple: I ${verb.past[0]} …`,
      `Present Perfect: I have ${verb.participle[0]} …`,
    ],
    markers: [],
  };
}

/**
 * Разбор ошибки.
 *
 * Возвращает null, если промах не опознан: придумывать объяснение наугад нельзя,
 * ученик ему поверит. Тогда остаётся таблица форм, и этого достаточно.
 */
export function formMistake(
  given: string,
  task: FormTask,
): { headline: string; detail: string } | null {
  const g = normalizeAnswer(given);
  if (!g) return null;
  const verb = task.verb;

  const inPast = verb.past.some((f) => normalizeAnswer(f) === g);
  const inParticiple = verb.participle.some((f) => normalizeAnswer(f) === g);
  const isBase = normalizeAnswer(verb.base) === g;

  // ── Спрашивали само слово ────────────────────────────────────────────────
  if (task.kind === "toEn") {
    if (inPast || inParticiple) {
      return {
        headline: inPast ? "Это вторая форма" : "Это третья форма",
        detail:
          `Глагол угадан верно, но спрашивали само слово — первую форму: «${verb.base}». ` +
          `Все три: ${formLine(verb)}.`,
      };
    }
    const other = otherVerbByForm(g, verb.base);
    if (other) {
      return {
        headline: `Это другой глагол: ${other.base}`,
        detail: `${other.base} значит «${other.ru}», а нужно «${verb.ru}» — это ${verb.base}.`,
      };
    }
    return null;
  }

  const needThird = task.kind === "participle";

  if (isBase) {
    return {
      headline: needThird ? "Это первая форма, а нужна третья" : "Это первая форма, а нужна вторая",
      detail:
        `${verb.base} — неправильный глагол, у него своя форма: «${(needThird ? verb.participle : verb.past)[0]}». ` +
        `Все три: ${formLine(verb)}.`,
    };
  }

  // Перепутаны вторая и третья — самая частая ошибка, и она не описка.
  if (needThird && inPast) {
    return {
      headline: "Это вторая форма, а нужна третья",
      detail:
        `«${g}» ставится в простом прошедшем: I ${verb.past[0]} … ` +
        `После have и has идёт третья: «${verb.participle[0]}».`,
    };
  }
  if (!needThird && inParticiple) {
    return {
      headline: "Это третья форма, а нужна вторая",
      detail:
        `«${g}» работает с have и has. Для простого прошедшего нужна вторая форма: «${verb.past[0]}».`,
    };
  }

  if (g === `${verb.base}ed` || g === `${verb.base}d`) {
    return {
      headline: "К неправильному глаголу добавлено -ed",
      detail:
        `${verb.base} не подчиняется общему правилу — на этом список неправильных глаголов и держится. ` +
        `Правильно: ${formLine(verb)}.`,
    };
  }

  const other = otherVerbByForm(g, verb.base);
  if (other) {
    return {
      headline: `Это форма другого глагола: ${other.base}`,
      detail: `«${g}» — от ${other.base} («${other.ru}»). Здесь нужен ${verb.base}: ${formLine(verb)}.`,
    };
  }

  return null;
}

/** Чей это вообще ответ: ищем глагол, у которого есть такая форма. */
function otherVerbByForm(normalized: string, exceptBase: string): IrregularVerb | undefined {
  return IRREGULAR_VERBS.find(
    (v) =>
      v.base !== exceptBase &&
      [v.base, ...v.past, ...v.participle].some((f) => normalizeAnswer(f) === normalized),
  );
}
