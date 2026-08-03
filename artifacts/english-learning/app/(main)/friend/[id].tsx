import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Modal,
} from "react-native";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import { ACHIEVEMENTS, getUnlockedAchievements, type AchievementStats } from "@/constants/achievements";
import authStorage from "@/utils/authStorage";
import { AchievementsShowcase } from "@/components/AchievementsShowcase";
import { AssignmentRingsChart, type CategoryStat } from "@/components/AssignmentRingsChart";
import { fc, type DeckWithAssign, type FlashcardStatsWithLevel } from "@/hooks/useFlashcards";

// Подписи уровня знаний (возрастной, из профиля) на русском.
const KNOWLEDGE_LABELS: Record<string, string> = {
  starter: "Стартовый",
  beginner: "Начинающий",
  elementary: "Элементарный",
  intermediate: "Средний",
  upper_intermediate: "Продвинутый",
};

// Подписи типов заданий — для списка «последние задания от учителя».
const ASSIGNMENT_TYPE_LABELS: Record<string, string> = {
  text_test: "Тест",
  audio: "Аудирование",
  reading: "Чтение",
  video: "Видео",
  free_form: "Свободный ответ",
};

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

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
  bio: string | null;
  age: number | null;
  dateOfBirth: string | null;
  role: string;
  completedAssignments: number;
  isOnline?: boolean;
  lastSeenAt?: string | null;
};

// Ответ GET /api/teachers/:id/profile-stats.
// personal — цифры пары «я ↔ этот учитель», overall — общие цифры учителя.
type TeacherSlot = {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  myStatus?: "free" | "pending";
};

type TeacherStats = {
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
    lastLessonWithMe: TeacherSlot | null;
    nextLessonWithMe: TeacherSlot | null;
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
  freeSlots: TeacherSlot[];
  freeSlotsTotal: number;
};

type FriendshipStatus = "none" | "pending_sent" | "pending_received" | "friends" | "loading";

function formatTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

// "2026-08-05" → "5 авг"
function formatSlotDay(date: string): string {
  const parts = date.split("-");
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(month) || !Number.isFinite(day)) return date;
  return `${day} ${MONTHS_SHORT[month - 1] ?? ""}`.trim();
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
  const onlinePollerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isStudent = user?.role === "student";
  const isTeacherViewer = isTeacherOrAdmin(user?.role ?? "");

  // Прогресс ученика по словам (флеш-карточки) + CEFR — видит учитель.
  const [wordStats, setWordStats] = useState<FlashcardStatsWithLevel | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  // Цифры профиля учителя. Грузятся только когда открыт профиль учителя —
  // на ученическом профиле этот запрос не нужен.
  const [teacherStats, setTeacherStats] = useState<TeacherStats | null>(null);
  const profileRole = profile?.role ?? null;

  useEffect(() => {
    if (isTeacherViewer && profile?.role === "student" && friendId) {
      fc.getStats(friendId).then(setWordStats).catch(() => setWordStats(null));
    }
  }, [isTeacherViewer, profile?.role, friendId]);

  useEffect(() => {
    if (!friendId || !profileRole || !isTeacherOrAdmin(profileRole)) {
      setTeacherStats(null);
      return;
    }
    apiFetch(`/api/teachers/${friendId}/profile-stats`)
      .then(setTeacherStats)
      .catch(() => setTeacherStats(null));
  }, [friendId, profileRole]);

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
    // Poll online status every 30s so it stays up-to-date
    onlinePollerRef.current = setInterval(pollOnlineStatus, 30_000);
    return () => {
      if (onlinePollerRef.current) clearInterval(onlinePollerRef.current);
    };
  }, [loadProfile, loadFriendStatus, loadCategoryStats, pollOnlineStatus]);

  const handleSendRequest = async () => {
    setActionLoading(true);
    try {
      await apiFetch("/api/connections/friends/request-by-id", {
        method: "POST",
        body: JSON.stringify({ userId: friendId }),
      });
      setFriendStatus("pending_sent");
    } catch (e: any) {
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
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 12,
      flexDirection: "row", alignItems: "center", gap: 12,
    },
    backBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
    headerTitle: { fontSize: 18, fontWeight: "800", color: colors.foreground, flex: 1 },
    scroll: { paddingHorizontal: 20, paddingBottom: insets.bottom + 40 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
    card: {
      backgroundColor: colors.card, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: colors.border, marginBottom: 16,
    },
    cardTitle: {
      fontSize: 11, fontWeight: "700", color: colors.mutedForeground,
      textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10,
    },
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
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <View style={s.center}>
          <Text style={{ fontSize: 40 }}>😕</Text>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>Не удалось загрузить</Text>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
            {error || "Профиль недоступен"}
          </Text>
        </View>
      </View>
    );
  }

  const achievementStats: AchievementStats = {
    completedAssignments: profile.completedAssignments,
    totalPoints: profile.totalPoints,
    knowledgeLevel: profile.knowledgeLevel,
    totalTimeMinutes: profile.totalTimeMinutes ?? 0,
    voiceChatSessions: 0,
    loginStreak: 0,
    perfectScoreCount: 0,
    xpLevel: 0,
    earlyBirdSessions: 0,
  };
  const unlocked = getUnlockedAchievements(achievementStats);

  const avatarColor = profile.avatarColor ?? "#6366f1";
  const avatarEmoji = profile.avatarEmoji ?? "🦁";
  const isSelf = user?.id === friendId;

  // Профиль учителя собирается из других цифр: ученические счётчики у него
  // всегда нули, поэтому ученические блоки на нём просто не показываются.
  const isTeacherProfile = isTeacherOrAdmin(profile.role);
  const tp = teacherStats?.personal ?? null;
  const to = teacherStats?.overall ?? null;
  // Личные цифры имеют смысл только для ученика: у учителя или родителя
  // «слотов с вами» не бывает — им показываем общие.
  const showPersonalTeacherStats = isTeacherProfile && isStudent;
  const teacherStatCards = showPersonalTeacherStats
    ? [
        { icon: "calendar", color: "#6366f1", value: String(tp?.lessonsWithMe ?? 0), label: "Слотов", badge: "с вами", small: false },
        { icon: "clock", color: colors.primary, value: formatTime(tp?.minutesWithMe ?? 0), label: "Времени", badge: "с вами", small: true },
        { icon: "edit-3", color: "#ec4899", value: String(to?.assignmentsCreated ?? 0), label: "Заданий создано", badge: "всего", small: false },
      ]
    : [
        { icon: "users", color: "#6366f1", value: String(to?.studentsCount ?? 0), label: "Учеников", badge: "всего", small: false },
        { icon: "calendar", color: colors.primary, value: String(to?.lessonsTotal ?? 0), label: "Занятий провёл", badge: "всего", small: false },
        { icon: "edit-3", color: "#ec4899", value: String(to?.assignmentsCreated ?? 0), label: "Заданий создано", badge: "всего", small: false },
      ];
  // Ученик открыл профиль учителя, с которым ещё ни разу не занимался:
  // вместо нулей показываем, чем учитель занимается, и как записаться.
  const teacherNoHistory = !!tp
    && showPersonalTeacherStats
    && tp.lessonsWithMe === 0
    && tp.assignedToMe === 0
    && !tp.nextLessonWithMe;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{isTeacherProfile ? "Профиль учителя" : "Профиль ученика"}</Text>
        {/* Кнопка чата — доступна учителю (связан с учеником) и ученикам-друзьям.
            Сервер всё равно проверит связь; кнопку прячем, если чат недоступен. */}
        {!isSelf && (!isStudent || isTeacherProfile || friendStatus === "friends") && (
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

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Avatar + name ── */}
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
            marginBottom: 0,
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

        {/* ── Friend request card (only students, not self) ── */}
        {isStudent && !isSelf && profile.role === "student" && (
          <FriendRequestCard
            status={friendStatus}
            name={profile.name}
            loading={actionLoading}
            onSend={handleSendRequest}
            onAccept={handleAccept}
            onDecline={handleDecline}
            colors={colors}
          />
        )}

        {/* ── Bio ── */}
        {!!profile.bio && (
          <View style={{
            backgroundColor: colors.card, borderRadius: 16, padding: 16,
            borderWidth: 1, borderColor: colors.border, marginBottom: 16,
          }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
              О себе
            </Text>
            <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 20 }}>
              {profile.bio}
            </Text>
          </View>
        )}

        {/* ── Stats row ── */}
        {isTeacherProfile ? (
          /* Учитель: слоты и часы ЛИЧНО с вами + общее число созданных заданий.
             Плашка под подписью говорит, личная это цифра или общая. */
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
            {teacherStatCards.map((stat) => (
              <View key={stat.label} style={{
                flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14,
                alignItems: "center", borderWidth: 1, borderColor: colors.border,
              }}>
                <Feather name={stat.icon as any} size={20} color={stat.color} />
                <Text style={{ fontSize: stat.small ? 14 : 22, fontWeight: "900", color: colors.foreground, marginTop: 6, marginBottom: 2 }}>
                  {stat.value}
                </Text>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center" }}>
                  {stat.label}
                </Text>
                <View style={{
                  marginTop: 5, backgroundColor: colors.muted,
                  borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
                }}>
                  <Text style={{ fontSize: 9, fontWeight: "700", color: colors.mutedForeground }}>
                    {stat.badge}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
            {[
              { icon: "star", color: "#ec4899", value: profile.totalPoints, label: "Очки" },
              { icon: "check-circle", color: "#6366f1", value: profile.completedAssignments, label: "Заданий" },
              { icon: "clock", color: colors.primary, value: formatTime(profile.totalTimeMinutes ?? 0), label: "Время" },
            ].map((stat) => (
              <View key={stat.label} style={{
                flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14,
                alignItems: "center", borderWidth: 1, borderColor: colors.border,
              }}>
                <Feather name={stat.icon as any} size={20} color={stat.color} />
                <Text style={{ fontSize: stat.label === "Время" ? 14 : 22, fontWeight: "900", color: colors.foreground, marginTop: 6, marginBottom: 2 }}>
                  {stat.value}
                </Text>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center" }}>
                  {stat.label}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Задания по категориям (ученик) ── */}
        {!isTeacherProfile && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Задания по категориям</Text>
            <AssignmentRingsChart stats={categoryStats} colors={colors} />
          </View>
        )}

        {/* ── Профиль учителя: занятия, ваш прогресс, расписание ── */}
        {isTeacherProfile && !teacherStats && (
          <View style={[s.card, { alignItems: "center", paddingVertical: 26 }]}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {isTeacherProfile && teacherStats && (
          <>
            {/* Ближайшее занятие именно с вами */}
            {tp?.nextLessonWithMe && (
              <View style={[s.card, {
                flexDirection: "row", alignItems: "center", gap: 12,
                borderColor: colors.primary + "50", borderWidth: 1.5,
              }]}>
                <View style={{
                  width: 42, height: 42, borderRadius: 21,
                  backgroundColor: colors.primary + "15",
                  justifyContent: "center", alignItems: "center",
                }}>
                  <Feather name="calendar" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 2 }}>
                    Ближайшее занятие с вами
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>
                    {formatSlotDay(tp.nextLessonWithMe.date)}, {tp.nextLessonWithMe.startTime}-{tp.nextLessonWithMe.endTime}
                  </Text>
                </View>
              </View>
            )}

            {/* Ваш личный прогресс по заданиям этого учителя */}
            {showPersonalTeacherStats && tp && tp.assignedToMe > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Ваш прогресс по его заданиям</Text>

                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 8 }}>
                  <Text style={{ fontSize: 28, fontWeight: "900", color: colors.foreground }}>
                    {tp.completedByMe}
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.mutedForeground, marginBottom: 4 }}>
                    из {tp.assignedToMe} сдано
                  </Text>
                </View>

                <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden", marginBottom: 14 }}>
                  <View style={{
                    height: 8, borderRadius: 4, backgroundColor: colors.primary,
                    width: `${Math.min(100, Math.round((tp.completedByMe / Math.max(1, tp.assignedToMe)) * 100))}%`,
                  }} />
                </View>

                <View style={{ flexDirection: "row", gap: 10, marginBottom: tp.categories.length > 0 ? 14 : 0 }}>
                  {[
                    { value: tp.avgScore === null ? "—" : `${tp.avgScore}%`, label: "Средний результат" },
                    { value: String(tp.pointsFromTeacher), label: "Очки с его заданий" },
                  ].map((it) => (
                    <View key={it.label} style={{ flex: 1, alignItems: "center" }}>
                      <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>{it.value}</Text>
                      <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center" }}>{it.label}</Text>
                    </View>
                  ))}
                </View>

                {tp.categories.length > 0 && (
                  <>
                    <Text style={[s.cardTitle, { marginBottom: 8 }]}>По категориям его заданий</Text>
                    <AssignmentRingsChart
                      stats={tp.categories.map((c) => ({ type: c.type, avgScore: c.avgScore, count: c.count }))}
                      colors={colors}
                    />
                  </>
                )}
              </View>
            )}

            {/* Свободные слоты — чтобы с экрана профиля можно было записаться */}
            {teacherStats.freeSlots.length > 0 && (
              <View style={s.card}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                  <Text style={[s.cardTitle, { flex: 1, marginBottom: 0 }]}>Свободное время</Text>
                  {teacherStats.freeSlotsTotal > teacherStats.freeSlots.length && (
                    <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                      всего {teacherStats.freeSlotsTotal}
                    </Text>
                  )}
                </View>

                {teacherStats.freeSlots.map((slot) => (
                  <View key={slot.id} style={{
                    flexDirection: "row", alignItems: "center", gap: 10,
                    paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border,
                  }}>
                    <Feather name="clock" size={15} color={colors.mutedForeground} />
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                      {formatSlotDay(slot.date)}, {slot.startTime}-{slot.endTime}
                    </Text>
                    {slot.myStatus === "pending" && (
                      <View style={{ backgroundColor: "#fce7f3", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 10, fontWeight: "700", color: "#9d174d" }}>заявка отправлена</Text>
                      </View>
                    )}
                  </View>
                ))}

                {isStudent && (
                  <TouchableOpacity
                    onPress={() => router.push("/(main)/calendar" as any)}
                    style={{
                      marginTop: 12, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12,
                      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                    }}
                  >
                    <Feather name="calendar" size={16} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Записаться</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Последние задания от этого учителя */}
            {showPersonalTeacherStats && tp && tp.recentAssignments.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Последние задания от него</Text>
                {tp.recentAssignments.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    onPress={() => router.push(`/(main)/assignment/${a.id}` as any)}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 10,
                      paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border,
                    }}
                  >
                    <View style={{
                      width: 30, height: 30, borderRadius: 15,
                      backgroundColor: a.done ? "#dcfce7" : colors.primary + "15",
                      justifyContent: "center", alignItems: "center",
                    }}>
                      <Feather
                        name={a.done ? "check" : "clock"}
                        size={15}
                        color={a.done ? "#15803d" : colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>
                        {a.title ?? "Задание"}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                        {ASSIGNMENT_TYPE_LABELS[a.type ?? ""] ?? "Задание"}{a.done ? " · сдано" : " · ждёт вас"}
                      </Text>
                    </View>
                    {a.done && a.score !== null && (
                      <Text style={{ fontSize: 14, fontWeight: "800", color: colors.primary }}>{a.score}%</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Ученик ещё не занимался с этим учителем — экран не должен быть пустым */}
            {teacherNoHistory && (
              <View style={s.card}>
                <View style={{ alignItems: "center", gap: 6, marginBottom: 14 }}>
                  <Text style={{ fontSize: 34 }}>🎒</Text>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, textAlign: "center" }}>
                    Вы ещё не занимались вместе
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center" }}>
                    Здесь появятся ваши занятия и задания от этого учителя
                  </Text>
                </View>

                {[
                  { icon: "users", label: "Учеников", value: String(to?.studentsCount ?? 0) },
                  { icon: "calendar", label: "Провёл занятий", value: String(to?.lessonsTotal ?? 0) },
                  { icon: "edit-3", label: "Создал заданий", value: String(to?.assignmentsCreated ?? 0) },
                ].map((row) => (
                  <View key={row.label} style={{
                    flexDirection: "row", alignItems: "center", gap: 10,
                    paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border,
                  }}>
                    <Feather name={row.icon as any} size={15} color={colors.mutedForeground} />
                    <Text style={{ flex: 1, fontSize: 13, color: colors.foreground }}>{row.label}</Text>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>{row.value}</Text>
                  </View>
                ))}

                <TouchableOpacity
                  onPress={() => router.push("/(main)/calendar" as any)}
                  style={{
                    marginTop: 14, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12,
                    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  <Feather name="calendar" size={16} color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Открыть расписание</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* ── Учителю: уровень знаний, прогресс по словам, отправка колод ── */}
        {isTeacherViewer && profile.role === "student" && (
          <View style={{
            backgroundColor: colors.card, borderRadius: 16, padding: 16,
            borderWidth: 1, borderColor: colors.border, marginBottom: 16,
          }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
              Знания и слова
            </Text>

            {/* Уровни: возрастной (из профиля) + CEFR (из теста) */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1, backgroundColor: colors.primary + "12", borderRadius: 12, padding: 12 }}>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, marginBottom: 4 }}>Уровень</Text>
                <Text style={{ fontSize: 15, fontWeight: "800", color: colors.primary }}>
                  {profile.knowledgeLevel ? (KNOWLEDGE_LABELS[profile.knowledgeLevel] ?? profile.knowledgeLevel) : "—"}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: "#ec489912", borderRadius: 12, padding: 12 }}>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, marginBottom: 4 }}>CEFR (тест)</Text>
                <Text style={{ fontSize: 15, fontWeight: "800", color: "#db2777" }}>
                  {wordStats?.placementLevel ?? "не пройден"}
                </Text>
              </View>
            </View>

            {/* Прогресс по словам */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
              {[
                { value: wordStats?.totalLearned ?? 0, label: "Выучено" },
                { value: wordStats?.totalWords ?? 0, label: "В изучении" },
                { value: `${wordStats?.accuracy ?? 0}%`, label: "Точность" },
              ].map((it) => (
                <View key={it.label} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>{it.value}</Text>
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
              <Feather name="send" size={16} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Отправить колоду</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Награды — ученическая механика: у учителя их не бывает. */}
        {!isTeacherProfile && (
          <AchievementsShowcase
            unlocked={unlocked}
            showLocked={false}
            title="Витрина наград"
          />
        )}

      </ScrollView>

      {isTeacherViewer && profile.role === "student" && (
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
              <Text style={{ fontSize: 40 }}>📚</Text>
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
                          <Feather name={on ? "check" : "send"} size={14} color={on ? colors.mutedForeground : "#fff"} />
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
  if (status === "loading") return null;

  if (status === "friends") {
    return (
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 12,
        backgroundColor: "#e0e7ff", borderRadius: 16, padding: 16,
        borderWidth: 1.5, borderColor: "#a5b4fc", marginBottom: 16,
      }}>
        <View style={{
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: "#4f46e520",
          justifyContent: "center", alignItems: "center",
        }}>
          <Feather name="user-check" size={20} color="#4f46e5" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: "#4338ca" }}>Вы друзья</Text>
          <Text style={{ fontSize: 12, color: "#4f46e5" }}>с {name}</Text>
        </View>
      </View>
    );
  }

  if (status === "pending_sent") {
    return (
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 12,
        backgroundColor: "#fce7f3", borderRadius: 16, padding: 16,
        borderWidth: 1.5, borderColor: "#fbcfe8", marginBottom: 16,
      }}>
        <View style={{
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: "#9d174d20",
          justifyContent: "center", alignItems: "center",
        }}>
          <Feather name="clock" size={20} color="#9d174d" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: "#9d174d" }}>Запрос отправлен</Text>
          <Text style={{ fontSize: 12, color: "#9d174d" }}>Ожидаем ответа от {name}</Text>
        </View>
      </View>
    );
  }

  if (status === "pending_received") {
    return (
      <View style={{
        backgroundColor: colors.card, borderRadius: 16, padding: 16,
        borderWidth: 1.5, borderColor: colors.primary + "50", marginBottom: 16,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <View style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: colors.primary + "15",
            justifyContent: "center", alignItems: "center",
          }}>
            <Feather name="user-plus" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>
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
              : <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Принять</Text>
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
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.mutedForeground }}>Отклонить</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: colors.border, marginBottom: 16,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <View style={{
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: colors.primary + "12",
          justifyContent: "center", alignItems: "center",
        }}>
          <Feather name="user-plus" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>
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
              <Feather name="user-plus" size={16} color="#fff" />
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Отправить запрос</Text>
            </>
          )
        }
      </TouchableOpacity>
    </View>
  );
}
