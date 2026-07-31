// Клиентский слой для флеш-карточек: авторизованный apiFetch + типизированные
// вызовы + озвучка через Web Speech API (без бэкенда/ключей). Типы берём из
// сгенерированного контракта (@workspace/api-client-react).
import authStorage from "@/utils/authStorage";
import { Platform } from "react-native";
import type {
  DeckWithProgress,
  FlashcardWord,
  FlashcardDeck,
  PlacementTest,
  PlacementResultResponse,
  PlacementAnswer,
  FlashcardStats,
  FlashcardSettings,
  ImportResult,
  CreateDeckRequest,
  AddWordRequest,
  StudyCard,
} from "@workspace/api-client-react";

// ── Тренажёр слов ───────────────────────────────────────────────────────────
// Упражнение приходит с сервера готовым (варианты ответа, буквы для сборки), см.
// api-server/src/lib/wordExercise.ts. Клиент только показывает задание и
// проверяет ответ, поэтому набор упражнений одинаков во всех режимах.
export type ExerciseType = "intro" | "choiceRu" | "choiceEn" | "listen" | "build";

export type Exercise = {
  type: ExerciseType;
  /** Что показать: английское слово (choiceRu/listen) или перевод (choiceEn/build). */
  prompt: string;
  options?: string[];
  answerIndex?: number;
  letters?: string[];
  answer?: string;
};

/** Оценка ответа — как в api-server/src/lib/srs.ts. */
export type Grade = "again" | "hard" | "good" | "easy";

/** Сам ответ ученика: оценку по нему выставляет сервер. */
export type AnswerInfo = {
  correct: boolean;
  attempts?: number;
  elapsedMs?: number;
  hintUsed?: boolean;
};

/** Карточка тренажёра: слово + картинка-подсказка + готовое упражнение. */
export type TrainerCard = StudyCard & { emoji?: string; exercise?: Exercise };

/** Прогресс цели дня по словам (приходит вместе с любой очередью и ответом). */
export type DailyWordProgress = {
  wordsToday: number;
  dailyWordGoal: number;
  goalReached: boolean;
};

/** Очередь тренажёра: колода, сквозная сессия или «сложные слова». */
export type TrainerQueue = Partial<DailyWordProgress> & {
  scope?: "all" | "hard";
  deckId: number;
  deckTitle: string;
  isSystem: boolean;
  needsIntro: boolean;
  newCount: number;
  reviewCount: number;
  cards: TrainerCard[];
};

/** Ответ сервера на оценку карточки: новое расписание, очки и цель дня. */
export type ReviewOutcome = DailyWordProgress & {
  wordId: number;
  grade: Grade;
  memoryLevel: number;
  dueAt: string;
  intervalMinutes: number;
  learned: boolean;
  justLearned: boolean;
  pointsEarned: number;
};

// «Марафон слов»: слова уровня пользователя + прогресс/точность и готовность
// к переходу на следующий уровень. Тип объявлен здесь (эндпоинт добавлен вручную,
// без кодогенерации Orval).
export type MarathonQueue = Partial<DailyWordProgress> & {
  level: string;
  nextLevel?: string;
  totalWords: number;
  answeredWords: number;
  seen: number;
  correct: number;
  accuracy: number;
  threshold: number;
  eligible: boolean;
  cards: TrainerCard[];
};

// Колода с прогрессом + поля назначения (эндпоинт расширен вручную, без Orval):
//   assigned      — колода назначена текущему ученику учителем
//   assignedCount — скольким ученикам колода назначена (видит владелец-учитель)
//   canEdit       — колода своя и не системная: можно добавлять слова и отправлять
//                   её ученикам. Раньше клиент выводил это из !isSystem, и для
//                   ещё не загруженной колоды получал запрет.
export type DeckWithAssign = DeckWithProgress & {
  assigned?: boolean;
  assignedCount?: number;
  canEdit?: boolean;
};

// Результат импорта + сами пропущенные слова: учителю важно понять, что именно
// не попало в колоду (поле добавлено вручную, без Orval).
export type ImportResultWithSkipped = ImportResult & { skippedWords?: string[] };

// Статистика слов + CEFR-уровень из placement-теста, сегодняшний прогресс к цели
// дня и число «сложных слов» (поля добавлены вручную, без Orval).
export type FlashcardStatsWithLevel = FlashcardStats & {
  placementLevel?: string | null;
  wordsToday?: number;
  learnedToday?: number;
  reviewsToday?: number;
  dailyWordGoal?: number;
  goalReached?: boolean;
  hardCount?: number;
};

// Настройки + цель дня по словам (поле добавлено вручную, без Orval).
export type FlashcardSettingsWithGoal = FlashcardSettings & { dailyWordGoal?: number };

// Слово колоды + картинка-подсказка (поле добавлено вручную, без Orval).
export type FlashcardWordWithEmoji = FlashcardWord & { emoji?: string };

// ── Каталог слов для конструктора колоды (эндпоинты добавлены вручную, без Orval) ──

// Слово из каталога: то же слово колоды + откуда оно взято. deckTitle и theme
// показываем подписью в конструкторе, чтобы учитель видел источник слова.
export type CatalogWord = FlashcardWordWithEmoji & { deckTitle?: string; theme?: string };

/** Страница каталога: total — сколько всего слов подошло под фильтры. */
export type CatalogPage = { total: number; words: CatalogWord[] };

/** Фильтры каталога. q ищет и по английскому, и по переводу. */
export type CatalogQuery = {
  q?: string;
  theme?: string;
  level?: string;
  /** только из одной колоды */
  deckId?: number;
  /** не показывать слова колоды, которую сейчас наполняем */
  excludeDeckId?: number;
  /** добавить к каталогу собственные колоды пользователя */
  includeOwn?: boolean;
  limit?: number;
  offset?: number;
};

/** Слово, введённое учителем руками: перевод необязателен (подберёт сервер). */
export type ManualWordInput = { english: string; translationsRu?: string[] };

/** Итог массового добавления: что добавилось, что пропущено и что не прошло проверку. */
export type BulkAddResult = {
  added: number;
  skipped: number;
  failed: Array<{ english: string; reason: string }>;
};

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

/** Сколько ждём ответ, прежде чем сказать, что сервер не отвечает. */
const REQUEST_TIMEOUT_MS = 45_000;

/**
 * Таймаут запроса, если платформа умеет AbortSignal.timeout (iOS 16+, все
 * актуальные браузеры). На старых версиях просто ждём столько, сколько нужно —
 * ломать запрос ради таймаута нельзя.
 */
function requestSignal(): AbortSignal | undefined {
  const ctor = (globalThis as { AbortSignal?: { timeout?: (ms: number) => AbortSignal } }).AbortSignal;
  return typeof ctor?.timeout === "function" ? ctor.timeout(REQUEST_TIMEOUT_MS) : undefined;
}

/** Понятный текст по коду ответа — когда сервер не прислал своего объяснения. */
function messageForStatus(status: number): string {
  if (status === 401 || status === 403) return "Похоже, сессия истекла. Войдите в приложение заново.";
  if (status === 404) return "Сервер не нашёл этот раздел. Обновите страницу.";
  if (status === 409) return "Такая запись уже есть.";
  if (status === 413) return "Слишком много данных за один раз.";
  if (status === 429) return "Слишком много запросов подряд. Подождите немного.";
  if (status === 502 || status === 503) return "Сервер недоступен или ещё запускается. Попробуйте через минуту.";
  if (status === 504) return "Сервер не ответил вовремя. Попробуйте ещё раз.";
  if (status >= 500) return "Внутренняя ошибка сервера. Попробуйте ещё раз.";
  return "Не удалось выполнить запрос.";
}

// Экспортируем: экраны колод дергают и соседние эндпоинты (список учеников),
// а каждый экран объявлял свою копию этой функции.
//
// Тело ответа разбираем сами, а не через res.json(), и только после проверки
// res.ok. Причина: при сбое сервер может ответить не JSON, а HTML — страницей
// ошибки express («Internal Server Error») или заглушкой прокси. res.json() на
// таком теле бросает системное исключение разбора, а экраны показывают его
// message как есть. На iOS Safari этот текст выглядит как «The string did not
// match the expected pattern.» — учитель видел его вместо причины сбоя при
// добавлении слов в колоду.
export async function apiFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
  const token = await authStorage.getItem("auth_token");

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      cache: "no-store",
      signal: requestSignal(),
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options?.headers ?? {}),
      },
    });
  } catch (err) {
    // Сюда попадаем, когда ответа нет вообще: нет сети, запрос оборван, таймаут.
    const name = (err as { name?: string } | null)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error("Сервер не ответил вовремя. Проверьте связь и попробуйте ещё раз.");
    }
    throw new Error("Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.");
  }

  if (res.status === 204) return null as T;

  const raw = await res.text().catch(() => "");
  let data: any = null;
  let parsed = false;
  if (raw.trim()) {
    try {
      data = JSON.parse(raw);
      parsed = true;
    } catch {
      parsed = false;
    }
  }

  if (!res.ok) {
    // Своё сообщение сервера показываем как есть — оно написано для учителя.
    const fromServer = parsed && typeof data?.error === "string" ? data.error.trim() : "";
    throw new Error(fromServer || messageForStatus(res.status));
  }
  if (!parsed) {
    if (!raw.trim()) return null as T;
    throw new Error("Сервер вернул неожиданный ответ. Обновите страницу и попробуйте ещё раз.");
  }
  return data as T;
}

export const fc = {
  getDecks: () => apiFetch<DeckWithAssign[]>("/api/flashcards/decks"),
  // Только свои колоды — быстрый список для учителя (раздел «Задания»).
  getMyDecks: () => apiFetch<DeckWithAssign[]>("/api/flashcards/decks?mine=1"),
  // Одна колода. Страница колоды раньше искала её в полном списке всех колод и,
  // пока список грузился, считала колоду ненайденной.
  getDeck: (deckId: number) => apiFetch<DeckWithAssign>(`/api/flashcards/decks/${deckId}`),
  getDeckWords: (deckId: number) => apiFetch<FlashcardWordWithEmoji[]>(`/api/flashcards/decks/${deckId}/words`),
  createDeck: (body: CreateDeckRequest) =>
    apiFetch<FlashcardDeck>("/api/flashcards/decks", { method: "POST", body: JSON.stringify(body) }),
  deleteDeck: (deckId: number) =>
    apiFetch<null>(`/api/flashcards/decks/${deckId}`, { method: "DELETE" }),
  addWord: (deckId: number, body: AddWordRequest) =>
    apiFetch<FlashcardWordWithEmoji>(`/api/flashcards/decks/${deckId}/words`, { method: "POST", body: JSON.stringify(body) }),
  deleteWord: (deckId: number, wordId: number) =>
    apiFetch<null>(`/api/flashcards/decks/${deckId}/words/${wordId}`, { method: "DELETE" }),
  // format "lines" — построчно «hello — привет»: так учитель набивает колоду
  // руками, не возясь с CSV. Перевод можно не писать, тогда его подберёт сервер.
  importWords: (deckId: number, format: "csv" | "json" | "lines", content: string) =>
    apiFetch<ImportResultWithSkipped>(`/api/flashcards/decks/${deckId}/import`, { method: "POST", body: JSON.stringify({ format, content }) }),
  // Каталог готовых слов: учитель отмечает нужные вместо набора руками.
  searchCatalog: (query: CatalogQuery = {}) => {
    const p = new URLSearchParams();
    if (query.q) p.set("q", query.q);
    if (query.theme) p.set("theme", query.theme);
    if (query.level) p.set("level", query.level);
    if (query.deckId) p.set("deckId", String(query.deckId));
    if (query.excludeDeckId) p.set("excludeDeckId", String(query.excludeDeckId));
    if (query.includeOwn) p.set("includeOwn", "1");
    if (query.limit) p.set("limit", String(query.limit));
    if (query.offset) p.set("offset", String(query.offset));
    const qs = p.toString();
    return apiFetch<CatalogPage>(`/api/flashcards/catalog/words${qs ? `?${qs}` : ""}`);
  },
  // Записать подборку: отмеченные слова каталога (wordIds) и свои слова (words)
  // одним запросом. Ответ разбирает итог: added / skipped / failed.
  addWordsBulk: (deckId: number, body: { wordIds?: number[]; words?: ManualWordInput[] }) =>
    apiFetch<BulkAddResult>(`/api/flashcards/decks/${deckId}/words/bulk`, { method: "POST", body: JSON.stringify(body) }),
  getStudyQueue: (deckId: number) => apiFetch<TrainerQueue>(`/api/flashcards/study/${deckId}`),
  // Сквозная сессия по всем колодам: сначала повторения, между ними новые слова.
  getSession: () => apiFetch<TrainerQueue>("/api/flashcards/session"),
  // «Сложные слова»: где были срывы или низкая точность.
  getHard: () => apiFetch<TrainerQueue>("/api/flashcards/hard"),
  getMarathon: () => apiFetch<MarathonQueue>("/api/flashcards/marathon"),
  // Оценка карточки. Обычно присылаем сам ответ (answer) — оценку по нему
  // выставляет сервер одинаковыми правилами для всех упражнений; grade нужен
  // для знакомства, где ответа как такового нет.
  review: (wordId: number, body: { grade?: Grade; answer?: AnswerInfo; mode?: ExerciseType }) =>
    apiFetch<ReviewOutcome>("/api/flashcards/review", {
      method: "POST",
      body: JSON.stringify({ wordId, ...body }),
    }),
  getPlacement: () => apiFetch<PlacementTest>("/api/flashcards/placement"),
  submitPlacement: (answers: PlacementAnswer[]) =>
    apiFetch<PlacementResultResponse>("/api/flashcards/placement", { method: "POST", body: JSON.stringify({ answers }) }),
  // studentId — статистика конкретного ученика (для учителя/родителя); без него
  // возвращается статистика самого пользователя.
  getStats: (studentId?: number) =>
    apiFetch<FlashcardStatsWithLevel>(`/api/flashcards/stats${studentId ? `?studentId=${studentId}` : ""}`),
  // Назначение колод ученику (учитель).
  assignDeck: (deckId: number, studentId: number) =>
    apiFetch<{ deckId: number; studentId: number }>(`/api/flashcards/decks/${deckId}/assign`, {
      method: "POST", body: JSON.stringify({ studentId }),
    }),
  // Отправить колоду сразу нескольким ученикам одним запросом.
  assignDeckMany: (deckId: number, studentIds: number[]) =>
    apiFetch<{ deckId: number; studentIds: number[] }>(`/api/flashcards/decks/${deckId}/assign`, {
      method: "POST", body: JSON.stringify({ studentIds }),
    }),
  unassignDeck: (deckId: number, studentId: number) =>
    apiFetch<null>(`/api/flashcards/decks/${deckId}/assign/${studentId}`, { method: "DELETE" }),
  getAssignees: (deckId: number) => apiFetch<number[]>(`/api/flashcards/decks/${deckId}/assignees`),
  // Какие колоды уже отправлены этому ученику — одним запросом вместо опроса
  // assignees по каждой колоде отдельно.
  getStudentAssignments: (studentId: number) =>
    apiFetch<number[]>(`/api/flashcards/assignments?studentId=${studentId}`),
  getSettings: () => apiFetch<FlashcardSettingsWithGoal>("/api/flashcards/settings"),
  // Дневная норма новых слов и/или цель дня по словам.
  updateSettings: (patch: { dailyNewLimit?: number; dailyWordGoal?: number }) =>
    apiFetch<FlashcardSettingsWithGoal>("/api/flashcards/settings", { method: "PATCH", body: JSON.stringify(patch) }),
};

// Озвучка английского текста. На web — Web Speech API (speechSynthesis),
// на нативе — expo-speech, если установлен (иначе тихо ничего не делает).
export function speak(text: string, lang = "en-US") {
  if (!text) return;
  try {
    if (Platform.OS === "web") {
      const w = globalThis as any;
      if (w.speechSynthesis && typeof w.SpeechSynthesisUtterance !== "undefined") {
        w.speechSynthesis.cancel();
        const u = new w.SpeechSynthesisUtterance(text);
        u.lang = lang;
        u.rate = 0.95;
        w.speechSynthesis.speak(u);
      }
      return;
    }
    // native: попытка через expo-speech, если пакет установлен (не обязателен).
    // Нелитеральный специфизатор — чтобы TS не требовал наличия модуля на web-сборке.
    const pkg = "expo-speech";
    (import(pkg) as Promise<any>)
      .then((m: any) => m?.speak?.(text, { language: lang }))
      .catch(() => {});
  } catch {
    /* no-op */
  }
}

// доступна ли озвучка (для показа/скрытия кнопки на web)
export function speechAvailable(): boolean {
  if (Platform.OS === "web") {
    return typeof (globalThis as any).speechSynthesis !== "undefined";
  }
  return true; // на нативе пытаемся expo-speech
}
