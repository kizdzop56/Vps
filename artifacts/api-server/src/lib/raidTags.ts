// ─────────────────────────────────────────────────────────────────────────────
// Сложность и теги задания для рейда.
//
// Отдельный файл, потому что одно и то же нужно двум местам: перехватчику
// ответов в тренажёрах (routes/raidHook.ts) и практике внутри рейда
// (lib/raidSession.ts). Две копии этой таблицы неизбежно разъехались бы, и одно
// и то же упражнение начало бы бить по-разному в зависимости от того, откуда на
// него ответили.
//
// Ставки взяты из задумки события: выбор из четырёх — 10, ввод слова — 25,
// сборка предложения и развёрнутое аудирование — 50.
// ─────────────────────────────────────────────────────────────────────────────
import type { RaidDifficulty, RaidTag } from "./raid";

export interface TaskKind {
  difficulty: RaidDifficulty;
  tags: RaidTag[];
}

/**
 * Упражнение раздела «Слова» → сложность и теги.
 *
 * null — ответ ударом не считается: «знакомство» это не задание, там нет
 * верного и неверного.
 */
export function wordTaskKind(mode: unknown): TaskKind | null {
  switch (mode) {
    case "intro":
      return null;
    case "choiceRu":
    case "choiceEn":
      return { difficulty: "easy", tags: ["vocab"] };
    case "listen":
      return { difficulty: "easy", tags: ["listening", "vocab"] };
    case "build":
      return { difficulty: "medium", tags: ["vocab", "wordorder"] };
    case "typeRu":
    case "typeEn":
      return { difficulty: "medium", tags: ["vocab", "synonyms"] };
    case "speak":
      return { difficulty: "hard", tags: ["pronunciation", "vocab"] };
    default:
      // Неизвестный режим считаем самым дешёвым: завысить сложность подделкой
      // не должно получаться.
      return { difficulty: "easy", tags: ["vocab"] };
  }
}

/**
 * Задание раздела «Составлять» → сложность и теги.
 *
 * kind — вид задания из банка («tense», «verbs», «build», «forms»). Читается
 * строкой: формат номеров заданий это внутреннее дело банка, и рейд не должен
 * от него зависеть.
 */
export function grammarTaskKind(kind: string, input: unknown): TaskKind {
  const difficulty: RaidDifficulty =
    input === "assemble" ? "hard" : input === "type" ? "medium" : "easy";

  const tags: RaidTag[] =
    kind === "tense" || kind === "verbs"
      ? ["grammar", "tenses"]
      : kind === "build"
        ? ["grammar", "wordorder", "phrasal"]
        : ["grammar"];

  return { difficulty, tags };
}
