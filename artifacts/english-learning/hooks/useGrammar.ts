// Клиентский слой раздела «Составлять»: формы глаголов, глагол в предложении,
// времена, сборка предложений, повторение ошибок.
//
// apiFetch берётся из useFlashcards, а не пишется здесь заново: авторизация,
// разбор не-JSON ответа и текст ошибки должны быть общими на всё приложение.
// Две копии этой функции неизбежно разъедутся, и один раздел начнёт показывать
// внятную ошибку, а другой — белый экран.
import { apiFetch } from "@/hooks/useFlashcards";

export type GrammarMode = "forms" | "verbs" | "tense" | "build";

/** Как отвечать на задание. */
export type GrammarInput = "type" | "choice" | "assemble";

export type GrammarCard = {
  id: string;
  mode: GrammarMode;
  level: string;
  /**
   * Что показать крупно: предложение с пропуском «___», первая форма глагола или
   * русское слово. В режиме сборки пусто.
   */
  text: string;
  /** Перевод или пояснение под заданием. */
  ru: string;
  /** Первая форма глагола — подсказка в скобках. */
  base?: string;
  input: GrammarInput;
  options?: string[];
  tiles?: string[];
  hint?: string;
  tense?: string;
};

export type GrammarSession = {
  mode: GrammarMode;
  level: string;
  tense?: string;
  /** Буква группы, если заход идёт по одной букве. */
  letter?: string;
  /** Сколько заданий доступно в этой подборке (не только в этом заходе). */
  total: number;
  /** Номер этого захода: 0 — первый за день. */
  round?: number;
  /** Сколько заходов подряд идут без единого повтора. */
  batches?: number;
  /**
   * Сколько заходов ещё пройдёт без повторов ПОСЛЕ этого.
   *
   * Считает сервер, потому что курсор ротации живёт в журнале ответов, а не в
   * состоянии экрана: по номеру захода на клиенте это место не вычислить.
   * Ноль — дальше пойдёт второй круг, и кнопка «Ещё заход» обязана сказать
   * об этом прямо.
   */
  freshLeft?: number;
  cards: GrammarCard[];
};

/**
 * Сводка по повторению ошибок.
 *
 * Отдельный блок, а не ещё один «режим» в списке: у повторения нет своего банка
 * заданий, есть только расписание. Сервер выводит его из журнала ответов
 * (api-server/src/lib/grammar/review.ts), клиент ничего не считает сам —
 * вторая копия правил интервалов разъехалась бы с первой на первой же правке.
 */
export type GrammarReviewInfo = {
  /** Сколько ошибок ждут повторения прямо сейчас. */
  due: number;
  /** Сколько ошибок вообще в работе: и созревшие, и те, что ждут срока. */
  pool: number;
  /**
   * Когда придёт ближайшая, если сейчас пусто. null — ждать нечего.
   *
   * Нужен ради честного пустого экрана: «ошибок к повторению нет» без
   * продолжения читается как «раздел кончился».
   */
  nextDueAt?: string | null;
};

/**
 * Заход повторения. Карточки те же, что в обычной подборке — они и есть те самые
 * задания, только отобранные по срокам, а не по курсору банка.
 */
export type GrammarReviewSession = {
  mode: "review";
  level: string;
  /** Сколько ошибок в работе всего. */
  total: number;
  /** Сколько созрело к этому моменту. */
  due: number;
  nextDueAt?: string | null;
  cards: GrammarCard[];
};

export type TenseInfo = {
  id: string;
  title: string;
  titleRu: string;
  level: string;
  formula: string;
  usage: string[];
  markers: string[];
  rule: string;
  taskCount: number;
  /** Сколько заходов без повторов набирается по этому времени. */
  batches?: number;
};

/**
 * Группа неправильных глаголов на одну букву — как столбик в таблице в конце
 * учебника. Буквы, на которых у ученика нет ни одного глагола, сервер не
 * отдаёт вовсе.
 */
export type VerbLetterGroup = {
  letter: string;
  /** Сколько глаголов на эту букву доступно. */
  verbCount: number;
  /** Сколько это вопросов: по три на глагол. */
  taskCount: number;
  /** Сколько глаголов группы уже знакомы — по ним вопросы идут письмом. */
  knownVerbs: number;
};

export type GrammarModeInfo = {
  id: GrammarMode;
  title: string;
  subtitle: string;
  taskCount: number;
  /** Сколько заходов подряд можно сделать, ни разу не повторившись. */
  batches?: number;
  verbCount?: number;
  /** Сколько глаголов ученик уже знает: по ним вопросы идут письмом. */
  knownVerbs?: number;
  /** Сколько буквенных групп доступно (только у режима форм). */
  letterCount?: number;
  tenseCount?: number;
};

export type GrammarOverview = {
  level: string;
  sessionSize: number;
  /** Очки за грамматику: взято сегодня и где потолок. */
  pointsToday?: number;
  pointsCap?: number;
  modes: GrammarModeInfo[];
  tenses: TenseInfo[];
  /** Буквенные группы форм глаголов, по алфавиту. */
  verbLetters?: VerbLetterGroup[];
  /** Повторение ошибок: сколько созрело и когда придёт следующее. */
  review?: GrammarReviewInfo;
};

/** Точность по одной теме: времени или глаголу. */
export type TopicStat = {
  topic: string;
  mode: GrammarMode;
  /** Понятное название: «Past Simple» или сам глагол. */
  title: string;
  /** Пояснение: русское имя времени или формы глагола с переводом. */
  subtitle: string;
  answers: number;
  correct: number;
  accuracy: number;
  /** Ответов достаточно, а точность ниже порога — тема требует внимания. */
  weak: boolean;
};

export type GrammarStats = {
  answers: number;
  correct: number;
  accuracy: number;
  pointsToday: number;
  pointsCap: number;
  /** Все темы, слабое первым. */
  topics: TopicStat[];
  /** Только слабые: по ним экран предлагает, чем заняться. */
  weak: TopicStat[];
  /** Повторение ошибок: та же сводка, что в оглавлении. */
  review?: GrammarReviewInfo;
};

/** Разбор ответа. mistake — что именно не так, rule — правило под разбором. */
export type GrammarVerdict = {
  correct: boolean;
  typo: boolean;
  expected: string[];
  full?: string;
  mistake?: { headline: string; detail: string };
  rule?: { title: string; text: string; usage: string[]; markers: string[] };
  /** Начислено за этот ответ — уже с учётом дневного потолка. */
  pointsEarned?: number;
  pointsToday?: number;
  pointsCap?: number;
};

/** Что запрашиваем: режим и, по обстоятельствам, время, букву и номер захода. */
export type GrammarSessionQuery = {
  mode: GrammarMode;
  /** Только для режима tense. */
  tense?: string;
  /** Только для режима forms: одна буква. Пусто — все буквы вперемешку. */
  letter?: string;
  /**
   * Номер захода внутри одного открытия экрана. Между входами курсор двигает не
   * он, а журнал ответов на сервере: иначе выход в оглавление обнулял бы
   * счётчик, и ученик получал бы те же двенадцать заданий. Здесь round
   * остаётся подстраховкой на случай ответов, не доехавших до сервера.
   */
  round?: number;
};

export const grammar = {
  getOverview: () => apiFetch<GrammarOverview>("/api/grammar/overview"),
  getStats: () => apiFetch<GrammarStats>("/api/grammar/stats"),
  /**
   * Подборка заданий.
   *
   * Параметры объектом, а не по порядку: их стало четыре, и вызов вида
   * getSession(mode, undefined, 0, "B") читался бы шарадой.
   */
  getSession: ({ mode, tense, letter, round = 0 }: GrammarSessionQuery) => {
    const p = new URLSearchParams({ mode });
    if (tense) p.set("tense", tense);
    if (letter) p.set("letter", letter);
    if (round > 0) p.set("round", String(round));
    return apiFetch<GrammarSession>(`/api/grammar/session?${p.toString()}`);
  },
  /**
   * Повторение ошибок: что созрело к этой минуте.
   *
   * Без параметров намеренно. Ни режима, ни номера захода здесь нет: набор задан
   * сроками, а не выбором ученика, и «следующий заход» — это просто повторный
   * запрос, потому что отвеченные задания к тому моменту уже уехали по срокам
   * вперёд.
   */
  getReview: () => apiFetch<GrammarReviewSession>("/api/grammar/review"),
  /**
   * Проверить ответ.
   *
   * input влияет на ставку очков (письмо дороже выбора), и знает его только
   * клиент: сервер не помнит, какие задания выдал в этой сессии. Подделка даёт
   * максимум одно очко на ответ при дневном потолке — проверка обошлась бы
   * дороже, чем стоит.
   *
   * Ручка одна и для обычного захода, и для повторения: режим и тема выводятся
   * из номера задания на сервере.
   */
  check: (taskId: string, given: string, input: GrammarInput) =>
    apiFetch<GrammarVerdict>("/api/grammar/check", {
      method: "POST",
      body: JSON.stringify({ taskId, given, input }),
    }),
};

export default grammar;
