// ─────────────────────────────────────────────────────────────────────────────
// Кольца результатов по типам заданий.
//
// Каждое кольцо — один тип (тесты, аудирование, чтение, видео, свободный
// ответ), заполнение — средний балл по нему. Внешнее кольцо у лучшего
// результата: так порядок читается без легенды.
//
// ── Анимация ────────────────────────────────────────────────────────────────
// Дуги вычерчиваются от нуля в двух случаях: при каждом входе на экран
// (prop replay растёт при фокусе) и при изменении самих данных. Готовая дуга
// воспринимается как рисунок, растущая — как величина.
//
// Анимируется strokeDashoffset (Animated-обёртка над Circle): нативный драйвер
// SVG-атрибуты не умеет, поэтому здесь всегда JS-анимация. Колец максимум
// четыре, нагрузки это не создаёт.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, Animated, Easing } from "react-native";
import Svg, { Circle } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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

/** Вычерчивание дуги. Внешнее кольцо стартует первым. */
const DRAW_MS = 900;
const DRAW_STEP_MS = 110;

/**
 * Одно кольцо: серая канавка и дуга, которая вычерчивается от нуля.
 */
function Ring({
  radius, color, percent, track, delay, run,
}: {
  radius: number;
  color: string;
  percent: number;
  track: string;
  delay: number;
  run: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const circumference = 2 * Math.PI * radius;
  const target = (Math.max(0, Math.min(100, percent)) / 100) * circumference;

  useEffect(() => {
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: DRAW_MS,
      delay,
      easing: Easing.out(Easing.cubic),
      // SVG-атрибуты нативным драйвером не анимируются.
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [run, target, delay, progress]);

  const offset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, circumference - target],
  });

  return (
    <>
      <Circle
        cx={CENTER} cy={CENTER} r={radius}
        stroke={track} strokeWidth={STROKE} fill="none"
      />
      {percent > 0 && (
        <AnimatedCircle
          cx={CENTER} cy={CENTER} r={radius}
          stroke={color} strokeWidth={STROKE} fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={offset as unknown as number}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />
      )}
    </>
  );
}

export function AssignmentRingsChart({
  stats, colors, replay = 0,
}: {
  stats: CategoryStat[];
  colors: any;
  /** Растёт при каждом входе на экран — анимация играет заново. */
  replay?: number;
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

  /**
   * Ключ перезапуска. Меняется от входа на экран (replay) и от самих данных,
   * поэтому график и играет заново при возврате, и перечерчивается под новые
   * цифры.
   */
  const dataKey = useMemo(
    () => withRings.map((s) => `${s.type}:${s.avgScore ?? 0}:${s.count}`).join("|"),
    [withRings],
  );
  const runId = useRef(0);
  const lastKey = useRef(`${replay}|${dataKey}`);
  const nextKey = `${replay}|${dataKey}`;
  if (lastKey.current !== nextKey) {
    lastKey.current = nextKey;
    runId.current += 1;
  }

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
          {withRings.map((stat, i) => (
            <Ring
              key={stat.type}
              radius={BASE_RADIUS - i * GAP}
              color={RING_COLORS[stat.type] ?? colors.primary}
              percent={stat.avgScore ?? 0}
              track={colors.muted}
              delay={i * DRAW_STEP_MS}
              run={runId.current}
            />
          ))}
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
