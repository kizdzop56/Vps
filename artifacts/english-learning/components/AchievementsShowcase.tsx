// Витрина наград.
//
// Медали рисуются готовыми рендерами из assets/badges/medals (поле image в
// constants/achievements.ts). Поле emoji там тоже есть, но на экран оно больше
// не выводится: если картинка вдруг не найдена, показываем глиф из своего
// набора, подобранный по сложности награды. Файл данных не меняется.
//
// Полученная медаль стоит на подставке с тёмной нижней гранью и светится в
// своём цвете — тот же физический приём, что у кнопок. Заблокированная не
// прячется: пунктирная рамка с замком тянет вперёд сильнее, чем пустое место.
//
// Прогресс до награды считает utils/achievementProgress.ts. Раньше ученик
// видел только «получена / не получена»: условие было написано словами
// («Выполни 25 заданий»), но сколько у него сейчас и сколько осталось,
// приходилось считать самому. Теперь сверху стоит блок «Следующая награда» —
// ближайшая по заполнению медаль с полосой и остатком, а у каждой закрытой
// медали в списке есть своя тонкая полоса.
//
// ВНИМАНИЕ. Этот блок дважды пытались заменить компактной версией (стопка
// медалей + разбивка по сложности + отдельное окно со списком). Оба раза
// профиль на вебе открывался белым экраном. Причина пока не найдена, поэтому
// здесь снова рабочий вариант: любые переделки витрины нужно проверять на
// проде отдельно от остальных правок, иначе падает весь экран.
import React, { useState } from "react";
import {
  View, Text, Image, TouchableOpacity, Pressable, Modal, StyleSheet, Animated, Easing,
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
  /**
   * Показатели ученика. Без них прогресс посчитать нечем — блок «Следующая
   * награда» и полосы под медалями просто не рисуются, остальное работает
   * как раньше.
   */
  stats?: AchievementStats;
}

/**
 * Фолбэк-глиф вместо эмодзи, когда у награды нет картинки. Подбирается по
 * сложности: лёгкая — вспышка, средняя — медаль, сложная — трофей. Так даже
 * без рендера видно вес награды.
 */
function fallbackGlyph(difficulty: AchievementDifficulty): GlyphName {
  if (difficulty === "hard") return "trophy";
  if (difficulty === "medium") return "medal";
  return "spark";
}

/** Полоса прогресса в цвете награды. Высота задаётся, чтобы одна и та же
 *  полоса работала и крупно (в блоке сверху), и тонко (под медалью). */
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

/**
 * Блок «Следующая награда»: крупная карточка над сеткой медалей.
 *
 * Стоит первым, потому что отвечает на единственный вопрос, который ученик
 * задаёт этому разделу: «что мне сделать прямо сейчас». Список из 50 медалей
 * на этот вопрос не отвечает — в нём приходится искать глазами.
 */
function NextRewardCard({
  achievement, percent, remainingText, counterText, onPress,
}: {
  achievement: Achievement;
  percent: number;
  remainingText: string;
  counterText: string;
  onPress: () => void;
}) {
  const colors = useColors();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.nextCard,
        {
          backgroundColor: achievement.bgColor,
          borderColor: achievement.color + "44",
          shadowColor: achievement.color,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Следующая награда «${achievement.title}». ${remainingText}`}
    >
      <View style={styles.nextTop}>
        {/* Медаль показана как есть, без замка: цель должна выглядеть
            привлекательной, а не запертой. */}
        <View style={[styles.nextBadge, { borderColor: achievement.color + "55" }]}>
          {achievement.image ? (
            <Image source={achievement.image} style={styles.nextBadgeImg} resizeMode="cover" />
          ) : (
            <Glyph name={fallbackGlyph(achievement.difficulty)} size={30} color={achievement.color} />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[styles.nextLabel, { color: achievement.color }]}>Следующая награда</Text>
          <Text style={[styles.nextTitle, { color: colors.foreground }]} numberOfLines={1}>
            {achievement.title}
          </Text>
          <Text style={[styles.nextRemaining, { color: achievement.color }]} numberOfLines={2}>
            {remainingText}
          </Text>
        </View>
      </View>

      <View style={styles.nextBarRow}>
        <View style={{ flex: 1 }}>
          <ProgressTrack percent={percent} color={achievement.color} height={10} />
        </View>
        <Text style={[styles.nextPercent, { color: achievement.color }]}>{percent}%</Text>
      </View>

      <Text style={[styles.nextCounter, { color: colors.mutedForeground }]}>{counterText}</Text>
    </Pressable>
  );
}

function BadgeCard({
  achievement,
  isLocked = false,
  percent,
  onPress,
}: {
  achievement: Achievement;
  isLocked?: boolean;
  /** Заполнение 0…100 для закрытой медали. undefined — полосу не рисуем. */
  percent?: number;
  onPress: () => void;
}) {
  // Медали статичные — idle-анимации (shimmer/pulse/sparkle/spin/bounce) убраны.
  // Живёт только нажатие: медаль проседает на подставке.
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
      style={styles.badgeWrap}
      accessibilityRole="button"
      accessibilityLabel={isLocked ? `Награда «${achievement.title}» ещё не получена` : `Награда «${achievement.title}» получена`}
    >
      <View>
        {/* Подставка под медаль: видна только у полученной — заблокированная
            ещё не «стоит на полке». */}
        {!isLocked && (
          <View style={{
            position: "absolute", left: 0, right: 0, top: 4, height: 60,
            borderRadius: 30, backgroundColor: achievement.color, opacity: 0.55,
          }} />
        )}
        <Animated.View style={{ transform: [{ translateY: press }] }}>
          <View
            style={[
              styles.badgeRing,
              isLocked
                ? {
                    borderColor: "rgba(139,92,246,0.42)",
                    borderStyle: "dashed",
                    backgroundColor: "rgba(160,140,220,0.12)",
                  }
                : {
                    borderColor: achievement.color + "66",
                    backgroundColor: achievement.bgColor,
                    // Свечение в цвете награды: медаль читается как предмет.
                    shadowColor: achievement.color,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.4,
                    shadowRadius: 10,
                    elevation: 5,
                  },
            ]}
          >
            {isLocked ? (
              <Glyph name="lock" size={22} color="rgba(91,79,142,0.5)" />
            ) : achievement.image ? (
              <Image source={achievement.image} style={styles.badgeImg} resizeMode="cover" />
            ) : (
              <Glyph name={fallbackGlyph(achievement.difficulty)} size={28} color={achievement.color} />
            )}
          </View>
        </Animated.View>
        <View style={{ height: 4 }} />
      </View>

      {/* Тонкая полоса под закрытой медалью: видно, какие цели уже близко,
          не открывая карточку. У полученных её нет — там всё и так ясно. */}
      {isLocked && percent !== undefined && (
        <View style={{ alignSelf: "stretch", marginTop: 4 }}>
          <ProgressTrack percent={percent} color={achievement.color} height={4} />
        </View>
      )}

      <Text
        style={[styles.badgeTitle, { color: isLocked ? "#9b8ec4" : achievement.color }]}
        numberOfLines={2}
      >
        {achievement.title}
      </Text>
    </Pressable>
  );
}

function BadgeDetailModal({
  achievement,
  isLocked,
  stats,
  onClose,
}: {
  achievement: Achievement | null;
  isLocked: boolean;
  stats?: AchievementStats;
  onClose: () => void;
}) {
  const colors = useColors();
  if (!achievement) return null;

  const progress = isLocked && stats ? achievementProgress(achievement, stats) : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.modalCard, { backgroundColor: colors.card }]}
          onPress={() => {}}
        >
          <View
            style={[
              styles.modalBadgeOuter,
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
              <Image source={achievement.image} style={styles.modalBadgeImg} resizeMode="cover" />
            ) : (
              <Glyph name={fallbackGlyph(achievement.difficulty)} size={52} color={achievement.color} />
            )}
          </View>

          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: isLocked ? "rgba(160,140,220,0.2)" : achievement.color + "18",
                borderColor: isLocked ? "rgba(160,140,220,0.4)" : achievement.color + "55",
              },
            ]}
          >
            <Glyph
              name={isLocked ? "lock" : "check"}
              size={12}
              color={isLocked ? "#7c6db8" : achievement.color}
            />
            <Text style={[styles.statusPillText, { color: isLocked ? "#7c6db8" : achievement.color }]}>
              {isLocked ? "Ещё не получена" : "Получена"}
            </Text>
          </View>

          <Text style={[styles.modalTitle, { color: colors.foreground }]}>{achievement.title}</Text>

          {/* Прогресс стоит выше текста условия: цифра отвечает на вопрос
              быстрее, чем формулировка. */}
          {progress && (
            <View style={[
              styles.modalProgress,
              { backgroundColor: achievement.bgColor, borderColor: achievement.color + "33" },
            ]}>
              <View style={styles.modalProgressHead}>
                <Text style={[styles.modalProgressText, { color: achievement.color }]}>
                  {progress.remainingText}
                </Text>
                <Text style={[styles.modalProgressPercent, { color: achievement.color }]}>
                  {progress.percent}%
                </Text>
              </View>
              <ProgressTrack percent={progress.percent} color={achievement.color} height={10} />
              <Text style={[styles.modalProgressCounter, { color: colors.mutedForeground }]}>
                {progress.counterText}
              </Text>
            </View>
          )}

          <View
            style={[
              styles.infoBlock,
              {
                backgroundColor: isLocked ? "rgba(160,140,220,0.14)" : achievement.bgColor,
                borderColor: isLocked ? "rgba(160,140,220,0.32)" : achievement.color + "30",
              },
            ]}
          >
            <View style={styles.infoRow}>
              <Glyph
                name={isLocked ? "target" : "star"}
                size={13}
                color={isLocked ? "#7c6db8" : achievement.color}
              />
              <Text style={[styles.infoLabel, { color: isLocked ? "#7c6db8" : achievement.color }]}>
                {isLocked ? "Как получить" : "За что получена"}
              </Text>
            </View>
            <Text style={[styles.infoText, { color: colors.foreground }]}>
              {isLocked ? achievement.requirement : achievement.description}
            </Text>
          </View>

          <ChunkyButton
            label="Закрыть"
            icon="close"
            onPress={onClose}
            style={{ alignSelf: "stretch" }}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
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
  const [selected, setSelected] = useState<{ achievement: Achievement; isLocked: boolean } | null>(null);
  // Не полученные награды показываем сразу (не по частям): по умолчанию
  // секция раскрыта, когда showLocked=true, чтобы все медали прогрузились разом.
  const [lockedVisible, setLockedVisible] = useState(showLocked);

  const total = unlocked.length + locked.length;

  // Ближайшая цель. Пересчитывается только при смене статов или списка —
  // перебирать 50 наград на каждый ре-рендер незачем.
  const next = React.useMemo(
    () => (stats ? nextAchievement(locked, stats) : null),
    [locked, stats],
  );

  return (
    <View style={[
      styles.container,
      {
        backgroundColor: colors.card,
        borderColor: colors.border,
        shadowColor: accents.violetDeep,
      },
    ]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIcon, { backgroundColor: accents.gold + "22" }]}>
            <Glyph name="trophy" size={15} color={accents.amber} />
          </View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
        </View>
        <View style={[styles.countPill, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
          <Text style={[styles.countText, { color: colors.primary }]}>
            {unlocked.length}{showLocked ? `/${total}` : ""} наград
          </Text>
        </View>
      </View>

      {next && (
        <NextRewardCard
          achievement={next.achievement}
          percent={next.progress.percent}
          remainingText={next.progress.remainingText}
          counterText={next.progress.counterText}
          onPress={() => setSelected({ achievement: next.achievement, isLocked: true })}
        />
      )}

      {unlocked.length === 0 && !showLocked ? (
        // Пустое состояние объясняет, что делать, а не просто констатирует.
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "28" }]}>
            <Glyph name="trophy" size={26} color={colors.primary} />
          </View>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Пока нет полученных наград
          </Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
            Выполни первое задание — первая медаль придёт сразу
          </Text>
        </View>
      ) : (
        <>
          {unlocked.length > 0 && (
            <View style={styles.grid}>
              {unlocked.map((a) => (
                <BadgeCard
                  key={a.id}
                  achievement={a}
                  isLocked={false}
                  onPress={() => setSelected({ achievement: a, isLocked: false })}
                />
              ))}
            </View>
          )}

          {showLocked && locked.length > 0 && (
            <>
              <TouchableOpacity
                style={[styles.lockedToggle, { borderColor: colors.border }]}
                onPress={() => setLockedVisible((v) => !v)}
                activeOpacity={0.7}
              >
                <View style={styles.lockedToggleLeft}>
                  <Glyph name="lock" size={13} color={colors.mutedForeground} />
                  <Text style={[styles.lockedToggleText, { color: colors.mutedForeground }]}>
                    Ещё не получены · {locked.length}
                  </Text>
                </View>
                {/* chevron вниз — свёрнуто, вверх — раскрыто. */}
                <View style={{ transform: [{ rotate: lockedVisible ? "-90deg" : "90deg" }] }}>
                  <Glyph name="chevron" size={14} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>

              {lockedVisible && (
                <View style={[styles.lockedSection, { backgroundColor: "rgba(220,210,255,0.18)", borderColor: colors.border }]}>
                  <View style={styles.grid}>
                    {locked.map((a) => (
                      <BadgeCard
                        key={a.id}
                        achievement={a}
                        isLocked={true}
                        percent={stats ? achievementProgress(a, stats)?.percent : undefined}
                        onPress={() => setSelected({ achievement: a, isLocked: true })}
                      />
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </>
      )}

      <BadgeDetailModal
        achievement={selected?.achievement ?? null}
        isLocked={selected?.isLocked ?? false}
        stats={stats}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.md, padding: 16, marginBottom: 16, borderWidth: 1,
    marginHorizontal: 20,
    shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.13, shadowRadius: 15, elevation: 3,
  },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerIcon: { width: 28, height: 28, borderRadius: 9, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 14, fontWeight: "800", letterSpacing: 0.2 },
  countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, borderWidth: 1 },
  countText: { fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },

  nextCard: {
    borderRadius: radii.md, borderWidth: 1.5, padding: 14, marginBottom: 16,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 5,
  },
  nextTop: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 12 },
  nextBadge: {
    width: 58, height: 58, borderRadius: 29, borderWidth: 2,
    overflow: "hidden", alignItems: "center", justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  nextBadgeImg: { width: 58, height: 58 },
  nextLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  nextTitle: { fontSize: 16, fontWeight: "900", letterSpacing: -0.3, marginTop: 2 },
  nextRemaining: { fontSize: 12.5, fontWeight: "800", marginTop: 3, lineHeight: 17 },
  nextBarRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  nextPercent: { fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"], minWidth: 38, textAlign: "right" },
  nextCounter: { fontSize: 11.5, marginTop: 6, fontVariant: ["tabular-nums"] },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  badgeWrap: { width: "22%", alignItems: "center" },
  badgeRing: {
    width: 60, height: 60, borderRadius: 30, borderWidth: 2,
    overflow: "hidden", justifyContent: "center", alignItems: "center",
  },
  badgeImg: { width: 60, height: 60 },
  badgeTitle: { fontSize: 9, fontWeight: "800", textAlign: "center", marginTop: 5, lineHeight: 12 },

  lockedToggle: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radii.sm - 2, borderWidth: 1,
  },
  lockedToggleLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  lockedToggleText: { fontSize: 12, fontWeight: "700" },
  lockedSection: { marginTop: 10, borderRadius: radii.sm, padding: 12, borderWidth: 1 },

  emptyState: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyIcon: {
    width: 56, height: 56, borderRadius: radii.md, borderWidth: 1,
    justifyContent: "center", alignItems: "center",
  },
  emptyText: { fontSize: 13, fontWeight: "800" },
  emptyHint: { fontSize: 12, textAlign: "center", maxWidth: 240, lineHeight: 17 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(15,12,40,0.55)", justifyContent: "center", alignItems: "center", padding: 28 },
  modalCard: {
    borderRadius: radii.lg, padding: 28, width: "100%",
    alignItems: "center", shadowColor: "#6366f1", shadowOpacity: 0.2,
    shadowRadius: 26, shadowOffset: { width: 0, height: 10 }, elevation: 12,
  },
  modalBadgeOuter: {
    width: 104, height: 104, borderRadius: 52, borderWidth: 2.5,
    overflow: "hidden", justifyContent: "center", alignItems: "center",
    marginBottom: 14,
  },
  modalBadgeImg: { width: 104, height: 104 },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: radii.pill, borderWidth: 1, marginBottom: 10,
  },
  statusPillText: { fontSize: 11, fontWeight: "800" },
  modalTitle: { fontSize: 21, fontWeight: "900", letterSpacing: -0.4, textAlign: "center", marginBottom: 14 },

  modalProgress: { width: "100%", borderRadius: radii.sm + 2, padding: 14, borderWidth: 1, marginBottom: 12 },
  modalProgressHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
  modalProgressText: { fontSize: 13, fontWeight: "800", flex: 1 },
  modalProgressPercent: { fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },
  modalProgressCounter: { fontSize: 11.5, marginTop: 7, fontVariant: ["tabular-nums"] },

  infoBlock: { width: "100%", borderRadius: radii.sm + 2, padding: 14, borderWidth: 1, marginBottom: 18, gap: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  infoText: { fontSize: 13, lineHeight: 19 },
});
