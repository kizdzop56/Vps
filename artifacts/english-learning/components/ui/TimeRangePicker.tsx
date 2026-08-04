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
//     остаётся 10:00 — и на экране появляется красная ошибка «Конец раньше
//     начала». Пользователь ничего не нарушал, просто интерфейс не догадался
//     подвинуть вторую цифру.
//  4. Минуты давали 60 значений, хотя занятия не начинают в 13:07. Прокрутка
//     до нужного числа занимала несколько движений.
//
// Как сделано здесь:
//
//  • Промежуток задаётся началом и ДЛИТЕЛЬНОСТЬЮ. Конец считается сам, поэтому
//    «конец раньше начала» стало невозможным состоянием, а не ошибкой, которую
//    нужно показывать.
//  • Длительность выбирается кнопками (30 мин, 45 мин, 1 ч, 1,5 ч, 2 ч): это
//    реальные варианты урока, попадание в один тап.
//  • Осталось одно колесо часов и шаг минут по 5 — вместо четырёх колонок.
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
  if (min < 60) return `${min} мин`;
  if (min % 60 === 0) return `${min / 60} ч`;
  return `${Math.floor(min / 60)},${(min % 60) / 6} ч`;
}

/** "09:30" → 570 */
export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 570 → "09:30". За полночь не уходим: сутки замыкаются. */
export function toTime(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const HOUR_H = 46;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);

/**
 * Колесо часов. Свой компонент, а не общий барабан: здесь нужна только одна
 * колонка и меньшая высота, а прежний WheelColumn жёстко рассчитан на пять
 * видимых строк.
 */
function HourWheel({
  value, onChange, tint,
}: {
  value: number;
  onChange: (h: number) => void;
  tint: string;
}) {
  const colors = useColors();
  const ref = useRef<ScrollView>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ставим колесо на текущее значение при открытии и при внешнем изменении
  // (например, когда время подставилось из пресета).
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
    <View style={{ height: HOUR_H * 3, width: 74, overflow: "hidden" }}>
      {/* Одна подсветка на всю строку выбора, а не по подсветке на колонку. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute", left: 0, right: 0, top: HOUR_H, height: HOUR_H,
          borderRadius: radii.sm, backgroundColor: tint + "1f",
          borderWidth: 1.5, borderColor: tint + "3d",
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
                fontSize: sel ? 26 : 19,
                fontWeight: sel ? "900" : "600",
                color: sel ? colors.foreground : colors.mutedForeground,
                opacity: sel ? 1 : 0.5,
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
  /** Цвет акцента: индиго у учителя, фиолетовый у запроса ученика. */
  tint?: string;
  /** Подпись под промежутком: например, предупреждение о прошедшем времени. */
  hint?: { text: string; tone: "warn" | "ok" } | null;
}

export function TimeRangePicker({
  start, end, onChange, tint, colorsOverride, hint,
}: TimeRangePickerProps & { colorsOverride?: any }) {
  const colors = useColors();
  const accent = tint ?? colors.primary;

  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  // Длительность через сутки: если конец «меньше» начала, значит перешли
  // через полночь — считаем по кругу, а не отрицательным числом.
  const duration = ((endMin - startMin) % 1440 + 1440) % 1440;

  const hour = Math.floor(startMin / 60);
  const minute = startMin % 60;

  /** Двигаем начало, длительность сохраняем — конец едет следом. */
  const setStart = (nextStartMin: number) => {
    onChange(toTime(nextStartMin), toTime(nextStartMin + duration));
  };

  const setDuration = (min: number) => {
    onChange(toTime(startMin), toTime(startMin + min));
  };

  // Ближайшая к текущей длительности кнопка — подсвечиваем её как выбранную.
  const activeDuration = useMemo(
    () => (DURATIONS as readonly number[]).includes(duration) ? duration : null,
    [duration],
  );

  const s = StyleSheet.create({
    // ── Итог: крупная строка «13:00 → 14:00» ──
    // Раньше результат приходилось собирать глазами из четырёх колонок.
    summary: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12,
      paddingVertical: 14, paddingHorizontal: 16, borderRadius: radii.md,
      backgroundColor: accent + "10",
      borderWidth: 1.5, borderColor: accent + "2e",
      marginBottom: 16,
    },
    sumTime: {
      fontSize: 27, fontWeight: "900", letterSpacing: -0.8,
      color: colors.foreground, fontVariant: ["tabular-nums"],
    },
    sumDur: {
      paddingHorizontal: 11, paddingVertical: 5, borderRadius: radii.pill,
      backgroundColor: accent, marginLeft: 2,
    },
    sumDurText: { fontSize: 12, fontWeight: "900", color: "#fff" },

    lbl: {
      fontSize: 10.5, fontWeight: "800", letterSpacing: 1.1,
      textTransform: "uppercase", color: colors.mutedForeground, marginBottom: 9,
    },

    // ── Начало ──
    startRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
      marginBottom: 4,
    },
    colon: {
      fontSize: 24, fontWeight: "900", color: colors.mutedForeground,
      marginHorizontal: 2,
    },

    // Минуты кнопками: занятия не начинают в 13:07, а прокрутка шестидесяти
    // значений ради «:30» — лишняя работа пальцем.
    minRow: { flexDirection: "row", gap: 6, justifyContent: "center", flexWrap: "wrap" },
    minChip: {
      minWidth: 46, paddingVertical: 9, paddingHorizontal: 10, borderRadius: radii.sm,
      alignItems: "center",
      backgroundColor: colors.muted, borderWidth: 1.5, borderColor: "transparent",
    },
    minChipOn: { backgroundColor: accent + "1f", borderColor: accent },
    minChipText: {
      fontSize: 14, fontWeight: "800", color: colors.mutedForeground,
      fontVariant: ["tabular-nums"],
    },
    minChipTextOn: { color: accent },

    // ── Длительность ──
    durRow: { flexDirection: "row", gap: 7, flexWrap: "wrap" },
    durChip: {
      flex: 1, minWidth: 62, paddingVertical: 11, borderRadius: radii.sm,
      alignItems: "center",
      backgroundColor: colors.muted, borderWidth: 1.5, borderColor: "transparent",
    },
    durChipText: { fontSize: 13, fontWeight: "800", color: colors.mutedForeground },

    hint: {
      flexDirection: "row", alignItems: "center", gap: 7,
      marginTop: 12, paddingVertical: 9, paddingHorizontal: 12,
      borderRadius: radii.sm,
    },
    hintText: { flex: 1, fontSize: 12.5, fontWeight: "700", lineHeight: 17 },
  });

  return (
    <View>
      {/* Итоговый промежуток */}
      <View style={s.summary}>
        <Text style={s.sumTime}>{start}</Text>
        <Glyph name="arrowRight" size={18} color={colors.mutedForeground} />
        <Text style={s.sumTime}>{end}</Text>
        <View style={s.sumDur}>
          <Text style={s.sumDurText}>{durationLabel(duration)}</Text>
        </View>
      </View>

      {/* Начало: колесо часов плюс минуты кнопками */}
      <Text style={s.lbl}>Начало</Text>
      <View style={s.startRow}>
        <HourWheel
          value={hour}
          onChange={(h) => setStart(h * 60 + minute)}
          tint={accent}
        />
        <Text style={s.colon}>:</Text>
        <View style={{ width: 74 }} />
      </View>
      <View style={[s.minRow, { marginTop: -HOUR_H * 2 + 6, marginLeft: 92, marginBottom: HOUR_H * 2 - 6 }]}>
        {MINUTES.map((m) => {
          const on = m === minute;
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

      {/* Длительность */}
      <Text style={s.lbl}>Длительность</Text>
      <View style={s.durRow}>
        {DURATIONS.map((d) => {
          const on = d === activeDuration;
          return (
            <Pressable key={d} onPress={() => setDuration(d)} style={{ flex: 1, minWidth: 62 }}>
              {on ? (
                <LinearGradient
                  colors={gradients.action as unknown as string[]}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={[s.durChip, { borderColor: "transparent" }]}
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
