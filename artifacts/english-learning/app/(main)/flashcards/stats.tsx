// Статистика изучения: сводка + столбчатый график повторений по дням
// (фиолетовая часть столбца — правильные ответы, розовая — ошибки).
// Графика на react-native-svg.
//
// Эмодзи на экране нет: значки — глифы из своего набора (components/ui/Glyph).
// Оформление собрано из GameKit: плитки с цветной тенью, цель дня сегментами.
import React from "react";
import { View, Text, ScrollView, ActivityIndicator, Pressable, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect, Line, Text as SvgText, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { fc } from "@/hooks/useFlashcards";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { Tile, GoalPips, SectionLabel } from "@/components/ui/GameKit";
import { accents, gradients, radii } from "@/constants/theme";

export default function StatsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const statsQ = useQuery({ queryKey: ["fc-stats"], queryFn: () => fc.getStats() });

  const s = statsQ.data;
  const screenW = Dimensions.get("window").width;
  const chartW = screenW - 32 - 28;
  const chartH = 150;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, paddingBottom: 120 }}>
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

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
            <StatCard colors={colors} value={s.totalLearned} label="Выучено слов" icon="check" tint={accents.violetDeep} />
            <StatCard colors={colors} value={s.totalWords} label="В изучении" icon="book" tint={colors.primary} />
            <StatCard colors={colors} value={s.totalReviews} label="Повторений" icon="repeat" tint={accents.magenta} />
            <StatCard colors={colors} value={`${s.accuracy}%`} label="Правильных" icon="target" tint={accents.amber} />
          </View>

          {(s.hardCount ?? 0) > 0 && (
            <Tile
              glow={colors.warning}
              onPress={() => router.push("/flashcards/hard")}
              style={{ flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 20 }}
            >
              {/* Плашка с глифом вместо эмодзи: цвет управляется темой, а не шрифтом ОС. */}
              <LinearGradient
                colors={gradients.fire as unknown as string[]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={{ width: 42, height: 42, borderRadius: radii.sm + 2, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-5deg" }] }}
              >
                <Glyph name="repeat" size={20} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, fontVariant: ["tabular-nums"] }}>
                  Сложные слова: {s.hardCount}
                </Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                  Слова с ошибками и срывами — потренируй их отдельно
                </Text>
              </View>
              <Glyph name="chevron" size={20} color={colors.mutedForeground} />
            </Tile>
          )}

          <SectionLabel>Повторения за 14 дней</SectionLabel>
          <Tile>
            <DailyBars daily={s.daily} colors={colors} chartW={chartW} chartH={chartH} />
            <View style={{ flexDirection: "row", gap: 16, marginTop: 12, justifyContent: "center" }}>
              <Legend colors={colors} color={accents.violetDeep} label="правильно" />
              <Legend colors={colors} color={colors.warning} label="ошибки" />
            </View>
          </Tile>

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

// Прогресс к цели дня в словах + что сделано сегодня. Раньше цель была только по
// минутам в приложении, и «сколько слов за день» ученик нигде не видел.
function TodayCard({ colors, stats }: any) {
  const goal = stats.dailyWordGoal ?? 10;
  const done = stats.wordsToday ?? 0;
  const reached = done >= goal;
  return (
    <Tile glow={reached ? accents.gold : accents.violetDeep} style={{ padding: 16, marginBottom: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Glyph name={reached ? "check" : "target"} size={16} color={reached ? accents.amber : colors.primary} />
          <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>Сегодня</Text>
        </View>
        <Text style={{ fontSize: 14, fontWeight: "900", fontVariant: ["tabular-nums"], color: reached ? accents.amber : colors.primary }}>
          {done} / {goal}
        </Text>
      </View>
      <GoalPips value={done} target={goal} done={reached} />
      <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 11, fontVariant: ["tabular-nums"] }}>
        Повторений сегодня: {stats.reviewsToday ?? 0} · выучено новых: {stats.learnedToday ?? 0}
      </Text>
    </Tile>
  );
}

function DailyBars({ daily, colors, chartW, chartH }: any) {
  const max = Math.max(1, ...daily.map((d: any) => d.reviews));
  const n = daily.length;
  const slot = chartW / n;
  const bw = slot * 0.62;
  const padLeft = 24;
  const baseY = chartH - 18;
  return (
    <Svg width={chartW + padLeft} height={chartH}>
      <Defs>
        {/* Градиент по вертикали: столбец выглядит объёмным, а не заливкой. */}
        <SvgGradient id="barCorrect" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#a855f7" />
          <Stop offset="1" stopColor={accents.violetDeep} />
        </SvgGradient>
        <SvgGradient id="barWrong" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={accents.magenta} />
          <Stop offset="1" stopColor={colors.warning} />
        </SvgGradient>
      </Defs>
      {/* базовая линия */}
      <Line x1={padLeft} y1={baseY} x2={chartW + padLeft} y2={baseY} stroke={colors.border} strokeWidth={1} />
      {daily.map((d: any, i: number) => {
        const totalH = (d.reviews / max) * (baseY - 6);
        const correctH = d.reviews > 0 ? (d.correct / d.reviews) * totalH : 0;
        const x = padLeft + i * slot + (slot - bw) / 2;
        const wrongY = baseY - totalH;
        const correctY = baseY - correctH;
        const label = d.date.slice(8, 10); // день месяца
        return (
          <React.Fragment key={i}>
            {totalH > 0 && <Rect x={x} y={wrongY} width={bw} height={totalH} rx={4} fill="url(#barWrong)" />}
            {correctH > 0 && <Rect x={x} y={correctY} width={bw} height={correctH} rx={4} fill="url(#barCorrect)" />}
            <SvgText x={x + bw / 2} y={chartH - 4} fontSize={9} fontWeight="700" fill={colors.mutedForeground} textAnchor="middle">{label}</SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

/** Счётчик: число как объект — крупное, с табличными цифрами и своим цветом. */
function StatCard({ colors, value, label, icon, tint }: { colors: any; value: React.ReactNode; label: string; icon: GlyphName; tint: string }) {
  return (
    <Tile glow={tint} style={{ width: "47%", flexGrow: 1, padding: 15 }}>
      <View style={{
        width: 32, height: 32, borderRadius: radii.sm - 2,
        backgroundColor: tint + "1f",
        alignItems: "center", justifyContent: "center",
      }}>
        <Glyph name={icon} size={17} color={tint} />
      </View>
      <Text style={{ fontSize: 27, fontWeight: "900", letterSpacing: -1, color: colors.foreground, marginTop: 9, fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginTop: 1 }}>{label}</Text>
    </Tile>
  );
}

function Legend({ colors, color, label }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground }}>{label}</Text>
    </View>
  );
}
