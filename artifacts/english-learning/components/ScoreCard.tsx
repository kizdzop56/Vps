// ─────────────────────────────────────────────────────────────────────────────
// Средний балл: переключатель периода и карточка с кольцом.
//
// Раньше это была плоская карточка с кольцом, процентом и строкой
// «7 работ · +12 очков». Приписка повторяла то, что подробнее показано в
// разборе заданий, и отбирала внимание у единственного важного числа.
//
// ── Под числом обязан стоять период ─────────────────────────────────────────
// Вместе с той припиской пропало и главное: ЗА КАКОЙ СРОК посчитано число.
// Период выбирается кнопками НАД карточкой, по умолчанию — «Всё время», и
// одна давняя работа на 100 % читалась как «мой средний балл сейчас 100 %»,
// хотя за неделю ученик не сдал ничего. Число было верным, а понималось
// неверно — это то же самое, что ошибка.
//
// Поэтому под процентом всегда стоит срок: «за всё время», «за неделю»,
// «за месяц». Это НЕ возвращение счётчиков: количество работ и очки по-
// прежнему живут в разборе заданий, здесь только срок.
//
// Пустой период тоже объясняет себя сам. Раньше там был молчаливый прочерк, и
// по нему нельзя было отличить «работ не было» от «данные не загрузились».
//
// ── Чем занята правая половина ──────────────────────────────────────────────
// После удаления приписки справа от кольца осталась пустота: одно число на
// широкой карточке выглядело недогруженным. Заполнять её обратно счётчиками
// нельзя — они и так есть в разборе заданий. Поэтому там теперь то, чего нет
// больше нигде: ДИНАМИКА.
//
//   • «+8% к прошлой неделе» — сравнение с тем же по длине отрезком до него.
//     Сам процент не отвечает на главный вопрос ученика «я стал лучше?»;
//   • столбики последних работ — видно, ровно человек идёт или скачет. Пять
//     оценок 60-60-60 и оценки 30-90-60 дают один средний балл, но это два
//     совершенно разных ученика.
//
// Обоих блоков может не быть: на чужом профиле список работ не выдаётся. Тогда
// карточка сжимается до кольца и процента, как раньше.
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
// Кольцо вычерчивается от нуля, процент дорастает вместе с ним, столбики
// вырастают лесенкой. Играет заново в трёх случаях: вход на экран (replay),
// смена периода, новые данные.
//
// SVG-атрибуты, ширина и высота нативным драйвером не анимируются, поэтому
// здесь всегда useNativeDriver: false.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated, Easing } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
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

/** График последних работ: высота и ступенька появления столбиков. */
const SPARK_H = 30;
const SPARK_STEP_MS = 45;
const SPARK_MS = 620;

/**
 * Срок под числом. Ключи те же, что у переключателя периода на профиле.
 * Незнакомый ключ подписи не получает: лучше без неё, чем с неверной.
 */
const PERIOD_NOTE: Record<string, string> = {
  week: "за неделю",
  month: "за месяц",
  all: "за всё время",
};

/** Пустой период: прочерк обязан сказать, почему он прочерк. */
const PERIOD_EMPTY: Record<string, string> = {
  week: "За эту неделю работ нет",
  month: "За этот месяц работ нет",
  all: "Работ пока нет",
};

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
  /**
   * Средний балл за предыдущий такой же отрезок. Из него считается динамика.
   * null или undefined — сравнивать не с чем, строка не рисуется.
   */
  previousAverage?: number | null;
  /**
   * Баллы последних работ периода, от старой к новой. Меньше двух — график не
   * рисуется: по одной точке о ровности хода судить нельзя.
   */
  recentScores?: number[];
  /** Растёт при каждом входе на экран — анимация играет заново. */
  replay?: number;
  style?: any;
}

/** Цвет по баллу. Пороги те же, что во всём приложении: 50 и 70. */
function tintFor(score: number, colors: any): string {
  if (score >= 70) return colors.success;
  if (score >= 50) return accents.amber;
  return colors.destructive;
}

/**
 * Столбик последней работы. Растёт от нуля высотой: нативный драйвер высоту не
 * анимирует ни на одной платформе.
 */
function SparkBar({
  score, index, run, colors,
}: {
  score: number;
  index: number;
  run: number;
  colors: any;
}) {
  const grow = useRef(new Animated.Value(0)).current;
  const height = Math.max(3, Math.round((Math.max(0, Math.min(100, score)) / 100) * SPARK_H));

  useEffect(() => {
    grow.setValue(0);
    const anim = Animated.timing(grow, {
      toValue: height,
      duration: SPARK_MS,
      delay: index * SPARK_STEP_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [run, height, index, grow]);

  return (
    <View style={s.sparkCol}>
      <Animated.View style={{
        width: "100%", height: grow, borderRadius: 3,
        backgroundColor: tintFor(score, colors),
      }} />
    </View>
  );
}

export function ScoreCard<K extends string = string>({
  average, periods, period, onPeriodChange,
  previousAverage, recentScores, replay = 0, style,
}: ScoreCardProps<K>) {
  const colors = useColors();
  const [shown, setShown] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  const value = Math.max(0, Math.min(100, average ?? 0));
  const r = (RING - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const target = (value / 100) * circumference;

  const tint = average === null ? colors.mutedForeground : tintFor(average, colors);

  // Перезапуск: вход на экран, смена периода, новые данные.
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
  }, [value, period, replay, progress]);

  const offset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, circumference - target],
  });

  // Динамика. Считается только когда есть оба значения: «+29%» из ничего —
  // не рост, а первый результат.
  const delta = average !== null && previousAverage !== null && previousAverage !== undefined
    ? average - previousAverage
    : null;

  const deltaLabel = period === "week" ? "к прошлой неделе"
    : period === "month" ? "к прошлому месяцу"
      : "к первым работам";

  // Срок под числом: без него «100 %» читается как «сейчас», хотя это может
  // быть одна работа месячной давности.
  const note = average === null
    ? (PERIOD_EMPTY[period as unknown as string] ?? "Работ нет")
    : (PERIOD_NOTE[period as unknown as string] ?? null);

  const spark = (recentScores ?? []).slice(-8);
  const showSpark = spark.length >= 2;

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

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>Средний балл</Text>
            <Text style={[s.value, { color: tint }]}>
              {average === null ? "—" : `${shown}%`}
            </Text>

            {/* За какой срок посчитано. Без этой строки число врёт о времени. */}
            {!!note && (
              <Text
                numberOfLines={1}
                style={[s.note, { color: colors.mutedForeground }]}
              >
                {note}
              </Text>
            )}

            {/* Динамика: главный ответ на «я стал лучше?». */}
            {delta !== null && (
              <View style={[
                s.delta,
                {
                  backgroundColor: Math.abs(delta) < 1
                    ? colors.muted
                    : delta > 0 ? colors.success + "1f" : colors.destructive + "1a",
                },
              ]}>
                <Glyph
                  name={Math.abs(delta) < 1 ? "target" : delta > 0 ? "trendUp" : "trendDown"}
                  size={12}
                  color={Math.abs(delta) < 1
                    ? colors.mutedForeground
                    : delta > 0 ? colors.success : colors.destructive}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    s.deltaText,
                    {
                      color: Math.abs(delta) < 1
                        ? colors.mutedForeground
                        : delta > 0 ? colors.success : colors.destructive,
                    },
                  ]}
                >
                  {Math.abs(delta) < 1
                    ? `так же, как ${deltaLabel.replace("к ", "")}`
                    : `${delta > 0 ? "+" : "−"}${Math.abs(delta)}% ${deltaLabel}`}
                </Text>
              </View>
            )}

            {/* Ровность хода: одинаковый средний балл бывает у совсем разных
                учеников. */}
            {showSpark && (
              <View style={s.sparkWrap}>
                <View style={s.spark}>
                  {spark.map((score, i) => (
                    <SparkBar
                      key={`${i}-${score}`}
                      score={score}
                      index={i}
                      run={replay + (period as unknown as string).length}
                      colors={colors}
                    />
                  ))}
                </View>
                <Text style={[s.sparkCap, { color: colors.mutedForeground }]}>
                  Последние {spark.length} работ
                </Text>
              </View>
            )}
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
  note: { fontSize: 11.5, fontWeight: "700", marginTop: 2 },

  delta: {
    flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start",
    marginTop: 7, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radii.pill,
  },
  deltaText: { fontSize: 11.5, fontWeight: "800", flexShrink: 1 },

  sparkWrap: { marginTop: 10 },
  spark: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: SPARK_H },
  sparkCol: { flex: 1, height: SPARK_H, justifyContent: "flex-end" },
  sparkCap: { fontSize: 10, fontWeight: "700", marginTop: 5 },
});

export default ScoreCard;
