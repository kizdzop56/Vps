// Чужой профиль: ученика или учителя.
//
// Профиль ученика оформлен РОВНО так же, как свой (app/(main)/profile.tsx):
// та же шапка-герой (ProfileHero) с теми же двумя счётчиками, тот же блок
// «О себе» с интересами (AboutCard в режиме просмотра), та же «Успеваемость»
// с переключателем периода, те же кольца заданий, та же плитка времени и та
// же витрина наград. Расхождения в оформлении здесь считаются багом: переход
// из друзей или рейтинга не должен выглядеть как переход в другое приложение.
//
// Откуда берутся цифры. GET /users/:id знает только про очки, время и средний
// балл. Всё остальное — выученные слова, серия входов, срезы успеваемости по
// периодам, условия наград — приходит из GET /students/:id/profile-stats
// (artifacts/api-server/src/routes/studentProfile.ts). Раньше этих данных не
// было, поэтому в шапке стояли «очки/задания», а витрина наград считалась по
// нулям и показывала чужого ученика новичком.
//
// Что отличается от своего профиля, и почему:
//   • нет цели дня — это личный план, чужой ученик им не управляет;
//   • «О себе» и интересы только на просмотр;
//   • в витрине наград только ПОЛУЧЕННЫЕ медали — чужие недоделки не витрина;
//   • нет кнопки «Мои друзья» — это раздел владельца;
//   • сверху кнопки «назад» и «Написать».
//
// Дружба. Состоявшаяся дружба — метка «Друг» в шапке рядом с ролью, отдельной
// карточки для неё нет: плашка на всю ширину ради одного слова отодвигала вниз
// весь профиль. FriendRequestCard остаётся только для состояний, требующих
// действия: отправить запрос, принять или отклонить входящий, ждать ответа.
//
// Профиль учителя оставлен как был: у него другие данные (слоты, часы с вами,
// созданные задания), ученическая шапка с уровнем и опытом ему не подходит.
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Modal,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import { getUnlockedAchievements, getLockedAchievements, type AchievementStats } from "@/constants/achievements";
import { getXpProgress } from "@/constants/xpLevels";
import authStorage from "@/utils/authStorage";
import { AchievementsShowcase } from "@/components/AchievementsShowcase";
import { AboutCard } from "@/components/AboutCard";
import { AssignmentRingsChart, type CategoryStat } from "@/components/AssignmentRingsChart";
import { ProfileHero } from "@/components/ui/ProfileHero";
import { Glyph } from "@/components/ui/Glyph";
import { SectionLabel } from "@/components/ui/GameKit";
import { accents, gradients, radii } from "@/constants/theme";
import { screenTop } from "@/constants/layout";
import { fc, type DeckWithAssign, type FlashcardStatsWithLevel } from "@/hooks/useFlashcards";

// Подписи уровня знаний (возрастной, из профиля) на русском.
const KNOWLEDGE_LABELS: Record<string, string> = {
  starter: "Стартовый",
  beginner: "Начинающий",
  elementary: "Элементарный",
  intermediate: "Средний",
  upper_intermediate: "Продвинутый",
};

// Подписи типов заданий — для списка «Задания от учителя».
const ASSIGNMENT_TYPE_LABELS: Record<string, string> = {
  text_test: "Тест",
  audio: "Аудирование",
  reading: "Чтение",
  video: "Видео",
  free_form: "Свободная форма",
};

const ROLE_LABELS: Record<string, string> = {
  student: "Ученик", parent: "Родитель", teacher: "Учитель", admin: "Администратор",
};

// Периоды «Успеваемости» — тот же набор и те же подписи, что на своём профиле.
type StatsPeriod = "week" | "month" | "all";
const PERIODS: { key: StatsPeriod; label: string }[] = [
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
  { key: "all", label: "Всё время" },
];

const BASE = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string, opts?: RequestInit) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Ошибка сервера");
  return data;
}

type FriendProfile = {
  id: number;
  name: string;
  username: string;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
  knowledgeLevel: string | null;
  totalPoints: number;
  totalTimeMinutes: number;
  averageScore: number | null;
  bio: string | null;
  age: number | null;
  dateOfBirth: string | null;
  role: string;
  completedAssignments: number;
  isOnline?: boolean;
  lastSeenAt?: string | null;
};

/** Ответ GET /students/:id/profile-stats. */
type PeriodStat = { count: number; average: number | null; points: number };

type StudentProfileStats = {
  studentId: number;
  wordsLearned: number;
  placementLevel: string | null;
  loginStreak: number;
  todayMinutes: number;
  totalTimeMinutes: number;
  gradedAssignments: number;
  perfectScoreCount: number;
  voiceChatSessions: number;
  earlyBirdSessions: number;
  unlockedAchievementIds: string[];
  periodStats: Record<StatsPeriod, PeriodStat>;
};

type FriendshipStatus = "none" | "pending_sent" | "pending_received" | "friends" | "loading";

// ── Цифры профиля учителя (GET /api/teachers/:id/profile-stats) ────────────
// personal — только про пару «смотрящий ↔ этот учитель», у каждого ученика
// свои; overall — общие цифры учителя, одинаковые для всех.
type SlotBrief = { id: number; date: string; startTime: string; endTime: string };

type TeacherProfileStats = {
  teacherId: number;
  overall: {
    assignmentsCreated: number;
    studentsCount: number;
    lessonsTotal: number;
    minutesTotal: number;
  };
  personal: {
    lessonsWithMe: number;
    minutesWithMe: number;
    lastLessonWithMe: SlotBrief | null;
    nextLessonWithMe: SlotBrief | null;
    assignedToMe: number;
    completedByMe: number;
    avgScore: number | null;
    pointsFromTeacher: number;
    categories: { type: string; total: number; count: number; avgScore: number | null }[];
    recentAssignments: {
      id: number;
      title: string | null;
      type: string | null;
      points: number | null;
      assignedAt: string;
      score: number | null;
      done: boolean;
    }[];
  };
  freeSlots: (SlotBrief & { myStatus: "free" | "pending" })[];
  freeSlotsTotal: number;
};

function formatTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

/** Русское склонение по числу. */
function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 14) return forms[2];
  const last = abs % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

function ageWord(n: number): string {
  if (n >= 11 && n <= 14) return `${n} лет`;
  const mod = n % 10;
  if (mod === 1) return `${n} год`;
  if (mod >= 2 && mod <= 4) return `${n} года`;
  return `${n} лет`;
}

// Слот приходит строками "YYYY-MM-DD" и "HH:MM" (как хранится в БД, UTC).
// Разбираем вручную, без парсинга локальной зоной, иначе дата съезжает на день.
const SLOT_WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const SLOT_MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function formatSlot(slot: { date: string; startTime: string; endTime: string }) {
  const parts = slot.date.split("-");
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return `${slot.date} · ${slot.startTime}–${slot.endTime}`;
  }
  const wd = SLOT_WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()] ?? "";
  const month = SLOT_MONTHS[mo - 1] ?? "";
  return `${d} ${month}, ${wd} · ${slot.startTime}–${slot.endTime}`;
}

/** Кольцо среднего балла — то же, что на своём профиле. */
function ScoreRing({ score, color, size = 64 }: { score: number | null; color: string; size?: number }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score ?? 0));
  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2} cy={size / 2} r={r}
        stroke="rgba(99,102,241,0.16)" strokeWidth={stroke} fill="none"
      />
      {score !== null && (
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={circumference * (1 - pct / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </Svg>
  );
}

export default function FriendProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const friendId = parseInt(id || "0", 10);
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [friendStatus, setFriendStatus] = useState<FriendshipStatus>("loading");
  const [friendshipId, setFriendshipId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [gameStats, setGameStats] = useState<StudentProfileStats | null>(null);
  const [period, setPeriod] = useState<StatsPeriod>("all");
  const onlinePollerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isStudent = user?.role === "student";
  const isTeacherViewer = isTeacherOrAdmin(user?.role ?? "");
  // Чей профиль открыт: у учителя ученические счётчики всегда нули, поэтому
  // весь блок цифр для него другой.
  const isTeacherProfile = isTeacherOrAdmin(profile?.role ?? "");

  // Прогресс ученика по словам (флеш-карточки) + CEFR — видит учитель.
  const [wordStats, setWordStats] = useState<FlashcardStatsWithLevel | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  // Цифры профиля учителя — отдельным запросом, только когда открыт учитель.
  const [teacherStats, setTeacherStats] = useState<TeacherProfileStats | null>(null);
  const [teacherStatsError, setTeacherStatsError] = useState(false);

  useEffect(() => {
    if (isTeacherViewer && profile?.role === "student" && friendId) {
      fc.getStats(friendId).then(setWordStats).catch(() => setWordStats(null));
    }
  }, [isTeacherViewer, profile?.role, friendId]);

  useEffect(() => {
    if (!friendId || !profile || !isTeacherOrAdmin(profile.role)) return;
    let cancelled = false;
    setTeacherStatsError(false);
    apiFetch(`/api/teachers/${friendId}/profile-stats`)
      .then((data) => { if (!cancelled) setTeacherStats(data); })
      .catch(() => {
        if (!cancelled) { setTeacherStats(null); setTeacherStatsError(true); }
      });
    return () => { cancelled = true; };
  }, [friendId, profile?.role]);

  const loadProfile = useCallback(async () => {
    if (!friendId) {
      setError("Неверный ID пользователя");
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch(`/api/users/${friendId}`);
      setProfile(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [friendId]);

  const loadCategoryStats = useCallback(async () => {
    if (!friendId) return;
    try {
      const data = await apiFetch(`/api/students/${friendId}/category-stats`);
      setCategoryStats(data ?? []);
    } catch {
      setCategoryStats([]);
    }
  }, [friendId]);

  // Слова, серия, срезы успеваемости и условия наград. Без этого запроса
  // профиль всё равно откроется — просто вместо «слов выучено / дней подряд»
  // в шапке останутся очки и задания.
  const loadGameStats = useCallback(async () => {
    if (!friendId) return;
    try {
      const data = await apiFetch(`/api/students/${friendId}/profile-stats`);
      setGameStats(data ?? null);
    } catch {
      setGameStats(null);
    }
  }, [friendId]);

  // Интересы открыты всем авторизованным (см. routes/interests.ts): по ним
  // видно, о чём с человеком можно поговорить.
  const loadInterests = useCallback(async () => {
    if (!friendId) return;
    try {
      const data = await apiFetch(`/api/users/${friendId}/interests`);
      setInterests(Array.isArray(data?.interests) ? data.interests : []);
    } catch {
      setInterests([]);
    }
  }, [friendId]);

  // Lightweight poll — only refreshes isOnline, no full reload
  const pollOnlineStatus = useCallback(async () => {
    if (!friendId) return;
    try {
      const data = await apiFetch(`/api/users/${friendId}`);
      setProfile(prev => prev ? { ...prev, isOnline: data.isOnline, lastSeenAt: data.lastSeenAt } : prev);
    } catch { /* silent */ }
  }, [friendId]);

  const loadFriendStatus = useCallback(async () => {
    if (!friendId || !isStudent) return;
    try {
      const data = await apiFetch(`/api/connections/friends/status/${friendId}`);
      setFriendStatus(data.status);
      setFriendshipId(data.friendshipId ?? null);
    } catch {
      setFriendStatus("none");
    }
  }, [friendId, isStudent]);

  useEffect(() => {
    loadProfile();
    loadFriendStatus();
    loadCategoryStats();
    loadInterests();
    loadGameStats();
    // Poll online status every 30s so it stays up-to-date
    onlinePollerRef.current = setInterval(pollOnlineStatus, 30_000);
    return () => {
      if (onlinePollerRef.current) clearInterval(onlinePollerRef.current);
    };
  }, [loadProfile, loadFriendStatus, loadCategoryStats, loadInterests, loadGameStats, pollOnlineStatus]);

  const handleSendRequest = async () => {
    setActionLoading(true);
    try {
      await apiFetch("/api/connections/friends/request-by-id", {
        method: "POST",
        body: JSON.stringify({ userId: friendId }),
      });
      setFriendStatus("pending_sent");
    } catch {
      /* silent */
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!friendshipId) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/connections/friends/${friendshipId}/accept`, { method: "PATCH" });
      setFriendStatus("friends");
    } catch { /* silent */ } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!friendshipId) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/connections/friends/${friendshipId}`, { method: "DELETE" });
      setFriendStatus("none");
      setFriendshipId(null);
    } catch { /* silent */ } finally {
      setActionLoading(false);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { paddingBottom: insets.bottom + 40 },
    section: { paddingHorizontal: 20, marginBottom: 16 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 28 },

    // Переключатель периода — копия своего профиля, вплоть до теней.
    seg: {
      flexDirection: "row", backgroundColor: colors.muted,
      borderRadius: radii.sm + 2, padding: 3, marginBottom: 12,
    },
    segBtn: { flex: 1, paddingVertical: 9, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
    segBtnActive: {
      backgroundColor: colors.card,
      shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
    },
    segText: { fontSize: 13, fontWeight: "700", color: colors.mutedForeground },
    segTextActive: { color: colors.foreground, fontWeight: "800" },

    scoreCard: {
      flexDirection: "row", alignItems: "center", gap: 14,
      backgroundColor: colors.card, borderRadius: radii.md, padding: 16,
      borderWidth: 1, borderColor: colors.border, marginBottom: 10,
      shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.14, shadowRadius: 15, elevation: 4,
    },
    scoreLabel: {
      fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase",
      color: colors.mutedForeground,
    },
    scoreValue: { fontSize: 30, fontWeight: "900", letterSpacing: -1.2, marginTop: 3, fontVariant: ["tabular-nums"] },
    scoreHint: { fontSize: 12, color: colors.mutedForeground, marginTop: 3 },

    timerValue: { fontSize: 22, fontWeight: "900", letterSpacing: -0.6, color: "#ffffff", fontVariant: ["tabular-nums"] },
    timerLabel: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },

    // Шапка для профиля учителя: она осталась прежней, поэтому ей нужен свой
    // ряд с кнопкой «назад».
    plainHeader: {
      paddingTop: screenTop(insets),
      paddingHorizontal: 20, paddingBottom: 12,
      flexDirection: "row", alignItems: "center", gap: 12,
    },
    backBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
    headerTitle: { fontSize: 18, fontWeight: "800", color: colors.foreground, flex: 1 },
  });

  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={s.container}>
        <View style={s.plainHeader}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <View style={s.center}>
          <Glyph name="alert" size={40} color={colors.mutedForeground} />
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>Не удалось загрузить</Text>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
            {error || "Профиль недоступен"}
          </Text>
        </View>
      </View>
    );
  }

  const avatarColor = profile.avatarColor ?? "#6366f1";
  const avatarEmoji = profile.avatarEmoji ?? "🦁";
  const isSelf = user?.id === friendId;
  const canWrite = !isSelf && (!isStudent || isTeacherProfile || friendStatus === "friends");
  const areFriends = friendStatus === "friends";

  // Уровень и опыт считаются из очков теми же таблицами, что на своём профиле:
  // очки и XP в проекте одно и то же (см. constants/xpLevels.ts).
  const xpProgress = getXpProgress(profile.totalPoints);

  // Условия наград — по реальным цифрам ученика. Пока /profile-stats не
  // ответил, берём то, что есть в профиле: витрина покажет меньше медалей, но
  // не соврёт в другую сторону.
  const achievementStats: AchievementStats = {
    completedAssignments: gameStats?.gradedAssignments ?? profile.completedAssignments,
    totalPoints: profile.totalPoints,
    knowledgeLevel: profile.knowledgeLevel,
    totalTimeMinutes: gameStats?.totalTimeMinutes ?? profile.totalTimeMinutes ?? 0,
    voiceChatSessions: gameStats?.voiceChatSessions ?? 0,
    loginStreak: gameStats?.loginStreak ?? 0,
    perfectScoreCount: gameStats?.perfectScoreCount ?? 0,
    xpLevel: xpProgress.current.level,
    earlyBirdSessions: gameStats?.earlyBirdSessions ?? 0,
  };
  const unlocked = getUnlockedAchievements(achievementStats);
  // Закрытые нужны только ради знаменателя в счётчике «26 / 50» и разбивки по
  // сложности — списком они здесь не показываются.
  const locked = getLockedAchievements(achievementStats);

  // Срез успеваемости за выбранный период. Нет ответа сервера — показываем
  // общий средний балл из профиля, как было раньше.
  const activePeriod = gameStats?.periodStats?.[period] ?? null;
  const shownAverage = activePeriod ? activePeriod.average : (profile.averageScore ?? null);
  const shownCount = activePeriod ? activePeriod.count : profile.completedAssignments;
  const shownPoints = activePeriod ? activePeriod.points : profile.totalPoints;

  const scoreTint = shownAverage === null || shownAverage === undefined
    ? colors.mutedForeground
    : shownAverage >= 70 ? colors.success
      : shownAverage >= 50 ? accents.amber
        : colors.destructive;

  // ── Профиль учителя: прежняя вёрстка ──
  if (isTeacherProfile) {
    return (
      <View style={s.container}>
        <View style={s.plainHeader}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Профиль учителя</Text>
          {canWrite && (
            <TouchableOpacity
              onPress={() => router.push(`/(main)/chat/${friendId}` as any)}
              style={{
                flexDirection: "row", alignItems: "center", gap: 6,
                backgroundColor: colors.primary, borderRadius: 12,
                paddingHorizontal: 12, paddingVertical: 8,
              }}
            >
              <Feather name="message-circle" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Написать</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
          <View style={{
            alignItems: "center", paddingVertical: 24,
            backgroundColor: colors.card, borderRadius: 20,
            borderWidth: 1, borderColor: colors.border, marginBottom: 16,
          }}>
            <AnimatedAvatar
              size={90}
              avatarColor={avatarColor}
              avatarEmoji={avatarEmoji}
              avatarUrl={profile.avatarUrl}
              animated={profile.isOnline ?? false}
              onlineDot={profile.isOnline ?? false}
            />
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground, marginBottom: 3 }}>
              {profile.name}
            </Text>
            <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 8 }}>
              @{profile.username}
            </Text>
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 5,
              backgroundColor: profile.isOnline ? "#dcfce7" : "rgba(220,210,255,0.4)",
              paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20,
            }}>
              <View style={{
                width: 7, height: 7, borderRadius: 4,
                backgroundColor: profile.isOnline ? "#22c55e" : "#94a3b8",
              }} />
              <Text style={{
                fontSize: 12, fontWeight: "700",
                color: profile.isOnline ? "#15803d" : "#64748b",
              }}>
                {profile.isOnline ? "В сети" : "Не в сети"}
              </Text>
            </View>
          </View>

          {!!profile.bio && (
            <View style={{
              backgroundColor: colors.card, borderRadius: 16, padding: 16,
              borderWidth: 1, borderColor: colors.border, marginBottom: 16,
            }}>
              <SectionLabel>О себе</SectionLabel>
              <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 20 }}>
                {profile.bio}
              </Text>
            </View>
          )}

          <TeacherProfileStatsSection
            stats={teacherStats}
            failed={teacherStatsError}
            teacherName={profile.name}
            colors={colors}
          />
        </ScrollView>
      </View>
    );
  }

  // ── Профиль ученика: то же оформление, что и свой ──
  //
  // Счётчики в шапке — «слов выучено» и «дней подряд», как у себя. Если
  // /profile-stats не ответил, показываем очки и задания: пустая шапка хуже,
  // чем другая пара цифр.
  const heroStats = gameStats
    ? [
        {
          icon: "cards" as const,
          value: gameStats.wordsLearned,
          label: `${plural(gameStats.wordsLearned, ["слово", "слова", "слов"])} выучено`,
        },
        {
          icon: "flame" as const,
          value: gameStats.loginStreak,
          label: `${plural(gameStats.loginStreak, ["день", "дня", "дней"])} подряд`,
        },
      ]
    : [
        { icon: "star" as const, value: profile.totalPoints, label: "очков" },
        {
          icon: "check" as const,
          value: profile.completedAssignments,
          label: plural(profile.completedAssignments, ["задание", "задания", "заданий"]),
        },
      ];

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <ProfileHero
          name={profile.name}
          username={profile.username}
          avatarEmoji={avatarEmoji}
          avatarColor={avatarColor}
          avatarUrl={profile.avatarUrl}
          roleLabel={ROLE_LABELS[profile.role] ?? profile.role}
          ageLabel={profile.age ? ageWord(profile.age) : null}
          online={profile.isOnline}
          /* Дружба — метка рядом с ролью. Отдельной карточки под шапкой больше
             нет: она занимала всю ширину ради одного слова. */
          friend={areFriends}
          level={{ number: xpProgress.current.level, title: xpProgress.current.title }}
          stats={heroStats}
          xp={{
            current: profile.totalPoints,
            nextAt: xpProgress.next?.xpRequired ?? null,
            nextTitle: xpProgress.next?.title ?? null,
            nextLevel: xpProgress.next?.level ?? null,
            percent: xpProgress.progressPercent,
          }}
          paddingTop={screenTop(insets)}
          onBack={() => router.back()}
          action={canWrite
            ? { icon: "chat", label: "Написать", onPress: () => router.push(`/(main)/chat/${friendId}` as any) }
            : null}
        />

        {/* Карточка дружбы: только когда нужно действие — отправить запрос,
            ответить на входящий или дождаться ответа. Состоявшаяся дружба
            живёт меткой в шапке. */}
        {isStudent && !isSelf && !areFriends && (
          <View style={{ paddingHorizontal: 20 }}>
            <FriendRequestCard
              status={friendStatus}
              name={profile.name}
              loading={actionLoading}
              onSend={handleSendRequest}
              onAccept={handleAccept}
              onDecline={handleDecline}
              colors={colors}
            />
          </View>
        )}

        {/* «О себе» и интересы — только просмотр. */}
        <AboutCard
          bio={profile.bio ?? ""}
          onSaveBio={() => {}}
          interests={interests}
          onSaveInterests={() => {}}
          readOnly
        />

        {/* ── Успеваемость: те же карточки и тот же переключатель периода ── */}
        <View style={s.section}>
          <SectionLabel>Успеваемость</SectionLabel>

          {!!gameStats && (
            <View style={s.seg}>
              {PERIODS.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[s.segBtn, period === p.key && s.segBtnActive]}
                  onPress={() => setPeriod(p.key)}
                  activeOpacity={0.85}
                >
                  <Text style={[s.segText, period === p.key && s.segTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={s.scoreCard}>
            <ScoreRing score={shownAverage} color={scoreTint} />
            <View style={{ flex: 1 }}>
              <Text style={s.scoreLabel}>Средний балл</Text>
              <Text style={[s.scoreValue, { color: scoreTint }]}>
                {shownAverage === null || shownAverage === undefined ? "—" : `${shownAverage}%`}
              </Text>
              <Text style={s.scoreHint}>
                {shownCount === 0
                  ? (gameStats ? "За этот период работ нет" : "Пока нет проверенных работ")
                  : `${shownCount} ${plural(shownCount, ["работа", "работы", "работ"])} · +${shownPoints} очков`}
              </Text>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "stretch" }}>
            <View style={{
              flex: 1, backgroundColor: colors.card, borderRadius: radii.md, padding: 14,
              borderWidth: 1, borderColor: colors.border,
              shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
              shadowOpacity: 0.14, shadowRadius: 14, elevation: 3,
            }}>
              <SectionLabel>Задания</SectionLabel>
              <AssignmentRingsChart stats={categoryStats} colors={colors} />
            </View>

            <LinearGradient
              colors={gradients.action as unknown as string[]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={{
                flex: 1, borderRadius: radii.md, padding: 14,
                justifyContent: "center",
                shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.32, shadowRadius: 16, elevation: 6,
              }}
            >
              <View style={{ alignItems: "center", gap: 8 }}>
                <View style={{
                  width: 48, height: 48, borderRadius: radii.sm + 2,
                  backgroundColor: "rgba(255,255,255,0.22)",
                  justifyContent: "center", alignItems: "center",
                }}>
                  <Glyph name="clock" size={24} color="#ffffff" />
                </View>
                <Text style={[s.timerValue, { textAlign: "center" }]}>
                  {formatTime(gameStats?.totalTimeMinutes ?? profile.totalTimeMinutes ?? 0)}
                </Text>
                <Text style={[s.timerLabel, { textAlign: "center" }]}>
                  {gameStats ? `Сегодня: ${formatTime(gameStats.todayMinutes)}` : "За всё время"}
                </Text>
              </View>
            </LinearGradient>
          </View>
        </View>

        {/* ── Учителю: уровень знаний, прогресс по словам, отправка колод ── */}
        {isTeacherViewer && (
          <View style={s.section}>
            <SectionLabel>Знания и слова</SectionLabel>
            <View style={{
              backgroundColor: colors.card, borderRadius: radii.md, padding: 16,
              borderWidth: 1, borderColor: colors.border,
              shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
              shadowOpacity: 0.13, shadowRadius: 14, elevation: 3,
            }}>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                <View style={{ flex: 1, backgroundColor: colors.primary + "12", borderRadius: 12, padding: 12 }}>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, marginBottom: 4 }}>Уровень</Text>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: colors.primary }}>
                    {profile.knowledgeLevel ? (KNOWLEDGE_LABELS[profile.knowledgeLevel] ?? profile.knowledgeLevel) : "—"}
                  </Text>
                </View>
                <View style={{ flex: 1, backgroundColor: accents.magenta + "12", borderRadius: 12, padding: 12 }}>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, marginBottom: 4 }}>CEFR (тест)</Text>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: accents.magenta }}>
                    {wordStats?.placementLevel ?? gameStats?.placementLevel ?? "не пройден"}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                {[
                  { value: wordStats?.totalLearned ?? gameStats?.wordsLearned ?? 0, label: "Выучено" },
                  { value: wordStats?.totalWords ?? 0, label: "В изучении" },
                  { value: `${wordStats?.accuracy ?? 0}%`, label: "Точность" },
                ].map((it) => (
                  <View key={it.label} style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground, fontVariant: ["tabular-nums"] }}>
                      {it.value}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center" }}>{it.label}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                onPress={() => setAssignOpen(true)}
                style={{
                  backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12,
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                <Glyph name="send" size={16} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>Отправить колоду</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Витрина наград: тот же компонент, что на своём профиле, но только с
            полученными медалями. Чужие «ещё не получены» — это чужие пробелы,
            а не витрина: смотреть, сколько человеку осталось до «Месяца силы»,
            незачем, а список из тридцати замков растягивал экран. */}
        <AchievementsShowcase
          unlocked={unlocked}
          locked={locked}
          showLocked={false}
          stats={achievementStats}
          title="Витрина наград"
        />
      </ScrollView>

      {isTeacherViewer && (
        <AssignDeckModal
          visible={assignOpen}
          onClose={() => setAssignOpen(false)}
          studentId={friendId}
          studentName={profile.name}
          teacherId={user?.id ?? 0}
          colors={colors}
        />
      )}
    </View>
  );
}

// Блок цифр на профиле учителя. Личное («с вами») и общее («всего») разведены
// плашками, чтобы ученик не принял общий счётчик за свой.
function TeacherProfileStatsSection({
  stats, failed, teacherName, colors,
}: {
  stats: TeacherProfileStats | null;
  failed: boolean;
  teacherName: string;
  colors: any;
}) {
  const router = useRouter();

  if (failed) {
    return (
      <View style={{
        backgroundColor: colors.card, borderRadius: 16, padding: 20,
        borderWidth: 1, borderColor: colors.border, marginBottom: 16, alignItems: "center", gap: 8,
      }}>
        <Glyph name="alert" size={26} color={colors.mutedForeground} />
        <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
          Не удалось загрузить статистику учителя
        </Text>
      </View>
    );
  }

  if (!stats) {
    return (
      <View style={{
        backgroundColor: colors.card, borderRadius: 16, padding: 28,
        borderWidth: 1, borderColor: colors.border, marginBottom: 16,
      }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const p = stats.personal;
  const o = stats.overall;
  // Ученик ещё не занимался с этим учителем: нули показывать бессмысленно —
  // вместо них подсказка, что делать дальше.
  const firstTime = p.lessonsWithMe === 0 && p.assignedToMe === 0 && !p.nextLessonWithMe;

  const cards: { icon: string; color: string; value: string | number; label: string; badge: string; personal: boolean }[] = [
    { icon: "calendar", color: "#6366f1", value: p.lessonsWithMe, label: "Слотов", badge: "с вами", personal: true },
    { icon: "clock", color: colors.primary, value: formatTime(p.minutesWithMe), label: "Время", badge: "с вами", personal: true },
    { icon: "edit-3", color: "#ec4899", value: o.assignmentsCreated, label: "Заданий создано", badge: "всего", personal: false },
  ];

  const ringStats: CategoryStat[] = p.categories.map((c) => ({
    type: c.type,
    avgScore: c.avgScore,
    count: c.count,
  }));

  return (
    <>
      {/* ── Три главные цифры ── */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
        {cards.map((card) => (
          <View key={card.label} style={{
            flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14,
            alignItems: "center", borderWidth: 1, borderColor: colors.border,
          }}>
            <Feather name={card.icon as any} size={20} color={card.color} />
            <Text style={{
              fontSize: typeof card.value === "string" ? 14 : 22,
              fontWeight: "900", color: colors.foreground, marginTop: 6, marginBottom: 2,
            }}>
              {card.value}
            </Text>
            <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center" }}>
              {card.label}
            </Text>
            <View style={{
              marginTop: 6, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
              backgroundColor: card.personal ? colors.primary + "18" : colors.muted,
            }}>
              <Text style={{
                fontSize: 9, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase",
                color: card.personal ? colors.primary : colors.mutedForeground,
              }}>
                {card.badge}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* ── Первое знакомство: экран не должен быть пустым ── */}
      {firstTime && (
        <View style={{
          backgroundColor: colors.primary + "10", borderRadius: 16, padding: 16,
          borderWidth: 1, borderColor: colors.primary + "30", marginBottom: 16,
        }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, marginBottom: 6 }}>
            Вы ещё не занимались вместе
          </Text>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, lineHeight: 19, marginBottom: 12 }}>
            {teacherName}: {o.studentsCount} учеников, {o.assignmentsCreated} заданий, {o.lessonsTotal} проведённых занятий.
            {stats.freeSlotsTotal > 0
              ? ` Свободных слотов сейчас: ${stats.freeSlotsTotal}.`
              : " Свободных слотов пока нет — загляните в календарь позже."}
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(main)/calendar" as any)}
            style={{
              backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12,
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <Feather name="calendar" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Открыть календарь</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Ближайшее / последнее занятие с этим учителем ── */}
      {(p.nextLessonWithMe || p.lastLessonWithMe) && (
        <View style={{
          backgroundColor: colors.card, borderRadius: 16, padding: 16,
          borderWidth: 1, borderColor: colors.border, marginBottom: 16, gap: 10,
        }}>
          {p.nextLessonWithMe && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + "15",
                alignItems: "center", justifyContent: "center",
              }}>
                <Feather name="play-circle" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Ближайшее занятие</Text>
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>
                  {formatSlot(p.nextLessonWithMe)}
                </Text>
              </View>
            </View>
          )}
          {p.lastLessonWithMe && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 18, backgroundColor: colors.muted,
                alignItems: "center", justifyContent: "center",
              }}>
                <Feather name="rotate-ccw" size={18} color={colors.mutedForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Последнее занятие</Text>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                  {formatSlot(p.lastLessonWithMe)}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ── Ваш прогресс по заданиям ЭТОГО учителя ── */}
      {p.assignedToMe > 0 && (
        <View style={{
          backgroundColor: colors.card, borderRadius: 16, padding: 16,
          borderWidth: 1, borderColor: colors.border, marginBottom: 16,
        }}>
          <SectionLabel>Ваш прогресс по его заданиям</SectionLabel>

          <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
            {[
              { value: `${p.completedByMe}/${p.assignedToMe}`, label: "Сдано" },
              { value: p.avgScore !== null ? `${p.avgScore}%` : "—", label: "Средний результат" },
              { value: p.pointsFromTeacher, label: "Очки за них" },
            ].map((it) => (
              <View key={it.label} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>{it.value}</Text>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center" }}>{it.label}</Text>
              </View>
            ))}
          </View>

          <AssignmentRingsChart stats={ringStats} colors={colors} />
        </View>
      )}

      {/* ── Свободные слоты этого учителя ── */}
      {stats.freeSlots.length > 0 && (
        <View style={{
          backgroundColor: colors.card, borderRadius: 16, padding: 16,
          borderWidth: 1, borderColor: colors.border, marginBottom: 16,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ flex: 1, fontSize: 11, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Свободные слоты
            </Text>
            <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary }}>
              {stats.freeSlotsTotal}
            </Text>
          </View>

          {stats.freeSlots.map((slot) => (
            <TouchableOpacity
              key={slot.id}
              onPress={() => router.push("/(main)/calendar" as any)}
              style={{
                flexDirection: "row", alignItems: "center", gap: 10,
                paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border,
              }}
            >
              <Feather name="clock" size={16} color={colors.mutedForeground} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                {formatSlot(slot)}
              </Text>
              <View style={{
                borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
                backgroundColor: slot.myStatus === "pending" ? colors.muted : colors.primary + "18",
              }}>
                <Text style={{
                  fontSize: 11, fontWeight: "800",
                  color: slot.myStatus === "pending" ? colors.mutedForeground : colors.primary,
                }}>
                  {slot.myStatus === "pending" ? "Заявка отправлена" : "Записаться"}
                </Text>
              </View>
            </TouchableOpacity>
          ))}

          {stats.freeSlotsTotal > stats.freeSlots.length && (
            <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 10 }}>
              и ещё {stats.freeSlotsTotal - stats.freeSlots.length} в календаре
            </Text>
          )}
        </View>
      )}

      {/* ── Последние задания от этого учителя ── */}
      {p.recentAssignments.length > 0 && (
        <View style={{
          backgroundColor: colors.card, borderRadius: 16, padding: 16,
          borderWidth: 1, borderColor: colors.border, marginBottom: 16,
        }}>
          <SectionLabel>Задания от учителя</SectionLabel>

          {p.recentAssignments.map((a) => (
            <TouchableOpacity
              key={a.id}
              onPress={() => router.push(`/(main)/assignment/${a.id}` as any)}
              style={{
                flexDirection: "row", alignItems: "center", gap: 10,
                paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border,
              }}
            >
              <View style={{
                width: 32, height: 32, borderRadius: 10,
                backgroundColor: a.done ? colors.primary + "18" : colors.muted,
                alignItems: "center", justifyContent: "center",
              }}>
                <Glyph
                  name={a.done ? "check" : "clock"}
                  size={15}
                  color={a.done ? colors.primary : colors.mutedForeground}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>
                  {a.title ?? "Задание"}
                </Text>
                <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                  {a.type ? (ASSIGNMENT_TYPE_LABELS[a.type] ?? a.type) : "Задание"}
                  {a.points ? ` · ${a.points} очк.` : ""}
                </Text>
              </View>
              <Text style={{
                fontSize: 13, fontWeight: "800",
                color: a.done ? colors.primary : colors.mutedForeground,
              }}>
                {a.done ? `${a.score ?? 0}%` : "не сдано"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Общие цифры учителя (одинаковы для всех учеников) ── */}
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 8,
        backgroundColor: colors.muted, borderRadius: 14, padding: 14, marginBottom: 16,
      }}>
        <Feather name="users" size={16} color={colors.mutedForeground} />
        <Text style={{ flex: 1, fontSize: 12, color: colors.mutedForeground, lineHeight: 18 }}>
          Всего у учителя: {o.studentsCount} учеников · {o.lessonsTotal} проведённых занятий · {formatTime(o.minutesTotal)} за всё время
        </Text>
      </View>
    </>
  );
}

// Модалка «Отправить колоду»: список собственных колод учителя с переключателем
// «Отправлено/Отправить» для конкретного ученика.
function AssignDeckModal({
  visible, onClose, studentId, studentName, teacherId, colors,
}: {
  visible: boolean;
  onClose: () => void;
  studentId: number;
  studentName: string;
  teacherId: number;
  colors: any;
}) {
  const router = useRouter();
  const [decks, setDecks] = useState<DeckWithAssign[]>([]);
  const [assignedSet, setAssignedSet] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Свои колоды и список уже отправленных этому ученику — двумя запросами.
      // Раньше assignees опрашивались по каждой колоде отдельно: открытие окна
      // стоило N+1 запросов и заметно тормозило на мобильной сети.
      const [own, assigned] = await Promise.all([
        fc.getMyDecks(),
        fc.getStudentAssignments(studentId),
      ]);
      setDecks(own.filter((d) => d.ownerId === teacherId && !d.isSystem));
      setAssignedSet(new Set(assigned));
    } catch {
      setDecks([]);
    } finally {
      setLoading(false);
    }
  }, [teacherId, studentId]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  const toggle = async (deckId: number) => {
    setBusyId(deckId);
    const isOn = assignedSet.has(deckId);
    try {
      if (isOn) {
        await fc.unassignDeck(deckId, studentId);
        setAssignedSet((prev) => { const n = new Set(prev); n.delete(deckId); return n; });
      } else {
        await fc.assignDeck(deckId, studentId);
        setAssignedSet((prev) => new Set(prev).add(deckId));
      }
    } catch { /* silent */ } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, maxHeight: "80%",
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: colors.foreground }}>
              Отправить колоду
            </Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 16 }}>
            Ученику: {studentName}
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} size="large" style={{ marginVertical: 40 }} />
          ) : decks.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 30, gap: 12 }}>
              <Glyph name="cards" size={40} color={colors.mutedForeground} />
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>У вас нет своих колод</Text>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
                Создайте колоду и добавьте слова, чтобы отправить её ученику.
              </Text>
              <TouchableOpacity
                onPress={() => { onClose(); router.push("/(main)/flashcards/new-deck" as any); }}
                style={{ marginTop: 8, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Создать колоду</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView>
              {decks.map((d) => {
                const on = assignedSet.has(d.id);
                return (
                  <View key={d.id} style={{
                    flexDirection: "row", alignItems: "center", gap: 12,
                    backgroundColor: colors.card, borderRadius: 14, padding: 14,
                    borderWidth: 1, borderColor: colors.border, marginBottom: 10,
                  }}>
                    <Text style={{ fontSize: 26 }}>{d.emoji ?? "📕"}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>
                        {d.title}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                        {d.wordCount ?? 0} слов
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => toggle(d.id)}
                      disabled={busyId === d.id}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 6,
                        backgroundColor: on ? colors.muted : colors.primary,
                        borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, minWidth: 118, justifyContent: "center",
                      }}
                    >
                      {busyId === d.id ? (
                        <ActivityIndicator size={14} color={on ? colors.mutedForeground : "#fff"} />
                      ) : (
                        <>
                          <Glyph name={on ? "check" : "send"} size={14} color={on ? colors.mutedForeground : "#fff"} />
                          <Text style={{ fontSize: 13, fontWeight: "700", color: on ? colors.mutedForeground : "#fff" }}>
                            {on ? "Отправлено" : "Отправить"}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Карточка дружбы. Показывается только когда от смотрящего нужно действие или
 * когда он ждёт ответа. Состоявшаяся дружба сюда не попадает: её показывает
 * метка «Друг» в шапке (ProfileHero props.friend).
 */
function FriendRequestCard({
  status, name, loading, onSend, onAccept, onDecline, colors,
}: {
  status: FriendshipStatus;
  name: string;
  loading: boolean;
  onSend: () => void;
  onAccept: () => void;
  onDecline: () => void;
  colors: any;
}) {
  // "loading" — статус ещё не пришёл, "friends" — уже видно меткой в шапке.
  if (status === "loading" || status === "friends") return null;

  if (status === "pending_sent") {
    return (
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 12,
        backgroundColor: accents.magenta + "12", borderRadius: radii.md, padding: 14,
        borderWidth: 1.5, borderColor: accents.magenta + "33", marginBottom: 14,
      }}>
        <View style={{
          width: 40, height: 40, borderRadius: 14,
          backgroundColor: accents.magenta + "1f",
          justifyContent: "center", alignItems: "center",
        }}>
          <Glyph name="clock" size={20} color={accents.magenta} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground }}>Запрос отправлен</Text>
          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Ожидаем ответа от {name}</Text>
        </View>
      </View>
    );
  }

  if (status === "pending_received") {
    return (
      <View style={{
        backgroundColor: colors.card, borderRadius: radii.md, padding: 14,
        borderWidth: 1.5, borderColor: colors.primary + "50", marginBottom: 14,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <View style={{
            width: 40, height: 40, borderRadius: 14,
            backgroundColor: colors.primary + "15",
            justifyContent: "center", alignItems: "center",
          }}>
            <Glyph name="userPlus" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground }}>
              {name} хочет дружить
            </Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
              Входящий запрос на дружбу
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            onPress={onAccept}
            disabled={loading}
            style={{
              flex: 1, backgroundColor: colors.primary, borderRadius: 12,
              paddingVertical: 11, alignItems: "center",
            }}
          >
            {loading
              ? <ActivityIndicator size={16} color="#fff" />
              : <Text style={{ fontSize: 14, fontWeight: "800", color: "#fff" }}>Принять</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDecline}
            disabled={loading}
            style={{
              flex: 1, backgroundColor: colors.muted, borderRadius: 12,
              paddingVertical: 11, alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.mutedForeground }}>Отклонить</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: radii.md, padding: 14,
      borderWidth: 1, borderColor: colors.border, marginBottom: 14,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <View style={{
          width: 40, height: 40, borderRadius: 14,
          backgroundColor: colors.primary + "12",
          justifyContent: "center", alignItems: "center",
        }}>
          <Glyph name="userPlus" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground }}>
            Добавить в друзья
          </Text>
          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
            Отправить запрос {name}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={onSend}
        disabled={loading}
        style={{
          backgroundColor: colors.primary, borderRadius: 12,
          paddingVertical: 12, alignItems: "center",
          flexDirection: "row", justifyContent: "center", gap: 8,
        }}
      >
        {loading
          ? <ActivityIndicator size={16} color="#fff" />
          : (
            <>
              <Glyph name="userPlus" size={16} color="#fff" />
              <Text style={{ fontSize: 14, fontWeight: "800", color: "#fff" }}>Отправить запрос</Text>
            </>
          )
        }
      </TouchableOpacity>
    </View>
  );
}
