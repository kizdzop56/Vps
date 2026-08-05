// ─────────────────────────────────────────────────────────────────────────────
// Средний балл: переключатель периода и карточка с кольцом.
//
// Раньше это была плоская карточка с кольцом, процентом и строкой
// «7 работ · +12 очков». Приписка повторяла то, что подробнее показано в
// разборе заданий, и отбирала внимание у единственного важного числа.
//
// ── Объём ───────────────────────────────────────────────────────────────────
// Нижняя грань, как у плиток заданий и времени: в профиле не должно быть
// поверхностей двух разных пород. Но карточка НЕ нажимается и не проседает —
// проседание обещает действие, а действия здесь нет. Объём тут про материал,
// не про интерактивность.
//
// У переключателя периода тоже есть грань: активная кнопка приподнята над
// канавкой, остальные лежат в ней. Это тот же приём, что у клавиш GameKit.
//
// ── Анимация ────────────────────────────────────────────────────────────────
// Кольцо вычерчивается от нуля, процент дорастает вместе с ним. Перезапуск
// привязан к значению и периоду: сменил «Неделя → Месяц» — кольцо перечертится
// под новые данные. Пришли свежие результаты — тоже.
//
// SVG-атрибуты и текст нативным драйвером не анимируются, поэтому здесь
// всегда useNativeDriver: false. Кольцо одно, нагрузки нет.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated, Easing } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { SectionLabel } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Высота нижней грани. Совпадает с плитками заданий и времени. */
const EDGE = 6;
/** Грань переключателя: он мельче карточек, поэтому и грань тоньше. */
const SEG_EDGE = 4;

const RING = 78;
const STROKE = 9;

const DRAW_MS = 900;

export interface ScorePeriod<K extends string = string> {
  key: K;
  label: string;
}

export interface ScoreCardProps<K extends string = string> {
  /** Средний балл 0…100. null — работ за период нет. */
  average: number | null;
  periods: readonly ScorePeriod<K>[];
  period: K;
  onPeriodChange: (key: K) => void;
  style?: any;
}

export function ScoreCard<K extends string = string>({
  average, periods, period, onPeriodChange, style,
}: ScoreCardProps<K>) {
  const colors = useColors();
  const [shown, setShown] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  const value = Math.max(0, Math.min(100, average ?? 0));
  const r = (RING - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const target = (value / 100) * circumference;

  const tint = average === null
    ? colors.mutedForeground
    : average >= 70 ? colors.success
      : average >= 50 ? accents.amber
        : colors.destructive;

  // Перезапуск при смене периода и при новых данных: график обязан
  // соответствовать тому, что выбрано сейчас.
  useEffect(() => {
    progress.setValue(0);
    setShown(0);

    const listener = progress.addListener(({ value: v }) => {
      setShown(Math.round(v * value));
    });

    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: DRAW_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start();

    return () => {
      anim.stop();
      progress.removeListener(listener);
    };
  }, [value, period, progress]);

  const offset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, circumference - target],
  });

  return (
    <View style={style}>
      <SectionLabel>Успеваемость</SectionLabel>

      {/* Переключатель периода: активная кнопка стоит на грани, остальные в
          канавке. */}
      <View style={{ paddingBottom: SEG_EDGE, marginBottom: 12 }}>
        <View style={[s.segEdge, { backgroundColor: colors.border }]} />
        <View style={[s.seg, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          {periods.map((p) => {
            const active = p.key === period;
            return (
              <Pressable
                key={p.key}
                onPress={() => onPeriodChange(p.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  s.segBtn,
                  active && {
                    backgroundColor: colors.card,
                    shadowColor: accents.violetDeep,
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.22,
                    shadowRadius: 7,
                    elevation: 4,
                  },
                  pressed && !active && { opacity: 0.7 },
                ]}
              >
                <Text style={[
                  s.segText,
                  { color: active ? colors.foreground : colors.mutedForeground },
                  active && { fontWeight: "800" },
                ]}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Карточка. Не нажимается: объём здесь про материал, а не про действие. */}
      <View style={{ paddingBottom: EDGE }}>
        <View style={[s.edge, { backgroundColor: "#c9bdf0" }]} />
        <View style={[s.body, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={s.ring}>
            <Svg width={RING} height={RING}>
              <Circle
                cx={RING / 2} cy={RING / 2} r={r}
                stroke={colors.muted} strokeWidth={STROKE} fill="none"
              />
              {average !== null && value > 0 && (
                <AnimatedCircle
                  cx={RING / 2} cy={RING / 2} r={r}
                  stroke={tint} strokeWidth={STROKE} fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${circumference}`}
                  strokeDashoffset={offset as unknown as number}
                  transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
                />
              )}
            </Svg>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>Средний балл</Text>
            <Text style={[s.value, { color: tint }]}>
              {average === null ? "—" : `${shown}%`}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  segEdge: {
    position: "absolute", left: 0, right: 0, top: SEG_EDGE, bottom: 0,
    borderRadius: radii.sm + 2,
  },
  seg: {
    flexDirection: "row", borderRadius: radii.sm + 2, padding: 3, borderWidth: 1,
  },
  segBtn: {
    flex: 1, paddingVertical: 9, borderRadius: radii.sm,
    alignItems: "center", justifyContent: "center",
  },
  segText: { fontSize: 13, fontWeight: "700" },

  edge: {
    position: "absolute", left: 0, right: 0, top: EDGE, bottom: 0,
    borderRadius: radii.md,
  },
  body: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: radii.md, borderWidth: 1, padding: 16,
    shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16, shadowRadius: 15, elevation: 4,
  },
  ring: { width: RING, height: RING, alignItems: "center", justifyContent: "center" },
  label: {
    fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase",
  },
  value: {
    fontSize: 34, fontWeight: "900", letterSpacing: -1.4, marginTop: 3,
    fontVariant: ["tabular-nums"],
  },
});

export default ScoreCard;
