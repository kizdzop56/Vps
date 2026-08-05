// Экран «Профиль»: шапка-герой со счётчиками и полосой опыта, блок «О себе»
// с интересами, цель дня, успеваемость, витрина наград и друзья.
//
// Эмодзи интерфейса не используются — значки рисует собственный набор
// (components/ui/Glyph.tsx). ИСКЛЮЧЕНИЕ: аватар-эмодзи. Его выбирает сам
// ученик, это его лицо в приложении, а не наша иконка.
//
// Крупные блоки вынесены в компоненты:
//   ProfileHero      — шапка (components/ui/ProfileHero.tsx), общая с чужим
//                      профилем app/(main)/friend/[id].tsx;
//   AboutCard        — «О себе» + интересы (components/AboutCard.tsx);
//   DailyQuests      — цель дня (components/DailyQuests.tsx);
//   ScoreCard        — средний балл с переключателем периода
//                      (components/ScoreCard.tsx);
//   AssignmentsCard  — плитка заданий с разбором результатов
//                      (components/AssignmentsCard.tsx);
//   StudyTimeCard    — плитка времени с живыми часами и разбором по дням
//                      (components/StudyTimeCard.tsx).
//
// Все карточки статистики устроены одинаково: нижняя грань и графики, которые
// вырастают от нуля при появлении. Плоских карточек рядом с объёмными на этом
// экране быть не должно — одна такая сразу читается как недоделанная.
// Проседает при нажатии только то, что реально открывается: задания и время.
//
// ── Повтор анимаций ─────────────────────────────────────────────────────────
// Профиль — вкладка, а не отдельный экран: при уходе он не размонтируется, и
// анимации внутри карточек играли ровно один раз за сессию. Поэтому здесь
// живёт счётчик replay: он растёт на КАЖДОМ фокусе экрана и передаётся в
// карточки, которые по его изменению запускают свои шкалы с нуля.
// Важно: внутри интервала обновления данных он не растёт — иначе графики
// дёргались бы сами по себе раз в минуту.
//
// Все кнопки экрана — ChunkyButton из GameKit, включая выход из аккаунта
// (тон danger).
//
// Очки за цель дня: карточка сама просит их выдать (onClaim), как только день
// сходится, а признак «уже получено» приходит с сервера в
// gamStats.dailyGoalClaimedToday. Начисляет сервер и только один раз в сутки —
// см. POST /gamification/daily-goal/claim.
//
// Счётчики в шапке передаются списком: у своего профиля это «слов выучено» и
// «дней подряд», у чужого — «очков» и «заданий» (чужую статистику по словам
// сервер не отдаёт).
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView,
  Platform, AppState, TextInput, Modal, FlatList, ActivityIndicator,
  Clipboard, Alert, KeyboardAvoidingView,
} from "react-native";
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
import { DailyQuests } from "@/components/DailyQuests";
import { AboutCard } from "@/components/AboutCard";
import { ScoreCard } from "@/components/ScoreCard";
import { StudyTimeCard } from "@/components/StudyTimeCard";
import { AssignmentsCard } from "@/components/AssignmentsCard";
import { type CategoryStat } from "@/components/AssignmentRingsChart";
import { useGamification } from "@/hooks/useGamification";
import { Glyph } from "@/components/ui/Glyph";
import { ProfileHero } from "@/components/ui/ProfileHero";
import { ChunkyButton, SectionLabel } from "@/components/ui/GameKit";
import { buildDailyPlan } from "@/utils/dailyQuests";
import { accents, radii } from "@/constants/theme";
import { screenTop } from "@/constants/layout";

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

/** Русское склонение по числу. */
function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 14) return forms[2];
  const last = abs % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
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
  "#a855f7","#d946ef","#4338ca","#6d28d9",
  "#818cf8","#f59e0b","#64748b","#1e293b",
];

type StatsPeriod = "week" | "month" | "all";
const PERIODS: { key: StatsPeriod; label: string; days: number | null }[] = [
  { key: "week", label: "Неделя", days: 7 },
  { key: "month", label: "Месяц", days: 30 },
  { key: "all", label: "Всё время", days: null },
];

const SESSION_START_KEY = "timer_session_start";

/** Как часто перезапрашивать прогресс задач дня, пока экран открыт. */
const PLAN_REFRESH_MS = 60_000;

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

          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <View style={{
              width: 84, height: 84, borderRadius: 28, backgroundColor: color,
              justifyContent: "center", alignItems: "center",
              shadowColor: color, shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
            }}>
              <Text style={{ fontSize: 42 }}>{emoji}</Text>
            </View>
          </View>

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
      setFriends(Array.isArray(fr) ? fr : []);
      setTeachers(Array.isArray(tc) ? tc : []);
    } catch { /* ignore */ }
    finally { setLoadingList(false); }
  }, []);

  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchIdRef = useRef(0);

  useEffect(() => {
    if (visible) {
      loadFriends();
      pollerRef.current = setInterval(loadFriends, 30_000);
    } else {
      if (pollerRef.current) { clearInterval(pollerRef.current); pollerRef.current = null; }
    }
    return () => { if (pollerRef.current) { clearInterval(pollerRef.current); pollerRef.current = null; } };
  }, [visible, loadFriends]);

  const resetAddForm = () => { setCode(""); setUsernameInput(""); setFound(null); setAddError(""); };

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
    } catch {
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
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Text style={{ fontSize: 21, fontWeight: "900", letterSpacing: -0.4, color: colors.foreground }}>Друзья</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Glyph name="close" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>

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
  const [bioLoaded, setBioLoaded] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);
  const [username] = useState(user?.username ?? "");
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [period, setPeriod] = useState<StatsPeriod>("all");
  /**
   * Счётчик показов экрана. Растёт при каждом фокусе профиля и передаётся в
   * карточки: по его изменению шкалы, кольца и столбики стартуют с нуля.
   * Без него анимации играли один раз за сессию — вкладка живёт в памяти.
   */
  const [replay, setReplay] = useState(0);
  const [teacherRequests, setTeacherRequests] = useState<Array<{
    requestId: number;
    teacher: { id: number; name: string; username: string; avatarEmoji: string | null; avatarColor: string | null; role: string };
  }>>([]);

  const {
    stats: gamStats, toastAchievement,
    loadStats, claimDailyLogin, claimDailyGoal, unlockAchievements, hideToast, updateDailyGoal,
  } = useGamification();

  const [mascotVisible, setMascotVisible] = useState(false);
  const [mascotMsg, setMascotMsg] = useState({ message: "", mood: "wave" as any });
  const [dailyLoginShown, setDailyLoginShown] = useState(false);

  const isStudent = user?.role === "student";
  const isTeacher = isTeacherOrAdmin(user?.role ?? "");

  useEffect(() => {
    if (!user?.id) return;
    authStorage.getItem("auth_token").then((token) => {
      fetch(`${BASE}/api/users/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.bio !== undefined && !bioLoaded) {
            setBio(data.bio ?? "");
            setBioLoaded(true);
          }
        })
        .catch(() => { /* silent */ });
    });
  }, [user?.id]);

  // Интересы лежат отдельно от профиля (см. routes/interests.ts): их правит
  // только сам ученик, и подмешивать массив в общий PATCH профиля не нужно.
  const loadInterests = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await apiFetch(`/api/users/${user.id}/interests`);
      setInterests(Array.isArray(data?.interests) ? data.interests : []);
    } catch { /* silent */ }
  }, [user?.id]);

  useEffect(() => { loadInterests(); }, [loadInterests]);

  const saveInterests = useCallback(async (nextList: string[]) => {
    if (!user?.id) return;
    const prev = interests;
    setInterests(nextList); // оптимистично: метки должны реагировать мгновенно
    try {
      const data = await apiFetch(`/api/users/${user.id}/interests`, {
        method: "PUT",
        body: JSON.stringify({ interests: nextList }),
      });
      if (Array.isArray(data?.interests)) setInterests(data.interests);
    } catch {
      setInterests(prev);
      Alert.alert("Не удалось сохранить", "Проверьте интернет-соединение и попробуйте снова.");
    }
  }, [user?.id, interests]);

  useEffect(() => {
    if (!isStudent) return;
    const load = async () => {
      try {
        const token = await authStorage.getItem("auth_token");
        const headers = { Authorization: `Bearer ${token}` };

        const [friendsRes, teacherRes] = await Promise.all([
          fetch(`${BASE}/api/connections/friends`, { headers }),
          fetch(`${BASE}/api/connections/student/teacher-requests`, { headers }),
        ]);

        if (friendsRes.ok) {
          const data: Array<{ status: string; direction: string }> = await friendsRes.json();
          const count = Array.isArray(data)
            ? data.filter((f) => f.status === "pending" && f.direction === "received").length
            : 0;
          setPendingCount(count);
        }
        if (teacherRes.ok) {
          const data = await teacherRes.json();
          setTeacherRequests(Array.isArray(data) ? data : []);
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
    { query: { enabled: isStudent && !!user?.id, refetchInterval: 10_000 } as any }
  );

  const submissionRows: any[] = Array.isArray(submissions) ? (submissions as any[]) : [];
  const completedCount = submissionRows.length;
  const totalMinutes = timeStats?.totalMinutes ?? 0;
  const todaySeconds = timeStats && timeStatsAt
    ? Math.max(0, Math.floor((timeStats.todayMinutes ?? 0) * 60 + (Date.now() - timeStatsAt) / 1000))
    : sessionSeconds;

  /**
   * Минуты за сегодня для цели дня: максимум из серверного значения и живого
   * счётчика. Сервер знает о времени в других вкладках, таймер — о минутах,
   * которые сервер ещё не успел учесть. Значение целое, поэтому план
   * пересчитывается раз в минуту, а не на каждый тик.
   */
  const liveTodayMinutes = React.useMemo(
    () => Math.max(gamStats?.todayMinutes ?? 0, Math.floor(todaySeconds / 60)),
    [gamStats?.todayMinutes, todaySeconds],
  );

  /**
   * Средний балл за выбранный период. Числа работ и очков здесь больше не
   * считаются: карточка показывает только балл, а подробности — в разборе
   * заданий.
   */
  const periodAverage = React.useMemo(() => {
    const days = PERIODS.find((p) => p.key === period)?.days ?? null;
    const cutoff = days === null ? 0 : Date.now() - days * 86400000;
    const inPeriod = days === null
      ? submissionRows
      : submissionRows.filter((r) => {
          const t = new Date(r.submittedAt).getTime();
          return Number.isFinite(t) && t >= cutoff;
        });
    const scored = inPeriod.filter((r) => typeof r.score === "number");
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((sum, r) => sum + r.score, 0) / scored.length);
  }, [submissions, period]);

  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const loadCategoryStats = useCallback(async () => {
    if (!isStudent || !user?.id) return;
    try {
      const data = await apiFetch(`/api/students/${user.id}/category-stats`);
      setCategoryStats(Array.isArray(data) ? data : []);
    } catch {
      setCategoryStats([]);
    }
  }, [isStudent, user?.id]);

  useEffect(() => { loadCategoryStats(); }, [loadCategoryStats, completedCount]);

  const [wordStats, setWordStats] = useState({
    totalLearned: 0, wordsToday: 0, learnedToday: 0, dailyWordGoal: 10,
  });
  const loadWordStats = useCallback(async () => {
    if (!isStudent) return;
    try {
      const data = await apiFetch("/api/flashcards/stats");
      setWordStats({
        totalLearned: Number(data?.totalLearned) || 0,
        wordsToday: Number(data?.wordsToday) || 0,
        learnedToday: Number(data?.learnedToday) || 0,
        dailyWordGoal: Number(data?.dailyWordGoal) || 10,
      });
    } catch { /* задачи по словам просто не покажут прогресс */ }
  }, [isStudent]);

  // Пока экран открыт, прогресс задач подтягивается сам: профиль — вкладка,
  // он не размонтируется, и без опроса галочки появлялись бы только после
  // перехода на другую вкладку и обратно.
  //
  // Здесь же поднимается replay: КАЖДЫЙ вход на экран заново проигрывает
  // графики. Внутри интервала его трогать нельзя — иначе шкалы сбрасывались бы
  // сами по себе раз в минуту прямо под носом у читающего.
  useFocusEffect(
    useCallback(() => {
      if (!isStudent) return;
      setReplay((n) => n + 1);
      const refresh = () => {
        loadStats();
        loadCategoryStats();
        loadWordStats();
      };
      refresh();
      const interval = setInterval(refresh, PLAN_REFRESH_MS);
      return () => clearInterval(interval);
    }, [isStudent, loadStats, loadCategoryStats, loadWordStats])
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

  const achievementStats: AchievementStats = React.useMemo(() => ({
    completedAssignments: gamStats?.completedAssignments ?? 0,
    totalPoints: gamStats?.totalPoints ?? 0,
    knowledgeLevel: user?.knowledgeLevel ?? null,
    totalTimeMinutes: gamStats?.totalTimeMinutes ?? 0,
    voiceChatSessions: gamStats?.voiceChatSessions ?? 0,
    loginStreak: gamStats?.loginStreak ?? 0,
    perfectScoreCount: gamStats?.perfectScoreCount ?? 0,
    xpLevel: gamStats?.xpLevel ?? 1,
    earlyBirdSessions: gamStats?.earlyBirdSessions ?? 0,
  }), [gamStats, user?.knowledgeLevel]);

  const unlocked = React.useMemo(() => getUnlockedAchievements(achievementStats), [achievementStats]);
  const locked = React.useMemo(() => getLockedAchievements(achievementStats), [achievementStats]);

  const dailyPlan = React.useMemo(() => {
    if (!gamStats) return null;
    return buildDailyPlan({
      todayMinutes: liveTodayMinutes,
      activeGoalMinutes: gamStats.dailyGoalMinutes,
      selectedGoalMinutes: gamStats.nextDailyGoalMinutes ?? gamStats.dailyGoalMinutes,
      todayCompletions: gamStats.todayCompletions ?? 0,
      todayVoiceSessions: gamStats.todayVoiceSessions ?? 0,
      wordsToday: wordStats.wordsToday,
      learnedToday: wordStats.learnedToday,
      dailyWordGoal: wordStats.dailyWordGoal,
    });
  }, [gamStats, wordStats, liveTodayMinutes]);

  const xp = gamStats?.totalPoints ?? 0;
  const xpProgress = getXpProgress(xp);

  const respondToTeacherRequest = async (requestId: number, accept: boolean) => {
    try {
      const token = await authStorage.getItem("auth_token");
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (accept) {
        await fetch(`${BASE}/api/connections/student/teacher-requests/${requestId}/accept`, {
          method: "PATCH", headers,
        });
      } else {
        await fetch(`${BASE}/api/connections/student/teacher-requests/${requestId}`, {
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
      const res = await fetch(`${BASE}/api/users/${user.id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return false;
      await updateUser(patch);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
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
      const blobRes = await fetch(manipulated.uri);
      const blob = await blobRes.blob();
      if (blob.size > 500_000) {
        setAvatarUrl(prevUrl);
        Alert.alert("Фото слишком большое", "Попробуйте выбрать другое изображение.");
        return;
      }
      const token = await authStorage.getItem("auth_token");

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

      const uploadTarget = uploadURL.startsWith("http")
        ? uploadURL
        : `${BASE}${uploadURL}`;
      const uploadRes = await fetch(uploadTarget, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      });
      if (!uploadRes.ok) throw new Error("Ошибка загрузки файла на сервер");

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

  /**
   * Выход с подтверждением. На вебе Alert.alert не показывает кнопки, поэтому
   * там используется window.confirm — иначе выход происходил бы молча.
   */
  const handleLogout = useCallback(() => {
    if (Platform.OS === "web") {
      if (window.confirm("Выйти из аккаунта?")) logout();
      return;
    }
    Alert.alert(
      "Выйти из аккаунта?",
      "Вы уверены, что хотите выйти из профиля?",
      [
        { text: "Отмена", style: "cancel" },
        { text: "Выйти", style: "destructive", onPress: logout },
      ],
      { cancelable: true }
    );
  }, [logout]);

  if (!user) return null;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { paddingBottom: insets.bottom + 100 },

    section: { paddingHorizontal: 20, marginBottom: 16 },

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
  const streak = gamStats?.loginStreak ?? 0;

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

      <AchievementToast achievement={toastAchievement} onHide={hideToast} />

      <MascotModal
        visible={mascotVisible}
        mood={mascotMsg.mood}
        message={mascotMsg.message}
        mascotName={gamStats?.mascotName ?? "Снежа"}
        onClose={() => setMascotVisible(false)}
      />

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
        <ProfileHero
          name={user.name}
          username={username}
          avatarEmoji={avatarEmoji}
          avatarColor={avatarColor}
          avatarUrl={avatarUrl}
          saving={saving}
          onEditAvatar={() => setAvatarMenuOpen(true)}
          roleLabel={ROLE_LABELS[user.role] ?? user.role}
          ageLabel={age !== null ? ageWord(age) : null}
          level={isStudent && gamStats
            ? { number: xpProgress.current.level, title: xpProgress.current.title }
            : null}
          stats={isStudent && gamStats
            ? [
                {
                  icon: "cards",
                  value: wordStats.totalLearned,
                  label: `${plural(wordStats.totalLearned, ["слово", "слова", "слов"])} выучено`,
                },
                {
                  icon: "flame",
                  value: streak,
                  label: `${plural(streak, ["день", "дня", "дней"])} подряд`,
                },
              ]
            : null}
          xp={isStudent && gamStats
            ? {
                current: xp,
                nextAt: xpProgress.next?.xpRequired ?? null,
                nextTitle: xpProgress.next?.title ?? null,
                nextLevel: xpProgress.next?.level ?? null,
                percent: xpProgress.progressPercent,
              }
            : null}
          paddingTop={screenTop(insets)}
        />

        {isStudent && teacherRequests.length > 0 && (
          <View style={{ marginHorizontal: 20, marginBottom: 12 }}>
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
                  width: 46, height: 46, borderRadius: 16,
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

        {/* «О себе» + интересы. Стоит сразу под шапкой: сначала знакомство
            с человеком, потом дела на сегодня. */}
        <AboutCard
          bio={bio}
          onSaveBio={(value) => { setBio(value); saveProfile({ bio: value }); }}
          interests={interests}
          onSaveInterests={saveInterests}
        />

        {isStudent && dailyPlan && (
          <View style={s.section}>
            <DailyQuests
              plan={dailyPlan}
              goalMinutes={gamStats?.nextDailyGoalMinutes ?? gamStats?.dailyGoalMinutes ?? 15}
              claimed={gamStats?.dailyGoalClaimedToday ?? false}
              onClaim={claimDailyGoal}
              onGoalChange={updateDailyGoal}
              replay={replay}
            />
          </View>
        )}

        {isStudent && (
          <>
            <ScoreCard
              average={periodAverage}
              periods={PERIODS}
              period={period}
              onPeriodChange={setPeriod}
              replay={replay}
              style={s.section}
            />

            {/* Пара плиток: задания и время. Обе объёмные и обе открывают
                разбор — разной физики у соседей быть не должно. */}
            <View style={s.section}>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "stretch" }}>
                <AssignmentsCard stats={categoryStats} submissions={submissionRows} replay={replay} />

                <StudyTimeCard
                  studentId={user.id}
                  totalMinutes={gamStats?.totalTimeMinutes ?? totalMinutes}
                  todaySeconds={todaySeconds}
                />
              </View>
            </View>

            <AchievementsShowcase
              unlocked={unlocked}
              locked={locked}
              showLocked={true}
              stats={achievementStats}
              title="Витрина наград"
            />

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

        {(isTeacher || user.role === "parent") && (
          <View style={s.section}>
            <SectionLabel>Действия</SectionLabel>

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

        {/* Выход — такая же физическая кнопка, как остальные, только красная. */}
        <View style={{ paddingHorizontal: 20 }}>
          <ChunkyButton
            label="Выйти из аккаунта"
            icon="logout"
            tone="danger"
            onPress={handleLogout}
          />
        </View>
      </ScrollView>
    </View>
  );
}
