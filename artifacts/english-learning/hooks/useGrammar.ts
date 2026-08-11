// Клиентский слой раздела «Составлять»: неправильные глаголы, времена, сборка
// предложений.
//
// apiFetch берётся из useFlashcards, а не пишется здесь заново: авторизация,
// разбор не-JSON ответа и текст ошибки должны быть общими на всё приложение.
// Две копии этой функции неизбежно разъедутся, и один раздел начнёт показывать
// внятную ошибку, а другой — белый экран.
import { apiFetch } from "@/hooks/useFlashcards";

export type GrammarMode = "verbs" | "tense" | "build";

/** Как отвечать на задание. */
export type GrammarInput = "type" | "choice" | "assemble";

export type GrammarCard = {
  id: string;
  mode: GrammarMode;
  level: string;
  /** Предложение с пропуском «___». Для режима сборки пусто. */
  text: string;
  /** Русский перевод. В режиме сборки это и есть задание. */
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
  /** Сколько заданий доступно на уровне (не только в этом заходе). */
  total: number;
  /** Номер этого захода: 0 — первый за день. */
  round?: number;
  /** Сколько заходов подряд идут без единого повтора. */
  batches?: number;
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

export type GrammarModeInfo = {
  id: GrammarMode;
  title: string;
  subtitle: string;
  taskCount: number;
  /** Сколько заходов подряд можно сделать, ни разу не повторившись. */
  batches?: number;
  verbCount?: number;
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

export const grammar = {
  getOverview: () => apiFetch<GrammarOverview>("/api/grammar/overview"),
  getStats: () => apiFetch<GrammarStats>("/api/grammar/stats"),
  /**
   * Подборка заданий.
   *
   * round — номер захода за день. Ноль — первый; дальше сервер отдаёт следующую
   * порцию банка, а не ту же самую. Без этого «Ещё заход» повторял только что
   * пройденные задания.
   */
  getSession: (mode: GrammarMode, tense?: string, round = 0) => {
    const p = new URLSearchParams({ mode });
    if (tense) p.set("tense", tense);
    if (round > 0) p.set("round", String(round));
    return apiFetch<GrammarSession>(`/api/grammar/session?${p.toString()}`);
  },
  /**
   * Проверить ответ.
   *
   * input влияет на ставку очков (письмо дороже выбора), и знает его только
   * клиент: сервер не помнит, какие задания выдал в этой сессии. Подделка даёт
   * максимум одно очко на ответ при дневном потолке — проверка обошлась бы
   * дороже, чем стоит.
   */
  check: (taskId: string, given: string, input: GrammarInput) =>
    apiFetch<GrammarVerdict>("/api/grammar/check", {
      method: "POST",
      body: JSON.stringify({ taskId, given, input }),
    }),
};

export default grammar;
