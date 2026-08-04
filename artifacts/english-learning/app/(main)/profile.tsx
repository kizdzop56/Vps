// Экран «Профиль»: шапка-герой с аватаром и полосой опыта, описание, цель дня,
// успеваемость, статистика ученика, витрина наград и друзья.
//
// Эмодзи интерфейса не используются — значки рисует собственный набор
// (components/ui/Glyph.tsx). ИСКЛЮЧЕНИЕ: аватар-эмодзи. Его выбирает сам
// ученик, это его лицо в приложении, а не наша иконка, поэтому подборка
// AVATAR_EMOJIS остаётся и поле avatarEmoji в базе не трогаем.
//
// Оформление повторяет раздел «Слова» — те же приёмы:
//   • значок в градиентной плашке со свечением (см. StatCard), а не бледная
//     заливка цветом с прозрачностью;
//   • одно главное действие физической кнопкой ChunkyButton.
// Градиент шапки взят тот же, что у «Рейтинга», чтобы экраны выглядели
// одной семьёй.
//
// Наклоны убраны по всему экрану: карточки, плашки значков и заявки стоят
// ровно. В плотной сетке микро-поворот читался как брак вёрстки, а не как
// приём; глубину держат цветная тень и отклик на нажатие. То же сделано на
// «Заданиях», «Учениках» и «Анализе».
//
// Порядок блоков собран по частоте обращения: сначала «сколько я сегодня
// прошёл» (цель дня), потом «как я учусь» (успеваемость), и только затем
// накопительные счётчики и награды. Блока «Действия» у ученика больше нет —
// он состоял из одной метки без содержимого.
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView,
  Platform, AppState, TextInput, Modal, FlatList, ActivityIndicator,
  Clipboard, Alert, KeyboardAvoidingView,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import { useRouter, useFocusEffect } from "expo-router";
import { useGetStudentSubmissions, useGetStudentTimeStats } from "@workspace/api-client-react";
import { getUnlockedAchievements, getLockedAchievements, type AchievementStats } from "@/constants/achievements";
import { getXpProgress } from "@/constants/xpLevels";
import AsyncStorage from "@react-native-async-storage/async-storage";
import authStorage from "@/utils/authStorage";
import { AchievementsShowcase } from "@/components/AchievementsShowcase";
import { MascotModal, getMascotMessage } from "@/components/Mascot";
import { AchievementToast } from "@/components/AchievementToast";
import { DailyGoalBar } from "@/components/DailyGoalBar";
import { AssignmentRingsChart, type CategoryStat } from "@/components/AssignmentRingsChart";
import { useGamification } from "@/hooks/useGamification";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { ChunkyButton, Pill, SectionLabel } from "@/components/ui/GameKit";
import { accents, gradients, radii } from "@/constants/theme";

/** Градиент шапки — тот же, что в «Рейтинге»: экраны выглядят одной семьёй. */
const HERO_GRADIENT = ["#2e1065", "#5b21b6", "#7c3aed"] as const;

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

// Аватар-эмодзи — выбор ученика, а не элемент интерфейса: этот список
// намеренно остаётся эмодзи (см. комментарий к файлу).
const AVATAR_EMOJIS = [
  "🦁","🐯","🐻","🐼","🦊","🐸","🦅","🦋","🐬","🦄",
  "🐲","🦝","🦉","🐺","🐮","🐷","🐙","🦀","🐧","🦜",
  "🌟","🚀","⚡","🎯","🎸","🎨","🏆","💎","🔥","🌈",
];
const AVATAR_COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#e11d48",
  "#a855f7","#d946ef","#4338ca","#6d28d9",
  "#818cf8","#f59e0b","#64748b","#1e293b",
];

/** Период, за который считается успеваемость. */
type StatsPeriod = "week" | "month" | "all";
const PERIODS: { key: StatsPeriod; label: string; days: number | null }[] = [
  { key: "week", label: "Неделя", days: 7 },
  { key: "month", label: "Месяц", days: 30 },
  { key: "all", label: "Всё время", days: null },
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

/**
 * Кольцо среднего балла. Кольцо, а не полоса: это единственное число на экране,
 * которое отвечает на вопрос «как я учусь», и оно должно читаться как объект,
 * а не как ещё одна строка статистики.
 */
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
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: 24 }}>
          <Text style={{ fontSize: 19, fontWeight: "900", color: colors.foreground, marginBottom: 16 }}>
            Выбери аватар
          </Text>

          {/* Preview */}
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <View style={{
              width: 84, height: 84, borderRadius: 42, backgroundColor: color,
              justifyContent: "center", alignItems: "center",
              // Свечение в цвете самого аватара — превью выглядит объектом.
              shadowColor: color, shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
            }}>
              <Text style={{ fontSize: 42 }}>{emoji}</Text>
            </View>
          </View>

          {/* Emoji grid */}
          <SectionLabel>Аватар</SectionLabel>
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
          <SectionLabel>Цвет фона</SectionLabel>
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

          <ChunkyButton label="Сохранить" icon="check" onPress={() => { onSave(emoji, color); onClose(); }} />
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
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: 24, maxHeight: "85%" }}>
          {/* Header */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Text style={{ fontSize: 21, fontWeight: "900", letterSpacing: -0.4, color: colors.foreground }}>Друзья</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Glyph name="close" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* ── Мой код (только на вкладке «Добавить») ── */}
          {!!inviteCode && tab === "add" && (
            <View style={{
              marginBottom: 16,
              backgroundColor: colors.primary + "10", borderRadius: radii.md, padding: 16,
              borderWidth: 1.5, borderColor: colors.primary + "30",
              flexDirection: "row", alignItems: "center", gap: 14,
            }}>
              <View style={{
                width: 44, height: 44, borderRadius: radii.sm,
                backgroundColor: colors.primary + "20",
                justifyContent: "center", alignItems: "center",
              }}>
                <Glyph name="key" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary, textTransform: "uppercase", letterSpacing: 1 }}>
                  Мой код
                </Text>
                {/* Код — объект, а не строка текста: моноширинные цифры и трекинг,
                    чтобы его было удобно диктовать вслух. */}
                <Text style={{ fontSize: 23, fontWeight: "900", color: colors.primary, letterSpacing: 5, fontVariant: ["tabular-nums"] }}>
                  {inviteCode}
                </Text>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>
                  Поделись с учителем, родителем или другом
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  Clipboard.setString(inviteCode ?? "");
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 2000);
                }}
                style={({ pressed }) => ({
                  backgroundColor: codeCopied ? colors.success : colors.primary,
                  borderRadius: radii.sm - 2, padding: 11,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Glyph name={codeCopied ? "check" : "copy"} size={18} color="#fff" />
              </Pressable>
            </View>
          )}

          {/* Tab switcher: активная вкладка приподнята, как физическая клавиша. */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
            {(["list", "add"] as const).map((t) => {
              const active = tab === t;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTab(t)}
                  activeOpacity={0.85}
                  style={{
                    flex: 1, paddingVertical: 11, borderRadius: radii.sm, alignItems: "center",
                    backgroundColor: active ? colors.primary : colors.card,
                    borderWidth: 1, borderColor: active ? colors.primary : colors.border,
                    ...(active ? {
                      shadowColor: colors.primary,
                      shadowOffset: { width: 0, height: 3 },
                      shadowOpacity: 0.32,
                      shadowRadius: 9,
                      elevation: 4,
                    } : {}),
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "800", color: active ? "#fff" : colors.foreground }}>
                    {t === "list" ? `Мои друзья (${accepted.length})` : "Добавить"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {tab === "list" ? (
            <ScrollView style={{ maxHeight: 400 }}>
              {loadingList ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
              ) : (
                <>
                  {/* Incoming requests */}
                  {pending.filter((f) => f.direction === "received").map((f) => (
                    <View key={f.friendshipId} style={{
                      flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10,
                      backgroundColor: accents.magenta + "14", borderRadius: radii.sm + 2, padding: 12,
                      borderWidth: 1, borderColor: accents.magenta + "33",
                    }}>
                      <AnimatedAvatar
                        size={42}
                        avatarColor={f.user.avatarColor ?? "#6366f1"}
                        avatarEmoji={f.user.avatarEmoji}
                        avatarUrl={(f.user as any).avatarUrl}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>{f.user.name}</Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Хочет дружить</Text>
                      </View>
                      <Pressable onPress={() => acceptRequest(f.friendshipId)} style={{ backgroundColor: colors.primary, borderRadius: 9, padding: 7 }}>
                        <Glyph name="check" size={16} color="#fff" />
                      </Pressable>
                      <Pressable onPress={() => removeOrDecline(f.friendshipId)} style={{ backgroundColor: colors.destructive, borderRadius: 9, padding: 7 }}>
                        <Glyph name="close" size={16} color="#fff" />
                      </Pressable>
                    </View>
                  ))}

                  {/* Accepted friends — tappable to view profile */}
                  {accepted.map((f) => (
                    <TouchableOpacity
                      key={f.friendshipId}
                      activeOpacity={0.7}
                      onPress={() => { onClose(); onOpenFriend(f.user.id); }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10, backgroundColor: colors.card, borderRadius: radii.sm + 2, padding: 12, borderWidth: 1, borderColor: colors.border }}
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
                            backgroundColor: colors.success,
                            borderWidth: 2, borderColor: colors.card,
                          }} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>{f.user.name}</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 }}>
                          {f.user.isOnline ? (
                            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.success }}>В сети</Text>
                          ) : (
                            <>
                              <Glyph name="star" size={11} color={colors.mutedForeground} />
                              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>
                                {f.user.totalPoints} очков
                              </Text>
                            </>
                          )}
                        </View>
                      </View>
                      <Glyph name="chevron" size={16} color={colors.mutedForeground} />
                      <Pressable
                        onPress={(e) => { e.stopPropagation(); removeOrDecline(f.friendshipId); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Glyph name="userX" size={18} color={colors.mutedForeground} />
                      </Pressable>
                    </TouchableOpacity>
                  ))}

                  {/* Pending sent */}
                  {pending.filter((f) => f.direction === "sent").map((f) => (
                    <View key={f.friendshipId} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10, backgroundColor: colors.card, borderRadius: radii.sm + 2, padding: 12, borderWidth: 1, borderColor: colors.border, opacity: 0.6 }}>
                      <AnimatedAvatar
                        size={42}
                        avatarColor={f.user.avatarColor ?? "#6366f1"}
                        avatarEmoji={f.user.avatarEmoji}
                        avatarUrl={(f.user as any).avatarUrl}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>{f.user.name}</Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Запрос отправлен…</Text>
                      </View>
                    </View>
                  ))}

                  {/* My teachers section */}
                  {teachers.length > 0 && (
                    <>
                      <SectionLabel style={{ marginTop: friends.length > 0 ? 16 : 0 }}>
                        Мои учителя · {teachers.length}
                      </SectionLabel>
                      {teachers.map((t) => (
                        <TouchableOpacity
                          key={t.id}
                          activeOpacity={0.75}
                          onPress={() => { onClose(); onOpenFriend(t.id); }}
                          style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10, backgroundColor: colors.card, borderRadius: radii.sm + 2, padding: 12, borderWidth: 1, borderColor: colors.border }}
                        >
                          <View style={{ position: "relative" }}>
                            <AnimatedAvatar
                              size={42}
                              avatarColor={t.avatarColor ?? "#6366f1"}
                              avatarEmoji={t.avatarEmoji}
                              avatarUrl={(t as any).avatarUrl}
                            />
                            {t.isOnline && (
                              <View style={{
                                position: "absolute", bottom: 0, right: 0,
                                width: 13, height: 13, borderRadius: 7,
                                backgroundColor: colors.success,
                                borderWidth: 2, borderColor: colors.card,
                              }} />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>{t.name}</Text>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 }}>
                              {t.isOnline ? (
                                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.success }}>В сети</Text>
                              ) : (
                                <>
                                  {/* Шапочка вместо 🎓: одинаково выглядит на всех платформах. */}
                                  <Glyph name="cap" size={12} color={colors.mutedForeground} />
                                  <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Учитель</Text>
                                </>
                              )}
                            </View>
                          </View>
                          <Glyph name="chevron" size={16} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      ))}
                    </>
                  )}

                  {friends.length === 0 && teachers.length === 0 && (
                    <View style={{ alignItems: "center", paddingVertical: 40, gap: 12 }}>
                      <Glyph name="handshake" size={44} color={colors.mutedForeground} />
                      <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>Пока никого нет</Text>
                      <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
                        Поделись своим кодом или введи код друга
                      </Text>
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
                      flex: 1, paddingVertical: 9, borderRadius: radii.sm - 2, alignItems: "center",
                      backgroundColor: addMode === m ? colors.primary + "18" : "transparent",
                      borderWidth: 1.5, borderColor: addMode === m ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "800", color: addMode === m ? colors.primary : colors.mutedForeground }}>
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
                        backgroundColor: colors.card, borderRadius: radii.sm + 2,
                        borderWidth: 2,
                        borderColor: addError ? colors.destructive : found ? colors.primary : colors.border,
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
                        backgroundColor: colors.card, borderRadius: radii.sm + 2,
                        borderWidth: 2,
                        borderColor: addError ? colors.destructive : found ? colors.primary : colors.border,
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
                  flexDirection: "row", alignItems: "center", gap: 9,
                  backgroundColor: colors.destructive + "12", borderRadius: radii.sm, padding: 12, marginBottom: 12,
                  borderWidth: 1, borderColor: colors.destructive + "44",
                }}>
                  <Glyph name="alert" size={16} color={colors.destructive} />
                  <Text style={{ color: colors.destructive, fontSize: 13, flex: 1 }}>{addError}</Text>
                </View>
              )}

              {/* Found user card */}
              {found && (
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 12,
                  backgroundColor: colors.primary + "12", borderRadius: radii.sm + 2, padding: 14,
                  marginBottom: 14, borderWidth: 1.5, borderColor: colors.primary + "40",
                }}>
                  <AnimatedAvatar
                    size={48}
                    avatarColor={found.avatarColor ?? "#6366f1"}
                    avatarEmoji={found.avatarEmoji}
                    avatarUrl={found.avatarUrl}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "900", color: accents.indigoDeep }}>{found.name}</Text>
                    <Text style={{ fontSize: 13, color: accents.indigoDeep + "bb" }}>@{found.username}</Text>
                  </View>
                  <Glyph name="check" size={24} color={colors.primary} />
                </View>
              )}

              {/* Confirm button — only visible after user found */}
              {found && (
                confirming ? (
                  <View style={{ paddingVertical: 18, alignItems: "center" }}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : (
                  <ChunkyButton label="Подтвердить" icon="userPlus" onPress={sendRequest} />
                )
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
  // Период для блока успеваемости. По умолчанию «всё время»: это привычная
  // цифра, а недельный срез — уточнение для тех, кто следит за прогрессом.
  const [period, setPeriod] = useState<StatsPeriod>("all");
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

  /**
   * Успеваемость за выбранный период.
   *
   * Считается на клиенте из уже загруженного списка сдач: у каждой есть дата и
   * балл, отдельный запрос не нужен. Средний балл ученик до этого не видел
   * нигде, хотя сервер его считает — и именно он отвечает на вопрос «как я
   * учусь», в отличие от накопительных очков.
   */
  const periodStats = React.useMemo(() => {
    const rows: any[] = (submissions as any[]) ?? [];
    const days = PERIODS.find((p) => p.key === period)?.days ?? null;
    const cutoff = days === null ? 0 : Date.now() - days * 86400000;
    const inPeriod = days === null
      ? rows
      : rows.filter((r) => {
          const t = new Date(r.submittedAt).getTime();
          return Number.isFinite(t) && t >= cutoff;
        });
    const scored = inPeriod.filter((r) => typeof r.score === "number");
    const average = scored.length > 0
      ? Math.round(scored.reduce((sum, r) => sum + r.score, 0) / scored.length)
      : null;
    const points = inPeriod.reduce((sum, r) => sum + (r.pointsEarned ?? 0), 0);
    return { count: inPeriod.length, average, points };
  }, [submissions, period]);

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

  /**
   * Прогресс до следующего уровня. Считается по тем же таблицам, что и сам
   * уровень (constants/xpLevels.ts) — своей математики здесь нет.
   * gamStats.totalPoints и есть XP: очки и опыт в этом проекте одно и то же.
   */
  const xp = gamStats?.totalPoints ?? 0;
  const xpProgress = getXpProgress(xp);

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

  /** Цвет балла в фирменной гамме: зелёного в палитре нет намеренно. */
  const scoreTint = periodStats.average === null
    ? colors.mutedForeground
    : periodStats.average >= 70 ? colors.success
      : periodStats.average >= 50 ? accents.amber
        : colors.destructive;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { paddingBottom: insets.bottom + 100 },

    // ── Шапка-герой ──
    // Градиентная полоса со скруглённым низом: аватар перестал висеть на
    // пустом фоне и стал главным объектом экрана.
    hero: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20),
      paddingHorizontal: 20, paddingBottom: 24,
      alignItems: "center",
      borderBottomLeftRadius: radii.xl,
      borderBottomRightRadius: radii.xl,
      marginBottom: 18,
      overflow: "hidden",
    },
    // Белое кольцо вокруг аватара + свечение: аватар читается как медальон.
    avatarRing: {
      padding: 4, borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.25)",
      borderWidth: 2, borderColor: "rgba(255,255,255,0.55)",
      shadowColor: "#1b0942", shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.45, shadowRadius: 20, elevation: 9,
    },
    editAvatarBtn: {
      position: "absolute", bottom: 2, right: 2,
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: colors.primary, justifyContent: "center", alignItems: "center",
      borderWidth: 2.5, borderColor: "#ffffff",
    },
    name: { fontSize: 25, fontWeight: "900", letterSpacing: -0.5, color: "#ffffff", marginTop: 14 },
    username: { fontSize: 14, color: "rgba(255,255,255,0.72)", marginTop: 2 },
    // Метка на «стекле»: читается на градиенте и не спорит с ним цветом.
    glassPill: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: "rgba(255,255,255,0.16)",
      borderWidth: 1, borderColor: "rgba(255,255,255,0.28)",
      paddingHorizontal: 11, paddingVertical: 6, borderRadius: radii.pill,
    },
    glassPillText: { fontSize: 12, fontWeight: "800", color: "#ffffff" },
    badgeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 12 },

    // ── Полоса опыта в шапке ──
    // Уровень раньше был просто числом в пилюле: сколько до следующего и что
    // для этого сделать, ученик не знал.
    xpBlock: { alignSelf: "stretch", marginTop: 20 },
    xpHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 },
    xpTitle: { fontSize: 13, fontWeight: "800", color: "#ffffff" },
    xpNum: { fontSize: 12, fontWeight: "800", color: "rgba(255,255,255,0.8)", fontVariant: ["tabular-nums"] },
    xpTrack: { height: 13, borderRadius: radii.pill, backgroundColor: "rgba(255,255,255,0.18)", overflow: "hidden" },
    xpNext: { fontSize: 12, color: "rgba(255,255,255,0.72)", marginTop: 7, lineHeight: 17 },

    // Bio
    bioBox: {
      backgroundColor: colors.card, borderRadius: radii.md, padding: 15,
      borderWidth: 1, borderColor: colors.border, marginHorizontal: 20, marginBottom: 20,
      shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.13, shadowRadius: 14, elevation: 3,
    },
    bioText: { fontSize: 14, color: colors.foreground, lineHeight: 20 },
    bioPlaceholder: { fontSize: 14, color: colors.mutedForeground, fontStyle: "italic" },
    bioInput: { fontSize: 14, color: colors.foreground, lineHeight: 20, minHeight: 60 },
    bioActions: { flexDirection: "row", gap: 8, marginTop: 8, justifyContent: "flex-end" },
    bioSaveBtn: { backgroundColor: colors.primary, borderRadius: 9, paddingHorizontal: 15, paddingVertical: 7 },
    bioSaveText: { fontSize: 13, fontWeight: "800", color: "#fff" },
    bioCancelBtn: { paddingHorizontal: 14, paddingVertical: 7 },
    bioCancelText: { fontSize: 13, color: colors.mutedForeground },

    // Section
    section: { paddingHorizontal: 20, marginBottom: 20 },

    // Переключатель периода: тот же сегментный вид, что на «Заданиях».
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

    // Карточка среднего балла: шире остальных, потому что это главное число.
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

    // Stats
    statsRow: { flexDirection: "row", gap: 10 },
    statCard: {
      flex: 1, backgroundColor: colors.card, borderRadius: radii.md, padding: 12,
      alignItems: "center", borderWidth: 1, borderColor: colors.border,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.16, shadowRadius: 14, elevation: 4,
    },
    statValue: {
      fontSize: 23, fontWeight: "900", letterSpacing: -0.7,
      color: colors.foreground, marginTop: 9, marginBottom: 2,
      fontVariant: ["tabular-nums"],
    },
    statLabel: { fontSize: 11, color: colors.mutedForeground, textAlign: "center", fontWeight: "600" },

    // Timer
    timerValue: { fontSize: 22, fontWeight: "900", letterSpacing: -0.6, color: "#ffffff", fontVariant: ["tabular-nums"] },
    timerLabel: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },

    // Quick actions
    row: {
      flexDirection: "row", alignItems: "center", gap: 14,
      backgroundColor: colors.card, borderRadius: radii.md, padding: 16,
      marginBottom: 10, borderWidth: 1, borderColor: colors.border,
      shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.13, shadowRadius: 14, elevation: 3,
    },
    rowText: { flex: 1, fontSize: 15, fontWeight: "800", color: colors.foreground },
  });

  const age = calcAge(user.dateOfBirth);

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
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: 24, paddingBottom: 36 }}>
            <Text style={{ fontSize: 19, fontWeight: "900", color: colors.foreground, marginBottom: 20 }}>Сменить аватар</Text>
            <TouchableOpacity
              onPress={handlePhotoUpload}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderRadius: radii.sm + 2, backgroundColor: colors.primary + "12", paddingHorizontal: 16, marginBottom: 10 }}
            >
              <Glyph name="camera" size={20} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.primary }}>Загрузить фото из галереи</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setAvatarMenuOpen(false); setAvatarPickerOpen(true); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderRadius: radii.sm + 2, backgroundColor: colors.muted, paddingHorizontal: 16, marginBottom: 10 }}
            >
              <Glyph name="face" size={20} color={colors.foreground} />
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>Выбрать аватар</Text>
            </TouchableOpacity>
            {avatarUrl && (
              <TouchableOpacity
                onPress={handleRemovePhoto}
                style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderRadius: radii.sm + 2, backgroundColor: colors.destructive + "12", paddingHorizontal: 16, marginBottom: 10 }}
              >
                <Glyph name="trash" size={20} color={colors.destructive} />
                <Text style={{ fontSize: 16, fontWeight: "800", color: colors.destructive }}>Удалить фото</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setAvatarMenuOpen(false)} style={{ paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ fontSize: 15, color: colors.mutedForeground }}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Шапка-герой ── */}
        <LinearGradient
          colors={HERO_GRADIENT as unknown as string[]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={s.hero}
        >
          <View style={{ position: "relative" }}>
            <View style={s.avatarRing}>
              <AnimatedAvatar
                size={96}
                avatarColor={avatarColor}
                avatarEmoji={avatarEmoji}
                avatarUrl={avatarUrl}
                animated={true}
              />
            </View>
            <TouchableOpacity
              style={s.editAvatarBtn}
              onPress={() => setAvatarMenuOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Сменить аватар"
            >
              {saving
                ? <ActivityIndicator size={12} color="#fff" />
                : <Glyph name="pen" size={14} color="#fff" />
              }
            </TouchableOpacity>
          </View>

          <Text style={s.name}>{user.name}</Text>
          {/* Псевдоним (@username) — только для чтения: редактирование убрано. */}
          <Text style={s.username}>@{username}</Text>

          <View style={s.badgeRow}>
            {/* Уровень XP — награда, поэтому золотая пилюля. Показываем только
                ученику и только когда серверные статы загружены. Наклон убран:
                на экране больше нет ни одного повёрнутого элемента. */}
            {isStudent && gamStats && (
              <Pill text={`${xpProgress.current.level} · ${xpProgress.current.title}`} icon="rank" tone="gold" />
            )}
            {/* Статус «в сети» на стекле: на градиенте цветная плашка не читается. */}
            <View style={s.glassPill}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#c4b5fd" }} />
              <Text style={s.glassPillText}>В сети</Text>
            </View>
            <View style={s.glassPill}>
              <Text style={s.glassPillText}>{ROLE_LABELS[user.role] ?? user.role}</Text>
            </View>
            {age !== null && (
              <View style={s.glassPill}>
                <Glyph name="calendar" size={12} color="#ffffff" />
                <Text style={s.glassPillText}>{ageWord(age)}</Text>
              </View>
            )}
          </View>

          {/* ── Полоса опыта ── */}
          {isStudent && gamStats && (
            <View style={s.xpBlock}>
              <View style={s.xpHead}>
                <Text style={s.xpTitle}>Опыт</Text>
                <Text style={s.xpNum}>
                  {xpProgress.next ? `${xp} / ${xpProgress.next.xpRequired} XP` : `${xp} XP · максимум`}
                </Text>
              </View>
              <View style={s.xpTrack}>
                <LinearGradient
                  colors={gradients.progress as unknown as string[]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ height: "100%", width: `${xpProgress.progressPercent}%`, borderRadius: radii.pill }}
                />
              </View>
              {/* Расстояние до уровня в заданиях, а не только в очках: «340 XP»
                  ребёнку ни о чём не говорит, «примерно 3 задания» — говорит. */}
              <Text style={s.xpNext}>
                {xpProgress.next
                  ? `До уровня ${xpProgress.next.level} «${xpProgress.next.title}» осталось ${xpProgress.next.xpRequired - xp} XP`
                  : "Максимальный уровень достигнут"}
              </Text>
            </View>
          )}
        </LinearGradient>

        {/* ── Входящие заявки от учителей (только ученик) ── */}
        {isStudent && teacherRequests.length > 0 && (
          <View style={{ marginHorizontal: 20, marginBottom: 14 }}>
            <SectionLabel>Заявки от учителей · {teacherRequests.length}</SectionLabel>
            {teacherRequests.map((req) => (
              <View key={req.requestId} style={{
                flexDirection: "row", alignItems: "center", gap: 12,
                backgroundColor: colors.card, borderRadius: radii.md, padding: 14,
                borderWidth: 1, borderColor: colors.border, marginBottom: 10,
                shadowColor: colors.primary, shadowOffset: { width: 0, height: 5 },
                shadowOpacity: 0.14, shadowRadius: 14, elevation: 3,
              }}>
                <View style={{
                  width: 46, height: 46, borderRadius: 23,
                  backgroundColor: req.teacher.avatarColor ?? "#6366f1",
                  justifyContent: "center", alignItems: "center",
                }}>
                  {req.teacher.avatarEmoji
                    ? <Text style={{ fontSize: 22 }}>{req.teacher.avatarEmoji}</Text>
                    : <Glyph name="cap" size={22} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>
                    {req.teacher.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground }}>хочет добавить вас как ученика</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={() => respondToTeacherRequest(req.requestId, false)}
                    style={{ backgroundColor: colors.destructive + "1f", borderRadius: 9, padding: 9 }}
                  >
                    <Glyph name="close" size={16} color={colors.destructive} />
                  </Pressable>
                  <Pressable
                    onPress={() => respondToTeacherRequest(req.requestId, true)}
                    style={{ backgroundColor: colors.primary, borderRadius: 9, padding: 9 }}
                  >
                    <Glyph name="check" size={16} color="#fff" />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Описание (bio) ── */}
        <View style={s.bioBox}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <SectionLabel style={{ marginBottom: 0 }}>О себе</SectionLabel>
            {!editingBio && (
              <Pressable onPress={() => { setBioInput(bio); setEditingBio(true); }} hitSlop={10}>
                <Glyph name="pen" size={14} color={colors.primary} />
              </Pressable>
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

        {/* ── Ученик: цель дня, успеваемость, счётчики, награды, друзья ── */}
        {isStudent && (
          <>
            {/* Цель дня стоит первой из блоков: это единственная цифра, которая
                меняется прямо сейчас и на которую ученик может повлиять
                сегодня. Раньше она лежала ниже статистики, и до неё надо было
                листать. */}
            {gamStats && (
              <View style={s.section}>
                <SectionLabel>Цель дня</SectionLabel>
                <DailyGoalBar
                  todayMinutes={gamStats.todayMinutes}
                  goalMinutes={gamStats.dailyGoalMinutes}
                  todayCompletions={gamStats.todayCompletions ?? 0}
                  todayVoiceSessions={gamStats.todayVoiceSessions ?? 0}
                  onGoalChange={updateDailyGoal}
                />
              </View>
            )}

            {/* Успеваемость за период */}
            <View style={s.section}>
              <SectionLabel>Успеваемость</SectionLabel>

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

              <View style={s.scoreCard}>
                <ScoreRing score={periodStats.average} color={scoreTint} />
                <View style={{ flex: 1 }}>
                  <Text style={s.scoreLabel}>Средний балл</Text>
                  <Text style={[s.scoreValue, { color: scoreTint }]}>
                    {periodStats.average === null ? "—" : `${periodStats.average}%`}
                  </Text>
                  <Text style={s.scoreHint}>
                    {periodStats.count === 0
                      ? "За этот период работ нет"
                      : `${periodStats.count} ${periodStats.count === 1 ? "работа" : periodStats.count < 5 ? "работы" : "работ"} · +${periodStats.points} очков`}
                  </Text>
                </View>
              </View>
            </View>

            {/* Накопительные счётчики: считаются за всё время и от периода
                не зависят — поэтому стоят отдельным блоком, а не в сетке выше. */}
            <View style={s.section}>
              <SectionLabel>Всего за время учёбы</SectionLabel>
              <View style={s.statsRow}>
                <StatCard s={s} icon="star" grad={["#f472b6", accents.magenta]} tint={accents.magenta} value={achievementStats.totalPoints} label="Очки" />
                <StatCard s={s} icon="check" grad={["#818cf8", accents.indigoDeep]} tint={colors.primary} value={achievementStats.completedAssignments} label="Заданий" />
                <StatCard s={s} icon="trophy" grad={[accents.gold, accents.amber]} tint={accents.amber} value={unlocked.length} label="Наград" />
                {/* Стрик: огонь глифом вместо 🔥 — красится темой и одинаков везде. */}
                <StatCard s={s} icon="flame" grad={gradients.fire} tint={accents.amber} value={achievementStats.loginStreak} label="Стрик" />
              </View>
            </View>

            {/* Статистика заданий + Таймер времени — два отдельных пузыря в одной строке */}
            <View style={s.section}>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "stretch" }}>
                <View style={{
                  flex: 1, backgroundColor: colors.card, borderRadius: radii.md, padding: 14,
                  borderWidth: 1, borderColor: colors.border,
                  shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
                  shadowOpacity: 0.14, shadowRadius: 14, elevation: 3,
                }}>
                  <SectionLabel>Мои задания</SectionLabel>
                  <AssignmentRingsChart stats={categoryStats} colors={colors} />
                </View>

                {/* Таймер залит градиентом бренда — как циферблат на вкладке
                    таймера, чтобы время выглядело объектом, а не подписью. */}
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
                      {formatTime(gamStats?.totalTimeMinutes ?? totalMinutes)}
                    </Text>
                    <Text style={[s.timerLabel, { textAlign: "center" }]}>
                      Сегодня: {formatSessionTime(todaySeconds)}
                    </Text>
                  </View>
                </LinearGradient>
              </View>
            </View>

            <AchievementsShowcase
              unlocked={unlocked}
              locked={locked}
              showLocked={true}
              title="Витрина наград"
            />

            {/* ── Друзья: главное действие профиля ученика ── */}
            <View style={s.section}>
              <SectionLabel>Друзья</SectionLabel>
              <ChunkyButton
                label="Мои друзья"
                sublabel={pendingCount > 0
                  ? `${pendingCount} новых заявок · добавляй по коду`
                  : "Добавляй друзей по коду и смотри их очки"}
                icon="users"
                chevron
                tone={pendingCount > 0 ? "warm" : "primary"}
                onPress={() => setFriendsOpen(true)}
              />
            </View>
          </>
        )}

        {/* ── Действия учителя и родителя ──
            У ученика этого блока нет: он состоял из одной метки «Действия»
            без единой строки внутри. Здесь же метка появляется только когда
            под ней действительно что-то есть. */}
        {(isTeacher || user.role === "parent") && (
          <View style={s.section}>
            <SectionLabel>Действия</SectionLabel>

            {/* У учителя создание задания — главное действие профиля, поэтому
                физическая кнопка, а не серая строка в общем списке. */}
            {isTeacher && (
              <ChunkyButton
                label="Создать задание"
                sublabel="Тест, аудирование, чтение, видео или колода слов"
                icon="plus"
                chevron
                onPress={() => router.push("/(main)/create-assignment" as any)}
                style={{ marginBottom: 10 }}
              />
            )}

            <TouchableOpacity activeOpacity={0.85} style={s.row} onPress={() => router.push("/(main)/students" as any)}>
              <View style={{
                width: 42, height: 42, borderRadius: radii.sm,
                backgroundColor: colors.primary + "18",
                alignItems: "center", justifyContent: "center",
              }}>
                <Glyph name="users" size={20} color={colors.primary} />
              </View>
              <Text style={s.rowText}>{user.role === "parent" ? "Мои дети" : "Все ученики"}</Text>
              <Glyph name="chevron" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}

        {/* Выход — опасное действие, поэтому отделён и подписан цветом. */}
        <Pressable
          style={({ pressed }) => ({
            marginHorizontal: 20, marginBottom: 8,
            backgroundColor: colors.destructive + "10", borderRadius: radii.md,
            padding: 16, alignItems: "center",
            flexDirection: "row", justifyContent: "center", gap: 9,
            borderWidth: 1, borderColor: colors.destructive + "44",
            opacity: pressed ? 0.85 : 1,
          })}
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
          <Glyph name="logout" size={17} color={colors.destructive} />
          <Text style={{ fontSize: 15, fontWeight: "800", color: colors.destructive }}>Выйти из аккаунта</Text>
        </Pressable>
      </ScrollView>

    </View>
  );
}

/**
 * Счётчик в строке «Всего за время учёбы».
 *
 * Значок стоит в градиентной плашке со свечением — тот же приём, что у значка
 * колоды в разделе «Слова» (components/ui/DeckGlyph.tsx). Раньше здесь была
 * бледная заливка `tint + "1f"`, из-за которой блок выглядел плоским. Наклон
 * плашки убран вместе с остальными наклонами на экране.
 */
function StatCard({
  s, icon, grad, tint, value, label,
}: {
  s: any;
  icon: GlyphName;
  grad: readonly string[];
  tint: string;
  value: number;
  label: string;
}) {
  return (
    <View style={[s.statCard, { shadowColor: tint }]}>
      <LinearGradient
        colors={grad as unknown as string[]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{
          width: 34, height: 34, borderRadius: 11,
          alignItems: "center", justifyContent: "center",
          shadowColor: tint, shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35, shadowRadius: 9, elevation: 4,
        }}
      >
        <Glyph name={icon} size={18} color="#ffffff" />
      </LinearGradient>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}
