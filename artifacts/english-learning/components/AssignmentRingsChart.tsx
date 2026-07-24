import React from "react";
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";

export type CategoryStat = { type: string; avgScore: number | null; count: number };

const TYPE_LABELS: Record<string, string> = {
  text_test: "Тесты",
  audio: "Аудирование",
  reading: "Чтение",
  video: "Видео",
};

const RING_COLORS: Record<string, string> = {
  text_test: "#8b5cf6",
  audio: "#6366f1",
  reading: "#d946ef",
  video: "#ec4899",
};

const SIZE = 104;
const CENTER = SIZE / 2;
const STROKE = 9;
const GAP = 10;
const BASE_RADIUS = 44;

export function AssignmentRingsChart({
  stats, colors,
}: {
  stats: CategoryStat[];
  colors: any;
}) {
  const withData = stats
    .filter((s) => s.count > 0)
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
    .slice(0, 4);

  if (withData.length === 0) {
    return (
      <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 20, gap: 8 }}>
        <Text style={{ fontSize: 30 }}>📊</Text>
        <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center" }}>
          Пока нет данных
        </Text>
      </View>
    );
  }

  return (
    <View style={{ alignItems: "center", gap: 12 }}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {withData.map((stat, i) => {
          const r = BASE_RADIUS - i * GAP;
          const color = RING_COLORS[stat.type] ?? colors.primary;
          const pct = Math.max(0, Math.min(100, stat.avgScore ?? 0));
          const circumference = 2 * Math.PI * r;
          const dash = (pct / 100) * circumference;
          const dotAngle = (pct / 100) * 2 * Math.PI - Math.PI / 2;
          const dotX = CENTER + r * Math.cos(dotAngle);
          const dotY = CENTER + r * Math.sin(dotAngle);
          return (
            <React.Fragment key={stat.type}>
              <Circle
                cx={CENTER}
                cy={CENTER}
                r={r}
                stroke={colors.muted}
                strokeWidth={STROKE}
                fill="none"
              />
              <Circle
                cx={CENTER}
                cy={CENTER}
                r={r}
                stroke={color}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference - dash}`}
                fill="none"
                transform={`rotate(-90 ${CENTER} ${CENTER})`}
              />
              {pct > 0 && (
                <Circle cx={dotX} cy={dotY} r={4.5} fill={color} />
              )}
            </React.Fragment>
          );
        })}
      </Svg>

      <View style={{ width: "100%", gap: 6 }}>
        {withData.map((stat) => {
          const color = RING_COLORS[stat.type] ?? colors.primary;
          return (
            <View key={stat.type} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
              <Text style={{ flex: 1, fontSize: 11, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                {TYPE_LABELS[stat.type] ?? stat.type}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: "800", color }}>
                {stat.avgScore ?? 0}%
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
