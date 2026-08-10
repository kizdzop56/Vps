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
};

export type GrammarModeInfo = {
  id: GrammarMode;
  title: string;
  subtitle: string;
  taskCount: number;
  verbCount?: number;
  tenseCount?: number;
};

export type GrammarOverview = {
  level: string;
  sessionSize: number;
  modes: GrammarModeInfo[];
  tenses: TenseInfo[];
};

/** Разбор ответа. mistake — что именно не так, rule — правило под разбором. */
export type GrammarVerdict = {
  correct: boolean;
  typo: boolean;
  expected: string[];
  full?: string;
  mistake?: { headline: string; detail: string };
  rule?: { title: string; text: string; usage: string[]; markers: string[] };
};

export const grammar = {
  getOverview: () => apiFetch<GrammarOverview>("/api/grammar/overview"),
  getSession: (mode: GrammarMode, tense?: string) => {
    const p = new URLSearchParams({ mode });
    if (tense) p.set("tense", tense);
    return apiFetch<GrammarSession>(`/api/grammar/session?${p.toString()}`);
  },
  check: (taskId: string, given: string) =>
    apiFetch<GrammarVerdict>("/api/grammar/check", {
      method: "POST",
      body: JSON.stringify({ taskId, given }),
    }),
};

export default grammar;
