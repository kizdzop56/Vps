// Итоги задания у учителя: кто сдал, с каким баллом, кто ещё нет.
//
// Здесь же живёт работа со сроком сдачи. Срок ставится при отправке задания
// (модалка на вкладке «Задания»), но его часто нужно сдвинуть уже потом:
// ученик заболел, урок перенесли. Сдвиг идёт через PATCH
// /api/assigned-tasks/:id/due — назначение остаётся тем же, прогресс попытки
// не теряется.
//
// Эмодзи убраны: значки берутся из своего набора (components/ui/Glyph.tsx),
// как на остальных экранах. Аватар ученика по-прежнему рисует AnimatedAvatar —
// avatarEmoji там пользовательский выбор, а не наша иконка.
import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Alert, Image, TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import authStorage from "@/utils/authStorage";
import { ImageZoomModal } from "@/components/ImageZoomModal";
import { MediaViewerModal, type MediaKind } from "@/components/MediaViewerModal";
import { InlineMediaPlayer } from "@/components/InlineMediaPlayer";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { Glyph } from "@/components/ui/Glyph";
import { Pill } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import { DUE_PRESETS, dueDateFromPreset, formatDue, type DuePresetKey } from "@/utils/dueDate";

const BASE = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string, options?: RequestInit) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    cache: "no-store",
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

type ResultRow = {
  assignedTaskId: number;
  studentId: number;
  studentName: string;
  studentAvatarEmoji: string | null;
  studentAvatarColor: string | null;
  studentAvatarUrl?: string | null;
  assignmentId: number;
  assignmentTitle: string;
  assignmentType: string;
  assignmentPoints: number;
  assignmentMediaUrl: string | null;
  assignmentImageUrl: string | null;
  assignedAt: string;
  /** Срок сдачи этого назначения. null — срока нет. */
  dueAt: string | null;
  submission: {
    id: number;
    score: number;
    correctCount: number;
    totalQuestions: number;
    pointsEarned: number;
    submittedAt: string;
    textAnswer: string | null;
    attachmentUrl: string | null;
    status: string | null;
    teacherFeedback: string | null;
  } | null;
  answers: Array<{
    id: number;
    questionId: number;
    studentAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    questionText: string;
  }>;
};

export default function TeacherResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const assignmentId = parseInt(id || "0", 10);
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [mediaModal, setMediaModal] = useState<{ url: string; kind: MediaKind } | null>(null);
  const [gradeCorrect, setGradeCorrect] = useState<Record<number, string>>({});
  const [gradeTotal, setGradeTotal] = useState<Record<number, string>>({});
  const [gradeFeedback, setGradeFeedback] = useState<Record<number, string>>({});
  const [gradingId, setGradingId] = useState<number | null>(null);
  const [gradeError, setGradeError] = useState<Record<number, string>>({});
  // Открытая панель сдвига срока: id назначения либо null. Панель разворачивается
  // прямо в карточке, а не в модалке: это правка одного поля, ради неё незачем
  // перекрывать весь экран.
  const [dueEditing, setDueEditing] = useState<number | null>(null);
  const [dueSaving, setDueSaving] = useState<number | null>(null);

  const assignmentTitle = results[0]?.assignmentTitle ?? "Задание";

  const load = useCallback(() => {
    setLoading(true);
    apiFetch("/api/assignments/teacher-results")
      .then((all: ResultRow[]) => {
        const filtered = all.filter((r) => r.assignmentId === assignmentId);
        setResults(filtered);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [assignmentId]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /**
   * Сдвиг срока у одного ученика. Обновляем локальный список сразу после
   * ответа сервера — перезагружать весь экран ради одной даты незачем.
   */
  const handleDueChange = async (row: ResultRow, preset: DuePresetKey) => {
    setDueSaving(row.assignedTaskId);
    try {
      const dueAt = dueDateFromPreset(preset);
      await apiFetch(`/api/assigned-tasks/${row.assignedTaskId}/due`, {
        method: "PATCH",
        body: JSON.stringify({ dueAt }),
      });
      setResults((prev) => prev.map((r) =>
        r.assignedTaskId === row.assignedTaskId ? { ...r, dueAt } : r
      ));
      setDueEditing(null);
    } catch (e: any) {
      Alert.alert("Ошибка", e.message ?? "Не удалось изменить срок");
    } finally {
      setDueSaving(null);
    }
  };

  const handleGrade = async (row: ResultRow) => {
    const sub = row.submission!;
    const correctRaw = gradeCorrect[sub.id] ?? "";
    const totalRaw = gradeTotal[sub.id] ?? "";
    const correctNum = parseInt(correctRaw, 10);
    const totalNum = parseInt(totalRaw, 10);
    if (isNaN(correctNum) || isNaN(totalNum) || totalNum < 1 || correctNum < 0 || correctNum > totalNum) {
      setGradeError(prev => ({ ...prev, [sub.id]: "Укажите корректное количество правильных ответов и вопросов" }));
      return;
    }
    setGradeError(prev => ({ ...prev, [sub.id]: "" }));
    setGradingId(sub.id);
    try {
      const updated = await apiFetch(`/api/submissions/${sub.id}/grade`, {
        method: "PATCH",
        body: JSON.stringify({ correctCount: correctNum, totalQuestions: totalNum, feedback: gradeFeedback[sub.id] ?? "" }),
      });
      setResults(prev => prev.map(r => r.assignedTaskId === row.assignedTaskId
        ? { ...r, submission: { ...r.submission!, ...updated } }
        : r
      ));
    } catch (e: any) {
      setGradeError(prev => ({ ...prev, [sub.id]: e.message ?? "Не удалось выставить оценку" }));
    } finally {
      setGradingId(null);
    }
  };

  const handleUnassign = (row: ResultRow) => {
    Alert.alert(
      "Убрать задание у ученика?",
      `«${row.assignmentTitle}» будет удалено из списка у ${row.studentName}`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить",
          style: "destructive",
          onPress: async () => {
            setDeletingId(row.assignedTaskId);
            try {
              await apiFetch(`/api/assigned-tasks/${row.assignedTaskId}`, { method: "DELETE" });
              setResults(prev => prev.filter(r => r.assignedTaskId !== row.assignedTaskId));
            } catch (e: any) {
              Alert.alert("Ошибка", e.message);
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 12,
      flexDirection: "row", alignItems: "center", gap: 12,
    },
    headerTitle: { fontSize: 18, fontWeight: "800", color: colors.foreground, flex: 1 },
    scroll: { paddingHorizontal: 20, paddingBottom: insets.bottom + 40 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingHorizontal: 32 },
    // Плашка под глиф в пустых состояниях: цвет из темы, вид одинаков везде.
    emptyIcon: {
      width: 68, height: 68, borderRadius: radii.md + 4,
      justifyContent: "center", alignItems: "center",
      backgroundColor: colors.primary + "12", borderWidth: 1, borderColor: colors.primary + "28",
    },
    statsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
    statCard: {
      flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14,
      alignItems: "center", borderWidth: 0,
      shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12, shadowRadius: 10, elevation: 4,
    },
    statVal: { fontSize: 22, fontWeight: "900", color: colors.foreground, marginTop: 6, fontVariant: ["tabular-nums"] },
    statLabel: { fontSize: 11, color: colors.mutedForeground },
    studentCard: {
      backgroundColor: colors.card, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: colors.border, marginBottom: 10,
      shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12, shadowRadius: 12, elevation: 4,
    },
    studentRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    scoreBox: { alignItems: "flex-end" },
    scoreNum: { fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] },
    scoreSub: { fontSize: 11, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
    answerRow: {
      flexDirection: "row", gap: 10, alignItems: "flex-start",
      marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1,
    },
    qText: { fontSize: 13, color: colors.foreground, fontWeight: "600", marginBottom: 4 },
    aText: { fontSize: 12 },
    expandBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 4, marginTop: 12, paddingTop: 10,
      borderTopWidth: 1, borderTopColor: colors.border,
    },
    sectionLabel: {
      fontSize: 12, fontWeight: "700", color: colors.mutedForeground,
      textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10,
    },
    deleteBtn: {
      width: 32, height: 32, borderRadius: 10,
      backgroundColor: colors.destructive + "12", borderWidth: 1, borderColor: colors.destructive + "44",
      justifyContent: "center", alignItems: "center",
    },
    dueRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
    dueText: { fontSize: 12, fontWeight: "800" },
    duePanel: {
      marginTop: 12, paddingTop: 12,
      borderTopWidth: 1, borderTopColor: colors.border,
    },
    duePreset: {
      paddingHorizontal: 13, paddingVertical: 7, borderRadius: radii.pill,
      borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card,
    },
    duePresetText: { fontSize: 12.5, fontWeight: "800", color: colors.mutedForeground },
  });

  /** Цвет срока: красный только для просроченного, иначе тревога обесценится. */
  const dueTint = (urgency: string) =>
    urgency === "overdue" ? colors.destructive
      : urgency === "today" ? accents.amber
        : urgency === "soon" ? colors.primary
          : colors.mutedForeground;

  /**
   * Строка срока плюс кнопка «Изменить». Показывается и когда срока нет:
   * учителю нужен способ его поставить, а не только сдвинуть.
   */
  const renderDue = (row: ResultRow) => {
    const due = formatDue(row.dueAt);
    const tint = dueTint(due.urgency);
    const open = dueEditing === row.assignedTaskId;
    return (
      <>
        <TouchableOpacity
          onPress={() => setDueEditing(open ? null : row.assignedTaskId)}
          activeOpacity={0.7}
          style={s.dueRow}
          accessibilityRole="button"
          accessibilityLabel={`Срок: ${due.text}. Изменить`}
        >
          <Glyph
            name={due.urgency === "overdue" ? "alert" : due.urgency === "none" ? "calendar" : "clock"}
            size={12}
            color={tint}
          />
          <Text style={[s.dueText, { color: tint }]}>{due.text}</Text>
          <Glyph name="pen" size={11} color={colors.mutedForeground} />
        </TouchableOpacity>

        {open && (
          <View style={s.duePanel}>
            <Text style={[s.sectionLabel, { marginBottom: 8 }]}>Изменить срок</Text>
            {dueSaving === row.assignedTaskId ? (
              <ActivityIndicator color={colors.primary} style={{ paddingVertical: 10 }} />
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {DUE_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.key}
                    style={s.duePreset}
                    activeOpacity={0.85}
                    onPress={() => handleDueChange(row, preset.key)}
                  >
                    <Text style={s.duePresetText}>{preset.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </>
    );
  };

  if (loading) return (
    <View style={[s.container, s.center]}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );

  const submitted = results.filter((r) => r.submission);
  const pending = results.filter((r) => !r.submission);
  const avgScore = submitted.length > 0
    ? Math.round(submitted.reduce((sum, r) => sum + (r.submission?.score ?? 0), 0) / submitted.length)
    : null;
  // Сколько ещё не сдавших уже просрочили срок: главное число для учителя
  // на этом экране, раньше его негде было увидеть.
  const overdueCount = pending.filter((r) => formatDue(r.dueAt).urgency === "overdue").length;

  return (
    <View style={s.container}>
      <ImageZoomModal uri={zoomImg} onClose={() => setZoomImg(null)} />
      <MediaViewerModal url={mediaModal?.url ?? null} kind={mediaModal?.kind ?? "other"} onClose={() => setMediaModal(null)} />
      <View style={s.header}>
        <TouchableOpacity
          style={{ width: 36, height: 36, justifyContent: "center", alignItems: "center" }}
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={2}>Результаты: {assignmentTitle}</Text>
      </View>

      {error ? (
        <View style={s.center}>
          <View style={[s.emptyIcon, { backgroundColor: colors.destructive + "14", borderColor: colors.destructive + "33" }]}>
            <Glyph name="alert" size={30} color={colors.destructive} />
          </View>
          <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>{error}</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={s.center}>
          <View style={s.emptyIcon}>
            <Glyph name="tray" size={30} color={colors.primary} />
          </View>
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>Никому не назначено</Text>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", lineHeight: 19 }}>
            Назначьте задание ученикам из экрана «Задания»
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* Assignment media */}
          {results[0]?.assignmentImageUrl ? (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setZoomImg(results[0].assignmentImageUrl!)}
              style={{ borderRadius: 14, overflow: "hidden", marginBottom: 16, borderWidth: 1, borderColor: colors.border }}
            >
              <Image source={{ uri: results[0].assignmentImageUrl }} style={{ width: "100%", height: 180, backgroundColor: "#000" }} resizeMode="contain" />
              <View style={{
                position: "absolute", bottom: 8, right: 8,
                backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8,
                paddingHorizontal: 8, paddingVertical: 4,
                flexDirection: "row", alignItems: "center", gap: 4,
              }}>
                <Feather name="zoom-in" size={12} color="#fff" />
              </View>
            </TouchableOpacity>
          ) : null}

          {results[0]?.assignmentMediaUrl ? (() => {
            const mUrl = results[0].assignmentMediaUrl!;
            const aType = results[0].assignmentType;
            const isAudio = (aType === "audio" || /\.(mp3|m4a|wav|ogg|aac)(\?|$)/i.test(mUrl) || mUrl.includes("/upload/audio") || mUrl.includes("kind=audio")) && aType !== "text_test";
            const isVideo = !isAudio && (aType === "video" || aType === "text_test" || mUrl.includes("kind=video") || mUrl.includes("youtube") || mUrl.includes("youtu.be") || /\.(mp4|mov|webm|avi)(\?|$)/i.test(mUrl) || mUrl.includes("/upload/video") || mUrl.includes("/api/storage/objects/"));

            if (isVideo) return (
              <View style={{ backgroundColor: "#fce7f3", borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#ec489940", gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Glyph name="video" size={16} color="#ec4899" />
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#9d174d" }}>Видео к заданию</Text>
                </View>
                <InlineMediaPlayer url={mUrl} kind="video" height={200} />
              </View>
            );

            if (isAudio) return (
              <View style={{ marginBottom: 16 }}>
                <InlineMediaPlayer url={mUrl} kind="audio" />
              </View>
            );

            return (
              <View style={{ marginBottom: 16 }}>
                <InlineMediaPlayer url={mUrl} kind="other" height={200} />
              </View>
            );
          })() : null}

          {/* Summary stats */}
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Glyph name="users" size={20} color={colors.primary} />
              <Text style={s.statVal}>{results.length}</Text>
              <Text style={s.statLabel}>Назначено</Text>
            </View>
            <View style={s.statCard}>
              <Glyph name="check" size={20} color="#6366f1" />
              <Text style={[s.statVal, { color: "#6366f1" }]}>{submitted.length}</Text>
              <Text style={s.statLabel}>Выполнили</Text>
            </View>
            <View style={s.statCard}>
              <Glyph name="star" size={20} color={accents.magenta} />
              <Text style={[s.statVal, { color: accents.magenta }]}>
                {avgScore !== null ? `${avgScore}%` : "—"}
              </Text>
              <Text style={s.statLabel}>Средний балл</Text>
            </View>
          </View>

          {/* Просрочившие — отдельной строкой над списками: это то, ради чего
              учитель чаще всего сюда заходит. */}
          {overdueCount > 0 && (
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 8,
              backgroundColor: colors.destructive + "0f", borderRadius: radii.sm,
              borderWidth: 1, borderColor: colors.destructive + "33",
              paddingHorizontal: 13, paddingVertical: 11, marginBottom: 16,
            }}>
              <Glyph name="alert" size={16} color={colors.destructive} />
              <Text style={{ fontSize: 13, fontWeight: "800", color: colors.destructive, flex: 1 }}>
                {overdueCount} не сдали в срок
              </Text>
            </View>
          )}

          {/* Submitted */}
          {submitted.length > 0 && (
            <>
              <Text style={s.sectionLabel}>Выполнили · {submitted.length}</Text>
              {submitted.map((r) => {
                const sub = r.submission!;
                const isPendingReview = sub.status === "pending";
                const scoreColor = sub.score >= 70 ? "#6366f1" : sub.score >= 50 ? "#ec4899" : colors.destructive;
                const isExpanded = expanded.has(r.assignedTaskId);
                const isDeleting = deletingId === r.assignedTaskId;
                const isGrading = gradingId === sub.id;
                // Сдал после срока: важнее самой даты сдачи, поэтому метка.
                const late = !!r.dueAt && new Date(sub.submittedAt).getTime() > new Date(r.dueAt).getTime();
                return (
                  <View key={r.assignedTaskId} style={s.studentCard}>
                    <View style={s.studentRow}>
                      <AnimatedAvatar
                        size={46}
                        avatarColor={r.studentAvatarColor ?? "#6366f1"}
                        avatarEmoji={r.studentAvatarEmoji}
                        avatarUrl={r.studentAvatarUrl}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>
                          {r.studentName}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                          {isPendingReview ? "Ждёт проверки" : `${sub.correctCount}/${sub.totalQuestions} правильных`}
                        </Text>
                        {late && (
                          <View style={{ flexDirection: "row", marginTop: 5 }}>
                            <Pill text="сдал с опозданием" icon="clock" tone="danger" />
                          </View>
                        )}
                      </View>
                      {isPendingReview ? (
                        <Pill text="На проверке" tone="warn" />
                      ) : (
                        <View style={s.scoreBox}>
                          <Text style={[s.scoreNum, { color: scoreColor }]}>{sub.score}%</Text>
                          <Text style={s.scoreSub}>+{sub.pointsEarned}</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={s.deleteBtn}
                        onPress={() => handleUnassign(r)}
                        disabled={isDeleting}
                      >
                        {isDeleting
                          ? <ActivityIndicator size="small" color={colors.destructive} />
                          : <Glyph name="trash" size={15} color={colors.destructive} />
                        }
                      </TouchableOpacity>
                    </View>

                    {isPendingReview && (
                      <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                        {!!sub.textAnswer && (
                          <View style={{ marginBottom: 10 }}>
                            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                              Ответ ученика
                            </Text>
                            <View style={{
                              backgroundColor: "#ede9fe",
                              borderWidth: 1.5, borderColor: "#c4b5fd",
                              borderRadius: 12, padding: 12,
                            }}>
                              <Text style={{ fontSize: 14, fontWeight: "600", color: "#4c1d95", lineHeight: 20 }}>
                                {sub.textAnswer}
                              </Text>
                            </View>
                          </View>
                        )}
                        {!!sub.attachmentUrl && (
                          <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={() => setZoomImg(sub.attachmentUrl!)}
                            style={{ borderRadius: 10, overflow: "hidden", marginBottom: 10 }}
                          >
                            <Image source={{ uri: sub.attachmentUrl }} style={{ width: "100%", height: 180 }} resizeMode="cover" />
                          </TouchableOpacity>
                        )}
                        {/* Grading inputs: correct / total */}
                        <View style={{ marginTop: 4, marginBottom: 8 }}>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            Результат проверки
                          </Text>
                          <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 8 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 11, color: colors.mutedForeground, marginBottom: 4 }}>Правильных ответов</Text>
                              <TextInput
                                style={{
                                  borderWidth: 1.5, borderColor: "#6366f160", borderRadius: 10,
                                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 16,
                                  fontWeight: "700", color: "#6366f1",
                                  backgroundColor: "#eef2ff", textAlign: "center",
                                }}
                                keyboardType="number-pad"
                                placeholder="0"
                                placeholderTextColor={colors.mutedForeground}
                                value={gradeCorrect[sub.id] ?? ""}
                                onChangeText={(v) => { setGradeCorrect(prev => ({ ...prev, [sub.id]: v.replace(/[^0-9]/g, "") })); setGradeError(prev => ({ ...prev, [sub.id]: "" })); }}
                              />
                            </View>
                            <Text style={{ fontSize: 22, color: colors.mutedForeground, fontWeight: "300", marginTop: 16 }}>/</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 11, color: colors.mutedForeground, marginBottom: 4 }}>Всего вопросов</Text>
                              <TextInput
                                style={{
                                  borderWidth: 1.5, borderColor: colors.border, borderRadius: 10,
                                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 16,
                                  fontWeight: "700", color: colors.foreground,
                                  textAlign: "center",
                                }}
                                keyboardType="number-pad"
                                placeholder="10"
                                placeholderTextColor={colors.mutedForeground}
                                value={gradeTotal[sub.id] ?? ""}
                                onChangeText={(v) => { setGradeTotal(prev => ({ ...prev, [sub.id]: v.replace(/[^0-9]/g, "") })); setGradeError(prev => ({ ...prev, [sub.id]: "" })); }}
                              />
                            </View>
                            {/* Live score preview */}
                            {(() => {
                              const c = parseInt(gradeCorrect[sub.id] ?? "", 10);
                              const t = parseInt(gradeTotal[sub.id] ?? "", 10);
                              if (!isNaN(c) && !isNaN(t) && t > 0) {
                                const pct = Math.round((c / t) * 100);
                                const col = pct >= 70 ? "#6366f1" : pct >= 40 ? "#ec4899" : colors.destructive;
                                return (
                                  <View style={{ alignItems: "center", marginTop: 16 }}>
                                    <Text style={{ fontSize: 22, fontWeight: "900", color: col, fontVariant: ["tabular-nums"] }}>{pct}%</Text>
                                  </View>
                                );
                              }
                              return null;
                            })()}
                          </View>
                          <TextInput
                            style={{
                              borderWidth: 1, borderColor: colors.border, borderRadius: 10,
                              paddingHorizontal: 12, paddingVertical: 10, fontSize: 13,
                              color: colors.foreground, marginBottom: 2,
                            }}
                            placeholder="Комментарий учителя (необязательно)"
                            placeholderTextColor={colors.mutedForeground}
                            value={gradeFeedback[sub.id] ?? ""}
                            onChangeText={(v) => setGradeFeedback(prev => ({ ...prev, [sub.id]: v }))}
                          />
                        </View>
                        {!!gradeError[sub.id] && (() => {
                          const c = parseInt(gradeCorrect[sub.id] ?? "", 10);
                          const t = parseInt(gradeTotal[sub.id] ?? "", 10);
                          const inputsOk = !isNaN(c) && !isNaN(t) && t >= 1 && c >= 0 && c <= t;
                          // Hide the validation-specific error as soon as inputs become valid
                          if (inputsOk && gradeError[sub.id] === "Укажите корректное количество правильных ответов и вопросов") return null;
                          return (
                            <View style={{ backgroundColor: colors.destructive + "12", borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: colors.destructive + "44" }}>
                              <Text style={{ color: colors.destructive, fontSize: 13, fontWeight: "600" }}>{gradeError[sub.id]}</Text>
                            </View>
                          );
                        })()}
                        <TouchableOpacity
                          style={{
                            marginTop: 6, backgroundColor: colors.primary, borderRadius: 10,
                            paddingVertical: 12, alignItems: "center", flexDirection: "row",
                            justifyContent: "center", gap: 6,
                          }}
                          onPress={() => handleGrade(r)}
                          disabled={isGrading}
                        >
                          {isGrading
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <>
                                <Glyph name="check" size={16} color="#fff" />
                                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>Выставить оценку</Text>
                              </>
                          }
                        </TouchableOpacity>
                      </View>
                    )}

                    {!isPendingReview && r.answers.length > 0 && (
                      <TouchableOpacity
                        style={s.expandBtn}
                        onPress={() => toggleExpand(r.assignedTaskId)}
                      >
                        <View style={{ transform: [{ rotate: isExpanded ? "-90deg" : "90deg" }] }}>
                          <Glyph name="chevron" size={16} color={colors.mutedForeground} />
                        </View>
                        <Text style={{ fontSize: 13, color: colors.mutedForeground, fontWeight: "700" }}>
                          {isExpanded ? "Скрыть ответы" : "Показать ответы"}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {isExpanded && r.answers.map((a, i) => (
                      <View
                        key={a.id}
                        style={[s.answerRow, {
                          borderColor: a.isCorrect ? "#6366f140" : colors.destructive + "40",
                          backgroundColor: a.isCorrect ? "#eef2ff" : colors.destructive + "0d",
                        }]}
                      >
                        <View style={{ marginTop: 2 }}>
                          <Glyph
                            name={a.isCorrect ? "check" : "close"}
                            size={16}
                            color={a.isCorrect ? "#6366f1" : colors.destructive}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.qText}>{i + 1}. {a.questionText}</Text>
                          <Text style={[s.aText, { color: a.isCorrect ? "#6366f1" : colors.destructive, fontWeight: "600" }]}>
                            Ответ: {a.studentAnswer}
                          </Text>
                          {!a.isCorrect && (
                            <Text style={[s.aText, { color: "#6366f1", marginTop: 2 }]}>
                              Правильно: {a.correctAnswer}
                            </Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })}
            </>
          )}

          {/* Pending */}
          {pending.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { marginTop: submitted.length > 0 ? 20 : 0 }]}>
                Ещё не выполнили · {pending.length}
              </Text>
              {pending.map((r) => {
                const isDeleting = deletingId === r.assignedTaskId;
                const overdue = formatDue(r.dueAt).urgency === "overdue";
                return (
                  <View
                    key={r.assignedTaskId}
                    style={[
                      s.studentCard,
                      { opacity: isDeleting ? 0.5 : 1 },
                      // Просрочивший не должен выглядеть так же, как тот, у кого
                      // срок ещё есть: рамка и тень в цвете тревоги.
                      overdue
                        ? { borderColor: colors.destructive + "55", shadowColor: colors.destructive }
                        : { opacity: isDeleting ? 0.5 : 0.9 },
                    ]}
                  >
                    <View style={s.studentRow}>
                      <AnimatedAvatar
                        size={46}
                        avatarColor={r.studentAvatarColor ?? "#6366f1"}
                        avatarEmoji={r.studentAvatarEmoji}
                        avatarUrl={r.studentAvatarUrl}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>
                          {r.studentName}
                        </Text>
                        {renderDue(r)}
                      </View>
                      {!overdue && <Pill text="Ожидает" tone="soft" color={colors.primary} />}
                      <TouchableOpacity
                        style={s.deleteBtn}
                        onPress={() => handleUnassign(r)}
                        disabled={isDeleting}
                      >
                        {isDeleting
                          ? <ActivityIndicator size="small" color={colors.destructive} />
                          : <Glyph name="trash" size={15} color={colors.destructive} />
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
