// Клиентский слой для флеш-карточек: авторизованный apiFetch + типизированные
// вызовы + озвучка через Web Speech API (без бэкенда/ключей). Типы берём из
// сгенерированного контракта (@workspace/api-client-react).
import authStorage from "@/utils/authStorage";
import { Platform } from "react-native";
import type {
  DeckWithProgress,
  FlashcardWord,
  FlashcardDeck,
  StudyQueue,
  ReviewResult,
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

// «Марафон слов»: слова уровня пользователя + прогресс/точность и готовность
// к переходу на следующий уровень. Тип объявлен здесь (эндпоинт добавлен вручную,
// без кодогенерации Orval).
export type MarathonQueue = {
  level: string;
  nextLevel?: string;
  totalWords: number;
  answeredWords: number;
  seen: number;
  correct: number;
  accuracy: number;
  threshold: number;
  eligible: boolean;
  cards: StudyCard[];
};

// Колода с прогрессом + поля назначения (эндпоинт расширен вручную, без Orval):
//   assigned      — колода назначена текущему ученику учителем
//   assignedCount — скольким ученикам колода назначена (видит владелец-учитель)
export type DeckWithAssign = DeckWithProgress & { assigned?: boolean; assignedCount?: number };

// Статистика слов + CEFR-уровень из placement-теста (добавлен вручную).
export type FlashcardStatsWithLevel = FlashcardStats & { placementLevel?: string | null };

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
  getDeckWords: (deckId: number) => apiFetch<FlashcardWord[]>(`/api/flashcards/decks/${deckId}/words`),
  createDeck: (body: CreateDeckRequest) =>
    apiFetch<FlashcardDeck>("/api/flashcards/decks", { method: "POST", body: JSON.stringify(body) }),
  deleteDeck: (deckId: number) =>
    apiFetch<null>(`/api/flashcards/decks/${deckId}`, { method: "DELETE" }),
  addWord: (deckId: number, body: AddWordRequest) =>
    apiFetch<FlashcardWord>(`/api/flashcards/decks/${deckId}/words`, { method: "POST", body: JSON.stringify(body) }),
  importWords: (deckId: number, format: "csv" | "json", content: string) =>
    apiFetch<ImportResult>(`/api/flashcards/decks/${deckId}/import`, { method: "POST", body: JSON.stringify({ format, content }) }),
  getStudyQueue: (deckId: number) => apiFetch<StudyQueue>(`/api/flashcards/study/${deckId}`),
  getMarathon: () => apiFetch<MarathonQueue>("/api/flashcards/marathon"),
  review: (wordId: number, result: "know" | "dont") =>
    apiFetch<ReviewResult>("/api/flashcards/review", { method: "POST", body: JSON.stringify({ wordId, result }) }),
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
  // Назначить колоду сразу списку учеников: присылаем итоговый состав, сервер
  // сам добавит новых и снимет лишних. Одним запросом вместо N.
  setAssignees: (deckId: number, studentIds: number[]) =>
    apiFetch<{ deckId: number; studentIds: number[]; added: number; removed: number }>(
      `/api/flashcards/decks/${deckId}/assignees`,
      { method: "PUT", body: JSON.stringify({ studentIds }) },
    ),
  getSettings: () => apiFetch<FlashcardSettings>("/api/flashcards/settings"),
  updateSettings: (dailyNewLimit: number) =>
    apiFetch<FlashcardSettings>("/api/flashcards/settings", { method: "PATCH", body: JSON.stringify({ dailyNewLimit }) }),
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
