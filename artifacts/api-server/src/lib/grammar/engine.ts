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
// Банки собираются из двух частей: написанного руками и сгенерированного из
// предложений-заготовок (sentenceUnits.ts). Движку разницы нет — он видит
// обычные задания.
//
// ── Два входа, одна карточка ────────────────────────────────────────────────
// Заданий сюда приходит два разных потока:
//   • обычный заход — порция банка по курсору ротации (buildGrammarSession);
//   • повторение ошибок — список номеров заданий, на которых ученик когда-то
//     споткнулся (buildReviewSession, расписание в lib/grammar/review.ts).
//
// Карточку в обоих случаях собирает ОДНА функция grammarCard(). Иначе повторение
// показывало бы задания в чуть другом виде, чем обычный заход: другие ловушки,
// другой способ ответа, другая подсказка — и расхождение никто бы не замечал
// месяцами, потому что оба экрана выглядят правильными по отдельности.
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
// И ещё: с появлением отрицаний ответы стали многословными, а опечатка в них
// считалась по всей строке целиком. «will not go» и «will not do» отличаются на
// одну правку — то есть совершенно другой глагол проходил бы как описка. Теперь
// опечатка ищется ПОСЛОВНО и только в словах от MIN_FUZZY_LENGTH букв, поэтому
// короткие служебные слова обязаны совпадать точно.
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
// ── Дистракторы у каждого вида задания свои, и это не прихоть ───────────────
// Вопрос «как по-английски покупать» — про слово, поэтому ловушки это другие
// ГЛАГОЛЫ (спутал buy с bring). Вопрос «вторая форма от buy» — про форму,
// поэтому ловушки это другие формы того же глагола плюс регуляризованное
// «buyed». В отрицании ловушки — другие отрицания целиком («do not go», «has not
// gone»): выбирать приходится и вспомогательный, и форму смыслового глагола.
//
// Модуль без БД и express — тесты в engine.test.ts, rotation.test.ts,
// forms.test.ts, generate.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { MIN_FUZZY_LENGTH, checkWritten, editDistance, normalizeAnswer } from "../answerCheck";
import { mulberry32, shuffle, daySeed } from "../wordExercise";
import { fitsLevel, verbByBase, type CefrLevel } from "./verbs";
import { diagnose, tenseById, type Tense } from "./tenses";
import {
  GAP,
  edForm,
  ingForm,
  thirdPerson,
  type AssembleTask,
  type TenseGapTask,
  type VerbGapTask,
} from "./core";
import { ASSEMBLE_TASKS, VERB_GAP_TASKS } from "./tasks";
import { TENSE_GAP_TASKS } from "./tenseBank";
import {
  formAnswers,
  formCard,
  formLine,
  formMistake,
  formRule,
  formTasksByLetter,
  formTasksUpTo,
  normalizeLetter,
  parseFormTask,
  type FormTask,
} from "./forms";

// Правила образования форм живут в core.ts: ими пользуется генератор заданий, а
// импортировать их отсюда он не может — движок сам зависит от банков, вышел бы
// круг. Реэкспорт оставлен, чтобы не переписывать чужие импорты и тесты.
export { edForm, ingForm, thirdPerson } from "./core";

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
  /** Что требуется от ученика словами: «Past Simple · вопрос», «вторая форма». */
  hint?: string;
  /** Время задания — только в режиме tense. */
  tense?: string;
};

/**
 * Задание, найденное по номеру. Тип общий для проверки ответа и для сборки
 * карточки: и там, и там нужно знать, из какого банка задание пришло.
 */
export type FoundTask =
  | { kind: "forms"; task: FormTask }
  | { kind: "verbs"; task: VerbGapTask }
  | { kind: "tense"; task: TenseGapTask }
  | { kind: "build"; task: AssembleTask };

/**
 * Все формы глагола. Нужны для двух вещей: дистракторы в заданиях с
 * предложениями и отсечение «опечаток», которые на самом деле другая форма.
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
// курсором. Курсор — номер дня плюс израсходованные заходы, то есть соседние
// шаги дают РАЗНЫЕ порции гарантированно, а не по удаче. Пройден полный круг по
// банку — порядок перетасовывается заново, и круг начинается другой.
//
// ── Курсор обязан пережить выход из раздела ─────────────────────────────────
//
// Сначала курсор складывался из номера дня и номера захода, а номер захода жил
// в состоянии экрана. Пока ученик не выходил, всё работало: «Ещё заход» давал
// следующую порцию. Стоило выйти в оглавление и войти снова — номер обнулялся,
// день тот же, и приходили ТЕ ЖЕ двенадцать заданий. Ровно на это и пожаловались:
// «решила все двенадцать, нажимаю „Учить формы“ снова, и опять они».
//
// Поэтому курсор считается по ЖУРНАЛУ ответов: сколько заходов ученик уже
// израсходовал в этом режиме (consumed = ответов / size). Журнал лежит в базе,
// поэтому курсор переживает и выход, и перезапуск приложения, и смену
// устройства — в отличие от любого счётчика на экране.
//
// Номер захода от клиента не выброшен, а взят в МАКСИМУМ с consumed. Причина
// приземлённая: часть ответов может не долететь до сервера (сеть мигнула), тогда
// consumed отстанет, и без round «Ещё заход» вернул бы ту же порцию. Максимум из
// двух двигается всегда, а вместе они не «складываются» и не проскакивают порции
// через одну — именно это и случилось бы при сложении.
//
// Плата, которую стоит назвать прямо: курсор непрерывный, поэтому второй заход
// сегодня — это первый заход завтра. Альтернатива (свой круг на каждый день)
// вернула бы случайное пересечение соседних дней. Повтор через сутки полезнее
// для памяти, чем повтор через минуту, поэтому выбран этот вариант.
//
// ── Сид: у каждой подборки свой ────────────────────────────────────────────
//
// В сид входят режим, время и буква. Иначе группы шли бы в ногу: буква B и буква
// C тасовались бы одинаково, и на одинаковом по объёму банке ученик получал бы
// глаголы в одном и том же порядке. И курсор у групп общий быть не может по той
// же причине — занятия по букве B не должны прокручивать букву C.

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
 * Сколько заходов ещё пройдёт БЕЗ ЕДИНОГО повтора до конца круга.
 *
 * Нужно подписи на кнопке «Ещё заход». Обещать бесконечную новизну нельзя: банк
 * конечен, и честнее предупредить, что дальше пойдёт второй круг, чем сделать
 * вид, что заданий бесконечно много.
 */
export function freshBatchesLeft(step: number, batches: number): number {
  const total = Math.max(1, batches);
  const cursor = Math.max(0, Math.trunc(step));
  return Math.max(0, total - 1 - (cursor % total));
}

/**
 * Порция заданий по курсору.
 *
 * @param step  курсор: номер дня плюс израсходованные заходы
 * @param seed  сид банка: у каждого режима, времени и буквы он свой
 */
export function rotateBatch<T>(pool: T[], size: number, step: number, seed: number): T[] {
  if (pool.length === 0) return [];
  const cursor = Math.max(0, Math.trunc(step));

  // Банка не хватает даже на один заход: отдаём всё, что есть, но порядок
  // меняем — иначе задания идут в одном и том же порядке каждый день. Это
  // обычное дело для группы на одну букву: один глагол — три вопроса.
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
 *
 * pool — подборка, из которой берутся ловушки. В группе на одну букву это
 * глаголы той же буквы, и так даже лучше: buy против bring и begin — выбор
 * труднее, чем buy против withdraw.
 */
function verbWordOptions(answers: string[], pool: FormTask[], rng: () => number): string[] {
  const taken = new Set(answers.map(normalizeAnswer));
  const others = [...new Set(pool.map((t) => t.verb.base))].filter(
    (b) => !taken.has(normalizeAnswer(b)),
  );
  const picked = shuffle(others, rng).slice(0, OPTION_COUNT - 1);
  return shuffle([answers[0] ?? "", ...picked], rng);
}

/**
 * Дистракторы к вопросу о форме: только то, что реально можно спутать.
 *
 * Свои остальные формы плюс регуляризованная на -ed («buyed», «comed») — самая
 * частая ошибка вообще. Третье лицо и -ing сюда НЕ идут: в вопросе про вторую
 * форму они не ответ ни при каком раскладе, а у неправильных глаголов такой
 * набор ещё и порождает мусор вроде «bing» от be — его ученик отбросит, не зная
 * языка, и выбор перестанет быть выбором.
 *
 * Если своих форм не хватило, добираем формы других глаголов подборки: спутать
 * went и bought — тоже осмысленная ошибка, и разбор называет её прямо.
 */
function formOptions(
  task: FormTask,
  answers: string[],
  pool: FormTask[],
  rng: () => number,
): string[] {
  const verb = task.verb;
  const taken = new Set(answers.map(normalizeAnswer));
  const own = [verb.base, ...verb.past, ...verb.participle, edForm(verb.base)].filter(
    (f) => !taken.has(normalizeAnswer(f)),
  );

  const picked = shuffle([...new Set(own)], rng).slice(0, OPTION_COUNT - 1);

  if (picked.length < OPTION_COUNT - 1) {
    const used = new Set([...taken, ...picked.map(normalizeAnswer)]);
    const alien = pool
      .filter((t) => t.verb.base !== verb.base)
      .map((t) => (task.kind === "participle" ? t.verb.participle[0] : t.verb.past[0]) ?? "")
      .filter((f) => f && !used.has(normalizeAnswer(f)));
    for (const f of shuffle([...new Set(alien)], rng)) {
      if (picked.length >= OPTION_COUNT - 1) break;
      picked.push(f);
      used.add(normalizeAnswer(f));
    }
  }

  return shuffle([answers[0] ?? "", ...picked], rng);
}

/** Вспомогательные глаголы: из них состоит ответ на вопрос вида «___ he like milk?». */
const AUXILIARIES = ["do", "does", "did", "is", "are", "was", "were", "have", "has", "will"];

const isOneWord = (value: string) => value.trim().split(/\s+/).length === 1;

/**
 * Регистр варианта равняется на ответ.
 *
 * Ответ в начале вопроса пишется с заглавной («Does he like milk?»), а формы
 * генерируются со строчной. Один вариант с большой буквы среди трёх маленьких —
 * подсказка, которую видно, не зная языка вообще.
 */
function matchCase(sample: string, word: string): string {
  const first = sample.charAt(0);
  const capitalized = !!first && first === first.toUpperCase() && first !== first.toLowerCase();
  if (!capitalized || !word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Дистракторы для времени.
 *
 * Набор зависит от того, что вообще спрашивают:
 *   вспомогательный   → другие вспомогательные (do/does/did/is/was/have/will);
 *   смысловой глагол  → другие его формы;
 *   отрицание целиком → другие отрицания целиком, со своими вспомогательными;
 *   утверждение       → та же форма, но от других времён.
 */
function tenseOptions(task: TenseGapTask, rng: () => number): string[] {
  const answer = task.accept[0] ?? "";
  const base = task.base;
  const verb = verbByBase(base);
  const past = verb?.past[0] ?? edForm(base);
  const participle = verb?.participle[0] ?? edForm(base);
  const ing = ingForm(base);

  let pool: string[];
  if (isOneWord(answer) && AUXILIARIES.includes(normalizeAnswer(answer))) {
    pool = AUXILIARIES;
  } else if (isOneWord(answer)) {
    pool = [base, thirdPerson(base), past, participle, ing];
  } else if (task.form === "negative") {
    pool = [
      `do not ${base}`, `does not ${base}`, `did not ${base}`, `will not ${base}`,
      `is not ${ing}`, `are not ${ing}`, `was not ${ing}`, `were not ${ing}`,
      `have not ${participle}`, `has not ${participle}`,
    ];
  } else {
    pool = [
      base,
      thirdPerson(base),
      past,
      `will ${base}`,
      `is ${ing}`,
      `are ${ing}`,
      `was ${ing}`,
      `have ${participle}`,
      `has ${participle}`,
    ];
  }

  const wrong = [...new Set(pool)].filter(
    (f) => normalizeAnswer(f) !== normalizeAnswer(answer),
  );
  const picked = shuffle(wrong, rng)
    .slice(0, OPTION_COUNT - 1)
    .map((f) => matchCase(answer, f));
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

/**
 * Подпись над заданием на время.
 *
 * Вид предложения назван прямо: фраза «He ___ milk» допускает и «likes», и
 * «does not like», и без подсказки задание было бы нерешаемым. Русский перевод
 * под заданием говорит о том же, но подсказка не должна зависеть от того,
 * прочитал ли ученик перевод.
 */
function tenseHint(task: TenseGapTask, title: string): string {
  if (task.form === "negative") return `${title} · отрицание`;
  if (task.form === "question") return `${title} · вопрос`;
  return title;
}

/** Что нужно знать сборщику карточки помимо самого задания. */
export type GrammarCardOpts = {
  /**
   * Порядковый номер в заходе. От него зависит способ ответа в режимах verbs и
   * tense: каждое CHOICE_EVERY-е задание даётся вариантами, остальные письмом.
   */
  index: number;
  now: Date;
  /**
   * Только для forms: глаголы, которые ученик уже знает. По ним спрашиваем
   * письмом, по остальным даём варианты.
   */
  mastered?: ReadonlySet<string>;
  /**
   * Только для forms: из чего брать ловушки. В заходе по одной букве это глаголы
   * той же буквы — так выбор труднее и осмысленнее.
   */
  formPool?: FormTask[];
};

/**
 * Собрать карточку из задания.
 *
 * Один код на обычный заход и на повторение ошибок: см. «Два входа, одна
 * карточка» в шапке файла.
 *
 * Плитки и варианты мешаются от НОМЕРА задания и дня, а не от позиции в заходе:
 * одно и то же задание в течение дня выглядит одинаково, сколько бы раз оно ни
 * попалось. Обновление экрана не должно перетасовывать варианты под руками.
 */
export function grammarCard(found: FoundTask, opts: GrammarCardOpts): GrammarCard {
  const rng = mulberry32(daySeed(opts.now) + textSeed(found.task.id));
  const choice = (opts.index + 1) % CHOICE_EVERY === 0;

  if (found.kind === "forms") {
    const task = found.task;
    const answers = formAnswers(task);
    const view = formCard(task);
    const pool = opts.formPool ?? formTasksUpTo(task.level);
    // Знакомый глагол пишем, незнакомый выбираем. Порог — FORM_MASTERY_HITS.
    const pick = !(opts.mastered ?? new Set<string>()).has(task.verb.base);
    return {
      id: task.id,
      mode: "forms",
      level: task.level,
      text: view.text,
      ru: view.ru,
      input: pick ? "choice" : "type",
      options: !pick
        ? undefined
        : task.kind === "toEn"
          ? verbWordOptions(answers, pool, rng)
          : formOptions(task, answers, pool, rng),
      hint: view.hint,
    };
  }

  if (found.kind === "build") {
    const task = found.task;
    return {
      id: task.id,
      mode: "build",
      level: task.level,
      text: "",
      ru: task.ru,
      input: "assemble",
      tiles: shuffle([...sentenceTiles(task.en), ...(task.extra ?? [])], rng),
      hint: "собери предложение по переводу",
    };
  }

  if (found.kind === "tense") {
    const task = found.task;
    const tense = tenseById(task.tense);
    return {
      id: task.id,
      mode: "tense",
      level: task.level,
      text: task.text,
      ru: task.ru,
      base: task.base,
      input: choice ? "choice" : "type",
      options: choice ? tenseOptions(task, rng) : undefined,
      hint: tenseHint(task, tense?.title ?? task.tense),
      tense: task.tense,
    };
  }

  const task = found.task;
  // Верный ответ достаём в переменную: в проекте включена строгая проверка
  // индексов, и answers[0] прямо в тернарнике имел бы тип string|undefined.
  const answers = verbGapAnswers(task);
  const main = answers[0];
  return {
    id: task.id,
    mode: "verbs",
    level: task.level,
    text: task.text,
    ru: task.ru,
    base: task.base,
    input: choice ? "choice" : "type",
    options: choice && main ? gapOptions(task.base, main, rng) : undefined,
    hint: verbFormHint(task),
  };
}

export type GrammarSessionResult = {
  cards: GrammarCard[];
  /** Сколько заданий доступно ученику в этом режиме вообще. */
  total: number;
  /** Номер захода: с ним подборка сдвигается на следующую порцию. */
  round: number;
  /** Сколько заходов подряд можно сделать без единого повтора. */
  batches: number;
  /** Сколько заходов осталось до конца круга: 0 — дальше второй круг. */
  freshLeft: number;
  /** Буква группы, если заход идёт по одной букве. */
  letter?: string;
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
  /**
   * Только для режима forms: буква, на которую идут глаголы. Пусто — все буквы
   * вперемешку (это режим повторения, см. шапку forms.ts).
   */
  letter?: string;
  now?: Date;
  size?: number;
  /** Номер захода за день: 0 — первый, дальше следующие порции банка. */
  round?: number;
  /**
   * Сколько заходов ученик уже израсходовал в этом режиме — по журналу ответов.
   * Именно это число двигает курсор между входами в раздел: счётчик на экране
   * обнуляется при выходе, журнал в базе — нет.
   */
  consumed?: number;
  /**
   * Глаголы, которые ученик уже знает (режим forms): по ним спрашиваем письмом,
   * по остальным — вариантами. Пусто — значит всё в первый раз.
   */
  mastered?: ReadonlySet<string>;
}): GrammarSessionResult {
  const now = opts.now ?? new Date();
  const size = Math.max(1, opts.size ?? SESSION_SIZE);
  const round = Math.max(0, Math.trunc(opts.round ?? 0));
  const consumed = Math.max(0, Math.trunc(opts.consumed ?? 0));
  // Буква нормализуется здесь же: дальше по коду ходит либо валидная заглавная
  // латинская буква, либо ничего.
  const letter = opts.mode === "forms" ? normalizeLetter(opts.letter) : null;
  const seed = textSeed(`${opts.mode}:${opts.tense ?? ""}:${letter ?? ""}`);
  // МАКСИМУМ, а не сумма: складывать значило бы проскакивать порции через одну
  // на каждом «Ещё заход» — журнал к этому моменту уже сдвинулся сам.
  const step = daySeed(now) + Math.max(consumed, round);

  if (opts.mode === "forms") {
    // Буква задана — берём только её глаголы. Именно на это и была просьба:
    // «если вкладка называется „на букву B“, там и должны попадаться глаголы
    // на B».
    const pool = letter ? formTasksByLetter(opts.level, letter) : formTasksUpTo(opts.level);
    const picked = rotateBatch(pool, size, step, seed);
    const batches = batchCount(pool.length, size);
    return {
      total: pool.length,
      round,
      batches,
      freshLeft: freshBatchesLeft(step, batches),
      ...(letter ? { letter } : {}),
      cards: picked.map((t: FormTask, i) =>
        grammarCard({ kind: "forms", task: t }, {
          index: i,
          now,
          ...(opts.mastered ? { mastered: opts.mastered } : {}),
          formPool: pool,
        }),
      ),
    };
  }

  if (opts.mode === "build") {
    const pool = pickTasks(ASSEMBLE_TASKS, opts.level);
    const picked = rotateBatch(pool, size, step, seed);
    const batches = batchCount(pool.length, size);
    return {
      total: pool.length,
      round,
      batches,
      freshLeft: freshBatchesLeft(step, batches),
      cards: picked.map((t: AssembleTask, i) =>
        grammarCard({ kind: "build", task: t }, { index: i, now }),
      ),
    };
  }

  if (opts.mode === "tense") {
    const all = pickTasks(TENSE_GAP_TASKS, opts.level);
    const pool = opts.tense ? all.filter((t) => t.tense === opts.tense) : all;
    const picked = rotateBatch(pool, size, step, seed);
    const batches = batchCount(pool.length, size);
    return {
      total: pool.length,
      round,
      batches,
      freshLeft: freshBatchesLeft(step, batches),
      cards: picked.map((t: TenseGapTask, i) =>
        grammarCard({ kind: "tense", task: t }, { index: i, now }),
      ),
    };
  }

  const pool = pickTasks(VERB_GAP_TASKS, opts.level);
  const picked = rotateBatch(pool, size, step, seed);
  const batches = batchCount(pool.length, size);
  return {
    total: pool.length,
    round,
    batches,
    freshLeft: freshBatchesLeft(step, batches),
    cards: picked.map((t: VerbGapTask, i) =>
      grammarCard({ kind: "verbs", task: t }, { index: i, now }),
    ),
  };
}

/**
 * Собрать заход ПОВТОРЕНИЯ ОШИБОК по готовому списку номеров.
 *
 * Расписание считает lib/grammar/review.ts, здесь только сборка карточек.
 * Ротации тут нет вовсе: порядок задан сроками повторения, а не курсором банка —
 * впереди то, что ждёт дольше всех.
 *
 * Неизвестный номер молча пропускается. Так и надо: в журнале лежат ответы за
 * всю историю, а банк меняется — переписанное задание не должно ронять заход
 * ошибкой «задание не найдено».
 */
export function buildReviewSession(opts: {
  ids: string[];
  level: CefrLevel;
  now?: Date;
  mastered?: ReadonlySet<string>;
}): GrammarCard[] {
  const now = opts.now ?? new Date();
  const formPool = formTasksUpTo(opts.level);
  const cards: GrammarCard[] = [];

  for (const id of opts.ids) {
    const found = findTask(id);
    if (!found) continue;
    cards.push(
      grammarCard(found, {
        index: cards.length,
        now,
        ...(opts.mastered ? { mastered: opts.mastered } : {}),
        formPool,
      }),
    );
  }

  return cards;
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
export function findTask(id: string): FoundTask | null {
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

/**
 * Опечатка ищется ПОСЛОВНО и только в длинных словах.
 *
 * Иначе многословный ответ ломает всю затею: «will not go» и «will not do»
 * отличаются на одну правку, то есть другой глагол проходил бы как описка.
 * Служебные слова короче MIN_FUZZY_LENGTH обязаны совпадать точно — «do» против
 * «does» это выбор, а не промах пальца.
 */
function typoAcceptable(given: string, matched: string): boolean {
  const g = normalizeAnswer(given).split(" ").filter(Boolean);
  const e = normalizeAnswer(matched).split(" ").filter(Boolean);
  if (g.length !== e.length) return false;

  let slips = 0;
  for (let i = 0; i < e.length; i++) {
    const a = g[i]!;
    const b = e[i]!;
    if (a === b) continue;
    if (b.length < MIN_FUZZY_LENGTH) return false;
    if (editDistance(a, b, 1) > 1) return false;
    slips += 1;
  }
  return slips <= 1;
}

/** Проверка с грамматической строгостью: см. шапку файла. */
function checkStrict(given: string, accept: string[], base?: string): { correct: boolean; typo: boolean } {
  const verdict = checkWritten(given, accept);
  if (!verdict.correct) return { correct: false, typo: false };
  // Точное совпадение — принимаем всегда.
  if (!verdict.typo) return { correct: true, typo: false };
  // Прощение опечатки отменяется, если ответ — другая форма глагола.
  if (base && isWrongForm(given, base, accept)) return { correct: false, typo: false };
  // …и если «опечатка» пришлась на служебное слово или на второе слово подряд.
  if (!typoAcceptable(given, verdict.matched ?? accept[0] ?? "")) {
    return { correct: false, typo: false };
  }
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
        // Вид предложения обязателен: без него разбор объяснял бы в вопросе
        // «Did you ___ to school?», что нужна вторая форма.
        const d = diagnose(given, task.accept[0] ?? "", tense, task.base, task.form);
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
