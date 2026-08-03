import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, AppState, TextInput, Modal, FlatList, ActivityIndicator,
  Clipboard, Image, Alert, KeyboardAvoidingView,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth, isTeacherOrAdmin, type AuthUser } from "@/contexts/AuthContext";
import { useRouter, useFocusEffect } from "expo-router";
import { useGetStudentSubmissions, useGetStudentTimeStats } from "@workspace/api-client-react";
import { ACHIEVEMENTS, getUnlockedAchievements, getLockedAchievements, type AchievementStats } from "@/constants/achievements";
import AsyncStorage from "@react-native-async-storage/async-storage";
import authStorage from "@/utils/authStorage";
import { AchievementsShowcase } from "@/components/AchievementsShowcase";
import { MascotModal, getMascotMessage } from "@/components/Mascot";
import { AchievementToast } from "@/components/AchievementToast";
import { DailyGoalBar } from "@/components/DailyGoalBar";
import { AssignmentRingsChart, type CategoryStat } from "@/components/AssignmentRingsChart";
import { useGamification } from "@/hooks/useGamification";

function calcAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age > 0 ? age : null;
}

function ageWord(n: number): string {
  if (n >= 11 && n <= 14) return `${n} лет`;
  const mod = n % 10;
  if (mod === 1) return `${n} год`;
  if (mod >= 2 && mod <= 4) return `${n} года`;
  return `${n} лет`;
}

const ROLE_LABELS: Record<string, string> = {
  student: "Ученик", parent: "Родитель", teacher: "Учитель", admin: "Администратор",
};

const AVATAR_EMOJIS = [
  "🦁","🐯","🐻","🐼","🦊","🐸","🦅","🦋","🐬","🦄",
  "🐲","🦝","🦉","🐺","🐮","🐷","🐙","🦀","🐧","🦜",
  "🌟","🚀","⚡","🎯","🎸","🎨","🏆","💎","🔥","🌈",
];
const AVATAR_COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#e11d48",
  "#ec4899","#6366f1","#6366f1","#6366f1",
  "#818cf8","#ec4899","#64748b","#1e293b",
];

function formatTime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

// Дневное время («Сегодня») показываем с явными единицами.
// Раньше первые полчаса рисовались в формате mm:ss — "1:29" читалось как
// «1 час 29 минут», и сразу после входа казалось, что счётчик накрутил
// время, которого не было. Сама логика подсчёта здесь не участвует.
function formatSessionTime(seconds: number) {
  const totalMinutes = Math.floor(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const s = seconds % 60;
  if (h > 0) return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
  if (totalMinutes > 0) return `${m} мин ${String(s).padStart(2, "0")} с`;
  return `${s} с`;
}

// Live in-app timer — only ticks while the user is actively in the app.
// Reads SESSION_START_KEY from AsyncStorage to get accurate elapsed time.
// Pauses when the app goes to background / tab is hidden, resumes on return.
const SESSION_START_KEY = "timer_session_start";

function useLiveTimer() {
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncFromStorage = useCallback(async () => {
    const stored = await AsyncStorage.getItem(SESSION_START_KEY);
    const initial = stored ? Math.floor((Date.now() - Number(stored)) / 1000) : 0;
    setSeconds(Math.max(0, initial));
  }, []);

  const startTicking = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }, []);

  const stopTicking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Initial sync + start
    syncFromStorage().then(startTicking);

    if (Platform.OS === "web" && typeof document !== "undefined") {
      const onVisibility = () => {
        if (document.hidden) {
          stopTicking();
        } else {
          syncFromStorage().then(startTicking);
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        stopTicking();
      };
    }

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        syncFromStorage().then(startTicking);
      } else {
        stopTicking();
      }
    });

    return () => {
      appStateSub.remove();
      stopTicking();
    };
  }, [syncFromStorage, startTicking, stopTicking]);

  return seconds;
}

// Avatar picker modal
function AvatarPickerModal({
  visible, onClose, currentEmoji, currentColor, onSave,
}: {
  visible: boolean;
  onClose: () => void;
  currentEmoji: string;
  currentColor: string;
  onSave: (emoji: string, color: string) => void;
}) {
  const colors = useColors();
  const [emoji, setEmoji] = useState(currentEmoji);
  const [color, setColor] = useState(currentColor);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, marginBottom: 16 }}>
            Выбери аватар
          </Text>

          {/* Preview */}
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: color, justifyContent: "center", alignItems: "center" }}>
              <Text style={{ fontSize: 40 }}>{emoji}</Text>
            </View>
          </View>

          {/* Emoji grid */}
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.mutedForeground, marginBottom: 8 }}>ЭМОДЗИ</Text>
          <FlatList
            data={AVATAR_EMOJIS}
            numColumns={8}
            keyExtractor={(e) => e}
            style={{ maxHeight: 120, marginBottom: 16 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => setEmoji(item)}
                style={{
                  flex: 1, aspectRatio: 1, justifyContent: "center", alignItems: "center",
                  borderRadius: 10, margin: 2,
                  backgroundColor: item === emoji ? colors.primary + "20" : "transparent",
                  borderWidth: item === emoji ? 2 : 0,
                  borderColor: colors.primary,
                }}
              >
                <Text style={{ fontSize: 24 }}>{item}</Text>
              </TouchableOpacity>
            )}
          />

          {/* Color row */}
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.mutedForeground, marginBottom: 8 }}>ЦВЕТ ФОНА</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {AVATAR_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setColor(c)}
                  style={{
                    width: 36, height: 36, borderRadius: 18, backgroundColor: c,
                    borderWidth: c === color ? 3 : 0, borderColor: colors.foreground,
                  }}
                />
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity
            style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center" }}
            onPress={() => { onSave(emoji, color); onClose(); }}
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}>Сохранить</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ fontSize: 15, color: colors.mutedForeground }}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── API helper ───────────────────────────────────────────────────────
const BASE = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string, opts?: RequestInit) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Ошибка сервера");
  return data;
}

type FriendRow = {
  friendshipId: number;
  user: { id: number; name: string; username: string; avatarEmoji: string | null; avatarColor: string | null; avatarUrl?: string | null; totalPoints: number; isOnline?: boolean };
  status: "pending" | "accepted";
  direction: "sent" | "received";
};

// ── Friends modal ─────────────────────────────────────────────────────
type TeacherItem = {
  id: number; name: string; username: string;
  avatarEmoji: string | null; avatarColor: string | null; avatarUrl?: string | null;
  role: string; totalPoints: number; isOnline?: boolean;
};

function FriendsModal({
  visible, onClose, onOpenFriend, inviteCode,
}: {
  visible: boolean;
  onClose: () => void;
  onOpenFriend: (id: number) => void;
  inviteCode?: string | null;
}) {
  const colors = useColors();
  const [tab, setTab] = useState<"list" | "add">("list");
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [addMode, setAddMode] = useState<"code" | "username">("code");
  const [code, setCode] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [found, setFound] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [addError, setAddError] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);

  const loadFriends = useCallback(async () => {
    setLoadingList(true);
    try {
      const [fr, tc] = await Promise.all([
        apiFetch("/api/connections/friends"),
        apiFetch("/api/connections/student/teachers"),
      ]);
      setFriends(fr);
      setTeachers(tc);
    } catch { /* ignore */ }
    finally { setLoadingList(false); }
  }, []);

  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchIdRef = useRef(0);

  useEffect(() => {
    if (visible) {
      loadFriends();
      // Poll every 30s while modal is open to refresh online dots
      pollerRef.current = setInterval(loadFriends, 30_000);
    } else {
      if (pollerRef.current) { clearInterval(pollerRef.current); pollerRef.current = null; }
    }
    return () => { if (pollerRef.current) { clearInterval(pollerRef.current); pollerRef.current = null; } };
  }, [visible, loadFriends]);

  const resetAddForm = () => { setCode(""); setUsernameInput(""); setFound(null); setAddError(""); };

  // Auto-search when exactly 6 chars entered
  const handleCodeChange = async (raw: string) => {
    const t = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setCode(t);
    setFound(null);
    setAddError("");

    if (t.length === 6) {
      setSearching(true);
      try {
        const data = await apiFetch(`/api/connections/by-code/${t}`);
        if (data.role !== "student") {
          setAddError("Этот пользователь не является учеником");
        } else {
          setFound(data);
        }
      } catch {
        setAddError("Пользователь с таким кодом не найден");
      } finally {
        setSearching(false);
      }
    }
  };

  const handleUsernameSearch = async (raw: string) => {
    const val = raw.replace(/\s/g, "");
    setUsernameInput(val);
    setFound(null);
    setAddError("");
    if (val.length < 2) return;
    const reqId = ++searchIdRef.current;
    setSearching(true);
    try {
      const data = await apiFetch(`/api/connections/by-username/${encodeURIComponent(val)}`);
      if (searchIdRef.current !== reqId) return;
      if (data.role !== "student") {
        setAddError("Этот пользователь не является учеником");
      } else {
        setFound(data);
      }
    } catch (e: any) {
      if (searchIdRef.current !== reqId) return;
      setAddError(e?.message || "Пользователь с таким псевдонимом не найден");
    } finally {
      if (searchIdRef.current === reqId) setSearching(false);
    }
  };

  const sendRequest = async () => {
    if (!found) return;
    setConfirming(true); setAddError("");
    try {
      const sendCode = found.inviteCode ?? code;
      await apiFetch("/api/connections/friends/request", { method: "POST", body: JSON.stringify({ code: sendCode }) });
      await loadFriends();
      setTab("list"); resetAddForm();
    } catch (e: any) { setAddError(e.message ?? "Ошибка отправки запроса"); }
    finally { setConfirming(false); }
  };

  const acceptRequest = async (id: number) => {
    await apiFetch(`/api/connections/friends/${id}/accept`, { method: "PATCH" });
    await loadFriends();
  };

  const removeOrDecline = async (id: number) => {
    try {
      await apiFetch(`/api/connections/friends/${id}`, { method: "DELETE" });
      setFriends((prev) => prev.filter((f) => f.friendshipId !== id));
    } catch (e: any) {
      // If already removed or not found — still remove from local list
      setFriends((prev) => prev.filter((f) => f.friendshipId !== id));
    }
  };

  const accepted = friends.filter((f) => f.status === "accepted");
  const pending = friends.filter((f) => f.status === "pending");

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={{ flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "85%" }}>
          {/* Header */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>Друзья</Text>
            <TouchableOpacity onPress={onClose}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
          </View>

          {/* ── Мой код (только на вкладке «Добавить») ── */}
          {!!inviteCode && tab === "add" && (
            <View style={{
              marginBottom: 16,
              backgroundColor: colors.primary + "10", borderRadius: 16, padding: 16,
              borderWidth: 1.5, borderColor: colors.primary + "30",
              flexDirection: "row", alignItems: "center", gap: 14,
            }}>
              <View style={{
                width: 44, height: 44, borderRadius: 12,
                backgroundColor: colors.primary + "20",
                justifyContent: "center", alignItems: "center",
              }}>
                <Feather name="key" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Мой код
                </Text>
                <Text style={{ fontSize: 22, fontWeight: "900", color: colors.primary, letterSpacing: 4 }}>
                  {inviteCode}
                </Text>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>
                  Поделись с учителем, родителем или другом
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  Clipboard.setString(inviteCode ?? "");
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 2000);
                }}
                style={{
                  backgroundColor: codeCopied ? "#6366f1" : colors.primary,
                  borderRadius: 10, padding: 10,
                }}
              >
                <Feather name={codeCopied ? "check" : "copy"} size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {/* Tab switcher */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
            {(["list", "add"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center",
                  backgroundColor: tab === t ? colors.primary : colors.card,
                  borderWidth: 1, borderColor: tab === t ? colors.primary : colors.border,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: tab === t ? "#fff" : colors.foreground }}>
                  {t === "list" ? `Мои друзья (${accepted.length})` : "Добавить"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === "list" ? (
            <ScrollView style={{ maxHeight: 400 }}>
              {loadingList ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
              ) : (
                <>
                  {/* Incoming requests */}
                  {pending.filter((f) => f.direction === "received").map((f) => (
                    <View key={f.friendshipId} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10, backgroundColor: "#fce7f3", borderRadius: 14, padding: 12 }}>
                      <AnimatedAvatar
                        size={42}
                        avatarColor={f.user.avatarColor ?? "#6366f1"}
                        avatarEmoji={f.user.avatarEmoji}
                        avatarUrl={(f.user as any).avatarUrl}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: "#9d174d" }}>{f.user.name}</Text>
                        <Text style={{ fontSize: 12, color: "#9d174d99" }}>Хочет дружить</Text>
                      </View>
                      <TouchableOpacity onPress={() => acceptRequest(f.friendshipId)} style={{ backgroundColor: "#6366f1", borderRadius: 8, padding: 6 }}>
                        <Feather name="check" size={16} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeOrDecline(f.friendshipId)} style={{ backgroundColor: "#e11d48", borderRadius: 8, padding: 6 }}>
                        <Feather name="x" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}

                  {/* Accepted friends — tappable to view profile */}
                  {accepted.map((f) => (
                    <TouchableOpacity
                      key={f.friendshipId}
                      activeOpacity={0.7}
                      onPress={() => { onClose(); onOpenFriend(f.user.id); }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10, backgroundColor: colors.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border }}
                    >
                      <View style={{ position: "relative" }}>
                        <AnimatedAvatar
                          size={42}
                          avatarColor={f.user.avatarColor ?? "#6366f1"}
                          avatarEmoji={f.user.avatarEmoji}
                          avatarUrl={(f.user as any).avatarUrl}
                        />
                        {f.user.isOnline && (
                          <View style={{
                            position: "absolute", bottom: 0, right: 0,
                            width: 13, height: 13, borderRadius: 7,
                            backgroundColor: "#22c55e",
                            borderWidth: 2, borderColor: colors.card,
                          }} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{f.user.name}</Text>
                        <Text style={{ fontSize: 12, color: f.user.isOnline ? "#16a34a" : colors.mutedForeground }}>
                          {f.user.isOnline ? "В сети" : `⭐ ${f.user.totalPoints} очков`}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation(); removeOrDecline(f.friendshipId); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Feather name="user-x" size={18} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}

                  {/* Pending sent */}
                  {pending.filter((f) => f.direction === "sent").map((f) => (
                    <View key={f.friendshipId} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10, backgroundColor: colors.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border, opacity: 0.6 }}>
                      <AnimatedAvatar
                        size={42}
                        avatarColor={f.user.avatarColor ?? "#6366f1"}
                        avatarEmoji={f.user.avatarEmoji}
                        avatarUrl={(f.user as any).avatarUrl}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{f.user.name}</Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Запрос отправлен...</Text>
                      </View>
                    </View>
                  ))}

                  {/* My teachers section */}
                  {teachers.length > 0 && (
                    <>
                      <Text style={{
                        fontSize: 11, fontWeight: "700", color: colors.mutedForeground,
                        textTransform: "uppercase", letterSpacing: 0.6,
                        marginTop: friends.length > 0 ? 16 : 0, marginBottom: 8,
                      }}>
                        Мои учителя · {teachers.length}
                      </Text>
                      {teachers.map((t) => (
                        <TouchableOpacity
                          key={t.id}
                          activeOpacity={0.75}
                          onPress={() => { onClose(); onOpenFriend(t.id); }}
                          style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10, backgroundColor: colors.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border }}
                        >
                          <View style={{ position: "relative" }}>
                            <AnimatedAvatar
                              size={42}
                              avatarColor={t.avatarColor ?? "#6366f1"}
                              avatarEmoji={t.avatarEmoji ?? "🎓"}
                              avatarUrl={(t as any).avatarUrl}
                            />
                            {t.isOnline && (
                              <View style={{
                                position: "absolute", bottom: 0, right: 0,
                                width: 13, height: 13, borderRadius: 7,
                                backgroundColor: "#22c55e",
                                borderWidth: 2, borderColor: colors.card,
                              }} />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{t.name}</Text>
                            <Text style={{ fontSize: 12, color: t.isOnline ? "#16a34a" : colors.mutedForeground }}>
                              {t.isOnline ? "В сети" : "🎓 Учитель"}
                            </Text>
                          </View>
                          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      ))}
                    </>
                  )}

                  {friends.length === 0 && teachers.length === 0 && (
                    <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
                      <Text style={{ fontSize: 40 }}>👫</Text>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>Нет друзей</Text>
                      <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Поделись кодом или введи код друга</Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          ) : (
            <View>
              {/* Mode switcher */}
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                {(["code", "username"] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => { setAddMode(m); resetAddForm(); }}
                    style={{
                      flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
                      backgroundColor: addMode === m ? colors.primary + "18" : "transparent",
                      borderWidth: 1.5, borderColor: addMode === m ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "700", color: addMode === m ? colors.primary : colors.mutedForeground }}>
                      {m === "code" ? "По коду" : "По псевдониму"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {addMode === "code" ? (
                <>
                  <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 12 }}>
                    Попроси друга открыть Профиль и назвать свой код
                  </Text>
                  <View style={{ position: "relative", marginBottom: 6 }}>
                    <TextInput
                      style={{
                        backgroundColor: colors.card, borderRadius: 14,
                        borderWidth: 2,
                        borderColor: addError ? colors.destructive : found ? "#6366f1" : colors.border,
                        paddingHorizontal: 16, paddingVertical: 16,
                        fontSize: 28, fontWeight: "900", letterSpacing: 8,
                        color: colors.foreground, textAlign: "center", textTransform: "uppercase",
                      }}
                      placeholder="_ _ _ _ _ _"
                      placeholderTextColor={colors.mutedForeground + "80"}
                      value={code}
                      onChangeText={handleCodeChange}
                      maxLength={6}
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                    {searching && (
                      <View style={{ position: "absolute", right: 16, top: 0, bottom: 0, justifyContent: "center" }}>
                        <ActivityIndicator color={colors.primary} size="small" />
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center", marginBottom: 14 }}>
                    Введите 6-значный код — поиск произойдёт автоматически
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 12 }}>
                    Введи псевдоним (@username) друга
                  </Text>
                  <View style={{ position: "relative", marginBottom: 14 }}>
                    <TextInput
                      style={{
                        backgroundColor: colors.card, borderRadius: 14,
                        borderWidth: 2,
                        borderColor: addError ? colors.destructive : found ? "#6366f1" : colors.border,
                        paddingHorizontal: 16, paddingVertical: 14,
                        fontSize: 16, color: colors.foreground,
                      }}
                      placeholder="@псевдоним"
                      placeholderTextColor={colors.mutedForeground + "80"}
                      value={usernameInput}
                      onChangeText={handleUsernameSearch}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {searching && (
                      <View style={{ position: "absolute", right: 16, top: 0, bottom: 0, justifyContent: "center" }}>
                        <ActivityIndicator color={colors.primary} size="small" />
                      </View>
                    )}
                  </View>
                </>
              )}

              {/* Error */}
              {!!addError && (
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 8,
                  backgroundColor: "#fff1f2", borderRadius: 12, padding: 12, marginBottom: 12,
                  borderWidth: 1, borderColor: "#fda4af",
                }}>
                  <Feather name="alert-circle" size={16} color={colors.destructive} />
                  <Text style={{ color: colors.destructive, fontSize: 13, flex: 1 }}>{addError}</Text>
                </View>
              )}

              {/* Found user card */}
              {found && (
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 12,
                  backgroundColor: "#eef2ff", borderRadius: 14, padding: 14,
                  marginBottom: 14, borderWidth: 1.5, borderColor: "#6366f140",
                }}>
                  <AnimatedAvatar
                    size={48}
                    avatarColor={found.avatarColor ?? "#6366f1"}
                    avatarEmoji={found.avatarEmoji}
                    avatarUrl={found.avatarUrl}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: "#3730a3" }}>{found.name}</Text>
                    <Text style={{ fontSize: 13, color: "#3730a3bb" }}>@{found.username}</Text>
                  </View>
                  <Feather name="check-circle" size={24} color="#6366f1" />
                </View>
              )}

              {/* Confirm button — only visible after user found */}
              {found && (
                <TouchableOpacity
                  style={{
                    backgroundColor: "#6366f1", borderRadius: 14, paddingVertical: 15,
                    alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
                  }}
                  onPress={sendRequest} disabled={confirming}
                >
                  {confirming
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Feather name="user-plus" size={18} color="#fff" />
                        <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}>Подтвердить</Text>
                      </>}
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const { user, logout, updateUser } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const sessionSeconds = useLiveTimer();

  const [avatarEmoji, setAvatarEmoji] = useState(user?.avatarEmoji ?? "🦁");
  const [avatarColor, setAvatarColor] = useState(user?.avatarColor ?? "#6366f1");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [bio, setBio] = useState(user?.bio ?? "");
  const [editingBio, setEditingBio] = useState(false);
  const [bioInput, setBioInput] = useState(user?.bio ?? "");
  const [bioLoaded, setBioLoaded] = useState(false);
  const [username, setUsername] = useState(user?.username ?? "");
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState(user?.username ?? "");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [teacherRequests, setTeacherRequests] = useState<Array<{
    requestId: number;
    teacher: { id: number; name: string; username: string; avatarEmoji: string | null; avatarColor: string | null; role: string };
  }>>([]);

  // ── Gamification ──────────────────────────────────────────────────
  const {
    stats: gamStats, dailyLoginResult, toastAchievement,
    loadStats, claimDailyLogin, unlockAchievements, hideToast, updateDailyGoal,
  } = useGamification();

  const [mascotVisible, setMascotVisible] = useState(false);
  const [mascotMsg, setMascotMsg] = useState({ message: "", mood: "wave" as any });
  const [dailyLoginShown, setDailyLoginShown] = useState(false);

  const isStudent = user?.role === "student";
  const isTeacher = isTeacherOrAdmin(user?.role ?? "");

  // Fetch fresh bio from server on mount (so it never shows stale data after save)
  useEffect(() => {
    if (!user?.id) return;
    const baseUrl = process.env["EXPO_PUBLIC_DOMAIN"]
      ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
      : "";
    authStorage.getItem("auth_token").then((token) => {
      fetch(`${baseUrl}/api/users/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.bio !== undefined && !bioLoaded) {
            setBio(data.bio ?? "");
            setBioInput(data.bio ?? "");
            setBioLoaded(true);
          }
        })
        .catch(() => { /* silent */ });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Fetch pending friend requests + teacher requests count for badge
  useEffect(() => {
    if (!isStudent) return;
    const baseUrl = process.env["EXPO_PUBLIC_DOMAIN"]
      ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
      : "";
    const load = async () => {
      try {
        const token = await authStorage.getItem("auth_token");
        const headers = { Authorization: `Bearer ${token}` };

        const [friendsRes, teacherRes] = await Promise.all([
          fetch(`${baseUrl}/api/connections/friends`, { headers }),
          fetch(`${baseUrl}/api/connections/student/teacher-requests`, { headers }),
        ]);

        if (friendsRes.ok) {
          const data: Array<{ status: string; direction: string }> = await friendsRes.json();
          const count = data.filter((f) => f.status === "pending" && f.direction === "received").length;
          setPendingCount(count);
        }
        if (teacherRes.ok) {
          setTeacherRequests(await teacherRes.json());
        }
      } catch { /* silent */ }
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [isStudent]);

  const { data: submissions } = useGetStudentSubmissions(
    user?.id || 0,
    { query: { enabled: isStudent && !!user?.id } as any }
  );
  const { data: timeStats, dataUpdatedAt: timeStatsAt } = useGetStudentTimeStats(
    user?.id || 0,
    // refetchInterval keeps the timer live (API already includes open-session elapsed)
    { query: { enabled: isStudent && !!user?.id, refetchInterval: 10_000 } as any }
  );

  const completedCount = submissions?.length ?? 0;
  // timeStats.totalMinutes already includes open-session elapsed time from the server.
  // Do NOT add sessionSeconds here — that would double-count the current session.
  const totalMinutes = timeStats?.totalMinutes ?? 0;
  // "Сегодня" = дневная сумма с сервера (уже включает текущую открытую сессию
  // на момент загрузки) + секунды, прошедшие с этой загрузки. Накапливается за
  // день и не сбрасывается при перезаходе — в отличие от таймера текущей
  // сессии (sessionSeconds), который остаётся фолбэком, пока статистика не
  // загрузилась. Ежесекундный ре-рендер обеспечивает тикающий useLiveTimer.
  const todaySeconds = timeStats && timeStatsAt
    ? Math.max(0, Math.floor((timeStats.todayMinutes ?? 0) * 60 + (Date.now() - timeStatsAt) / 1000))
    : sessionSeconds;

  // График «Мои задания». Профиль — экран таба и не размонтируется при
  // переключении вкладок, поэтому загрузку нельзя оставлять в useEffect с
  // зависимостью от user.id: запрос ушёл бы один раз за сессию, и после сдачи
  // задания график остался бы прежним. Обновляем на фокусе экрана (см. ниже) и
  // при изменении числа сдач.
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const loadCategoryStats = useCallback(async () => {
    if (!isStudent || !user?.id) return;
    try {
      const data = await apiFetch(`/api/students/${user.id}/category-stats`);
      setCategoryStats(data ?? []);
    } catch {
      setCategoryStats([]);
    }
  }, [isStudent, user?.id]);

  useEffect(() => { loadCategoryStats(); }, [loadCategoryStats, completedCount]);

  // ── Load gamification stats & claim daily login on focus ──────────
  useFocusEffect(
    useCallback(() => {
      if (!isStudent) return;
      loadStats();
      loadCategoryStats();
    }, [isStudent, loadStats, loadCategoryStats])
  );

  useEffect(() => {
    if (!isStudent || dailyLoginShown) return;
    const runDailyLogin = async () => {
      const result = await claimDailyLogin();
      if (!result) return;
      setDailyLoginShown(true);
      if (!result.alreadyClaimed) {
        const msg = getMascotMessage("daily_login", { streak: result.loginStreak, points: result.pointsAwarded });
        setMascotMsg(msg);
        setMascotVisible(true);
      }
    };
    runDailyLogin();
  }, [isStudent, dailyLoginShown, claimDailyLogin]);

  // ── Sync & unlock achievements when stats load ────────────────────
  useEffect(() => {
    if (!gamStats || !isStudent) return;
    const stats: AchievementStats = {
      completedAssignments: gamStats.completedAssignments,
      totalPoints: gamStats.totalPoints,
      knowledgeLevel: user?.knowledgeLevel ?? null,
      totalTimeMinutes: gamStats.totalTimeMinutes,
      voiceChatSessions: gamStats.voiceChatSessions,
      loginStreak: gamStats.loginStreak,
      perfectScoreCount: gamStats.perfectScoreCount,
      xpLevel: gamStats.xpLevel,
      earlyBirdSessions: gamStats.earlyBirdSessions,
    };
    const unlcked = getUnlockedAchievements(stats).map(a => a.id);
    const newOnes = unlcked.filter(id => !gamStats.unlockedAchievementIds.includes(id));
    if (newOnes.length > 0) {
      unlockAchievements(newOnes);
    }
  }, [gamStats, isStudent, user?.knowledgeLevel, unlockAchievements]);

  // Витрина наград строится СТРОГО по серверным статам (gamStats): пока они
  // не загружены — считаем показатели нулевыми. Раньше здесь были
  // оптимистичные локальные значения (completedCount / user.totalPoints /
  // totalMinutes), из-за которых медали могли отображаться полученными до
  // подтверждения сервером и без реального выполнения условий.
  const achievementStats: AchievementStats = {
    completedAssignments: gamStats?.completedAssignments ?? 0,
    totalPoints: gamStats?.totalPoints ?? 0,
    knowledgeLevel: user?.knowledgeLevel ?? null,
    totalTimeMinutes: gamStats?.totalTimeMinutes ?? 0,
    voiceChatSessions: gamStats?.voiceChatSessions ?? 0,
    loginStreak: gamStats?.loginStreak ?? 0,
    perfectScoreCount: gamStats?.perfectScoreCount ?? 0,
    xpLevel: gamStats?.xpLevel ?? 1,
    earlyBirdSessions: gamStats?.earlyBirdSessions ?? 0,
  };
  const unlocked = getUnlockedAchievements(achievementStats);
  const locked = getLockedAchievements(achievementStats);

  const baseUrl = process.env["EXPO_PUBLIC_DOMAIN"]
    ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
    : "";

  const respondToTeacherRequest = async (requestId: number, accept: boolean) => {
    try {
      const token = await authStorage.getItem("auth_token");
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (accept) {
        await fetch(`${baseUrl}/api/connections/student/teacher-requests/${requestId}/accept`, {
          method: "PATCH", headers,
        });
      } else {
        await fetch(`${baseUrl}/api/connections/student/teacher-requests/${requestId}`, {
          method: "DELETE", headers,
        });
      }
      setTeacherRequests((prev) => prev.filter((r) => r.requestId !== requestId));
    } catch { /* silent */ }
  };

  const saveProfile = async (patch: { avatarEmoji?: string; avatarColor?: string; avatarUrl?: string | null; bio?: string; username?: string }): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    try {
      const token = await authStorage.getItem("auth_token");
      const res = await fetch(`${baseUrl}/api/users/${user.id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return false;
      // Keep the auth context (and its cached copy in storage) in sync so the
      // change survives logout/login and app restarts, not just this screen.
      await updateUser(patch);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleUsernameSave = async () => {
    if (!user) return;
    const trimmed = usernameInput.trim();
    if (!trimmed || trimmed === username) {
      setEditingUsername(false);
      return;
    }
    setUsernameSaving(true);
    try {
      const token = await authStorage.getItem("auth_token");
      const res = await fetch(`${baseUrl}/api/users/${user.id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert("Не удалось сохранить", data.error ?? "Попробуйте другой никнейм.");
        return;
      }
      setUsername(trimmed);
      await updateUser({ username: trimmed });
      setEditingUsername(false);
    } catch {
      Alert.alert("Не удалось сохранить", "Проверьте интернет-соединение и попробуйте снова.");
    } finally {
      setUsernameSaving(false);
    }
  };

  const handleAvatarSave = async (emoji: string, color: string) => {
    setAvatarMenuOpen(false);
    const prevEmoji = avatarEmoji;
    const prevColor = avatarColor;
    const prevUrl = avatarUrl;
    setAvatarEmoji(emoji);
    setAvatarColor(color);
    setAvatarUrl(null);
    const ok = await saveProfile({ avatarEmoji: emoji, avatarColor: color, avatarUrl: null });
    if (!ok) {
      setAvatarEmoji(prevEmoji);
      setAvatarColor(prevColor);
      setAvatarUrl(prevUrl);
      Alert.alert("Не удалось сохранить", "Проверьте интернет-соединение и попробуйте снова.");
    }
  };

  const handlePhotoUpload = async () => {
    setAvatarMenuOpen(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const prevUrl = avatarUrl;
    setSaving(true);
    try {
      // Crop to a centered square first (allowsEditing's crop UI isn't applied
      // on web/PWA, so non-square photos would otherwise get stretched by the
      // resize step below), then resize and re-compress so the resulting data
      // URI stays tiny (a few KB) — the raw picker output can be several MB,
      // which used to bloat every list response (students, leaderboard, etc.)
      // and break loading avatars in production.
      const actions: ImageManipulator.Action[] = [];
      if (asset.width && asset.height && asset.width !== asset.height) {
        const size = Math.min(asset.width, asset.height);
        actions.push({
          crop: {
            originX: Math.round((asset.width - size) / 2),
            originY: Math.round((asset.height - size) / 2),
            width: size,
            height: size,
          },
        });
      }
      actions.push({ resize: { width: 256, height: 256 } });
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        actions,
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: false }
      );
      // Аватар грузится тем же presigned-потоком, что фото/аудио/видео заданий
      // (request-upload-url -> PUT -> отдача через /api/storage/objects/...).
      //
      // Это ОБЯЗАТЕЛЬНО в проде: multer-роут /api/upload/image пишет файл на
      // локальный диск контейнера, а на Render persistent disk нет — аватары
      // исчезали при каждом деплое. Presigned-поток кладёт файл в объектное
      // хранилище, а если оно не настроено — сам уходит в локальный фолбэк.
      //
      // Ранее presigned-поток для аватара откатывали, потому что сервер
      // возвращал абсолютный uploadURL, собранный из заголовка Host, который
      // внутренний reverse proxy переписывает на localhost:8080. Теперь ссылка
      // относительная (см. routes/storage.ts), и загрузка работает.
      const blobRes = await fetch(manipulated.uri);
      const blob = await blobRes.blob();
      if (blob.size > 500_000) {
        setAvatarUrl(prevUrl);
        Alert.alert("Фото слишком большое", "Попробуйте выбрать другое изображение.");
        return;
      }
      const token = await authStorage.getItem("auth_token");

      // Шаг 1: получить ссылку для загрузки.
      const presignedRes = await fetch(`${BASE}/api/storage/request-upload-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify({
          name: "avatar.jpg",
          size: blob.size,
          contentType: "image/jpeg",
        }),
      });
      const presignedData = await presignedRes.json().catch(() => ({}));
      if (!presignedRes.ok) {
        throw new Error(presignedData.error ?? "Ошибка получения ссылки для загрузки");
      }
      const { uploadURL, objectPath } = presignedData as {
        uploadURL: string;
        objectPath: string;
      };

      // Шаг 2: загрузить файл. Content-Type сохраняется на объекте — без него
      // браузер не отрисует картинку при отдаче.
      // В локальном режиме uploadURL относительный — дополняем его BASE, чтобы
      // работало и в нативном приложении, где нет origin страницы.
      const uploadTarget = uploadURL.startsWith("http")
        ? uploadURL
        : `${BASE}${uploadURL}`;
      const uploadRes = await fetch(uploadTarget, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      });
      if (!uploadRes.ok) throw new Error("Ошибка загрузки файла на сервер");

      // Шаг 3: в БД сохраняем ссылку через наш прокси, а не прямую в бакет —
      // бакет приватный, и прямые ссылки истекают.
      const serveUrl = `${BASE}/api/storage${objectPath}?kind=image`;
      setAvatarUrl(serveUrl);
      const ok = await saveProfile({ avatarUrl: serveUrl });
      if (!ok) {
        setAvatarUrl(prevUrl);
        Alert.alert(
          "Не удалось сохранить фото",
          "Попробуйте выбрать фото меньшего размера или другое изображение."
        );
      }
    } catch {
      setAvatarUrl(prevUrl);
      Alert.alert("Не удалось сохранить фото", "Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePhoto = async () => {
    setAvatarMenuOpen(false);
    const prevUrl = avatarUrl;
    setAvatarUrl(null);
    const ok = await saveProfile({ avatarUrl: null });
    if (!ok) {
      setAvatarUrl(prevUrl);
      Alert.alert("Не удалось сохранить", "Проверьте интернет-соединение и попробуйте снова.");
    }
  };

  const handleBioSave = () => {
    setBio(bioInput);
    setEditingBio(false);
    saveProfile({ bio: bioInput });
  };

  if (!user) return null;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { paddingBottom: insets.bottom + 100 },

    // Header
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 24,
      alignItems: "center",
    },
    avatarWrap: { position: "relative", marginBottom: 14 },
    avatar: { width: 90, height: 90, borderRadius: 45, justifyContent: "center", alignItems: "center" },
    avatarEmoji: { fontSize: 44 },
    editAvatarBtn: {
      position: "absolute", bottom: 0, right: 0,
      width: 28, height: 28, borderRadius: 14,
      backgroundColor: colors.primary, justifyContent: "center", alignItems: "center",
      borderWidth: 2, borderColor: "#ffffff",
    },
    name: { fontSize: 22, fontWeight: "800", color: colors.foreground, marginBottom: 3 },
    username: { fontSize: 14, color: colors.mutedForeground, marginBottom: 10 },
    badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 12 },
    badge: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 4 },
    badgeText: { fontSize: 13, fontWeight: "700" },

    // Bio
    bioBox: {
      backgroundColor: colors.card, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: colors.border, marginHorizontal: 20, marginBottom: 20,
    },
    bioLabel: { fontSize: 12, fontWeight: "700", color: colors.mutedForeground, marginBottom: 4, textTransform: "uppercase" },
    bioText: { fontSize: 14, color: colors.foreground, lineHeight: 20 },
    bioPlaceholder: { fontSize: 14, color: colors.mutedForeground, fontStyle: "italic" },
    bioInput: { fontSize: 14, color: colors.foreground, lineHeight: 20, minHeight: 60 },
    bioActions: { flexDirection: "row", gap: 8, marginTop: 8, justifyContent: "flex-end" },
    bioSaveBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
    bioSaveText: { fontSize: 13, fontWeight: "700", color: "#fff" },
    bioCancelBtn: { paddingHorizontal: 14, paddingVertical: 6 },
    bioCancelText: { fontSize: 13, color: colors.mutedForeground },

    // Section
    section: { paddingHorizontal: 20, marginBottom: 20 },
    sectionTitle: {
      fontSize: 12, fontWeight: "700", color: colors.mutedForeground,
      marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.6,
    },

    // Stats
    statsRow: { flexDirection: "row", gap: 10 },
    statCard: {
      flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14,
      alignItems: "center", borderWidth: 0,
      shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1, shadowRadius: 10, elevation: 4,
    },
    statValue: { fontSize: 22, fontWeight: "900", color: colors.foreground, marginTop: 6, marginBottom: 2 },
    statLabel: { fontSize: 11, color: colors.mutedForeground, textAlign: "center" },

    // Timer
    timerCard: {
      backgroundColor: colors.primary + "12", borderRadius: 16, padding: 16,
      borderWidth: 1.5, borderColor: colors.primary + "35",
      flexDirection: "row", alignItems: "center", gap: 14,
    },
    timerIcon: { width: 50, height: 50, borderRadius: 14, backgroundColor: colors.primary + "20", justifyContent: "center", alignItems: "center" },
    timerValue: { fontSize: 22, fontWeight: "900", color: colors.primary },
    timerLabel: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },

    // Level card
    levelCard: {
      borderRadius: 16, padding: 16,
      flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1.5,
    },
    levelIcon: { width: 50, height: 50, borderRadius: 14, justifyContent: "center", alignItems: "center" },
    levelTitle: { fontSize: 16, fontWeight: "800" },
    levelSub: { fontSize: 13, marginTop: 1 },
    levelAge: { fontSize: 12, fontWeight: "600", marginTop: 3 },

    // Achievements
    achieveGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    achieveCard: {
      borderRadius: 14, padding: 12, borderWidth: 1.5,
      width: "47%", alignItems: "flex-start",
    },
    achieveEmoji: { fontSize: 28, marginBottom: 6 },
    achieveBadgeImg: { width: 56, height: 56, borderRadius: 28, marginBottom: 6 },
    achieveTitle: { fontSize: 13, fontWeight: "700" },
    achieveDesc: { fontSize: 11, marginTop: 2, lineHeight: 15 },

    // Quick actions
    row: {
      flexDirection: "row", alignItems: "center", gap: 14,
      backgroundColor: colors.card, borderRadius: 14, padding: 16,
      marginBottom: 8, borderWidth: 0,
      shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
    },
    rowText: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.foreground },

    logoutBtn: {
      marginHorizontal: 20, marginBottom: 8,
      backgroundColor: "#fff1f2", borderRadius: 14,
      padding: 16, alignItems: "center",
      borderWidth: 1, borderColor: "#fda4af",
    },
    logoutText: { fontSize: 15, fontWeight: "700", color: colors.destructive },
  });

  return (
    <View style={s.container}>
      <AvatarPickerModal
        visible={avatarPickerOpen}
        onClose={() => setAvatarPickerOpen(false)}
        currentEmoji={avatarEmoji}
        currentColor={avatarColor}
        onSave={handleAvatarSave}
      />
      {isStudent && (
        <FriendsModal
          visible={friendsOpen}
          onClose={() => setFriendsOpen(false)}
          onOpenFriend={(id) => router.push(`/(main)/friend/${id}` as any)}
          inviteCode={user.inviteCode}
        />
      )}

      {/* ── Achievement Toast ── */}
      <AchievementToast achievement={toastAchievement} onHide={hideToast} />

      {/* ── Mascot modals ── */}
      <MascotModal
        visible={mascotVisible}
        mood={mascotMsg.mood}
        message={mascotMsg.message}
        mascotName={gamStats?.mascotName ?? "Снежа"}
        onClose={() => setMascotVisible(false)}
      />

      {/* Avatar choice modal */}
      <Modal visible={avatarMenuOpen} transparent animationType="slide" onRequestClose={() => setAvatarMenuOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, marginBottom: 20 }}>Сменить аватар</Text>
            <TouchableOpacity
              onPress={handlePhotoUpload}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.primary + "12", paddingHorizontal: 16, marginBottom: 10 }}
            >
              <Feather name="camera" size={20} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.primary }}>Загрузить фото из галереи</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setAvatarMenuOpen(false); setAvatarPickerOpen(true); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.muted, paddingHorizontal: 16, marginBottom: 10 }}
            >
              <Feather name="smile" size={20} color={colors.foreground} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>Выбрать эмодзи</Text>
            </TouchableOpacity>
            {avatarUrl && (
              <TouchableOpacity
                onPress={handleRemovePhoto}
                style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderRadius: 14, backgroundColor: "#fff1f2", paddingHorizontal: 16, marginBottom: 10 }}
              >
                <Feather name="trash-2" size={20} color={colors.destructive} />
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.destructive }}>Удалить фото</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setAvatarMenuOpen(false)} style={{ paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ fontSize: 15, color: colors.mutedForeground }}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* ── Шапка профиля ── */}
        <View style={s.header}>
          <View style={{ position: "relative", marginBottom: 14 }}>
            <AnimatedAvatar
              size={90}
              avatarColor={avatarColor}
              avatarEmoji={avatarEmoji}
              avatarUrl={avatarUrl}
              animated={true}
            />
            <TouchableOpacity
              style={[s.editAvatarBtn, { position: "absolute", bottom: 22, right: 22 }]}
              onPress={() => setAvatarMenuOpen(true)}
            >
              {saving
                ? <ActivityIndicator size={12} color="#fff" />
                : <Feather name="edit-2" size={13} color="#fff" />
              }
            </TouchableOpacity>
          </View>

          <Text style={s.name}>{user.name}</Text>
          {/* Псевдоним (@username) — только для чтения: редактирование убрано. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <Text style={s.username}>@{username}</Text>
          </View>

          {/* Online status badge */}
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 5,
            backgroundColor: "#dcfce7",
            paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
            marginBottom: 6,
          }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#22c55e" }} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#15803d" }}>В сети</Text>
          </View>

          <View style={s.badgeRow}>
            {/* Роль */}
            <View style={[s.badge, { backgroundColor: avatarColor + "20" }]}>
              <Text style={[s.badgeText, { color: avatarColor }]}>{ROLE_LABELS[user.role]}</Text>
            </View>
            {/* Возраст (если есть дата рождения) */}
            {(() => {
              const age = calcAge(user.dateOfBirth);
              return age !== null ? (
                <View style={[s.badge, { backgroundColor: "#6366f118" }]}>
                  <Feather name="calendar" size={12} color="#6366f1" />
                  <Text style={[s.badgeText, { color: "#6366f1" }]}>{ageWord(age)}</Text>
                </View>
              ) : null;
            })()}
          </View>
        </View>

        {/* ── Входящие заявки от учителей (только ученик) ── */}
        {isStudent && teacherRequests.length > 0 && (
          <View style={{
            marginHorizontal: 20, marginBottom: 14,
          }}>
            <Text style={{
              fontSize: 12, fontWeight: "700", color: colors.mutedForeground,
              textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10,
            }}>
              Заявки от учителей · {teacherRequests.length}
            </Text>
            {teacherRequests.map((req) => (
              <View key={req.requestId} style={{
                flexDirection: "row", alignItems: "center", gap: 12,
                backgroundColor: colors.card, borderRadius: 14, padding: 14,
                borderWidth: 1, borderColor: colors.border, marginBottom: 8,
              }}>
                <View style={{
                  width: 46, height: 46, borderRadius: 23,
                  backgroundColor: req.teacher.avatarColor ?? "#6366f1",
                  justifyContent: "center", alignItems: "center",
                }}>
                  <Text style={{ fontSize: 22 }}>{req.teacher.avatarEmoji ?? "🎓"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
                    {req.teacher.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground }}>хочет добавить вас как ученика</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => respondToTeacherRequest(req.requestId, false)}
                    style={{ backgroundColor: colors.destructive + "20", borderRadius: 8, padding: 8 }}
                  >
                    <Feather name="x" size={16} color={colors.destructive} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => respondToTeacherRequest(req.requestId, true)}
                    style={{ backgroundColor: "#6366f1" + "20", borderRadius: 8, padding: 8 }}
                  >
                    <Feather name="check" size={16} color="#6366f1" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Описание (bio) ── */}
        <View style={s.bioBox}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <Text style={s.bioLabel}>О себе</Text>
            {!editingBio && (
              <TouchableOpacity onPress={() => { setBioInput(bio); setEditingBio(true); }}>
                <Feather name="edit-2" size={14} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>

          {editingBio ? (
            <>
              <TextInput
                style={s.bioInput}
                value={bioInput}
                onChangeText={setBioInput}
                placeholder="Расскажи о себе..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                autoFocus
              />
              <View style={s.bioActions}>
                <TouchableOpacity style={s.bioCancelBtn} onPress={() => setEditingBio(false)}>
                  <Text style={s.bioCancelText}>Отмена</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.bioSaveBtn} onPress={handleBioSave}>
                  <Text style={s.bioSaveText}>Сохранить</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <Text style={bio ? s.bioText : s.bioPlaceholder}>
              {bio || "Нажми на карандаш, чтобы добавить описание"}
            </Text>
          )}
        </View>

        {/* ── Ученик: статистика + таймер + уровень ── */}
        {isStudent && (
          <>
            {/* Статистика */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Мои достижения</Text>
              <View style={s.statsRow}>
                <View style={s.statCard}>
                  <Feather name="star" size={22} color="#ec4899" />
                  <Text style={s.statValue}>{achievementStats.totalPoints}</Text>
                  <Text style={s.statLabel}>Очки</Text>
                </View>
                <View style={s.statCard}>
                  <Feather name="check-circle" size={22} color="#6366f1" />
                  <Text style={s.statValue}>{achievementStats.completedAssignments}</Text>
                  <Text style={s.statLabel}>Заданий</Text>
                </View>
                <View style={s.statCard}>
                  <Feather name="award" size={22} color={colors.primary} />
                  <Text style={s.statValue}>{unlocked.length}</Text>
                  <Text style={s.statLabel}>Наград</Text>
                </View>
                <View style={s.statCard}>
                  <Text style={{ fontSize: 20 }}>🔥</Text>
                  <Text style={s.statValue}>{achievementStats.loginStreak}</Text>
                  <Text style={s.statLabel}>Стрик</Text>
                </View>
              </View>
            </View>


            {/* Daily Goal */}
            {gamStats && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Ежедневная цель</Text>
                <DailyGoalBar
                  todayMinutes={gamStats.todayMinutes}
                  goalMinutes={gamStats.dailyGoalMinutes}
                  todayCompletions={gamStats.todayCompletions ?? 0}
                  todayVoiceSessions={gamStats.todayVoiceSessions ?? 0}
                  onGoalChange={updateDailyGoal}
                />
              </View>
            )}

            {/* Статистика заданий + Таймер времени — два отдельных пузыря в одной строке */}
            <View style={s.section}>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "stretch" }}>
                <View style={{
                  flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 14,
                  borderWidth: 1, borderColor: colors.border,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                    Мои задания
                  </Text>
                  <AssignmentRingsChart stats={categoryStats} colors={colors} />
                </View>

                <View style={{
                  flex: 1, backgroundColor: colors.primary + "12", borderRadius: 16, padding: 14,
                  borderWidth: 1.5, borderColor: colors.primary + "35",
                  justifyContent: "center",
                }}>
                  <View style={{ alignItems: "center", gap: 8 }}>
                    <View style={s.timerIcon}>
                      <Feather name="clock" size={24} color={colors.primary} />
                    </View>
                    <Text style={[s.timerValue, { textAlign: "center" }]}>
                      {formatTime(gamStats?.totalTimeMinutes ?? totalMinutes)}
                    </Text>
                    <Text style={[s.timerLabel, { textAlign: "center" }]}>
                      Сегодня: {formatSessionTime(todaySeconds)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>



            <AchievementsShowcase
              unlocked={unlocked}
              locked={locked}
              showLocked={true}
              title="Витрина наград"
            />


            {/* ── Друзья ── */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Друзья</Text>
              <TouchableOpacity
                style={{
                  backgroundColor: colors.card, borderRadius: 16, padding: 16,
                  borderWidth: 1, borderColor: colors.border,
                  flexDirection: "row", alignItems: "center", gap: 14,
                }}
                onPress={() => setFriendsOpen(true)}
              >
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#ec489918", justifyContent: "center", alignItems: "center" }}>
                  <Feather name="users" size={20} color="#ec4899" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>Мои друзья</Text>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Добавляй друзей по коду</Text>
                </View>
                {/* Badge for incoming friend requests */}
                {pendingCount > 0 && (
                  <View style={{
                    minWidth: 22, height: 22, borderRadius: 11,
                    backgroundColor: "#e11d48", justifyContent: "center", alignItems: "center",
                    paddingHorizontal: 5,
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: "800", color: "#fff" }}>{pendingCount}</Text>
                  </View>
                )}
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Быстрые действия ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Действия</Text>

          {isTeacherOrAdmin(user.role) && (
            <TouchableOpacity style={s.row} onPress={() => router.push("/(main)/create-assignment" as any)}>
              <Feather name="plus-circle" size={20} color={colors.primary} />
              <Text style={s.rowText}>Создать задание</Text>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}

          {(isTeacherOrAdmin(user.role) || user.role === "parent") && (
            <TouchableOpacity style={s.row} onPress={() => router.push("/(main)/students" as any)}>
              <Feather name="users" size={20} color={colors.primary} />
              <Text style={s.rowText}>{user.role === "parent" ? "Мои дети" : "Все ученики"}</Text>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={s.logoutBtn}
          onPress={() => {
            if (Platform.OS === "web") {
              if (window.confirm("Выйти из аккаунта?")) logout();
            } else {
              Alert.alert(
                "Выйти из аккаунта?",
                "Вы уверены, что хотите выйти из профиля?",
                [
                  { text: "Отмена", style: "cancel" },
                  { text: "Выйти", style: "destructive", onPress: logout },
                ],
                { cancelable: true }
              );
            }
          }}
        >
          <Text style={s.logoutText}>Выйти из аккаунта</Text>
        </TouchableOpacity>
      </ScrollView>

    </View>
  );
}
