// Статистика изучения: сводка + столбчатый график повторений по дням
// (зелёная часть столбца — правильные ответы). Графика на react-native-svg.
import React from "react";
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Svg, { Rect, Line, Text as SvgText } from "react-native-svg";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { fc } from "@/hooks/useFlashcards";

export default function StatsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const statsQ = useQuery({ queryKey: ["fc-stats"], queryFn: () => fc.getStats() });

  const s = statsQ.data;
  const screenW = Dimensions.get("window").width;
  const chartW = screenW - 32 - 28;
  const chartH = 150;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, paddingBottom: 120 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}><Feather name="arrow-left" size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: "900", color: colors.foreground }}>Статистика</Text>
      </View>

      {statsQ.isLoading || !s ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
            <StatCard colors={colors} value={s.totalLearned} label="Выучено слов" icon="check-circle" />
            <StatCard colors={colors} value={s.totalWords} label="В изучении" icon="book" />
            <StatCard colors={colors} value={s.totalReviews} label="Повторений" icon="refresh-cw" />
            <StatCard colors={colors} value={`${s.accuracy}%`} label="Правильных" icon="target" />
          </View>

          <Text style={{ fontSize: 13, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 12 }}>
            Повторения за 14 дней
          </Text>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
            <DailyBars daily={s.daily} colors={colors} chartW={chartW} chartH={chartH} />
            <View style={{ flexDirection: "row", gap: 16, marginTop: 12, justifyContent: "center" }}>
              <Legend colors={colors} color={colors.success} label="правильно" />
              <Legend colors={colors} color={colors.warning} label="ошибки" />
            </View>
          </View>

          {s.totalReviews === 0 && (
            <Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: 18, fontSize: 13 }}>
              Пройди первые карточки — и здесь появится твой прогресс.
            </Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

function DailyBars({ daily, colors, chartW, chartH }: any) {
  const max = Math.max(1, ...daily.map((d: any) => d.reviews));
  const n = daily.length;
  const slot = chartW / n;
  const bw = slot * 0.6;
  const padLeft = 24;
  const baseY = chartH - 18;
  return (
    <Svg width={chartW + padLeft} height={chartH}>
      {/* базовая линия */}
      <Line x1={padLeft} y1={baseY} x2={chartW + padLeft} y2={baseY} stroke={colors.border} strokeWidth={1} />
      {daily.map((d: any, i: number) => {
        const totalH = (d.reviews / max) * (baseY - 6);
        const correctH = d.reviews > 0 ? (d.correct / d.reviews) * totalH : 0;
        const x = padLeft + i * slot + (slot - bw) / 2;
        const wrongY = baseY - totalH;
        const correctY = baseY - correctH;
        const label = d.date.slice(8, 10); // день месяца
        return (
          <React.Fragment key={i}>
            {totalH > 0 && <Rect x={x} y={wrongY} width={bw} height={totalH} rx={3} fill={colors.warning} opacity={0.85} />}
            {correctH > 0 && <Rect x={x} y={correctY} width={bw} height={correctH} rx={3} fill={colors.success} />}
            <SvgText x={x + bw / 2} y={chartH - 4} fontSize={8} fill={colors.mutedForeground} textAnchor="middle">{label}</SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

function StatCard({ colors, value, label, icon }: any) {
  return (
    <View style={{ width: "47%", flexGrow: 1, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
      <Feather name={icon} size={18} color={colors.primary} />
      <Text style={{ fontSize: 26, fontWeight: "900", color: colors.foreground, marginTop: 6 }}>{value}</Text>
      <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{label}</Text>
    </View>
  );
}

function Legend({ colors, color, label }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{label}</Text>
    </View>
  );
}
