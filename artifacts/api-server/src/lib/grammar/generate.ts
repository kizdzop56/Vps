// ─────────────────────────────────────────────────────────────────────────────
// Генератор заданий из предложений-заготовок (sentenceUnits.ts).
//
// ── Что генерируется, а что нет ─────────────────────────────────────────────
// Генерируется МЕХАНИКА: выбор вспомогательного (do/does/did/will/is/are/have),
// окончание -s в третьем лице, be + -ing, have + третья форма, порядок слов в
// вопросе, отрицание с not и сокращения. Это ровно та часть английского, которая
// выводится по правилу от времени и лица. Писать её руками для каждого
// предложения — значит переписывать одно и то же сто раз и обязательно где-то
// ошибиться.
//
// НЕ генерируются сами предложения. Подставлять случайные глаголы в шаблон
// «{кто} {делает} {что}» нельзя: получится «The shop drinks milk». Смысл
// написан руками, механика посчитана — отсюда и объём, и осмысленность
// одновременно.
//
// ── Из одной заготовки семь заданий ─────────────────────────────────────────
//   tense/affirmative   He ___ milk.          → likes
//   tense/negative      He ___ milk.          → does not like
//   tense/question-aux  ___ he like milk?     → Does
//   tense/question-verb Does he ___ milk?     → like
//   assemble ×3         собрать утверждение, отрицание и вопрос из слов
// Плюс задание на форму неправильного глагола, если глагол неправильный.
//
// ── Длина ───────────────────────────────────────────────────────────────────
// Задание, не влезшее в лимит своего уровня, НЕ выпускается. Молча, и это
// осознанно: отрицание длиннее утверждения на два слова, и на A1 часть заготовок
// в восемь слов не уложится. Ронять сборку из-за этого нельзя, а укорачивать
// осмысленное предложение ради круглого числа — тем более. Если из-за отсева
// исчезнет целый вид предложений, это поймает тест на объём: он требует по 12
// заданий каждого вида на каждое время.
//
// ── ГРАБЛИ: «already» в отрицании ───────────────────────────────────────────
// «I have not finished my homework already» — не по-английски, там нужно yet.
// Поэтому у заготовки есть необязательный хвост для отрицания и вопроса
// (restNeg) и свой русский перевод к нему (ruNeg). Генератор не умеет менять
// already на yet сам и не должен: это работа со смыслом, а не с формой.
// ─────────────────────────────────────────────────────────────────────────────

import {
  GAP,
  edForm,
  fitsWords,
  ingForm,
  thirdPerson,
  type AssembleTask,
  type TenseGapTask,
  type VerbGapTask,
} from "./core";
import { verbByBase } from "./verbs";
import { SENTENCE_UNITS, type Person, type SentenceUnit } from "./sentenceUnits";

/** Третье лицо единственного числа: только с ним появляется -s и does/has/is. */
const THIRD_SINGULAR: ReadonlySet<Person> = new Set<Person>(["he", "she", "it"]);

/** Сокращения вспомогательных в отрицании. */
const SHORT_NEGATIVE: Record<string, string> = {
  "do not": "don't",
  "does not": "doesn't",
  "did not": "didn't",
  "will not": "won't",
  "is not": "isn't",
  "are not": "aren't",
  "was not": "wasn't",
  "were not": "weren't",
  "have not": "haven't",
  "has not": "hasn't",
  "am not": "'m not",
};

function beNow(person: Person): string {
  if (person === "I") return "am";
  return THIRD_SINGULAR.has(person) ? "is" : "are";
}

function bePast(person: Person): string {
  return person === "I" || THIRD_SINGULAR.has(person) ? "was" : "were";
}

/** Вторые формы глагола: у неправильного из таблицы, у правильного по правилу. */
function pastForms(base: string): string[] {
  const verb = verbByBase(base);
  return verb ? verb.past : [edForm(base)];
}

/** Третьи формы: там же. */
function participleForms(base: string): string[] {
  const verb = verbByBase(base);
  return verb ? verb.participle : [edForm(base)];
}

/** Вспомогательный глагол этого времени и лица. */
function auxiliary(unit: SentenceUnit): string {
  switch (unit.tense) {
    case "present_simple": return THIRD_SINGULAR.has(unit.person) ? "does" : "do";
    case "past_simple": return "did";
    case "future_simple": return "will";
    case "present_continuous": return beNow(unit.person);
    case "past_continuous": return bePast(unit.person);
    case "present_perfect": return THIRD_SINGULAR.has(unit.person) ? "has" : "have";
  }
}

/**
 * Форма смыслового глагола рядом со вспомогательным.
 *
 * Именно она стоит в отрицании и в вопросе, и именно на ней спотыкается ученик:
 * после did нужна первая форма, после have — третья, после be — с -ing.
 */
function mainForms(unit: SentenceUnit): string[] {
  switch (unit.tense) {
    case "present_perfect": return participleForms(unit.verb);
    case "present_continuous":
    case "past_continuous": return [ingForm(unit.verb)];
    default: return [unit.verb];
  }
}

/** Глагольная часть утвердительного предложения, со всеми допустимыми вариантами. */
function affirmativeForms(unit: SentenceUnit): string[] {
  const aux = auxiliary(unit);
  switch (unit.tense) {
    case "present_simple":
      return [THIRD_SINGULAR.has(unit.person) ? thirdPerson(unit.verb) : unit.verb];
    case "past_simple":
      return pastForms(unit.verb);
    case "future_simple":
      return [`will ${unit.verb}`, `'ll ${unit.verb}`];
    case "present_continuous": {
      const ing = ingForm(unit.verb);
      const short = aux === "am" ? [`'m ${ing}`] : [];
      return [`${aux} ${ing}`, ...short];
    }
    case "past_continuous":
      return [`${aux} ${ingForm(unit.verb)}`];
    case "present_perfect":
      return participleForms(unit.verb).flatMap((p) =>
        aux === "have" ? [`have ${p}`, `'ve ${p}`] : [`has ${p}`],
      );
  }
}

/** Глагольная часть отрицания: вспомогательный + not + смысловой. */
function negativeForms(unit: SentenceUnit): string[] {
  const aux = auxiliary(unit);
  const long = `${aux} not`;
  const short = SHORT_NEGATIVE[long] ?? long;
  const mains = unit.tense === "present_perfect" ? participleForms(unit.verb) : mainForms(unit);
  return mains.flatMap((m) => [`${long} ${m}`, `${short} ${m}`]);
}

const capitalize = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

/**
 * Подлежащее внутри вопроса.
 *
 * В начало уходит вспомогательный, поэтому подлежащее теряет заглавную букву:
 * «My cat» → «Does my cat …». Местоимение I — исключение, оно всегда большое.
 */
function subjectInQuestion(subject: string): string {
  if (subject === "I") return "I";
  return subject.charAt(0).toLowerCase() + subject.slice(1);
}

/** Склеить части предложения, не оставив двойных пробелов. */
function join(...parts: string[]): string {
  return parts.filter((p) => p && p.trim()).join(" ").replace(/\s+/g, " ").trim();
}

/** Хвост для отрицания и вопроса: у части заготовок он свой (already → yet). */
function restOf(unit: SentenceUnit, negative: boolean): string {
  return negative ? unit.restNeg ?? unit.rest : unit.rest;
}

function ruOf(unit: SentenceUnit, negative: boolean): string {
  return negative ? unit.ruNeg ?? unit.ru : unit.ru;
}

/** Русский перевод: подставляем глагол в шаблон. */
function ruSentence(unit: SentenceUnit, kind: "affirmative" | "negative" | "question"): string {
  const template = ruOf(unit, kind === "negative");
  const verb = kind === "negative" ? `не ${unit.ruVerb}` : unit.ruVerb;
  const text = template.replace("{}", verb);
  // В русском общий вопрос отличается от утверждения только интонацией, поэтому
  // весь перевод вопроса — та же фраза со знаком вопроса.
  return `${text}${kind === "question" ? "?" : "."}`;
}

// ── Задания на время ────────────────────────────────────────────────────────

export function generateTenseTasks(units: SentenceUnit[] = SENTENCE_UNITS): TenseGapTask[] {
  const out: TenseGapTask[] = [];

  for (const unit of units) {
    const aux = auxiliary(unit);
    const mains = mainForms(unit);
    const main = mains[0] ?? unit.verb;
    const subjQ = subjectInQuestion(unit.subject);

    const push = (task: TenseGapTask, full: string) => {
      if (!fitsWords(full, unit.level)) return;
      out.push(task);
    };

    // Утверждение: пропуск на месте глагола целиком.
    const affirmative = affirmativeForms(unit);
    push(
      {
        id: `g-${unit.id}-aff`,
        level: unit.level,
        tense: unit.tense,
        form: "affirmative",
        text: join(unit.subject, GAP, unit.rest) + ".",
        base: unit.verb,
        accept: affirmative,
        ru: ruSentence(unit, "affirmative"),
      },
      join(unit.subject, affirmative[0] ?? "", unit.rest),
    );

    // Отрицание: вспомогательный, not и смысловой глагол — всё в пропуск.
    const negative = negativeForms(unit);
    const restNeg = restOf(unit, true);
    push(
      {
        id: `g-${unit.id}-neg`,
        level: unit.level,
        tense: unit.tense,
        form: "negative",
        text: join(unit.subject, GAP, restNeg) + ".",
        base: unit.verb,
        accept: negative,
        ru: ruSentence(unit, "negative"),
      },
      join(unit.subject, negative[0] ?? "", restNeg),
    );

    const questionFull = join(capitalize(aux), subjQ, main, restNeg) + "?";
    const questionRu = ruSentence(unit, "question");

    // Вопрос, часть первая: какой вспомогательный. Проверяется согласование с
    // подлежащим и временем.
    push(
      {
        id: `g-${unit.id}-qa`,
        level: unit.level,
        tense: unit.tense,
        form: "question",
        text: join(GAP, subjQ, main, restNeg) + "?",
        base: unit.verb,
        accept: [capitalize(aux)],
        ru: questionRu,
      },
      questionFull,
    );

    // Вопрос, часть вторая: в какой форме стоит смысловой глагол. Это и есть
    // место «did you went».
    push(
      {
        id: `g-${unit.id}-qv`,
        level: unit.level,
        tense: unit.tense,
        form: "question",
        text: join(capitalize(aux), subjQ, GAP, restNeg) + "?",
        base: unit.verb,
        accept: mains,
        ru: questionRu,
      },
      questionFull,
    );
  }

  return out;
}

// ── Сборка предложений ──────────────────────────────────────────────────────

/**
 * Слова-ловушки: другие формы того же глагола и чужие вспомогательные.
 *
 * Берутся только те, которых нет в самом предложении — иначе ловушка окажется
 * нужным словом. Случайные слова сюда не идут: их отбрасывают по смыслу, не
 * зная грамматики, и задание перестаёт что-либо проверять.
 */
function trapsFor(sentence: string, base: string): string[] {
  const own = new Set(
    sentence.toLowerCase().replace(/[.?!]/g, "").split(/\s+/).filter(Boolean),
  );
  const candidates = [
    thirdPerson(base),
    edForm(base),
    ingForm(base),
    base,
    ...pastForms(base),
    ...participleForms(base),
    "does", "do", "did", "will", "is", "are", "was", "were", "have", "has",
  ];
  const out: string[] = [];
  for (const word of candidates) {
    if (out.length >= 2) break;
    const lower = word.toLowerCase();
    if (own.has(lower) || out.includes(word)) continue;
    out.push(word);
  }
  return out;
}

export function generateAssembleTasks(units: SentenceUnit[] = SENTENCE_UNITS): AssembleTask[] {
  const out: AssembleTask[] = [];

  for (const unit of units) {
    const aux = auxiliary(unit);
    const main = mainForms(unit)[0] ?? unit.verb;
    const subjQ = subjectInQuestion(unit.subject);
    const restNeg = restOf(unit, true);

    const variants: Array<{ suffix: string; en: string; ru: string }> = [
      {
        suffix: "aff",
        en: join(unit.subject, affirmativeForms(unit)[0] ?? "", unit.rest) + ".",
        ru: ruSentence(unit, "affirmative"),
      },
      {
        suffix: "neg",
        en: join(unit.subject, negativeForms(unit)[0] ?? "", restNeg) + ".",
        ru: ruSentence(unit, "negative"),
      },
      {
        suffix: "q",
        en: join(capitalize(aux), subjQ, main, restNeg) + "?",
        ru: ruSentence(unit, "question"),
      },
    ];

    for (const v of variants) {
      if (!fitsWords(v.en, unit.level)) continue;
      out.push({
        id: `g-${unit.id}-as-${v.suffix}`,
        level: unit.level,
        ru: v.ru,
        en: v.en,
        extra: trapsFor(v.en, unit.verb),
      });
    }
  }

  return out;
}

// ── Форма неправильного глагола в предложении ───────────────────────────────

/**
 * Уровень такого задания — уровень ГЛАГОЛА, а не времени.
 *
 * Здесь проверяется форма, а не время: «I have ___ my keys» про третью форму
 * глагола lose, и знать Present Perfect для ответа не требуется — have уже
 * написано в самом задании. Привязка к уровню времени держала бы третью форму
 * взаперти до B1, а её учат сразу вместе с первыми двумя.
 */
export function generateVerbGapTasks(units: SentenceUnit[] = SENTENCE_UNITS): VerbGapTask[] {
  const out: VerbGapTask[] = [];

  for (const unit of units) {
    const verb = verbByBase(unit.verb);
    if (!verb) continue; // правильный глагол: форма выводится по правилу, тренировать нечего

    if (unit.tense === "past_simple") {
      const full = join(unit.subject, verb.past[0] ?? "", unit.rest) + ".";
      if (!fitsWords(full, verb.level)) continue;
      out.push({
        id: `g-${unit.id}-vg`,
        level: verb.level,
        text: join(unit.subject, GAP, unit.rest) + ".",
        base: unit.verb,
        form: "past",
        ru: ruSentence(unit, "affirmative"),
      });
      continue;
    }

    if (unit.tense === "present_perfect") {
      const aux = auxiliary(unit);
      const full = join(unit.subject, aux, verb.participle[0] ?? "", unit.rest) + ".";
      if (!fitsWords(full, verb.level)) continue;
      out.push({
        id: `g-${unit.id}-vg`,
        level: verb.level,
        // have и has стоят в самом задании: спрашивается только форма.
        text: join(unit.subject, aux, GAP, unit.rest) + ".",
        base: unit.verb,
        form: "participle",
        ru: ruSentence(unit, "affirmative"),
      });
    }
  }

  return out;
}
