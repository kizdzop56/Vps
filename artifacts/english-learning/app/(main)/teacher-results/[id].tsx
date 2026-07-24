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
  assignmentId: number;
  assignmentTitle: string;
  assignmentType: string;
  assignmentPoints: number;
  assignmentMediaUrl: string | null;
  assignmentImageUrl: string | null;
  assignedAt: string;
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
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
    statsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
    statCard: {
      flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14,
      alignItems: "center", borderWidth: 0,
      shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1, shadowRadius: 10, elevation: 4,
    },
    statVal: { fontSize: 22, fontWeight: "900", color: colors.foreground, marginTop: 6 },
    statLabel: { fontSize: 11, color: colors.mutedForeground },
    studentCard: {
      backgroundColor: colors.card, borderRadius: 16, padding: 16,
      borderWidth: 0, marginBottom: 10,
      shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
    },
    studentRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    avatar: {
      width: 46, height: 46, borderRadius: 23,
      justifyContent: "center", alignItems: "center",
    },
    scoreBox: { alignItems: "flex-end" },
    scoreNum: { fontSize: 22, fontWeight: "900" },
    scoreSub: { fontSize: 11, color: colors.mutedForeground },
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
    pendingTag: {
      backgroundColor: "#fce7f3", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    },
    sectionLabel: {
      fontSize: 12, fontWeight: "700", color: colors.mutedForeground,
      textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10,
    },
    deleteBtn: {
      width: 32, height: 32, borderRadius: 10,
      backgroundColor: "#fff1f2", borderWidth: 1, borderColor: "#fda4af",
      justifyContent: "center", alignItems: "center",
    },
  });

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
          <Text style={{ fontSize: 40 }}>😕</Text>
          <Text style={{ color: colors.mutedForeground }}>{error}</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={s.center}>
          <Text style={{ fontSize: 48 }}>📭</Text>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>Никому не назначено</Text>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
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
            const openInModal = (kind: MediaKind) => setMediaModal({ url: mUrl, kind });

            if (isVideo) return (
              <View style={{ backgroundColor: "#fce7f3", borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#ec489940", gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name="video" size={16} color="#ec4899" />
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
              <Feather name="users" size={20} color={colors.primary} />
              <Text style={s.statVal}>{results.length}</Text>
              <Text style={s.statLabel}>Назначено</Text>
            </View>
            <View style={s.statCard}>
              <Feather name="check-circle" size={20} color="#6366f1" />
              <Text style={[s.statVal, { color: "#6366f1" }]}>{submitted.length}</Text>
              <Text style={s.statLabel}>Выполнили</Text>
            </View>
            <View style={s.statCard}>
              <Feather name="star" size={20} color="#ec4899" />
              <Text style={[s.statVal, { color: "#ec4899" }]}>
                {avgScore !== null ? `${avgScore}%` : "—"}
              </Text>
              <Text style={s.statLabel}>Средний балл</Text>
            </View>
          </View>

          {/* Submitted */}
          {submitted.length > 0 && (
            <>
              <Text style={s.sectionLabel}>Выполнили · {submitted.length}</Text>
              {submitted.map((r) => {
                const sub = r.submission!;
                const isPendingReview = sub.status === "pending";
                const scoreColor = sub.score >= 70 ? "#6366f1" : sub.score >= 50 ? "#ec4899" : "#e11d48";
                const isExpanded = expanded.has(r.assignedTaskId);
                const isDeleting = deletingId === r.assignedTaskId;
                const isGrading = gradingId === sub.id;
                return (
                  <View key={r.assignedTaskId} style={s.studentCard}>
                    <View style={s.studentRow}>
                      <View style={[s.avatar, { backgroundColor: r.studentAvatarColor ?? "#6366f1" }]}>
                        <Text style={{ fontSize: 22 }}>{r.studentAvatarEmoji ?? "🦁"}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>
                          {r.studentName}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                          {isPendingReview ? "Ждёт проверки" : `${sub.correctCount}/${sub.totalQuestions} правильных`}
                        </Text>
                      </View>
                      {isPendingReview ? (
                        <View style={s.pendingTag}>
                          <Text style={{ fontSize: 12, fontWeight: "600", color: "#9d174d" }}>На проверке</Text>
                        </View>
                      ) : (
                        <View style={s.scoreBox}>
                          <Text style={[s.scoreNum, { color: scoreColor }]}>{sub.score}%</Text>
                          <Text style={s.scoreSub}>+{sub.pointsEarned} ⭐</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={s.deleteBtn}
                        onPress={() => handleUnassign(r)}
                        disabled={isDeleting}
                      >
                        {isDeleting
                          ? <ActivityIndicator size="small" color="#be123c" />
                          : <Feather name="trash-2" size={15} color="#be123c" />
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
                                const col = pct >= 70 ? "#6366f1" : pct >= 40 ? "#ec4899" : "#e11d48";
                                return (
                                  <View style={{ alignItems: "center", marginTop: 16 }}>
                                    <Text style={{ fontSize: 22, fontWeight: "900", color: col }}>{pct}%</Text>
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
                            <View style={{ backgroundColor: "#fff1f2", borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: "#fda4af" }}>
                              <Text style={{ color: "#be123c", fontSize: 13, fontWeight: "600" }}>{gradeError[sub.id]}</Text>
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
                                <Feather name="check-circle" size={16} color="#fff" />
                                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>Выставить оценку</Text>
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
                        <Feather
                          name={isExpanded ? "chevron-up" : "chevron-down"}
                          size={16} color={colors.mutedForeground}
                        />
                        <Text style={{ fontSize: 13, color: colors.mutedForeground, fontWeight: "600" }}>
                          {isExpanded ? "Скрыть ответы" : "Показать ответы"}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {isExpanded && r.answers.map((a, i) => (
                      <View
                        key={a.id}
                        style={[s.answerRow, {
                          borderColor: a.isCorrect ? "#6366f140" : "#e11d4840",
                          backgroundColor: a.isCorrect ? "#eef2ff" : "#fff1f2",
                        }]}
                      >
                        <Feather
                          name={a.isCorrect ? "check-circle" : "x-circle"}
                          size={16}
                          color={a.isCorrect ? "#6366f1" : "#e11d48"}
                          style={{ marginTop: 2 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={s.qText}>{i + 1}. {a.questionText}</Text>
                          <Text style={[s.aText, { color: a.isCorrect ? "#6366f1" : "#e11d48", fontWeight: "600" }]}>
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
                return (
                  <View key={r.assignedTaskId} style={[s.studentCard, { opacity: isDeleting ? 0.5 : 0.85 }]}>
                    <View style={s.studentRow}>
                      <View style={[s.avatar, { backgroundColor: r.studentAvatarColor ?? "#6366f1" }]}>
                        <Text style={{ fontSize: 22 }}>{r.studentAvatarEmoji ?? "🦁"}</Text>
                      </View>
                      <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: colors.foreground }}>
                        {r.studentName}
                      </Text>
                      <View style={s.pendingTag}>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: "#9d174d" }}>Ожидает</Text>
                      </View>
                      <TouchableOpacity
                        style={s.deleteBtn}
                        onPress={() => handleUnassign(r)}
                        disabled={isDeleting}
                      >
                        {isDeleting
                          ? <ActivityIndicator size="small" color="#be123c" />
                          : <Feather name="trash-2" size={15} color="#be123c" />
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
