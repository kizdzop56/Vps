// Клиентский слой для флеш-карточек: авторизованный apiFetch + типизированные
// вызовы + озвучка через реальные записи носителей (TTS API) с fallback на
// Web Speech API / expo-speech.
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
export type ExerciseType = "intro" | "choiceRu" | "choiceEn" | "listen" | "build";

export type Exercise = {
  type: ExerciseType;
  prompt: string;
  options?: string[];
  answerIndex?: number;
  letters?: string[];
  answer?: string;
};

export type Grade = "again" | "hard" | "good" | "easy";

export type AnswerInfo = {
  correct: boolean;
  attempts?: number;
  elapsedMs?: number;
  hintUsed?: boolean;
};

export type TrainerCard = StudyCard & { emoji?: string; exercise?: Exercise };

export type DailyWordProgress = {
  wordsToday: number;
  dailyWordGoal: number;
  goalReached: boolean;
};

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

export type DeckWithAssign = DeckWithProgress & {
  assigned?: boolean;
  assignedCount?: number;
  canEdit?: boolean;
};

export type ImportResultWithSkipped = ImportResult & { skippedWords?: string[] };

export type FlashcardStatsWithLevel = FlashcardStats & {
  placementLevel?: string | null;
  wordsToday?: number;
  learnedToday?: number;
  reviewsToday?: number;
  dailyWordGoal?: number;
  goalReached?: boolean;
  hardCount?: number;
};

export type FlashcardSettingsWithGoal = FlashcardSettings & { dailyWordGoal?: number };

export type FlashcardWordWithEmoji = FlashcardWord & { emoji?: string };

export type CatalogWord = FlashcardWordWithEmoji & { deckTitle?: string; theme?: string };

export type CatalogPage = { total: number; words: CatalogWord[] };

export type CatalogQuery = {
  q?: string;
  theme?: string;
  level?: string;
  deckId?: number;
  excludeDeckId?: number;
  includeOwn?: boolean;
  limit?: number;
  offset?: number;
};

export type ManualWordInput = { english: string; translationsRu?: string[] };

export type BulkAddResult = {
  added: number;
  skipped: number;
  failed: Array<{ english: string; reason: string }>;
};

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

export async function apiFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
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
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Сервер вернул не JSON (статус ${res.status}). Начало ответа: ${text.slice(0, 120)}`,
    );
  }
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? "Ошибка сервера");
  return data as T;
}

export const fc = {
  getDecks: () => apiFetch<DeckWithAssign[]>("/api/flashcards/decks"),
  getMyDecks: () => apiFetch<DeckWithAssign[]>("/api/flashcards/decks?mine=1"),
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
  importWords: (deckId: number, format: "csv" | "json" | "lines", content: string) =>
    apiFetch<ImportResultWithSkipped>(`/api/flashcards/decks/${deckId}/import`, { method: "POST", body: JSON.stringify({ format, content }) }),
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
  addWordsBulk: (deckId: number, body: { wordIds?: number[]; words?: ManualWordInput[] }) =>
    apiFetch<BulkAddResult>(`/api/flashcards/decks/${deckId}/words/bulk`, { method: "POST", body: JSON.stringify(body) }),
  getStudyQueue: (deckId: number) => apiFetch<TrainerQueue>(`/api/flashcards/study/${deckId}`),
  getSession: () => apiFetch<TrainerQueue>("/api/flashcards/session"),
  getHard: () => apiFetch<TrainerQueue>("/api/flashcards/hard"),
  getMarathon: () => apiFetch<MarathonQueue>("/api/flashcards/marathon"),
  review: (wordId: number, body: { grade?: Grade; answer?: AnswerInfo; mode?: ExerciseType }) =>
    apiFetch<ReviewOutcome>("/api/flashcards/review", {
      method: "POST",
      body: JSON.stringify({ wordId, ...body }),
    }),
  getPlacement: () => apiFetch<PlacementTest>("/api/flashcards/placement"),
  submitPlacement: (answers: PlacementAnswer[]) =>
    apiFetch<PlacementResultResponse>("/api/flashcards/placement", { method: "POST", body: JSON.stringify({ answers }) }),
  getStats: (studentId?: number) =>
    apiFetch<FlashcardStatsWithLevel>(`/api/flashcards/stats${studentId ? `?studentId=${studentId}` : ""}`),
  assignDeck: (deckId: number, studentId: number) =>
    apiFetch<{ deckId: number; studentId: number }>(`/api/flashcards/decks/${deckId}/assign`, {
      method: "POST", body: JSON.stringify({ studentId }),
    }),
  assignDeckMany: (deckId: number, studentIds: number[]) =>
    apiFetch<{ deckId: number; studentIds: number[] }>(`/api/flashcards/decks/${deckId}/assign`, {
      method: "POST", body: JSON.stringify({ studentIds }),
    }),
  unassignDeck: (deckId: number, studentId: number) =>
    apiFetch<null>(`/api/flashcards/decks/${deckId}/assign/${studentId}`, { method: "DELETE" }),
  getAssignees: (deckId: number) => apiFetch<number[]>(`/api/flashcards/decks/${deckId}/assignees`),
  getStudentAssignments: (studentId: number) =>
    apiFetch<number[]>(`/api/flashcards/assignments?studentId=${studentId}`),
  getSettings: () => apiFetch<FlashcardSettingsWithGoal>("/api/flashcards/settings"),
  updateSettings: (patch: { dailyNewLimit?: number; dailyWordGoal?: number }) =>
    apiFetch<FlashcardSettingsWithGoal>("/api/flashcards/settings", { method: "PATCH", body: JSON.stringify(patch) }),
};

// ── Озвучка ─────────────────────────────────────────────────────────────────

// Клиентский кэш mp3-блобов по wordId: не скачивать аудио повторно при каждом тапе.
const _ttsCache = new Map<number, Blob>();

// Текущий <audio> на web: отменяется перед следующим воспроизведением,
// чтобы звуки не накладывались.
let _webAudio: any = null;

/**
 * Проиграть слово через /api/tts (записи носителей или нейронный TTS).
 *
 * • Первый запрос — скачивает mp3, кэширует в памяти;
 *   повторные тапы воспроизводятся мгновенно из кэша.
 * • 404 / 503 / сетевая ошибка — молча откатывается на speak().
 * • На web отменяет предыдущее воспроизведение перед новым.
 * • Не блокирует интерфейс (fire-and-forget).
 */
export function speakWord(wordId: number, text: string, lang = "en-US"): void {
  if (!text) return;
  _speakWordAsync(wordId, text, lang).catch(() => _speakFallback(text, lang));
}

async function _speakWordAsync(wordId: number, text: string, lang: string): Promise<void> {
  const token = await authStorage.getItem("auth_token");
  if (!token) throw new Error("no token");
  const url = `${BASE_URL}/api/tts?wordId=${wordId}`;

  if (Platform.OS === "web") {
    const w = globalThis as any;

    // Используем кэш: не качаем mp3 повторно при каждом тапе
    let blob = _ttsCache.get(wordId);
    if (!blob) {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      // 404 (слово без аудио) или 503 (сервис недоступен) → тихий fallback
      if (!resp.ok) throw new Error(`tts ${resp.status}`);
      blob = await resp.blob();
      _ttsCache.set(wordId, blob);
    }

    // Останавливаем предыдущее воспроизведение, чтобы звуки не накладывались
    if (_webAudio) {
      try { _webAudio.pause(); _webAudio.src = ""; } catch {}
      _webAudio = null;
    }

    const objUrl: string | undefined = w.URL?.createObjectURL(blob);
    if (!objUrl) throw new Error("URL API not available");

    const audio = new w.Audio(objUrl);
    _webAudio = audio;
    const cleanup = () => {
      try { w.URL.revokeObjectURL(objUrl); } catch {}
      if (_webAudio === audio) _webAudio = null;
    };
    audio.onended = cleanup;
    audio.onerror = cleanup;
    await audio.play();
    return;
  }

  // Нативное воспроизведение через expo-av (динамический импорт — не обязателен)
  const pkg = "expo-av";
  const av = await (import(pkg) as Promise<any>).catch(() => null);
  if (!av) throw new Error("expo-av not available");
  const { sound } = await av.Audio.Sound.createAsync(
    { uri: url, headers: { Authorization: `Bearer ${token}` } },
    { shouldPlay: true }
  );
  sound.setOnPlaybackStatusUpdate((status: any) => {
    if (status?.didJustFinish) sound.unloadAsync().catch(() => {});
  });
}

/**
 * Озвучить текст через Web Speech API (web) или expo-speech (native).
 *
 * Fallback-озвучка: роботизированная, без wordId.
 * Используй speakWord() когда есть id слова — получишь запись носителя.
 */
export function speak(text: string, lang = "en-US") {
  if (!text) return;
  _speakFallback(text, lang);
}

function _speakFallback(text: string, lang: string) {
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
  return true;
}
