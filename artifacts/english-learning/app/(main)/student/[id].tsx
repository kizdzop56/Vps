import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import authStorage from "@/utils/authStorage";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { AssignmentRingsChart } from "@/components/AssignmentRingsChart";

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);
  return data;
}

const TYPE_COLORS: Record<string, string> = {
  text_test: "#8b5cf6", audio: "#6366f1", reading: "#6366f1", video: "#ec4899", free_form: "#ec4899",
};
const TYPE_LABELS: Record<string, string> = {
  text_test: "Тест", audio: "Аудирование", reading: "Чтение", video: "Видео", free_form: "Свободный ответ",
};
const TYPE_ICONS: Record<string, any> = {
  text_test: "edit-3", audio: "headphones", reading: "book", video: "video", free_form: "file-text",
};
type Submission = {
  submissionId: number; score: number; correctCount: number;
  totalQuestions: number; pointsEarned: number; submittedAt: string;
  assignmentId: number; title: string; type: string; points: number;
};
type CategoryStat = { type: string; avgScore: number | null; count: number };
type FlashcardStats = { totalLearned: number; totalWords: number; totalReviews: number; accuracy: number };


export default function StudentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const studentId = parseInt(id || "0", 10);
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [student, setStudent] = useState<any>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [flashcardStats, setFlashcardStats] = useState<FlashcardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    setIsLoading(true);
    Promise.all([
      apiFetch(`/api/users/${studentId}`),
      apiFetch(`/api/students/${studentId}/submissions`).catch(() => []),
      apiFetch(`/api/students/${studentId}/category-stats`).catch(() => []),
      apiFetch(`/api/flashcards/stats?studentId=${studentId}`).catch(() => null),
    ]).then(([s, subs, stats, fcards]) => {
      setStudent(s);
      setSubmissions(subs ?? []);
      setCategoryStats(stats ?? []);
      setFlashcardStats(fcards ?? null);
    }).finally(() => setIsLoading(false));
  }, [studentId]);

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 12,
      flexDirection: "row", alignItems: "center", gap: 12,
    },
    backBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
    headerTitle: { fontSize: 18, fontWeight: "800", color: colors.foreground, flex: 1 },
    scroll: { paddingHorizontal: 20, paddingBottom: insets.bottom + 40 },
    profileCard: {
      backgroundColor: colors.card, borderRadius: 20, padding: 20,
      borderWidth: 1, borderColor: colors.border, marginBottom: 16,
      alignItems: "center",
    },
    avatar: {
      width: 72, height: 72, borderRadius: 36,
      justifyContent: "center", alignItems: "center", marginBottom: 12,
    },
    name: { fontSize: 22, fontWeight: "800", color: colors.foreground, marginBottom: 2 },
    username: { fontSize: 14, color: colors.mutedForeground, marginBottom: 8 },
    badge: {
      paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
      backgroundColor: colors.muted,
    },
    badgeText: { fontSize: 13, color: colors.mutedForeground, fontWeight: "600" },
    statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
    statCard: {
      flex: 1, minWidth: "44%", backgroundColor: colors.card, borderRadius: 16,
      padding: 14, borderWidth: 0, alignItems: "center", gap: 4,
      shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1, shadowRadius: 10, elevation: 4,
    },
    statValue: { fontSize: 26, fontWeight: "900", color: colors.foreground },
    statLabel: { fontSize: 12, color: colors.mutedForeground, textAlign: "center" },
    section: {
      backgroundColor: colors.card, borderRadius: 16, padding: 16,
      borderWidth: 0, marginBottom: 16,
      shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
    },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 14 },
    subCard: {
      backgroundColor: "rgba(243,240,255,0.6)", borderRadius: 12, padding: 12,
      borderWidth: 1, borderColor: colors.border, marginBottom: 8,
    },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    empty: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", paddingVertical: 20 },
  });

  if (isLoading) {
    return <View style={[styles.container, styles.loading]}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  if (!student) {
    return (
      <View style={[styles.container, styles.loading]}>
        <Feather name="alert-circle" size={40} color={colors.destructive} />
        <Text style={{ marginTop: 12, color: colors.mutedForeground }}>Ученик не найден</Text>
      </View>
    );
  }

  const avgScore = submissions.length > 0
    ? Math.round(submissions.reduce((s, sub) => s + sub.score, 0) / submissions.length)
    : null;

  const totalMins = student.totalTimeMinutes ?? 0;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const timeLabel = hours > 0 ? `${hours}ч ${mins}м` : `${mins}м`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Профиль ученика</Text>
        {/* Кнопка чата с ребёнком — родитель может написать текст, фото, голос */}
        <TouchableOpacity
          onPress={() => router.push(`/(main)/chat/${studentId}` as any)}
          style={{
            flexDirection: "row", alignItems: "center", gap: 6,
            backgroundColor: colors.primary, borderRadius: 12,
            paddingHorizontal: 12, paddingVertical: 8,
          }}
        >
          <Feather name="message-circle" size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Написать</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Profile card */}
        <View style={styles.profileCard}>
          <AnimatedAvatar
            size={64}
            avatarColor={student.avatarColor ?? "#6366f1"}
            avatarEmoji={student.avatarEmoji}
            avatarUrl={student.avatarUrl}
          />
          <Text style={styles.name}>{student.name} ({student.username})</Text>
          {student.age && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{student.age} лет</Text>
            </View>
          )}
          {student.bio ? (
            <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 8, textAlign: "center" }}>
              {student.bio}
            </Text>
          ) : null}
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Feather name="star" size={20} color="#ec4899" />
            <Text style={styles.statValue}>{student.totalPoints ?? 0}</Text>
            <Text style={styles.statLabel}>Очков</Text>
          </View>
          <View style={styles.statCard}>
            <Feather name="check-circle" size={20} color={colors.success} />
            <Text style={styles.statValue}>{submissions.length}</Text>
            <Text style={styles.statLabel}>Выполнено</Text>
          </View>
          <View style={styles.statCard}>
            <Feather name="clock" size={20} color="#6366f1" />
            <Text style={styles.statValue}>{timeLabel}</Text>
            <Text style={styles.statLabel}>Учится</Text>
          </View>
          <View style={styles.statCard}>
            <Feather name="bar-chart-2" size={20} color={colors.primary} />
            <Text style={styles.statValue}>{avgScore !== null ? `${avgScore}%` : "—"}</Text>
            <Text style={styles.statLabel}>Ср. балл</Text>
          </View>
        </View>

        {/* Category chart */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Навыки по областям</Text>
          <AssignmentRingsChart stats={categoryStats} colors={colors} />
        </View>

        {/* Flashcards */}
        {flashcardStats && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Флеш-карточки</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Feather name="award" size={20} color="#22c55e" />
                <Text style={styles.statValue}>{flashcardStats.totalLearned}</Text>
                <Text style={styles.statLabel}>Выучено слов</Text>
              </View>
              <View style={styles.statCard}>
                <Feather name="book-open" size={20} color="#6366f1" />
                <Text style={styles.statValue}>{flashcardStats.totalWords}</Text>
                <Text style={styles.statLabel}>Слов в изучении</Text>
              </View>
              <View style={styles.statCard}>
                <Feather name="repeat" size={20} color="#ec4899" />
                <Text style={styles.statValue}>{flashcardStats.totalReviews}</Text>
                <Text style={styles.statLabel}>Повторений</Text>
              </View>
              <View style={styles.statCard}>
                <Feather name="target" size={20} color={colors.primary} />
                <Text style={styles.statValue}>{flashcardStats.accuracy}%</Text>
                <Text style={styles.statLabel}>Точность</Text>
              </View>
            </View>
          </View>
        )}

        {/* Recent submissions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Последние ответы {submissions.length > 0 ? `(${submissions.length})` : ""}
          </Text>
          {submissions.length === 0 ? (
            <Text style={styles.empty}>Ещё нет выполненных заданий</Text>
          ) : (
            submissions.slice(0, 10).map((sub) => {
              const scoreColor = sub.score >= 70 ? colors.success : sub.score >= 40 ? "#ec4899" : colors.destructive;
              const color = TYPE_COLORS[sub.type] ?? colors.primary;
              return (
                <View key={sub.submissionId} style={styles.subCard}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <Feather name={TYPE_ICONS[sub.type] ?? "edit-3"} size={15} color={color} />
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                      {sub.title ?? "Задание"}
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: "900", color: scoreColor }}>
                      {sub.score}%
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: color + "15" }}>
                      <Text style={{ fontSize: 11, fontWeight: "600", color }}>{TYPE_LABELS[sub.type] ?? sub.type}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                      {sub.correctCount}/{sub.totalQuestions} правильно
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, marginLeft: "auto" as any }}>
                      {new Date(sub.submittedAt).toLocaleDateString("ru-RU")}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

      </ScrollView>
    </View>
  );
}
