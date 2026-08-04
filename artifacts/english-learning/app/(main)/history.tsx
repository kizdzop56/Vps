// Экран истории выполненных заданий ученика.
//
// Эмодзи в интерфейсе не используются: значки — глифы из своего набора.
// Цвета берутся из палитры, оформление совпадает с экраном «Задания», чтобы
// одно и то же задание выглядело одинаково в обоих списках.
import React from "react";
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, Platform, TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useGetStudentSubmissions } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { Pill } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";

/** Значки и цвета видов заданий — те же, что на экранах «Задания» и «Анализ». */
const TYPE_ICONS: Record<string, GlyphName> = {
  text_test: "pen",
  audio: "sound",
  reading: "book",
  video: "video",
  free_form: "note",
};
const TYPE_COLORS: Record<string, string> = {
  text_test: "#8b5cf6", audio: "#6366f1", reading: "#d946ef", video: "#ec4899", free_form: "#f59e0b",
};
const TYPE_LABELS: Record<string, string> = {
  text_test: "Тест",
  audio: "Аудирование",
  reading: "Чтение",
  video: "Видео",
  free_form: "Свободный ответ",
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

  /** Цвет балла в фирменной гамме: зелёного в палитре нет намеренно. */
  const getScoreColor = (score: number) => {
    if (score >= 70) return colors.success;
    if (score >= 50) return accents.amber;
    return colors.destructive;
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 16,
    },
    title: { fontSize: 28, fontWeight: "900", letterSpacing: -0.6, color: colors.foreground, marginBottom: 4 },
    subtitle: { fontSize: 14, color: colors.mutedForeground },
    list: { paddingHorizontal: 20, paddingBottom: insets.bottom + 100 },
    card: {
      backgroundColor: colors.card, borderRadius: radii.md, padding: 16,
      marginBottom: 10, borderWidth: 1, borderColor: colors.border,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.14, shadowRadius: 15, elevation: 4,
    },
    cardTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
    typeIcon: { width: 42, height: 42, borderRadius: radii.sm, justifyContent: "center", alignItems: "center" },
    cardTitle: { flex: 1, fontSize: 15, fontWeight: "800", color: colors.foreground },
    divider: { height: 1, backgroundColor: colors.border, marginBottom: 8 },
    progressBar: { height: 7, borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 4 },
    questionsText: { fontSize: 12, color: colors.mutedForeground, marginTop: 5, marginBottom: 7, fontVariant: ["tabular-nums"] },
    scoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 },
    scoreBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.sm - 2, flexDirection: "row", alignItems: "center", gap: 5 },
    scoreText: { fontSize: 14, fontWeight: "900", fontVariant: ["tabular-nums"] },
    dateText: { fontSize: 12, color: colors.mutedForeground, fontVariant: ["tabular-nums"] },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 14, paddingHorizontal: 24 },
    // Плашка под глиф вместо крупного эмодзи: цвет из темы, лёгкий наклон.
    emptyIcon: {
      width: 72, height: 72, borderRadius: radii.lg, justifyContent: "center", alignItems: "center",
      backgroundColor: colors.primary + "14", borderWidth: 1, borderColor: colors.primary + "2e",
      transform: [{ rotate: "-4deg" }],
    },
    emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.foreground },
    emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
  });

  const renderItem = ({ item }: { item: any }) => {
    const score = item.score ?? 0;
    const scoreColor = getScoreColor(score);
    const type = (item.assignment as any)?.type ?? "";
    // Тень карточки в цвете балла: сильные и слабые работы различимы сразу.
    const typeColor = TYPE_COLORS[type] ?? colors.primary;

    return (
      <TouchableOpacity
        style={[s.card, { shadowColor: scoreColor }]}
        onPress={() => router.push(`/submission-review/${item.id}` as any)}
        activeOpacity={0.75}
      >
        <View style={s.cardTop}>
          <View style={[s.typeIcon, { backgroundColor: typeColor + "1f" }]}>
            <Glyph name={TYPE_ICONS[type] ?? "note"} size={20} color={typeColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle} numberOfLines={2}>
              {(item.assignment as any)?.title ?? `Задание #${item.assignmentId}`}
            </Text>
            {TYPE_LABELS[type] ? (
              <Text style={{ fontSize: 11, fontWeight: "700", color: typeColor, marginTop: 2 }}>
                {TYPE_LABELS[type]}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={s.divider} />

        {item.totalQuestions > 0 && (
          <>
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${score}%` as any, backgroundColor: scoreColor }]} />
            </View>
            <Text style={s.questionsText}>
              {item.correctCount} из {item.totalQuestions} правильных
            </Text>
          </>
        )}

        <View style={s.scoreRow}>
          <View style={[s.scoreBadge, { backgroundColor: scoreColor + "18" }]}>
            <Glyph name="chart" size={12} color={scoreColor} />
            <Text style={[s.scoreText, { color: scoreColor }]}>{score}%</Text>
          </View>
          {item.pointsEarned > 0 && (
            <Pill text={`+${item.pointsEarned}`} icon="star" tone="soft" color={accents.magenta} />
          )}
          <Text style={s.dateText}>
            {formatDate(item.submittedAt)} · {formatTime(item.submittedAt)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 5, marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground }}>Подробнее</Text>
          <Glyph name="chevron" size={14} color={colors.mutedForeground} />
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
          <View style={s.emptyIcon}>
            <Glyph name="tray" size={34} color={colors.primary} />
          </View>
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
