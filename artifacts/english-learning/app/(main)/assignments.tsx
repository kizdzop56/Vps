import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Platform,
  ActivityIndicator, RefreshControl, Modal, ScrollView, TextInput, Alert,
} from "react-native";
import ConfirmModal from "@/components/ConfirmModal";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import type { Assignment } from "@workspace/api-client-react";
import authStorage from "@/utils/authStorage";
import { DailyGoalBar } from "@/components/DailyGoalBar";
import { useGamification } from "@/hooks/useGamification";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";

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

const TYPE_ICONS: Record<string, any> = {
  text_test: "edit-3", audio: "headphones", reading: "book", video: "video", free_form: "file-text",
};
const TYPE_LABELS: Record<string, string> = {
  text_test: "Тест", audio: "Аудирование", reading: "Чтение", video: "Видео", free_form: "Свободный ответ",
};
const TYPE_COLORS: Record<string, string> = {
  text_test: "#8b5cf6", audio: "#6366f1", reading: "#6366f1", video: "#ec4899", free_form: "#ec4899",
};
const FILTERS = ["Все", "text_test", "audio", "reading", "video", "free_form"] as const;
type Filter = typeof FILTERS[number];

type StudentItem = {
  id: number; name: string; surname?: string | null; username: string; avatarEmoji: string | null; avatarColor: string | null;
  avatarUrl?: string | null; knowledgeLevel: string | null;
};

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

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set()); setError(""); setStudents([]);
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
        body: JSON.stringify({ studentIds: Array.from(selected) }),
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
          backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: 24, maxHeight: "85%",
        }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>Назначить задание</Text>
            <TouchableOpacity onPress={onClose}><Feather name="x" size={22} color={colors.mutedForeground} /></TouchableOpacity>
          </View>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 16 }}>
            {assignment?.title} · выбери учеников
          </Text>

          {error ? (
            <View style={{ backgroundColor: "#fff1f2", borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <Text style={{ color: "#be123c", fontSize: 13 }}>{error}</Text>
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 30 }} />
          ) : students.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 30, gap: 8 }}>
              <Text style={{ fontSize: 36 }}>🎓</Text>
              <Text style={{ fontSize: 15, color: colors.mutedForeground, textAlign: "center" }}>
                Нет принятых учеников.{"\n"}Сначала добавьте учеников на вкладке «Ученики».
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 340 }}>
              {students.map((s) => {
                const checked = selected.has(s.id);
                return (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => toggle(s.id)}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 12,
                      padding: 12, borderRadius: 14, marginBottom: 8,
                      backgroundColor: checked ? colors.primary + "15" : colors.card,
                      borderWidth: 1.5,
                      borderColor: checked ? colors.primary : colors.border,
                    }}
                  >
                    <AnimatedAvatar
                      size={42}
                      avatarColor={s.avatarColor ?? "#6366f1"}
                      avatarEmoji={s.avatarEmoji}
                      avatarUrl={s.avatarUrl}
                    />
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: colors.foreground }}>
                      {s.username}{s.name || s.surname ? ` (${[s.name, s.surname].filter(Boolean).join(" ")})` : ""}
                    </Text>
                    <View style={{
                      width: 22, height: 22, borderRadius: 11,
                      borderWidth: 2, borderColor: checked ? colors.primary : colors.border,
                      backgroundColor: checked ? colors.primary : "transparent",
                      justifyContent: "center", alignItems: "center",
                    }}>
                      {checked && <Feather name="check" size={13} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {students.length > 0 && (
            <TouchableOpacity
              style={{
                backgroundColor: selected.size > 0 ? colors.primary : colors.muted,
                borderRadius: 14, paddingVertical: 15,
                alignItems: "center", marginTop: 16,
                flexDirection: "row", justifyContent: "center", gap: 8,
              }}
              onPress={send}
              disabled={selected.size === 0 || sending}
            >
              {sending
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Feather name="send" size={18} color="#fff" />
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff" }}>
                      Отправить {selected.size > 0 ? `(${selected.size})` : ""}
                    </Text>
                  </>
              }
            </TouchableOpacity>
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
  }, [loadMyTasks, loadMyAssignments, loadTeacherSubs, loadMyCompleted]));

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

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 12,
      backgroundColor: colors.background,
    },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontSize: 26, fontWeight: "800", color: colors.foreground },
    addBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: colors.primary, justifyContent: "center", alignItems: "center",
    },
    levelBanner: {
      flexDirection: "row", alignItems: "center", gap: 8,
      borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
      marginTop: 8, borderWidth: 1,
    },
    levelBannerText: { fontSize: 13, fontWeight: "700" },
    searchBox: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: colors.muted, borderRadius: 12, paddingHorizontal: 12,
      paddingVertical: Platform.OS === "web" ? 9 : 8, marginTop: 10,
      borderWidth: 1, borderColor: colors.border,
    },
    searchInput: {
      flex: 1, fontSize: 14, color: colors.foreground,
      ...(Platform.OS === "web" ? { outlineWidth: 0 } as any : {}),
    },
    filterRow: { flexDirection: "row", gap: 8, paddingVertical: 12 },
    filterBtn: {
      paddingHorizontal: 14, paddingVertical: 7,
      borderRadius: 20, borderWidth: 1.5, borderColor: colors.border,
      backgroundColor: colors.card,
    },
    filterBtnActive: { borderColor: colors.primary, backgroundColor: colors.secondary },
    filterText: { fontSize: 13, fontWeight: "600", color: colors.mutedForeground },
    filterTextActive: { color: colors.primary },
    list: { paddingHorizontal: 20, paddingBottom: insets.bottom + 90 },
    card: {
      backgroundColor: colors.card, borderRadius: 16, padding: 16,
      marginBottom: 12, borderWidth: 0,
      shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
    },
    assignedCard: {
      backgroundColor: colors.primary + "08", borderRadius: 16, padding: 16,
      marginBottom: 10, borderWidth: 1.5, borderColor: colors.primary + "40",
    },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
    typeIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center" },
    cardTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, flex: 1 },
    cardDesc: { fontSize: 13, color: colors.mutedForeground, lineHeight: 18, marginBottom: 10 },
    cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 },
    cardActions: { flexDirection: "row", gap: 8, marginTop: 10 },
    typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    typeBadgeText: { fontSize: 12, fontWeight: "600" },
    pointsBadge: {
      flexDirection: "row", alignItems: "center", gap: 4,
      paddingHorizontal: 10, paddingVertical: 4,
      backgroundColor: "#fce7f3", borderRadius: 8,
    },
    pointsText: { fontSize: 12, fontWeight: "700", color: "#9d174d" },
    ageText: { fontSize: 12, color: colors.mutedForeground },
    actionBtn: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1,
    },
    actionBtnText: { fontSize: 13, fontWeight: "700" },
    sectionLabel: {
      fontSize: 12, fontWeight: "700", color: colors.mutedForeground,
      textTransform: "uppercase", letterSpacing: 0.6,
      marginBottom: 10, marginTop: 4,
    },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
    emptyText: { fontSize: 16, color: colors.mutedForeground, textAlign: "center" },
    teacherTag: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: colors.primary + "15", borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8, alignSelf: "flex-start",
    },
    modeToggle: {
      flexDirection: "row", backgroundColor: colors.muted,
      borderRadius: 14, padding: 3, marginTop: 10,
    },
    modeBtn: {
      flex: 1, paddingVertical: 8, borderRadius: 12,
      alignItems: "center", justifyContent: "center",
    },
    modeBtnActive: { backgroundColor: colors.card, shadowColor: "#7c3aed", shadowOpacity: 0.1, shadowRadius: 6, elevation: 3 },
    modeBtnText: { fontSize: 13, fontWeight: "600", color: colors.mutedForeground },
    modeBtnTextActive: { color: colors.foreground },
    subCard: {
      backgroundColor: colors.card, borderRadius: 16, padding: 14,
      marginBottom: 10, borderWidth: 1, borderColor: colors.border,
    },
    scoreBadge: {
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
      alignSelf: "flex-start",
    },
  });

  const renderMyTaskCard = ({ item }: { item: any }) => {
    const color = TYPE_COLORS[item.type] || colors.primary;
    return (
      <TouchableOpacity
        style={styles.assignedCard}
        onPress={() => router.push(`/(main)/assignment/${item.assignmentId}` as any)}
        activeOpacity={0.75}
      >
        <View style={styles.teacherTag}>
          <Feather name="send" size={11} color={colors.primary} />
          <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>
            от {item.teacherName}
          </Text>
        </View>
        <View style={styles.cardHeader}>
          <View style={[styles.typeIcon, { backgroundColor: color + "20" }]}>
            <Feather name={TYPE_ICONS[item.type] ?? "edit-3"} size={22} color={color} />
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        </View>
        <View style={styles.cardFooter}>
          <View style={[styles.typeBadge, { backgroundColor: color + "15" }]}>
            <Text style={[styles.typeBadgeText, { color }]}>{TYPE_LABELS[item.type] ?? item.type}</Text>
          </View>
          <View style={styles.pointsBadge}>
            <Feather name="star" size={12} color="#9d174d" />
            <Text style={styles.pointsText}>{item.points > 0 ? `${item.points} очков` : "по проверке"}</Text>
          </View>
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
        style={[styles.card, isDraft && { borderColor: colors.border, borderStyle: "dashed" }]}
      >
        {/* Title area tappable → navigate to detail */}
        <TouchableOpacity
          onPress={() => router.push(`/(main)/assignment/${item.id}` as any)}
          activeOpacity={0.75}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.typeIcon, { backgroundColor: color + "20" }]}>
              <Feather name={TYPE_ICONS[item.type]} size={22} color={color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              {isDraft && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                  <Feather name="edit-2" size={11} color={colors.mutedForeground} />
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, fontWeight: "600" }}>Черновик</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>

        {/* Action buttons — independent from navigation area */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: colors.primary, backgroundColor: colors.primary + "10", flex: undefined, paddingHorizontal: 12 }]}
            onPress={() => setAssignTarget(item)}
          >
            <Feather name="send" size={14} color={colors.primary} />
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>Назначить</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.card, flex: undefined, paddingHorizontal: 12 }]}
            onPress={() => router.push(`/(main)/teacher-results/${item.id}` as any)}
          >
            <Feather name="bar-chart-2" size={14} color={colors.mutedForeground} />
            <Text style={[styles.actionBtnText, { color: colors.mutedForeground }]}>Итоги</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: "#fda4af", backgroundColor: "#fff1f2", flex: undefined, paddingHorizontal: 12 }]}
            onPress={() => setConfirmDelete({ id: item.id, title: item.title })}
          >
            {deletingId === item.id
              ? <ActivityIndicator size="small" color="#be123c" />
              : <Feather name="trash-2" size={14} color="#be123c" />
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
    const scoreColor = score >= 70 ? colors.success : score >= 40 ? "#ec4899" : colors.destructive;
    return (
      <TouchableOpacity
        key={`${item.assignedTaskId}`}
        style={styles.subCard}
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
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>{item.studentName}</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground }} numberOfLines={1}>{item.assignmentTitle}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={[styles.scoreBadge, { backgroundColor: scoreColor + "18" }]}>
              <Text style={{ fontSize: 16, fontWeight: "900", color: scoreColor }}>{score}%</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <View style={[styles.typeBadge, { backgroundColor: color + "15" }]}>
            <Text style={[styles.typeBadgeText, { color }]}>{TYPE_LABELS[item.assignmentType] ?? item.assignmentType}</Text>
          </View>
          <Text style={styles.ageText}>
            {item.submission.correctCount}/{item.submission.totalQuestions} правильно
          </Text>
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
    const scoreColor = item.score >= 70 ? colors.success : item.score >= 40 ? "#ec4899" : colors.destructive;
    return (
      <TouchableOpacity
        key={`${item.submissionId}`}
        style={styles.subCard}
        onPress={() => router.push(`/(main)/submission-review/${item.submissionId}` as any)}
        activeOpacity={0.75}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <View style={[styles.typeIcon, { backgroundColor: color + "20" }]}>
            <Feather name={TYPE_ICONS[item.type] ?? "edit-3"} size={20} color={color} />
          </View>
          <Text style={[styles.cardTitle, { flex: 1 }]} numberOfLines={2}>{item.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={[styles.scoreBadge, { backgroundColor: scoreColor + "18" }]}>
              <Text style={{ fontSize: 16, fontWeight: "900", color: scoreColor }}>{item.score}%</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <View style={[styles.typeBadge, { backgroundColor: color + "15" }]}>
            <Text style={[styles.typeBadgeText, { color }]}>{TYPE_LABELS[item.type] ?? item.type}</Text>
          </View>
          <Text style={styles.ageText}>{item.correctCount}/{item.totalQuestions} правильно</Text>
          <View style={styles.pointsBadge}>
            <Feather name="star" size={12} color="#9d174d" />
            <Text style={styles.pointsText}>+{item.pointsEarned} очков</Text>
          </View>
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
            <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/(main)/create-assignment" as any)}>
              <Feather name="plus" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>


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
          >
            <Text style={[styles.modeBtnText, viewMode === "tasks" && styles.modeBtnTextActive]}>
              {isTeacher ? "Мои задания" : "Назначенные"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, viewMode === "results" && styles.modeBtnActive]}
            onPress={() => setViewMode("results")}
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
              <Feather name="search" size={16} color={colors.mutedForeground} />
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
                <TouchableOpacity onPress={() => setSearch("")}>
                  <Feather name="x" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              horizontal
              data={FILTERS}
              keyExtractor={(f) => f}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              renderItem={({ item: f }) => (
                <TouchableOpacity
                  style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
                  onPress={() => setFilter(f)}
                >
                  <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                    {f === "Все" ? "Все" : TYPE_LABELS[f]}
                  </Text>
                </TouchableOpacity>
              )}
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
                  <Feather name="inbox" size={48} color={colors.mutedForeground} />
                  <Text style={styles.emptyText}>Ответов ещё нет</Text>
                </View>
              );
              return (
                <>
                  <Text style={styles.sectionLabel}>Ответы учеников · {withSub.length}</Text>
                  {withSub
                    .sort((a, b) => new Date(b.submission.submittedAt).getTime() - new Date(a.submission.submittedAt).getTime())
                    .map(renderTeacherSubCard)
                  }
                </>
              );
            })()}

            {isStudent && (() => {
              if (myCompleted.length === 0) return (
                <View style={[styles.empty, { paddingTop: 40 }]}>
                  <Feather name="check-circle" size={48} color={colors.mutedForeground} />
                  <Text style={styles.emptyText}>Выполненных заданий пока нет</Text>
                </View>
              );
              return (
                <>
                  <Text style={styles.sectionLabel}>Выполненные · {myCompleted.length}</Text>
                  {myCompleted.map(renderCompletedCard)}
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
            {/* Teacher: only own assignments */}
            {isTeacher && (() => {
              const filtered = myAssignments.filter(a =>
                (filter === "Все" || a.type === filter) &&
                (!searchLower || a.title.toLowerCase().includes(searchLower))
              );
              if (filtered.length === 0) return (
                <View style={[styles.empty, { paddingTop: 40 }]}>
                  <Feather name="inbox" size={48} color={colors.mutedForeground} />
                  <Text style={styles.emptyText}>Заданий пока нет.{"\n"}Нажмите + чтобы создать первое.</Text>
                </View>
              );
              return (
                <>
                  <Text style={styles.sectionLabel}>Мои задания · {filtered.length}</Text>
                  {filtered.map(renderMyAssignmentCard)}
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
                  <Feather name="check-circle" size={48} color={colors.mutedForeground} />
                  <Text style={styles.emptyText}>
                    {"Учитель ещё не назначил заданий"}
                  </Text>
                </View>
              );
              return (
                <>
                  <Text style={styles.sectionLabel}>Назначено учителем · {filtered.length}</Text>
                  {filtered.map((item: any) => (
                    <View key={item.assignedTaskId}>{renderMyTaskCard({ item })}</View>
                  ))}
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
