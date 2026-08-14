// Список учеников (для учителя) или детей (для родителя).
//
// Раньше карточка показывала имя, уровень и число очков — по ней нельзя было
// понять ни как ученик учится, ни когда он последний раз заходил, ни что с ним
// делать. Теперь на карточке средний балл полосой, последняя активность
// словами и два действия: назначить задание и написать. Данные для этого уже
// были на сервере (lastSeenAt, category-stats), просто не показывались.
//
// Эмодзи в интерфейсе не используются: в пустых состояниях и на экране ошибки
// вместо них глифы из своего набора. Аватары пользователей это отдельная
// история — там avatarEmoji приходит из профиля и остаётся как есть, его
// рисует AnimatedAvatar.
//
// Оформление собрано из GameKit и сдержаннее ученических экранов: экран
// рабочий, здесь важнее скорость чтения списка, а не игровые эффекты.
// Наклоны убраны — как на «Заданиях» и «Анализе».
//
// ── Точка непрочитанного на кнопке «Написать» ───────────────────────────────
// «Написать» — самый частый вход в чат с учеником. Раньше здесь не было
// никакого признака нового сообщения; теперь на кнопке загорается точка, если
// этот ученик написал что-то, чего учитель ещё не открывал — тот же
// MessagesBadgeContext, что и в «Друзьях» (теперь в Профиле, см. profile.tsx).
//
// ── Явный адрес возврата из чата ─────────────────────────────────────────────
// Чат и этот экран лежат как плоские скрытые «вкладки-соседи» одного и того же
// Tabs-навигатора (см. _layout.tsx), а не как вложенный стек — у router.back()
// между такими соседями нет настоящей истории, и он надёжно приземляется на
// первый объявленный таб («Задания»), а не туда, откуда реально пришли.
// Поэтому кнопка «Написать» передаёт явный адрес возврата параметром — тот же
// приём, что и в friends.tsx и components/FriendsSheet.tsx.
import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, Platform,
  ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, RefreshControl,
} from "react-native";
import ConfirmModal from "@/components/ConfirmModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import authStorage from "@/utils/authStorage";
import { useRouter, useFocusEffect } from "expo-router";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, Pill, SectionLabel } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import { formatDue } from "@/utils/dueDate";
import { overallScore, type CategoryStat } from "@/utils/insights";
import { useMessagesBadge } from "@/contexts/MessagesBadgeContext";

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

type PersonItem = {
  id: number;
  name: string;
  surname?: string | null;
  username: string;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarUrl?: string | null;
  knowledgeLevel: string | null;
  totalPoints: number;
  inviteCode: string | null;
  isOnline?: boolean;
  lastSeenAt?: string | null;
};

/** Что подгружается к ученику отдельно: успеваемость и просрочки. */
type PersonExtras = {
  /** Средний балл по всем видам работ. null — работ ещё нет. */
  score: number | null;
  /** Работ на проверке у этого ученика. */
  pending: number;
  /** Просроченных назначений. */
  overdue: number;
};

/** Два аргумента одной календарной даты (без времени), для сравнения дней. */
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * «Был в сети» словами. Показывает ТОЧНОЕ время последнего появления
 * («сегодня в 14:32», «вчера в 09:05», «3 мар в 21:40»), а не прикидку в днях:
 * учителю важно знать, стоит ли писать именно сейчас, и точное время отвечает
 * на этот вопрос лучше, чем «был 3 дня назад».
 *
 * «Ещё не заходил» — честный ответ только для аккаунта, у которого lastSeenAt
 * в принципе никогда не проставлялся. Раньше это сообщение ошибочно показывали
 * и активным ученикам сразу после выхода из приложения: POST /users/offline на
 * сервере обнулял lastSeenAt при каждом логауте — исправлено там же.
 */
function lastSeenText(lastSeenAt: string | null | undefined, isOnline: boolean | undefined): string {
  if (isOnline) return "в сети";
  if (!lastSeenAt) return "ещё не заходил";
  const seen = new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) return "ещё не заходил";

  const now = new Date();
  const time = seen.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (sameDay(seen, now)) return `был сегодня в ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(seen, yesterday)) return `был вчера в ${time}`;

  const dateLabel = seen.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    ...(seen.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
  return `был ${dateLabel} в ${time}`;
}

/** Дней с последнего захода. null — неизвестно. */
function daysSinceSeen(lastSeenAt: string | null | undefined): number | null {
  if (!lastSeenAt) return null;
  const seen = new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) return null;
  return Math.floor((Date.now() - seen.getTime()) / 86400000);
}

function UserCard({
  item, extras, onRemove, onPress, onAssign, onMessage, colors, showActions, unread,
}: {
  item: PersonItem;
  extras: PersonExtras | undefined;
  onRemove: () => void;
  onPress: () => void;
  onAssign: () => void;
  onMessage: () => void;
  colors: any;
  /** У родителя действий учителя нет — только просмотр. */
  showActions: boolean;
  /** Есть непрочитанные от этого ученика — точка на кнопке «Написать». */
  unread: boolean;
}) {
  const score = extras?.score ?? null;
  const quiet = (daysSinceSeen(item.lastSeenAt) ?? 0) >= 7 && !item.isOnline;
  // Цвет балла в фирменной гамме: зелёного в палитре нет намеренно.
  const tint = score === null ? colors.mutedForeground
    : score >= 70 ? colors.success
      : score >= 50 ? accents.amber
        : colors.destructive;

  return (
    <View
      style={{
        backgroundColor: colors.card, borderRadius: radii.md, padding: 14,
        borderWidth: 1, borderColor: colors.border, marginBottom: 11,
        // Цветная тень вместо серой — как на остальных экранах.
        shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12, shadowRadius: 13, elevation: 3,
      }}
    >
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={onPress}
        style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
      >
        <View style={{ width: 50, height: 50 }}>
          <AnimatedAvatar
            size={50}
            avatarColor={item.avatarColor ?? "#6366f1"}
            avatarEmoji={item.avatarEmoji}
            avatarUrl={item.avatarUrl}
          />
          {item.isOnline && (
            // Зелёного в палитре нет: «в сети» тоже фиолетовый success.
            <View style={{
              position: "absolute", bottom: -1, right: -1,
              width: 15, height: 15, borderRadius: 8,
              backgroundColor: colors.success,
              borderWidth: 2.5, borderColor: colors.card,
            }} />
          )}
        </View>

        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>
            {item.username}
          </Text>
          <Text style={{ fontSize: 12, color: colors.mutedForeground }} numberOfLines={1}>
            {[item.name, item.surname].filter(Boolean).join(" ") || "без имени"}
            {" · "}{lastSeenText(item.lastSeenAt, item.isOnline)}
          </Text>
        </View>

        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <View style={{ flexDirection: "row", gap: 5 }}>
            {!!item.knowledgeLevel && <Pill text={item.knowledgeLevel} tone="soft" color={colors.primary} />}
            <Pill text={`${item.totalPoints}`} icon="star" tone="gold" />
          </View>
          {/* Средний балл словами и цифрой: без него список — просто имена. */}
          <Text style={{ fontSize: 11.5, color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>
            {score === null
              ? "работ нет"
              : <>средний <Text style={{ fontWeight: "900", color: tint }}>{score}%</Text></>}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Полоса успеваемости: сравнивать учеников глазами по числам медленно,
          по полосам — мгновенно. */}
      {score !== null && (
        <View style={{ height: 8, backgroundColor: colors.muted, borderRadius: 4, marginTop: 11, overflow: "hidden" }}>
          <View style={{ height: 8, width: `${score}%` as any, backgroundColor: tint, borderRadius: 4 }} />
        </View>
      )}

      {/* Что требует внимания прямо сейчас. */}
      {(extras?.overdue || extras?.pending || quiet) ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 11 }}>
          {!!extras?.overdue && <Pill text={`просрочено ${extras.overdue}`} icon="alert" tone="danger" />}
          {!!extras?.pending && <Pill text={`${extras.pending} на проверке`} icon="clock" tone="warn" />}
          {quiet && <Pill text="давно не заходил" tone="soft" color={colors.mutedForeground} />}
        </View>
      ) : null}

      {showActions && (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onAssign}
            style={{
              flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
              paddingVertical: 10, borderRadius: 12, backgroundColor: colors.primary,
              shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3, shadowRadius: 10, elevation: 3,
            }}
          >
            <Glyph name="send" size={14} color="#fff" />
            <Text style={{ fontSize: 13, fontWeight: "800", color: "#fff" }}>Задание</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onMessage}
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                paddingVertical: 10, borderRadius: 12,
                borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
              }}
            >
              <Glyph name="chat" size={14} color={colors.mutedForeground} />
              <Text style={{ fontSize: 13, fontWeight: "800", color: colors.mutedForeground }}>Написать</Text>
            </TouchableOpacity>
            {/* Точка непрочитанного — см. заголовок файла. */}
            {unread && (
              <View style={{
                position: "absolute", top: -3, right: -3,
                width: 12, height: 12, borderRadius: 6,
                backgroundColor: "#e11d48",
                borderWidth: 2, borderColor: colors.card,
              }} />
            )}
          </View>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel="Убрать ученика"
            style={{
              paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
              borderWidth: 1, borderColor: colors.destructive + "44",
              backgroundColor: colors.destructive + "0d",
              alignItems: "center", justifyContent: "center",
            }}
          >
            <Glyph name="userX" size={15} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function AddByCodeModal({
  visible, onClose, onAdded, endpoint, title,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: (item: PersonItem) => void;
  endpoint: string;
  title: string;
}) {
  const colors = useColors();
  const [mode, setMode] = useState<"code" | "username">("code");
  const [code, setCode] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [found, setFound] = useState<any>(null);

  const reset = () => { setCode(""); setUsernameInput(""); setFound(null); setError(""); };

  // Auto-search when exactly 6 chars entered (invite code)
  const handleCodeChange = async (raw: string) => {
    const t = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setCode(t);
    setFound(null);
    setError("");

    if (t.length === 6) {
      setSearching(true);
      try {
        const data = await apiFetch(`/api/connections/by-code/${t}`);
        if (data.role !== "student") {
          setError("Этот пользователь не является учеником");
        } else {
          setFound(data);
        }
      } catch {
        setError("Пользователь с таким кодом не найден");
      } finally {
        setSearching(false);
      }
    }
  };

  // Search by username on button press
  const handleUsernameSearch = async () => {
    const q = usernameInput.trim().toLowerCase();
    if (!q) return;
    setFound(null);
    setError("");
    setSearching(true);
    try {
      const data = await apiFetch(`/api/connections/by-username/${encodeURIComponent(q)}`);
      if (data.role !== "student") {
        setError("Этот пользователь не является учеником");
      } else {
        setFound(data);
      }
    } catch {
      setError("Пользователь с таким псевдонимом не найден");
    } finally {
      setSearching(false);
    }
  };

  const confirm = async () => {
    if (!found) return;
    setConfirming(true); setError("");
    try {
      const result = await apiFetch(endpoint, {
        method: "POST", body: JSON.stringify({ code: found.inviteCode }),
      });
      onAdded(result);
      reset(); onClose();
    } catch (e: any) {
      setError(e.message ?? "Ошибка добавления");
    } finally { setConfirming(false); }
  };

  const codeBorderColor = error && mode === "code" ? colors.destructive : found && mode === "code" ? colors.primary : colors.border;
  const usernameBorderColor = error && mode === "username" ? colors.destructive : found && mode === "username" ? colors.primary : colors.border;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { onClose(); reset(); }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={{ flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: 24 }}>
          <Text style={{ fontSize: 21, fontWeight: "900", letterSpacing: -0.4, color: colors.foreground, marginBottom: 16 }}>
            {title}
          </Text>

          {/* Mode switcher */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
            {(["code", "username"] as const).map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => { setMode(m); setFound(null); setError(""); }}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: radii.sm, alignItems: "center",
                  backgroundColor: mode === m ? colors.primary + "18" : colors.muted,
                  borderWidth: 1.5, borderColor: mode === m ? colors.primary : "transparent",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "800", color: mode === m ? colors.primary : colors.mutedForeground }}>
                  {m === "code" ? "По коду" : "По псевдониму"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Code input */}
          {mode === "code" && (
            <>
              <View style={{ position: "relative", marginBottom: 6 }}>
                <TextInput
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: radii.sm + 2, borderWidth: 2, borderColor: codeBorderColor,
                    paddingHorizontal: 16, paddingVertical: 16,
                    fontSize: 28, fontWeight: "900", letterSpacing: 8,
                    color: colors.foreground, textTransform: "uppercase", textAlign: "center",
                  }}
                  placeholder="_ _ _ _ _ _"
                  placeholderTextColor={colors.mutedForeground + "80"}
                  value={code}
                  onChangeText={handleCodeChange}
                  maxLength={6}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoFocus
                />
                {searching && (
                  <View style={{ position: "absolute", right: 16, top: 0, bottom: 0, justifyContent: "center" }}>
                    <ActivityIndicator color={colors.primary} size="small" />
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center", marginBottom: 16 }}>
                Ученик найдёт свой код в разделе «Профиль» · поиск автоматически
              </Text>
            </>
          )}

          {/* Username input */}
          {mode === "username" && (
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              <View style={{
                flex: 1, flexDirection: "row", alignItems: "center",
                backgroundColor: colors.card, borderRadius: radii.sm + 2, borderWidth: 2,
                borderColor: usernameBorderColor, paddingHorizontal: 14,
              }}>
                <Text style={{ fontSize: 16, color: colors.mutedForeground, marginRight: 4 }}>@</Text>
                <TextInput
                  style={{ flex: 1, fontSize: 16, color: colors.foreground, paddingVertical: 14 }}
                  placeholder="псевдоним"
                  placeholderTextColor={colors.mutedForeground + "80"}
                  value={usernameInput}
                  onChangeText={(t) => { setUsernameInput(t); setFound(null); setError(""); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  onSubmitEditing={handleUsernameSearch}
                  returnKeyType="search"
                />
              </View>
              <TouchableOpacity
                onPress={handleUsernameSearch}
                disabled={searching || !usernameInput.trim()}
                accessibilityRole="button"
                accessibilityLabel="Найти"
                style={{
                  backgroundColor: colors.primary, borderRadius: radii.sm + 2,
                  paddingHorizontal: 16, justifyContent: "center", alignItems: "center",
                  opacity: searching || !usernameInput.trim() ? 0.5 : 1,
                }}
              >
                {searching
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Glyph name="search" size={20} color="#fff" />
                }
              </TouchableOpacity>
            </View>
          )}

          {/* Error */}
          {!!error && (
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 9,
              backgroundColor: colors.destructive + "12", borderRadius: radii.sm, padding: 12, marginBottom: 14,
              borderWidth: 1, borderColor: colors.destructive + "44",
            }}>
              <Glyph name="alert" size={16} color={colors.destructive} />
              <Text style={{ color: colors.destructive, fontSize: 13, flex: 1 }}>{error}</Text>
            </View>
          )}

          {/* Found user card */}
          {found && (
            <View style={{
              backgroundColor: colors.primary + "12", borderRadius: radii.sm + 2, padding: 14,
              borderWidth: 1.5, borderColor: colors.primary + "40",
              flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14,
            }}>
              <AnimatedAvatar
                size={52}
                avatarColor={found.avatarColor ?? "#6366f1"}
                avatarEmoji={found.avatarEmoji}
                avatarUrl={found.avatarUrl}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "900", color: accents.indigoDeep }}>
                  {found.username}{found.name || found.surname ? ` (${[found.name, found.surname].filter(Boolean).join(" ")})` : ""}
                </Text>
              </View>
              <Glyph name="check" size={26} color={colors.primary} />
            </View>
          )}

          {/* Confirm button — only shown after user found */}
          {found && (
            confirming ? (
              <View style={{ paddingVertical: 18, alignItems: "center" }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <ChunkyButton label="Подтвердить" icon="userPlus" onPress={confirm} />
            )
          )}

          <TouchableOpacity
            onPress={() => { onClose(); reset(); }}
            style={{ paddingVertical: 12, alignItems: "center" }}
          >
            <Text style={{ fontSize: 15, color: colors.mutedForeground }}>Отмена</Text>
          </TouchableOpacity>
        </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type PendingRequest = {
  requestId: number;
  student: PersonItem;
  status: "pending";
};

/** Фильтры появляются только когда список длинный — иначе он и так весь виден. */
type ListFilter = "all" | "help" | "quiet" | "online";
const FILTER_LABELS: Record<ListFilter, string> = {
  all: "Все",
  help: "Нужна помощь",
  quiet: "Молчат",
  online: "В сети",
};
const FILTERS_FROM = 5;

export default function StudentsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { unreadByUser, refresh: refreshUnread } = useMessagesBadge();

  const isTeacher = isTeacherOrAdmin(user?.role ?? "");
  const isParent = user?.role === "parent";

  const [items, setItems] = useState<PersonItem[]>([]);
  const [extras, setExtras] = useState<Record<number, PersonExtras>>({});
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<PersonItem | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<PendingRequest | null>(null);
  const [filter, setFilter] = useState<ListFilter>("all");
  const [search, setSearch] = useState("");

  const listEndpoint = isTeacher
    ? "/api/connections/teacher/students"
    : "/api/connections/parent/children";
  const addEndpoint = isTeacher
    ? "/api/connections/teacher/add-student"
    : "/api/connections/parent/add-child";
  const deleteEndpoint = (id: number) =>
    isTeacher
      ? `/api/connections/teacher/students/${id}`
      : `/api/connections/parent/children/${id}`;

  /**
   * Успеваемость и просрочки грузятся отдельно и НЕ блокируют список: имена
   * и аватары появляются сразу, полосы дорисовываются через мгновение.
   * Раньше карточка вообще не показывала успеваемость, хотя данные лежали
   * в тех же эндпоинтах, что использует «Анализ».
   */
  const loadExtras = React.useCallback(async (people: PersonItem[]) => {
    if (!isTeacher || people.length === 0) return;

    let overdueBy = new Map<number, number>();
    try {
      const results: any[] = await apiFetch("/api/assignments/teacher-results");
      overdueBy = results.reduce((acc: Map<number, number>, r: any) => {
        if (r.submission) return acc;
        if (formatDue(r.dueAt).urgency !== "overdue") return acc;
        acc.set(r.studentId, (acc.get(r.studentId) ?? 0) + 1);
        return acc;
      }, new Map<number, number>());
    } catch {
      // Без этих данных карточка просто не покажет метку просрочки.
    }

    const pairs = await Promise.all(people.map(async (p) => {
      try {
        const stats: CategoryStat[] = await apiFetch(`/api/students/${p.id}/category-stats`);
        const pending = (stats ?? []).reduce((sum, s) => sum + (s.pending ?? 0), 0);
        return [p.id, {
          score: overallScore(stats ?? []),
          pending,
          overdue: overdueBy.get(p.id) ?? 0,
        }] as const;
      } catch {
        return [p.id, { score: null, pending: 0, overdue: overdueBy.get(p.id) ?? 0 }] as const;
      }
    }));

    setExtras(Object.fromEntries(pairs));
  }, [isTeacher]);

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [accepted, pending] = await Promise.all([
        apiFetch(listEndpoint),
        isTeacher ? apiFetch("/api/connections/teacher/pending") : Promise.resolve([]),
      ]);
      setItems(accepted);
      setPendingRequests(pending);
      void loadExtras(accepted);
    } catch (e: any) {
      setError(e.message ?? "Не удалось загрузить");
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [listEndpoint, isTeacher, loadExtras]);

  React.useEffect(() => { load(); }, [load]);
  // Возврат на вкладку обновляет цифры молча: список уже на экране, мигать им
  // спиннером незачем. Заодно просим значок непрочитанных обновиться сразу —
  // полезно, если учитель только что вышел из чата с одним из учеников.
  useFocusEffect(React.useCallback(() => { load(true); refreshUnread(); }, [load, refreshUnread]));

  const doRemove = async (item: PersonItem) => {
    try {
      await apiFetch(deleteEndpoint(item.id), { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch { /* silent */ } finally {
      setConfirmRemove(null);
    }
  };

  const doCancel = async (req: PendingRequest) => {
    try {
      await apiFetch(`/api/connections/teacher/students/${req.student.id}`, { method: "DELETE" });
      setPendingRequests((prev) => prev.filter((r) => r.requestId !== req.requestId));
    } catch { /* silent */ } finally {
      setConfirmCancel(null);
    }
  };

  const handleRemove = (item: PersonItem) => setConfirmRemove(item);
  const handleCancelRequest = (req: PendingRequest) => setConfirmCancel(req);

  const title = isTeacher ? "Мои ученики" : "Мои дети";
  const addTitle = isTeacher ? "Добавить ученика" : "Добавить ребёнка";

  // ── Сводка и фильтрация ───────────────────────────────────────────
  const quietCount = items.filter(
    (i) => !i.isOnline && (daysSinceSeen(i.lastSeenAt) ?? 0) >= 7,
  ).length;
  const needHelp = items.filter((i) => {
    const score = extras[i.id]?.score;
    return score !== null && score !== undefined && score < 60;
  }).length;

  const searchLower = search.trim().toLowerCase();
  const visible = items.filter((i) => {
    if (searchLower) {
      const haystack = `${i.username} ${i.name ?? ""} ${i.surname ?? ""}`.toLowerCase();
      if (!haystack.includes(searchLower)) return false;
    }
    if (filter === "help") {
      const score = extras[i.id]?.score;
      return score !== null && score !== undefined && score < 60;
    }
    if (filter === "quiet") return !i.isOnline && (daysSinceSeen(i.lastSeenAt) ?? 0) >= 7;
    if (filter === "online") return !!i.isOnline;
    return true;
  });

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 12,
    },
    headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
    titleText: { fontSize: 28, fontWeight: "900", letterSpacing: -0.6, color: colors.foreground },
    subtitleText: { fontSize: 13.5, color: colors.mutedForeground, marginTop: 4, lineHeight: 19 },
    addBtn: {
      backgroundColor: colors.primary, borderRadius: radii.sm + 2,
      paddingHorizontal: 14, paddingVertical: 11,
      flexDirection: "row", alignItems: "center", gap: 7,
      // Кнопка светится своим цветом — читается как активное действие.
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.32, shadowRadius: 10, elevation: 4,
    },
    addBtnText: { fontSize: 14, fontWeight: "800", color: "#fff" },
    // Лента из трёх чисел одной поверхностью, как на «Анализе»: это одна мысль,
    // а не три отдельные карточки.
    strip: {
      flexDirection: "row", backgroundColor: colors.card,
      borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
      overflow: "hidden", marginTop: 14,
      shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.13, shadowRadius: 15, elevation: 3,
    },
    stripCell: { flex: 1, paddingVertical: 13, paddingHorizontal: 8, alignItems: "center" },
    stripDivider: { width: 1, backgroundColor: colors.border },
    stripNum: { fontSize: 21, fontWeight: "900", letterSpacing: -0.5, fontVariant: ["tabular-nums"], color: colors.foreground },
    stripLabel: {
      fontSize: 10, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase",
      color: colors.mutedForeground, marginTop: 6,
    },
    searchBox: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: colors.muted, borderRadius: radii.sm, paddingHorizontal: 12,
      paddingVertical: Platform.OS === "web" ? 9 : 8, marginTop: 12,
      borderWidth: 1, borderColor: colors.border,
    },
    searchInput: {
      flex: 1, fontSize: 14, color: colors.foreground,
      ...(Platform.OS === "web" ? { outlineWidth: 0 } as any : {}),
    },
    chips: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
    chip: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: radii.pill,
      borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card,
    },
    chipActive: {
      borderColor: colors.primary, backgroundColor: colors.secondary,
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25, shadowRadius: 8, elevation: 3,
    },
    chipText: { fontSize: 12.5, fontWeight: "700", color: colors.mutedForeground },
    chipTextActive: { color: colors.primary },
    content: { paddingHorizontal: 20, paddingBottom: insets.bottom + 100 },
    empty: { alignItems: "center", paddingTop: 60, gap: 12, paddingHorizontal: 24 },
    // Плашка вместо крупного эмодзи. Стоит ровно: наклоны убраны по всему проекту.
    emptyIcon: {
      width: 72, height: 72, borderRadius: radii.lg, justifyContent: "center", alignItems: "center",
      backgroundColor: colors.primary + "14", borderWidth: 1, borderColor: colors.primary + "2e",
    },
    emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.foreground },
    emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
  });

  return (
    <View style={s.container}>
      <AddByCodeModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdded={(item) => setItems((prev) => [...prev, item])}
        endpoint={addEndpoint}
        title={addTitle}
      />

      <View style={s.header}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.titleText}>{title}</Text>
            {/* Подзаголовок отвечает на вопрос «что здесь требует меня», а не
                просто считает строки. */}
            <Text style={s.subtitleText}>
              {items.length === 0 && pendingRequests.length === 0
                ? "Список пуст"
                : pendingRequests.length > 0
                  ? `${pendingRequests.length} ${pendingRequests.length === 1 ? "заявка ждёт" : "заявки ждут"} ответа ученика`
                  : needHelp > 0
                    ? `${needHelp} ${needHelp === 1 ? "ученику" : "ученикам"} нужна помощь`
                    : "Все идут ровно"}
            </Text>
          </View>
          <TouchableOpacity style={s.addBtn} onPress={() => setModalOpen(true)} activeOpacity={0.85}>
            <Glyph name="userPlus" size={16} color="#fff" />
            <Text style={s.addBtnText}>Добавить</Text>
          </TouchableOpacity>
        </View>

        {isTeacher && (items.length > 0 || pendingRequests.length > 0) && (
          <View style={s.strip}>
            <View style={s.stripCell}>
              <Text style={s.stripNum}>{items.length}</Text>
              <Text style={s.stripLabel}>Учеников</Text>
            </View>
            <View style={s.stripDivider} />
            <View style={s.stripCell}>
              <Text style={[s.stripNum, pendingRequests.length > 0 && { color: accents.magenta }]}>
                {pendingRequests.length}
              </Text>
              <Text style={s.stripLabel}>Заявок</Text>
            </View>
            <View style={s.stripDivider} />
            <View style={s.stripCell}>
              <Text style={[s.stripNum, quietCount > 0 && { color: colors.destructive }]}>
                {quietCount}
              </Text>
              <Text style={s.stripLabel}>Молчат</Text>
            </View>
          </View>
        )}

        {/* Поиск и фильтры — только на длинном списке. */}
        {items.length >= FILTERS_FROM && (
          <>
            <View style={s.searchBox}>
              <Glyph name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                style={s.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Имя или псевдоним"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch("")} hitSlop={8}>
                  <Glyph name="close" size={16} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>
            <View style={s.chips}>
              {(Object.keys(FILTER_LABELS) as ListFilter[]).map((key) => (
                <TouchableOpacity
                  key={key}
                  activeOpacity={0.85}
                  onPress={() => setFilter(key)}
                  style={[s.chip, filter === key && s.chipActive]}
                >
                  <Text style={[s.chipText, filter === key && s.chipTextActive]}>
                    {FILTER_LABELS[key]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
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
            onPress={() => load()}
            style={{ marginTop: 12, backgroundColor: colors.primary, borderRadius: radii.sm, paddingHorizontal: 20, paddingVertical: 11 }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
            />
          }
        >
          {/* Pending requests (teacher only) */}
          {isTeacher && pendingRequests.length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <SectionLabel>Ожидают подтверждения · {pendingRequests.length}</SectionLabel>
              {pendingRequests.map((req) => (
                // Пунктирная рамка и другая заливка: заявку нельзя спутать с
                // добавленным учеником, даже не читая подпись.
                <View key={req.requestId} style={{
                  flexDirection: "row", alignItems: "center", gap: 12,
                  backgroundColor: accents.magenta + "0f", borderRadius: radii.md, padding: 14,
                  borderWidth: 1.5, borderColor: accents.magenta + "44", borderStyle: "dashed",
                  marginBottom: 9,
                }}>
                  <AnimatedAvatar
                    size={46}
                    avatarColor={req.student.avatarColor ?? "#6366f1"}
                    avatarEmoji={req.student.avatarEmoji}
                    avatarUrl={req.student.avatarUrl}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>
                      {req.student.username}{req.student.name || req.student.surname ? ` (${[req.student.name, req.student.surname].filter(Boolean).join(" ")})` : ""}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                      Ждёт, пока ученик примет заявку
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleCancelRequest(req)}
                    accessibilityRole="button"
                    accessibilityLabel="Отозвать заявку"
                    style={{ backgroundColor: accents.magenta + "22", borderRadius: 9, padding: 9 }}
                  >
                    <Glyph name="close" size={16} color={accents.magenta} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Accepted students / children */}
          {items.length === 0 && pendingRequests.length === 0 ? (
            <View style={s.empty}>
              {/* Пустое состояние объясняет следующий шаг, а не просто пустует. */}
              <View style={s.emptyIcon}>
                <Glyph name={isTeacher ? "users" : "user"} size={34} color={colors.primary} />
              </View>
              <Text style={s.emptyTitle}>{addTitle}</Text>
              <Text style={s.emptyText}>
                {isTeacher
                  ? "Введите код ученика — он увидит заявку и сможет принять"
                  : "Попросите ребёнка открыть\nПрофиль и продиктовать код"}
              </Text>
              <ChunkyButton
                label="Добавить по коду"
                icon="key"
                onPress={() => setModalOpen(true)}
                style={{ alignSelf: "stretch", marginTop: 8 }}
              />
            </View>
          ) : items.length === 0 ? null : visible.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Glyph name="search" size={32} color={colors.primary} />
              </View>
              <Text style={s.emptyTitle}>Никого не нашлось</Text>
              <Text style={s.emptyText}>Попробуйте другой фильтр или очистите поиск.</Text>
            </View>
          ) : (
            <>
              {(pendingRequests.length > 0 || items.length >= FILTERS_FROM) && (
                <SectionLabel>Добавлены · {visible.length}</SectionLabel>
              )}
              {visible.map((item) => (
                <UserCard
                  key={item.id}
                  item={item}
                  extras={extras[item.id]}
                  colors={colors}
                  showActions={isTeacher}
                  unread={(unreadByUser[item.id] ?? 0) > 0}
                  onRemove={() => handleRemove(item)}
                  onPress={() => router.push(`/(main)/${isParent ? "student" : "friend"}/${item.id}` as any)}
                  onAssign={() => router.push("/(main)/assignments" as any)}
                  onMessage={() => router.push(`/(main)/chat/${item.id}?back=${encodeURIComponent("/(main)/students")}` as any)}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}

      <ConfirmModal
        visible={!!confirmRemove}
        title={isTeacher ? "Удалить ученика?" : "Удалить ребёнка?"}
        message={confirmRemove ? `«${confirmRemove.name}» будет удалён из вашего списка. Это не удаляет его аккаунт.` : ""}
        confirmText="Удалить"
        destructive
        onConfirm={() => { if (confirmRemove) doRemove(confirmRemove); }}
        onCancel={() => setConfirmRemove(null)}
      />
      <ConfirmModal
        visible={!!confirmCancel}
        title="Отменить заявку?"
        message={confirmCancel ? `Заявка для «${confirmCancel.student.name}» будет отозвана.` : ""}
        confirmText="Отозвать"
        destructive
        onConfirm={() => { if (confirmCancel) doCancel(confirmCancel); }}
        onCancel={() => setConfirmCancel(null)}
      />
    </View>
  );
}
