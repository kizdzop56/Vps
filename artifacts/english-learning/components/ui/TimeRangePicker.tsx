// ─────────────────────────────────────────────────────────────────────────────
// Выбор промежутка времени: две крутилки — начало и конец.
//
// Привычный барабан оставлен как есть: крутишь колесо, выбираешь время.
// Поправлено то, что мешало им пользоваться:
//
//  1. Начало и конец жили сами по себе. Ставишь начало на 13:00, а конец
//     остаётся 10:00 — и вылезает красная ошибка «Конец раньше начала».
//     Пользователь ничего не нарушал, просто интерфейс не догадался подвинуть
//     вторую цифру. Теперь при сдвиге начала конец едет следом, сохраняя
//     длительность, и ошибка стала невозможной, а не показываемой.
//  2. Минуты давали 60 значений, хотя занятия не начинают в 13:07. Шаг 5
//     сокращает колесо с шестидесяти строк до двенадцати.
//  3. У каждой из четырёх колонок была своя подсветка — на экране четыре
//     светлых прямоугольника, читались как четыре несвязанных поля. Теперь
//     одна рамка на пару «часы : минуты», то есть по одной на начало и конец.
//  4. Колонки были по 52 пикселя в пять строк: блок занимал 260 пикселей.
//     Три строки по 44 — 132, вдвое меньше, а прокрутка та же.
//
// Сверху добавлена строка итога «13:00 → 14:00» с длительностью: раньше
// результат приходилось складывать глазами из разных колонок.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useRef, useEffect } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "./Glyph";
import { accents, radii } from "@/constants/theme";

/** Шаг минут. Пять минут — привычная сетка расписания. */
const MINUTE_STEP = 5;

const ROW_H = 44;
const VISIBLE_ROWS = 3;

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);

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

function durationLabel(min: number): string {
  if (min <= 0) return "—";
  if (min < 60) return `${min} мин`;
  if (min % 60 === 0) return `${min / 60} ч`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 30 ? `${h},5 ч` : `${h} ч ${rest} мин`;
}

/**
 * Одна колонка барабана.
 *
 * Своя, а не общий WheelColumn: тому нужны пять видимых строк и собственная
 * подсветка, из-за чего блок и раздувался. Здесь подсветку рисует родитель
 * сразу на пару колонок.
 */
function Column({
  items, value, onChange, width,
}: {
  items: number[];
  value: number;
  onChange: (v: number) => void;
  width: number;
}) {
  const colors = useColors();
  const ref = useRef<ScrollView>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = Math.max(0, items.indexOf(value));

  // Ставим колесо на текущее значение при открытии и при внешнем изменении
  // (например, когда конец подвинулся следом за началом).
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: index * ROW_H, animated: false });
    }, 30);
    return () => clearTimeout(t);
  }, [index]);

  const commit = (y: number) => {
    const i = Math.max(0, Math.min(Math.round(y / ROW_H), items.length - 1));
    ref.current?.scrollTo({ y: i * ROW_H, animated: true });
    if (items[i] !== value) onChange(items[i]);
  };

  return (
    <View style={{ width, height: ROW_H * VISIBLE_ROWS, overflow: "hidden" }}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW_H}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingVertical: ROW_H }}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          if (settle.current) clearTimeout(settle.current);
          settle.current = setTimeout(() => commit(y), 130);
        }}
        onMomentumScrollEnd={(e) => {
          if (settle.current) clearTimeout(settle.current);
          commit(e.nativeEvent.contentOffset.y);
        }}
        onScrollEndDrag={(e) => {
          if (settle.current) clearTimeout(settle.current);
          commit(e.nativeEvent.contentOffset.y);
        }}
      >
        {items.map((v) => {
          const sel = v === value;
          return (
            <Pressable
              key={v}
              onPress={() => onChange(v)}
              style={{ height: ROW_H, alignItems: "center", justifyContent: "center" }}
            >
              {/* Табличные цифры: колонка не «дышит» по ширине при прокрутке. */}
              <Text style={{
                fontSize: sel ? 24 : 18,
                fontWeight: sel ? "900" : "600",
                color: sel ? colors.foreground : colors.mutedForeground,
                opacity: sel ? 1 : 0.42,
                fontVariant: ["tabular-nums"],
              }}>
                {String(v).padStart(2, "0")}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Пара колонок «часы : минуты» под общей рамкой выбора. */
function Dial({
  label, minutes, onChange, accent,
}: {
  label: string;
  minutes: number;
  onChange: (min: number) => void;
  accent: string;
}) {
  const colors = useColors();
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  // Минуты могли прийти не по нашей сетке (старые слоты с :07). Показываем
  // ближайшее значение сетки, само время при этом не переписываем.
  const nearestM = (Math.round(m / MINUTE_STEP) * MINUTE_STEP) % 60;

  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{
        fontSize: 10.5, fontWeight: "800", letterSpacing: 1.1,
        textTransform: "uppercase", color: colors.mutedForeground, marginBottom: 8,
      }}>
        {label}
      </Text>

      <View style={{ position: "relative", flexDirection: "row", alignItems: "center" }}>
        {/* Одна рамка на обе колонки: «13» и «00» читаются как одно время,
            а не как два независимых поля. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute", left: 0, right: 0,
            top: ROW_H, height: ROW_H, borderRadius: radii.sm,
            backgroundColor: accent + "1a",
            borderWidth: 1.5, borderColor: accent + "3d",
          }}
        />
        <Column items={HOURS} value={h} onChange={(nh) => onChange(nh * 60 + m)} width={52} />
        <Text style={{
          fontSize: 21, fontWeight: "900", color: colors.mutedForeground,
          marginHorizontal: 1,
        }}>
          :
        </Text>
        <Column items={MINUTES} value={nearestM} onChange={(nm) => onChange(h * 60 + nm)} width={52} />
      </View>
    </View>
  );
}

export interface TimeRangePickerProps {
  /** Начало в формате HH:MM. */
  start: string;
  /** Конец в формате HH:MM. */
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

  /**
   * Двигаем начало — конец едет следом, длительность сохраняется.
   * Именно это убирает ошибку «конец раньше начала»: невалидного состояния
   * больше нельзя достичь.
   */
  const setStart = (nextStart: number) => {
    const keep = duration > 0 ? duration : 60;
    onChange(toTime(nextStart), toTime(nextStart + keep));
  };

  /**
   * Двигаем конец. Если он оказался раньше начала, считаем, что урок уходит
   * за полночь — это законный случай, а не ошибка ввода.
   */
  const setEnd = (nextEnd: number) => onChange(toTime(startMin), toTime(nextEnd));

  const s = StyleSheet.create({
    // ── Итог ──
    // Раньше результат приходилось собирать глазами из четырёх колонок.
    summary: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
      paddingVertical: 12, paddingHorizontal: 14, borderRadius: radii.md,
      backgroundColor: accent + "10",
      borderWidth: 1.5, borderColor: accent + "2e",
      marginBottom: 16,
    },
    sumTime: {
      fontSize: 24, fontWeight: "900", letterSpacing: -0.7,
      color: colors.foreground, fontVariant: ["tabular-nums"],
    },
    sumDur: {
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill,
      backgroundColor: accent,
    },
    sumDurText: { fontSize: 11.5, fontWeight: "900", color: "#fff" },

    dials: { flexDirection: "row", alignItems: "flex-start" },
    divider: {
      width: 1, alignSelf: "stretch", marginTop: 26,
      backgroundColor: colors.border,
    },

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
        <Glyph name="arrowRight" size={16} color={colors.mutedForeground} />
        <Text style={s.sumTime}>{end}</Text>
        <View style={s.sumDur}>
          <Text style={s.sumDurText}>{durationLabel(duration)}</Text>
        </View>
      </View>

      <View style={s.dials}>
        <Dial label="Начало" minutes={startMin} onChange={setStart} accent={accent} />
        <View style={s.divider} />
        <Dial label="Конец" minutes={endMin} onChange={setEnd} accent={accent} />
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
