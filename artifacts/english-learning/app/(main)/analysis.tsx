import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Platform, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useColors } from "@/hooks/useColors";
import authStorage from "@/utils/authStorage";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";

const BASE = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token ?? ""}` },
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

type CategoryStat = { type: string; avgScore: number | null; count: number };
type Student = {
  id: number; name: string; surname?: string | null; username: string; avatarEmoji: string | null;
  avatarColor: string | null; avatarUrl?: string | null; knowledgeLevel: string | null;
};
type StudentWithStats = Student & { stats: CategoryStat[]; loading: boolean };

function MiniChart({ stats, colors }: { stats: CategoryStat[]; colors: any }) {
  if (stats.length === 0) return (
    <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", paddingVertical: 16 }}>
      Нет данных — ученик ещё не выполнял заданий
    </Text>
  );

  return (
    <View style={{ gap: 10 }}>
      {stats.map((stat) => {
        const color = TYPE_COLORS[stat.type] ?? colors.primary;
        const pct = stat.avgScore ?? 0;
        const hasData = stat.count > 0 && stat.avgScore !== null;
        return (
          <View key={stat.type}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name={TYPE_ICONS[stat.type]} size={12} color={color} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>{TYPE_LABELS[stat.type]}</Text>
              </View>
              {hasData ? (
                <Text style={{ fontSize: 13, fontWeight: "900", color }}>{pct}%</Text>
              ) : (
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>нет данных</Text>
              )}
            </View>
            <View style={{ height: 8, backgroundColor: colors.muted, borderRadius: 4, overflow: "hidden" }}>
              {hasData && (
                <View style={{ height: 8, width: `${pct}%` as any, backgroundColor: color, borderRadius: 4 }} />
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function AnalysisScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [students, setStudents] = useState<StudentWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setIsLoading(true);

    try {
      const raw: Student[] = await apiFetch("/api/connections/teacher/students");
      const withStats: StudentWithStats[] = raw.map(s => ({ ...s, stats: [], loading: true }));
      setStudents(withStats);
      setIsLoading(false);

      // Load category stats per student in parallel
      const updated = await Promise.all(
        raw.map(async (s) => {
          try {
            const stats: CategoryStat[] = await apiFetch(`/api/students/${s.id}/category-stats`);
            return { ...s, stats: stats ?? [], loading: false };
          } catch {
            return { ...s, stats: [], loading: false };
          }
        })
      );
      setStudents(updated);
    } catch {
      setIsLoading(false);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 16,
    },
    title: { fontSize: 26, fontWeight: "800", color: colors.foreground },
    subtitle: { fontSize: 14, color: colors.mutedForeground, marginTop: 2 },
    scroll: { paddingHorizontal: 20, paddingBottom: insets.bottom + 90 },
    card: {
      backgroundColor: colors.card, borderRadius: 20, padding: 18,
      marginBottom: 16, borderWidth: 0,
      shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
    },
    studentRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
    avatar: {
      width: 48, height: 48, borderRadius: 24,
      justifyContent: "center", alignItems: "center",
    },
    name: { fontSize: 16, fontWeight: "800", color: colors.foreground },
    sub: { fontSize: 12, color: colors.mutedForeground, marginTop: 1 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingBottom: 80 },
    empty: { fontSize: 15, color: colors.mutedForeground, textAlign: "center" },
    divider: {
      height: 1, backgroundColor: colors.border, marginBottom: 16,
    },
  });

  if (isLoading) return (
    <View style={[styles.container, styles.center]}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Анализ</Text>
        <Text style={styles.subtitle}>Индивидуальный прогресс учеников</Text>
      </View>

      {students.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 48 }}>📊</Text>
          <Text style={styles.empty}>
            Нет принятых учеников.{"\n"}Добавьте учеников на вкладке «Ученики».
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
        >
          {students.map((student) => (
            <View key={student.id} style={styles.card}>
              {/* Student header — tap to go to profile */}
              <TouchableOpacity
                style={styles.studentRow}
                onPress={() => router.push(`/(main)/student/${student.id}` as any)}
                activeOpacity={0.7}
              >
                <AnimatedAvatar
                  size={48}
                  avatarColor={student.avatarColor ?? "#6366f1"}
                  avatarEmoji={student.avatarEmoji}
                  avatarUrl={student.avatarUrl}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {student.username}{student.name || student.surname ? ` (${[student.name, student.surname].filter(Boolean).join(" ")})` : ""}
                  </Text>
                  {student.knowledgeLevel ? (
                    <Text style={styles.sub}>{student.knowledgeLevel}</Text>
                  ) : null}
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>

              <View style={styles.divider} />

              {/* Chart */}
              {student.loading ? (
                <ActivityIndicator color={colors.primary} size="small" style={{ paddingVertical: 16 }} />
              ) : (
                <MiniChart stats={student.stats} colors={colors} />
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
