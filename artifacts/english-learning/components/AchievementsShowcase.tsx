// Витрина наград.
//
// Медали те же, что были: готовые рендеры из assets/badges/medals (поле image
// в constants/achievements.ts). Если картинка не найдена, показываем глиф из
// своего набора, подобранный по сложности. Файл данных не менялся.
//
// ── Почему блок компактный ──────────────────────────────────────────────────
// Раньше витрина занимала пол-экрана профиля: карточка следующей награды,
// сетка полученных и раскрытый по умолчанию список из ~36 закрытых медалей.
// Три с половиной десятка одинаковых замков висели на экране постоянно и не
// сообщали ничего сверх счётчика.
//
// Теперь на профиле: стопка последних медалей веером, счётчик, разбивка по
// сложности и одна строка ближайшей цели. Полный список открывается по тапу.
//
// ── Важно про модальные окна ────────────────────────────────────────────────
// Список и карточка награды живут в ОДНОМ <Modal> и переключаются состоянием
// (view: "list" | "detail"). Вкладывать <Modal> в <Modal> нельзя: на вебе
// (react-native-web) вложенное окно кладёт рендер всего экрана — профиль
// открывался белым. Ровно на этом предыдущая версия блока и падала.
import React, { useState } from "react";
import {
  View, Text, Image, Pressable, Modal, ScrollView,
  StyleSheet, Animated, Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import type { Achievement, AchievementDifficulty, AchievementStats } from "@/constants/achievements";
import { achievementProgress, nextAchievement } from "@/utils/achievementProgress";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { ChunkyButton } from "@/components/ui/GameKit";
import { accents, radii, chunky } from "@/constants/theme";

interface AchievementsShowcaseProps {
  unlocked: Achievement[];
  locked?: Achievement[];
  showLocked?: boolean;
  title?: string;
  /** Показатели ученика. Без них прогресс посчитать нечем. */
  stats?: AchievementStats;
}

/** Фолбэк-глиф: easy — вспышка, medium — медаль, hard — трофей. */
function fallbackGlyph(difficulty: AchievementDifficulty): GlyphName {
  if (difficulty === "hard") return "trophy";
  if (difficulty === "medium") return "medal";
  return "spark";
}

/** Полоса прогресса в цвете награды. */
function ProgressTrack({
  percent, color, height = 8,
}: { percent: number; color: string; height?: number }) {
  return (
    <View style={{
      height,
      borderRadius: radii.pill,
      backgroundColor: color + "22",
      overflow: "hidden",
    }}>
      <LinearGradient
        colors={[color + "cc", color]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ height: "100%", width: `${Math.max(percent, 3)}%`, borderRadius: radii.pill }}
      />
    </View>
  );
}

/** Кружок медали. Один и тот же вид в стопке, в сетке и в карточке. */
function Medal({
  achievement, size, locked,
}: { achievement: Achievement; size: number; locked?: boolean }) {
  return (
    <View
      style={[
        {
          width: size, height: size, borderRadius: size / 2, borderWidth: 2,
          overflow: "hidden", alignItems: "center", justifyContent: "center",
        },
        locked
          ? {
              borderColor: "rgba(139,92,246,0.42)",
              borderStyle: "dashed",
              backgroundColor: "rgba(160,140,220,0.12)",
            }
          : {
              borderColor: achievement.color + "66",
              backgroundColor: achievement.bgColor,
            },
      ]}
    >
      {locked ? (
        <Glyph name="lock" size={Math.round(size * 0.36)} color="rgba(91,79,142,0.5)" />
      ) : achievement.image ? (
        <Image source={achievement.image} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <Glyph name={fallbackGlyph(achievement.difficulty)} size={Math.round(size * 0.46)} color={achievement.color} />
      )}
    </View>
  );
}

/**
 * Стопка последних медалей: три верхние видны, остальные подразумеваются.
 * Сетка на 14 кружков была бы вдвое выше и не сообщала бы ничего сверх счётчика.
 */
function MedalStack({ items }: { items: Achievement[] }) {
  const top = items.slice(-3).reverse();

  if (top.length === 0) {
    return (
      <View style={s.stackEmpty}>
        <Glyph name="trophy" size={22} color="rgba(139,92,246,0.45)" />
      </View>
    );
  }

  return (
    <View style={{ width: 52 + (top.length - 1) * 15, height: 56, justifyContent: "center" }}>
      {top.map((a, i) => (
        <View
          key={a.id}
          style={{
            position: "absolute",
            left: i * 15,
            zIndex: top.length - i,
            opacity: 1 - i * 0.12,
          }}
        >
          <Medal achievement={a} size={52} />
        </View>
      ))}
    </View>
  );
}

/** Разбивка по сложности: сколько получено из скольких. */
function tierCounts(unlocked: Achievement[], locked: Achievement[]) {
  const count = (list: Achievement[], d: AchievementDifficulty) =>
    list.filter((a) => a.difficulty === d).length;

  return (["easy", "medium", "hard"] as const).map((d) => ({
    key: d,
    label: d === "easy" ? "Лёгкие" : d === "medium" ? "Средние" : "Сложные",
    got: count(unlocked, d),
    total: count(unlocked, d) + count(locked, d),
  }));
}

/** Медаль в сетке полного списка. */
function BadgeCard({
  achievement, isLocked = false, percent, onPress,
}: {
  achievement: Achievement;
  isLocked?: boolean;
  percent?: number;
  onPress: () => void;
}) {
  // Медали статичные. Живёт только нажатие: медаль проседает на подставке.
  const press = React.useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: chunky.duration, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => set(3)}
      onPressOut={() => set(0)}
      style={s.badgeWrap}
      accessibilityRole="button"
      accessibilityLabel={isLocked
        ? `Награда «${achievement.title}» ещё не получена`
        : `Награда «${achievement.title}» получена`}
    >
      <View>
        {/* Подставка видна только у полученной: закрытая ещё не «на полке». */}
        {!isLocked && (
          <View style={{
            position: "absolute", left: 0, right: 0, top: 4, height: 60,
            borderRadius: 30, backgroundColor: achievement.color, opacity: 0.55,
          }} />
        )}
        <Animated.View style={{ transform: [{ translateY: press }] }}>
          <Medal achievement={achievement} size={60} locked={isLocked} />
        </Animated.View>
        <View style={{ height: 4 }} />
      </View>

      {isLocked && percent !== undefined && (
        <View style={{ alignSelf: "stretch", marginTop: 4 }}>
          <ProgressTrack percent={percent} color={achievement.color} height={4} />
        </View>
      )}

      <Text
        style={[s.badgeTitle, { color: isLocked ? "#9b8ec4" : achievement.color }]}
        numberOfLines={2}
      >
        {achievement.title}
      </Text>
    </Pressable>
  );
}

/** Карточка одной награды. Рисуется внутри общего окна, своего Modal не имеет. */
function BadgeDetail({
  achievement, isLocked, stats, onBack,
}: {
  achievement: Achievement;
  isLocked: boolean;
  stats?: AchievementStats;
  onBack: () => void;
}) {
  const colors = useColors();
  const progress = isLocked && stats ? achievementProgress(achievement, stats) : null;

  return (
    <View style={{ alignItems: "center", paddingBottom: 8 }}>
      <View
        style={[
          s.detailBadge,
          isLocked
            ? {
                borderColor: "rgba(139,92,246,0.4)",
                borderStyle: "dashed",
                backgroundColor: "rgba(160,140,220,0.14)",
              }
            : {
                borderColor: achievement.color + "55",
                backgroundColor: achievement.bgColor,
                shadowColor: achievement.color,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.42,
                shadowRadius: 22,
                elevation: 9,
              },
        ]}
      >
        {isLocked ? (
          <Glyph name="lock" size={40} color="rgba(91,79,142,0.6)" />
        ) : achievement.image ? (
          <Image source={achievement.image} style={{ width: 104, height: 104 }} resizeMode="cover" />
        ) : (
          <Glyph name={fallbackGlyph(achievement.difficulty)} size={52} color={achievement.color} />
        )}
      </View>

      <View
        style={[
          s.statusPill,
          {
            backgroundColor: isLocked ? "rgba(160,140,220,0.2)" : achievement.color + "18",
            borderColor: isLocked ? "rgba(160,140,220,0.4)" : achievement.color + "55",
          },
        ]}
      >
        <Glyph name={isLocked ? "lock" : "check"} size={12} color={isLocked ? "#7c6db8" : achievement.color} />
        <Text style={[s.statusPillText, { color: isLocked ? "#7c6db8" : achievement.color }]}>
          {isLocked ? "Ещё не получена" : "Получена"}
        </Text>
      </View>

      <Text style={[s.detailTitle, { color: colors.foreground }]}>{achievement.title}</Text>

      {/* Прогресс выше текста условия: цифра отвечает быстрее формулировки. */}
      {progress && (
        <View style={[
          s.detailProgress,
          { backgroundColor: achievement.bgColor, borderColor: achievement.color + "33" },
        ]}>
          <View style={s.detailProgressHead}>
            <Text style={[s.detailProgressText, { color: achievement.color }]}>
              {progress.remainingText}
            </Text>
            <Text style={[s.detailProgressPercent, { color: achievement.color }]}>
              {progress.percent}%
            </Text>
          </View>
          <ProgressTrack percent={progress.percent} color={achievement.color} height={10} />
          <Text style={[s.detailProgressCounter, { color: colors.mutedForeground }]}>
            {progress.counterText}
          </Text>
        </View>
      )}

      <View
        style={[
          s.infoBlock,
          {
            backgroundColor: isLocked ? "rgba(160,140,220,0.14)" : achievement.bgColor,
            borderColor: isLocked ? "rgba(160,140,220,0.32)" : achievement.color + "30",
          },
        ]}
      >
        <View style={s.infoRow}>
          <Glyph name={isLocked ? "target" : "star"} size={13} color={isLocked ? "#7c6db8" : achievement.color} />
          <Text style={[s.infoLabel, { color: isLocked ? "#7c6db8" : achievement.color }]}>
            {isLocked ? "Как получить" : "За что получена"}
          </Text>
        </View>
        <Text style={[s.infoText, { color: colors.foreground }]}>
          {isLocked ? achievement.requirement : achievement.description}
        </Text>
      </View>

      <ChunkyButton label="К списку" icon="chevron" onPress={onBack} style={{ alignSelf: "stretch" }} />
    </View>
  );
}

export function AchievementsShowcase({
  unlocked,
  locked = [],
  showLocked = false,
  title = "Витрина наград",
  stats,
}: AchievementsShowcaseProps) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  // Одно окно на два состояния — вложенные Modal ломают веб (см. шапку файла).
  const [detail, setDetail] = useState<{ achievement: Achievement; isLocked: boolean } | null>(null);

  const total = unlocked.length + locked.length;
  const tiers = React.useMemo(() => tierCounts(unlocked, locked), [unlocked, locked]);
  const lockedList = showLocked ? locked : [];

  // Ближайшая цель. Пересчитывается только при смене статов или списка.
  const next = React.useMemo(
    () => (stats ? nextAchievement(locked, stats) : null),
    [locked, stats],
  );

  const openList = () => { setDetail(null); setOpen(true); };
  const close = () => { setOpen(false); setDetail(null); };

  return (
    <View style={s.section}>
      <Pressable
        onPress={openList}
        style={({ pressed }) => [
          s.box,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            shadowColor: accents.violetDeep,
            opacity: pressed ? 0.94 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${title}: получено ${unlocked.length} из ${total}. Открыть список`}
      >
        {/* ── Стопка + счётчик ── */}
        <View style={s.lead}>
          <MedalStack items={unlocked} />

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.count, { color: colors.foreground }]}>
              {unlocked.length}
              <Text style={[s.countTotal, { color: colors.mutedForeground }]}> / {total}</Text>
            </Text>
            <Text style={[s.countCap, { color: colors.mutedForeground }]}>наград получено</Text>
          </View>

          <View style={[s.openBtn, { backgroundColor: colors.primary + "14" }]}>
            <Glyph name="chevron" size={15} color={colors.primary} />
          </View>
        </View>

        {/* ── Разбивка по сложности ──
            Отвечает на вопрос «куда расти»: видно, что лёгкие почти собраны,
            а сложных нет вовсе. Общий счётчик этого не показывает. */}
        <View style={s.tiers}>
          {tiers.map((t) => {
            const complete = t.total > 0 && t.got === t.total;
            const tint = t.got === 0
              ? colors.mutedForeground
              : complete ? accents.amber : colors.primary;
            return (
              <View key={t.key} style={[s.tier, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Text style={[s.tierLabel, { color: colors.mutedForeground }]}>{t.label}</Text>
                <Text style={[s.tierValue, { color: tint }]}>{t.got}/{t.total}</Text>
              </View>
            );
          })}
        </View>

        {/* ── Ближайшая награда ── */}
        {next && (
          <View style={[s.goal, { borderTopColor: colors.border }]}>
            <Medal achievement={next.achievement} size={34} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.goalTitle, { color: colors.foreground }]} numberOfLines={1}>
                {next.progress.remainingText}
              </Text>
              <View style={{ marginTop: 5 }}>
                <ProgressTrack percent={next.progress.percent} color={next.achievement.color} height={5} />
              </View>
            </View>
            <Text style={[s.goalPercent, { color: next.achievement.color }]}>
              {next.progress.percent}%
            </Text>
          </View>
        )}

        {/* Пустое состояние: объясняет, что делать, а не констатирует пустоту. */}
        {unlocked.length === 0 && !next && (
          <Text style={[s.empty, { color: colors.mutedForeground }]}>
            Выполни первое задание — первая медаль придёт сразу
          </Text>
        )}
      </Pressable>

      {/* ── Одно окно: список или карточка награды ── */}
      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <View style={s.sheetOverlay}>
          <View style={[s.sheet, { backgroundColor: colors.card }]}>
            <View style={[s.sheetHandle, { backgroundColor: colors.border }]} />

            <View style={s.sheetHead}>
              <Text style={[s.sheetTitle, { color: colors.foreground }]}>
                {detail ? "Награда" : "Все награды"}
              </Text>
              <Pressable onPress={close} hitSlop={12}>
                <Glyph name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {detail ? (
                <BadgeDetail
                  achievement={detail.achievement}
                  isLocked={detail.isLocked}
                  stats={stats}
                  onBack={() => setDetail(null)}
                />
              ) : (
                <>
                  {unlocked.length > 0 && (
                    <>
                      <Text style={[s.sheetSection, { color: colors.mutedForeground }]}>
                        Получено · {unlocked.length}
                      </Text>
                      <View style={s.grid}>
                        {unlocked.map((a) => (
                          <BadgeCard
                            key={a.id}
                            achievement={a}
                            isLocked={false}
                            onPress={() => setDetail({ achievement: a, isLocked: false })}
                          />
                        ))}
                      </View>
                    </>
                  )}

                  {lockedList.length > 0 && (
                    <>
                      <Text style={[s.sheetSection, { color: colors.mutedForeground, marginTop: 22 }]}>
                        Ещё не получены · {lockedList.length}
                      </Text>
                      <View style={s.grid}>
                        {lockedList.map((a) => (
                          <BadgeCard
                            key={a.id}
                            achievement={a}
                            isLocked={true}
                            percent={stats ? achievementProgress(a, stats)?.percent : undefined}
                            onPress={() => setDetail({ achievement: a, isLocked: true })}
                          />
                        ))}
                      </View>
                    </>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  section: { paddingHorizontal: 20, marginBottom: 16 },

  box: {
    borderRadius: radii.md, padding: 15, borderWidth: 1,
    shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.13, shadowRadius: 15, elevation: 3,
  },

  // ── Стопка ──
  lead: { flexDirection: "row", alignItems: "center", gap: 14 },
  stackEmpty: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderStyle: "dashed", borderColor: "rgba(139,92,246,0.35)",
    backgroundColor: "rgba(160,140,220,0.1)",
  },
  count: { fontSize: 27, fontWeight: "900", letterSpacing: -0.9, fontVariant: ["tabular-nums"] },
  countTotal: { fontSize: 15, fontWeight: "800" },
  countCap: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  openBtn: {
    width: 34, height: 34, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },

  // ── Уровни ──
  tiers: { flexDirection: "row", gap: 6, marginTop: 14 },
  tier: {
    flex: 1, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 6,
    alignItems: "center", borderWidth: 1,
  },
  tierLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.7, textTransform: "uppercase" },
  tierValue: { fontSize: 15, fontWeight: "900", marginTop: 3, fontVariant: ["tabular-nums"] },

  // ── Ближайшая награда ──
  goal: {
    flexDirection: "row", alignItems: "center", gap: 11,
    marginTop: 13, paddingTop: 13, borderTopWidth: 1,
  },
  goalTitle: { fontSize: 12.5, fontWeight: "800" },
  goalPercent: { fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },

  empty: { fontSize: 12.5, marginTop: 13, lineHeight: 18 },

  // ── Окно ──
  sheetOverlay: { flex: 1, backgroundColor: "rgba(15,12,40,0.5)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    paddingTop: 12, paddingHorizontal: 20, paddingBottom: 20, maxHeight: "88%",
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 14 },
  sheetHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
  },
  sheetTitle: { fontSize: 21, fontWeight: "900", letterSpacing: -0.4 },
  sheetSection: {
    fontSize: 11, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12,
  },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badgeWrap: { width: "22%", alignItems: "center" },
  badgeTitle: { fontSize: 9, fontWeight: "800", textAlign: "center", marginTop: 5, lineHeight: 12 },

  // ── Карточка награды ──
  detailBadge: {
    width: 104, height: 104, borderRadius: 52, borderWidth: 2.5,
    overflow: "hidden", justifyContent: "center", alignItems: "center", marginBottom: 14,
  },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: radii.pill, borderWidth: 1, marginBottom: 10,
  },
  statusPillText: { fontSize: 11, fontWeight: "800" },
  detailTitle: { fontSize: 21, fontWeight: "900", letterSpacing: -0.4, textAlign: "center", marginBottom: 14 },

  detailProgress: { width: "100%", borderRadius: radii.sm + 2, padding: 14, borderWidth: 1, marginBottom: 12 },
  detailProgressHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
  detailProgressText: { fontSize: 13, fontWeight: "800", flex: 1 },
  detailProgressPercent: { fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },
  detailProgressCounter: { fontSize: 11.5, marginTop: 7, fontVariant: ["tabular-nums"] },

  infoBlock: { width: "100%", borderRadius: radii.sm + 2, padding: 14, borderWidth: 1, marginBottom: 18, gap: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  infoText: { fontSize: 13, lineHeight: 19 },
});
