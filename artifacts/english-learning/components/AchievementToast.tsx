import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet, Image } from "react-native";
import type { Achievement } from "@/constants/achievements";

interface AchievementToastProps {
  achievement: Achievement | null;
  onHide: () => void;
}

export function AchievementToast({ achievement, onHide }: AchievementToastProps) {
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (!achievement) return;

    slideAnim.setValue(-120);
    opacityAnim.setValue(0);
    scaleAnim.setValue(0.8);

    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 9, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 80, friction: 9, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: -120, duration: 400, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start(() => onHide());
    }, 3500);

    return () => clearTimeout(timer);
  }, [achievement, slideAnim, opacityAnim, scaleAnim, onHide]);

  if (!achievement) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: achievement.bgColor,
          borderColor: achievement.color + "80",
          transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: achievement.color + "20" }]}>
        {achievement.image ? (
          <Image source={achievement.image} style={styles.badgeImg} resizeMode="cover" />
        ) : (
          <Text style={styles.emoji}>{achievement.emoji}</Text>
        )}
      </View>
      <View style={styles.textArea}>
        <Text style={styles.label}>Новое достижение!</Text>
        <Text style={[styles.title, { color: achievement.color }]}>{achievement.title}</Text>
        <Text style={[styles.desc, { color: achievement.color + "bb" }]}>{achievement.description}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute", top: 56, left: 16, right: 16, zIndex: 999,
    borderRadius: 16, borderWidth: 1.5, padding: 14,
    flexDirection: "row", alignItems: "center", gap: 12,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  iconCircle: {
    width: 52, height: 52, borderRadius: 26,
    justifyContent: "center", alignItems: "center",
    overflow: "hidden",
  },
  badgeImg: { width: 52, height: 52, borderRadius: 26 },
  emoji: { fontSize: 28 },
  textArea: { flex: 1 },
  label: { fontSize: 11, fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 },
  title: { fontSize: 15, fontWeight: "800", marginTop: 2 },
  desc: { fontSize: 12, marginTop: 2 },
});
