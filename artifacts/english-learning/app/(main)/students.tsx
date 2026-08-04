// Список учеников (для учителя) или детей (для родителя).
//
// Эмодзи в интерфейсе не используются: в пустых состояниях и на экране ошибки
// вместо них глифы из своего набора. Аватары пользователей это отдельная
// история — там avatarEmoji приходит из профиля и остаётся как есть, его
// рисует AnimatedAvatar.
//
// Оформление собрано из GameKit и сдержаннее ученических экранов: экран
// рабочий, здесь важнее скорость чтения списка, а не игровые эффекты.
import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, Platform,
  ActivityIndicator, Modal, TextInput, KeyboardAvoidingView,
} from "react-native";
import ConfirmModal from "@/components/ConfirmModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import authStorage from "@/utils/authStorage";
import { useRouter } from "expo-router";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, Pill, SectionLabel } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";

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
};

function UserCard({ item, onRemove, onPress, colors }: { item: PersonItem; onRemove: () => void; onPress: () => void; colors: any }) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={{
        backgroundColor: colors.card, borderRadius: radii.md, padding: 14,
        borderWidth: 1, borderColor: colors.border, marginBottom: 10,
        flexDirection: "row", alignItems: "center", gap: 12,
        // Цветная тень вместо серой — как на остальных экранах.
        shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12, shadowRadius: 13, elevation: 3,
      }}
    >
      <View style={{ width: 48, height: 48 }}>
        <View style={{ position: "absolute", left: -16, top: -16 }}>
          <AnimatedAvatar
            size={48}
            avatarColor={item.avatarColor ?? "#6366f1"}
            avatarEmoji={item.avatarEmoji}
            avatarUrl={item.avatarUrl}
          />
        </View>
        {item.isOnline && (
          // Зелёного в палитре нет: «в сети» тоже фиолетовый success.
          <View style={{
            position: "absolute", bottom: 1, right: 1,
            width: 14, height: 14, borderRadius: 7,
            backgroundColor: colors.success,
            borderWidth: 2, borderColor: colors.card,
          }} />
        )}
      </View>

      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>
          {item.username}{item.name || item.surname ? ` (${[item.name, item.surname].filter(Boolean).join(" ")})` : ""}
        </Text>
        {/* Уровень уже приходит с сервера, но раньше нигде не показывался —
            учителю он полезен прямо в списке. */}
        {!!item.knowledgeLevel && (
          <View style={{ flexDirection: "row" }}>
            <Pill text={item.knowledgeLevel} tone="soft" color={colors.primary} />
          </View>
        )}
      </View>

      <View style={{ alignItems: "flex-end", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Glyph name="star" size={12} color={accents.magenta} />
          {/* Табличные цифры: очки в столбце карточек не пляшут по ширине. */}
          <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, fontVariant: ["tabular-nums"] }}>
            {item.totalPoints}
          </Text>
        </View>
        <Pressable onPress={(e) => { e.stopPropagation(); onRemove(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Glyph name="userX" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </TouchableOpacity>
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
                  : <Glyph name="compass" size={20} color="#fff" />
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

export default function StudentsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const isTeacher = isTeacherOrAdmin(user?.role ?? "");
  const isParent = user?.role === "parent";

  const [items, setItems] = useState<PersonItem[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<PersonItem | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<PendingRequest | null>(null);

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

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accepted, pending] = await Promise.all([
        apiFetch(listEndpoint),
        isTeacher ? apiFetch("/api/connections/teacher/pending") : Promise.resolve([]),
      ]);
      setItems(accepted);
      setPendingRequests(pending);
    } catch (e: any) {
      setError(e.message ?? "Не удалось загрузить");
    }
    finally { setLoading(false); }
  }, [listEndpoint, isTeacher]);

  React.useEffect(() => { load(); }, [load]);

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

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 16,
      flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    },
    headerText: { flex: 1 },
    titleText: { fontSize: 28, fontWeight: "900", letterSpacing: -0.6, color: colors.foreground },
    subtitleText: { fontSize: 14, color: colors.mutedForeground, marginTop: 2 },
    addBtn: {
      backgroundColor: colors.primary, borderRadius: radii.sm + 2,
      paddingHorizontal: 14, paddingVertical: 11,
      flexDirection: "row", alignItems: "center", gap: 7,
      // Кнопка светится своим цветом — читается как активное действие.
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.32, shadowRadius: 10, elevation: 4,
    },
    addBtnText: { fontSize: 14, fontWeight: "800", color: "#fff" },
    content: { paddingHorizontal: 20, paddingBottom: insets.bottom + 100 },
    empty: { alignItems: "center", paddingTop: 60, gap: 12, paddingHorizontal: 24 },
    // Плашка вместо крупного эмодзи: наклон и цвет темы вместо символа ОС.
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
      <AddByCodeModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdded={(item) => setItems((prev) => [...prev, item])}
        endpoint={addEndpoint}
        title={addTitle}
      />

      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.titleText}>{title}</Text>
          <Text style={s.subtitleText}>
            {items.length > 0 ? `${items.length} чел.` : "Список пуст"}
          </Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => setModalOpen(true)} activeOpacity={0.85}>
          <Glyph name="userPlus" size={16} color="#fff" />
          <Text style={s.addBtnText}>Добавить</Text>
        </TouchableOpacity>
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
            style={{ marginTop: 12, backgroundColor: colors.primary, borderRadius: radii.sm, paddingHorizontal: 20, paddingVertical: 11 }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content}>
          {/* Pending requests (teacher only) */}
          {isTeacher && pendingRequests.length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <SectionLabel>Ожидают подтверждения · {pendingRequests.length}</SectionLabel>
              {pendingRequests.map((req) => (
                <View key={req.requestId} style={{
                  flexDirection: "row", alignItems: "center", gap: 12,
                  backgroundColor: accents.magenta + "12", borderRadius: radii.sm + 2, padding: 14,
                  borderWidth: 1, borderColor: accents.magenta + "33", marginBottom: 8,
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
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 1 }}>
                      Ожидает ответа…
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
          ) : items.length === 0 ? null : (
            <>
              {items.length > 0 && pendingRequests.length > 0 && (
                <SectionLabel>Добавлены · {items.length}</SectionLabel>
              )}
              {items.map((item) => (
                <UserCard key={item.id} item={item} colors={colors} onRemove={() => handleRemove(item)} onPress={() => router.push(`/(main)/${isParent ? "student" : "friend"}/${item.id}` as any)} />
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
