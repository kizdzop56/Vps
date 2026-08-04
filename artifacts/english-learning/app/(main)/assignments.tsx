// Экран заданий: у учителя — созданные задания и колоды, у ученика —
// назначенное и выполненное.
//
// Эмодзи в интерфейсе не используются: в пустых состояниях и в строке колоды
// стоят глифы из своего набора. Значок колоды рисует DeckGlyph — тот же
// компонент, что в разделе «Слова», поэтому колода узнаётся одинаково везде.
// Поле deck.emoji из базы при этом не меняется.
//
// Оформление собрано из GameKit и повторяет раздел «Слова»: главное действие —
// физическая кнопка, карточки с цветной тенью. Логика экрана не менялась.
//
// Значок типа задания рисует TypeArt (components/ui/TypeArt.tsx): не пиктограмма
// в цветном квадрате, а маленькая сцена — лист с галочками и карандашом,
// наушники с волной, книга с закладкой, экран с play, блокнот с пером. Пять
// типов теперь различаются рисунком, а не только цветом плашки.
//
// Наклоны убраны везде: карточки, значки и плашки пустых состояний стоят ровно.
// На плотном списке микро-поворот читался как брак вёрстки, а не как приём;
// глубину держат цветная тень и отклик на нажатие.
//
// Сроки сдачи: учитель выбирает срок прямо в модалке отправки (пресеты «сегодня
// / завтра / 3 дня / неделя» или без срока), ученик видит его на карточке, а
// список сортируется по сроку — просроченное сверху. Вся арифметика и формат
// живут в utils/dueDate.ts, здесь только отображение.
import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, FlatList, TouchableOpacity, Pressable, StyleSheet, Platform,
  ActivityIndicator, RefreshControl, Modal, ScrollView, TextInput, Alert,
} from "react-native";
import ConfirmModal from "@/components/ConfirmModal";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import type { Assignment } from "@workspace/api-client-react";
import authStorage from "@/utils/authStorage";
import { DailyGoalBar } from "@/components/DailyGoalBar";
import { useGamification } from "@/hooks/useGamification";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { useQuery } from "@tanstack/react-query";
import { fc } from "@/hooks/useFlashcards";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { DeckGlyph } from "@/components/ui/DeckGlyph";
import { TypeArt } from "@/components/ui/TypeArt";
import { ChunkyButton, Pill, SectionLabel } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import {
  DUE_PRESETS, dueDateFromPreset, formatDue, sortByDue, countUrgent,
  type DuePresetKey, type DueUrgency,
} from "@/utils/dueDate";

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string, options?: RequestInit) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE_URL}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Ошибка сервера");
  return data;
}

const TYPE_LABELS: Record<string, string> = {
  text_test: "Тест", audio: "Аудирование", reading: "Чтение", video: "Видео", free_form: "Свободный ответ",
};
/**
 * Цвет типа задания. Используется для тени карточки и текстового бейджа —
 * сам значок рисует TypeArt, у него палитра своя и совпадает с этой по
 * доминанте (см. TYPE_ART_SHADOW в TypeArt.tsx).
 */
const TYPE_COLORS: Record<string, string> = {
  text_test: "#8b5cf6", audio: "#6366f1", reading: "#d946ef", video: "#ec4899", free_form: "#f59e0b",
};

/** Значок срочности рядом со сроком: тревога, часы или спокойный календарь. */
const DUE_ICONS: Record<DueUrgency, GlyphName> = {
  overdue: "alert",
  today: "clock",
  soon: "clock",
  later: "calendar",
  none: "calendar",
};

const FILTERS = ["Все", "text_test", "audio", "reading", "video", "free_form"] as const;
// «Колоды» — отдельная категория в созданных заданиях учителя. До этого у
// учителя вообще не было входа в свои колоды: вкладка «Слова» скрыта для него,
// и после создания колоды вернуться к ней было нельзя.
const DECKS_FILTER = "decks" as const;
const TEACHER_FILTERS = [...FILTERS, DECKS_FILTER] as const;
type Filter = typeof FILTERS[number] | typeof DECKS_FILTER;

type StudentItem = {
  id: number; name: string; surname?: string | null; username: string; avatarEmoji: string | null; avatarColor: string | null;
  avatarUrl?: string | null; knowledgeLevel: string | null;
};

/** Русская форма слова по числу. */
function pluralRu(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Значок типа задания. Раньше здесь была линейная иконка на градиентной плашке;
 * теперь весь рисунок живёт в TypeArt, а обёртка осталась, чтобы места вызова
 * не знали о деталях реализации и размер задавался в одном месте.
 */
function TypePlate({ type, size = 52 }: { type: string; size?: number }) {
  return <TypeArt type={type} size={size} label={TYPE_LABELS[type] ?? "Задание"} />;
}

// ─── Assign Modal ────────────────────────────────────────────────────
function AssignModal({
  visible, assignment, onClose, onDone,
}: {
  visible: boolean;
  assignment: Assignment | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const colors = useColors();
  const { logout } = useAuth();
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  // Срок сдачи для этой отправки. По умолчанию «без срока»: принуждать учителя
  // ставить дедлайн на каждое задание — лишнее давление и лишний тап.
  const [duePreset, setDuePreset] = useState<DuePresetKey>("none");

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set()); setError(""); setStudents([]); setDuePreset("none");
    setLoading(true);
    apiFetch("/api/connections/teacher/students")
      .then(setStudents)
      .catch((e: any) => {
        const msg = e?.message ?? "";
        if (msg === "Forbidden") {
          logout();
          return;
        }
        setError(msg || "Не удалось загрузить учеников");
      })
      .finally(() => setLoading(false));
  }, [visible, logout]);

  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const send = async () => {
    if (!assignment || selected.size === 0) return;
    setSending(true); setError("");
    try {
      const result = await apiFetch(`/api/assignments/${assignment.id}/assign`, {
        method: "POST",
        // dueAt считается в момент отправки, а не в момент выбора пресета:
        // модалка может провисеть открытой, и «сегодня» должно остаться сегодня.
        body: JSON.stringify({
          studentIds: Array.from(selected),
          dueAt: dueDateFromPreset(duePreset),
        }),
      });
      if (result.assigned > 0) {
        onDone();
        onClose();
      } else {
        setError("Все выбранные ученики уже имеют это активное задание. Оно появится снова после выполнения.");
      }
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg === "Forbidden") {
        logout();
        return;
      }
      setError(msg || "Не удалось назначить задание");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: colors.card, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg,
          padding: 24, maxHeight: "85%",
        }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <Text style={{ fontSize: 19, fontWeight: "900", letterSpacing: -0.3, color: colors.foreground }}>Назначить задание</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Glyph name="close" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 16 }}>
            {assignment?.title} · выбери учеников
          </Text>

          {error ? (
            <View style={{
              backgroundColor: colors.destructive + "12", borderRadius: radii.sm, padding: 12, marginBottom: 12,
              borderWidth: 1, borderColor: colors.destructive + "44",
              flexDirection: "row", alignItems: "flex-start", gap: 9,
            }}>
              <View style={{ marginTop: 1 }}>
                <Glyph name="alert" size={15} color={colors.destructive} />
              </View>
              <Text style={{ color: colors.destructive, fontSize: 13, flex: 1, lineHeight: 18 }}>{error}</Text>
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 30 }} />
          ) : students.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 30, gap: 12 }}>
              {/* Глиф в плашке вместо 🎓: цвет управляется темой, вид одинаков
                  на iOS, Android и в вебе. Плашка стоит ровно — наклон убран. */}
              <View style={{
                width: 62, height: 62, borderRadius: radii.md, justifyContent: "center", alignItems: "center",
                backgroundColor: colors.primary + "14", borderWidth: 1, borderColor: colors.primary + "2e",
              }}>
                <Glyph name="users" size={30} color={colors.primary} />
              </View>
              <Text style={{ fontSize: 15, color: colors.mutedForeground, textAlign: "center" }}>
                Нет принятых учеников.{"\n"}Сначала добавьте учеников на вкладке «Ученики».
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 340 }}>
              {students.map((st) => {
                const checked = selected.has(st.id);
                return (
                  <TouchableOpacity
                    key={st.id}
                    onPress={() => toggle(st.id)}
                    activeOpacity={0.85}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 12,
                      padding: 12, borderRadius: radii.sm + 2, marginBottom: 8,
                      backgroundColor: checked ? colors.primary + "15" : colors.card,
                      borderWidth: 1.5,
                      borderColor: checked ? colors.primary : colors.border,
                    }}
                  >
                    <AnimatedAvatar
                      size={42}
                      avatarColor={st.avatarColor ?? "#6366f1"}
                      avatarEmoji={st.avatarEmoji}
                      avatarUrl={st.avatarUrl}
                    />
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: colors.foreground }}>
                      {st.username}{st.name || st.surname ? ` (${[st.name, st.surname].filter(Boolean).join(" ")})` : ""}
                    </Text>
                    <View style={{
                      width: 24, height: 24, borderRadius: 12,
                      borderWidth: 2, borderColor: checked ? colors.primary : colors.border,
                      backgroundColor: checked ? colors.primary : "transparent",
                      justifyContent: "center", alignItems: "center",
                    }}>
                      {checked && <Glyph name="check" size={13} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Срок сдачи. Стоит между списком учеников и кнопкой отправки: это
              последнее решение перед отправкой, и его видно, не листая назад. */}
          {students.length > 0 && (
            <View style={{ marginTop: 14 }}>
              <SectionLabel style={{ marginBottom: 8 }}>Срок сдачи</SectionLabel>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {DUE_PRESETS.map((preset) => {
                  const active = duePreset === preset.key;
                  return (
                    <TouchableOpacity
                      key={preset.key}
                      onPress={() => setDuePreset(preset.key)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill,
                        borderWidth: 1.5,
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.secondary : colors.card,
                      }}
                    >
                      <Text style={{
                        fontSize: 13, fontWeight: "800",
                        color: active ? colors.primary : colors.mutedForeground,
                      }}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {duePreset !== "none" && (
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 8 }}>
                  Ученик увидит: «{formatDue(dueDateFromPreset(duePreset)).text}»
                </Text>
              )}
            </View>
          )}

          {students.length > 0 && (
            sending ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <ChunkyButton
                label={`Отправить${selected.size > 0 ? ` (${selected.size})` : ""}`}
                icon="send"
                disabled={selected.size === 0}
                onPress={send}
                style={{ marginTop: 16 }}
              />
            )
          )}

          <TouchableOpacity onPress={onClose} style={{ paddingVertical: 12, alignItems: "center", marginTop: 4 }}>
            <Text style={{ fontSize: 14, color: colors.mutedForeground }}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────
export default function AssignmentsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("Все");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"tasks" | "results">("tasks");
  const [assignTarget, setAssignTarget] = useState<any>(null);
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [loadingMyTasks, setLoadingMyTasks] = useState(false);
  const [myAssignments, setMyAssignments] = useState<any[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [teacherSubs, setTeacherSubs] = useState<any[]>([]);
  const [loadingTeacherSubs, setLoadingTeacherSubs] = useState(false);
  const [myCompleted, setMyCompleted] = useState<any[]>([]);
  const [loadingCompleted, setLoadingCompleted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; title: string } | null>(null);

  const isTeacher = isTeacherOrAdmin(user?.role ?? "");
  const isStudent = user?.role === "student";
  const [refreshing, setRefreshing] = useState(false);

  // Колоды учителя — один запрос на весь экран (используется и во вкладке
  // «Колоды», и во вкладке «Все», где колоды подмешиваются к заданиям в общий
  // список). Раньше запрос жил внутри TeacherDecks, и вкладка «Все» о колодах
  // просто не знала.
  const decksQ = useQuery({ queryKey: ["fc-my-decks"], queryFn: fc.getMyDecks, enabled: isTeacher });

  // Gamification: daily goal bar
  const { stats: gamStats, loadStats, updateDailyGoal } = useGamification();

  useFocusEffect(useCallback(() => {
    if (isStudent) loadStats();
  }, [isStudent, loadStats]));


  const loadMyTasks = useCallback(async () => {
    if (!isStudent) return;
    setLoadingMyTasks(true);
    try { setMyTasks(await apiFetch("/api/assignments/my-tasks")); }
    catch { /* silent */ }
    finally { setLoadingMyTasks(false); }
  }, [isStudent]);

  const loadMyAssignments = useCallback(async () => {
    if (!isTeacher) return;
    try { setMyAssignments(await apiFetch("/api/assignments/my-assignments")); }
    catch { /* silent */ }
  }, [isTeacher]);

  const loadTeacherSubs = useCallback(async () => {
    if (!isTeacher) return;
    setLoadingTeacherSubs(true);
    try { setTeacherSubs(await apiFetch("/api/assignments/teacher-results")); }
    catch { /* silent */ }
    finally { setLoadingTeacherSubs(false); }
  }, [isTeacher]);

  const loadMyCompleted = useCallback(async () => {
    if (!isStudent) return;
    setLoadingCompleted(true);
    try { setMyCompleted(await apiFetch("/api/assignments/my-submissions")); }
    catch { /* silent */ }
    finally { setLoadingCompleted(false); }
  }, [isStudent]);

  useEffect(() => { loadMyTasks(); }, [loadMyTasks]);
  useEffect(() => { loadMyAssignments(); }, [loadMyAssignments]);
  useEffect(() => { loadTeacherSubs(); }, [loadTeacherSubs]);
  useEffect(() => { loadMyCompleted(); }, [loadMyCompleted]);

  // Refresh all data when screen comes into focus
  useFocusEffect(useCallback(() => {
    loadMyTasks();
    loadMyAssignments();
    loadTeacherSubs();
    loadMyCompleted();
    if (isTeacher) decksQ.refetch();
  }, [loadMyTasks, loadMyAssignments, loadTeacherSubs, loadMyCompleted, isTeacher]));

  // Auto-poll every 10 seconds so new assignments appear quickly
  useEffect(() => {
    const interval = setInterval(() => {
      loadMyTasks();
      loadMyCompleted();
      loadMyAssignments();
      loadTeacherSubs();
    }, 10000);
    return () => clearInterval(interval);
  }, [loadMyTasks, loadMyCompleted, loadMyAssignments, loadTeacherSubs]);

  // Instant refresh when browser tab becomes visible (web only)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadMyTasks();
        loadMyCompleted();
        loadMyAssignments();
        loadTeacherSubs();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [loadMyTasks, loadMyCompleted, loadMyAssignments, loadTeacherSubs]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadMyTasks(), loadMyAssignments(), loadTeacherSubs(), loadMyCompleted()]);
    setRefreshing(false);
  }, [loadMyTasks, loadMyAssignments, loadTeacherSubs, loadMyCompleted]);

  const handleDeleteAssignment = async (id: number) => {
    setDeletingId(id);
    try {
      await apiFetch(`/api/assignments/${id}`, { method: "DELETE" });
      setMyAssignments(prev => prev.filter(a => a.id !== id));
    } catch (e: any) {
      Alert.alert("Ошибка", e.message ?? "Не удалось удалить задание");
    } finally {
      setDeletingId(null);
    }
  };

  const searchLower = search.trim().toLowerCase();

  /**
   * Сколько заданий стоит за фильтром. Считается по уже загруженным спискам —
   * лишних запросов нет. Пустой тип теперь видно до нажатия: раньше фильтр
   * выглядел рабочим и открывал пустой экран.
   */
  const filterCount = (f: Filter): number => {
    if (f === DECKS_FILTER) return decksQ.data?.length ?? 0;
    const source: any[] = isTeacher ? myAssignments : myTasks;
    if (f === "Все") return source.length;
    return source.filter((a) => a.type === f).length;
  };

  /** Цвет балла в фирменной гамме: зелёного в палитре нет намеренно. */
  const scoreTint = (score: number) =>
    score >= 70 ? colors.success : score >= 40 ? accents.amber : colors.destructive;

  /**
   * Цвет срока. Красный только для просроченного: если красить им и «сегодня»,
   * тревожный цвет перестаёт что-либо значить.
   */
  const dueTint = (urgency: DueUrgency) =>
    urgency === "overdue" ? colors.destructive
      : urgency === "today" ? accents.amber
        : urgency === "soon" ? colors.primary
          : colors.mutedForeground;

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 12,
      backgroundColor: colors.background,
    },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontSize: 30, fontWeight: "900", letterSpacing: -0.6, color: colors.foreground },
    addBtn: {
      width: 42, height: 42, borderRadius: 21,
      backgroundColor: colors.primary, justifyContent: "center", alignItems: "center",
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
    },
    searchBox: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: colors.muted, borderRadius: radii.sm, paddingHorizontal: 12,
      paddingVertical: Platform.OS === "web" ? 9 : 8, marginTop: 10,
      borderWidth: 1, borderColor: colors.border,
    },
    searchInput: {
      flex: 1, fontSize: 14, color: colors.foreground,
      ...(Platform.OS === "web" ? { outlineWidth: 0 } as any : {}),
    },
    filterRow: { flexDirection: "row", gap: 8, paddingVertical: 12 },
    // Значок типа внутри чипа: тип узнаётся картинкой раньше, чем прочитан текст.
    filterBtn: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingLeft: 8, paddingRight: 14, paddingVertical: 7,
      borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border,
      backgroundColor: colors.card,
    },
    // Активный фильтр приподнят: тот же приём, что у переключателей рейтинга.
    filterBtnActive: {
      borderColor: colors.primary, backgroundColor: colors.secondary,
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25, shadowRadius: 8, elevation: 3,
    },
    filterText: { fontSize: 13, fontWeight: "700", color: colors.mutedForeground },
    filterTextActive: { color: colors.primary },
    filterCount: { fontSize: 11, fontWeight: "800", color: colors.mutedForeground, opacity: 0.75, fontVariant: ["tabular-nums"] },
    list: { paddingHorizontal: 20, paddingBottom: insets.bottom + 90 },
    card: {
      backgroundColor: colors.card, borderRadius: radii.md, padding: 16,
      marginBottom: 12, borderWidth: 1, borderColor: colors.border,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.14, shadowRadius: 15, elevation: 4,
    },
    assignedCard: {
      backgroundColor: colors.card, borderRadius: radii.md, padding: 16,
      marginBottom: 12, borderWidth: 1, borderColor: colors.border,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.16, shadowRadius: 16, elevation: 4,
    },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 10 },
    cardTitle: { fontSize: 16, fontWeight: "800", color: colors.foreground, flex: 1 },
    cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 },
    cardActions: { flexDirection: "row", gap: 8, marginTop: 10 },
    typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    typeBadgeText: { fontSize: 12, fontWeight: "700" },
    ageText: { fontSize: 12, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
    // Срок: текст с иконкой, без плашки. Плашка спорила бы с бейджем типа.
    dueRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
    dueText: { fontSize: 12.5, fontWeight: "800" },
    actionBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 6, paddingVertical: 10, borderRadius: radii.sm - 2, borderWidth: 1,
      paddingHorizontal: 12,
    },
    actionBtnText: { fontSize: 13, fontWeight: "800" },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12, paddingHorizontal: 24 },
    emptyText: { fontSize: 15, color: colors.mutedForeground, textAlign: "center", lineHeight: 21 },
    // Плашка под глиф в пустом состоянии. Стоит ровно: наклон убран вместе с
    // наклонами карточек, иначе одинокий поворот выглядит случайным.
    emptyIcon: {
      width: 68, height: 68, borderRadius: radii.md + 4, justifyContent: "center", alignItems: "center",
      backgroundColor: colors.primary + "12", borderWidth: 1, borderColor: colors.primary + "28",
    },
    teacherTag: {
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: colors.primary + "15", borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 4, marginBottom: 9, alignSelf: "flex-start",
    },
    modeToggle: {
      flexDirection: "row", backgroundColor: colors.muted,
      borderRadius: radii.sm + 2, padding: 3, marginTop: 10,
    },
    modeBtn: {
      flex: 1, paddingVertical: 9, borderRadius: radii.sm,
      alignItems: "center", justifyContent: "center",
    },
    modeBtnActive: {
      backgroundColor: colors.card,
      shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
    },
    modeBtnText: { fontSize: 13, fontWeight: "700", color: colors.mutedForeground },
    modeBtnTextActive: { color: colors.foreground, fontWeight: "800" },
    subCard: {
      backgroundColor: colors.card, borderRadius: radii.md, padding: 14,
      marginBottom: 12, borderWidth: 1, borderColor: colors.border,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.13, shadowRadius: 14, elevation: 3,
    },
    scoreBadge: {
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.sm - 2,
      alignSelf: "flex-start",
    },
  });

  const renderMyTaskCard = (item: any) => {
    const color = TYPE_COLORS[item.type] || colors.primary;
    const due = formatDue(item.dueAt);
    const dueColor = dueTint(due.urgency);
    // Просроченное подсвечивается рамкой и тенью: в длинном списке одного
    // текста мало, карточка должна отличаться до чтения.
    const overdue = due.urgency === "overdue";
    return (
      <TouchableOpacity
        key={item.assignedTaskId}
        style={[
          styles.assignedCard,
          { shadowColor: overdue ? colors.destructive : color },
          overdue && { borderColor: colors.destructive + "55" },
        ]}
        onPress={() => router.push(`/(main)/assignment/${item.assignmentId}` as any)}
        activeOpacity={0.75}
      >
        <View style={styles.teacherTag}>
          <Glyph name="send" size={11} color={colors.primary} />
          <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary }}>
            от {item.teacherName}
          </Text>
        </View>
        <View style={styles.cardHeader}>
          <TypePlate type={item.type} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
            {/* Срок показываем только когда он есть: строка «без срока» на
                каждой карточке — шум, который ничего не сообщает. */}
            {due.urgency !== "none" && (
              <View style={styles.dueRow}>
                <Glyph name={DUE_ICONS[due.urgency]} size={12} color={dueColor} />
                <Text style={[styles.dueText, { color: dueColor }]}>{due.text}</Text>
              </View>
            )}
          </View>
          <Glyph name="chevron" size={18} color={colors.mutedForeground} />
        </View>
        <View style={styles.cardFooter}>
          <View style={[styles.typeBadge, { backgroundColor: color + "15" }]}>
            <Text style={[styles.typeBadgeText, { color }]}>{TYPE_LABELS[item.type] ?? item.type}</Text>
          </View>
          <Pill
            text={item.points > 0 ? `${item.points} очков` : "по проверке"}
            icon="star"
            tone="soft"
            color={accents.magenta}
          />
        </View>
      </TouchableOpacity>
    );
  };

  const renderMyAssignmentCard = (item: any) => {
    const color = TYPE_COLORS[item.type] || colors.primary;
    const isDraft = item.isDraft;
    return (
      // Outer View — NOT a Touchable, so inner buttons get touches reliably
      <View
        key={item.id}
        style={[
          styles.card,
          { shadowColor: color },
          isDraft && { borderColor: colors.border, borderStyle: "dashed" },
        ]}
      >
        {/* Title area tappable → navigate to detail */}
        <TouchableOpacity
          onPress={() => router.push(`/(main)/assignment/${item.id}` as any)}
          activeOpacity={0.75}
        >
          <View style={styles.cardHeader}>
            <TypePlate type={item.type} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              {isDraft && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }}>
                  <Glyph name="pen" size={11} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, fontWeight: "700" }}>Черновик</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>

        {/* Action buttons — independent from navigation area.
            «Назначить» заполнена цветом, «Итоги» и удаление тихие: раньше все
            три кнопки весили одинаково и главное действие не читалось. */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.actionBtn, { flex: 1, borderColor: "transparent", backgroundColor: colors.primary }]}
            onPress={() => setAssignTarget(item)}
          >
            <Glyph name="send" size={14} color="#fff" />
            <Text style={[styles.actionBtnText, { color: "#fff" }]}>Назначить</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => router.push(`/(main)/teacher-results/${item.id}` as any)}
          >
            <Glyph name="chart" size={14} color={colors.mutedForeground} />
            <Text style={[styles.actionBtnText, { color: colors.mutedForeground }]}>Итоги</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.actionBtn, { borderColor: colors.destructive + "55", backgroundColor: colors.destructive + "10" }]}
            onPress={() => setConfirmDelete({ id: item.id, title: item.title })}
          >
            {deletingId === item.id
              ? <ActivityIndicator size="small" color={colors.destructive} />
              : <Glyph name="trash" size={14} color={colors.destructive} />
            }
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Teacher: render one student submission card (tappable → details) ──
  const renderTeacherSubCard = (item: any) => {
    const color = TYPE_COLORS[item.assignmentType] || colors.primary;
    const hasSub = !!item.submission;
    if (!hasSub) return null;
    const score = item.submission.score;
    const tint = scoreTint(score);
    // Сдано после срока: учителю это важнее самой даты сдачи, поэтому метка,
    // а не строка мелким текстом. Без срока метки нет.
    const late = !!item.dueAt && new Date(item.submission.submittedAt).getTime() > new Date(item.dueAt).getTime();
    return (
      <TouchableOpacity
        key={`${item.assignedTaskId}`}
        style={[styles.subCard, { shadowColor: tint }]}
        onPress={() => router.push(`/(main)/teacher-results/${item.assignmentId}` as any)}
        activeOpacity={0.75}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <AnimatedAvatar
            size={40}
            avatarColor={item.studentAvatarColor ?? "#6366f1"}
            avatarEmoji={item.studentAvatarEmoji}
            avatarUrl={item.studentAvatarUrl}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>{item.studentName}</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground }} numberOfLines={1}>{item.assignmentTitle}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={[styles.scoreBadge, { backgroundColor: tint + "18" }]}>
              <Text style={{ fontSize: 16, fontWeight: "900", color: tint, fontVariant: ["tabular-nums"] }}>{score}%</Text>
            </View>
            <Glyph name="chevron" size={16} color={colors.mutedForeground} />
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Значок типа и здесь: список ответов перестаёт быть одинаковым. */}
          <TypePlate type={item.assignmentType} size={28} />
          <View style={[styles.typeBadge, { backgroundColor: color + "15" }]}>
            <Text style={[styles.typeBadgeText, { color }]}>{TYPE_LABELS[item.assignmentType] ?? item.assignmentType}</Text>
          </View>
          <Text style={styles.ageText}>
            {item.submission.correctCount}/{item.submission.totalQuestions} правильно
          </Text>
          {late && <Pill text="с опозданием" icon="clock" tone="danger" />}
          <Text style={styles.ageText}>
            {new Date(item.submission.submittedAt).toLocaleDateString("ru-RU")}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Student: render one completed assignment card (tappable → review) ──
  const renderCompletedCard = (item: any) => {
    const color = TYPE_COLORS[item.type] || colors.primary;
    const tint = scoreTint(item.score);
    return (
      <TouchableOpacity
        key={`${item.submissionId}`}
        // Тень в цвете балла: сильные и слабые работы различимы сразу.
        style={[styles.subCard, { shadowColor: tint }]}
        onPress={() => router.push(`/(main)/submission-review/${item.submissionId}` as any)}
        activeOpacity={0.75}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <TypePlate type={item.type} size={44} />
          <Text style={[styles.cardTitle, { flex: 1 }]} numberOfLines={2}>{item.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={[styles.scoreBadge, { backgroundColor: tint + "18" }]}>
              <Text style={{ fontSize: 16, fontWeight: "900", color: tint, fontVariant: ["tabular-nums"] }}>{item.score}%</Text>
            </View>
            <Glyph name="chevron" size={16} color={colors.mutedForeground} />
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <View style={[styles.typeBadge, { backgroundColor: color + "15" }]}>
            <Text style={[styles.typeBadgeText, { color }]}>{TYPE_LABELS[item.type] ?? item.type}</Text>
          </View>
          <Text style={styles.ageText}>{item.correctCount}/{item.totalQuestions} правильно</Text>
          <Pill text={`+${item.pointsEarned}`} icon="star" tone="soft" color={accents.magenta} />
          <Text style={styles.ageText}>{new Date(item.submittedAt).toLocaleDateString("ru-RU")}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <AssignModal
        visible={!!assignTarget}
        assignment={assignTarget}
        onClose={() => setAssignTarget(null)}
        onDone={() => { loadMyAssignments(); }}
      />

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>
            {isTeacher ? "Задания" : "Мои задания"}
          </Text>
          {isTeacher && (
            <TouchableOpacity
              style={styles.addBtn}
              activeOpacity={0.85}
              onPress={() => router.push("/(main)/create-assignment" as any)}
              accessibilityRole="button"
              accessibilityLabel="Создать задание"
            >
              <Glyph name="plus" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Сводка по срокам у ученика: сколько заданий горит прямо сейчас.
            Раньше это можно было понять, только пролистав весь список. */}
        {isStudent && (() => {
          const urgent = countUrgent(myTasks, (t: any) => t.dueAt);
          if (urgent === 0) return null;
          return (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
              <Glyph name="alert" size={14} color={colors.destructive} />
              <Text style={{ fontSize: 13, fontWeight: "800", color: colors.destructive }}>
                {urgent} {pluralRu(urgent, "задание горит", "задания горят", "заданий горят")} — начни с первого
              </Text>
            </View>
          );
        })()}

        {/* Daily Goal Bar — students only */}
        {isStudent && gamStats && (
          <DailyGoalBar
            todayMinutes={gamStats.todayMinutes}
            goalMinutes={gamStats.dailyGoalMinutes}
            onGoalChange={updateDailyGoal}
          />
        )}

        {/* Mode toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, viewMode === "tasks" && styles.modeBtnActive]}
            onPress={() => setViewMode("tasks")}
            activeOpacity={0.85}
          >
            <Text style={[styles.modeBtnText, viewMode === "tasks" && styles.modeBtnTextActive]}>
              {isTeacher ? "Мои задания" : "Назначенные"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, viewMode === "results" && styles.modeBtnActive]}
            onPress={() => setViewMode("results")}
            activeOpacity={0.85}
          >
            <Text style={[styles.modeBtnText, viewMode === "results" && styles.modeBtnTextActive]}>
              {isTeacher ? "Ответы учеников" : "Выполненные"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search bar + filters — only in tasks mode */}
        {viewMode === "tasks" && (
          <>
            <View style={styles.searchBox}>
              <Glyph name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Поиск по названию..."
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
            <FlatList
              horizontal
              data={isTeacher ? TEACHER_FILTERS : FILTERS}
              keyExtractor={(f) => f}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              renderItem={({ item: f }) => {
                const isType = f !== "Все" && f !== DECKS_FILTER;
                return (
                  <TouchableOpacity
                    style={[
                      styles.filterBtn,
                      !isType && { paddingLeft: 14 },
                      filter === f && styles.filterBtnActive,
                    ]}
                    onPress={() => setFilter(f)}
                    activeOpacity={0.85}
                  >
                    {isType && <TypeArt type={f} size={22} />}
                    <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                      {f === "Все" ? "Все" : f === DECKS_FILTER ? "Колоды" : TYPE_LABELS[f]}
                    </Text>
                    <Text style={[styles.filterCount, filter === f && { color: colors.primary }]}>
                      {filterCount(f)}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </>
        )}
      </View>

      {/* ── Results / Completed mode ──────────────────────────────────── */}
      {viewMode === "results" ? (
        loadingTeacherSubs || loadingCompleted ? (
          <View style={styles.empty}><ActivityIndicator color={colors.primary} size="large" /></View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.list, { paddingTop: 12 }]}
            showsVerticalScrollIndicator={false}
          >
            {isTeacher && (() => {
              const withSub = teacherSubs.filter(t => !!t.submission);
              if (withSub.length === 0) return (
                <View style={[styles.empty, { paddingTop: 40 }]}>
                  <View style={styles.emptyIcon}>
                    <Glyph name="tray" size={32} color={colors.primary} />
                  </View>
                  <Text style={styles.emptyText}>Ответов ещё нет</Text>
                </View>
              );
              return (
                <>
                  <SectionLabel>Ответы учеников · {withSub.length}</SectionLabel>
                  {withSub
                    .sort((a, b) => new Date(b.submission.submittedAt).getTime() - new Date(a.submission.submittedAt).getTime())
                    .map((item) => renderTeacherSubCard(item))
                  }
                </>
              );
            })()}

            {isStudent && (() => {
              if (myCompleted.length === 0) return (
                <View style={[styles.empty, { paddingTop: 40 }]}>
                  <View style={styles.emptyIcon}>
                    <Glyph name="check" size={32} color={colors.primary} />
                  </View>
                  <Text style={styles.emptyText}>Выполненных заданий пока нет</Text>
                </View>
              );
              return (
                <>
                  <SectionLabel>Выполненные · {myCompleted.length}</SectionLabel>
                  {myCompleted.map((item) => renderCompletedCard(item))}
                </>
              );
            })()}
          </ScrollView>
        )
      ) : (
        /* ── Tasks mode ─────────────────────────────────────────────── */
        loadingMyTasks && isStudent ? (
          <View style={styles.empty}><ActivityIndicator color={colors.primary} size="large" /></View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.list, { paddingTop: 12 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          >
            {/* Teacher: свои колоды слов — отдельная категория «Колоды» */}
            {isTeacher && filter === DECKS_FILTER && (
              <TeacherDecks colors={colors} styles={styles} search={searchLower} decksQ={decksQ} />
            )}

            {/* Teacher: во «Все» — задания и колоды в общем списке, отсортированные
                по дате создания (новые сверху). Раньше «Все» собирала только
                задания, и созданная/отправленная колода там не появлялась —
                увидеть её можно было только во вкладке «Колоды». В остальных
                фильтрах (по типу задания) колоды не подмешиваются. */}
            {isTeacher && filter !== DECKS_FILTER && filter === "Все" && (() => {
              if (decksQ.isLoading) {
                return <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 20 }} />;
              }
              type Row =
                | { kind: "assignment"; createdAt: number; data: any }
                | { kind: "deck"; createdAt: number; data: any };
              const assignmentRows: Row[] = myAssignments
                .filter((a) => !searchLower || a.title.toLowerCase().includes(searchLower))
                .map((a) => ({ kind: "assignment", createdAt: a.createdAt ? new Date(a.createdAt).getTime() : 0, data: a }));
              const deckRows: Row[] = (decksQ.data ?? [])
                .filter((d: any) => !searchLower || d.title.toLowerCase().includes(searchLower))
                .map((d: any) => ({ kind: "deck", createdAt: d.createdAt ? new Date(d.createdAt).getTime() : 0, data: d }));
              const combined = [...assignmentRows, ...deckRows].sort((a, b) => b.createdAt - a.createdAt);

              if (combined.length === 0) return (
                <View style={[styles.empty, { paddingTop: 40 }]}>
                  <View style={styles.emptyIcon}>
                    <Glyph name="tray" size={32} color={colors.primary} />
                  </View>
                  <Text style={styles.emptyText}>Заданий и колод пока нет.{"\n"}Создайте первое задание.</Text>
                  <ChunkyButton
                    label="Создать задание"
                    icon="plus"
                    onPress={() => router.push("/(main)/create-assignment" as any)}
                    style={{ alignSelf: "stretch", marginTop: 8 }}
                  />
                </View>
              );
              return (
                <>
                  {/* Главное действие учителя: раньше создать задание можно было
                      только круглым плюсом в шапке — его легко не заметить. */}
                  <ChunkyButton
                    label="Создать задание"
                    sublabel="Тест, аудирование, чтение, видео или свободный ответ"
                    icon="plus"
                    chevron
                    onPress={() => router.push("/(main)/create-assignment" as any)}
                    style={{ marginBottom: 16 }}
                  />
                  <SectionLabel>Мои задания и колоды · {combined.length}</SectionLabel>
                  {combined.map((row) => row.kind === "assignment"
                    ? renderMyAssignmentCard(row.data)
                    : (
                      <DeckRow
                        key={`deck-${row.data.id}`}
                        colors={colors}
                        deck={row.data}
                        onPress={() => router.push(`/(main)/flashcards/deck/${row.data.id}` as any)}
                      />
                    ))}
                </>
              );
            })()}

            {/* Teacher: конкретный тип задания — только задания этого типа, без колод */}
            {isTeacher && filter !== DECKS_FILTER && filter !== "Все" && (() => {
              const filtered = myAssignments.filter(a =>
                a.type === filter &&
                (!searchLower || a.title.toLowerCase().includes(searchLower))
              );
              if (filtered.length === 0) return (
                <View style={[styles.empty, { paddingTop: 40 }]}>
                  <View style={styles.emptyIcon}>
                    <Glyph name="tray" size={32} color={colors.primary} />
                  </View>
                  <Text style={styles.emptyText}>Заданий этого типа пока нет.</Text>
                  <ChunkyButton
                    label="Создать задание"
                    icon="plus"
                    onPress={() => router.push("/(main)/create-assignment" as any)}
                    style={{ alignSelf: "stretch", marginTop: 8 }}
                  />
                </View>
              );
              return (
                <>
                  <SectionLabel>Мои задания · {filtered.length}</SectionLabel>
                  {filtered.map((item) => renderMyAssignmentCard(item))}
                </>
              );
            })()}

            {/* Student: assigned tasks — server already excludes submitted ones */}
            {isStudent && (() => {
              const filtered = myTasks.filter((t: any) =>
                (filter === "Все" || t.type === filter) &&
                (!searchLower || t.title.toLowerCase().includes(searchLower))
              );
              if (filtered.length === 0) return (
                <View style={[styles.empty, { paddingTop: 40 }]}>
                  <View style={styles.emptyIcon}>
                    <Glyph name="check" size={32} color={colors.primary} />
                  </View>
                  <Text style={styles.emptyText}>
                    {"Учитель ещё не назначил заданий"}
                  </Text>
                </View>
              );
              // Сортировка по сроку: просроченное сверху, затем ближайшее, в
              // конце — задания без срока. Порядок с сервера произвольный.
              const ordered = sortByDue(filtered, (t: any) => t.dueAt);
              const next = ordered[0];
              const nextDue = formatDue(next.dueAt);
              return (
                <>
                  {/* Главное действие ученика — как «Учить слова» в разделе
                      «Слова». Раньше экран открывался списком, и ученик сам
                      искал, за что взяться. Кнопка ведёт на самое срочное
                      задание — то же, что стоит первым в списке. */}
                  <ChunkyButton
                    label="Начать задание"
                    sublabel={nextDue.urgency === "none" ? next.title : `${next.title} · ${nextDue.text}`}
                    icon="play"
                    chevron
                    tone={nextDue.urgency === "overdue" ? "warm" : "primary"}
                    onPress={() => router.push(`/(main)/assignment/${next.assignmentId}` as any)}
                    style={{ marginBottom: 16 }}
                  />
                  <SectionLabel>
                    Назначено учителем · {ordered.length} {pluralRu(ordered.length, "задание", "задания", "заданий")}
                  </SectionLabel>
                  {ordered.map((item: any) => renderMyTaskCard(item))}
                </>
              );
            })()}
          </ScrollView>
        )
      )}

      <ConfirmModal
        visible={!!confirmDelete}
        title="Удалить задание?"
        message={confirmDelete ? `«${confirmDelete.title}» будет скрыто из вашего списка. Ученики сохранят доступ к нему.` : ""}
        confirmText="Удалить"
        destructive
        onConfirm={() => { if (confirmDelete) { handleDeleteAssignment(confirmDelete.id); setConfirmDelete(null); } }}
        onCancel={() => setConfirmDelete(null)}
      />

    </View>
  );
}

// ─── Строка колоды — общий внешний вид для вкладки «Колоды» и для колод,
// подмешанных в общий список во вкладке «Все». Значок рисует DeckGlyph: тот же
// компонент, что в разделе «Слова». Здесь он передаётся с tilt={0} — на этом
// экране всё стоит ровно, а в «Словах» наклон остаётся как было. ──
function DeckRow({ colors, deck, onPress }: { colors: any; deck: any; onPress: () => void }) {
  return (
    <TouchableOpacity
      key={deck.id}
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        flexDirection: "row", alignItems: "center", gap: 12,
        backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1,
        borderColor: colors.border, padding: 14, marginBottom: 12,
        shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.13, shadowRadius: 14, elevation: 3,
      }}
    >
      <DeckGlyph title={deck.title} emoji={deck.emoji} size={44} tilt={0} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{deck.title}</Text>
        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 3, fontVariant: ["tabular-nums"] }}>
          {deck.wordCount} слов
          {deck.assignedCount ? ` · отправлена ${deck.assignedCount} ученикам` : " · ещё никому не отправлена"}
        </Text>
      </View>
      <Glyph name="chevron" size={20} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

// ─── Колоды слов учителя ──────────────────────────────────────────────
// Отдельная категория внутри созданных заданий. Раньше у учителя не было
// никакого входа в свои колоды: вкладка «Слова» для него скрыта, а страница
// колоды открывалась только сразу после создания — вернуться к ней потом
// было нельзя. Список берём быстрым запросом только своих колод (?mine=1).
// Запрос теперь общий для всего экрана (decksQ передаётся сверху) — вкладка
// «Все» подмешивает те же колоды к заданиям в единый список.
function TeacherDecks({ colors, styles, search, decksQ }: { colors: any; styles: any; search: string; decksQ: any }) {
  const router = useRouter();

  const decks = (decksQ.data ?? []).filter(
    (d: any) => !search || d.title.toLowerCase().includes(search),
  );

  if (decksQ.isLoading) {
    return <View style={styles.empty}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  if (decksQ.isError) {
    return (
      <View style={[styles.empty, { paddingTop: 40, gap: 12 }]}>
        <View style={[styles.emptyIcon, { backgroundColor: colors.destructive + "14", borderColor: colors.destructive + "33" }]}>
          <Glyph name="alert" size={32} color={colors.destructive} />
        </View>
        <Text style={styles.emptyText}>Не удалось загрузить колоды.</Text>
        <TouchableOpacity
          onPress={() => decksQ.refetch()}
          activeOpacity={0.85}
          style={{ backgroundColor: colors.primary, borderRadius: radii.sm, paddingHorizontal: 20, paddingVertical: 11 }}
        >
          <Text style={{ color: "#fff", fontWeight: "800" }}>Повторить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <ChunkyButton
        label="Создать колоду"
        sublabel="Свои слова для учеников"
        icon="plus"
        chevron
        onPress={() => router.push("/(main)/flashcards/new-deck" as any)}
        style={{ marginBottom: 16 }}
      />

      <SectionLabel>Колоды слов · {decks.length}</SectionLabel>

      {decks.length === 0 ? (
        <View style={[styles.empty, { paddingTop: 30 }]}>
          <View style={styles.emptyIcon}>
            <Glyph name="cards" size={32} color={colors.primary} />
          </View>
          <Text style={styles.emptyText}>
            Колод пока нет.{"\n"}Создайте колоду, добавьте слова и отправьте её ученикам.
          </Text>
        </View>
      ) : (
        decks.map((d: any) => (
          <DeckRow
            key={d.id}
            colors={colors}
            deck={d}
            onPress={() => router.push(`/(main)/flashcards/deck/${d.id}` as any)}
          />
        ))
      )}
    </>
  );
}
