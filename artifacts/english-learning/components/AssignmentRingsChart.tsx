import React from "react";
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";

// count   — проверенные сдачи (по ним считается avgScore)
// pending — сданные и ждущие проверки учителя (у free_form это норма)
export type CategoryStat = {
  type: string;
  avgScore: number | null;
  count: number;
  pending?: number;
};

const TYPE_LABELS: Record<string, string> = {
  text_test: "Тесты",
  audio: "Аудирование",
  reading: "Чтение",
  video: "Видео",
  free_form: "Свободные",
};

const RING_COLORS: Record<string, string> = {
  text_test: "#8b5cf6",
  audio: "#6366f1",
  reading: "#d946ef",
  video: "#ec4899",
  free_form: "#a855f7",
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
  // В график попадает категория, где есть хоть одна сдача — проверенная или
  // ждущая проверки. Раньше условие было только count > 0, поэтому сданная и
  // непроверенная работа нигде не отражалась.
  const withData = stats
    .filter((s) => s.count > 0 || (s.pending ?? 0) > 0)
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
    .slice(0, 4);

  // Кольца рисуем только для проверенных: у работы на проверке процента нет.
  const withRings = withData.filter((s) => s.count > 0);

  if (withData.length === 0) {
    return (
      <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 20, gap: 8 }}>
        <Text style={{ fontSize: 30 }}>📊</Text>
        <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center" }}>
          Реши задание — здесь появится результат
        </Text>
      </View>
    );
  }

  return (
    <View style={{ alignItems: "center", gap: 12 }}>
      {withRings.length > 0 && (
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {withRings.map((stat, i) => {
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
                {pct > 0 && (
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
                )}
                {pct > 0 && (
                  <Circle cx={dotX} cy={dotY} r={4.5} fill={color} />
                )}
              </React.Fragment>
            );
          })}
        </Svg>
      )}

      <View style={{ width: "100%", gap: 6 }}>
        {withData.map((stat) => {
          const color = RING_COLORS[stat.type] ?? colors.primary;
          const pending = stat.pending ?? 0;
          return (
            <View key={stat.type} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
              <Text style={{ flex: 1, fontSize: 11, fontWeight: "600", color: colors.foreground }} numberOfLines={1}>
                {TYPE_LABELS[stat.type] ?? stat.type}
                {stat.count > 0 ? ` · ${stat.count}` : ""}
              </Text>
              {stat.count > 0 ? (
                <Text style={{ fontSize: 11, fontWeight: "800", color }}>
                  {stat.avgScore ?? 0}%
                </Text>
              ) : (
                <Text style={{ fontSize: 10, fontWeight: "700", color: colors.mutedForeground }}>
                  {pending} на проверке
                </Text>
              )}
            </View>
          );
        })}

        {/* Проверенные есть, но часть работ ещё ждёт учителя — иначе непонятно,
            почему сдач больше, чем в процентах. */}
        {withData.some((s) => s.count > 0 && (s.pending ?? 0) > 0) && (
          <Text style={{ fontSize: 10, color: colors.mutedForeground, marginTop: 2 }}>
            На проверке: {withData.reduce((sum, s) => sum + (s.count > 0 ? (s.pending ?? 0) : 0), 0)}
          </Text>
        )}
      </View>
    </View>
  );
}
