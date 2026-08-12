// ─────────────────────────────────────────────────────────────────────────────
// Ситуация от учителя: задание для модели и разбор её ответа.
//
// Отличие от свободного разговора (routes/voiceChat.ts) в одном: там Снежа
// болтает и поправляет, здесь она ИГРАЕТ РОЛЬ, которую задал учитель, и следит
// за целью задания. Всё остальное устроено так же, и намеренно: ученик не
// должен чувствовать, что попал к другому собеседнику.
//
// ── Ответ обязан быть JSON ──────────────────────────────────────────────────
// Экрану и серверу нужно ЗНАТЬ: была ошибка или нет, достигнута ли цель. Из
// свободного текста это не вытащить, поэтому модель отвечает объектом. Если
// формат всё же поехал, весь текст считается репликой, а фраза ученика верной:
// потерять ответ целиком хуже, чем один раз не заметить ошибку.
//
// ── Роль важнее вежливости ──────────────────────────────────────────────────
// Снежа в ситуации НЕ ведёт ученика за руку к цели и не подсказывает, о чём
// спросить: смысл задания в том, чтобы ученик сам добился своего. Она отвечает
// как персонаж — прохожий, продавец, врач, — и знает ровно то, что знал бы он.
// ─────────────────────────────────────────────────────────────────────────────

/** Строгость проверки, которую выбрал учитель. */
export type Strictness = "gentle" | "normal" | "strict";

export interface ScenarioPromptInput {
  /** Обстановка от учителя. */
  situation: string;
  /** Кем выступает Снежа. */
  role: string;
  /** Цель ученика. Пусто — задание по числу реплик. */
  goal: string | null;
  /** Дополнительные критерии: что спрашивать, каких слов ждать. */
  criteria: string[];
  strictness: Strictness;
  /** Уровень ученика словами: под него подбираются слова. */
  level: string | null;
  /** Имя ученика: переспрашивать его в задании незачем. */
  studentName: string | null;
  /** Сколько реплик ученик уже сказал и сколько нужно. */
  turns: number;
  turnsTarget: number;
  /** Цель уже засчитана. */
  goalReached: boolean;
}

const STRICTNESS_HINT: Record<Strictness, string> = {
  gentle:
    "Only mark a mistake when the sentence is really hard to understand. Ignore small slips, articles and word order if the meaning is clear.",
  normal:
    "Mark real mistakes in grammar, word choice, word order and spelling. Ignore capital letters, final punctuation and speech-to-text noise.",
  strict:
    "Mark every mistake, including articles, prepositions, verb forms and word order. Still ignore capital letters and final punctuation.",
};

/**
 * Задание для модели.
 *
 * Цель и критерии учителя идут отдельными блоками, а не одним текстом: модель
 * должна знать, что цель — это условие ЗАВЕРШЕНИЯ, а критерии — правила игры.
 */
export function scenarioSystemPrompt(input: ScenarioPromptInput): string {
  const lines: string[] = [
    `You are Snezha (Снежа), a friendly snow leopard cub. Right now you are ROLE-PLAYING with a child who is learning English.`,
    ``,
    `YOUR ROLE: ${input.role}`,
    `THE SITUATION: ${input.situation}`,
  ];

  if (input.goal) {
    lines.push(
      `THE STUDENT'S GOAL: ${input.goal}`,
      `Do NOT hand the goal to them and do NOT hint what to ask. Answer only what your character would answer. Set "goalDone" to true only when the student has really achieved the goal through the conversation.`,
    );
  } else {
    lines.push(`There is no special goal: just keep the role-play going naturally.`);
  }

  if (input.criteria.length > 0) {
    lines.push(``, `THE TEACHER ALSO ASKS:`);
    for (const rule of input.criteria.slice(0, 10)) lines.push(`- ${rule}`);
  }

  if (input.level) {
    lines.push(``, `The student's English level: ${input.level}. Keep your words that simple.`);
  }
  if (input.studentName) {
    lines.push(`The student's name is ${input.studentName}. You may use it, never ask for it.`);
  }

  lines.push(
    ``,
    `You ALWAYS answer with a single JSON object and nothing else. No markdown, no code fences:`,
    `{"ok": true|false, "fixed": "...", "issue": "...", "reply": "...", "goalDone": true|false}`,
    ``,
    `- "ok": true if the student's last message is correct English, false if it has a real mistake.`,
    `- "fixed": the same sentence written correctly. When "ok" is true, repeat it unchanged.`,
    `- "issue": ONE short sentence IN RUSSIAN naming the mistake, for a child. Empty string when "ok" is true.`,
    `- "reply": what your character says, ALWAYS in English, 1-3 short finished sentences.`,
    `- "goalDone": true only if the goal above is now achieved.`,
    ``,
    STRICTNESS_HINT[input.strictness],
    `IMPORTANT: a mistake does NOT stop the role-play. Stay in character, answer the student, and mention the correct wording briefly and kindly. Never break character to give a grammar lecture.`,
    `If the student writes in Russian, set "ok" to false, put the ENGLISH translation into "fixed", and in "issue" say in Russian that in this task they should speak English.`,
    `Never say you are an AI, a model or an assistant.`,
  );

  if (input.turnsTarget > 0) {
    const left = Math.max(0, input.turnsTarget - input.turns);
    lines.push(
      ``,
      `Progress: the student has said ${input.turns} of ${input.turnsTarget} lines${left <= 3 ? " — the task is nearly over, start wrapping the scene up naturally." : "."}`,
    );
  }
  if (input.goalReached) {
    lines.push(`The goal is already achieved. Keep "goalDone" true and finish the scene politely.`);
  }

  return lines.join("\n");
}

/**
 * Задание на итоговый разбор для учителя.
 *
 * Отдельный вызов, а не «попроси разбор в последней реплике»: разбор пишется
 * ПО-РУССКИ и для взрослого, а реплика — по-английски и для ребёнка. Смешивать
 * их в одном ответе значит получить и то и другое наполовину.
 */
export function summarySystemPrompt(): string {
  return [
    `You are an English teacher's assistant. You get a role-play transcript between a child learning English and a character.`,
    `Write a SHORT report FOR THE TEACHER, IN RUSSIAN, as plain text, 3-5 sentences:`,
    `1) did the student cope with the situation and the goal;`,
    `2) what mistakes repeat (name the type: времена, порядок слов, предлоги, лексика);`,
    `3) what to practise next.`,
    `No greetings, no markdown, no bullet symbols. Do not praise for nothing: if the student wrote one-word answers, say so.`,
  ].join("\n");
}

export interface ScenarioVerdict {
  ok: boolean;
  fixed: string;
  issue: string;
  reply: string;
  goalDone: boolean;
}

/**
 * Разобрать ответ модели.
 *
 * Берём подстроку от первой «{» до последней «}»: модели то и дело добавляют
 * ```json и пояснения, о чём их не просили.
 */
export function parseScenarioVerdict(raw: string): ScenarioVerdict {
  const fallback: ScenarioVerdict = {
    ok: true, fixed: "", issue: "", reply: raw.trim(), goalDone: false,
  };

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return fallback;

  try {
    const data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const reply = typeof data["reply"] === "string" ? data["reply"].trim() : "";
    if (!reply) return fallback;
    return {
      // Ошибкой считаем только явное false: пропущенное поле — «всё хорошо».
      ok: data["ok"] !== false,
      fixed: typeof data["fixed"] === "string" ? data["fixed"].trim() : "",
      issue: typeof data["issue"] === "string" ? data["issue"].trim() : "",
      reply,
      goalDone: data["goalDone"] === true,
    };
  } catch {
    return fallback;
  }
}

/** Уровень словами — тем же словарём, что в свободном разговоре. */
export const LEVEL_HINT: Record<string, string> = {
  starter: "absolute beginner, knows only a few words",
  beginner: "beginner",
  elementary: "elementary (A1-A2)",
  intermediate: "intermediate (B1)",
  upper_intermediate: "upper-intermediate (B2)",
  A1: "A1", A2: "A2", B1: "B1", B2: "B2", C1: "C1",
};

/**
 * Задание закрыто?
 *
 * Цель не засчитывается раньше MIN_TURNS_FOR_GOAL реплик: модель охотно ставит
 * goalDone на первой же фразе «where is the shop?», а задание — это разговор, а
 * не один вопрос.
 */
export const MIN_TURNS_FOR_GOAL = 3;

export function isAttemptComplete(input: {
  finishMode: string;
  turns: number;
  turnsTarget: number;
  goalReached: boolean;
  hasGoal: boolean;
}): boolean {
  const byTurns = input.turnsTarget > 0 && input.turns >= input.turnsTarget;
  const byGoal = input.hasGoal && input.goalReached && input.turns >= MIN_TURNS_FOR_GOAL;

  if (input.finishMode === "goal") return byGoal;
  if (input.finishMode === "both") return byTurns || byGoal;
  return byTurns;
}
