// ─────────────────────────────────────────────────────────────────────────────
// Практика внутри рейда: задания, по которым бьют босса.
//
// ── Почему у рейда свои задания, а не переход в «Учёбу» ─────────────────────
// «Учёба» — это обучение: там знакомство со словом, интервальное повторение,
// разбор ошибки с правилом, дневные нормы и очки. Рейд — практика: ученик
// применяет то, что уже знает, быстро и подряд. Смешивать их нельзя в обе
// стороны:
//
//   • если бить босса из «Учёбы», рейд начинает диктовать темп обучению: ученик
//     гонит карточки ради урона, а интервальное повторение рассчитано на
//     обратное — на паузы;
//   • если тащить в рейд разбор ошибок и правила, бой превращается в урок, и
//     событие теряет то, зачем оно есть: короткие быстрые попадания.
//
// В журналы учёбы (review_log, grammar_log) практика не пишет ничего: она не
// двигает интервалы повторения, не начисляет очки и не тратит дневные нормы.
// Единственный её результат — урон боссу.
//
// ── Без объяснений ошибок ───────────────────────────────────────────────────
// Ответ возвращает только «верно или нет» и правильный вариант. Ни разбора, ни
// правила, ни подсказки. Ошибся — увидел верный ответ, идёшь дальше; учиться
// приходят в «Учёбу».
//
// ── Вопрос задаётся ФРАЗОЙ, а не голым словом ───────────────────────────────
// Здесь была настоящая несправедливость. На слове help ученик написал «помощь»,
// и ответ не приняли: в карточке стоит «помогать», а сравнение основ
// («помощ» против «помога») их не сводит. Ученик прав, приложение спорит.
//
// Причина не в проверке, а в вопросе: у одного английского слова несколько
// частей речи (help — и «помогать», и «помощь»; work — «работать» и «работа»),
// и голое слово в качестве задания попросту НЕ ОПРЕДЕЛЯЕТ, какой ответ ждут.
// Расширять список синонимов бессмысленно: сколько ни добавь, всегда найдётся
// верный ответ, которого в списке нет.
//
// Поэтому письменные задания боя устроены иначе: показывается ПРЕДЛОЖЕНИЕ с
// пропуском, под ним перевод этого предложения, а вписать надо пропущенное
// слово. Предложение само задаёт и часть речи, и смысл — вариантов ответа
// физически не остаётся:
//
//   Can you ___ me, please?      ·  Ты можешь мне помочь?      → help
//
// Свободного перевода одним словом («напиши перевод слова help») в рейде нет
// вовсе — это тот самый вопрос без однозначного ответа. Там, где предложения у
// карточки нет, письмо заменяется сборкой из букв: плитки ограничивают ответ и
// двусмысленности не оставляют.
//
// У заданий с выбором предложение показывается подсказкой — по той же причине:
// видно, в каком смысле спрашивают слово.
//
// ── Задания не повторяются ──────────────────────────────────────────────────
// Заучить ответы нельзя, и это обеспечено не случайностью, а памятью: каждое
// выданное задание пишется в raid_tasks. Дальше подборка работает так:
//
//   1. слова и задания банка, которые спрашивали за последние FRESH_DAYS дней,
//      в заход не попадают вовсе;
//   2. когда свежих не осталось (маленькая колода), берётся то, что спрашивали
//      РАНЬШЕ ВСЕГО, а не что попало;
//   3. слово, которое уже спрашивали, спрашивается ДРУГИМ способом: был выбор —
//      будет пропуск в предложении, был пропуск — сборка или аудирование.
//
// ── Способ ответа выдаёт сервер ─────────────────────────────────────────────
// Ставка урона зависит от способа (выбор 10, ввод 25, сборка 50), поэтому способ
// выбирается здесь и записывается в raid_tasks. Клиент присылает только номер
// выданного задания и сам ответ: подделать «я отвечал сборкой» нельзя, как и
// ответить на одно задание дважды — answered_at гасит повтор.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "@workspace/db";
import { wordsTable, userCardStateTable, raidTasksTable } from "@workspace/db";
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { checkWritten } from "./answerCheck";
import { ensureSettings, levelsUpTo, toWordLike, visibleDeckIds } from "./flashcardsCore";
import {
  MIN_OPTION_COUNT,
  OPTION_COUNT,
  buildOptions,
  isBuildable,
  letterTiles,
  mainTranslation,
  mulberry32,
  shuffle,
  type WordLike,
} from "./wordExercise";
import { LEVEL_ORDER, type CefrLevel } from "./grammar/verbs";
import { buildGrammarSession, checkGrammarAnswer } from "./grammar/engine";
import { grammarTaskKind, wordTaskKind } from "./raidTags";
import type { RaidDifficulty, RaidTag } from "./raid";

/** Сколько заданий в одном заходе. Дольше ученик не удержит темп. */
export const RAID_BATCH = 12;

/** Столько дней задание считается «недавним» и в подборку не берётся. */
export const FRESH_DAYS = 5;

/** Глубина истории, по которой считается ротация. */
const HISTORY_DAYS = 21;
/** Сколько строк истории читаем: больше для ротации не нужно. */
const HISTORY_LIMIT = 800;
/** Старше этого журнал заданий не нужен вовсе. */
const PRUNE_DAYS = 45;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Чем закрывается пропуск в предложении. */
const GAP = "____";

/**
 * Способы спросить слово в бою.
 *
 * Голого письменного перевода («напиши перевод слова») здесь нет: см. шапку.
 * Произношения тоже нет — микрофон в бою означал бы, что каждый удар зависит от
 * распознавания речи, а оно ошибается тем чаще, чем быстрее темп.
 */
export type WordMode = "choiceRu" | "choiceEn" | "listen" | "gap" | "build";

const WORD_MODES: readonly WordMode[] = ["choiceRu", "choiceEn", "listen", "gap", "build"];

/** Одно задание боя в том виде, в котором его видит клиент. */
export interface RaidTask {
  /** Номер ВЫДАННОГО задания. С ним же приходит ответ. */
  taskId: number;
  kind: "word" | "grammar";
  /** Что показать крупно. */
  prompt: string;
  /** Подсказка под заданием: перевод фразы, пояснение, первая форма глагола. */
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
  /** Задание на слух: слово нужно озвучить, а не показать. */
  listen?: boolean;
  /** Номер слова для озвучки. */
  wordId?: number;
}

type WordRow = typeof wordsTable.$inferSelect;

/** Готовая постановка вопроса по слову. */
interface WordQuestion {
  prompt: string;
  hint?: string;
  options?: string[];
  tiles?: string[];
  answerLang?: "ru" | "en";
  listen?: boolean;
  input: "choice" | "type" | "assemble";
}

/** Что принимаем за верный ответ при таком способе. */
function expectedFor(word: WordRow, mode: string): string[] {
  // Русского письменного ответа в бою нет, поэтому единственный случай, когда
  // ждут русский, — выбор варианта: там ответ сверяется со списком переводов.
  if (mode === "choiceRu" || mode === "listen") {
    return (word.translationsRu as string[]).map((t) => String(t).trim()).filter(Boolean);
  }
  return [word.english.trim()].filter(Boolean);
}

/** Экранирование для подстановки строки в регулярное выражение. */
function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Предложение с пропуском на месте слова.
 *
 * null — слово не встречается в примере дословно (пример написан с другой
 * формой: work → working). Подставлять пропуск вслепую нельзя: получится
 * предложение, к которому ответ не подходит.
 */
function gapSentence(word: WordRow): string | null {
  const sentence = (word.exampleEn ?? "").trim();
  const target = word.english.trim();
  if (!sentence || !target) return null;
  // Границы по не-буквам, а не \b: у словосочетаний и слов с апострофом \b
  // срабатывает внутри, и пропуск съедал бы половину фразы.
  const re = new RegExp(`(^|[^A-Za-z'])(${escapeRe(target)})(?=[^A-Za-z']|$)`, "i");
  if (!re.test(sentence)) return null;
  const masked = sentence.replace(re, (_m, before: string) => `${before}${GAP}`);
  return masked.includes(GAP) ? masked : null;
}

/** Какие способы к этому слову вообще применимы. */
function modesFor(word: WordRow): WordMode[] {
  const translation = mainTranslation(toWordLike(word));
  if (!translation) return [];
  const out: WordMode[] = ["choiceRu", "listen", "choiceEn"];
  // Письмо — только пропуском в предложении: голого перевода в бою нет.
  if (gapSentence(word)) out.push("gap");
  if (isBuildable(word.english)) out.push("build");
  return out.filter((m) => WORD_MODES.includes(m));
}

/**
 * Собрать вопрос по слову заданным способом.
 *
 * null — этим способом спросить нельзя: у выбора не набралось отвлекающих
 * вариантов, у пропуска нет подходящего примера. Тогда вызывающая сторона берёт
 * следующий способ.
 */
function askWord(
  word: WordRow,
  mode: WordMode,
  pool: WordLike[],
  rng: () => number,
): WordQuestion | null {
  const self = toWordLike(word);
  const translation = mainTranslation(self);
  const others = pool.filter((w) => w.id !== word.id);
  const target = { pos: word.partOfSpeech, level: word.cefrLevel, deckId: word.deckId };
  const exampleRu = (word.exampleRu ?? "").trim();
  const exampleEn = (word.exampleEn ?? "").trim();

  if (mode === "gap") {
    const sentence = gapSentence(word);
    if (!sentence) return null;
    return {
      prompt: sentence,
      // Перевод всей фразы: он и снимает двусмысленность части речи.
      hint: exampleRu || translation,
      answerLang: "en",
      input: "type",
    };
  }

  if (mode === "build") {
    return {
      prompt: translation,
      // Фраза-контекст, если есть: по ней видно, в каком смысле слово.
      ...(exampleRu ? { hint: exampleRu } : {}),
      tiles: letterTiles(word.english, rng),
      answerLang: "en",
      input: "assemble",
    };
  }

  if (mode === "choiceEn") {
    const { options } = buildOptions(
      word.english,
      others.map((w) => ({ text: w.english, pos: w.partOfSpeech, level: w.cefrLevel, deckId: w.deckId })),
      rng,
      [],
      OPTION_COUNT,
      target,
    );
    if (options.length < MIN_OPTION_COUNT) return null;
    return {
      prompt: translation,
      // Русская фраза ответа не выдаёт (ответ английский), зато показывает смысл.
      ...(exampleRu ? { hint: exampleRu } : {}),
      options,
      answerLang: "en",
      input: "choice",
    };
  }

  // choiceRu и listen отличаются только тем, показываем слово или озвучиваем.
  const { options } = buildOptions(
    translation,
    others.map((w) => ({
      text: mainTranslation(w),
      pos: w.partOfSpeech,
      level: w.cefrLevel,
      deckId: w.deckId,
    })),
    rng,
    word.translationsRu as string[], // прочие переводы этого же слова неверными не бывают
    OPTION_COUNT,
    target,
  );
  if (options.length < MIN_OPTION_COUNT) return null;

  if (mode === "listen") {
    // В аудировании подсказки нет вовсе: английская фраза на экране — это
    // готовый ответ, а русская сузила бы задание до чтения перевода.
    return { prompt: word.english, options, answerLang: "ru", input: "choice", listen: true };
  }
  return {
    prompt: word.english,
    // Английская фраза: показывает, в каком смысле спрашивают слово, но перевод
    // не подсказывает.
    ...(exampleEn ? { hint: exampleEn } : {}),
    options,
    answerLang: "ru",
    input: "choice",
  };
}

/** Уровень ученика, как его понимают остальные разделы. */
async function levelOf(userId: number): Promise<CefrLevel> {
  const settings = await ensureSettings(userId);
  const raw = settings.placementLevel ?? "A1";
  return (LEVEL_ORDER.includes(raw as CefrLevel) ? raw : "A1") as CefrLevel;
}

/** Что уже спрашивали: когда последний раз и какими способами. */
interface History {
  /** Ключ «kind:ref» → время последнего показа. */
  lastAt: Map<string, number>;
  /** Ключ «kind:ref» → использованные способы. */
  modes: Map<string, Set<string>>;
  /** Ключи, показанные за последние FRESH_DAYS дней. */
  fresh: Set<string>;
}

async function loadHistory(userId: number, now: Date): Promise<History> {
  const rows = await db
    .select({
      kind: raidTasksTable.kind,
      ref: raidTasksTable.ref,
      mode: raidTasksTable.mode,
      issuedAt: raidTasksTable.issuedAt,
    })
    .from(raidTasksTable)
    .where(and(
      eq(raidTasksTable.userId, userId),
      gte(raidTasksTable.issuedAt, new Date(now.getTime() - HISTORY_DAYS * DAY_MS)),
    ))
    .orderBy(sql`${raidTasksTable.issuedAt} desc`)
    .limit(HISTORY_LIMIT);

  const lastAt = new Map<string, number>();
  const modes = new Map<string, Set<string>>();
  const fresh = new Set<string>();
  const freshEdge = now.getTime() - FRESH_DAYS * DAY_MS;

  for (const row of rows) {
    const key = `${row.kind}:${row.ref}`;
    const at = row.issuedAt.getTime();
    if (!lastAt.has(key) || at > lastAt.get(key)!) lastAt.set(key, at);
    const set = modes.get(key) ?? new Set<string>();
    set.add(row.mode);
    modes.set(key, set);
    if (at >= freshEdge) fresh.add(key);
  }

  return { lastAt, modes, fresh };
}

/** Журнал не нужен вечно: ротации хватает истории за три недели. */
async function pruneHistory(userId: number, now: Date): Promise<void> {
  await db
    .delete(raidTasksTable)
    .where(and(
      eq(raidTasksTable.userId, userId),
      lt(raidTasksTable.issuedAt, new Date(now.getTime() - PRUNE_DAYS * DAY_MS)),
    ));
}

/** Заготовка задания до записи в журнал. */
interface Draft {
  kind: "word" | "grammar";
  ref: string;
  mode: string;
  difficulty: RaidDifficulty;
  tags: RaidTag[];
  question: WordQuestion;
  wordId?: number;
}

/**
 * Заход практики: половина заданий на слова, половина на грамматику.
 *
 * Смешиваем намеренно: у босса недели свои слабости, и заход обязан давать
 * возможность по ним попасть. Подборка из одного раздела означала бы, что против
 * Дракона бесполезна половина недель.
 */
export async function buildRaidBatch(userId: number, now: Date = new Date()): Promise<RaidTask[]> {
  const level = await levelOf(userId);
  // Сид от текущего времени: два захода подряд перемешиваются по-разному, а
  // порядок внутри одного захода остаётся воспроизводимым.
  const rng = mulberry32((now.getTime() % 2147483647) || 1);
  const history = await loadHistory(userId, now);

  // ── Слова ────────────────────────────────────────────────────────────────
  const deckIds = await visibleDeckIds(userId);
  const allowed = new Set(levelsUpTo(level));
  const words = deckIds.length > 0
    ? await db.select().from(wordsTable).where(inArray(wordsTable.deckId, deckIds))
    : [];
  const fitting = words.filter((w) => !w.cefrLevel || allowed.has(w.cefrLevel));
  const pool = fitting.map(toWordLike);

  const states = await db
    .select({ wordId: userCardStateTable.wordId })
    .from(userCardStateTable)
    .where(eq(userCardStateTable.userId, userId));
  const known = new Set(states.map((s) => s.wordId));

  // Порядок отбора: сначала то, что в рейде ещё не спрашивали (знакомое ученику
  // вперёд), потом то, что спрашивали раньше всего. Свежесть важнее
  // знакомости — иначе маленькая колода крутила бы одни и те же слова.
  const untouched = fitting.filter((w) => !history.lastAt.has(`word:${w.id}`));
  const touched = fitting
    .filter((w) => history.lastAt.has(`word:${w.id}`))
    .sort((a, b) => (history.lastAt.get(`word:${a.id}`)! - history.lastAt.get(`word:${b.id}`)!));

  const wordOrder = [
    ...shuffle(untouched.filter((w) => known.has(w.id)), rng),
    ...shuffle(untouched.filter((w) => !known.has(w.id)), rng),
    // Повторно взятые идут по возрастанию давности: самое забытое первым, и
    // только в самом конце — то, что спрашивали на этой неделе.
    ...touched.filter((w) => !history.fresh.has(`word:${w.id}`)),
    ...touched.filter((w) => history.fresh.has(`word:${w.id}`)),
  ];

  const half = Math.ceil(RAID_BATCH / 2);
  const drafts: Draft[] = [];

  for (const word of wordOrder) {
    if (drafts.length >= half) break;
    const key = `word:${word.id}`;
    const used = history.modes.get(key) ?? new Set<string>();
    // Способы, которыми это слово ещё НЕ спрашивали, — вперёд: повтор слова
    // должен выглядеть новым вопросом, а не тем же экраном.
    const candidates = modesFor(word);
    if (candidates.length === 0) continue;
    const ordered = [
      ...shuffle(candidates.filter((m) => !used.has(m)), rng),
      ...shuffle(candidates.filter((m) => used.has(m)), rng),
    ];

    for (const mode of ordered) {
      const question = askWord(word, mode, pool, rng);
      if (!question) continue;
      const kind = wordTaskKind(mode);
      if (!kind) continue;
      drafts.push({
        kind: "word",
        ref: String(word.id),
        mode,
        difficulty: kind.difficulty,
        tags: kind.tags,
        question,
        wordId: word.id,
      });
      break;
    }
  }

  // ── Грамматика ───────────────────────────────────────────────────────────
  // Режимы перебираем все: у каждого своя ставка урона и свои теги, а заход
  // должен доставать до слабостей любого босса.
  const modes = ["tense", "verbs", "build", "forms"] as const;
  const need = RAID_BATCH - drafts.length;
  const seenRefs = new Set<string>();
  const grammarFresh: Draft[] = [];
  const grammarOld: Draft[] = [];

  for (const mode of shuffle([...modes], rng)) {
    if (grammarFresh.length >= need) break;
    // Заход банка случайный: у практики своего курсора ротации нет, а повторы
    // отсекает журнал.
    for (let attempt = 0; attempt < 3 && grammarFresh.length < need; attempt++) {
      const session = buildGrammarSession({
        mode,
        level,
        round: Math.floor(rng() * 40),
        consumed: 0,
        now,
      }) as { cards?: Array<Record<string, unknown>> };

      for (const card of session.cards ?? []) {
        const ref = String(card["id"] ?? "");
        if (!ref || seenRefs.has(ref)) continue;
        seenRefs.add(ref);

        const input = String(card["input"] ?? "choice");
        const normalized = input === "assemble" ? "assemble" : input === "type" ? "type" : "choice";
        const kind = grammarTaskKind(String(card["mode"] ?? mode), input);
        const options = card["options"];
        const tiles = card["tiles"];
        const ru = card["ru"];
        const base = card["base"];
        const hint = typeof ru === "string" && ru
          ? (typeof base === "string" && base ? `${ru} · ${base}` : ru)
          : (typeof base === "string" && base ? base : undefined);

        const draft: Draft = {
          kind: "grammar",
          ref,
          mode: normalized,
          difficulty: kind.difficulty,
          tags: kind.tags,
          question: {
            prompt: String(card["text"] ?? ""),
            input: normalized,
            answerLang: "en",
            ...(Array.isArray(options) && options.length > 0 ? { options: options.map(String) } : {}),
            ...(Array.isArray(tiles) && tiles.length > 0 ? { tiles: tiles.map(String) } : {}),
            ...(hint ? { hint } : {}),
          },
        };

        if (history.fresh.has(`grammar:${ref}`)) grammarOld.push(draft);
        else grammarFresh.push(draft);
        if (grammarFresh.length >= need) break;
      }
    }
  }

  // Сначала то, что давно не спрашивали, и только если не хватило — недавнее.
  grammarOld.sort((a, b) =>
    (history.lastAt.get(`grammar:${a.ref}`) ?? 0) - (history.lastAt.get(`grammar:${b.ref}`) ?? 0));
  drafts.push(...grammarFresh.slice(0, need));
  if (drafts.length < RAID_BATCH) drafts.push(...grammarOld.slice(0, RAID_BATCH - drafts.length));

  if (drafts.length === 0) return [];

  const mixed = shuffle(drafts, rng).slice(0, RAID_BATCH);

  // Записываем ВЫДАННОЕ: по этой записи считается ротация, проверяется ответ и
  // гасится повторная отправка.
  const saved = await db
    .insert(raidTasksTable)
    .values(mixed.map((d) => ({
      userId,
      kind: d.kind,
      ref: d.ref,
      mode: d.mode,
      difficulty: d.difficulty,
      tags: d.tags as string[],
      issuedAt: now,
    })))
    .returning({ id: raidTasksTable.id });

  void pruneHistory(userId, now).catch(() => {});

  return mixed.map((d, i) => {
    const task: RaidTask = {
      taskId: Number(saved[i]?.id ?? 0),
      kind: d.kind,
      prompt: d.question.prompt,
      input: d.question.input,
      damage: d.difficulty,
      tags: d.tags,
    };
    if (d.question.hint) task.hint = d.question.hint;
    if (d.question.options) task.options = d.question.options;
    if (d.question.tiles) task.tiles = d.question.tiles;
    if (d.question.answerLang) task.answerLang = d.question.answerLang;
    if (d.question.listen) task.listen = true;
    if (d.wordId != null) task.wordId = d.wordId;
    return task;
  }).filter((t) => t.taskId > 0);
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
 * Проверить ответ практики по номеру ВЫДАННОГО задания.
 *
 * null — задания нет, оно чужое или на него уже отвечали. Эталон берётся из базы
 * или из банка, из тела запроса — только сам ответ ученика.
 */
export async function checkRaidAnswer(
  userId: number,
  taskId: number,
  given: string,
  now: Date = new Date(),
): Promise<RaidVerdict | null> {
  // Отметку «отвечено» ставим сразу и условием: две одновременные отправки
  // одного задания дадут урон только один раз.
  const [row] = await db
    .update(raidTasksTable)
    .set({ answeredAt: now })
    .where(and(
      eq(raidTasksTable.id, taskId),
      eq(raidTasksTable.userId, userId),
      isNull(raidTasksTable.answeredAt),
    ))
    .returning();
  if (!row) return null;

  const difficulty = (row.difficulty as RaidDifficulty) ?? "easy";
  const tags = (row.tags ?? []) as RaidTag[];

  if (row.kind === "grammar") {
    const verdict = checkGrammarAnswer(row.ref, given);
    if (!verdict) return null;
    await db
      .update(raidTasksTable)
      .set({ correct: verdict.correct })
      .where(eq(raidTasksTable.id, row.id));
    return {
      correct: verdict.correct,
      typo: !!verdict.typo,
      expected: verdict.expected ?? [],
      difficulty,
      tags,
    };
  }

  const wordId = Number(row.ref);
  if (!Number.isInteger(wordId) || wordId <= 0) return null;
  const [word] = await db.select().from(wordsTable).where(eq(wordsTable.id, wordId));
  if (!word) return null;

  const expected = expectedFor(word, row.mode);
  // Карточка без перевода — не повод засчитывать ошибку.
  if (expected.length === 0) {
    await db.update(raidTasksTable).set({ correct: true }).where(eq(raidTasksTable.id, row.id));
    return { correct: true, typo: false, expected: [], difficulty, tags };
  }

  const verdict = checkWritten(given, expected);
  await db
    .update(raidTasksTable)
    .set({ correct: verdict.correct })
    .where(eq(raidTasksTable.id, row.id));

  return { correct: verdict.correct, typo: verdict.typo, expected, difficulty, tags };
}
