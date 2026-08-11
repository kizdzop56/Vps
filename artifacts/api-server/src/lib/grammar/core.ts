// ─────────────────────────────────────────────────────────────────────────────
// Общие типы и правила банков заданий.
//
// Отдельный файл нужен из-за генератора. Задания теперь не только пишутся
// руками (tasks.ts, tenseTasks.ts), но и собираются из предложений-заготовок
// (generate.ts). Генератору нужны те же типы, та же метка пропуска и те же
// лимиты длины, а банки, в свою очередь, импортируют генератор — если бы всё
// это лежало в tasks.ts, получился бы циклический импорт.
//
// Сюда же переехали правила образования форм (thirdPerson, ingForm, edForm):
// раньше они жили в engine.ts, а engine.ts зависит от банков.
// ─────────────────────────────────────────────────────────────────────────────

import type { CefrLevel } from "./verbs";
import type { SentenceForm, TenseId } from "./tenses";

/** Метка пропуска в предложении. Одна на все банки. */
export const GAP = "___";

/**
 * Предел длины ГОТОВОЙ фразы по уровню, в словах.
 *
 * Считается именно готовая, с подставленным ответом: в отрицании на месте
 * одного слова встают три («does not watch»), и фраза с пропуском о своей длине
 * врёт.
 */
export const MAX_WORDS: Record<CefrLevel, number> = {
  A1: 8,
  A2: 11,
  B1: 14,
  B2: 18,
  C1: 24,
};

/**
 * С какого уровня спрашиваем третью форму.
 *
 * Было B1 — по Present Perfect, где она работает. Теперь A1, и вот почему.
 * Неправильные глаголы учат столбиком целиком: go — went — gone. Это одна
 * единица заучивания, её так и спрашивают в школе. Разрезать её по уровням
 * значит заставить ученика через год вернуться к тем же знакомым глаголам и
 * доучивать третью колонку отдельно, а повторное заучивание идёт тяжелее
 * первого.
 *
 * Где эта форма работает, сказано в подсказке к заданию и в разборе: «третья
 * форма (после have/has)».
 */
export const PARTICIPLE_FROM: CefrLevel = "A1";

export type VerbForm = "past" | "participle";

/** Вставить форму неправильного глагола. */
export type VerbGapTask = {
  id: string;
  level: CefrLevel;
  /** Предложение с GAP на месте пропуска. */
  text: string;
  /** Первая форма: показывается в скобках как подсказка. */
  base: string;
  /** Какая форма нужна. Ответы берутся из таблицы глаголов. */
  form: VerbForm;
  /** Перевод всего предложения — нужен и до ответа, и в разборе. */
  ru: string;
};

/**
 * Поставить глагол в заданное время.
 *
 * form обязателен и без умолчания: «по умолчанию утвердительное» означало бы,
 * что забытое поле молча превращает вопрос в утверждение. Про такие поля
 * забывают всегда, а разбор ошибки без вида предложения врёт ученику в лицо —
 * например, объясняет «нужна вторая форма» там, где после did нужна первая.
 */
export type TenseGapTask = {
  id: string;
  level: CefrLevel;
  tense: TenseId;
  /** Утверждение, отрицание или вопрос. */
  form: SentenceForm;
  text: string;
  /** Первая форма глагола — она же подсказка в скобках. */
  base: string;
  /**
   * Допустимые ответы целиком: «is reading», «does not like», «Did».
   *
   * Первый вариант — эталонный, его показываем после ошибки, поэтому полная
   * форма идёт раньше сокращённой. У ответов в начале вопроса первая буква
   * заглавная: этот ответ подставляется в начало фразы.
   */
  accept: string[];
  ru: string;
};

/** Собрать предложение из слов по русскому переводу. */
export type AssembleTask = {
  id: string;
  level: CefrLevel;
  /** Русский перевод — единственное, что видно до сборки. */
  ru: string;
  /** Верное предложение. Плитки нарезаются из него. */
  en: string;
  /**
   * Лишние слова-ловушки. Не «побольше слов», а именно те формы, которые
   * ученик перепутает: goes рядом с go, was рядом с is.
   *
   * Ровно по одному слову: плитки нарезаются по словам, и ловушка из двух слов
   * была бы вдвое шире остальных — то есть выдавала бы себя без знания языка.
   */
  extra?: string[];
};

// ── Образование форм ────────────────────────────────────────────────────────
//
// ГРАБЛИ. Правила ниже описывают обычный глагол, а be и have не обычные: по
// правилу выходит «bes», «bing» и «haves». В таблице форм этого не видно —
// вторая и третья формы там прописаны руками, — зато прекрасно видно в вариантах
// ответа, куда третье лицо и -ing попадают как ловушки. Ученик отбрасывает такое
// слово, не зная языка вообще, и выбор перестаёт быть выбором.
//
// Исключения заданы списком, а не хитрым правилом: правила для них нет, есть
// ровно два глагола, зато самых частых в языке.

const IRREGULAR_PRESENT: Record<string, { third: string; ing: string }> = {
  be: { third: "is", ing: "being" },
  have: { third: "has", ing: "having" },
};

/** Третье лицо: he goes, she watches, it studies, he is, he has. */
export function thirdPerson(base: string): string {
  const special = IRREGULAR_PRESENT[base];
  if (special) return special.third;
  if (/(s|sh|ch|x|z|o)$/.test(base)) return `${base}es`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ies`;
  return `${base}s`;
}

/** Причастие на -ing: make → making, run → running, be → being. */
export function ingForm(base: string): string {
  const special = IRREGULAR_PRESENT[base];
  if (special) return special.ing;
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

/** Сколько слов в готовой фразе. */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Фраза влезает в лимит своего уровня. */
export function fitsWords(text: string, level: CefrLevel): boolean {
  return wordCount(text) <= MAX_WORDS[level];
}
