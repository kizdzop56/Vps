// Клиентский слой тренажёров грамматики. Пока один режим — «Собери
// предложение» (/practice/sentences).
//
// Отдельный файл, а не строчка в useFlashcards.ts: тот уже на 22 КБ и целиком
// про слова. apiFetch переиспользуется оттуда — второй обёртки над fetch с
// подстановкой токена в проекте быть не должно.
import { apiFetch } from "@/hooks/useFlashcards";

/** Как отвечать: собрать из плиток или написать целиком. */
export type BuildMode = "tiles" | "write";

/**
 * Задание.
 *
 * АНГЛИЙСКОГО ПРЕДЛОЖЕНИЯ ЗДЕСЬ НЕТ, и это не забывчивость: сервер не присылает
 * эталон до ответа, иначе верный ответ видно в инструментах разработчика.
 * Отсутствие поля в типе — напоминание тому, кто захочет «добавить en для
 * удобства»: сначала прочитай, почему его нет (routes/practice.ts).
 */
export type BuildTask = {
  id: string;
  /** Русский перевод: по нему собирается фраза. */
  ru: string;
  /** Плитки со словами, включая лишние. Порядок уже перемешан сервером. */
  tokens: string[];
  mode: BuildMode;
  /** Сколько слов в ответе — подсказка по длине, особенно нужная при письме. */
  words: number;
};

export type BuildBatch = {
  level: string;
  tasks: BuildTask[];
};

export type BuildCheck = {
  correct: boolean;
  /** Эталон приходит только после ответа. */
  expected?: string;
  /** Правило одной фразой: показывается при разборе ошибки. */
  note?: string;
  /** Номер первого слова, где ответ разошёлся с эталоном (с 1). */
  firstWrongWord?: number;
  missing?: string[];
  extra?: string[];
  /**
   * Сервер не помнит это задание (перезапустился между выдачей и ответом).
   * Ошибкой не считается: ученик ни при чём.
   */
  unknown?: boolean;
};

export const practice = {
  getSentences: (count = 8, level?: string) => {
    const p = new URLSearchParams();
    p.set("count", String(count));
    if (level) p.set("level", level);
    return apiFetch<BuildBatch>(`/api/practice/sentences?${p.toString()}`);
  },

  checkSentence: (taskId: string, given: string) =>
    apiFetch<BuildCheck>("/api/practice/sentences/check", {
      method: "POST",
      body: JSON.stringify({ taskId, given }),
    }),
};

export default practice;
