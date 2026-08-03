// Всплывающее уведомление о новой награде.
//
// Эмодзи не используется: если у награды нет готового рендера из
// assets/badges/medals, показываем глиф по сложности. Тень цветная (в цвете
// награды), а не серая: на светло-фиолетовом фоне серая тень читается грязью.
import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet, Image } from "react-native";
import type { Achievement, AchievementDifficulty } from "@/constants/achievements";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";

interface AchievementToastProps {
  achievement: Achievement | null;
  onHide: () => void;
}

/** Тот же принцип, что и в витрине: сложность задаёт вес значка. */
function fallbackGlyph(difficulty: AchievementDifficulty): GlyphName {
  if (difficulty === "hard") return "trophy";
  if (difficulty === "medium") return "medal";
  return "spark";
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
          // Цветная тень: свечение в цвете награды вместо серого пятна.
          shadowColor: achievement.color,
          transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
      accessibilityRole="alert"
      accessibilityLabel={`Новая награда: ${achievement.title}`}
    >
      <View style={[styles.iconCircle, { backgroundColor: achievement.color + "20" }]}>
        {achievement.image ? (
          <Image source={achievement.image} style={styles.badgeImg} resizeMode="cover" />
        ) : (
          <Glyph name={fallbackGlyph(achievement.difficulty)} size={28} color={achievement.color} />
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
    shadowOpacity: 0.28, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  iconCircle: {
    width: 52, height: 52, borderRadius: 26,
    justifyContent: "center", alignItems: "center",
    overflow: "hidden",
  },
  badgeImg: { width: 52, height: 52, borderRadius: 26 },
  textArea: { flex: 1 },
  label: { fontSize: 11, fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 },
  title: { fontSize: 15, fontWeight: "800", marginTop: 2 },
  desc: { fontSize: 12, marginTop: 2 },
});
