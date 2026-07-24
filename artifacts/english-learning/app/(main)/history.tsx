import React from "react";
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, Platform, TouchableOpacity,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useGetStudentSubmissions } from "@workspace/api-client-react";
import { useRouter } from "expo-router";

const TYPE_ICONS: Record<string, any> = {
  text_test: "edit-3",
  audio: "headphones",
  reading: "book",
  video: "video",
};

const TYPE_LABELS: Record<string, string> = {
  text_test: "Тест",
  audio: "Аудирование",
  reading: "Чтение",
  video: "Видео",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function HistoryScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: submissions, isLoading } = useGetStudentSubmissions(
    user?.id || 0,
    { query: { enabled: !!user?.id } as any }
  );

  const sorted = [...(submissions ?? [])].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );

  const getScoreColor = (score: number) => {
    if (score >= 80) return "#6366f1";
    if (score >= 60) return "#ec4899";
    return "#e11d48";
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 16,
    },
    title: { fontSize: 26, fontWeight: "800", color: colors.foreground, marginBottom: 4 },
    subtitle: { fontSize: 14, color: colors.mutedForeground },
    list: { paddingHorizontal: 20, paddingBottom: insets.bottom + 100 },
    card: {
      backgroundColor: colors.card, borderRadius: 16, padding: 16,
      marginBottom: 10, borderWidth: 0,
      shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
    },
    cardTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
    typeIcon: { width: 42, height: 42, borderRadius: 12, justifyContent: "center", alignItems: "center" },
    cardTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.foreground },
    divider: { height: 1, backgroundColor: colors.border, marginBottom: 8 },
    progressBar: { height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 3 },
    questionsText: { fontSize: 12, color: colors.mutedForeground, marginTop: 4, marginBottom: 6 },
    scoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 },
    scoreBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 4 },
    scoreText: { fontSize: 13, fontWeight: "800" },
    pointsChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fce7f3", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    pointsText: { fontSize: 12, fontWeight: "700", color: "#9d174d" },
    dateText: { fontSize: 12, color: colors.mutedForeground },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 14 },
    emptyEmoji: { fontSize: 52 },
    emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.foreground },
    emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
  });

  const renderItem = ({ item }: { item: any }) => {
    const score = item.score ?? 0;
    const color = getScoreColor(score);

    return (
      <TouchableOpacity style={s.card} onPress={() => router.push(`/submission-review/${item.id}` as any)} activeOpacity={0.75}>
        <View style={s.cardTop}>
          <View style={[s.typeIcon, { backgroundColor: colors.primary + "18" }]}>
            <Feather name={TYPE_ICONS[(item.assignment as any)?.type ?? ""] ?? "file"} size={20} color={colors.primary} />
          </View>
          <Text style={s.cardTitle} numberOfLines={2}>
            {(item.assignment as any)?.title ?? `Задание #${item.assignmentId}`}
          </Text>
        </View>

        <View style={s.divider} />

        {item.totalQuestions > 0 && (
          <>
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${score}%` as any, backgroundColor: color }]} />
            </View>
            <Text style={s.questionsText}>
              {item.correctCount} из {item.totalQuestions} правильных
            </Text>
          </>
        )}

        <View style={s.scoreRow}>
          <View style={[s.scoreBadge, { backgroundColor: color + "18" }]}>
            <Feather name="bar-chart-2" size={12} color={color} />
            <Text style={[s.scoreText, { color }]}>{score}%</Text>
          </View>
          {item.pointsEarned > 0 && (
            <View style={s.pointsChip}>
              <Feather name="star" size={12} color="#9d174d" />
              <Text style={s.pointsText}>+{item.pointsEarned} очков</Text>
            </View>
          )}
          <Text style={s.dateText}>
            {formatDate(item.submittedAt)} · {formatTime(item.submittedAt)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
          <Text style={{ fontSize: 12, color: colors.mutedForeground, marginLeft: 4 }}>Подробнее</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>История заданий</Text>
        <Text style={s.subtitle}>
          {sorted.length > 0
            ? `Выполнено заданий: ${sorted.length}`
            : "Ещё нет выполненных заданий"}
        </Text>
      </View>

      {isLoading ? (
        <View style={s.empty}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : sorted.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyEmoji}>📋</Text>
          <Text style={s.emptyTitle}>История пуста</Text>
          <Text style={s.emptyText}>Выполняй задания и они{"\n"}появятся здесь</Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={s.list}
        />
      )}
    </View>
  );
}
