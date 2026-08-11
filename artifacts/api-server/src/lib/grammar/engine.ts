// ─────────────────────────────────────────────────────────────────────────────
// Движок раздела «Составлять»: подбор заданий, проверка ответа, разбор ошибки.
//
// Один движок на четыре режима — отличается только источник заданий:
//   forms   → таблица глаголов  (сама форма: «покупать» → buy → bought)
//   verbs   → VERB_GAP_TASKS    (форма неправильного глагола в предложении)
//   tense   → TENSE_GAP_TASKS   (глагол в заданном времени)
//   build   → ASSEMBLE_TASKS    (собрать предложение по переводу)
//
// Порядок здесь не случайный: forms идёт до verbs, потому что вставить форму в
// предложение может только тот, кто эту форму знает (см. шапку forms.ts).
//
// ── Опечатки здесь прощаются ИНАЧЕ, чем в словах ────────────────────────────
// В словах одна опечатка в длинном слове — описка, и наказывать за неё нельзя
// (см. lib/answerCheck.ts). В грамматике наоборот: «lived» и «lives»
// отличаются на одну букву, но это не описка, а другое время. Простим — и
// упражнение перестанет учить.
//
// Поэтому перед прощением опечатки ответ сверяется со ВСЕМИ формами этого
// глагола: первая, третье лицо, -ed, -ing, вторая, третья. Совпал с какой-то —
// значит выбрана не та форма, это ошибка. Не совпал — обычная описка, прощаем.
//
// ── Письмо против выбора ────────────────────────────────────────────────────
// В заданиях с предложениями ученик по умолчанию ПИШЕТ сам, и лишь каждое третье
// даётся вариантами: выбор из четырёх — это узнавание, оно легче и форму не
// закрепляет, но постоянное письмо на незнакомой теме выматывает.
//
// В режиме форм правило другое: там способ ответа зависит от того, знает ли
// ученик этот глагол. Первое знакомство — варианты (писать наугад нечего),
// дальше письмо. Порог — FORM_MASTERY_HITS верных ответов по глаголу.
//
// Модуль без БД и express — тесты в engine.test.ts, rotation.test.ts,
// forms.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { checkWritten, normalizeAnswer } from "../answerCheck";
import { mulberry32, shuffle, daySeed } from "../wordExercise";
import { fitsLevel, verbByBase, type CefrLevel } from "./verbs";
import { diagnose, tenseById, type Tense } from "./tenses";
import {
  ASSEMBLE_TASKS,
  GAP,
  TENSE_GAP_TASKS,
  VERB_GAP_TASKS,
  type AssembleTask,
  type TenseGapTask,
  type VerbGapTask,
} from "./tasks";
import {
  formAnswers,
  formCard,
  formLine,
  formMistake,
  formRule,
  formTasksUpTo,
  parseFormTask,
  type FormTask,
} from "./forms";

export type GrammarMode = "forms" | "verbs" | "tense" | "build";

/** Сколько заданий в одном заходе. Как и в словах: короткая сессия. */
export const SESSION_SIZE = 12;

/** Каждое N-е задание даётся вариантами, остальные — письмом. */
export const CHOICE_EVERY = 3;

/** Сколько вариантов в задании с выбором. */
export const OPTION_COUNT = 4;

export type GrammarCard = {
  id: string;
  mode: GrammarMode;
  level: CefrLevel;
  /** Предложение с пропуском (для build — пусто). */
  text: string;
  /** Русский перевод: он же задание для режима build. */
  ru: string;
  /** Подсказка в скобках: первая форма глагола. */
  base?: string;
  /** Как отвечать: писать самому или выбирать. */
  input: "type" | "choice" | "assemble";
  /** Варианты для input="choice". */
  options?: string[];
  /** Плитки слов для input="assemble", уже перемешанные. */
  tiles?: string[];
  /** Что требуется от ученика словами: «Past Simple», «вторая форма». */
  hint?: string;
  /** Время задания — только в режиме tense. */
  tense?: string;
};

// ── Формы глагола ───────────────────────────────────────────────────────────

/** Третье лицо: he goes, she watches, it studies. */
export function thirdPerson(base: string): string {
  if (/(s|sh|ch|x|z|o)$/.test(base)) return `${base}es`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ies`;
  return `${base}s`;
}

/** Причастие на -ing: make → making, run → running. */
export function ingForm(base: string): string {
  if (/[^aeiou]e$/.test(base)) return `${base.slice(0, -1)}ing`;
  if (/^[^aeiou]?[aeiou][^aeiouwxy]$/.test(base)) return `${base}${base.slice(-1)}ing`;
  return `${base}ing`;
}

/** Правильное прошедшее: work → worked, live → lived, study → studied. */
export function edForm(base: string): string {
  if (base.endsWith("e")) return `${base}d`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ied`;
  if (/^[^aeiou]?[aeiou][^aeiouwxy]$/.test(base)) return `${base}${base.slice(-1)}ed`;
  return `${base}ed`;
}

/**
 * Все формы глагола. Нужны для двух вещей: дистракторы к заданию с выбором и
 * отсечение «опечаток», которые на самом деле другая форма.
 */
export function allForms(base: string): string[] {
  const verb = verbByBase(base);
  const forms = new Set<string>([
    base,
    thirdPerson(base),
    ingForm(base),
    edForm(base),
    ...(verb?.past ?? []),
    ...(verb?.participle ?? []),
  ]);
  return [...forms];
}

// ── Ротация: почему не «перетасовать и взять первые двенадцать» ─────────────
//
// Так и было сделано сначала, и на маленьком банке это заметно: тасовка новая,
// но мешок тот же, поэтому вчерашние задания выпадали снова примерно в трети
// случаев. Ученик видит не «новый заход», а «опять эти».
//
// Теперь банк режется на непересекающиеся порции по size, и порция выбирается
// курсором. Курсор — номер дня плюс номер захода, то есть соседние шаги дают
// РАЗНЫЕ порции гарантированно, а не по удаче. Пройден полный круг по банку —
// порядок перетасовывается заново, и круг начинается другой.
//
// Плата, которую стоит назвать прямо: курсор непрерывный, поэтому второй заход
// сегодня — это первый заход завтра. Альтернатива (свой круг на каждый день)
// вернула бы случайное пересечение соседних дней. Повтор через сутки полезнее
// для памяти, чем повтор через минуту, поэтому выбран этот вариант.

/** Сид из строки: режим и время должны крутиться независимо друг от друга. */
export function textSeed(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0) || 1;
}

/**
 * Сколько непересекающихся порций получается из банка.
 *
 * Округление ВНИЗ: хвост короче полного захода не берётся отдельной порцией,
 * иначе каждый N-й день был бы вдвое короче остальных. Хвост не пропадает — на
 * следующем круге тасовка другая, и в него попадёт уже другое.
 */
export function batchCount(poolSize: number, size: number): number {
  return Math.max(1, Math.floor(poolSize / Math.max(1, size)));
}

/**
 * Порция заданий по курсору.
 *
 * @param step  курсор: номер дня плюс номер захода
 * @param seed  сид банка: у каждого режима и времени он свой
 */
export function rotateBatch<T>(pool: T[], size: number, step: number, seed: number): T[] {
  if (pool.length === 0) return [];
  const cursor = Math.max(0, Math.trunc(step));

  // Банка не хватает даже на один заход: отдаём всё, что есть, но порядок
  // меняем — иначе задания идут в одном и том же порядке каждый день.
  if (pool.length <= size) return shuffle(pool, mulberry32(seed + cursor * 7919));

  const batches = batchCount(pool.length, size);
  const cycle = Math.floor(cursor / batches);
  const pos = cursor % batches;
  const order = shuffle(pool, mulberry32(seed + cycle * 7919));
  return order.slice(pos * size, pos * size + size);
}

// ── Подбор заданий ──────────────────────────────────────────────────────────

/** Задания уровня ученика и ниже. */
function pickTasks<T extends { level: CefrLevel }>(all: T[], level: CefrLevel): T[] {
  return all.filter((t) => fitsLevel(t.level, level));
}

/** Верные ответы задания на неправильный глагол — из таблицы форм. */
export function verbGapAnswers(task: VerbGapTask): string[] {
  const verb = verbByBase(task.base);
  if (!verb) return [];
  return task.form === "past" ? verb.past : verb.participle;
}

/** Дистракторы: другие формы того же глагола, а не случайные слова. */
function gapOptions(base: string, answer: string, rng: () => number): string[] {
  const wrong = allForms(base).filter((f) => normalizeAnswer(f) !== normalizeAnswer(answer));
  const picked = shuffle(wrong, rng).slice(0, OPTION_COUNT - 1);
  return shuffle([answer, ...picked], rng);
}

/**
 * Дистракторы к вопросу «как это будет по-английски»: другие ГЛАГОЛЫ.
 *
 * Здесь проверяется знание слова, а не формы, поэтому и ошибка должна быть
 * содержательной: спутал buy с bring, а не выбрал buying вместо buy.
 *
 * Исключаются ВСЕ принимаемые ответы, а не только эталон: у put и lay один
 * перевод, и lay среди «неправильных» вариантов дал бы зелёную галочку на
 * варианте, помеченном как ловушка.
 */
function verbWordOptions(answers: string[], pool: FormTask[], rng: () => number): string[] {
  const taken = new Set(answers.map(normalizeAnswer));
  const others = [...new Set(pool.map((t) => t.verb.base))].filter(
    (b) => !taken.has(normalizeAnswer(b)),
  );
  const picked = shuffle(others, rng).slice(0, OPTION_COUNT - 1);
  return shuffle([answers[0] ?? "", ...picked], rng);
}

/** Дистракторы для времени: та же форма, но от других времён. */
function tenseOptions(task: TenseGapTask, rng: () => number): string[] {
  const answer = task.accept[0] ?? "";
  const base = task.base;
  const verb = verbByBase(base);
  const past = verb?.past[0] ?? edForm(base);
  const participle = verb?.participle[0] ?? edForm(base);

  const pool = [
    base,
    thirdPerson(base),
    past,
    `will ${base}`,
    `is ${ingForm(base)}`,
    `are ${ingForm(base)}`,
    `was ${ingForm(base)}`,
    `have ${participle}`,
    `has ${participle}`,
  ].filter((f) => normalizeAnswer(f) !== normalizeAnswer(answer));

  const picked = shuffle([...new Set(pool)], rng).slice(0, OPTION_COUNT - 1);
  return shuffle([answer, ...picked], rng);
}

/** Слова предложения без пунктуации по краям — из них нарезаются плитки. */
export function sentenceTiles(en: string): string[] {
  return en
    .replace(/[.!?]+$/g, "")
    .split(/\s+/)
    .map((w) => w.replace(/^,|,$/g, ""))
    .filter(Boolean);
}

function verbFormHint(task: VerbGapTask): string {
  return task.form === "past" ? "вторая форма (Past Simple)" : "третья форма (после have/has)";
}

export type GrammarSessionResult = {
  cards: GrammarCard[];
  /** Сколько заданий доступно ученику в этом режиме вообще. */
  total: number;
  /** Номер захода: с ним подборка сдвигается на следующую порцию. */
  round: number;
  /** Сколько заходов подряд можно сделать без единого повтора. */
  batches: number;
};

/**
 * Собрать заход.
 *
 * Порядок детерминирован: одна и та же подборка в течение дня (обновление
 * экрана не тасует задания заново), но день ко дню и заход к заходу — другая.
 * За это отвечает rotateBatch, см. комментарий выше.
 */
export function buildGrammarSession(opts: {
  mode: GrammarMode;
  level: CefrLevel;
  /** Только для режима tense: какое время тренируем. */
  tense?: string;
  now?: Date;
  size?: number;
  /** Номер захода за день: 0 — первый, дальше следующие порции банка. */
  round?: number;
  /**
   * Глаголы, которые ученик уже знает (режим forms): по ним спрашиваем письмом,
   * по остальным — вариантами. Пусто — значит всё в первый раз.
   */
  mastered?: ReadonlySet<string>;
}): GrammarSessionResult {
  const now = opts.now ?? new Date();
  const size = Math.max(1, opts.size ?? SESSION_SIZE);
  const round = Math.max(0, Math.trunc(opts.round ?? 0));
  const seed = textSeed(`${opts.mode}:${opts.tense ?? ""}`);
  const step = daySeed(now) + round;

  /** Плитки и варианты мешаются от НОМЕРА задания: одна карточка — один вид. */
  const cardRng = (id: string) => mulberry32(daySeed(now) + textSeed(id));

  if (opts.mode === "forms") {
    const pool = formTasksUpTo(opts.level);
    const picked = rotateBatch(pool, size, step, seed);
    const mastered = opts.mastered ?? new Set<string>();
    return {
      total: pool.length,
      round,
      batches: batchCount(pool.length, size),
      cards: picked.map((t: FormTask) => {
        const answers = formAnswers(t);
        const main = answers[0] ?? "";
        const view = formCard(t);
        // Знакомый глагол пишем, незнакомый выбираем. Порог — FORM_MASTERY_HITS.
        const choice = !mastered.has(t.verb.base);
        const rng = cardRng(t.id);
        return {
          id: t.id,
          mode: "forms" as const,
          level: t.level,
          text: view.text,
          ru: view.ru,
          input: choice ? ("choice" as const) : ("type" as const),
          options: !choice
            ? undefined
            : t.kind === "toEn"
              ? verbWordOptions(answers, pool, rng)
              : gapOptions(t.verb.base, main, rng),
          hint: view.hint,
        };
      }),
    };
  }

  if (opts.mode === "build") {
    const pool = pickTasks(ASSEMBLE_TASKS, opts.level);
    const picked = rotateBatch(pool, size, step, seed);
    return {
      total: pool.length,
      round,
      batches: batchCount(pool.length, size),
      cards: picked.map((t: AssembleTask) => ({
        id: t.id,
        mode: "build" as const,
        level: t.level,
        text: "",
        ru: t.ru,
        input: "assemble" as const,
        tiles: shuffle([...sentenceTiles(t.en), ...(t.extra ?? [])], cardRng(t.id)),
        hint: "собери предложение по переводу",
      })),
    };
  }

  if (opts.mode === "tense") {
    const all = pickTasks(TENSE_GAP_TASKS, opts.level);
    const pool = opts.tense ? all.filter((t) => t.tense === opts.tense) : all;
    const picked = rotateBatch(pool, size, step, seed);
    return {
      total: pool.length,
      round,
      batches: batchCount(pool.length, size),
      cards: picked.map((t: TenseGapTask, i) => {
        const tense = tenseById(t.tense);
        const choice = (i + 1) % CHOICE_EVERY === 0;
        return {
          id: t.id,
          mode: "tense" as const,
          level: t.level,
          text: t.text,
          ru: t.ru,
          base: t.base,
          input: choice ? ("choice" as const) : ("type" as const),
          options: choice ? tenseOptions(t, cardRng(t.id)) : undefined,
          hint: tense?.title ?? t.tense,
          tense: t.tense,
        };
      }),
    };
  }

  const pool = pickTasks(VERB_GAP_TASKS, opts.level);
  const picked = rotateBatch(pool, size, step, seed);
  return {
    total: pool.length,
    round,
    batches: batchCount(pool.length, size),
    cards: picked.map((t: VerbGapTask, i) => {
      // Верный ответ достаём в переменную: в проекте включена строгая проверка
      // индексов, и answers[0] прямо в тернарнике имел бы тип string|undefined.
      const answers = verbGapAnswers(t);
      const main = answers[0];
      const choice = (i + 1) % CHOICE_EVERY === 0;
      return {
        id: t.id,
        mode: "verbs" as const,
        level: t.level,
        text: t.text,
        ru: t.ru,
        base: t.base,
        input: choice ? ("choice" as const) : ("type" as const),
        options: choice && main ? gapOptions(t.base, main, cardRng(t.id)) : undefined,
        hint: verbFormHint(t),
      };
    }),
  };
}

// ── Проверка ответа ─────────────────────────────────────────────────────────

export type GrammarVerdict = {
  correct: boolean;
  /** Принято, но с опечаткой — показываем верное написание. */
  typo: boolean;
  /** Верные ответы: показываются после ошибки. */
  expected: string[];
  /** Предложение целиком с подставленным верным ответом. */
  full?: string;
  /** Что именно сделано не так. Пусто, если ошибка не опознана. */
  mistake?: { headline: string; detail: string };
  /** Правило времени — показывается под разбором. */
  rule?: { title: string; text: string; usage: string[]; markers: string[] };
};

/** Найти задание по номеру в любом из банков. */
export function findTask(id: string):
  | { kind: "forms"; task: FormTask }
  | { kind: "verbs"; task: VerbGapTask }
  | { kind: "tense"; task: TenseGapTask }
  | { kind: "build"; task: AssembleTask }
  | null {
  // Задания режима форм не лежат в массиве: их номер сам описывает глагол и
  // форму, поэтому проверяется первым — по префиксу, без перебора банков.
  const form = parseFormTask(id);
  if (form) return { kind: "forms", task: form };
  const v = VERB_GAP_TASKS.find((t) => t.id === id);
  if (v) return { kind: "verbs", task: v };
  const t = TENSE_GAP_TASKS.find((x) => x.id === id);
  if (t) return { kind: "tense", task: t };
  const a = ASSEMBLE_TASKS.find((x) => x.id === id);
  if (a) return { kind: "build", task: a };
  return null;
}

/**
 * Ответ совпал с формой того же глагола, но не с верной.
 *
 * Это и есть граница между опечаткой и ошибкой: «lives» вместо «lived» —
 * не промах пальца, а неверная форма, и прощать её нельзя.
 */
function isWrongForm(given: string, base: string, accept: string[]): boolean {
  const g = normalizeAnswer(given);
  const ok = new Set(accept.map(normalizeAnswer));
  if (ok.has(g)) return false;
  return allForms(base).some((f) => normalizeAnswer(f) === g);
}

/** Проверка с грамматической строгостью: см. шапку файла. */
function checkStrict(given: string, accept: string[], base?: string): { correct: boolean; typo: boolean } {
  const verdict = checkWritten(given, accept);
  if (!verdict.correct) return { correct: false, typo: false };
  // Точное совпадение — принимаем всегда.
  if (!verdict.typo) return { correct: true, typo: false };
  // Прощение опечатки отменяется, если ответ — другая форма глагола.
  if (base && isWrongForm(given, base, accept)) return { correct: false, typo: false };
  return { correct: true, typo: true };
}

/** Подставить ответ в пропуск: ученик должен увидеть фразу целиком. */
function fill(text: string, answer: string): string {
  return text.replace(GAP, answer);
}

function ruleOf(tense: Tense) {
  return { title: tense.title, text: tense.rule, usage: tense.usage, markers: tense.markers };
}

/**
 * Проверить ответ ученика.
 *
 * Эталон берётся из банка по номеру задания, а не из тела запроса: иначе клиент
 * мог бы прислать свой «правильный ответ» и засчитать себе что угодно.
 */
export function checkGrammarAnswer(id: string, given: string): GrammarVerdict | null {
  const found = findTask(id);
  if (!found) return null;

  if (found.kind === "forms") {
    const task = found.task;
    const accept = formAnswers(task);
    const { correct, typo } = checkStrict(given, accept, task.verb.base);
    const verdict: GrammarVerdict = {
      correct,
      typo,
      expected: accept,
      // После ошибки крупной строкой показываются все три формы: ученику нужна
      // не только верная, но и то, чем она отличается от соседних.
      full: formLine(task.verb),
    };
    if (!correct) {
      const mistake = formMistake(given, task);
      if (mistake) verdict.mistake = mistake;
      // Правило прилагается всегда: у неправильных глаголов его роль играет сама
      // таблица форм, и в ней-то и весь смысл упражнения.
      verdict.rule = formRule(task.verb);
    }
    return verdict;
  }

  if (found.kind === "verbs") {
    const task = found.task;
    const accept = verbGapAnswers(task);
    const { correct, typo } = checkStrict(given, accept, task.base);
    const verdict: GrammarVerdict = {
      correct,
      typo,
      expected: accept,
      full: fill(task.text, accept[0] ?? ""),
    };
    if (!correct) {
      // Для второй формы разбор идёт по правилам Past Simple, для третьей — по
      // Present Perfect: именно там эти формы и работают.
      const tense = tenseById(task.form === "past" ? "past_simple" : "present_perfect");
      if (tense) {
        const d = diagnose(given, accept[0] ?? "", tense, task.base);
        if (d) verdict.mistake = d;
        verdict.rule = ruleOf(tense);
      }
    }
    return verdict;
  }

  if (found.kind === "tense") {
    const task = found.task;
    const { correct, typo } = checkStrict(given, task.accept, task.base);
    const verdict: GrammarVerdict = {
      correct,
      typo,
      expected: task.accept,
      full: fill(task.text, task.accept[0] ?? ""),
    };
    if (!correct) {
      const tense = tenseById(task.tense);
      if (tense) {
        const d = diagnose(given, task.accept[0] ?? "", tense, task.base);
        if (d) verdict.mistake = d;
        verdict.rule = ruleOf(tense);
      }
    }
    return verdict;
  }

  // Сборка предложения: сравниваем всю фразу. Пунктуация и регистр не важны —
  // проверяется порядок слов, а не аккуратность ввода.
  const task = found.task;
  const { correct, typo } = checkStrict(given, [task.en]);
  const verdict: GrammarVerdict = {
    correct,
    typo,
    expected: [task.en],
    full: task.en,
  };
  if (!correct) {
    const mistake = assembleMistake(given, task.en);
    if (mistake) verdict.mistake = mistake;
  }
  return verdict;
}

/**
 * Разбор ошибки в сборке предложения.
 *
 * Три случая, которые видно без разбора грамматики: слов не хватает, слов
 * лишних, слова те же, но порядок другой. Последний — самый частый и самый
 * полезный: значит, ученик знает слова и спотыкается именно на порядке.
 */
export function assembleMistake(given: string, expected: string): { headline: string; detail: string } | null {
  const g = normalizeAnswer(given).replace(/[.!?]+$/, "").split(" ").filter(Boolean);
  const e = normalizeAnswer(expected).replace(/[.!?]+$/, "").split(" ").filter(Boolean);
  if (g.length === 0) return null;

  const gSorted = [...g].sort().join(" ");
  const eSorted = [...e].sort().join(" ");

  if (gSorted === eSorted) {
    return {
      headline: "Слова верные, но порядок другой",
      detail:
        "В английском порядок слов почти не меняется: сначала кто, потом действие, потом всё остальное. " +
        "Обстоятельство времени (yesterday, every day) ставится в конец или в самое начало, но не между подлежащим и глаголом.",
    };
  }

  const extra = g.filter((w) => !e.includes(w));
  const missing = e.filter((w) => !g.includes(w));

  if (extra.length > 0 && missing.length > 0) {
    return {
      headline: `Не та форма: «${extra[0]}» вместо «${missing[0]}»`,
      detail: "Остальные слова на месте — дело только в форме этого слова.",
    };
  }
  if (missing.length > 0) {
    return {
      headline: `Пропущено слово: «${missing[0]}»`,
      detail: "В английском нельзя опустить служебное слово, даже если в русском переводе его нет.",
    };
  }
  if (extra.length > 0) {
    return {
      headline: `Лишнее слово: «${extra[0]}»`,
      detail: "В наборе намеренно есть слова, которые в это предложение не входят.",
    };
  }
  return null;
}
