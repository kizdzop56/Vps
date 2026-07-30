import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, RefreshControl, useWindowDimensions,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import authStorage from "@/utils/authStorage";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Ошибка ${res.status}`);
  return data;
}

// ── Типы ответов API ──────────────────────────────────────────────────
type Child = {
  id: number;
  name: string | null;
  username: string;
  knowledgeLevel: string | null;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarUrl?: string | null;
  totalPoints: number;
};

type Profile = {
  id: number;
  username: string;
  name: string | null;
  surname: string | null;
  age: number | null;
  knowledgeLevel: string | null;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
  totalPoints: number;
  totalTimeMinutes: number;
  completedAssignments: number;
  averageScore: number | null;
  lastSeenAt: string | null;
  isOnline: boolean;
};

type Submission = {
  submissionId: number;
  score: number;
  correctCount: number;
  totalQuestions: number;
  pointsEarned: number;
  submittedAt: string;
  assignmentId: number | null;
  title: string | null;
  type: string | null;
  points: number | null;
};

type CategoryStat = { type: string; avgScore: number | null; count: number };

type TimeSession = {
  id: number;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
};

type TimeStats = {
  totalMinutes: number;
  todayMinutes: number;
  weekMinutes: number;
  sessions: TimeSession[];
};

type FlashcardStats = {
  totalLearned: number;
  totalWords: number;
  totalReviews: number;
  accuracy: number;
  placementLevel: string | null;
};

type ChildReport = {
  profile: Profile | null;
  submissions: Submission[];
  categoryStats: CategoryStat[];
  time: TimeStats | null;
  flashcards: FlashcardStats | null;
};

// ── Справочники ───────────────────────────────────────────────────────
const SCALE_LABELS: Record<string, string> = {
  text_test: "Тесты",
  audio: "Аудирование",
  reading: "Чтение",
  video: "Видео",
  free_form: "Свободный ответ",
};
const SCALE_COLORS: Record<string, string> = {
  text_test: "#8b5cf6",
  audio: "#6366f1",
  reading: "#d946ef",
  video: "#ec4899",
  free_form: "#f59e0b",
};
const SCALE_ICONS: Record<string, any> = {
  text_test: "edit-3",
  audio: "headphones",
  reading: "book",
  video: "video",
  free_form: "file-text",
};
const KNOWLEDGE_LABELS: Record<string, string> = {
  starter: "Стартовый",
  beginner: "Начинающий",
  elementary: "Элементарный",
  intermediate: "Средний",
  upper_intermediate: "Продвинутый",
};
const WEEKDAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

// ── Утилиты ───────────────────────────────────────────────────────────
function formatMinutes(mins: number): string {
  const total = Math.max(0, Math.round(mins));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

/** Оценка балла словами — чтобы родителю было понятно без процентов. */
function scoreVerdict(score: number): string {
  if (score >= 85) return "отлично";
  if (score >= 70) return "хорошо";
  if (score >= 50) return "нужна практика";
  return "требует внимания";
}

function scoreColor(score: number, colors: { success: string; destructive: string }): string {
  if (score >= 70) return colors.success;
  if (score >= 50) return "#f59e0b";
  return colors.destructive;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Минуты в приложении по каждому из последних 7 дней (включая сегодня). */
function buildWeekActivity(sessions: TimeSession[]): { label: string; key: string; minutes: number }[] {
  const buckets = new Map<string, number>();
  for (const s of sessions) {
    const started = new Date(s.startedAt);
    if (Number.isNaN(started.getTime())) continue;
    const ended = s.endedAt ? new Date(s.endedAt) : new Date();
    const minutes = s.endedAt
      ? Math.max(0, (ended.getTime() - started.getTime()) / 60000)
      : Math.max(0, s.durationMinutes ?? 0);
    const key = dayKey(started);
    buckets.set(key, (buckets.get(key) ?? 0) + minutes);
  }

  const days: { label: string; key: string; minutes: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    days.push({
      label: WEEKDAY_SHORT[d.getDay()] ?? "",
      key,
      minutes: Math.round(buckets.get(key) ?? 0),
    });
  }
  return days;
}

/** Сколько дней подряд ребёнок заходил в приложение (считая сегодня/вчера). */
function computeStreak(sessions: TimeSession[]): number {
  const active = new Set<string>();
  for (const s of sessions) {
    const d = new Date(s.startedAt);
    if (!Number.isNaN(d.getTime())) active.add(dayKey(d));
  }
  if (active.size === 0) return 0;

  const cursor = new Date();
  // Серия не рвётся, если сегодня ещё не заходил, но заходил вчера.
  if (!active.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (active.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const diff = Date.now() - then.getTime();
  return Math.floor(diff / 86_400_000);
}

// ── График динамики среднего балла ────────────────────────────────────
function ScoreTrendChart({
  points, width, colors,
}: {
  points: { score: number; date: string }[];
  width: number;
  colors: any;
}) {
  const H = 150;
  const PAD_L = 30;
  const PAD_R = 10;
  const PAD_T = 12;
  const PAD_B = 24;
  const innerW = Math.max(10, width - PAD_L - PAD_R);
  const innerH = H - PAD_T - PAD_B;

  if (points.length < 2) {
    return (
      <View style={{ paddingVertical: 24, alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 28 }}>📈</Text>
        <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
          График появится после двух выполненных заданий
        </Text>
      </View>
    );
  }

  const x = (i: number) => PAD_L + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (score: number) => PAD_T + innerH - (Math.max(0, Math.min(100, score)) / 100) * innerH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(points.length - 1).toFixed(1)} ${(PAD_T + innerH).toFixed(1)} L${x(0).toFixed(1)} ${(PAD_T + innerH).toFixed(1)} Z`;

  const firstDate = new Date(points[0]!.date);
  const lastDate = new Date(points[points.length - 1]!.date);
  const fmtDate = (d: Date) =>
    Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

  return (
    <Svg width={width} height={H}>
      {/* Сетка и подписи шкалы */}
      {[0, 50, 100].map((tick) => (
        <React.Fragment key={tick}>
          <Line
            x1={PAD_L}
            y1={y(tick)}
            x2={PAD_L + innerW}
            y2={y(tick)}
            stroke={colors.border}
            strokeWidth={1}
            strokeDasharray={tick === 0 ? undefined : "4 4"}
          />
          <SvgText x={0} y={y(tick) + 4} fontSize={10} fill={colors.mutedForeground}>
            {`${tick}%`}
          </SvgText>
        </React.Fragment>
      ))}

      {/* Область под линией */}
      <Path d={areaPath} fill={colors.primary} fillOpacity={0.14} />
      <Path d={linePath} stroke={colors.primary} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />

      {/* Точки */}
      {points.map((p, i) => (
        <Circle
          key={`${p.date}-${i}`}
          cx={x(i)}
          cy={y(p.score)}
          r={points.length > 14 ? 2.5 : 4}
          fill="#ffffff"
          stroke={scoreColor(p.score, colors)}
          strokeWidth={2}
        />
      ))}

      {/* Даты по краям */}
      <SvgText x={PAD_L} y={H - 6} fontSize={10} fill={colors.mutedForeground}>
        {fmtDate(firstDate)}
      </SvgText>
      <SvgText x={PAD_L + innerW} y={H - 6} fontSize={10} fill={colors.mutedForeground} textAnchor="end">
        {fmtDate(lastDate)}
      </SvgText>
    </Svg>
  );
}

// ── График времени в приложении за 7 дней ────────────────────────────
function WeekActivityChart({
  days, width, colors,
}: {
  days: { label: string; key: string; minutes: number }[];
  width: number;
  colors: any;
}) {
  const H = 120;
  const PAD_B = 22;
  const PAD_T = 16;
  const innerH = H - PAD_B - PAD_T;
  const slot = width / Math.max(1, days.length);
  const barW = Math.min(28, slot * 0.52);
  const max = Math.max(15, ...days.map((d) => d.minutes));

  return (
    <Svg width={width} height={H}>
      {days.map((d, i) => {
        const cx = slot * i + slot / 2;
        const h = Math.max(d.minutes > 0 ? 4 : 2, (d.minutes / max) * innerH);
        const isToday = i === days.length - 1;
        const fill = d.minutes === 0 ? colors.muted : isToday ? "#ec4899" : colors.primary;
        return (
          <React.Fragment key={d.key}>
            {d.minutes > 0 && (
              <SvgText x={cx} y={PAD_T + innerH - h - 5} fontSize={9} fontWeight="700" fill={colors.mutedForeground} textAnchor="middle">
                {d.minutes >= 60 ? `${Math.round((d.minutes / 60) * 10) / 10}ч` : `${d.minutes}м`}
              </SvgText>
            )}
            <Rect
              x={cx - barW / 2}
              y={PAD_T + innerH - h}
              width={barW}
              height={h}
              rx={Math.min(6, barW / 2)}
              fill={fill}
              opacity={d.minutes === 0 ? 0.7 : 1}
            />
            <SvgText
              x={cx}
              y={H - 6}
              fontSize={10}
              fontWeight={isToday ? "800" : "500"}
              fill={isToday ? "#ec4899" : colors.mutedForeground}
              textAnchor="middle"
            >
              {d.label}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// ── Успеваемость по шкалам ────────────────────────────────────────────
function ScaleBars({
  stats, average, colors,
}: {
  stats: CategoryStat[];
  average: number | null;
  colors: any;
}) {
  const hasAny = stats.some((s) => s.count > 0);
  if (!hasAny) {
    return (
      <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", paddingVertical: 18 }}>
        Пока нет выполненных заданий — шкалы заполнятся автоматически
      </Text>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {stats.map((stat) => {
        const color = SCALE_COLORS[stat.type] ?? colors.primary;
        const has = stat.count > 0 && stat.avgScore !== null;
        const pct = Math.max(0, Math.min(100, stat.avgScore ?? 0));
        return (
          <View key={stat.type}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 8 }}>
              <Feather name={SCALE_ICONS[stat.type] ?? "edit-3"} size={14} color={color} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, flex: 1 }}>
                {SCALE_LABELS[stat.type] ?? stat.type}
              </Text>
              {has ? (
                <>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                    {stat.count} {stat.count === 1 ? "задание" : "заданий"}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: "900", color, minWidth: 42, textAlign: "right" }}>
                    {pct}%
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>нет данных</Text>
              )}
            </View>

            <View style={{ height: 10, backgroundColor: colors.muted, borderRadius: 5, overflow: "hidden", position: "relative" }}>
              {has && (
                <View style={{ height: 10, width: `${pct}%` as any, backgroundColor: color, borderRadius: 5 }} />
              )}
              {/* Отметка среднего балла ребёнка — видно, какая шкала выбивается */}
              {average !== null && (
                <View
                  style={{
                    position: "absolute",
                    left: `${Math.max(0, Math.min(100, average))}%` as any,
                    top: -2,
                    width: 2,
                    height: 14,
                    backgroundColor: colors.foreground,
                    opacity: 0.35,
                  }}
                />
              )}
            </View>

            {has && (
              <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 4 }}>
                {scoreVerdict(pct)}
              </Text>
            )}
          </View>
        );
      })}

      {average !== null && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
          <View style={{ width: 2, height: 12, backgroundColor: colors.foreground, opacity: 0.35 }} />
          <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
            — средний балл по всем заданиям ({average}%)
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Экран ─────────────────────────────────────────────────────────────
export default function ProgressScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [children, setChildren] = useState<Child[]>([]);
  const [activeChildId, setActiveChildId] = useState<number | null>(null);
  const [report, setReport] = useState<ChildReport | null>(null);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  // Ширина графиков = ширина окна минус отступы скролла (20+20) и карточки (18+18).
  // Тот же приём, что на экране статистики карточек, но через хук —
  // на web график перерисовывается при изменении размера окна.
  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = Math.max(220, windowWidth - 40 - 36);

  const loadChildren = useCallback(async () => {
    try {
      const list: Child[] = await apiFetch("/api/connections/parent/children");
      setChildren(list ?? []);
      setActiveChildId((prev) => {
        if (prev !== null && (list ?? []).some((c) => c.id === prev)) return prev;
        return list && list.length > 0 ? list[0]!.id : null;
      });
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить список детей");
    } finally {
      setLoadingChildren(false);
    }
  }, []);

  const loadReport = useCallback(async (childId: number, silent = false) => {
    if (!silent) setLoadingReport(true);
    try {
      const [profile, submissions, categoryStats, time, flashcards] = await Promise.all([
        apiFetch(`/api/users/${childId}`).catch(() => null),
        apiFetch(`/api/students/${childId}/submissions`).catch(() => []),
        apiFetch(`/api/students/${childId}/category-stats`).catch(() => []),
        apiFetch(`/api/students/${childId}/time`).catch(() => null),
        apiFetch(`/api/flashcards/stats?studentId=${childId}`).catch(() => null),
      ]);
      setReport({
        profile: profile ?? null,
        submissions: Array.isArray(submissions) ? submissions : [],
        categoryStats: Array.isArray(categoryStats) ? categoryStats : [],
        time: time ?? null,
        flashcards: flashcards ?? null,
      });
    } finally {
      setLoadingReport(false);
    }
  }, []);

  useEffect(() => { loadChildren(); }, [loadChildren]);

  useEffect(() => {
    setShowAllHistory(false);
    if (activeChildId !== null) loadReport(activeChildId);
    else setReport(null);
  }, [activeChildId, loadReport]);

  // Возврат на вкладку — обновляем цифры (время в приложении меняется постоянно).
  useFocusEffect(
    useCallback(() => {
      if (activeChildId !== null) loadReport(activeChildId, true);
    }, [activeChildId, loadReport])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadChildren();
    if (activeChildId !== null) await loadReport(activeChildId, true);
    setRefreshing(false);
  }, [loadChildren, loadReport, activeChildId]);

  // ── Производные метрики ────────────────────────────────────────────
  const derived = useMemo(() => {
    const subs = report?.submissions ?? [];
    // API отдаёт от новых к старым — для графика нужен хронологический порядок.
    const chronological = [...subs].reverse();

    const avgScore = subs.length > 0
      ? Math.round(subs.reduce((sum, s) => sum + s.score, 0) / subs.length)
      : report?.profile?.averageScore ?? null;

    // Тренд: последние 5 заданий против предыдущих 5.
    const recent = subs.slice(0, 5);
    const previous = subs.slice(5, 10);
    const mean = (arr: Submission[]) =>
      arr.length > 0 ? arr.reduce((s, x) => s + x.score, 0) / arr.length : null;
    const recentAvg = mean(recent);
    const prevAvg = mean(previous);
    const trend = recentAvg !== null && prevAvg !== null ? Math.round(recentAvg - prevAvg) : null;

    const scored = (report?.categoryStats ?? []).filter((s) => s.count > 0 && s.avgScore !== null);
    const sorted = [...scored].sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));
    const best = sorted[0] ?? null;
    const worst = sorted.length > 1 ? sorted[sorted.length - 1]! : null;

    const sessions = report?.time?.sessions ?? [];
    const week = buildWeekActivity(sessions);
    const streak = computeStreak(sessions);
    const activeDaysThisWeek = week.filter((d) => d.minutes > 0).length;

    const totalCorrect = subs.reduce((s, x) => s + (x.correctCount ?? 0), 0);
    const totalQuestions = subs.reduce((s, x) => s + (x.totalQuestions ?? 0), 0);

    const lastSubmission = subs[0] ?? null;
    const idleDays = daysSince(lastSubmission?.submittedAt ?? null);

    return {
      chronological, avgScore, trend, recentAvg, best, worst, week, streak,
      activeDaysThisWeek, totalCorrect, totalQuestions, lastSubmission, idleDays,
    };
  }, [report]);

  // ── Автоматические выводы для родителя ─────────────────────────────
  const insights = useMemo(() => {
    const out: { icon: any; tone: "good" | "warn" | "info"; text: string }[] = [];
    const subs = report?.submissions ?? [];

    if (subs.length === 0) {
      out.push({
        icon: "info",
        tone: "info",
        text: "Ребёнок ещё не выполнил ни одного задания. Как только появится первый результат, здесь будет полный анализ.",
      });
      return out;
    }

    if (derived.trend !== null && derived.trend >= 5) {
      out.push({ icon: "trending-up", tone: "good", text: `Результаты растут: +${derived.trend} п.п. за последние 5 заданий.` });
    } else if (derived.trend !== null && derived.trend <= -5) {
      out.push({ icon: "trending-down", tone: "warn", text: `Результаты снижаются: ${derived.trend} п.п. за последние 5 заданий. Стоит обсудить, что стало сложнее.` });
    } else if (derived.trend !== null) {
      out.push({ icon: "activity", tone: "info", text: "Результаты стабильны — резких изменений за последние задания нет." });
    }

    if (derived.best && derived.best.avgScore !== null) {
      out.push({
        icon: "award",
        tone: "good",
        text: `Лучше всего даётся «${SCALE_LABELS[derived.best.type] ?? derived.best.type}» — ${derived.best.avgScore}%. Есть за что похвалить.`,
      });
    }
    if (derived.worst && derived.worst.avgScore !== null && derived.worst.avgScore < 70) {
      out.push({
        icon: "alert-circle",
        tone: "warn",
        text: `Слабое место — «${SCALE_LABELS[derived.worst.type] ?? derived.worst.type}» (${derived.worst.avgScore}%). Здесь нужна дополнительная практика.`,
      });
    }

    if (derived.streak >= 3) {
      out.push({ icon: "zap", tone: "good", text: `Занимается ${derived.streak} ${derived.streak === 1 ? "день" : "дней"} подряд — привычка формируется.` });
    }
    if (derived.activeDaysThisWeek > 0) {
      const weekMins = report?.time?.weekMinutes ?? 0;
      out.push({
        icon: "clock",
        tone: derived.activeDaysThisWeek >= 3 ? "good" : "info",
        text: `За последние 7 дней заходил ${derived.activeDaysThisWeek} ${derived.activeDaysThisWeek === 1 ? "день" : "дней"} и провёл в приложении ${formatMinutes(weekMins)}.`,
      });
    } else {
      out.push({ icon: "clock", tone: "warn", text: "На этой неделе ребёнок ещё не заходил в приложение." });
    }

    if (derived.idleDays !== null && derived.idleDays >= 7) {
      out.push({ icon: "calendar", tone: "warn", text: `Последнее задание выполнено ${derived.idleDays} дней назад — перерыв затянулся.` });
    }

    const fc = report?.flashcards;
    if (fc && fc.totalWords > 0) {
      out.push({
        icon: "layers",
        tone: fc.accuracy >= 70 ? "good" : "info",
        text: `Слова: выучено ${fc.totalLearned} из ${fc.totalWords}, точность ответов ${fc.accuracy}%.`,
      });
    }

    if (derived.totalQuestions > 0) {
      out.push({
        icon: "check-circle",
        tone: "info",
        text: `Всего верных ответов ${derived.totalCorrect} из ${derived.totalQuestions}.`,
      });
    }

    return out;
  }, [report, derived]);

  const activeChild = children.find((c) => c.id === activeChildId) ?? null;
  const profile = report?.profile ?? null;
  const displayName = profile
    ? [profile.name, profile.surname].filter(Boolean).join(" ") || profile.username
    : activeChild
    ? activeChild.name || activeChild.username
    : "";

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    title: { fontSize: 26, fontWeight: "800", color: colors.foreground },
    subtitle: { fontSize: 14, color: colors.mutedForeground, marginTop: 2 },
    scroll: { paddingHorizontal: 20, paddingBottom: insets.bottom + 100 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingHorizontal: 32, paddingBottom: 80 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 18,
      marginBottom: 16,
      shadowColor: "#7c3aed",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 4,
    },
    sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.foreground },
    sectionHint: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
    statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
    statCard: {
      flex: 1,
      minWidth: "44%",
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 14,
      alignItems: "center",
      gap: 4,
      shadowColor: "#7c3aed",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 4,
    },
    statValue: { fontSize: 24, fontWeight: "900", color: colors.foreground },
    statLabel: { fontSize: 12, color: colors.mutedForeground, textAlign: "center" },
    badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: colors.muted },
    badgeText: { fontSize: 12, color: colors.mutedForeground, fontWeight: "600" },
    historyRow: {
      backgroundColor: "rgba(243,240,255,0.6)",
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
    },
    empty: { fontSize: 13, color: colors.mutedForeground, textAlign: "center", paddingVertical: 18 },
  });

  // Вкладка только для родителей — на всякий случай мягкая заглушка.
  if (user && user.role !== "parent") {
    return (
      <View style={[styles.container, styles.center]}>
        <Feather name="lock" size={36} color={colors.mutedForeground} />
        <Text style={[styles.empty, { fontSize: 15 }]}>
          Эта вкладка доступна только родителям.
        </Text>
      </View>
    );
  }

  if (loadingChildren) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.center]}>
        <Feather name="alert-circle" size={36} color={colors.destructive} />
        <Text style={[styles.empty, { fontSize: 15 }]}>{error}</Text>
        <TouchableOpacity
          onPress={() => { setLoadingChildren(true); loadChildren(); }}
          style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Повторить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (children.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Успеваемость</Text>
          <Text style={styles.subtitle}>Полная картина по вашему ребёнку</Text>
        </View>
        <View style={styles.center}>
          <Text style={{ fontSize: 46 }}>👨‍👩‍👦</Text>
          <Text style={[styles.empty, { fontSize: 15 }]}>
            Пока не добавлен ни один ребёнок.{"\n"}Добавьте его на вкладке «Дети» — и здесь появится полный анализ успеваемости.
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(main)/students" as any)}
            style={{
              flexDirection: "row", alignItems: "center", gap: 8,
              backgroundColor: colors.primary, borderRadius: 14,
              paddingHorizontal: 18, paddingVertical: 12,
            }}
          >
            <Feather name="user-plus" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Добавить ребёнка</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const avg = derived.avgScore;
  const trend = derived.trend;
  const fc = report?.flashcards ?? null;
  const time = report?.time ?? null;
  const history = showAllHistory ? report?.submissions ?? [] : (report?.submissions ?? []).slice(0, 6);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Успеваемость</Text>
        <Text style={styles.subtitle}>
          {children.length > 1 ? "Полный анализ по каждому ребёнку" : `Полная картина по ${displayName || "ребёнку"}`}
        </Text>
      </View>

      {/* Переключатель детей */}
      {children.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 12 }}
        >
          {children.map((child) => {
            const active = child.id === activeChildId;
            return (
              <TouchableOpacity
                key={child.id}
                onPress={() => setActiveChildId(child.id)}
                activeOpacity={0.8}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 8,
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                  backgroundColor: active ? colors.primary : colors.card,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <View style={{ width: 24, height: 24, overflow: "hidden", borderRadius: 12 }}>
                  <View style={{ position: "absolute", left: -8, top: -8 }}>
                    <AnimatedAvatar
                      size={24}
                      avatarColor={child.avatarColor ?? "#6366f1"}
                      avatarEmoji={child.avatarEmoji}
                      avatarUrl={child.avatarUrl}
                    />
                  </View>
                </View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: active ? "#fff" : colors.foreground }}>
                  {child.name || child.username}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loadingReport ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* ── Главная карточка: кто, средний балл, тренд ── */}
          <View style={styles.card}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <AnimatedAvatar
                size={56}
                avatarColor={profile?.avatarColor ?? activeChild?.avatarColor ?? "#6366f1"}
                avatarEmoji={profile?.avatarEmoji ?? activeChild?.avatarEmoji ?? null}
                avatarUrl={profile?.avatarUrl ?? activeChild?.avatarUrl ?? null}
                onlineDot={profile?.isOnline ?? false}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>
                  {displayName}
                </Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 3 }}>
                  {profile?.isOnline
                    ? "сейчас в приложении"
                    : profile?.lastSeenAt
                    ? `был(а) в сети ${new Date(profile.lastSeenAt).toLocaleDateString("ru-RU")}`
                    : "давно не заходил(а)"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => activeChildId !== null && router.push(`/(main)/chat/${activeChildId}` as any)}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 6,
                  backgroundColor: colors.primary, borderRadius: 12,
                  paddingHorizontal: 12, paddingVertical: 8,
                }}
              >
                <Feather name="message-circle" size={15} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Написать</Text>
              </TouchableOpacity>
            </View>

            {/* Средний балл крупно + тренд */}
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, marginTop: 18 }}>
              <Text style={{ fontSize: 46, fontWeight: "900", color: avg !== null ? scoreColor(avg, colors) : colors.mutedForeground, lineHeight: 50 }}>
                {avg !== null ? `${avg}%` : "—"}
              </Text>
              <View style={{ flex: 1, paddingBottom: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>Средний балл</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                  {avg !== null ? scoreVerdict(avg) : "нет выполненных заданий"}
                </Text>
              </View>
              {trend !== null && trend !== 0 && (
                <View
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 4,
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
                    backgroundColor: trend > 0 ? "#22c55e1a" : "#e11d481a",
                    marginBottom: 6,
                  }}
                >
                  <Feather name={trend > 0 ? "trending-up" : "trending-down"} size={14} color={trend > 0 ? "#16a34a" : colors.destructive} />
                  <Text style={{ fontSize: 13, fontWeight: "800", color: trend > 0 ? "#16a34a" : colors.destructive }}>
                    {trend > 0 ? `+${trend}` : trend} п.п.
                  </Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              {profile?.age ? (
                <View style={styles.badge}><Text style={styles.badgeText}>{profile.age} лет</Text></View>
              ) : null}
              {profile?.knowledgeLevel && KNOWLEDGE_LABELS[profile.knowledgeLevel] ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Уровень: {KNOWLEDGE_LABELS[profile.knowledgeLevel]}</Text>
                </View>
              ) : null}
              <View style={[styles.badge, { backgroundColor: colors.primary + "1a" }]}>
                <Text style={[styles.badgeText, { color: colors.primary, fontWeight: "700" }]}>
                  CEFR: {fc?.placementLevel ?? "тест не пройден"}
                </Text>
              </View>
              {derived.streak > 0 && (
                <View style={[styles.badge, { backgroundColor: "#ec48991a" }]}>
                  <Text style={[styles.badgeText, { color: "#ec4899", fontWeight: "700" }]}>
                    🔥 {derived.streak} {derived.streak === 1 ? "день" : "дней"} подряд
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Ключевые цифры ── */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Feather name="check-circle" size={20} color={colors.success} />
              <Text style={styles.statValue}>{report?.submissions.length ?? 0}</Text>
              <Text style={styles.statLabel}>Выполнено заданий</Text>
            </View>
            <View style={styles.statCard}>
              <Feather name="star" size={20} color="#ec4899" />
              <Text style={styles.statValue}>{profile?.totalPoints ?? activeChild?.totalPoints ?? 0}</Text>
              <Text style={styles.statLabel}>Очков (XP)</Text>
            </View>
            <View style={styles.statCard}>
              <Feather name="clock" size={20} color="#6366f1" />
              <Text style={styles.statValue}>{formatMinutes(time?.totalMinutes ?? profile?.totalTimeMinutes ?? 0)}</Text>
              <Text style={styles.statLabel}>Всего в приложении</Text>
            </View>
            <View style={styles.statCard}>
              <Feather name="target" size={20} color={colors.primary} />
              <Text style={styles.statValue}>
                {derived.totalQuestions > 0
                  ? `${Math.round((derived.totalCorrect / derived.totalQuestions) * 100)}%`
                  : "—"}
              </Text>
              <Text style={styles.statLabel}>Верных ответов</Text>
            </View>
          </View>

          {/* ── Что важно знать ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Что важно знать</Text>
            <Text style={styles.sectionHint}>Автоматический разбор по данным приложения</Text>
            <View style={{ gap: 10, marginTop: 14 }}>
              {insights.map((ins, i) => {
                const tint = ins.tone === "good" ? "#16a34a" : ins.tone === "warn" ? "#f59e0b" : colors.primary;
                return (
                  <View
                    key={`${ins.text}-${i}`}
                    style={{
                      flexDirection: "row", gap: 10, alignItems: "flex-start",
                      backgroundColor: tint + "12", borderRadius: 12, padding: 12,
                      borderLeftWidth: 3, borderLeftColor: tint,
                    }}
                  >
                    <Feather name={ins.icon} size={16} color={tint} style={{ marginTop: 1 }} />
                    <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: colors.foreground }}>
                      {ins.text}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── Успеваемость по всем шкалам ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Успеваемость по шкалам</Text>
            <Text style={styles.sectionHint}>Средний балл по каждому виду заданий</Text>
            <View style={{ marginTop: 16 }}>
              <ScaleBars stats={report?.categoryStats ?? []} average={avg} colors={colors} />
            </View>
          </View>

          {/* ── Динамика ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Динамика результатов</Text>
            <Text style={styles.sectionHint}>Балл за каждое выполненное задание по порядку</Text>
            <View style={{ marginTop: 12 }}>
              <ScoreTrendChart
                points={derived.chronological.slice(-20).map((s) => ({ score: s.score, date: s.submittedAt }))}
                width={chartWidth}
                colors={colors}
              />
            </View>
          </View>

          {/* ── Время в приложении ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Время в приложении</Text>
            <Text style={styles.sectionHint}>Сколько ребёнок реально занимался</Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              {[
                { label: "Сегодня", value: time?.todayMinutes ?? 0, color: "#ec4899" },
                { label: "За неделю", value: time?.weekMinutes ?? 0, color: colors.primary },
                { label: "Всего", value: time?.totalMinutes ?? profile?.totalTimeMinutes ?? 0, color: "#6366f1" },
              ].map((item) => (
                <View
                  key={item.label}
                  style={{ flex: 1, backgroundColor: item.color + "12", borderRadius: 14, padding: 12, alignItems: "center", gap: 2 }}
                >
                  <Text style={{ fontSize: 17, fontWeight: "900", color: item.color }}>
                    {formatMinutes(item.value)}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{item.label}</Text>
                </View>
              ))}
            </View>

            <View style={{ marginTop: 16 }}>
              <WeekActivityChart days={derived.week} width={chartWidth} colors={colors} />
              <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center", marginTop: 4 }}>
                Активность за последние 7 дней
              </Text>
            </View>
          </View>

          {/* ── Флеш-карточки ── */}
          {fc && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Словарный запас</Text>
              <Text style={styles.sectionHint}>Работа с флеш-карточками</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                {[
                  { icon: "award" as const, color: "#22c55e", value: String(fc.totalLearned), label: "Выучено слов" },
                  { icon: "book-open" as const, color: "#6366f1", value: String(fc.totalWords), label: "Слов в изучении" },
                  { icon: "repeat" as const, color: "#ec4899", value: String(fc.totalReviews), label: "Повторений" },
                  { icon: "target" as const, color: colors.primary, value: `${fc.accuracy}%`, label: "Точность" },
                ].map((item) => (
                  <View
                    key={item.label}
                    style={{ flex: 1, minWidth: "44%", backgroundColor: item.color + "12", borderRadius: 14, padding: 12, alignItems: "center", gap: 3 }}
                  >
                    <Feather name={item.icon} size={18} color={item.color} />
                    <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>{item.value}</Text>
                    <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center" }}>{item.label}</Text>
                  </View>
                ))}
              </View>
              {fc.totalWords > 0 && (
                <View style={{ marginTop: 14 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Прогресс по словам</Text>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>
                      {Math.round((fc.totalLearned / fc.totalWords) * 100)}%
                    </Text>
                  </View>
                  <View style={{ height: 10, backgroundColor: colors.muted, borderRadius: 5, overflow: "hidden" }}>
                    <View
                      style={{
                        height: 10,
                        width: `${Math.min(100, Math.round((fc.totalLearned / fc.totalWords) * 100))}%` as any,
                        backgroundColor: "#22c55e",
                        borderRadius: 5,
                      }}
                    />
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── История выполненных заданий ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              История заданий{(report?.submissions.length ?? 0) > 0 ? ` (${report?.submissions.length})` : ""}
            </Text>
            <Text style={styles.sectionHint}>Что ребёнок сдал и с каким результатом</Text>

            <View style={{ marginTop: 14 }}>
              {history.length === 0 ? (
                <Text style={styles.empty}>Ещё нет выполненных заданий</Text>
              ) : (
                history.map((sub) => {
                  const color = SCALE_COLORS[sub.type ?? ""] ?? colors.primary;
                  const sc = scoreColor(sub.score, colors);
                  return (
                    <View key={sub.submissionId} style={styles.historyRow}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <Feather name={SCALE_ICONS[sub.type ?? ""] ?? "edit-3"} size={15} color={color} />
                        <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                          {sub.title ?? "Задание"}
                        </Text>
                        <Text style={{ fontSize: 15, fontWeight: "900", color: sc }}>{sub.score}%</Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: color + "15" }}>
                          <Text style={{ fontSize: 11, fontWeight: "600", color }}>
                            {SCALE_LABELS[sub.type ?? ""] ?? sub.type ?? "Задание"}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                          {sub.correctCount}/{sub.totalQuestions} верно
                        </Text>
                        {sub.pointsEarned > 0 && (
                          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                            +{sub.pointsEarned} XP
                          </Text>
                        )}
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginLeft: "auto" as any }}>
                          {new Date(sub.submittedAt).toLocaleDateString("ru-RU")}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {(report?.submissions.length ?? 0) > 6 && (
              <TouchableOpacity
                onPress={() => setShowAllHistory((v) => !v)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10 }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>
                  {showAllHistory ? "Свернуть" : `Показать все (${report?.submissions.length})`}
                </Text>
                <Feather name={showAllHistory ? "chevron-up" : "chevron-down"} size={16} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Ссылка на полный профиль ребёнка */}
          {activeChildId !== null && (
            <TouchableOpacity
              onPress={() => router.push(`/(main)/student/${activeChildId}` as any)}
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                paddingVertical: 14, borderRadius: 16,
                borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
              }}
            >
              <Feather name="user" size={16} color={colors.primary} />
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary }}>
                Открыть профиль ребёнка
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
}
