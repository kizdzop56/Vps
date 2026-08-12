// ─────────────────────────────────────────────────────────────────────────────
// Практика внутри рейда: задания, по которым бьют босса.
//
// ── Почему у рейда свои задания, а не переход в «Учёбу» ─────────────────────
// «Учёба» — это обучение: там знакомство со словом, интервальное повторение,
// разбор ошибки с правилом и объяснением, дневные нормы и очки. Рейд — это
// практика: ученик применяет то, что уже знает, быстро и подряд. Смешивать их
// нельзя в обе стороны:
//
//   • если бить босса из «Учёбы», рейд начинает диктовать темп обучению: ученик
//     гонит карточки ради урона, а интервальное повторение рассчитано на
//     обратное — на паузы;
//   • если тащить в рейд разбор ошибок и правила, бой превращается в урок, и
//     событие теряет то, зачем оно есть: короткие быстрые попадания.
//
// Поэтому здесь ОТДЕЛЬНАЯ подборка и отдельная проверка. В журналы учёбы
// (review_log, grammar_log) практика не пишет ничего: она не двигает интервалы
// повторения, не начисляет очки и не тратит дневные нормы. Единственный её
// результат — урон боссу.
//
// ── Без объяснений ошибок ───────────────────────────────────────────────────
// Ответ возвращает только «верно или нет» и правильный вариант. Ни разбора, ни
// правила, ни подсказки. Ошибся — увидел верный ответ, идёшь дальше; учиться
// приходят в «Учёбу».
//
// ── Подделать сложность нельзя ──────────────────────────────────────────────
// Ставка урона зависит от вида упражнения, а вид сервер ВОССТАНАВЛИВАЕТ сам:
// у слов buildExercise детерминирован (сид «слово + день»), у грамматики вид
// задания читается из банка по его номеру. Клиент присылает только сам ответ,
// поэтому «а пришлю-ка я самое дорогое задание» не работает.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "@workspace/db";
import { wordsTable, userCardStateTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { checkWritten } from "./answerCheck";
import { ensureSettings, levelsUpTo, toWordLike, visibleDeckIds } from "./flashcardsCore";
import { buildExercise, mulberry32, shuffle, type Exercise } from "./wordExercise";
import { LEVEL_ORDER, type CefrLevel } from "./grammar/verbs";
import { buildGrammarSession, checkGrammarAnswer, findTask } from "./grammar/engine";
import { grammarTaskKind, wordTaskKind } from "./raidTags";
import type { RaidDifficulty, RaidTag } from "./raid";

/** Сколько заданий в одном заходе. Дольше ученик не удержит темп. */
export const RAID_BATCH = 12;

/** Одно задание боя в том виде, в котором его видит клиент. */
export interface RaidTask {
  /** Ключ внутри захода: нужен только клиенту как key списка. */
  key: string;
  kind: "word" | "grammar";
  /** Номер слова или номер задания банка. */
  id: string;
  /** Что показать крупно. */
  prompt: string;
  /** Подсказка под заданием: перевод, пояснение, первая форма глагола. */
  hint?: string;
  /** Как отвечать. */
  input: "choice" | "type" | "assemble";
  /** Варианты (choice). */
  options?: string[];
  /** Плитки: буквы для слова или слова для предложения (assemble). */
  tiles?: string[];
  /** Язык ответа: нужен для клавиатуры. */
  answerLang?: "ru" | "en";
  /** Сколько урона даст попадание — ученик видит цену заранее. */
  damage: RaidDifficulty;
  tags: RaidTag[];
  /** Слово нужно озвучивать (аудирование). */
  listen?: boolean;
  /** Номер слова для озвучки. */
  wordId?: number;
}

/** Вид упражнения слова → как отвечать. */
function inputOf(exercise: Exercise): "choice" | "type" | "assemble" {
  if (exercise.type === "build") return "assemble";
  if (exercise.options && exercise.options.length > 0) return "choice";
  return "type";
}

/** Допустимые ответы упражнения слова. */
function expectedOf(exercise: Exercise): string[] {
  if (exercise.accept && exercise.accept.length > 0) return exercise.accept;
  return exercise.answer ? [exercise.answer] : [];
}

/**
 * Задание из слова.
 *
 * memoryLevel берётся из состояния ученика, а незнакомому слову ставится 2:
 * практика начинается с узнавания, но НЕ со «знакомства» — intro в бою не нужен,
 * там нечего проверять.
 *
 * Произношение из практики исключено (allowSpeak: false): микрофон в бою
 * означал бы, что каждый удар зависит от распознавания речи, а оно ошибается
 * тем чаще, чем быстрее темп.
 */
function wordTask(
  word: typeof wordsTable.$inferSelect,
  memoryLevel: number,
  pool: ReturnType<typeof toWordLike>[],
  now: Date,
): RaidTask | null {
  const exercise = buildExercise({
    word: toWordLike(word),
    memoryLevel: Math.max(2, memoryLevel),
    isNew: false,
    pool,
    now,
    allowSpeak: false,
  });
  if (exercise.type === "intro") return null;

  const kind = wordTaskKind(exercise.type);
  if (!kind) return null;

  const task: RaidTask = {
    key: `w${word.id}`,
    kind: "word",
    id: String(word.id),
    prompt: exercise.prompt,
    input: inputOf(exercise),
    damage: kind.difficulty,
    tags: kind.tags,
    wordId: word.id,
  };
  if (exercise.options) task.options = exercise.options;
  if (exercise.letters) task.tiles = exercise.letters;
  if (exercise.answerLang) task.answerLang = exercise.answerLang;
  if (exercise.type === "listen") task.listen = true;
  // Ответы клиенту не отдаём вовсе: и проверка, и ставка урона считаются на
  // сервере, а лишний правильный ответ в теле — это подсказка в консоли.
  return task;
}

/** Уровень ученика, как его понимают остальные разделы. */
async function levelOf(userId: number): Promise<CefrLevel> {
  const settings = await ensureSettings(userId);
  const raw = settings.placementLevel ?? "A1";
  return (LEVEL_ORDER.includes(raw as CefrLevel) ? raw : "A1") as CefrLevel;
}

/**
 * Заход практики: половина заданий на слова, половина на грамматику.
 *
 * Смешиваем намеренно: у босса недели свои слабости, и заход обязан давать
 * возможность по ним попасть. Подборка из одного раздела означала бы, что
 * против Дракона бесполезна половина недель.
 */
export async function buildRaidBatch(userId: number, now: Date = new Date()): Promise<RaidTask[]> {
  const level = await levelOf(userId);
  const rng = mulberry32(now.getTime() % 2147483647);

  // ── Слова ────────────────────────────────────────────────────────────────
  const deckIds = await visibleDeckIds(userId);
  const allowed = new Set(levelsUpTo(level));
  const words = deckIds.length > 0
    ? await db.select().from(wordsTable).where(inArray(wordsTable.deckId, deckIds))
    : [];
  const fitting = words.filter((w) => !w.cefrLevel || allowed.has(w.cefrLevel));
  const pool = fitting.map(toWordLike);

  const states = await db
    .select({ wordId: userCardStateTable.wordId, memoryLevel: userCardStateTable.memoryLevel })
    .from(userCardStateTable)
    .where(eq(userCardStateTable.userId, userId));
  const levelByWord = new Map(states.map((s) => [s.wordId, s.memoryLevel]));

  // Знакомые слова вперёд: практика это применение того, что уже проходили.
  const known = shuffle(fitting.filter((w) => levelByWord.has(w.id)), rng);
  const rest = shuffle(fitting.filter((w) => !levelByWord.has(w.id)), rng);

  const wordTasks: RaidTask[] = [];
  const half = Math.ceil(RAID_BATCH / 2);
  for (const word of [...known, ...rest]) {
    if (wordTasks.length >= half) break;
    const task = wordTask(word, levelByWord.get(word.id) ?? 2, pool, now);
    if (task) wordTasks.push(task);
  }

  // ── Грамматика ───────────────────────────────────────────────────────────
  // Режим выбираем случайно: своего прогресса у практики нет, а разные режимы
  // дают разные ставки урона (выбор, письмо, сборка).
  const modes = ["tense", "verbs", "build", "forms"] as const;
  const grammarTasks: RaidTask[] = [];
  const need = RAID_BATCH - wordTasks.length;

  for (let attempt = 0; attempt < modes.length && grammarTasks.length < need; attempt++) {
    const mode = modes[Math.floor(rng() * modes.length)] ?? "tense";
    const session = buildGrammarSession({
      mode,
      level,
      // Курсор ротации здесь не нужен: практика не ведёт учёт пройденного, а
      // случайный заход и так каждый раз даёт другую порцию банка.
      round: Math.floor(rng() * 40),
      consumed: 0,
      now,
    }) as { cards?: Array<Record<string, unknown>> };

    for (const card of session.cards ?? []) {
      if (grammarTasks.length >= need) break;
      const id = String(card["id"] ?? "");
      if (!id || grammarTasks.some((t) => t.id === id)) continue;
      const input = String(card["input"] ?? "choice");
      const kind = grammarTaskKind(String(card["mode"] ?? mode), input);
      const task: RaidTask = {
        key: `g${id}`,
        kind: "grammar",
        id,
        prompt: String(card["text"] ?? ""),
        input: input === "assemble" ? "assemble" : input === "type" ? "type" : "choice",
        damage: kind.difficulty,
        tags: kind.tags,
        answerLang: "en",
      };
      const ru = card["ru"];
      const base = card["base"];
      if (typeof ru === "string" && ru) task.hint = base ? `${ru} · ${String(base)}` : ru;
      else if (typeof base === "string" && base) task.hint = base;
      const options = card["options"];
      if (Array.isArray(options) && options.length > 0) task.options = options.map(String);
      const tiles = card["tiles"];
      if (Array.isArray(tiles) && tiles.length > 0) task.tiles = tiles.map(String);
      grammarTasks.push(task);
    }
  }

  return shuffle([...wordTasks, ...grammarTasks], rng).slice(0, RAID_BATCH);
}

export interface RaidVerdict {
  correct: boolean;
  /** Принято с опечаткой: ответ верный, написание показываем. */
  typo: boolean;
  /** Правильный ответ. Единственное, что ученик видит после ошибки. */
  expected: string[];
  difficulty: RaidDifficulty;
  tags: RaidTag[];
}

/**
 * Проверить ответ практики.
 *
 * null — задание не найдено. Эталон всегда берётся из базы или банка, из тела
 * запроса — только сам ответ ученика.
 */
export async function checkRaidAnswer(
  userId: number,
  kind: string,
  id: string,
  given: string,
  now: Date = new Date(),
): Promise<RaidVerdict | null> {
  if (kind === "grammar") {
    const verdict = checkGrammarAnswer(id, given);
    const found = findTask(id);
    if (!verdict || !found) return null;
    // Сложность считаем по виду задания из банка и по тому, есть ли у него
    // варианты: сборка дороже письма, письмо дороже выбора.
    const input = Array.isArray((found as { task?: { options?: unknown } }).task?.options)
      ? "choice"
      : String((found as { kind?: unknown }).kind ?? "") === "build"
        ? "assemble"
        : "type";
    const taskKind = grammarTaskKind(String((found as { kind?: unknown }).kind ?? ""), input);
    return {
      correct: verdict.correct,
      typo: !!verdict.typo,
      expected: verdict.expected ?? [],
      difficulty: taskKind.difficulty,
      tags: taskKind.tags,
    };
  }

  const wordId = Number(id);
  if (!Number.isInteger(wordId) || wordId <= 0) return null;

  const [word] = await db.select().from(wordsTable).where(eq(wordsTable.id, wordId));
  if (!word) return null;

  const [state] = await db
    .select({ memoryLevel: userCardStateTable.memoryLevel })
    .from(userCardStateTable)
    .where(and(eq(userCardStateTable.userId, userId), eq(userCardStateTable.wordId, wordId)));

  // Пул дистракторов на проверке не нужен, но buildExercise его требует, и от
  // него зависит ВЫБОР типа упражнения только через сам факт нехватки вариантов.
  // Берём слова той же колоды: этого достаточно, чтобы восстановить тот же тип,
  // что был выдан в заходе.
  const deckWords = await db.select().from(wordsTable).where(eq(wordsTable.deckId, word.deckId));
  const exercise = buildExercise({
    word: toWordLike(word),
    memoryLevel: Math.max(2, state?.memoryLevel ?? 2),
    isNew: false,
    pool: deckWords.map(toWordLike),
    now,
    allowSpeak: false,
  });

  const expected = expectedOf(exercise);
  const taskKind = wordTaskKind(exercise.type);
  if (!taskKind) return null;

  // Карточка без перевода — не повод засчитывать ошибку.
  if (expected.length === 0) {
    return { correct: true, typo: false, expected: [], difficulty: taskKind.difficulty, tags: taskKind.tags };
  }

  const verdict = checkWritten(given, expected);
  return {
    correct: verdict.correct,
    typo: verdict.typo,
    expected,
    difficulty: taskKind.difficulty,
    tags: taskKind.tags,
  };
}
