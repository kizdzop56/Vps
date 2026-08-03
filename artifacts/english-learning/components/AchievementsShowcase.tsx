// Витрина наград.
//
// Медали рисуются готовыми рендерами из assets/badges/medals (поле image в
// constants/achievements.ts). Поле emoji там тоже есть, но на экран оно больше
// не выводится: если картинка вдруг не найдена, показываем глиф из своего
// набора, подобранный по сложности награды. Файл данных не меняется.
import React, { useState } from "react";
import {
  View, Text, Image, TouchableOpacity, Modal, StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { Achievement, AchievementDifficulty } from "@/constants/achievements";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";

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
  const badgeBorderColor = isLocked ? "rgba(160,140,220,0.2)" : achievement.color + "55";
  const badgeBg = isLocked ? "rgba(220,210,255,0.15)" : achievement.bgColor;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={styles.badgeWrap}
      accessibilityRole="button"
      accessibilityLabel={isLocked ? `Награда «${achievement.title}» ещё не получена` : `Награда «${achievement.title}» получена`}
    >
      <View style={{ position: "relative" }}>
        <View
          style={[
            styles.badgeRing,
            { borderColor: badgeBorderColor, backgroundColor: badgeBg },
          ]}
        >
          <View style={[styles.badgeImgWrap, isLocked && { opacity: 0.28 }]}>
            {achievement.image ? (
              <Image source={achievement.image} style={styles.badgeImg} resizeMode="cover" />
            ) : (
              <Glyph name={fallbackGlyph(achievement.difficulty)} size={28} color={achievement.color} />
            )}
          </View>

          {isLocked && (
            <View style={styles.lockOverlay}>
              <Glyph name="lock" size={15} color="rgba(91,79,142,0.85)" />
            </View>
          )}
        </View>
      </View>

      <Text
        style={[styles.badgeTitle, { color: isLocked ? "#9b8ec4" : achievement.color }]}
        numberOfLines={2}
      >
        {achievement.title}
      </Text>
    </TouchableOpacity>
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
  if (!achievement) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.modalCard} onPress={() => {}}>
          <View
            style={[
              styles.modalBadgeOuter,
              {
                borderColor: isLocked ? "rgba(160,140,220,0.3)" : achievement.color + "50",
                backgroundColor: isLocked ? "rgba(220,210,255,0.2)" : achievement.bgColor,
              },
            ]}
          >
            <View style={[styles.modalBadgeInner, isLocked && { opacity: 0.3 }]}>
              {achievement.image ? (
                <Image source={achievement.image} style={styles.modalBadgeImg} resizeMode="cover" />
              ) : (
                <Glyph name={fallbackGlyph(achievement.difficulty)} size={52} color={achievement.color} />
              )}
            </View>
            {isLocked && (
              <View style={styles.modalLockOverlay}>
                <Glyph name="lock" size={26} color="rgba(91,79,142,0.9)" />
              </View>
            )}
          </View>

          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: isLocked ? "rgba(220,210,255,0.35)" : achievement.color + "18",
                borderColor: isLocked ? "rgba(160,140,220,0.35)" : achievement.color + "55",
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

          <Text style={styles.modalTitle}>{achievement.title}</Text>

          <View
            style={[
              styles.infoBlock,
              {
                backgroundColor: isLocked ? "rgba(220,210,255,0.25)" : achievement.bgColor,
                borderColor: isLocked ? "rgba(160,140,220,0.3)" : achievement.color + "30",
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
            <Text style={styles.infoText}>
              {isLocked ? achievement.requirement : achievement.description}
            </Text>
          </View>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Закрыть</Text>
          </TouchableOpacity>
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
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIcon, { backgroundColor: "#6366f115" }]}>
            <Glyph name="medal" size={15} color="#6366f1" />
          </View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
        </View>
        <View style={[styles.countPill, { backgroundColor: "#6366f112", borderColor: "#6366f130" }]}>
          <Text style={styles.countText}>
            {unlocked.length}{showLocked ? `/${total}` : ""} наград
          </Text>
        </View>
      </View>

      {unlocked.length === 0 && !showLocked ? (
        // Пустое состояние объясняет, что делать, а не просто констатирует.
        <View style={styles.emptyState}>
          <View style={[styles.emptyIcon, { backgroundColor: "#6366f112", borderColor: "#6366f128" }]}>
            <Glyph name="trophy" size={26} color="#6366f1" />
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
                <Feather
                  name={lockedVisible ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={colors.mutedForeground}
                />
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
  container: { borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1, overflow: "hidden" },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerIcon: { width: 28, height: 28, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 14, fontWeight: "800", letterSpacing: 0.2 },
  countPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  countText: { fontSize: 11, fontWeight: "700", color: "#6366f1", fontVariant: ["tabular-nums"] },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  badgeWrap: { width: "22%", alignItems: "center" },
  badgeRing: {
    width: 60, height: 60, borderRadius: 30, borderWidth: 2,
    overflow: "hidden", justifyContent: "center", alignItems: "center", position: "relative",
  },
  badgeImgWrap: { width: 60, height: 60, justifyContent: "center", alignItems: "center" },
  badgeImg: { width: 60, height: 60 },
  lockOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(240,235,255,0.65)", justifyContent: "center", alignItems: "center",
  },
  badgeTitle: { fontSize: 9, fontWeight: "700", textAlign: "center", marginTop: 5, lineHeight: 12 },

  lockedToggle: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 14, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
  },
  lockedToggleLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  lockedToggleText: { fontSize: 12, fontWeight: "600" },
  lockedSection: { marginTop: 10, borderRadius: 12, padding: 12, borderWidth: 1 },

  emptyState: { alignItems: "center", paddingVertical: 24, gap: 8 },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 18, borderWidth: 1,
    justifyContent: "center", alignItems: "center", transform: [{ rotate: "-4deg" }],
  },
  emptyText: { fontSize: 13, fontWeight: "700" },
  emptyHint: { fontSize: 12, textAlign: "center", maxWidth: 240, lineHeight: 17 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(15,12,40,0.55)", justifyContent: "center", alignItems: "center", padding: 28 },
  modalCard: {
    backgroundColor: "#ffffff", borderRadius: 24, padding: 28, width: "100%",
    alignItems: "center", shadowColor: "#6366f1", shadowOpacity: 0.18,
    shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 10,
  },
  modalBadgeOuter: {
    width: 104, height: 104, borderRadius: 52, borderWidth: 2.5,
    overflow: "hidden", justifyContent: "center", alignItems: "center",
    marginBottom: 14, position: "relative",
  },
  modalBadgeInner: { width: 104, height: 104, justifyContent: "center", alignItems: "center" },
  modalBadgeImg: { width: 104, height: 104 },
  modalLockOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(240,235,255,0.7)", justifyContent: "center", alignItems: "center",
  },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1, marginBottom: 10,
  },
  statusPillText: { fontSize: 11, fontWeight: "700" },
  modalTitle: { fontSize: 20, fontWeight: "900", color: "#0f172a", textAlign: "center", marginBottom: 14 },
  infoBlock: { width: "100%", borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 20, gap: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  infoText: { fontSize: 13, color: "#374151", lineHeight: 19 },
  closeBtn: { backgroundColor: "#6366f1", borderRadius: 14, paddingHorizontal: 32, paddingVertical: 11, width: "100%", alignItems: "center" },
  closeBtnText: { fontSize: 14, fontWeight: "800", color: "#ffffff" },
});
