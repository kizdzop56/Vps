// ─────────────────────────────────────────────────────────────────────────────
// Статистика изучения слов.
//
// Экран собран в том же языке, что «Слова» и профиль: у каждой поверхности
// НИЖНЯЯ ГРАНЬ — отдельный слой под корпусом. Проседает при нажатии только то,
// что открывается (строка сложных слов); остальное неподвижно.
//
// ── Про график ──────────────────────────────────────────────────────────────
// ЧИСЛА НАПИСАНЫ, А НЕ ЗАКОДИРОВАНЫ ВЫСОТОЙ. Над каждым столбцом стоит
// количество повторений за день, под ним розовым — ошибки, если они были.
// Ребёнок не должен вычислять значение по высоте столбика и тем более
// сопоставлять его с засечкой на оси.
//
// Отсюда то, чего здесь НЕТ и что было в прошлой версии:
//   • сетки с подписями оси — цифра над столбцом точнее любой засечки;
//   • разбора дня по нажатию — прятать числа за тап значит прятать их совсем:
//     график, в который надо тыкать, никто не разглядывает;
//   • приглушения соседних столбцов — эффект ради эффекта.
//
// Главные два числа (верно и ошибки за две недели) вынесены плитками НАД
// графиком: их не нужно собирать взглядом из четырнадцати столбиков.
//
// ── Почему не SVG ───────────────────────────────────────────────────────────
// Столбцы — обычные View во flex-колонках. Ширина делится сама, и вычислять её
// негде: именно эта арифметика (ширина экрана минус отступы, плюс поле под ось)
// в прошлый раз дала Svg шире карточки, и последний столбец обрезался.
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

/** Высота самого высокого столбца. */
const BAR_MAX_H = 96;

/** Минимальная высота ненулевого сегмента: одна ошибка обязана быть видна. */
const MIN_SEG = 5;

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

/**
 * История за две недели: два итоговых числа и столбцы по дням.
 *
 * Итоги стоят НАД графиком отдельными плитками: «сколько всего верно и сколько
 * ошибок» — главный вопрос к этому блоку, и складывать четырнадцать столбиков
 * глазами ради него никто не будет.
 */
function HistoryCard({ colors, daily }: { colors: any; daily: Day[] }) {
  const totals = React.useMemo(() => {
    const reviews = daily.reduce((sum, d) => sum + d.reviews, 0);
    const correct = daily.reduce((sum, d) => sum + d.correct, 0);
    return { reviews, correct, wrong: reviews - correct };
  }, [daily]);

  const max = Math.max(1, ...daily.map((d) => d.reviews));

  return (
    <Chunky>
      <View style={cardBody(colors, { padding: 14 })}>
        {/* Итоги периода. Число крупное, подпись мелкая: спрашивают о числе. */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
          <TotalPill
            colors={colors}
            value={totals.correct}
            label={plural(totals.correct, ["верный ответ", "верных ответа", "верных ответов"])}
            tint={accents.violetDeep}
          />
          <TotalPill
            colors={colors}
            value={totals.wrong}
            label={plural(totals.wrong, ["ошибка", "ошибки", "ошибок"])}
            tint={accents.magenta}
          />
        </View>

        {/* Столбцы. Колонки flex — ширина делится сама, считать нечего. */}
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          {daily.map((d) => {
            const wrong = d.reviews - d.correct;
            // Высоты сегментов считаются по отдельности, а не «доля от общей»:
            // у ненулевого есть минимум, иначе одна ошибка на двадцать верных
            // превращается в невидимую полоску.
            const correctH = d.correct > 0 ? Math.max(MIN_SEG, (d.correct / max) * BAR_MAX_H) : 0;
            const wrongH = wrong > 0 ? Math.max(MIN_SEG, (wrong / max) * BAR_MAX_H) : 0;
            const label = d.date.slice(8, 10);

            return (
              <View key={d.date} style={{ flex: 1, alignItems: "center" }}>
                {/* Число повторений прямо над столбцом: главное здесь оно, а
                    не высота. Пустой день числа не получает — ноль в ряду
                    цифр читается как данные, хотя это их отсутствие. */}
                <Text style={{
                  fontSize: 8.5, fontWeight: "900", marginBottom: 3,
                  color: d.reviews > 0 ? colors.foreground : "transparent",
                  fontVariant: ["tabular-nums"],
                }}>
                  {d.reviews > 0 ? d.reviews : "0"}
                </Text>

                {/* Ошибки сверху: глаз сравнивает вершины столбцов, и розовая
                    шапка сразу отвечает, был ли в этот день промах. */}
                {wrongH > 0 && (
                  <View style={{
                    width: 11, height: wrongH,
                    borderTopLeftRadius: 3, borderTopRightRadius: 3,
                    backgroundColor: accents.magenta,
                  }} />
                )}
                {correctH > 0 && (
                  <View style={{
                    width: 11, height: correctH,
                    borderTopLeftRadius: wrongH > 0 ? 0 : 3,
                    borderTopRightRadius: wrongH > 0 ? 0 : 3,
                    backgroundColor: accents.violetDeep,
                  }} />
                )}
                {/* Пустой день не исчезает: провал в занятиях — тоже факт. */}
                {d.reviews === 0 && (
                  <View style={{ width: 11, height: 3, borderRadius: 2, backgroundColor: colors.border }} />
                )}

                {/* Число ошибок подписью: цвет говорит «были», цифра — сколько. */}
                <Text style={{
                  fontSize: 8.5, fontWeight: "800", marginTop: 4, minHeight: 11,
                  color: wrong > 0 ? accents.magenta : "transparent",
                  fontVariant: ["tabular-nums"],
                }}>
                  {wrong > 0 ? wrong : "0"}
                </Text>

                <Text style={{
                  fontSize: 9, fontWeight: "700", color: colors.mutedForeground,
                  fontVariant: ["tabular-nums"],
                }}>
                  {label}
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={{
          fontSize: 11.5, color: colors.mutedForeground,
          textAlign: "center", marginTop: 10, lineHeight: 16,
        }}>
          Сверху — сколько повторений за день, снизу розовым — сколько из них с ошибкой
        </Text>
      </View>
    </Chunky>
  );
}

/** Итоговое число за период: крупная цифра, мелкая подпись, цветная грань. */
function TotalPill({
  colors, value, label, tint,
}: { colors: any; value: number; label: string; tint: string }) {
  return (
    <View style={{
      flex: 1, flexDirection: "row", alignItems: "center", gap: 10,
      backgroundColor: tint + "14",
      borderRadius: radii.sm,
      borderWidth: 1, borderColor: tint + "33",
      paddingVertical: 10, paddingHorizontal: 12,
    }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: tint }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{
          fontSize: 20, fontWeight: "900", letterSpacing: -0.6,
          color: colors.foreground, fontVariant: ["tabular-nums"],
        }}>
          {value}
        </Text>
        <Text style={{ fontSize: 10.5, fontWeight: "700", color: colors.mutedForeground }} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}
