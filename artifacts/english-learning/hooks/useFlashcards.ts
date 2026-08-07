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
// typeRu / typeEn / speak — упражнения со свободным ответом: вариантов нет,
// ответ ученик достаёт из головы сам. Их проверяет сервер
// (POST /flashcards/check-answer), а не клиент: правила прощения регистра,
// артиклей и опечаток должны быть одни для веба и натива.
export type ExerciseType =
  | "intro"
  | "choiceRu"
  | "choiceEn"
  | "listen"
  | "build"
  | "typeRu"
  | "typeEn"
  | "speak";

export type Exercise = {
  type: ExerciseType;
  prompt: string;
  options?: string[];
  answerIndex?: number;
  letters?: string[];
  answer?: string;
  /** Все допустимые ответы (свободный ответ) — показываем после проверки. */
  accept?: string[];
  /** Язык ответа: нужен для клавиатуры и распознавания речи. */
  answerLang?: "ru" | "en";
  /** Сколько попыток даётся на произношение. */
  maxAttempts?: number;
};

export type Grade = "again" | "hard" | "good" | "easy";

export type AnswerInfo = {
  correct: boolean;
  attempts?: number;
  elapsedMs?: number;
  hintUsed?: boolean;
};

/** Ответ сервера на проверку письменного или устного ответа. */
export type AnswerCheck = {
  correct: boolean;
  /** Принято с опечаткой: показываем верное написание, но не наказываем. */
  typo: boolean;
  /** Попытки ещё остались (только для произношения) — просим повторить. */
  retry?: boolean;
  attemptsLeft?: number;
  maxAttempts?: number;
  expected: string[];
  matched?: string;
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
  /** Сколько слов уровня уже выучено — весь зал повторений. */
  learnedCount?: number;
  /** Сколько из них созрело к повторению прямо сейчас. */
  dueNow?: number;
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
  // Тема колоды («food», «travel», …). Сервер отдаёт её у каждой колоды, а
  // экран «Слова» по ней схлопывает колоды одной темы разных уровней в одну
  // строку: в title у системных колод стоит ещё и уровень, по нему не
  // сгруппируешь.
  theme?: string;
  // Имя владельца колоды (учителя) — для бейджа «От {ownerName}» у ученика.
  ownerName?: string;
  // ISO-дата создания — используется для сортировки «новые сверху» в общем
  // списке заданий и колод учителя (вкладка «Все» в разделе «Задания»).
  createdAt?: string;
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
  /**
   * Проверить свободный ответ: письмо или расшифровку произношения.
   *
   * Проверяет сервер, а не клиент: иначе веб и натив разойдутся в трактовке
   * («Кот.» против «кот», опечатка против ошибки) и ребёнок получит разные
   * оценки за один и тот же ответ на разных устройствах. Эталон сервер берёт из
   * базы по wordId — прислать свой «правильный ответ» нельзя.
   *
   * attempt нужен только для "speak": по нему сервер решает, дать ещё попытку
   * или засчитать ошибку.
   */
  checkAnswer: (wordId: number, mode: "typeRu" | "typeEn" | "speak", given: string, attempt = 1) =>
    apiFetch<AnswerCheck>("/api/flashcards/check-answer", {
      method: "POST",
      body: JSON.stringify({ wordId, mode, given, attempt }),
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

// Клиентский кэш mp3-блобов: не скачивать аудио повторно при каждом тапе.
// Ключ — "id:<wordId>" для слов с карточки или "text:<текст>" для всего
// остального (в первую очередь — примеров-предложений, у которых нет
// собственного wordId).
const _ttsCache = new Map<string, Blob>();

// Текущий <audio> на web: отменяется перед следующим воспроизведением,
// чтобы звуки не накладывались. Рядом храним objectURL — его нужно освободить
// при обрыве, иначе blob повиснет в памяти.
let _webAudio: any = null;
let _webAudioUrl: string | null = null;

// Текущий звук на native (expo-av). Раньше ссылки не было вовсе: каждый вызов
// создавал новый Sound, ничего не выгружая, и слова наслаивались друг на друга.
let _nativeSound: any = null;

// Поколение воспроизведения. speakWord() увеличивает счётчик синхронно — ещё до
// сетевого запроса, — а каждый await внутри проверяет, что его поколение всё
// ещё актуально. Без этого запрос, начатый на прошлой карточке, доигрывает
// поверх новой, когда fetch резолвится уже после перелистывания.
let _playToken = 0;

/**
 * Немедленно оборвать любую текущую озвучку: и mp3 с сервера, и запасной
 * синтез речи. Вызывается перед новым словом, при смене карточки и при
 * размонтировании тренажёра.
 *
 * Увеличение _playToken гасит и то, что ещё не начало играть: запрос в полёте
 * после резолва увидит чужой токен и молча выйдет, не заиграв.
 */
export function stopSpeaking(): void {
  _playToken++;
  const w = globalThis as any;

  if (_webAudio) {
    const audio = _webAudio;
    const objUrl = _webAudioUrl;
    _webAudio = null;
    _webAudioUrl = null;
    try {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.currentTime = 0; // следующий показ слова начнётся сначала
      audio.removeAttribute?.("src");
      audio.load?.();
    } catch { /* элемент мог уже освободиться */ }
    if (objUrl) {
      try { w.URL?.revokeObjectURL?.(objUrl); } catch { /* no-op */ }
    }
  }

  if (_nativeSound) {
    const sound = _nativeSound;
    _nativeSound = null;
    try { sound.setOnPlaybackStatusUpdate?.(null); } catch { /* no-op */ }
    try { sound.stopAsync?.()?.catch?.(() => {}); } catch { /* no-op */ }
    try { sound.unloadAsync?.()?.catch?.(() => {}); } catch { /* no-op */ }
  }

  // Запасная озвучка (Web Speech API / expo-speech) тоже должна замолчать.
  try {
    if (Platform.OS === "web") {
      w.speechSynthesis?.cancel?.();
    } else {
      const pkg = "expo-speech";
      (import(pkg) as Promise<any>).then((m: any) => m?.stop?.()).catch(() => {});
    }
  } catch { /* no-op */ }
}

/**
 * Проиграть слово или произвольный текст через /api/tts (записи носителей
 * или нейронный TTS).
 *
 * wordId передавайте, когда озвучиваете слово карточки (сервер быстрее найдёт
 * его аудио и обновит words.audio_url для будущего кэша). Для всего, у чего
 * нет своего wordId, — например exampleEn примера-предложения на карточке —
 * передавайте wordId: undefined: сервер озвучит text напрямую
 * (GET /api/tts?text=...), без обращения к БД.
 *
 * • Первый запрос — скачивает mp3, кэширует в памяти;
 *   повторные тапы воспроизводятся мгновенно из кэша.
 * • 404 / 503 / сетевая ошибка — молча откатывается на speak() (Web Speech API).
 * • Предыдущее воспроизведение обрывается ДО сетевого запроса (см. ниже).
 * • Не блокирует интерфейс (fire-and-forget).
 */
export function speakWord(wordId: number | undefined, text: string, lang = "en-US"): void {
  if (!text) return;
  // Гасим предыдущий звук ПЕРВЫМ ДЕЛОМ, до любой асинхронной работы. Раньше
  // остановка стояла после await fetch — пока грузился mp3 новой карточки,
  // предыдущее слово продолжало звучать на уже сменившейся карточке.
  stopSpeaking();
  const token = _playToken;
  _speakWordAsync(token, wordId, text, lang).catch(() => _speakFallback(token, text, lang));
}

async function _speakWordAsync(
  token: number,
  wordId: number | undefined,
  text: string,
  lang: string,
): Promise<void> {
  // /api/tts не требует Authorization: <audio>/new Audio(url) и expo-av грузят
  // звук напрямую по URL и не умеют слать заголовки — аудио слов не приватные
  // данные, поэтому роут открыт без токена (см. artifacts/api-server/src/routes/tts.ts).
  const url = wordId != null
    ? `${BASE_URL}/api/tts?wordId=${wordId}`
    : `${BASE_URL}/api/tts?text=${encodeURIComponent(text)}`;
  const cacheKey = wordId != null ? `id:${wordId}` : `text:${text}`;

  if (Platform.OS === "web") {
    const w = globalThis as any;

    // Используем кэш: не качаем mp3 повторно при каждом тапе
    let blob = _ttsCache.get(cacheKey);
    if (!blob) {
      const resp = await fetch(url);
      // Карточка могла смениться, пока шёл запрос: тогда этот звук уже не нужен
      // и играть его нельзя — иначе он ляжет поверх нового слова.
      if (token !== _playToken) return;
      // 404 (слово без аудио) или 503 (сервис недоступен) → тихий fallback
      if (!resp.ok) throw new Error(`tts ${resp.status}`);
      blob = await resp.blob();
      _ttsCache.set(cacheKey, blob); // кэш пополняем даже для устаревшего запроса
      if (token !== _playToken) return;
    }

    const objUrl: string | undefined = w.URL?.createObjectURL(blob);
    if (!objUrl) throw new Error("URL API not available");

    const audio = new w.Audio(objUrl);
    _webAudio = audio;
    _webAudioUrl = objUrl;
    const cleanup = () => {
      try { w.URL.revokeObjectURL(objUrl); } catch {}
      if (_webAudio === audio) { _webAudio = null; _webAudioUrl = null; }
    };
    audio.onended = cleanup;
    audio.onerror = cleanup;
    await audio.play();
    return;
  }

  // Нативное воспроизведение через expo-av (динамический импорт — не обязателен)
  const pkg = "expo-av";
  const av = await (import(pkg) as Promise<any>).catch(() => null);
  if (token !== _playToken) return;
  if (!av) throw new Error("expo-av not available");
  // shouldPlay: false — сначала грузим, потом сверяем токен и только затем
  // играем. Иначе звук успевает пискнуть на уже сменившейся карточке.
  const { sound } = await av.Audio.Sound.createAsync({ uri: url }, { shouldPlay: false });
  if (token !== _playToken) {
    sound.unloadAsync().catch(() => {});
    return;
  }
  _nativeSound = sound;
  sound.setOnPlaybackStatusUpdate((status: any) => {
    if (status?.didJustFinish) {
      if (_nativeSound === sound) _nativeSound = null;
      sound.unloadAsync().catch(() => {});
    }
  });
  await sound.playAsync();
}

/**
 * Озвучить текст через Web Speech API (web) или expo-speech (native).
 *
 * Fallback-озвучка: роботизированная, без wordId.
 * Используй speakWord() когда есть id слова — получишь запись носителя.
 */
export function speak(text: string, lang = "en-US") {
  if (!text) return;
  stopSpeaking();
  _speakFallback(_playToken, text, lang);
}

function _speakFallback(token: number, text: string, lang: string) {
  // Устаревший fallback (карточка уже сменилась) молчит — иначе неудачный
  // запрос прошлого слова заговорит поверх нового.
  if (!text || token !== _playToken) return;
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
