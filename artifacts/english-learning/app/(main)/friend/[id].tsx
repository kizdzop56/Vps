import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform,
} from "react-native";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { ACHIEVEMENTS, getUnlockedAchievements, type AchievementStats } from "@/constants/achievements";
import authStorage from "@/utils/authStorage";
import { AchievementsShowcase } from "@/components/AchievementsShowcase";
import { AssignmentRingsChart, type CategoryStat } from "@/components/AssignmentRingsChart";

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

type FriendshipStatus = "none" | "pending_sent" | "pending_received" | "friends" | "loading";

function formatTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
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

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Профиль ученика</Text>
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

        {/* ── Задания по категориям ── */}
        <View style={{
          backgroundColor: colors.card, borderRadius: 16, padding: 16,
          borderWidth: 1, borderColor: colors.border, marginBottom: 16,
        }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            Задания по категориям
          </Text>
          <AssignmentRingsChart stats={categoryStats} colors={colors} />
        </View>

        <AchievementsShowcase
          unlocked={unlocked}
          showLocked={false}
          title="Витрина наград"
        />

      </ScrollView>
    </View>
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
