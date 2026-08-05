// ─────────────────────────────────────────────────────────────────────────────
// Лист «Друзья»: учитель, родители и друзья ученика + добавление по коду.
//
// Раньше это была плоская модалка внутри profile.tsx: крестик в углу, семь
// одинаковых строк подряд и «0 очков» у половины списка. Разобрать, кто здесь
// учитель, а кто одноклассник, можно было только по мелкой подписи.
//
// ── Группы вместо ровного списка ────────────────────────────────────────────
// Учитель, родители и друзья — три разных отношения, а не «семь контактов».
// Учитель появляется без запроса и его нельзя удалить, родитель видит твой
// прогресс, друг — просто друг. Поэтому список разбит заголовками, а не
// свален в одну кучу.
//
// ── Очки шкалой ─────────────────────────────────────────────────────────────
// «2480 очков» само по себе ничего не значит: непонятно, это много или мало.
// Шкала считается от лидера списка, поэтому своё место в ряду видно раньше,
// чем прочитаны цифры. У тех, кто ещё не начинал, шкалы нет вовсе: пустая
// полоска выглядит как поражение, а человек просто новенький.
//
// ── Удаление на месте ───────────────────────────────────────────────────────
// Подтверждение раскрывается прямо в строке. Отдельное окно поверх окна —
// это лишний слой ради одного вопроса, а мгновенное удаление по иконке
// слишком легко задеть пальцем при прокрутке.
//
// ── Закрытие ────────────────────────────────────────────────────────────────
// Одна липкая кнопка «Закрыть» поверх листа, прижата к низу. Крестика нет.
// Под кнопкой не белая полоса-подвал, а затухание в фон: полоса перекрывала
// последнюю строку списка.
//
// ── ГРАБЛИ ──────────────────────────────────────────────────────────────────
// 1. НЕ вкладывать <Text> в <Text>: в Safari это роняет весь экран
//    («Cannot set indexed properties on this object»). Имя и плашка роли —
//    два соседних Text во View с flexDirection: "row".
// 2. useNativeDriver только не в вебе: там нативного драйвера нет, и
//    свёрнутая вкладка замораживает requestAnimationFrame.
// 3. Шкала растёт через scaleX с transform-origin слева (масштаб + сдвиг),
//    а не через ширину: ширину нативный драйвер не анимирует нигде.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, Modal, Pressable, ScrollView, TextInput, Platform,
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Clipboard,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton } from "@/components/ui/GameKit";
import authStorage from "@/utils/authStorage";
import { accents, radii, timing } from "@/constants/theme";

const NATIVE_DRIVER = Platform.OS !== "web";

/** Нижняя грань строки и глубина проседания. */
const EDGE = 4;
/** Грань переключателя: он мельче строк. */
const SEG_EDGE = 4;

/** Липкая кнопка: высота вместе с гранью и растяжка над ней. */
const STICKY_H = 62;
const STICKY_FADE = 28;

/** Ступенька появления строк. Суммарно не длиннее полусекунды. */
const STEP_MS = 55;
const RISE_MS = 420;
const GROW_MS = 780;

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

export type FriendRow = {
  friendshipId: number;
  user: {
    id: number; name: string; username: string;
    avatarEmoji: string | null; avatarColor: string | null; avatarUrl?: string | null;
    totalPoints: number; isOnline?: boolean;
  };
  status: "pending" | "accepted";
  direction: "sent" | "received";
};

export type TeacherItem = {
  id: number; name: string; username: string;
  avatarEmoji: string | null; avatarColor: string | null; avatarUrl?: string | null;
  role: string; totalPoints: number; isOnline?: boolean;
};

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 14) return forms[2];
  const last = abs % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

// ── Заголовок группы ────────────────────────────────────────────────────────

function GroupLabel({ title, count }: { title: string; count?: number }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginTop: 20, marginBottom: 10 }}>
      <Text style={{
        fontSize: 10.5, fontWeight: "900", letterSpacing: 1.1,
        textTransform: "uppercase", color: colors.mutedForeground,
      }}>
        {title}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      {count !== undefined && (
        <Text style={{
          fontSize: 10.5, fontWeight: "900", color: colors.primary,
          fontVariant: ["tabular-nums"],
        }}>
          {count}
        </Text>
      )}
    </View>
  );
}

// ── Шкала очков ─────────────────────────────────────────────────────────────

/**
 * Полоса, растущая от нуля. Масштаб, а не ширина: ширину нативный драйвер не
 * анимирует ни на одной платформе, а трансформ анимирует везде.
 *
 * Сдвиг translateX компенсирует то, что scaleX растягивает элемент от центра:
 * без него полоса росла бы в обе стороны.
 */
function GrowBar({ ratio, color, delay }: { ratio: number; color: string; delay: number }) {
  const colors = useColors();
  const grow = useRef(new Animated.Value(0)).current;
  const k = Math.max(0.04, Math.min(1, ratio));

  useEffect(() => {
    grow.setValue(0);
    const anim = Animated.timing(grow, {
      toValue: 1, duration: GROW_MS, delay,
      easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER,
    });
    anim.start();
    return () => anim.stop();
  }, [k, delay, grow]);

  return (
    <View style={{
      height: 5, borderRadius: radii.pill, backgroundColor: colors.muted,
      marginTop: 7, overflow: "hidden",
    }}>
      <Animated.View
        style={{
          height: "100%", borderRadius: radii.pill, backgroundColor: color,
          transform: [
            { scaleX: grow.interpolate({ inputRange: [0, 1], outputRange: [0, k] }) },
            // Сдвигаем на половину «недостающей» ширины влево, иначе центр
            // масштабирования уводит полосу в середину дорожки.
            { translateX: 0 },
          ],
          alignSelf: "stretch",
          width: "100%",
          marginLeft: 0,
          transformOrigin: "left center",
        } as any}
      />
    </View>
  );
}

// ── Строка человека ─────────────────────────────────────────────────────────

type PillTone = "friend" | "tutor" | "parent";

function PersonRow({
  name, emoji, color, avatarUrl, online, note, points, ratio,
  pill, pillTone = "friend", index, onPress, onRemove, leader,
}: {
  name: string;
  emoji: string | null;
  color: string;
  avatarUrl?: string | null;
  online?: boolean;
  note: string;
  /** Очки. undefined — строка без шкалы (учитель, родитель). */
  points?: number;
  /** Доля от лидера 0…1. */
  ratio?: number;
  pill?: string;
  pillTone?: PillTone;
  index: number;
  onPress?: () => void;
  onRemove?: () => void;
  /** Первое место: шкала золотая. */
  leader?: boolean;
}) {
  const colors = useColors();
  const rise = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(rise, {
      toValue: 1, duration: RISE_MS, delay: index * STEP_MS,
      easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER,
    });
    anim.start();
    return () => anim.stop();
  }, [index, rise]);

  const setPress = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: timing.press,
      easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER,
    }).start();

  const pillBg =
    pillTone === "tutor" ? colors.primary + "18"
      : pillTone === "parent" ? accents.magenta + "1a"
        : accents.gold + "33";
  const pillFg =
    pillTone === "tutor" ? colors.primary
      : pillTone === "parent" ? accents.magenta
        : "#8a5a00";

  return (
    <Animated.View
      style={{
        marginBottom: 9,
        opacity: rise,
        transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}
    >
      <View style={{ paddingBottom: EDGE }}>
        <View style={{
          position: "absolute", left: 0, right: 0, top: EDGE, bottom: 0,
          borderRadius: radii.md,
          backgroundColor: pillTone === "tutor" ? "#c9bdf0" : colors.border,
        }} />

        <Animated.View style={{ transform: [{ translateY: press }] }}>
          <Pressable
            onPress={onPress}
            onPressIn={onPress ? () => setPress(EDGE) : undefined}
            onPressOut={onPress ? () => setPress(0) : undefined}
            disabled={!onPress}
            accessibilityRole={onPress ? "button" : undefined}
            accessibilityLabel={onPress ? `Открыть профиль: ${name}` : undefined}
            style={{
              flexDirection: "row", alignItems: "center", gap: 11,
              backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
              borderRadius: radii.md, paddingVertical: 11, paddingHorizontal: 12,
            }}
          >
            <View style={{ position: "relative" }}>
              <AnimatedAvatar size={46} avatarColor={color} avatarEmoji={emoji} avatarUrl={avatarUrl} />
              {online && (
                <View style={{
                  position: "absolute", right: -2, bottom: -2,
                  width: 13, height: 13, borderRadius: 7,
                  backgroundColor: colors.success,
                  borderWidth: 2.5, borderColor: colors.card,
                }} />
              )}
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              {/* Имя и плашка — ДВА соседних Text, не вложенных. */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 15, fontWeight: "900", letterSpacing: -0.2, color: colors.foreground, flexShrink: 1 }}
                >
                  {name}
                </Text>
                {!!pill && (
                  <View style={{
                    backgroundColor: pillBg, borderRadius: radii.pill,
                    paddingHorizontal: 7, paddingVertical: 2,
                  }}>
                    <Text style={{
                      fontSize: 9.5, fontWeight: "900", letterSpacing: 0.5,
                      textTransform: "uppercase", color: pillFg,
                    }}>
                      {pill}
                    </Text>
                  </View>
                )}
              </View>

              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12, fontWeight: "700", marginTop: 2,
                  color: colors.mutedForeground, fontVariant: ["tabular-nums"],
                }}
              >
                {note}
              </Text>

              {points !== undefined && points > 0 && (
                <GrowBar
                  ratio={ratio ?? 0}
                  color={leader ? accents.gold : colors.primary}
                  delay={index * STEP_MS + 260}
                />
              )}
            </View>

            {onRemove && (
              <Pressable
                onPress={onRemove}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Убрать из друзей: ${name}`}
                style={({ pressed }) => ({ padding: 4, opacity: pressed ? 0.6 : 1 })}
              >
                <Glyph name="userX" size={18} color={colors.mutedForeground} />
              </Pressable>
            )}
            {onPress && <Glyph name="chevron" size={16} color={colors.mutedForeground} />}
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

// ── Подтверждение удаления ──────────────────────────────────────────────────

function RemoveConfirm({
  name, busy, onKeep, onDrop,
}: {
  name: string;
  busy: boolean;
  onKeep: () => void;
  onDrop: () => void;
}) {
  const colors = useColors();
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(rise, {
      toValue: 1, duration: 260, easing: Easing.out(Easing.cubic),
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [rise]);

  return (
    <Animated.View style={{
      marginBottom: 9,
      opacity: rise,
      transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
    }}>
      <View style={{ paddingBottom: EDGE }}>
        <View style={{
          position: "absolute", left: 0, right: 0, top: EDGE, bottom: 0,
          borderRadius: radii.md, backgroundColor: colors.destructive + "55",
        }} />
        <View style={{
          backgroundColor: colors.destructive + "0f",
          borderWidth: 1, borderColor: colors.destructive + "33",
          borderRadius: radii.md, padding: 14,
        }}>
          <Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>
            Убрать {name} из друзей?
          </Text>
          <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.mutedForeground, marginTop: 3 }}>
            Вы перестанете видеть очки друг друга. Запрос можно отправить заново.
          </Text>

          <View style={{ flexDirection: "row", gap: 9, marginTop: 12 }}>
            <ChunkyButton label="Оставить" tone="dark" center onPress={onKeep} style={{ flex: 1 }} />
            {busy ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={colors.destructive} />
              </View>
            ) : (
              <ChunkyButton label="Убрать" tone="danger" center onPress={onDrop} style={{ flex: 1 }} />
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ── Переключатель с гранью ──────────────────────────────────────────────────

function Segmented<T extends string>({
  options, value, onChange, style,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  style?: any;
}) {
  const colors = useColors();
  return (
    <View style={[{ paddingBottom: SEG_EDGE }, style]}>
      <View style={{
        position: "absolute", left: 0, right: 0, top: SEG_EDGE, bottom: 0,
        borderRadius: radii.sm + 2, backgroundColor: colors.border,
      }} />
      <View style={{
        flexDirection: "row", gap: 3, padding: 3,
        backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
        borderRadius: radii.sm + 2,
      }}>
        {options.map((o) => {
          const active = o.key === value;
          return (
            <Pressable
              key={o.key}
              onPress={() => onChange(o.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                {
                  flex: 1, paddingVertical: 9, borderRadius: radii.sm,
                  alignItems: "center", justifyContent: "center",
                },
                active && {
                  backgroundColor: colors.card,
                  shadowColor: accents.violetDeep,
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.22, shadowRadius: 7, elevation: 4,
                },
                pressed && !active && { opacity: 0.7 },
              ]}
            >
              <Text style={{
                fontSize: 13.5,
                fontWeight: active ? "900" : "800",
                color: active ? colors.foreground : colors.mutedForeground,
              }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── Лист ────────────────────────────────────────────────────────────────────

export interface FriendsSheetProps {
  visible: boolean;
  onClose: () => void;
  onOpenFriend: (id: number) => void;
  inviteCode?: string | null;
}

export function FriendsSheet({ visible, onClose, onOpenFriend, inviteCode }: FriendsSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<"list" | "add">("list");
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const [addMode, setAddMode] = useState<"code" | "username">("code");
  const [code, setCode] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [found, setFound] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [addError, setAddError] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);

  // Подтверждение удаления раскрывается в самой строке.
  const [removing, setRemoving] = useState<number | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchIdRef = useRef(0);

  const loadFriends = useCallback(async () => {
    setLoadingList(true);
    try {
      const [fr, tc] = await Promise.all([
        apiFetch("/api/connections/friends"),
        apiFetch("/api/connections/student/teachers"),
      ]);
      setFriends(Array.isArray(fr) ? fr : []);
      setTeachers(Array.isArray(tc) ? tc : []);
    } catch { /* список просто останется прежним */ }
    finally { setLoadingList(false); }
  }, []);

  useEffect(() => {
    if (visible) {
      loadFriends();
      pollerRef.current = setInterval(loadFriends, 30_000);
    } else if (pollerRef.current) {
      clearInterval(pollerRef.current);
      pollerRef.current = null;
    }
    return () => {
      if (pollerRef.current) { clearInterval(pollerRef.current); pollerRef.current = null; }
    };
  }, [visible, loadFriends]);

  const resetAddForm = () => { setCode(""); setUsernameInput(""); setFound(null); setAddError(""); };

  const handleCodeChange = async (raw: string) => {
    const t = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setCode(t);
    setFound(null);
    setAddError("");
    if (t.length !== 6) return;

    setSearching(true);
    try {
      const data = await apiFetch(`/api/connections/by-code/${t}`);
      if (data.role !== "student") setAddError("Это не ученик");
      else setFound(data);
    } catch {
      setAddError("Никого с таким кодом нет");
    } finally {
      setSearching(false);
    }
  };

  const handleUsernameSearch = async (raw: string) => {
    const val = raw.replace(/\s/g, "");
    setUsernameInput(val);
    setFound(null);
    setAddError("");
    if (val.length < 2) return;

    // Ответы приходят вразнобой: считается только последний запрос.
    const reqId = ++searchIdRef.current;
    setSearching(true);
    try {
      const data = await apiFetch(`/api/connections/by-username/${encodeURIComponent(val)}`);
      if (searchIdRef.current !== reqId) return;
      if (data.role !== "student") setAddError("Это не ученик");
      else setFound(data);
    } catch (e: any) {
      if (searchIdRef.current !== reqId) return;
      setAddError(e?.message || "Никого с таким псевдонимом нет");
    } finally {
      if (searchIdRef.current === reqId) setSearching(false);
    }
  };

  const sendRequest = async () => {
    if (!found) return;
    setSending(true);
    setAddError("");
    try {
      await apiFetch("/api/connections/friends/request", {
        method: "POST",
        body: JSON.stringify({ code: found.inviteCode ?? code }),
      });
      await loadFriends();
      setTab("list");
      resetAddForm();
    } catch (e: any) {
      setAddError(e.message ?? "Не удалось отправить запрос");
    } finally {
      setSending(false);
    }
  };

  const acceptRequest = async (id: number) => {
    await apiFetch(`/api/connections/friends/${id}/accept`, { method: "PATCH" });
    await loadFriends();
  };

  const dropFriendship = async (id: number) => {
    setRemoveBusy(true);
    try {
      await apiFetch(`/api/connections/friends/${id}`, { method: "DELETE" });
    } catch { /* убираем из списка в любом случае: связи уже нет */ }
    setFriends((prev) => prev.filter((f) => f.friendshipId !== id));
    setRemoving(null);
    setRemoveBusy(false);
  };

  const accepted = friends.filter((f) => f.status === "accepted");
  const incoming = friends.filter((f) => f.status === "pending" && f.direction === "received");
  const outgoing = friends.filter((f) => f.status === "pending" && f.direction === "sent");

  // Лидер задаёт масштаб шкал: доля считается от него, а не от абстрактной
  // сотни очков — иначе у всех полоски были бы одинаково пустыми.
  const topPoints = Math.max(1, ...accepted.map((f) => f.user.totalPoints ?? 0));
  const sortedFriends = [...accepted].sort(
    (a, b) => (b.user.totalPoints ?? 0) - (a.user.totalPoints ?? 0),
  );

  const total = accepted.length + teachers.length;
  const stickyBottom = 16 + insets.bottom;
  const scrollPad = stickyBottom + STICKY_H + STICKY_FADE;

  // Индекс для ступеньки появления: сквозной по всему списку.
  let rowIndex = -1;
  const nextIndex = () => ++rowIndex;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={{ flex: 1, backgroundColor: "#00000070", justifyContent: "flex-end" }} onPress={onClose}>
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
              paddingTop: 12, paddingHorizontal: 20,
              maxHeight: "88%",
            }}
          >
            <View style={{
              width: 42, height: 4, borderRadius: 2,
              backgroundColor: colors.border, alignSelf: "center",
            }} />

            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, paddingTop: 14, paddingBottom: 12 }}>
              <Text style={{ fontSize: 22, fontWeight: "900", letterSpacing: -0.5, color: colors.foreground }}>
                Друзья
              </Text>
              <Text style={{ fontSize: 15, fontWeight: "800", color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>
                {tab === "add"
                  ? "добавить"
                  : total === 0 ? "пока никого" : `${total} ${plural(total, ["человек", "человека", "человек"])}`}
              </Text>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: scrollPad }}
            >
              <Segmented
                options={[{ key: "list", label: "Мои связи" }, { key: "add", label: "Добавить" }]}
                value={tab}
                onChange={(k) => { setTab(k); setRemoving(null); }}
              />

              {tab === "list" ? (
                loadingList && friends.length === 0 && teachers.length === 0 ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : (
                  <>
                    {/* Входящие запросы наверху: это единственное, что требует
                        действия прямо сейчас. */}
                    {incoming.length > 0 && (
                      <>
                        <GroupLabel title="Хотят дружить" count={incoming.length} />
                        {incoming.map((f) => (
                          <View key={f.friendshipId} style={{ paddingBottom: EDGE, marginBottom: 9 }}>
                            <View style={{
                              position: "absolute", left: 0, right: 0, top: EDGE, bottom: 0,
                              borderRadius: radii.md, backgroundColor: accents.magenta + "44",
                            }} />
                            <View style={{
                              backgroundColor: accents.magenta + "12",
                              borderWidth: 1, borderColor: accents.magenta + "33",
                              borderRadius: radii.md, padding: 12,
                            }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
                                <AnimatedAvatar
                                  size={46}
                                  avatarColor={f.user.avatarColor ?? "#6366f1"}
                                  avatarEmoji={f.user.avatarEmoji}
                                  avatarUrl={f.user.avatarUrl}
                                />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>
                                    {f.user.name}
                                  </Text>
                                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground, marginTop: 2 }}>
                                    Входящий запрос на дружбу
                                  </Text>
                                </View>
                              </View>
                              <View style={{ flexDirection: "row", gap: 9, marginTop: 12 }}>
                                <ChunkyButton
                                  label="Принять" icon="check" center
                                  onPress={() => acceptRequest(f.friendshipId)}
                                  style={{ flex: 1 }}
                                />
                                <ChunkyButton
                                  label="Отклонить" tone="dark" center
                                  onPress={() => dropFriendship(f.friendshipId)}
                                  style={{ flex: 1 }}
                                />
                              </View>
                            </View>
                          </View>
                        ))}
                      </>
                    )}

                    {teachers.length > 0 && (
                      <>
                        <GroupLabel title={teachers.length > 1 ? "Учителя" : "Учитель"} />
                        {teachers.map((t) => (
                          <PersonRow
                            key={t.id}
                            index={nextIndex()}
                            name={t.name}
                            emoji={t.avatarEmoji}
                            color={t.avatarColor ?? "#6366f1"}
                            avatarUrl={t.avatarUrl}
                            online={t.isOnline}
                            note={t.isOnline ? "В сети" : `@${t.username}`}
                            pill="Учитель"
                            pillTone="tutor"
                            onPress={() => { onClose(); onOpenFriend(t.id); }}
                          />
                        ))}
                      </>
                    )}

                    {sortedFriends.length > 0 && (
                      <>
                        <GroupLabel title="Друзья" count={sortedFriends.length} />
                        {sortedFriends.map((f, i) => {
                          const pts = f.user.totalPoints ?? 0;
                          const note = pts > 0
                            ? `${pts.toLocaleString("ru-RU")} очков`
                            : "Ещё не начинал заниматься";
                          return (
                            <React.Fragment key={f.friendshipId}>
                              <PersonRow
                                index={nextIndex()}
                                name={f.user.name}
                                emoji={f.user.avatarEmoji}
                                color={f.user.avatarColor ?? "#6366f1"}
                                avatarUrl={f.user.avatarUrl}
                                online={f.user.isOnline}
                                note={f.user.isOnline ? `${note} · в сети` : note}
                                points={pts}
                                ratio={pts / topPoints}
                                leader={i === 0 && pts > 0}
                                pill={i === 0 && pts > 0 ? "1 место" : undefined}
                                onPress={() => { onClose(); onOpenFriend(f.user.id); }}
                                onRemove={() => setRemoving(
                                  removing === f.friendshipId ? null : f.friendshipId,
                                )}
                              />
                              {removing === f.friendshipId && (
                                <RemoveConfirm
                                  name={f.user.name}
                                  busy={removeBusy}
                                  onKeep={() => setRemoving(null)}
                                  onDrop={() => dropFriendship(f.friendshipId)}
                                />
                              )}
                            </React.Fragment>
                          );
                        })}
                      </>
                    )}

                    {outgoing.length > 0 && (
                      <>
                        <GroupLabel title="Ждут ответа" count={outgoing.length} />
                        {outgoing.map((f) => (
                          <View key={f.friendshipId} style={{ opacity: 0.62 }}>
                            <PersonRow
                              index={nextIndex()}
                              name={f.user.name}
                              emoji={f.user.avatarEmoji}
                              color={f.user.avatarColor ?? "#6366f1"}
                              avatarUrl={f.user.avatarUrl}
                              note="Запрос отправлен"
                            />
                          </View>
                        ))}
                      </>
                    )}

                    {/* Пусто: экран объясняет обмен кодами, а не сообщает,
                        что друзей нет. */}
                    {accepted.length === 0 && teachers.length === 0 && incoming.length === 0 && (
                      <View style={{ alignItems: "center", paddingTop: 30, paddingBottom: 8 }}>
                        <View style={{
                          width: 74, height: 74, borderRadius: 26, marginBottom: 16,
                          backgroundColor: colors.primary + "14",
                          alignItems: "center", justifyContent: "center",
                        }}>
                          <Glyph name="handshake" size={34} color={colors.primary} />
                        </View>
                        <Text style={{ fontSize: 18, fontWeight: "900", letterSpacing: -0.3, color: colors.foreground }}>
                          Здесь пока пусто
                        </Text>
                        <Text style={{
                          fontSize: 13.5, fontWeight: "700", color: colors.mutedForeground,
                          textAlign: "center", marginTop: 7, maxWidth: 260, lineHeight: 19,
                        }}>
                          С друзьями видно, кто сколько занимался, и догонять веселее.
                        </Text>

                        <View style={{ alignSelf: "stretch", marginTop: 22, gap: 11 }}>
                          {[
                            "Открой «Добавить» и скопируй свой код",
                            "Отправь его другу любым мессенджером",
                            "Он введёт код у себя, ты подтвердишь запрос",
                          ].map((step, i) => (
                            <View key={step} style={{ flexDirection: "row", gap: 11, alignItems: "flex-start" }}>
                              <View style={{
                                width: 25, height: 25, borderRadius: 9,
                                backgroundColor: colors.primary,
                                alignItems: "center", justifyContent: "center",
                              }}>
                                <Text style={{ fontSize: 13, fontWeight: "900", color: "#fff" }}>{i + 1}</Text>
                              </View>
                              <Text style={{
                                flex: 1, fontSize: 13, fontWeight: "700",
                                color: colors.mutedForeground, lineHeight: 19,
                              }}>
                                {step}
                              </Text>
                            </View>
                          ))}
                        </View>

                        <ChunkyButton
                          label="Добавить друга"
                          icon="userPlus"
                          onPress={() => setTab("add")}
                          style={{ alignSelf: "stretch", marginTop: 20 }}
                        />
                      </View>
                    )}
                  </>
                )
              ) : (
                <>
                  {/* Свой код и поиск чужого — одна задача: поменяться кодами. */}
                  {!!inviteCode && (
                    <View style={{ paddingBottom: 5, marginTop: 4 }}>
                      <View style={{
                        position: "absolute", left: 0, right: 0, top: 5, bottom: 0,
                        borderRadius: radii.md, backgroundColor: "#c9bdf0",
                      }} />
                      <View style={{
                        backgroundColor: colors.primary + "0e",
                        borderWidth: 1, borderColor: colors.primary + "2b",
                        borderRadius: radii.md, padding: 16,
                      }}>
                        <Text style={{
                          fontSize: 10, fontWeight: "900", letterSpacing: 1.2,
                          textTransform: "uppercase", color: colors.primary,
                        }}>
                          Мой код
                        </Text>
                        <Text style={{
                          fontSize: 30, fontWeight: "900", letterSpacing: 6, marginTop: 6,
                          color: colors.foreground, fontVariant: ["tabular-nums"],
                        }}>
                          {inviteCode}
                        </Text>
                        <Text style={{
                          fontSize: 12.5, fontWeight: "700", color: colors.mutedForeground,
                          marginTop: 4, maxWidth: 220, lineHeight: 17,
                        }}>
                          Назови его другу, учителю или родителю, чтобы они нашли тебя.
                        </Text>

                        <Pressable
                          onPress={() => {
                            Clipboard.setString(inviteCode ?? "");
                            setCodeCopied(true);
                            setTimeout(() => setCodeCopied(false), 1800);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Скопировать код"
                          style={({ pressed }) => ({
                            position: "absolute", top: 14, right: 14,
                            flexDirection: "row", alignItems: "center", gap: 6,
                            backgroundColor: codeCopied ? colors.success : colors.primary,
                            borderRadius: 13, paddingHorizontal: 13, paddingVertical: 9,
                            opacity: pressed ? 0.85 : 1,
                          })}
                        >
                          <Glyph name={codeCopied ? "check" : "copy"} size={15} color="#fff" />
                          <Text style={{ fontSize: 13, fontWeight: "900", color: "#fff" }}>
                            {codeCopied ? "Готово" : "Копировать"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  <GroupLabel title="Найти человека" />

                  <Segmented
                    options={[{ key: "code", label: "По коду" }, { key: "username", label: "По имени" }]}
                    value={addMode}
                    onChange={(m) => { setAddMode(m); resetAddForm(); }}
                    style={{ marginBottom: 14 }}
                  />

                  {/* Подписи «поиск произойдёт автоматически» нет: он и так
                      идёт сам, а объяснять очевидное — шум. */}
                  <View style={{ position: "relative", marginBottom: 4 }}>
                    <TextInput
                      style={{
                        backgroundColor: colors.muted,
                        borderRadius: radii.sm + 2, borderWidth: 1.5,
                        borderColor: addError
                          ? colors.destructive
                          : found ? colors.primary : colors.border,
                        paddingHorizontal: 16, paddingVertical: addMode === "code" ? 16 : 14,
                        color: colors.foreground,
                        ...(addMode === "code"
                          ? {
                              fontSize: 26, fontWeight: "900", letterSpacing: 8,
                              textAlign: "center", textTransform: "uppercase",
                            }
                          : { fontSize: 16, fontWeight: "700" }),
                      }}
                      placeholder={addMode === "code" ? "_ _ _ _ _ _" : "@псевдоним"}
                      placeholderTextColor={colors.mutedForeground + "80"}
                      value={addMode === "code" ? code : usernameInput}
                      onChangeText={addMode === "code" ? handleCodeChange : handleUsernameSearch}
                      maxLength={addMode === "code" ? 6 : undefined}
                      autoCapitalize={addMode === "code" ? "characters" : "none"}
                      autoCorrect={false}
                    />
                    {searching && (
                      <View style={{ position: "absolute", right: 16, top: 0, bottom: 0, justifyContent: "center" }}>
                        <ActivityIndicator color={colors.primary} size="small" />
                      </View>
                    )}
                  </View>

                  {!!addError && (
                    <View style={{
                      flexDirection: "row", alignItems: "center", gap: 9, marginTop: 10,
                      backgroundColor: colors.destructive + "12",
                      borderWidth: 1, borderColor: colors.destructive + "33",
                      borderRadius: radii.sm, padding: 12,
                    }}>
                      <Glyph name="alert" size={16} color={colors.destructive} />
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: colors.destructive }}>
                        {addError}
                      </Text>
                    </View>
                  )}

                  {found && (
                    <View style={{ paddingBottom: 5, marginTop: 14 }}>
                      <View style={{
                        position: "absolute", left: 0, right: 0, top: 5, bottom: 0,
                        borderRadius: radii.md, backgroundColor: colors.border,
                      }} />
                      <View style={{
                        backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                        borderRadius: radii.md, padding: 16,
                      }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                          <AnimatedAvatar
                            size={54}
                            avatarColor={found.avatarColor ?? "#6366f1"}
                            avatarEmoji={found.avatarEmoji}
                            avatarUrl={found.avatarUrl}
                          />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: "900", letterSpacing: -0.3, color: colors.foreground }}>
                              {found.name}
                            </Text>
                            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "700", color: colors.mutedForeground }}>
                              @{found.username}
                            </Text>
                          </View>
                        </View>

                        {sending ? (
                          <View style={{ paddingVertical: 18, alignItems: "center" }}>
                            <ActivityIndicator color={colors.primary} />
                          </View>
                        ) : (
                          <ChunkyButton
                            label="Отправить запрос"
                            icon="userPlus"
                            center
                            onPress={sendRequest}
                            style={{ marginTop: 13 }}
                          />
                        )}
                      </View>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            {/* Затухание под кнопкой: содержимое уезжает не обрывом. */}
            <LinearGradient
              pointerEvents="none"
              colors={[colors.card + "00", colors.card]}
              style={{
                position: "absolute", left: 0, right: 0,
                bottom: stickyBottom + STICKY_H - 6, height: STICKY_FADE + 6,
              }}
            />

            <View style={{ position: "absolute", left: 20, right: 20, bottom: stickyBottom }}>
              <ChunkyButton label="Закрыть" tone="dark" center onPress={onClose} />
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default FriendsSheet;
