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
// Так неправильные глаголы учат в школе и так они напечатаны в конце любого
// учебника: столбик на A, столбик на B. Просьба была буквальная — «если вкладка
// называется „глаголы на букву B“, значит там и должны попадаться глаголы на B».
//
// Группа считается по ПЕРВОЙ ФОРМЕ, а не по переводу: список в учебнике
// отсортирован именно так, и ученик ищет там go, а не «идти».
//
// Буквы, на которых у ученика нет ни одного глагола, не показываются вовсе.
// Пустая кнопка «на букву A» — это сломанная кнопка: на A1 и A2 нет ни одного
// глагола на A, первый (arise) приходит только на C1.
//
// Группы получаются очень разными по объёму: на A1 буква S даёт четыре глагола,
// а буква M — один. Уравнивать их, досыпая в мелкие группы соседние буквы,
// нельзя: это ровно то, о чём просили не делать. Поэтому объём группы просто
// написан на кнопке — «1 глагол · 3 вопроса», и ученик выбирает, зная, что
// берёт.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeAnswer } from "../answerCheck";
import {
  IRREGULAR_VERBS,
  fitsLevel,
  verbByBase,
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

// ── Группы по первой букве ──────────────────────────────────────────────────

/** Буква группы: первая буква ПЕРВОЙ ФОРМЫ, заглавная. */
export function verbLetter(base: string): string {
  return base.trim().charAt(0).toUpperCase();
}

/**
 * Буква из запроса в сравнимом виде.
 *
 * Мусор, кириллица и пустая строка дают null: адрес приходит от клиента, и
 * «буква» вида «../» не должна превращаться в пустой экран без объяснения.
 */
export function normalizeLetter(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ch = value.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(ch) ? ch : null;
}

/** Одна группа: буква и её объём. */
export type FormLetterGroup = {
  letter: string;
  /** Сколько глаголов на эту букву доступно ученику. */
  verbCount: number;
  /** Сколько вопросов это даёт: по три на глагол. */
  taskCount: number;
};

/** Задания только на эту букву. Неизвестная буква — пустой список. */
export function formTasksByLetter(level: CefrLevel, letter: string): FormTask[] {
  const target = normalizeLetter(letter);
  if (!target) return [];
  return formTasksUpTo(level).filter((t) => verbLetter(t.verb.base) === target);
}

/**
 * Какие буквы доступны ученику и сколько в каждой глаголов.
 *
 * Считается по доступным заданиям, а не по всей таблице: буква, все глаголы
 * которой выше уровня ученика, в список не попадает.
 */
export function formLetterGroups(level: CefrLevel): FormLetterGroup[] {
  const verbs = new Map<string, Set<string>>();
  const tasks = new Map<string, number>();

  for (const t of formTasksUpTo(level)) {
    const letter = verbLetter(t.verb.base);
    const bases = verbs.get(letter) ?? new Set<string>();
    bases.add(t.verb.base);
    verbs.set(letter, bases);
    tasks.set(letter, (tasks.get(letter) ?? 0) + 1);
  }

  return [...verbs.entries()]
    .map(([letter, bases]) => ({
      letter,
      verbCount: bases.size,
      taskCount: tasks.get(letter) ?? 0,
    }))
    .sort((a, b) => a.letter.localeCompare(b.letter));
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
