// ─────────────────────────────────────────────────────────────────────────────
// Общее ядро раздела «Слова».
//
// Разделение появилось потому, что routes/flashcards.ts дорос до двух тысяч
// строк и держал в себе две несвязанные вещи: управление колодами (CRUD,
// каталог, импорт, назначения ученикам) и сам тренажёр (очередь, ответы,
// статистика, марафон). Здесь лежит то, что нужно обеим половинам.
//
// Тренажёр живёт в routes/flashcardsLearn.ts, колоды — в routes/flashcards.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "@workspace/db";
import {
  decksTable,
  wordsTable,
  userCardStateTable,
  flashcardSettingsTable,
  reviewLogTable,
  deckAssignmentsTable,
  teacherStudentsTable,
  parentChildrenTable,
} from "@workspace/db";
import { eq, and, or, isNull, isNotNull, inArray, gte, sql } from "drizzle-orm";
import { isTeacher } from "./auth";
import {
  LEARNED_LEVEL,
  hardScore,
  isHardCard,
  startOfDay,
} from "./srs";
import { buildExercise, interleaveQueue, type WordLike } from "./wordExercise";
import { needsMoreStudy } from "./wordQueue";

export type WordRow = typeof wordsTable.$inferSelect;
export type StateRow = typeof userCardStateTable.$inferSelect;

/** Убрать null/undefined-поля: ответ должен соответствовать zod-схеме (optional). */
export function clean<T extends Record<string, any>>(o: T): T {
  const out: any = {};
  for (const k of Object.keys(o)) if (o[k] !== null && o[k] !== undefined) out[k] = o[k];
  return out;
}

// ── Доступ ──────────────────────────────────────────────────────────────────

/**
 * Может ли `viewer` смотреть данные ученика `studentId`: сам ученик, админ,
 * связанный учитель (accepted) или родитель ребёнка.
 */
export async function canViewStudent(
  viewer: { userId: number; role: string },
  studentId: number,
): Promise<boolean> {
  if (viewer.userId === studentId) return true;
  if (viewer.role === "admin") return true;
  if (isTeacher(viewer.role)) {
    const [ts] = await db.select({ id: teacherStudentsTable.id }).from(teacherStudentsTable).where(and(
      eq(teacherStudentsTable.teacherId, viewer.userId),
      eq(teacherStudentsTable.studentId, studentId),
      eq(teacherStudentsTable.status, "accepted"),
    ));
    if (ts) return true;
  }
  if (viewer.role === "parent") {
    const [pc] = await db.select({ id: parentChildrenTable.id }).from(parentChildrenTable).where(and(
      eq(parentChildrenTable.parentId, viewer.userId),
      eq(parentChildrenTable.studentId, studentId),
    ));
    if (pc) return true;
  }
  return false;
}

export type ViewableDeck =
  | { ok: true; deck: typeof decksTable.$inferSelect; isOwner: boolean; assigned: boolean }
  | { ok: false; status: number; error: string };

/**
 * Колода, которую пользователю можно смотреть: системная, своя или назначенная
 * ему учителем. Возвращает и флаг владельца — по нему клиент решает, показывать
 * ли форму добавления слов, предпросмотр и отправку ученикам.
 */
export async function loadViewableDeck(
  user: { userId: number; role: string },
  deckId: number,
): Promise<ViewableDeck> {
  if (!Number.isInteger(deckId)) return { ok: false, status: 400, error: "Некорректный номер колоды" };
  const [deck] = await db.select().from(decksTable).where(eq(decksTable.id, deckId));
  if (!deck) return { ok: false, status: 404, error: "Колода не найдена" };

  const [assignedRow] = await db.select({ id: deckAssignmentsTable.id }).from(deckAssignmentsTable)
    .where(and(eq(deckAssignmentsTable.deckId, deckId), eq(deckAssignmentsTable.studentId, user.userId)));
  const isOwner = deck.ownerId === user.userId;
  const assigned = !!assignedRow;
  if (!deck.isSystem && !isOwner && !assigned && user.role !== "admin") {
    return { ok: false, status: 403, error: "Нет доступа к этой колоде" };
  }
  return { ok: true, deck, isOwner, assigned };
}

/** Колода принадлежит пользователю и её можно править (не системная). */
export async function assertOwnDeck(
  deckId: number,
  userId: number,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!Number.isInteger(deckId)) return { ok: false, status: 400, error: "Некорректный номер колоды" };
  const [deck] = await db.select().from(decksTable).where(eq(decksTable.id, deckId));
  if (!deck) return { ok: false, status: 404, error: "Колода не найдена" };
  // Раньше на чужую колоду отвечали «Готовые колоды нельзя редактировать» —
  // сообщение сбивало с толку, когда колода просто принадлежит другому.
  if (deck.isSystem) return { ok: false, status: 403, error: "Готовые колоды нельзя редактировать" };
  if (deck.ownerId !== userId) return { ok: false, status: 403, error: "Это чужая колода — её может менять только автор" };
  return { ok: true };
}

/**
 * Колоды, доступные ученику: системные + свои + назначенные учителем.
 * Скрытые колоды (hidden, например "misc_{level}") НЕ исключаются — их слова
 * должны попадать в сквозную сессию/марафон, только сама колода не видна
 * в списке колод на экране «Слова».
 */
export async function visibleDeckIds(userId: number): Promise<number[]> {
  const assignments = await db.select({ deckId: deckAssignmentsTable.deckId })
    .from(deckAssignmentsTable).where(eq(deckAssignmentsTable.studentId, userId));
  const assigned = assignments.map((a) => a.deckId);
  const decks = await db.select({ id: decksTable.id }).from(decksTable).where(or(
    isNull(decksTable.ownerId),
    eq(decksTable.ownerId, userId),
    assigned.length > 0 ? inArray(decksTable.id, assigned) : sql`false`,
  ));
  return decks.map((d) => d.id);
}

// ── Настройки ───────────────────────────────────────────────────────────────

/** Настройки пользователя; строка создаётся при первом обращении. */
export async function ensureSettings(userId: number) {
  const [existing] = await db.select().from(flashcardSettingsTable).where(eq(flashcardSettingsTable.userId, userId));
  if (existing) return existing;
  const [row] = await db.insert(flashcardSettingsTable).values({ userId }).onConflictDoNothing().returning();
  if (row) return row;
  const [again] = await db.select().from(flashcardSettingsTable).where(eq(flashcardSettingsTable.userId, userId));
  return again!;
}

// ── Уровни CEFR ─────────────────────────────────────────────────────────────

/** Порядок уровней CEFR — от начального к продвинутому. */
export const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

/**
 * Уровни, слова которых ученику можно показывать ВПЕРВЫЕ: его собственный и
 * все, что ниже.
 *
 * Раньше функция возвращала уровень и два сверху. В роли фильтра сессии такой
 * запас пропускал ровно то, от чего фильтр и нужен: в сквозной сессии слова
 * всех колод сортируются по sortOrder, а он нумеруется ВНУТРИ колоды — значит
 * новичку первым же словом прилетало слово номер ноль колоды верхнего уровня.
 *
 * Уровень не пройден — считаем ученика начинающим (A1), как и марафон.
 */
export function levelsUpTo(level: string | null | undefined): string[] {
  const idx = level ? CEFR_ORDER.indexOf(level) : 0;
  return CEFR_ORDER.slice(0, Math.max(0, idx) + 1);
}

/**
 * Уровни, для которых в готовых колодах ЕСТЬ слова.
 *
 * Нужны, чтобы не предлагать переход на уровень, которого нет в каталоге.
 * Сейчас каталог доходит до C1, и ученик, добравшийся до вершины, получал
 * предложение перейти на C2 — там ноль слов, и марафон превращался в тупик
 * без выхода.
 */
export async function availableCefrLevels(): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ level: wordsTable.cefrLevel })
    .from(wordsTable)
    .innerJoin(decksTable, eq(wordsTable.deckId, decksTable.id))
    .where(and(eq(decksTable.isSystem, true), isNotNull(wordsTable.cefrLevel)));
  return new Set(rows.map((r) => r.level).filter((l): l is string => !!l));
}

/** Следующий уровень, на который реально есть слова. null — выше некуда. */
export function nextAvailableLevel(level: string, available: ReadonlySet<string>): string | null {
  const idx = CEFR_ORDER.indexOf(level);
  if (idx < 0) return null;
  return CEFR_ORDER.slice(idx + 1).find((l) => available.has(l)) ?? null;
}

// ── Прогресс дня ────────────────────────────────────────────────────────────

/** Сколько разных слов ученик уже прошёл сегодня (граница суток — локальная). */
export async function dailyWordProgress(userId: number, goal: number, now: Date) {
  const rows = await db.select({ wordId: reviewLogTable.wordId }).from(reviewLogTable)
    .where(and(eq(reviewLogTable.userId, userId), gte(reviewLogTable.reviewedAt, startOfDay(now))));
  const wordsToday = new Set(rows.map((r) => r.wordId)).size;
  return { wordsToday, dailyWordGoal: goal, goalReached: wordsToday >= goal };
}

// ── Прогресс по колодам ─────────────────────────────────────────────────────

/**
 * Прогресс по колодам: сколько слов, выучено, к повторению и ещё не введено.
 * Считаем агрегатами и только по нужным колодам: раньше список колод читал
 * целиком таблицу слов и все состояния карточек пользователя.
 */
export async function deckStats(userId: number, deckIds: number[]): Promise<{
  wordCount: Map<number, number>;
  learned: Map<number, number>;
  due: Map<number, number>;
  introduced: Map<number, number>;
}> {
  const wordCount = new Map<number, number>();
  const learned = new Map<number, number>();
  const due = new Map<number, number>();
  const introduced = new Map<number, number>();
  if (deckIds.length === 0) return { wordCount, learned, due, introduced };

  const counts = await db
    .select({ deckId: wordsTable.deckId, n: sql<number>`count(*)::int` })
    .from(wordsTable)
    .where(inArray(wordsTable.deckId, deckIds))
    .groupBy(wordsTable.deckId);
  for (const c of counts) wordCount.set(c.deckId, Number(c.n));

  const states = await db
    .select({
      deckId: wordsTable.deckId,
      memoryLevel: userCardStateTable.memoryLevel,
      dueAt: userCardStateTable.dueAt,
    })
    .from(userCardStateTable)
    .innerJoin(wordsTable, eq(wordsTable.id, userCardStateTable.wordId))
    .where(and(eq(userCardStateTable.userId, userId), inArray(wordsTable.deckId, deckIds)));

  const now = Date.now();
  for (const st of states) {
    introduced.set(st.deckId, (introduced.get(st.deckId) ?? 0) + 1);
    if (st.memoryLevel >= LEARNED_LEVEL) learned.set(st.deckId, (learned.get(st.deckId) ?? 0) + 1);
    if (st.dueAt.getTime() <= now) due.set(st.deckId, (due.get(st.deckId) ?? 0) + 1);
  }
  return { wordCount, learned, due, introduced };
}

// ── Карточки тренажёра ──────────────────────────────────────────────────────

export const SESSION_MAX_CARDS = 24; // короткая сессия: дольше ребёнок не удержит внимание
export const SESSION_MAX_NEW = 6;    // сколько новых слов максимум за одну сессию
export const HARD_MAX_CARDS = 20;

/**
 * Часть речи, уровень и колода нужны для подбора отвлекающих вариантов:
 * buildExercise берёт дистракторы той же части речи и сначала из той же колоды,
 * затем из того же уровня CEFR.
 */
export function toWordLike(w: WordRow): WordLike {
  return {
    id: w.id,
    english: w.english,
    translationsRu: w.translationsRu,
    partOfSpeech: w.partOfSpeech,
    cefrLevel: w.cefrLevel,
    deckId: w.deckId,
  };
}

/** Карточка для клиента: слово + состояние ученика + готовое упражнение. */
export function trainerCard(w: WordRow, st: StateRow | undefined, pool: WordLike[], now: Date) {
  const isNew = !st;
  const memoryLevel = st?.memoryLevel ?? 0;
  return clean({
    id: w.id, deckId: w.deckId, english: w.english, partOfSpeech: w.partOfSpeech ?? undefined,
    translationsRu: w.translationsRu, ipa: w.ipa ?? undefined, exampleEn: w.exampleEn ?? undefined,
    exampleRu: w.exampleRu ?? undefined, cefrLevel: w.cefrLevel ?? undefined, emoji: w.emoji ?? undefined,
    memoryLevel, introduced: st?.introduced ?? false, isNew,
    exercise: buildExercise({ word: toWordLike(w), memoryLevel, isNew, pool, now }),
  });
}

export function stateForHard(st: StateRow) {
  return {
    wordId: st.wordId, memoryLevel: st.memoryLevel, lapses: st.lapses,
    timesSeen: st.timesSeen, timesCorrect: st.timesCorrect,
  };
}

/**
 * Очередь тренажёра по всем доступным колодам.
 *
 * scope = "all"  — сначала просроченные повторения, между ними новые слова
 *                  (в пределах дневной нормы и размера сессии);
 * scope = "hard" — только «сложные слова»: где были срывы или низкая точность.
 *
 * Новые слова ограничены уровнем подготовки (levelsUpTo): слова колод выше
 * своего уровня впервые не показываем. Повторения фильтру не подчиняются —
 * однажды введённое слово обязано возвращаться, каким бы ни стал уровень.
 *
 * Выученные слова (уровень памяти ≥ LEARNED_LEVEL) сюда НЕ попадают: их место
 * в марафоне. Слово, на котором ученик сорвался, падает ниже порога и
 * возвращается доучиваться само (см. lib/wordQueue.ts).
 */
export async function buildTrainerQueue(userId: number, scope: "all" | "hard", now: Date) {
  const settings = await ensureSettings(userId);
  const deckIds = await visibleDeckIds(userId);
  const words = deckIds.length > 0
    ? await db.select().from(wordsTable).where(inArray(wordsTable.deckId, deckIds))
    : [];
  const states = await db.select().from(userCardStateTable).where(eq(userCardStateTable.userId, userId));
  const stateByWord = new Map(states.map((s) => [s.wordId, s]));

  const all = words.map(toWordLike);

  // Слово без уровня (своя колода, колода учителя, ручной ввод) проходит
  // всегда: уровень ему никто не проставлял, и прятать его не за что.
  const allowedLevels = new Set(levelsUpTo(settings.placementLevel));
  const fitsLevel = (w: WordRow) => !w.cefrLevel || allowedLevels.has(w.cefrLevel);

  let picked: WordRow[];
  let newCount = 0;
  let reviewCount = 0;

  if (scope === "hard") {
    const byId = new Map(words.map((w) => [w.id, w]));
    picked = states
      .filter((st) => isHardCard(stateForHard(st)))
      .sort((a, b) => hardScore(stateForHard(b)) - hardScore(stateForHard(a)))
      .map((st) => byId.get(st.wordId))
      .filter((w): w is WordRow => Boolean(w))
      .slice(0, HARD_MAX_CARDS);
    reviewCount = picked.length;
  } else {
    // порядок датасета — это порядок обучения: сначала простые слова колоды
    const ordered = [...words].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    const due: WordRow[] = [];
    const fresh: WordRow[] = [];
    for (const w of ordered) {
      const st = stateByWord.get(w.id);
      if (!st) { if (fitsLevel(w)) fresh.push(w); }
      else if (needsMoreStudy(st, now)) due.push(w);
    }
    due.sort((a, b) => (stateByWord.get(a.id)!.dueAt.getTime() - stateByWord.get(b.id)!.dueAt.getTime()));

    // Дневная норма новых слов — общая для сессии (в отличие от режима колоды,
    // где она считается по каждой колоде отдельно).
    const dayStart = startOfDay(now).getTime();
    const introducedToday = states.filter((s) => s.createdAt.getTime() >= dayStart).length;
    const remainingNew = Math.max(0, settings.dailyNewLimit - introducedToday);
    const freshTaken = fresh.slice(0, Math.min(remainingNew, SESSION_MAX_NEW));
    const dueTaken = due.slice(0, Math.max(0, SESSION_MAX_CARDS - freshTaken.length));
    picked = interleaveQueue(dueTaken, freshTaken);
    newCount = freshTaken.length;
    reviewCount = dueTaken.length;
  }

  const progress = await dailyWordProgress(userId, settings.dailyWordGoal, now);
  return clean({
    scope,
    deckId: -1,
    deckTitle: scope === "hard" ? "Сложные слова" : "Учим слова",
    isSystem: true,
    needsIntro: false,
    newCount,
    reviewCount,
    ...progress,
    cards: picked.map((w) => trainerCard(w, stateByWord.get(w.id), all, now)),
  });
}
