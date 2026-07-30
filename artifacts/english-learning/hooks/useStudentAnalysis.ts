// Клиентский слой для вкладки «Анализ».
//
// Эндпоинт /api/students/:id/analysis добавлен вручную, без кодогенерации Orval
// (как assign/assignees/marathon у флеш-карточек), поэтому типы объявлены здесь
// и должны совпадать с ответом artifacts/api-server/src/routes/analysis.ts.
import authStorage from "@/utils/authStorage";

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

export type SkillType = "text_test" | "audio" | "reading" | "video" | "free_form";

export type SkillStat = {
  type: SkillType;
  avgScore: number | null;
  count: number;
  recentAvg: number | null;
  prevAvg: number | null;
  delta: number | null;
  trend: "up" | "down" | "flat" | "unknown";
  lastAt: string | null;
};

export type FocusSeverity = "high" | "medium" | "low" | "good" | "info";

export type FocusItem = {
  id: string;
  severity: FocusSeverity;
  icon: string;
  title: string;
  detail: string;
};

export type FreshnessStatus = "active" | "slowing" | "inactive" | "unknown";

export type DeckProgress = {
  deckId: number;
  title: string;
  emoji?: string;
  total: number;
  learned: number;
  started: number;
  due: number;
  /** Колоду выдал именно текущий учитель (а не другой). */
  assignedByMe: boolean;
};

export type StudentAnalysis = {
  student: {
    id: number;
    username: string;
    name: string;
    surname?: string;
    avatarEmoji?: string;
    avatarColor?: string;
    avatarUrl?: string;
    knowledgeLevel?: string;
    cefrLevel?: string;
    xpLevel: number;
  };
  freshness: FreshnessStatus;
  lastActiveAt: string | null;
  activity: {
    daysSinceActive: number | null;
    minutesToday: number;
    minutesWeek: number;
    minutesPrevWeek: number;
    loginStreak: number;
    dailyGoalMinutes: number;
  };
  skills: SkillStat[];
  vocabulary: {
    totalWords: number;
    introduced: number;
    learned: number;
    dueNow: number;
    lapsed: number;
    accuracy: number | null;
    learnedLast7: number;
    reviewsLast7: number;
    decks: DeckProgress[];
  };
  assignments: {
    total: number;
    notStarted: number;
    oldestNotStartedDays: number | null;
    awaitingReview: number;
    gradedLast14: number;
    avgScoreLast14: number | null;
  };
  mistakes: {
    questionText: string;
    assignmentTitle: string | null;
    count: number;
    correctAnswer: string | null;
    lastStudentAnswer: string | null;
    lastAt: string | null;
  }[];
  focus: FocusItem[];
};

export async function fetchStudentAnalysis(studentId: number): Promise<StudentAnalysis> {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE_URL}/api/students/${studentId}/analysis`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token ?? ""}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Ошибка ${res.status}`);
  return data as StudentAnalysis;
}

// ── Оформление ──────────────────────────────────────────────────────────────

export const SKILL_LABELS: Record<SkillType, string> = {
  text_test: "Тест",
  audio: "Аудирование",
  reading: "Чтение",
  video: "Видео",
  free_form: "Свободный ответ",
};

export const SKILL_ICONS: Record<SkillType, string> = {
  text_test: "edit-3",
  audio: "headphones",
  reading: "book",
  video: "video",
  free_form: "file-text",
};

export const SKILL_COLORS: Record<SkillType, string> = {
  text_test: "#8b5cf6",
  audio: "#6366f1",
  reading: "#0ea5e9",
  video: "#ec4899",
  free_form: "#f59e0b",
};

/** Минимум работ, при котором проценту можно верить (совпадает с сервером). */
export const MIN_SKILL_SAMPLE = 3;

export const SEVERITY_STYLE: Record<FocusSeverity, { color: string; bg: string; label: string }> = {
  high: { color: "#dc2626", bg: "#fef2f2", label: "Срочно" },
  medium: { color: "#ea580c", bg: "#fff7ed", label: "Важно" },
  low: { color: "#0891b2", bg: "#ecfeff", label: "Заметка" },
  good: { color: "#16a34a", bg: "#f0fdf4", label: "Хорошо" },
  info: { color: "#64748b", bg: "#f8fafc", label: "Инфо" },
};

export const FRESHNESS_STYLE: Record<FreshnessStatus, { color: string; bg: string; label: string; icon: string }> = {
  active: { color: "#16a34a", bg: "#f0fdf4", label: "Активен", icon: "check-circle" },
  slowing: { color: "#ea580c", bg: "#fff7ed", label: "Активность просела", icon: "trending-down" },
  inactive: { color: "#dc2626", bg: "#fef2f2", label: "Давно не заходил", icon: "alert-circle" },
  unknown: { color: "#64748b", bg: "#f8fafc", label: "Нет активности", icon: "help-circle" },
};

/** «сегодня» / «2 дня назад» / «3 недели назад» — короткая относительная дата. */
export function relativeDays(days: number | null): string {
  if (days === null) return "не заходил ни разу";
  if (days === 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 7) return `${days} дня назад`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "неделю назад";
  if (weeks < 5) return `${weeks} нед. назад`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "месяц назад" : `${months} мес. назад`;
}

/** Русское склонение: 1 слово / 2 слова / 5 слов. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** Минуты → «45 мин» / «1 ч 20 мин». */
export function formatMinutes(total: number): string {
  const minutes = Math.max(0, Math.round(total));
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}
