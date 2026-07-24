import React, { useRef, useEffect, useState } from "react";
import { View, Text, Animated, StyleSheet, Easing } from "react-native";
import { useColors } from "@/hooks/useColors";
import { XP_LEVELS, getXpProgress, type XpLevel } from "@/constants/xpLevels";

function ShimmerBar({ color, progress }: { color: string; progress: Animated.AnimatedInterpolation<string | number> }) {
  const shimmerPos = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmerPos, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [shimmerPos]);

  return (
    <View style={{ height: 12, borderRadius: 6, overflow: "hidden", position: "relative" }}>
      {/* Filled portion */}
      <Animated.View
        style={{
          position: "absolute", top: 0, left: 0, bottom: 0,
          backgroundColor: color,
          borderRadius: 6,
          width: progress,
          overflow: "hidden",
        }}
      >
        {/* Shimmer strip inside fill */}
        <Animated.View
          style={{
            position: "absolute",
            top: 0, bottom: 0,
            width: "55%",
            backgroundColor: "#ffffff",
            opacity: shimmerPos.interpolate({
              inputRange: [-1, -0.5, 0, 0.5, 1],
              outputRange: [0, 0, 0.35, 0, 0],
            }),
            left: shimmerPos.interpolate({
              inputRange: [-1, 1],
              outputRange: ["-80%", "160%"],
            }),
            transform: [{ skewX: "-20deg" }],
          }}
        />
      </Animated.View>
    </View>
  );
}

interface XpLevelBarProps {
  totalPoints: number;
  compact?: boolean;
}

export function XpLevelBar({ totalPoints, compact = false }: XpLevelBarProps) {
  const colors = useColors();
  const progressAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const countAnim = useRef(new Animated.Value(0)).current;
  const [displayPoints, setDisplayPoints] = useState(0);

  const { current, next, progressPercent } = getXpProgress(totalPoints);
  const isNearLevelUp = progressPercent >= 80 && !!next;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressPercent / 100,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    Animated.timing(countAnim, {
      toValue: totalPoints,
      duration: 1000,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();

    const id = countAnim.addListener(({ value }) => setDisplayPoints(Math.floor(value)));
    return () => countAnim.removeListener(id);
  }, [totalPoints, progressPercent]);

  useEffect(() => {
    if (isNearLevelUp) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1000, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0.3, duration: 1000, useNativeDriver: false }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.06, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      glowAnim.setValue(0);
      pulseAnim.setValue(1);
    }
  }, [isNearLevelUp]);

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={[styles.compactBadge, { backgroundColor: current.bgColor, borderColor: current.color + "60" }]}>
          <Text style={styles.compactEmoji}>{current.emoji}</Text>
          <Text style={[styles.compactLevel, { color: current.color }]}>Ур. {current.level}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={[styles.compactTitle, { color: colors.foreground }]}>{current.title}</Text>
            <Text style={[styles.compactXp, { color: colors.mutedForeground }]}>
              {displayPoints} / {next?.xpRequired ?? "MAX"} XP
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: colors.muted }]}>
            <Animated.View
              style={[
                styles.fill,
                {
                  backgroundColor: current.color,
                  width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                },
              ]}
            />
          </View>
        </View>
      </View>
    );
  }

  const xpToNext = next ? next.xpRequired - totalPoints : 0;
  const xpInLevel = next
    ? totalPoints - current.xpRequired
    : 0;
  const levelRange = next ? next.xpRequired - current.xpRequired : 1;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: current.bgColor + "99",
          borderColor: isNearLevelUp
            ? glowAnim.interpolate({ inputRange: [0, 1], outputRange: [current.color + "40", current.color + "cc"] })
            : current.color + "40",
          borderWidth: 1.5,
          borderRadius: 20,
          padding: 16,
          transform: [{ scale: pulseAnim }],
        },
      ]}
    >
      {/* Top row: avatar badge + level info */}
      <View style={styles.topRow}>
        <View style={[styles.levelCircle, { backgroundColor: current.color }]}>
          <Text style={styles.levelEmoji}>{current.emoji}</Text>
          <Text style={styles.levelNumText}>{current.level}</Text>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[styles.titleText, { color: current.color }]}>{current.title}</Text>
            {isNearLevelUp && (
              <View style={[styles.nearLvlBadge, { backgroundColor: current.color }]}>
                <Text style={styles.nearLvlText}>Почти!</Text>
              </View>
            )}
          </View>
          <Text style={[styles.xpSubText, { color: colors.mutedForeground }]}>
            {next
              ? `До ${next.emoji} ${next.title}: ${xpToNext} XP`
              : "Максимальный уровень! 🏆"}
          </Text>
        </View>

        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.bigPoints, { color: current.color }]}>{displayPoints}</Text>
          <Text style={[styles.xpLabel, { color: colors.mutedForeground }]}>XP</Text>
        </View>
      </View>

      {/* XP bar with shimmer */}
      <View style={{ marginTop: 14, backgroundColor: colors.muted, borderRadius: 6 }}>
        <ShimmerBar
          color={current.color}
          progress={progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] })}
        />
      </View>

      {/* Progress labels */}
      <View style={styles.progressLabels}>
        <Text style={[styles.labelText, { color: colors.mutedForeground }]}>
          {xpInLevel} / {levelRange} XP
        </Text>
        <Text style={[styles.pctBig, { color: current.color }]}>
          {progressPercent}%
        </Text>
      </View>

      {/* Next level reward */}
      {next && (
        <View style={[styles.nextRewardRow, { backgroundColor: current.bgColor, borderColor: current.color + "30" }]}>
          <Text style={[styles.nextRewardLabel, { color: colors.mutedForeground }]}>
            Следующий уровень:
          </Text>
          <Text style={[styles.nextRewardValue, { color: current.color }]}>
            {next.emoji} {next.title} · 🎁 {next.reward}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

export function LevelBadgesShowcase({ currentLevel }: { currentLevel: number }) {
  const colors = useColors();
  const unlocked: XpLevel[] = XP_LEVELS.filter((l) => l.level <= currentLevel);
  const mostRecent = unlocked.slice(-6).reverse();

  if (unlocked.length === 0) return null;

  return (
    <View style={styles.badgesContainer}>
      <Text style={[styles.badgesTitle, { color: colors.mutedForeground }]}>
        ЗНАЧКИ УРОВНЕЙ · {unlocked.length}/50
      </Text>
      <View style={styles.badgesRow}>
        {mostRecent.map((lvl) => (
          <View
            key={lvl.level}
            style={[styles.badge, { backgroundColor: lvl.bgColor, borderColor: lvl.color + "50" }]}
          >
            <Text style={styles.badgeEmoji}>{lvl.emoji}</Text>
            <Text style={[styles.badgeLvl, { color: lvl.color }]}>Ур.{lvl.level}</Text>
          </View>
        ))}
        {unlocked.length > 6 && (
          <View style={[styles.badge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text style={[styles.badgeLvl, { color: colors.mutedForeground }]}>+{unlocked.length - 6}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  topRow: { flexDirection: "row", alignItems: "center" },
  levelCircle: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: "center", alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  levelEmoji: { fontSize: 22 },
  levelNumText: { fontSize: 11, color: "#fff", fontWeight: "900", marginTop: -2 },
  titleText: { fontSize: 16, fontWeight: "800" },
  xpSubText: { fontSize: 12, marginTop: 3 },
  nearLvlBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  nearLvlText: { fontSize: 10, color: "#fff", fontWeight: "800" },
  bigPoints: { fontSize: 24, fontWeight: "900", lineHeight: 26 },
  xpLabel: { fontSize: 11, fontWeight: "600", marginTop: 1 },
  trackBg: {
    height: 12, borderRadius: 6, overflow: "hidden", position: "relative",
  },
  trackFill: { height: "100%", borderRadius: 6 },
  glowOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
  },
  progressLabels: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6,
  },
  labelText: { fontSize: 11 },
  pctBig: { fontSize: 13, fontWeight: "800" },
  nextRewardRow: {
    marginTop: 12, borderRadius: 10, borderWidth: 1,
    padding: 10, gap: 2,
  },
  nextRewardLabel: { fontSize: 11 },
  nextRewardValue: { fontSize: 13, fontWeight: "700" },
  compactContainer: { flexDirection: "row", alignItems: "center", gap: 10 },
  compactBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1,
  },
  compactEmoji: { fontSize: 14 },
  compactLevel: { fontSize: 12, fontWeight: "700" },
  compactTitle: { fontSize: 13, fontWeight: "700" },
  compactXp: { fontSize: 11 },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
  badgesContainer: { marginBottom: 16 },
  badgesTitle: {
    fontSize: 12, fontWeight: "700", marginBottom: 10,
    textTransform: "uppercase", letterSpacing: 0.6,
  },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  badge: {
    width: 52, height: 52, borderRadius: 12, borderWidth: 1.5,
    justifyContent: "center", alignItems: "center",
  },
  badgeEmoji: { fontSize: 22 },
  badgeLvl: { fontSize: 10, fontWeight: "700" },
});
