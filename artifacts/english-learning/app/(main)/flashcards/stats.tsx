// ─────────────────────────────────────────────────────────────────────────────
// Статистика изучения слов.
//
// Экран собран в том же языке, что «Слова» и профиль: у каждой поверхности
// НИЖНЯЯ ГРАНЬ — отдельный слой под корпусом. Проседает при нажатии только то,
// что открывается (строка сложных слов); остальное неподвижно.
//
// ── Про график ──────────────────────────────────────────────────────────────
// Столбец = повторения за день, поделённые на верные (фиолетовый) и ошибки
// (розовый). Раньше это было нечитаемо по трём причинам, и все три исправлены:
//
// 1. Ошибки терялись. При точности 91% розовая часть — волосок в пару
//    пикселей. Теперь у ненулевых ошибок есть минимальная высота (MIN_SEG):
//    одна ошибка обязана быть видна, даже если верных двадцать.
// 2. Не было масштаба. Столбец без оси не отвечает на вопрос «это пять
//    повторений или пятьдесят». Добавлены две линии сетки с подписями.
// 3. Точные числа взять было негде. Теперь по столбцу можно ткнуть — над
//    графиком появляется разбор дня. Без выбора там стоит итог за 14 дней.
//
// ── ГРАБЛИ: ширина графика ──────────────────────────────────────────────────
// Ширину НЕЛЬЗЯ считать формулой из Dimensions. Так было раньше:
//
//   const chartW = screenW - 32 - 28;   // экран минус отступы
//   <Svg width={chartW + padLeft} />    // ...и ещё 24 сверху
//
// Svg получался шире карточки, последний столбец упирался в край и обрезался.
// Теперь ширину измеряет onLayout, а место под подписи оси живёт ВНУТРИ неё.
//
// Эмодзи на экране нет: значки — глифы из своего набора (components/ui/Glyph).
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, ScrollView, ActivityIndicator, Pressable, Animated, Easing, Platform,
  type ViewStyle, type StyleProp,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect, Line, Circle, Text as SvgText } from "react-native-svg";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { fc } from "@/hooks/useFlashcards";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { GoalPips, SectionLabel } from "@/components/ui/GameKit";
import { accents, gradients, radii, timing } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";

const NATIVE_DRIVER = Platform.OS !== "web";

/** Толщина нижней грани и её цвет под светлой карточкой. */
const EDGE = 5;
const EDGE_LIGHT = "#c9bdf0";

/** Высота поля графика без подписей. */
const CHART_H = 190;

/** Минимальная высота ненулевого сегмента: одна ошибка обязана быть видна. */
const MIN_SEG = 4;

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** «2026-08-07» → «7 августа». */
function formatDay(iso: string): string {
  const [, m, d] = iso.split("-");
  const month = MONTHS[Number(m) - 1] ?? "";
  return `${Number(d)} ${month}`;
}

/** Русское склонение по числу. */
function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 14) return forms[2];
  const last = abs % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

// ── Объёмные оболочки ───────────────────────────────────────────────────────

/** Грань без проседания: для того, что не нажимается. */
function Chunky({
  color = EDGE_LIGHT, edge = EDGE, style, children,
}: {
  color?: string; edge?: number;
  style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  return (
    <View style={[{ paddingBottom: edge }, style]}>
      <View style={{
        position: "absolute", left: 0, right: 0, top: edge, bottom: 0,
        borderRadius: radii.md, backgroundColor: color,
      }} />
      {children}
    </View>
  );
}

/** Грань + проседание: только там, где нажатие что-то открывает. */
function ChunkyTap({
  color = EDGE_LIGHT, edge = EDGE, onPress, style, accessibilityLabel, children,
}: {
  color?: string; edge?: number; onPress?: () => void;
  style?: StyleProp<ViewStyle>; accessibilityLabel?: string; children: React.ReactNode;
}) {
  const press = React.useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: timing.press,
      easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER,
    }).start();

  return (
    <View style={[{ paddingBottom: edge }, style]}>
      <View style={{
        position: "absolute", left: 0, right: 0, top: edge, bottom: 0,
        borderRadius: radii.md, backgroundColor: color,
      }} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={onPress}
          onPressIn={() => set(edge)}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** Корпус светлой карточки: общий вид для всех блоков экрана. */
function cardBody(colors: any, extra?: ViewStyle): ViewStyle {
  return {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    shadowColor: accents.violetDeep,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
    ...extra,
  };
}

export default function StatsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const statsQ = useQuery({ queryKey: ["fc-stats"], queryFn: () => fc.getStats() });

  const s = statsQ.data;

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: screenTop(insets),
        paddingBottom: screenBottom(insets),
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 }}>
        {/* Стрелка «назад» — тот же chevron из набора, развёрнутый на 180°. */}
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          hitSlop={10}
          style={{ transform: [{ rotate: "180deg" }], padding: 4 }}
        >
          <Glyph name="chevron" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={{ fontSize: 26, fontWeight: "900", letterSpacing: -0.5, color: colors.foreground }}>Статистика</Text>
      </View>

      {statsQ.isLoading || !s ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* Сегодняшний срез: цель дня в словах и что уже сделано. */}
          <TodayCard colors={colors} stats={s} />

          <StatGrid colors={colors} stats={s} />

          {(s.hardCount ?? 0) > 0 && (
            <ChunkyTap
              color={colors.warning + "55"}
              onPress={() => router.push("/flashcards/hard")}
              style={{ marginBottom: 18 }}
              accessibilityLabel="Открыть сложные слова"
            >
              <View style={cardBody(colors, {
                flexDirection: "row", alignItems: "center", gap: 13,
                borderColor: colors.warning + "44",
              })}>
                <LinearGradient
                  colors={gradients.fire as unknown as string[]}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={{ width: 46, height: 46, borderRadius: radii.sm + 3, alignItems: "center", justifyContent: "center" }}
                >
                  <Glyph name="repeat" size={23} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, fontVariant: ["tabular-nums"] }}>
                    Сложные слова: {s.hardCount}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                    Слова с ошибками и срывами — потренируй их отдельно
                  </Text>
                </View>
                <Glyph name="chevron" size={20} color={colors.mutedForeground} />
              </View>
            </ChunkyTap>
          )}

          <SectionLabel>Повторения за 14 дней</SectionLabel>
          <HistoryCard colors={colors} daily={s.daily ?? []} />

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

/**
 * Прогресс к цели дня в словах.
 *
 * Стоит первым: «что у меня сегодня» важнее, чем сумма за всё время.
 */
function TodayCard({ colors, stats }: any) {
  const goal = stats.dailyWordGoal ?? 10;
  const done = stats.wordsToday ?? 0;
  const reached = done >= goal;
  return (
    <Chunky color={reached ? "#e0b877" : EDGE_LIGHT} style={{ marginBottom: 12 }}>
      <View style={cardBody(colors, { padding: 16 })}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Glyph name={reached ? "check" : "target"} size={16} color={reached ? accents.amber : colors.primary} />
            <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>Сегодня</Text>
          </View>
          <Text style={{
            fontSize: 14, fontWeight: "900", fontVariant: ["tabular-nums"],
            color: reached ? accents.amber : colors.primary,
          }}>
            {done} / {goal}
          </Text>
        </View>
        <GoalPips value={done} target={goal} done={reached} />
        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 11, fontVariant: ["tabular-nums"] }}>
          Повторений сегодня: {stats.reviewsToday ?? 0} · выучено новых: {stats.learnedToday ?? 0}
        </Text>
      </View>
    </Chunky>
  );
}

/**
 * Четыре счётчика рядами по две.
 *
 * Ряды заданы явно, а не flexWrap с шириной в процентах: у процентов нечётная
 * плитка повисает огрызком, и высоты соседей разъезжаются, если подпись
 * переносится на вторую строку.
 */
function StatGrid({ colors, stats }: any) {
  type Spec = { key: string; value: React.ReactNode; label: string; icon: GlyphName; tint: string; edge: string };

  const tiles: Spec[] = [
    { key: "learned", value: stats.totalLearned, label: "Выучено слов", icon: "check", tint: colors.success, edge: accents.violetDeep },
    { key: "total", value: stats.totalWords, label: "В изучении", icon: "book", tint: colors.primary, edge: accents.indigoDeep },
    { key: "reviews", value: stats.totalReviews, label: "Повторений", icon: "repeat", tint: accents.magenta, edge: "#a21caf" },
    { key: "accuracy", value: `${stats.accuracy}%`, label: "Правильных", icon: "target", tint: accents.amber, edge: "#b45309" },
  ];

  const rows: Spec[][] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));

  return (
    <View style={{ marginBottom: 6 }}>
      {rows.map((row) => (
        <View key={row.map((t) => t.key).join("-")} style={{ flexDirection: "row", gap: 12, marginBottom: 6 }}>
          {row.map((t) => (
            <Chunky key={t.key} style={{ flex: 1 }}>
              <View style={cardBody(colors, { flex: 1, padding: 15 })}>
                {/* Значок в градиентной плашке — как на итогах тренировки.
                    Бледный квадрат того же цвета на белом почти не читался. */}
                <LinearGradient
                  colors={[t.tint, t.edge]}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={{
                    width: 34, height: 34, borderRadius: radii.sm,
                    alignItems: "center", justifyContent: "center",
                    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.6)",
                  }}
                >
                  <Glyph name={t.icon} size={18} color="#ffffff" />
                </LinearGradient>
                <Text style={{
                  fontSize: 27, fontWeight: "900", letterSpacing: -1,
                  color: colors.foreground, marginTop: 9, fontVariant: ["tabular-nums"],
                }}>
                  {t.value}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginTop: 1 }}>
                  {t.label}
                </Text>
              </View>
            </Chunky>
          ))}
        </View>
      ))}
    </View>
  );
}

type Day = { date: string; reviews: number; correct: number };

/** График повторений с разбором дня и итогом за период. */
function HistoryCard({ colors, daily }: { colors: any; daily: Day[] }) {
  /** Ширину измеряем, а не вычисляем: см. «ГРАБЛИ» в шапке файла. */
  const [width, setWidth] = React.useState(0);
  const [picked, setPicked] = React.useState<number | null>(null);

  const totals = React.useMemo(() => {
    const reviews = daily.reduce((sum, d) => sum + d.reviews, 0);
    const correct = daily.reduce((sum, d) => sum + d.correct, 0);
    return { reviews, correct, wrong: reviews - correct };
  }, [daily]);

  const day = picked !== null ? daily[picked] : null;

  return (
    <Chunky>
      <View style={cardBody(colors, { padding: 14 })}>
        {/* Строка разбора. Без выбора — итог за период; с выбором — конкретный
            день. Место занято всегда, поэтому карточка не прыгает по высоте. */}
        <View style={{ minHeight: 42, marginBottom: 10 }}>
          {day ? (
            <>
              <Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground }}>
                {formatDay(day.date)}
              </Text>
              <Text style={{ fontSize: 12.5, color: colors.mutedForeground, marginTop: 3, fontVariant: ["tabular-nums"] }}>
                {day.reviews === 0
                  ? "В этот день занятий не было"
                  : `${day.reviews} ${plural(day.reviews, ["повторение", "повторения", "повторений"])}: ${day.correct} верно, ${day.reviews - day.correct} ${plural(day.reviews - day.correct, ["ошибка", "ошибки", "ошибок"])}`}
              </Text>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 14, fontWeight: "900", color: colors.foreground }}>
                Всего за 14 дней
              </Text>
              <Text style={{ fontSize: 12.5, color: colors.mutedForeground, marginTop: 3, fontVariant: ["tabular-nums"] }}>
                {totals.reviews === 0
                  ? "Пока пусто — нажми на столбец, чтобы увидеть день"
                  : `${totals.reviews} ${plural(totals.reviews, ["повторение", "повторения", "повторений"])} · нажми на столбец, чтобы увидеть день`}
              </Text>
            </>
          )}
        </View>

        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 && (
            <DailyBars
              daily={daily}
              colors={colors}
              width={width}
              picked={picked}
              onPick={(i) => setPicked((prev) => (prev === i ? null : i))}
            />
          )}
        </View>

        {/* Легенда с числами: сам цвет ничего не сообщает, пока рядом нет
            количества. Раньше здесь стояли только слова «правильно» и «ошибки». */}
        <View style={{ flexDirection: "row", gap: 18, marginTop: 12, justifyContent: "center" }}>
          <Legend colors={colors} color={accents.violetDeep} label="верно" value={totals.correct} />
          <Legend colors={colors} color={accents.magenta} label="ошибки" value={totals.wrong} />
        </View>
      </View>
    </Chunky>
  );
}

function DailyBars({
  daily, colors, width, picked, onPick,
}: {
  daily: Day[];
  colors: any;
  width: number;
  picked: number | null;
  onPick: (i: number) => void;
}) {
  const n = Math.max(1, daily.length);
  const max = Math.max(1, ...daily.map((d) => d.reviews));

  // Место под подписи: слева ось, снизу даты, сверху воздух под верхний столбец.
  const padLeft = 26;
  const padBottom = 20;
  const padTop = 8;

  const baseY = CHART_H - padBottom;
  const plotH = baseY - padTop;
  const plotW = width - padLeft;
  const slot = plotW / n;
  const bw = Math.min(18, slot * 0.58);

  /** Две линии сетки: середина и потолок. Больше — рябит, меньше — нет шкалы. */
  const ticks = [max, Math.round(max / 2)].filter((v, i, arr) => v > 0 && arr.indexOf(v) === i);

  return (
    <Svg width={width} height={CHART_H}>
      {ticks.map((t) => {
        const y = baseY - (t / max) * plotH;
        return (
          <React.Fragment key={`tick-${t}`}>
            <Line
              x1={padLeft} y1={y} x2={width} y2={y}
              stroke={colors.border} strokeWidth={1} strokeDasharray="3 4"
            />
            <SvgText
              x={padLeft - 6} y={y + 3.5}
              fontSize={9} fontWeight="700"
              fill={colors.mutedForeground} textAnchor="end"
            >
              {t}
            </SvgText>
          </React.Fragment>
        );
      })}

      <Line x1={padLeft} y1={baseY} x2={width} y2={baseY} stroke={colors.border} strokeWidth={1.5} />

      {daily.map((d, i) => {
        const x = padLeft + i * slot + (slot - bw) / 2;
        const isPicked = picked === i;
        const dim = picked !== null && !isPicked;
        const wrong = d.reviews - d.correct;

        // Высоты считаем по отдельности, а не «доля от общей»: у ненулевого
        // сегмента есть минимум, иначе одна ошибка на двадцать верных
        // превращается в невидимую полоску.
        const correctH = d.correct > 0 ? Math.max(MIN_SEG, (d.correct / max) * plotH) : 0;
        const wrongH = wrong > 0 ? Math.max(MIN_SEG, (wrong / max) * plotH) : 0;

        const label = d.date.slice(8, 10);
        // Подписи через одну: на 14 днях они наезжали друг на друга.
        const showLabel = i % 2 === 1 || i === daily.length - 1;

        return (
          <React.Fragment key={d.date}>
            {/* Прозрачная колонка на всю высоту: попасть пальцем в тонкий
                столбец невозможно, а в слот целиком — легко. */}
            <Rect
              x={padLeft + i * slot} y={padTop} width={slot} height={plotH + padBottom}
              fill="transparent"
              onPress={() => onPick(i)}
            />

            {isPicked && (
              <Rect
                x={padLeft + i * slot} y={padTop - 4} width={slot} height={plotH + 8}
                rx={6} fill={colors.primary} opacity={0.1}
              />
            )}

            {d.reviews === 0 ? (
              // Пустой день не пропадает: провал в занятиях — тоже факт, и на
              // графике он должен читаться, а не выглядеть как отсутствие данных.
              <Circle cx={x + bw / 2} cy={baseY - 2} r={1.8} fill={colors.border} />
            ) : (
              <>
                {/* Верные снизу — они основание дня. Ошибки сверху: глаз
                    сравнивает вершины столбцов, и ошибки должны быть там. */}
                <Rect
                  x={x} y={baseY - correctH} width={bw} height={correctH}
                  rx={3} fill={accents.violetDeep} opacity={dim ? 0.3 : 1}
                />
                {wrongH > 0 && (
                  <Rect
                    x={x} y={baseY - correctH - wrongH} width={bw} height={wrongH}
                    rx={3} fill={accents.magenta} opacity={dim ? 0.3 : 1}
                  />
                )}
              </>
            )}

            {(showLabel || isPicked) && (
              <SvgText
                x={x + bw / 2} y={CHART_H - 5}
                fontSize={9} fontWeight={isPicked ? "900" : "700"}
                fill={isPicked ? colors.primary : colors.mutedForeground}
                textAnchor="middle"
              >
                {label}
              </SvgText>
            )}
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

function Legend({ colors, color, label, value }: { colors: any; color: string; label: string; value: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
      <View style={{ width: 11, height: 11, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontSize: 12.5, fontWeight: "900", color: colors.foreground, fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
      <Text style={{ fontSize: 12.5, fontWeight: "600", color: colors.mutedForeground }}>{label}</Text>
    </View>
  );
}
