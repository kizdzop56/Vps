import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, Image, TouchableOpacity, Modal, StyleSheet, Animated,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { Achievement } from "@/constants/achievements";

interface AchievementsShowcaseProps {
  unlocked: Achievement[];
  locked?: Achievement[];
  showLocked?: boolean;
  title?: string;
}

type AnimType = "shimmer" | "pulse" | "sparkle" | "spin" | "bounce";

function getAnimType(id: string): AnimType {
  const types: AnimType[] = ["shimmer", "pulse", "sparkle", "spin", "bounce"];
  const hash = id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return types[hash % types.length];
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
  const animType: AnimType = isLocked ? "shimmer" : getAnimType(achievement.id);

  const shimmerX = useRef(new Animated.Value(-70)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const spark1 = useRef(new Animated.Value(0)).current;
  const spark2 = useRef(new Animated.Value(0)).current;
  const spark3 = useRef(new Animated.Value(0)).current;
  const spinVal = useRef(new Animated.Value(0)).current;
  const bounceY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isLocked) return;
    let anim: Animated.CompositeAnimation | null = null;

    if (animType === "shimmer") {
      shimmerX.setValue(-70);
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerX, { toValue: 70, duration: 1300, useNativeDriver: true }),
          Animated.delay(2400),
          Animated.timing(shimmerX, { toValue: -70, duration: 0, useNativeDriver: true }),
        ])
      );
    } else if (animType === "pulse") {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, { toValue: 1.12, duration: 750, useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1, duration: 750, useNativeDriver: true }),
          Animated.delay(1200),
        ])
      );
    } else if (animType === "sparkle") {
      const makeSpark = (a: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(a, { toValue: 1, duration: 320, useNativeDriver: true }),
            Animated.timing(a, { toValue: 0, duration: 320, useNativeDriver: true }),
            Animated.delay(1300),
          ])
        );
      anim = Animated.parallel([
        makeSpark(spark1, 0),
        makeSpark(spark2, 420),
        makeSpark(spark3, 840),
      ]);
    } else if (animType === "spin") {
      anim = Animated.loop(
        Animated.timing(spinVal, { toValue: 1, duration: 2200, useNativeDriver: true })
      );
    } else if (animType === "bounce") {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(bounceY, { toValue: -6, duration: 480, useNativeDriver: true }),
          Animated.timing(bounceY, { toValue: 0, duration: 480, useNativeDriver: true }),
          Animated.delay(1600),
        ])
      );
    }

    if (anim) anim.start();
    return () => { if (anim) anim.stop(); };
  }, [animType, isLocked]);

  const spinDeg = spinVal.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  const badgeBorderColor = isLocked ? "rgba(160,140,220,0.2)" : achievement.color + "55";
  const badgeBg = isLocked ? "rgba(220,210,255,0.15)" : achievement.bgColor;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={styles.badgeWrap}>
      <Animated.View
        style={[
          { position: "relative" },
          animType === "bounce" && !isLocked && { transform: [{ translateY: bounceY }] },
        ]}
      >
        <Animated.View
          style={[
            styles.badgeRing,
            { borderColor: badgeBorderColor, backgroundColor: badgeBg },
            animType === "pulse" && !isLocked && { transform: [{ scale: pulseScale }] },
          ]}
        >
          <View style={[styles.badgeImgWrap, isLocked && { opacity: 0.28 }]}>
            {achievement.image ? (
              <Image source={achievement.image} style={styles.badgeImg} resizeMode="cover" />
            ) : (
              <Text style={styles.badgeEmoji}>{achievement.emoji}</Text>
            )}
          </View>

          {/* Shimmer sweep */}
          {animType === "shimmer" && !isLocked && (
            <Animated.View
              style={{
                position: "absolute",
                width: 18,
                height: 80,
                backgroundColor: "rgba(255,255,255,0.5)",
                transform: [{ rotate: "38deg" }, { translateX: shimmerX }],
              }}
            />
          )}

          {/* Spin arc */}
          {animType === "spin" && !isLocked && (
            <Animated.View
              style={{
                position: "absolute",
                width: 56,
                height: 56,
                borderRadius: 28,
                borderWidth: 2.5,
                borderColor: "transparent",
                borderTopColor: achievement.color,
                borderRightColor: achievement.color + "70",
                transform: [{ rotate: spinDeg }],
              }}
            />
          )}

          {isLocked && (
            <View style={styles.lockOverlay}>
              <Feather name="lock" size={14} color="rgba(91,79,142,0.85)" />
            </View>
          )}
        </Animated.View>

        {/* Sparkle stars — outside ring */}
        {animType === "sparkle" && !isLocked && (
          <>
            <Animated.Text
              style={{
                position: "absolute", top: -7, right: -3,
                fontSize: 11, color: achievement.color, opacity: spark1,
              }}
            >✦</Animated.Text>
            <Animated.Text
              style={{
                position: "absolute", top: 6, left: -9,
                fontSize: 9, color: achievement.color, opacity: spark2,
              }}
            >✦</Animated.Text>
            <Animated.Text
              style={{
                position: "absolute", bottom: -5, right: -2,
                fontSize: 10, color: achievement.color, opacity: spark3,
              }}
            >✦</Animated.Text>
          </>
        )}
      </Animated.View>

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
                <Text style={styles.modalBadgeEmoji}>{achievement.emoji}</Text>
              )}
            </View>
            {isLocked && (
              <View style={styles.modalLockOverlay}>
                <Feather name="lock" size={26} color="rgba(91,79,142,0.9)" />
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
            <Feather
              name={isLocked ? "lock" : "check-circle"}
              size={11}
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
              <Feather
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
  const [lockedVisible, setLockedVisible] = useState(false);

  const total = unlocked.length + locked.length;

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIcon, { backgroundColor: "#6366f115" }]}>
            <Feather name="award" size={14} color="#6366f1" />
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
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🏆</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Пока нет полученных наград
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
                  <Feather name="lock" size={12} color={colors.mutedForeground} />
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
  countText: { fontSize: 11, fontWeight: "700", color: "#6366f1" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  badgeWrap: { width: "22%", alignItems: "center" },
  badgeRing: {
    width: 60, height: 60, borderRadius: 30, borderWidth: 2,
    overflow: "hidden", justifyContent: "center", alignItems: "center", position: "relative",
  },
  badgeImgWrap: { width: 60, height: 60, justifyContent: "center", alignItems: "center" },
  badgeImg: { width: 60, height: 60 },
  badgeEmoji: { fontSize: 28 },
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
  emptyEmoji: { fontSize: 34 },
  emptyText: { fontSize: 13 },

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
  modalBadgeEmoji: { fontSize: 52 },
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
