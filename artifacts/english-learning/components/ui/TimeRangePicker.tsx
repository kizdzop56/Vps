// ─────────────────────────────────────────────────────────────────────────────
// Выбор промежутка времени: начало и длительность.
//
// Что было не так с прежним вариантом (два барабана «Начало» и «Конец»):
//
//  1. Четыре колонки по пять строк занимали 260 пикселей — больше половины
//     листа. Ради выбора «с часу до двух» приходилось прокручивать четыре
//     независимых колеса.
//  2. Подсветка выбранной строки рисовалась отдельно у каждой колонки, и в
//     сумме на экране было четыре светлых прямоугольника. Читалось как четыре
//     несвязанных поля, а не как «13:00» и «14:00».
//  3. Начало и конец не были связаны. Сдвигаешь начало на 13:00, а конец
//     остаётся 10:00 — и появляется красная ошибка «Конец раньше начала».
//     Пользователь ничего не нарушал, просто интерфейс не догадался подвинуть
//     вторую цифру.
//  4. Минуты давали 60 значений, хотя занятия не начинают в 13:07.
//
// Как сделано здесь:
//
//  • Промежуток задаётся началом и ДЛИТЕЛЬНОСТЬЮ. Конец считается сам, поэтому
//    «конец раньше начала» стало невозможным состоянием, а не ошибкой, которую
//    нужно показывать.
//  • Длительность выбирается кнопками (30 мин, 45 мин, 1 ч, 1,5 ч, 2 ч): это
//    реальные варианты урока, попадание в один тап.
//  • Часы — одно короткое колесо, минуты — кнопки с шагом 5.
//  • Сверху крупная строка «13:00 → 14:00» с длительностью: результат виден
//    целиком, не приходится складывать цифры из разных колонок глазами.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useRef, useEffect } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "./Glyph";
import { accents, gradients, radii } from "@/constants/theme";

/** Шаг минут. Пять минут — привычная сетка расписания. */
const MINUTE_STEP = 5;

/** Длительности занятия. Порядок от короткого к длинному. */
export const DURATIONS = [30, 45, 60, 90, 120] as const;

function durationLabel(min: number): string {
  if (min <= 0) return "—";
  if (min < 60) return `${min} мин`;
  if (min % 60 === 0) return `${min / 60} ч`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 30 ? `${h},5 ч` : `${h} ч ${rest} мин`;
}

/** "09:30" → 570 */
export function toMinutes(time: string): number {
  const [h, m] = String(time ?? "").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 570 → "09:30". Сутки замыкаются по кругу. */
export function toTime(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const HOUR_H = 44;
const WHEEL_ROWS = 3;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);

/**
 * Колесо часов. Своё, а не общий WheelColumn: тот жёстко рассчитан на пять
 * видимых строк и собственную подсветку у каждой колонки.
 */
function HourWheel({
  value, onChange, accent,
}: {
  value: number;
  onChange: (h: number) => void;
  accent: string;
}) {
  const colors = useColors();
  const ref = useRef<ScrollView>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ставим колесо на текущее значение при открытии и при внешнем изменении.
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: value * HOUR_H, animated: false });
    }, 40);
    return () => clearTimeout(t);
  }, [value]);

  const commit = (y: number) => {
    const i = Math.max(0, Math.min(Math.round(y / HOUR_H), 23));
    if (i !== value) onChange(i);
    ref.current?.scrollTo({ y: i * HOUR_H, animated: true });
  };

  return (
    <View style={{ height: HOUR_H * WHEEL_ROWS, width: 78, overflow: "hidden" }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute", left: 0, right: 0, top: HOUR_H, height: HOUR_H,
          borderRadius: radii.sm, backgroundColor: accent + "1f",
          borderWidth: 1.5, borderColor: accent + "3d",
        }}
      />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={HOUR_H}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingVertical: HOUR_H }}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          if (settle.current) clearTimeout(settle.current);
          settle.current = setTimeout(() => commit(y), 140);
        }}
        onMomentumScrollEnd={(e) => {
          if (settle.current) clearTimeout(settle.current);
          commit(e.nativeEvent.contentOffset.y);
        }}
      >
        {HOURS.map((h) => {
          const sel = h === value;
          return (
            <Pressable
              key={h}
              onPress={() => onChange(h)}
              style={{ height: HOUR_H, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{
                fontSize: sel ? 25 : 18,
                fontWeight: sel ? "900" : "600",
                color: sel ? colors.foreground : colors.mutedForeground,
                opacity: sel ? 1 : 0.45,
                fontVariant: ["tabular-nums"],
              }}>
                {String(h).padStart(2, "0")}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export interface TimeRangePickerProps {
  /** Начало в формате HH:MM. */
  start: string;
  /** Конец в формате HH:MM. Считается из начала и длительности. */
  end: string;
  onChange: (start: string, end: string) => void;
  /** Цвет акцента: индиго у слота учителя, зелёный у запроса ученика. */
  tint?: string;
  /** Подсказка под блоком: предупреждение о прошедшем времени и т. п. */
  hint?: { text: string; tone: "warn" | "ok" } | null;
}

export function TimeRangePicker({ start, end, onChange, tint, hint }: TimeRangePickerProps) {
  const colors = useColors();
  const accent = tint ?? colors.primary;

  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  // Длительность по кругу: если конец «меньше» начала, значит перешли через
  // полночь, а не ошиблись.
  const duration = ((endMin - startMin) % 1440 + 1440) % 1440;

  const hour = Math.floor(startMin / 60);
  const minute = startMin % 60;
  // Минуты могли прийти не по нашей сетке (старые слоты с :07). Подсвечиваем
  // ближайшую кнопку, но само значение не трогаем — оно уже сохранено.
  const nearestMinute = Math.round(minute / MINUTE_STEP) * MINUTE_STEP % 60;

  /** Двигаем начало, длительность сохраняем — конец едет следом. */
  const setStart = (nextStartMin: number) =>
    onChange(toTime(nextStartMin), toTime(nextStartMin + duration));

  const setDuration = (min: number) =>
    onChange(toTime(startMin), toTime(startMin + min));

  const activeDuration = useMemo(
    () => ((DURATIONS as readonly number[]).includes(duration) ? duration : null),
    [duration],
  );

  const s = StyleSheet.create({
    // ── Итог ──
    // Раньше результат приходилось собирать глазами из четырёх колонок.
    summary: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
      paddingVertical: 14, paddingHorizontal: 14, borderRadius: radii.md,
      backgroundColor: accent + "10",
      borderWidth: 1.5, borderColor: accent + "2e",
      marginBottom: 18,
    },
    sumTime: {
      fontSize: 26, fontWeight: "900", letterSpacing: -0.8,
      color: colors.foreground, fontVariant: ["tabular-nums"],
    },
    sumDur: {
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill,
      backgroundColor: accent,
    },
    sumDurText: { fontSize: 11.5, fontWeight: "900", color: "#fff" },

    lbl: {
      fontSize: 10.5, fontWeight: "800", letterSpacing: 1.1,
      textTransform: "uppercase", color: colors.mutedForeground, marginBottom: 10,
    },

    // ── Начало: часы слева колесом, минуты справа кнопками ──
    startRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
    colon: { fontSize: 22, fontWeight: "900", color: colors.mutedForeground },
    minGrid: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
    minChip: {
      width: 46, paddingVertical: 9, borderRadius: radii.sm, alignItems: "center",
      backgroundColor: colors.muted, borderWidth: 1.5, borderColor: "transparent",
    },
    minChipOn: { backgroundColor: accent + "1f", borderColor: accent },
    minChipText: {
      fontSize: 13.5, fontWeight: "800", color: colors.mutedForeground,
      fontVariant: ["tabular-nums"],
    },
    minChipTextOn: { color: accent },

    // ── Длительность ──
    durRow: { flexDirection: "row", gap: 6 },
    durChip: {
      paddingVertical: 11, borderRadius: radii.sm, alignItems: "center",
      backgroundColor: colors.muted, borderWidth: 1.5, borderColor: "transparent",
    },
    durChipText: { fontSize: 12.5, fontWeight: "800", color: colors.mutedForeground },

    hint: {
      flexDirection: "row", alignItems: "center", gap: 7,
      marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radii.sm,
    },
    hintText: { flex: 1, fontSize: 12.5, fontWeight: "700", lineHeight: 17 },
  });

  return (
    <View>
      <View style={s.summary}>
        <Text style={s.sumTime}>{start}</Text>
        <Glyph name="arrowRight" size={17} color={colors.mutedForeground} />
        <Text style={s.sumTime}>{end}</Text>
        <View style={s.sumDur}>
          <Text style={s.sumDurText}>{durationLabel(duration)}</Text>
        </View>
      </View>

      <Text style={s.lbl}>Начало</Text>
      <View style={s.startRow}>
        <HourWheel value={hour} onChange={(h) => setStart(h * 60 + minute)} accent={accent} />
        <Text style={s.colon}>:</Text>
        <View style={s.minGrid}>
          {MINUTES.map((m) => {
            const on = m === nearestMinute;
            return (
              <Pressable
                key={m}
                onPress={() => setStart(hour * 60 + m)}
                style={[s.minChip, on && s.minChipOn]}
              >
                <Text style={[s.minChipText, on && s.minChipTextOn]}>
                  {String(m).padStart(2, "0")}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={s.lbl}>Длительность</Text>
      <View style={s.durRow}>
        {DURATIONS.map((d) => {
          const on = d === activeDuration;
          return (
            <Pressable key={d} onPress={() => setDuration(d)} style={{ flex: 1 }}>
              {on ? (
                <LinearGradient
                  colors={gradients.action as unknown as string[]}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={s.durChip}
                >
                  <Text style={[s.durChipText, { color: "#fff" }]}>{durationLabel(d)}</Text>
                </LinearGradient>
              ) : (
                <View style={s.durChip}>
                  <Text style={s.durChipText}>{durationLabel(d)}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {!!hint && (
        <View style={[
          s.hint,
          hint.tone === "warn"
            ? { backgroundColor: accents.amber + "1f", borderWidth: 1, borderColor: accents.amber + "4d" }
            : { backgroundColor: accent + "14" },
        ]}>
          <Glyph
            name={hint.tone === "warn" ? "alert" : "check"}
            size={15}
            color={hint.tone === "warn" ? "#b45309" : accent}
          />
          <Text style={[s.hintText, { color: hint.tone === "warn" ? "#b45309" : accent }]}>
            {hint.text}
          </Text>
        </View>
      )}
    </View>
  );
}

export default TimeRangePicker;
