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
export type DeckWithAssign = DeckWithProgress & { assigned?: boolean; assignedCount?: number };

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

// ── Конструктор колоды (эндпоинты добавлены вручную, без кодогенерации Orval) ──

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
  /** не показывать слова колоды, которую сейчас собираем */
  excludeDeckId?: number;
  /** добавить к каталогу собственные колоды пользователя */
  includeOwn?: boolean;
  limit?: number;
  offset?: number;
};

/** Слово, введённое учителем руками: перевод необязателен (найдёт Google Translate). */
export type ManualWordInput = { english: string; translationsRu?: string[] };

/** Итог массового добавления: что добавилось, что пропущено и что не прошло проверку. */
export type BulkAddResult = {
  added: number;
  skipped: number;
  failed: Array<{ english: string; reason: string }>;
};

/** Итог массового назначения. rejected — ученики, не привязанные к учителю. */
export type BulkAssignResult = {
  deckId: number;
  assigned: number;
  revoked: number;
  rejected: number[];
};

/** Ученик учителя — из /connections/teacher/students. */
export type TeacherStudent = {
  id: number;
  name: string;
  surname?: string | null;
  username?: string | null;
  role: string;
  avatarEmoji?: string | null;
  avatarColor?: string | null;
  avatarUrl?: string | null;
  knowledgeLevel?: string | null;
  totalPoints?: number;
  isOnline?: boolean;
};

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE_URL}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  if (res.status === 204) return null as T;
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Ошибка сервера");
  return data as T;
}

export const fc = {
  getDecks: () => apiFetch<DeckWithAssign[]>("/api/flashcards/decks"),
  getDeckWords: (deckId: number) => apiFetch<FlashcardWordWithEmoji[]>(`/api/flashcards/decks/${deckId}/words`),
  createDeck: (body: CreateDeckRequest) =>
    apiFetch<FlashcardDeck>("/api/flashcards/decks", { method: "POST", body: JSON.stringify(body) }),
  deleteDeck: (deckId: number) =>
    apiFetch<null>(`/api/flashcards/decks/${deckId}`, { method: "DELETE" }),
  // Переименовать свою колоду / сменить иконку и описание.
  updateDeck: (deckId: number, patch: { title?: string; emoji?: string; description?: string }) =>
    apiFetch<FlashcardDeck>(`/api/flashcards/decks/${deckId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  addWord: (deckId: number, body: AddWordRequest) =>
    apiFetch<FlashcardWord>(`/api/flashcards/decks/${deckId}/words`, { method: "POST", body: JSON.stringify(body) }),
  // ── Конструктор колоды ──────────────────────────────────────────────────
  // Каталог готовых слов: то, из чего учитель собирает подборку.
  searchCatalog: (query: CatalogQuery = {}) => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.theme) params.set("theme", query.theme);
    if (query.level) params.set("level", query.level);
    if (query.deckId) params.set("deckId", String(query.deckId));
    if (query.excludeDeckId) params.set("excludeDeckId", String(query.excludeDeckId));
    if (query.includeOwn) params.set("includeOwn", "1");
    if (query.limit) params.set("limit", String(query.limit));
    if (query.offset) params.set("offset", String(query.offset));
    const qs = params.toString();
    return apiFetch<CatalogPage>(`/api/flashcards/catalog/words${qs ? `?${qs}` : ""}`);
  },
  // Сохранить собранную подборку: слова каталога по id + слова, введённые руками.
  addWordsBulk: (deckId: number, body: { wordIds?: number[]; words?: ManualWordInput[] }) =>
    apiFetch<BulkAddResult>(`/api/flashcards/decks/${deckId}/words/bulk`, {
      method: "POST", body: JSON.stringify(body),
    }),
  // Убрать слово из своей колоды.
  deleteWord: (deckId: number, wordId: number) =>
    apiFetch<null>(`/api/flashcards/decks/${deckId}/words/${wordId}`, { method: "DELETE" }),
  importWords: (deckId: number, format: "csv" | "json", content: string) =>
    apiFetch<ImportResult>(`/api/flashcards/decks/${deckId}/import`, { method: "POST", body: JSON.stringify({ format, content }) }),
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
  unassignDeck: (deckId: number, studentId: number) =>
    apiFetch<null>(`/api/flashcards/decks/${deckId}/assign/${studentId}`, { method: "DELETE" }),
  getAssignees: (deckId: number) => apiFetch<number[]>(`/api/flashcards/decks/${deckId}/assignees`),
  // Отправить колоду сразу нескольким ученикам. replace = true синхронизирует
  // список получателей: остаются ровно переданные studentIds.
  assignDeckBulk: (deckId: number, studentIds: number[], replace = false) =>
    apiFetch<BulkAssignResult>(`/api/flashcards/decks/${deckId}/assign/bulk`, {
      method: "POST", body: JSON.stringify({ studentIds, replace }),
    }),
  // Ученики учителя — кому вообще можно отправить колоду.
  getTeacherStudents: () => apiFetch<TeacherStudent[]>("/api/connections/teacher/students"),
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
