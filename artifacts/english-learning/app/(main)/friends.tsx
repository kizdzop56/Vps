// Экран «Друзья»: принятые друзья с кнопкой чата и входящие заявки.
//
// Эмодзи в интерфейсе не используются: в пустых состояниях стоят глифы из
// своего набора. Аватар пользователя — отдельная история, там avatarEmoji
// приходит из профиля и рисуется AnimatedAvatar как есть.
//
// ── Больше не вкладка панели ─────────────────────────────────────────────────
// Раньше это была нижняя вкладка (только у учителя). Теперь сюда попадают
// нажатием на «Друзья» в Профиле — доступно и учителю, и родителю (у ученика
// свой аналог — FriendsSheet прямо в Профиле, без отдельного экрана). Раз это
// теперь обычный экран, а не вкладка, ему нужна собственная кнопка назад —
// у вкладки её никогда не было, потому что был не нужен.
//
// Кнопка назад ведёт явным router.replace, а не router.back(). Причина —
// в шапке app/(main)/chat/[userId].tsx: этот экран и чат лежат внутри ОДНОГО
// плоского Tabs-навигатора как скрытые от панели «вкладки-соседи», а не как
// вложенный стек, поэтому у router.back() между ними нет настоящей истории —
// он надёжно приземляется на первый объявленный таб навигатора, а не туда,
// откуда реально пришли. Тот же приём (явный replace на известный адрес) уже
// используется в кодовой базе — см. EXITS в flashcards/grammar/[mode].tsx.
//
// ── Точка непрочитанного на кнопке «Чат» ────────────────────────────────────
// У каждого друга с непрочитанными сообщениями на кнопке «Чат» горит маленькая
// точка — не число, потому что здесь и так один конкретный собеседник, важно
// только «есть новое или нет». Общее число по всем беседам сразу показывается
// на кнопке «Друзья» в Профиле (см. profile.tsx) — тот же источник данных,
// MessagesBadgeContext.
import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import authStorage from "@/utils/authStorage";
import { useRouter, useFocusEffect } from "expo-router";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { Glyph } from "@/components/ui/Glyph";
import { SectionLabel } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import { useMessagesBadge } from "@/contexts/MessagesBadgeContext";

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

/** Куда возвращаемся из этого экрана — сюда же попадает кнопка «Друзья». */
const PROFILE_PATH = "/(main)/profile";

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
  friend, colors, onOpenChat, unread,
}: {
  friend: Friend;
  colors: any;
  onOpenChat: () => void;
  /** Есть непрочитанные от этого собеседника — точка на кнопке «Чат». */
  unread: boolean;
}) {
  const u = friend.user;
  const roleLabel = u.role ? ROLE_LABELS[u.role] ?? null : null;
  return (
    <View
      style={{
        backgroundColor: colors.card, borderRadius: radii.md, padding: 14,
        borderWidth: 1, borderColor: colors.border, marginBottom: 10,
        flexDirection: "row", alignItems: "center", gap: 12,
        // Цветная тень вместо серой: на светло-фиолетовом фоне серая грязнит.
        shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.13, shadowRadius: 14, elevation: 3,
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
          // Точка «в сети» в фирменном фиолетовом: зелёного в палитре нет.
          <View style={{
            position: "absolute", bottom: 0, right: 0,
            width: 13, height: 13, borderRadius: 7,
            backgroundColor: colors.success,
            borderWidth: 2, borderColor: colors.card,
          }} />
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>
          {u.name || u.username}
        </Text>
        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 1 }}>
          {roleLabel ? `${roleLabel} · ` : ""}@{u.username}
        </Text>
        {u.isOnline && (
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.success, marginTop: 1 }}>В сети</Text>
        )}
      </View>

      {/* Панель чата напротив собеседника */}
      <View>
        <TouchableOpacity
          onPress={onOpenChat}
          activeOpacity={0.85}
          style={{
            backgroundColor: colors.primary, borderRadius: radii.sm,
            paddingHorizontal: 14, paddingVertical: 11,
            flexDirection: "row", alignItems: "center", gap: 7,
            shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3, shadowRadius: 9, elevation: 4,
          }}
        >
          <Glyph name="chat" size={16} color="#fff" />
          <Text style={{ fontSize: 13, fontWeight: "800", color: "#fff" }}>Чат</Text>
        </TouchableOpacity>
        {/* Точка непрочитанного — см. заголовок файла. Пропадает сама в течение
            ~15 секунд после открытия переписки (сервер отмечает сообщения
            прочитанными сразу при входе, а экран чата ещё и просит контекст
            обновиться немедленно). */}
        {unread && (
          <View style={{
            position: "absolute", top: -3, right: -3,
            width: 12, height: 12, borderRadius: 6,
            backgroundColor: "#e11d48",
            borderWidth: 2, borderColor: colors.card,
          }} />
        )}
      </View>
    </View>
  );
}

export default function FriendsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { unreadByUser, refresh: refreshUnread } = useMessagesBadge();

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

  // Перезагружаем при каждом возврате на вкладку — статусы онлайн/новые
  // друзья, и заодно просим значок непрочитанных обновиться без ожидания
  // очередного опроса (полезно сразу после выхода из чата).
  useFocusEffect(useCallback(() => { load(); refreshUnread(); }, [load, refreshUnread]));

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

  // Явный адрес возврата у чата — см. шапку файла про плоский Tabs-навигатор.
  const openChat = (id: number) =>
    router.push(`/(main)/chat/${id}?back=${encodeURIComponent("/(main)/friends")}` as any);

  const back = () => router.replace(PROFILE_PATH as any);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 16,
    },
    titleText: { fontSize: 28, fontWeight: "900", letterSpacing: -0.6, color: colors.foreground },
    subtitleText: { fontSize: 14, color: colors.mutedForeground, marginTop: 2 },
    content: { paddingHorizontal: 20, paddingBottom: insets.bottom + 100 },
    empty: { alignItems: "center", paddingTop: 60, gap: 12, paddingHorizontal: 24 },
    // Плашка под глиф вместо крупного эмодзи: цвет из темы, лёгкий наклон.
    emptyIcon: {
      width: 72, height: 72, borderRadius: radii.lg, justifyContent: "center", alignItems: "center",
      backgroundColor: colors.primary + "14", borderWidth: 1, borderColor: colors.primary + "2e",
      transform: [{ rotate: "-4deg" }],
    },
    emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.foreground },
    emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable
            onPress={back}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Назад"
            style={{ transform: [{ rotate: "180deg" }], padding: 2 }}
          >
            <Glyph name="chevron" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={s.titleText}>Друзья</Text>
        </View>
        <Text style={s.subtitleText}>
          {accepted.length > 0 ? `${accepted.length} чел. · нажмите «Чат», чтобы написать` : "Список пуст"}
        </Text>
      </View>

      {loading ? (
        <View style={s.empty}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : error ? (
        <View style={s.empty}>
          <View style={[s.emptyIcon, { backgroundColor: colors.destructive + "14", borderColor: colors.destructive + "33" }]}>
            <Glyph name="alert" size={34} color={colors.destructive} />
          </View>
          <Text style={s.emptyTitle}>Ошибка загрузки</Text>
          <Text style={s.emptyText}>{error}</Text>
          <TouchableOpacity
            onPress={load}
            activeOpacity={0.85}
            style={{ marginTop: 12, backgroundColor: colors.primary, borderRadius: radii.sm, paddingHorizontal: 20, paddingVertical: 11 }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content}>
          {/* Входящие заявки в друзья */}
          {incoming.length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <SectionLabel>Заявки в друзья · {incoming.length}</SectionLabel>
              {incoming.map((f) => (
                <View key={f.friendshipId} style={{
                  flexDirection: "row", alignItems: "center", gap: 12,
                  backgroundColor: colors.card, borderRadius: radii.sm + 2, padding: 14,
                  borderWidth: 1.5, borderColor: colors.primary + "50", marginBottom: 8,
                  shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.14, shadowRadius: 12, elevation: 3,
                }}>
                  <AnimatedAvatar
                    size={44}
                    avatarColor={f.user.avatarColor ?? "#6366f1"}
                    avatarEmoji={f.user.avatarEmoji}
                    avatarUrl={f.user.avatarUrl}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>
                      {f.user.name || f.user.username}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 1 }}>хочет дружить</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => accept(f)}
                    disabled={actioningId === f.friendshipId}
                    activeOpacity={0.85}
                    style={{ backgroundColor: colors.primary, borderRadius: radii.sm - 2, paddingHorizontal: 13, paddingVertical: 9 }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Принять</Text>
                  </TouchableOpacity>
                  <Pressable
                    onPress={() => decline(f)}
                    disabled={actioningId === f.friendshipId}
                    style={({ pressed }) => ({
                      backgroundColor: colors.muted, borderRadius: radii.sm - 2, padding: 9,
                      opacity: pressed ? 0.7 : 1,
                    })}
                    accessibilityLabel="Отклонить заявку"
                  >
                    <Glyph name="close" size={16} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Принятые друзья с панелью чата */}
          {accepted.length === 0 && incoming.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Glyph name="handshake" size={34} color={colors.primary} />
              </View>
              <Text style={s.emptyTitle}>Пока нет друзей</Text>
              <Text style={s.emptyText}>
                Здесь появятся ваши друзья — например, родитель ученика.{"\n"}
                Напротив каждого будет кнопка чата.
              </Text>
            </View>
          ) : accepted.length > 0 ? (
            <>
              {incoming.length > 0 && <SectionLabel>Друзья · {accepted.length}</SectionLabel>}
              {accepted.map((f) => (
                <FriendRow
                  key={f.friendshipId}
                  friend={f}
                  colors={colors}
                  unread={(unreadByUser[f.user.id] ?? 0) > 0}
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
