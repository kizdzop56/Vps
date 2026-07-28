import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import authStorage from "@/utils/authStorage";
import { useRouter, useFocusEffect } from "expo-router";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string, options?: RequestInit) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Ошибка сервера");
  return data;
}

// Роль, которую видит текущий пользователь у собеседника — чтобы подписать
// строку («Родитель», «Учитель», «Ученик»). Для учителя родитель ученика будет
// подписан как «Родитель» и т.д.
const ROLE_LABELS: Record<string, string> = {
  parent: "Родитель",
  teacher: "Учитель",
  admin: "Учитель",
  student: "Ученик",
};

type FriendUser = {
  id: number;
  name: string;
  username: string;
  role?: string | null;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarUrl?: string | null;
  isOnline?: boolean;
};

type Friend = {
  friendshipId: number;
  user: FriendUser;
  status: "pending" | "accepted";
  direction: "sent" | "received";
};

// Одна строка друга с «панелью чата» напротив — кнопкой, открывающей переписку.
function FriendRow({
  friend, colors, onOpenChat,
}: {
  friend: Friend;
  colors: any;
  onOpenChat: () => void;
}) {
  const u = friend.user;
  const roleLabel = u.role ? ROLE_LABELS[u.role] ?? null : null;
  return (
    <View
      style={{
        backgroundColor: colors.card, borderRadius: 16, padding: 14,
        borderWidth: 1, borderColor: colors.border, marginBottom: 10,
        flexDirection: "row", alignItems: "center", gap: 12,
      }}
    >
      <View style={{ position: "relative" }}>
        <AnimatedAvatar
          size={48}
          avatarColor={u.avatarColor ?? "#6366f1"}
          avatarEmoji={u.avatarEmoji}
          avatarUrl={u.avatarUrl}
        />
        {u.isOnline && (
          <View style={{
            position: "absolute", bottom: 0, right: 0,
            width: 13, height: 13, borderRadius: 7,
            backgroundColor: "#22c55e",
            borderWidth: 2, borderColor: colors.card,
          }} />
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
          {u.name || u.username}
        </Text>
        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
          {roleLabel ? `${roleLabel} · ` : ""}@{u.username}
        </Text>
      </View>

      {/* Панель чата напротив собеседника */}
      <TouchableOpacity
        onPress={onOpenChat}
        style={{
          backgroundColor: colors.primary, borderRadius: 12,
          paddingHorizontal: 14, paddingVertical: 10,
          flexDirection: "row", alignItems: "center", gap: 6,
        }}
      >
        <Feather name="message-circle" size={16} color="#fff" />
        <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>Чат</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function FriendsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/api/connections/friends");
      setFriends(data);
    } catch (e: any) {
      setError(e.message ?? "Не удалось загрузить");
    } finally {
      setLoading(false);
    }
  }, []);

  // Перезагружаем при каждом возврате на вкладку — статусы онлайн/новые друзья.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const accepted = friends.filter((f) => f.status === "accepted");
  const incoming = friends.filter((f) => f.status === "pending" && f.direction === "received");

  const accept = async (f: Friend) => {
    setActioningId(f.friendshipId);
    try {
      await apiFetch(`/api/connections/friends/${f.friendshipId}/accept`, { method: "PATCH" });
      await load();
    } catch { /* silent */ } finally {
      setActioningId(null);
    }
  };

  const decline = async (f: Friend) => {
    setActioningId(f.friendshipId);
    try {
      await apiFetch(`/api/connections/friends/${f.friendshipId}`, { method: "DELETE" });
      setFriends((prev) => prev.filter((x) => x.friendshipId !== f.friendshipId));
    } catch { /* silent */ } finally {
      setActioningId(null);
    }
  };

  const openChat = (id: number) => router.push(`/(main)/chat/${id}` as any);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 16,
    },
    titleText: { fontSize: 26, fontWeight: "800", color: colors.foreground },
    subtitleText: { fontSize: 14, color: colors.mutedForeground, marginTop: 2 },
    content: { paddingHorizontal: 20, paddingBottom: insets.bottom + 100 },
    empty: { alignItems: "center", paddingTop: 60, gap: 12 },
    emptyEmoji: { fontSize: 52 },
    emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.foreground },
    emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
    sectionLabel: {
      fontSize: 12, fontWeight: "700", color: colors.mutedForeground,
      textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10,
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.titleText}>Друзья</Text>
        <Text style={s.subtitleText}>
          {accepted.length > 0 ? `${accepted.length} чел. · нажмите «Чат», чтобы написать` : "Список пуст"}
        </Text>
      </View>

      {loading ? (
        <View style={s.empty}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : error ? (
        <View style={s.empty}>
          <Text style={s.emptyEmoji}>⚠️</Text>
          <Text style={s.emptyTitle}>Ошибка загрузки</Text>
          <Text style={s.emptyText}>{error}</Text>
          <TouchableOpacity
            onPress={load}
            style={{ marginTop: 12, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content}>
          {/* Входящие заявки в друзья */}
          {incoming.length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <Text style={s.sectionLabel}>Заявки в друзья · {incoming.length}</Text>
              {incoming.map((f) => (
                <View key={f.friendshipId} style={{
                  flexDirection: "row", alignItems: "center", gap: 12,
                  backgroundColor: colors.card, borderRadius: 14, padding: 14,
                  borderWidth: 1.5, borderColor: colors.primary + "50", marginBottom: 8,
                }}>
                  <AnimatedAvatar
                    size={44}
                    avatarColor={f.user.avatarColor ?? "#6366f1"}
                    avatarEmoji={f.user.avatarEmoji}
                    avatarUrl={f.user.avatarUrl}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
                      {f.user.name || f.user.username}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground }}>хочет дружить</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => accept(f)}
                    disabled={actioningId === f.friendshipId}
                    style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Принять</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => decline(f)}
                    disabled={actioningId === f.friendshipId}
                    style={{ backgroundColor: colors.muted, borderRadius: 10, padding: 8 }}
                  >
                    <Feather name="x" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Принятые друзья с панелью чата */}
          {accepted.length === 0 && incoming.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>👥</Text>
              <Text style={s.emptyTitle}>Пока нет друзей</Text>
              <Text style={s.emptyText}>
                Здесь появятся ваши друзья — например, родитель ученика.{"\n"}
                Напротив каждого будет кнопка чата.
              </Text>
            </View>
          ) : accepted.length > 0 ? (
            <>
              {incoming.length > 0 && <Text style={s.sectionLabel}>Друзья · {accepted.length}</Text>}
              {accepted.map((f) => (
                <FriendRow
                  key={f.friendshipId}
                  friend={f}
                  colors={colors}
                  onOpenChat={() => openChat(f.user.id)}
                />
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
