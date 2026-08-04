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
import React, { useState } from "react";
import {
  View, Text, Image, TouchableOpacity, Pressable, Modal, StyleSheet, Animated, Easing,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import type { Achievement, AchievementDifficulty } from "@/constants/achievements";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { ChunkyButton } from "@/components/ui/GameKit";
import { accents, radii, chunky } from "@/constants/theme";

interface AchievementsShowcaseProps {
  unlocked: Achievement[];
  locked?: Achievement[];
  showLocked?: boolean;
  title?: string;
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

function BadgeCard({
  achievement,
  isLocked = false,
  onPress,
}: {
  achievement: Achievement;
  isLocked?: boolean;
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
  onClose,
}: {
  achievement: Achievement | null;
  isLocked: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  if (!achievement) return null;

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
}: AchievementsShowcaseProps) {
  const colors = useColors();
  const [selected, setSelected] = useState<{ achievement: Achievement; isLocked: boolean } | null>(null);
  // Не полученные награды показываем сразу (не по частям): по умолчанию
  // секция раскрыта, когда showLocked=true, чтобы все медали прогрузились разом.
  const [lockedVisible, setLockedVisible] = useState(showLocked);

  const total = unlocked.length + locked.length;

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
    justifyContent: "center", alignItems: "center", transform: [{ rotate: "-4deg" }],
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
  infoBlock: { width: "100%", borderRadius: radii.sm + 2, padding: 14, borderWidth: 1, marginBottom: 18, gap: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 },
  infoText: { fontSize: 13, lineHeight: 19 },
});
