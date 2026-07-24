import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, Platform, StyleSheet, Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { SESSION_START_KEY } from "./_layout";

function formatHM(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return { value: String(m), unit: m === 1 ? "мин" : "мин" };
  if (m === 0) return { value: String(h), unit: h === 1 ? "час" : h <= 4 ? "часа" : "часов" };
  return { value: `${h} ч ${m}`, unit: "мин" };
}

function formatSeconds(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function PulsingRing({ color, size, delay }: { color: string; size: number; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const opacity = anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.6, 0.4, 0] });
  return (
    <Animated.View style={{
      position: "absolute",
      width: size, height: size, borderRadius: size / 2,
      borderWidth: 2, borderColor: color,
      transform: [{ scale }], opacity,
    }} />
  );
}

export default function TimerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [sessionSeconds, setSessionSeconds] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const init = async () => {
      const raw = await AsyncStorage.getItem(SESSION_START_KEY);
      const startMs = raw ? Number(raw) : null;

      const calcElapsed = () => {
        if (!startMs) return 0;
        return Math.floor((Date.now() - startMs) / 1000);
      };

      setSessionSeconds(calcElapsed());
      tickRef.current = setInterval(() => setSessionSeconds(calcElapsed()), 1000);
    };
    init();
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  const storedMinutes = (user as any)?.totalTimeMinutes ?? 0;
  const sessionMinutes = Math.floor(sessionSeconds / 60);
  const totalMinutes = storedMinutes + sessionMinutes;

  const { value: totalValue, unit: totalUnit } = formatHM(totalMinutes);

  const STATS = [
    { icon: "clock" as const,      color: "#6366f1", label: "Всего в приложении", value: formatHM(totalMinutes).value + " " + formatHM(totalMinutes).unit },
    { icon: "activity" as const,   color: "#6366f1", label: "Текущая сессия",     value: formatSeconds(sessionSeconds) },
    { icon: "star" as const,       color: "#ec4899", label: "Очки опыта",         value: String((user as any)?.totalPoints ?? 0) },
    { icon: "check-circle" as const,color: "#8b5cf6", label: "Заданий выполнено", value: String((user as any)?.completedAssignments ?? 0) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 120,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={{ fontSize: 26, fontWeight: "800", color: colors.foreground, marginBottom: 2 }}>
          Таймер
        </Text>
        <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 32 }}>
          Время, проведённое в приложении
        </Text>

        {/* Big clock visual */}
        <View style={{ alignItems: "center", marginBottom: 36 }}>
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <PulsingRing color="#6366f1" size={180} delay={0} />
            <PulsingRing color="#6366f1" size={180} delay={600} />
            <PulsingRing color="#6366f1" size={180} delay={1200} />
            <View style={{
              width: 160, height: 160, borderRadius: 80,
              backgroundColor: "#6366f1" + "15",
              borderWidth: 3, borderColor: "#6366f1" + "40",
              justifyContent: "center", alignItems: "center",
              gap: 4,
            }}>
              <Feather name="clock" size={34} color="#6366f1" />
              <Text style={{ fontSize: 38, fontWeight: "900", color: "#6366f1", lineHeight: 44 }}>
                {totalValue}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#6366f1" + "99" }}>
                {totalUnit}
              </Text>
            </View>
          </View>

          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 20, textAlign: "center" }}>
            Всего времени в приложении
          </Text>
        </View>

        {/* Live session card */}
        <View style={{
          backgroundColor: "#6366f1" + "12",
          borderRadius: 18, padding: 20,
          borderWidth: 1.5, borderColor: "#6366f1" + "40",
          marginBottom: 16,
          flexDirection: "row", alignItems: "center", gap: 14,
        }}>
          <View style={{
            width: 50, height: 50, borderRadius: 25,
            backgroundColor: "#6366f1" + "20",
            justifyContent: "center", alignItems: "center",
          }}>
            <Feather name="activity" size={24} color="#6366f1" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#6366f1" + "99", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
              Текущая сессия
            </Text>
            <Text style={{ fontSize: 32, fontWeight: "900", color: "#6366f1", letterSpacing: 1 }}>
              {formatSeconds(sessionSeconds)}
            </Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
              Время с момента входа в приложение
            </Text>
          </View>
        </View>

        {/* Stats grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {[
            { icon: "clock" as const,      color: "#6366f1", label: "Всего",          value: totalValue, unit: totalUnit },
            { icon: "zap" as const,        color: "#ec4899", label: "Очки XP",        value: String((user as any)?.totalPoints ?? 0), unit: "очков" },
            { icon: "check-circle" as const,color: "#8b5cf6", label: "Заданий",       value: String((user as any)?.completedAssignments ?? 0), unit: "выполнено" },
            { icon: "award" as const,      color: "#e11d48", label: "Серия",          value: String((user as any)?.loginStreak ?? 0), unit: "дней" },
          ].map(stat => (
            <View
              key={stat.label}
              style={{
                width: "47.5%",
                backgroundColor: colors.card,
                borderRadius: 16, padding: 16,
                borderWidth: 1, borderColor: colors.border,
                gap: 6,
              }}
            >
              <View style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: stat.color + "18",
                justifyContent: "center", alignItems: "center",
              }}>
                <Feather name={stat.icon} size={18} color={stat.color} />
              </View>
              <Text style={{ fontSize: 24, fontWeight: "900", color: colors.foreground }}>
                {stat.value}
              </Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground, fontWeight: "600" }}>
                {stat.unit}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: "700", color: stat.color, textTransform: "uppercase", letterSpacing: 0.4 }}>
                {stat.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Tip */}
        <View style={{
          marginTop: 20,
          backgroundColor: colors.card, borderRadius: 14, padding: 14,
          borderWidth: 1, borderColor: colors.border,
          flexDirection: "row", gap: 10, alignItems: "flex-start",
        }}>
          <Feather name="info" size={16} color={colors.mutedForeground} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 12, color: colors.mutedForeground, lineHeight: 18 }}>
            Время засчитывается, пока приложение открыто. При сворачивании таймер сессии ставится на паузу.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
