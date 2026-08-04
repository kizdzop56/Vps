// Экран таймера: общее время в приложении, текущая сессия и краткая сводка.
//
// Эмодзи в интерфейсе не используются: значки — глифы из своего набора.
// Цвета берутся из палитры, поэтому экран не выпадает из общей гаммы.
import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, ScrollView, Platform, Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { SESSION_START_KEY } from "./_layout";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { SectionLabel } from "@/components/ui/GameKit";
import { accents, gradients, radii } from "@/constants/theme";

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

/**
 * Расходящееся кольцо вокруг таймера. Анимируем только scale и opacity —
 * они уходят в нативный драйвер и не грузят JS-поток даже на слабом телефоне.
 */
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

  const stats: { icon: GlyphName; color: string; label: string; value: string; unit: string }[] = [
    { icon: "clock", color: colors.primary,   label: "Всего",   value: totalValue, unit: totalUnit },
    { icon: "star",  color: accents.magenta,  label: "Очки XP", value: String((user as any)?.totalPoints ?? 0), unit: "очков" },
    { icon: "check", color: colors.success,   label: "Заданий", value: String((user as any)?.completedAssignments ?? 0), unit: "выполнено" },
    { icon: "flame", color: accents.amber,    label: "Серия",   value: String((user as any)?.loginStreak ?? 0), unit: "дней" },
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
        <Text style={{ fontSize: 28, fontWeight: "900", letterSpacing: -0.6, color: colors.foreground, marginBottom: 2 }}>
          Таймер
        </Text>
        <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 32 }}>
          Время, проведённое в приложении
        </Text>

        {/* Big clock visual */}
        <View style={{ alignItems: "center", marginBottom: 36 }}>
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <PulsingRing color={colors.primary} size={180} delay={0} />
            <PulsingRing color={colors.primary} size={180} delay={600} />
            <PulsingRing color={colors.primary} size={180} delay={1200} />
            {/* Циферблат залит градиентом бренда: главный объект экрана
                выглядит объектом, а не плоской заливкой. */}
            <LinearGradient
              colors={gradients.action as unknown as string[]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={{
                width: 160, height: 160, borderRadius: 80,
                justifyContent: "center", alignItems: "center", gap: 3,
                shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.38, shadowRadius: 22, elevation: 10,
              }}
            >
              <Glyph name="clock" size={32} color="#ffffff" />
              <Text style={{
                fontSize: 38, fontWeight: "900", color: "#fff", lineHeight: 44,
                letterSpacing: -1, fontVariant: ["tabular-nums"],
              }}>
                {totalValue}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: "800", color: "#ffffffcc" }}>
                {totalUnit}
              </Text>
            </LinearGradient>
          </View>

          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 20, textAlign: "center" }}>
            Всего времени в приложении
          </Text>
        </View>

        {/* Live session card */}
        <View style={{
          backgroundColor: colors.primary + "12",
          borderRadius: radii.md, padding: 20,
          borderWidth: 1.5, borderColor: colors.primary + "40",
          marginBottom: 16,
          flexDirection: "row", alignItems: "center", gap: 14,
          shadowColor: colors.primary, shadowOffset: { width: 0, height: 5 },
          shadowOpacity: 0.16, shadowRadius: 16, elevation: 4,
        }}>
          <View style={{
            width: 50, height: 50, borderRadius: 25,
            backgroundColor: colors.primary + "20",
            justifyContent: "center", alignItems: "center",
          }}>
            <Glyph name="chart" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary + "aa", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
              Текущая сессия
            </Text>
            {/* Табличные цифры: секунды тикают, а строка не прыгает по ширине. */}
            <Text style={{
              fontSize: 32, fontWeight: "900", color: colors.primary,
              letterSpacing: 0.5, fontVariant: ["tabular-nums"],
            }}>
              {formatSeconds(sessionSeconds)}
            </Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
              Время с момента входа в приложение
            </Text>
          </View>
        </View>

        {/* Stats grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {stats.map((stat) => (
            <View
              key={stat.label}
              style={{
                width: "47.5%",
                backgroundColor: colors.card,
                borderRadius: radii.md, padding: 16,
                borderWidth: 1, borderColor: colors.border,
                gap: 6,
                // Тень в цвете счётчика: карточки различаются периферийным зрением.
                shadowColor: stat.color, shadowOffset: { width: 0, height: 5 },
                shadowOpacity: 0.16, shadowRadius: 14, elevation: 3,
              }}
            >
              <View style={{
                width: 36, height: 36, borderRadius: radii.sm - 2,
                backgroundColor: stat.color + "1f",
                justifyContent: "center", alignItems: "center",
              }}>
                <Glyph name={stat.icon} size={18} color={stat.color} />
              </View>
              <Text style={{
                fontSize: 24, fontWeight: "900", letterSpacing: -0.7,
                color: colors.foreground, fontVariant: ["tabular-nums"],
              }}>
                {stat.value}
              </Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground, fontWeight: "600" }}>
                {stat.unit}
              </Text>
              <SectionLabel style={{ color: stat.color, marginBottom: 0 }}>{stat.label}</SectionLabel>
            </View>
          ))}
        </View>

        {/* Tip */}
        <View style={{
          marginTop: 20,
          backgroundColor: colors.card, borderRadius: radii.sm + 2, padding: 14,
          borderWidth: 1, borderColor: colors.border,
          flexDirection: "row", gap: 10, alignItems: "flex-start",
        }}>
          <View style={{ marginTop: 1 }}>
            <Glyph name="compass" size={16} color={colors.mutedForeground} />
          </View>
          <Text style={{ flex: 1, fontSize: 12, color: colors.mutedForeground, lineHeight: 18 }}>
            Время засчитывается, пока приложение открыто. При сворачивании таймер сессии ставится на паузу.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
