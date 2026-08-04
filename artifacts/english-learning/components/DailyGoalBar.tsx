// Цель дня: каждый день показывается своя цель (см. getDayGoalIndex), прогресс
// по ней и награда за выполнение. Цели по времени можно перенастроить тапом.
//
// Эмодзи не используются: у каждой цели свой глиф из собственного набора
// (components/ui/Glyph.tsx). Раньше здесь жили ⏱ 📝 🎤 🔥 🏆 ⚡ 🗣️ и
// эмодзи в текстах вроде «выполнено! 🎉» — на разных платформах они выглядели
// по-разному и не красились темой.
import React, { useRef, useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, Pressable, Animated, Easing, StyleSheet, Modal, Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import authStorage from "@/utils/authStorage";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { XpBar, GoalPips } from "@/components/ui/GameKit";
import { accents, gradients, radii, chunky } from "@/constants/theme";

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string, options?: RequestInit) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE_URL}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Ошибка сервера");
  return data;
}

interface DailyGoalBarProps {
  todayMinutes: number;
  goalMinutes: number;
  todayCompletions?: number;
  todayVoiceSessions?: number;
  onGoalChange?: (minutes: number) => void;
}

const TIME_GOAL_OPTIONS = [10, 15, 20, 30];

function formatDurationMinutes(value: number): string {
  const totalSeconds = Math.max(0, Math.round(value * 60));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) return `${minutes} мин`;
  return `${minutes} мин ${seconds} с`;
}

interface GoalType {
  id: string;
  /** Глиф из своего набора вместо эмодзи: красится темой, одинаков везде. */
  glyph: GlyphName;
  label: string;
  subLabel: string;
  color: string;
  bgColor: string;
  reward: string;
  getTarget: (goalMinutes: number) => number;
  getProgress: (stats: { todayMinutes: number; todayCompletions: number; todayVoiceSessions: number }) => number;
  formatRemaining: (remaining: number, target: number) => string;
  formatDone: (progress: number, target: number) => string;
  isTimeType: boolean;
}

const GOAL_TYPES: GoalType[] = [
  {
    id: "time",
    glyph: "clock",
    label: "Время в приложении",
    subLabel: "Занимайся сегодня",
    color: "#6366f1",
    bgColor: "#e0e7ff",
    reward: "+20 очков",
    getTarget: (goalMinutes) => goalMinutes,
    getProgress: ({ todayMinutes }) => todayMinutes,
    formatRemaining: (rem, target) => `Осталось ${formatDurationMinutes(rem)} из ${target} мин`,
    formatDone: (progress, target) => `${formatDurationMinutes(progress)} из ${target} мин выполнено`,
    isTimeType: true,
  },
  {
    id: "tasks",
    glyph: "pen",
    label: "Выполни задания",
    subLabel: "Выполни 2 задания сегодня",
    color: "#8b5cf6",
    bgColor: "#ede9fe",
    reward: "+30 очков",
    getTarget: () => 2,
    getProgress: ({ todayCompletions }) => todayCompletions,
    formatRemaining: (rem, target) => `Осталось ${rem} из ${target} заданий`,
    formatDone: (_, target) => `${target} из ${target} заданий выполнено`,
    isTimeType: false,
  },
  {
    id: "voice",
    glyph: "mic",
    label: "AI-разговор",
    subLabel: "Поговори с AI-учителем",
    color: "#a855f7",
    bgColor: "#f3e8ff",
    reward: "+25 очков",
    getTarget: () => 1,
    getProgress: ({ todayVoiceSessions }) => todayVoiceSessions,
    formatRemaining: (rem, target) => `Осталось ${rem} сессия из ${target}`,
    formatDone: (_, target) => `${target} из ${target} AI-сессий`,
    isTimeType: false,
  },
  {
    id: "time2",
    glyph: "flame",
    label: "Активное обучение",
    subLabel: "Занимайся усиленно",
    color: "#ec4899",
    bgColor: "#fce7f3",
    reward: "+20 очков",
    getTarget: (goalMinutes) => goalMinutes,
    getProgress: ({ todayMinutes }) => todayMinutes,
    formatRemaining: (rem, target) => `Осталось ${formatDurationMinutes(rem)} из ${target} мин`,
    formatDone: (progress, target) => `${formatDurationMinutes(progress)} из ${target} мин выполнено`,
    isTimeType: true,
  },
  {
    id: "tasks2",
    glyph: "trophy",
    label: "Марафон заданий",
    subLabel: "Выполни 3 задания сегодня",
    color: "#f59e0b",
    bgColor: "#fef3c7",
    reward: "+40 очков",
    getTarget: () => 3,
    getProgress: ({ todayCompletions }) => todayCompletions,
    formatRemaining: (rem, target) => `Осталось ${rem} из ${target} заданий`,
    formatDone: (_, target) => `${target} из ${target} заданий. Отлично!`,
    isTimeType: false,
  },
  {
    id: "time3",
    glyph: "spark",
    label: "Спринт знаний",
    subLabel: "Интенсивная сессия",
    color: "#d946ef",
    bgColor: "#fae8ff",
    reward: "+20 очков",
    getTarget: (goalMinutes) => goalMinutes,
    getProgress: ({ todayMinutes }) => todayMinutes,
    formatRemaining: (rem, target) => `Осталось ${formatDurationMinutes(rem)} из ${target} мин`,
    formatDone: (progress, target) => `${formatDurationMinutes(progress)} из ${target} мин выполнено`,
    isTimeType: true,
  },
  {
    id: "voice2",
    glyph: "chat",
    label: "Разговорная практика",
    subLabel: "Проведи 2 AI-разговора",
    color: "#6366f1",
    bgColor: "#e0e7ff",
    reward: "+35 очков",
    getTarget: () => 2,
    getProgress: ({ todayVoiceSessions }) => todayVoiceSessions,
    formatRemaining: (rem, target) => `Осталось ${rem} из ${target} сессий`,
    formatDone: (_, target) => `${target} из ${target} разговоров`,
    isTimeType: false,
  },
];

/** Варианты дневной цели по времени: от лёгкого старта к максимуму. */
const GOAL_PRESETS: { glyph: GlyphName; desc: string }[] = [
  { glyph: "leaf",   desc: "Лёгкий старт" },
  { glyph: "star",   desc: "Хорошая привычка" },
  { glyph: "flame",  desc: "Активное обучение" },
  { glyph: "route",  desc: "Максимальный результат" },
];

function presetFor(mins: number) {
  if (mins <= 10) return GOAL_PRESETS[0]!;
  if (mins <= 15) return GOAL_PRESETS[1]!;
  if (mins <= 20) return GOAL_PRESETS[2]!;
  return GOAL_PRESETS[3]!;
}

function getDayGoalIndex(): number {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  return dayOfYear % GOAL_TYPES.length;
}

export function DailyGoalBar({
  todayMinutes,
  goalMinutes,
  todayCompletions = 0,
  todayVoiceSessions = 0,
  onGoalChange,
}: DailyGoalBarProps) {
  const colors = useColors();
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const [showPicker, setShowPicker] = useState(false);

  const goalType = GOAL_TYPES[getDayGoalIndex()]!;
  const stats = { todayMinutes, todayCompletions, todayVoiceSessions };
  const target = goalType.getTarget(goalMinutes);
  const progress = goalType.getProgress(stats);
  const pct = Math.min(1, progress / Math.max(target, 1));
  const done = pct >= 1;
  const remaining = Math.max(0, target - progress);

  useEffect(() => {
    if (done) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
          Animated.timing(shimmerAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    shimmerAnim.setValue(0);
  }, [done, shimmerAnim]);

  const handleGoalChange = async (minutes: number) => {
    setShowPicker(false);
    try {
      await apiFetch("/api/gamification/daily-goal", {
        method: "PATCH",
        body: JSON.stringify({ minutes }),
      });
      onGoalChange?.(minutes);
    } catch {
      Alert.alert("Ошибка", "Не удалось сохранить цель");
    }
  };

  return (
    <>
      {done ? (
        // Выполненная цель — наградный момент: градиент, трофей и подпись
        // о полученных очках. Раньше здесь стоял эмодзи 🎉.
        <View style={styles.doneWrap}>
          <LinearGradient
            colors={gradients.reward as unknown as string[]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.doneContainer}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.doneShimmer,
                { opacity: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] }) },
              ]}
            />
            <View style={styles.doneTrophy}>
              <Glyph name="trophy" size={30} color="#ffffff" />
            </View>
            <Text style={styles.doneTitle}>Цель на сегодня выполнена!</Text>
            <Text style={styles.doneSub}>{goalType.formatDone(progress, target)}</Text>
            <View style={styles.doneRewardBadge}>
              <Glyph name="star" size={12} color="#ffffff" />
              <Text style={styles.doneRewardText}>{goalType.reward} получено</Text>
            </View>
          </LinearGradient>
        </View>
      ) : (
        <TouchableOpacity
          onPress={goalType.isTimeType ? () => setShowPicker(true) : undefined}
          activeOpacity={goalType.isTimeType ? 0.85 : 1}
          style={[
            styles.container,
            {
              backgroundColor: colors.card,
              borderColor: goalType.color + "33",
              // Тень в цвете сегодняшней цели: карточка живёт в своём цвете.
              shadowColor: goalType.color,
            },
          ]}
        >
          {/* Day badge */}
          <View style={[styles.dayBadge, { backgroundColor: goalType.bgColor }]}>
            <Text style={[styles.dayBadgeText, { color: goalType.color }]}>Цель дня</Text>
          </View>

          <View style={styles.header}>
            <View style={[styles.iconBox, { backgroundColor: goalType.bgColor }]}>
              <Glyph name={goalType.glyph} size={20} color={goalType.color} />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>{goalType.label}</Text>
              <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                {goalType.formatRemaining(remaining, target)}
              </Text>
            </View>
            <View style={[styles.rewardBadge, { backgroundColor: goalType.bgColor }]}>
              <Text style={[styles.rewardText, { color: goalType.color }]}>{goalType.reward}</Text>
            </View>
          </View>

          {/* Прогресс. Счётные цели (задания, разговоры) показываем сегментами:
              «1 из 2» видно сразу, а процент на таких числах бесполезен.
              Для минут остаётся полоса — там шкала непрерывная. */}
          {goalType.isTimeType ? (
            <XpBar
              progress={pct}
              height={10}
              shine={false}
              colors={[goalType.color, goalType.color] as const}
            />
          ) : (
            <GoalPips value={progress} target={target} segments={Math.max(2, Math.min(target, 10))} />
          )}

          {/* Sub row */}
          {goalType.isTimeType && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 9 }}>
              <Glyph name="pen" size={12} color={colors.mutedForeground} />
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                Нажми, чтобы изменить цель
              </Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* Goal Picker Modal — only for time goals */}
      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <View style={styles.overlay}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Ежедневная цель</Text>
            <Text style={[styles.pickerSub, { color: colors.mutedForeground }]}>
              Сколько минут в день ты хочешь заниматься?
            </Text>
            {TIME_GOAL_OPTIONS.map((mins) => (
              <GoalOption
                key={mins}
                minutes={mins}
                selected={mins === goalMinutes}
                colors={colors}
                onPress={() => handleGoalChange(mins)}
              />
            ))}
            <TouchableOpacity
              style={[styles.closeGoalBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
              onPress={() => setShowPicker(false)}
              activeOpacity={0.85}
            >
              <Text style={[styles.closeGoalText, { color: colors.mutedForeground }]}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

/**
 * Вариант цели как физическая клавиша: у неё есть нижняя грань, при нажатии
 * корпус проседает. Тот же приём, что у кнопок и вариантов ответа в тренажёре.
 */
function GoalOption({
  minutes, selected, colors, onPress,
}: {
  minutes: number;
  selected: boolean;
  colors: any;
  onPress: () => void;
}) {
  const preset = presetFor(minutes);
  const press = useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: chunky.duration, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();

  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{
        position: "absolute", left: 0, right: 0, top: 4, bottom: 0,
        borderRadius: radii.sm, backgroundColor: selected ? colors.primary : "rgba(160,140,220,0.3)",
      }} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={onPress}
          onPressIn={() => set(4)}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={`${minutes} минут — ${preset.desc}`}
          style={{
            flexDirection: "row", alignItems: "center", gap: 12,
            padding: 14, borderRadius: radii.sm, borderWidth: 1.5,
            backgroundColor: selected ? colors.primary + "18" : colors.card,
            borderColor: selected ? colors.primary : colors.border,
          }}
        >
          <View style={{
            width: 34, height: 34, borderRadius: 11,
            backgroundColor: (selected ? colors.primary : accents.violetDeep) + "1f",
            alignItems: "center", justifyContent: "center",
          }}>
            <Glyph name={preset.glyph} size={18} color={selected ? colors.primary : accents.violetDeep} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{
              fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"],
              color: selected ? colors.primary : colors.foreground,
            }}>
              {minutes} минут
            </Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>{preset.desc}</Text>
          </View>
          {selected && <Glyph name="check" size={18} color={colors.primary} />}
        </Pressable>
      </Animated.View>
      <View style={{ height: 4 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.md, borderWidth: 1.5, padding: 14, marginBottom: 12,
    shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.16, shadowRadius: 15, elevation: 4,
  },
  dayBadge: {
    alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: radii.pill, marginBottom: 10,
  },
  dayBadgeText: { fontSize: 10.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.8 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  iconBox: {
    width: 40, height: 40, borderRadius: radii.sm,
    justifyContent: "center", alignItems: "center",
  },
  title: { fontSize: 14, fontWeight: "800" },
  sub: { fontSize: 12, marginTop: 2, fontVariant: ["tabular-nums"] },
  rewardBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radii.sm - 4 },
  rewardText: { fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
  hint: { fontSize: 11, fontWeight: "600" },

  doneWrap: { marginBottom: 12, borderRadius: radii.md, overflow: "hidden" },
  doneContainer: {
    borderRadius: radii.md, padding: 22,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
    minHeight: 150,
  },
  doneShimmer: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "#fff",
  },
  doneTrophy: {
    width: 56, height: 56, borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
    marginBottom: 10, transform: [{ rotate: "-4deg" }],
  },
  doneTitle: { fontSize: 17, fontWeight: "900", color: "#fff", textAlign: "center" },
  doneSub: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.85)", marginTop: 4, textAlign: "center" },
  doneRewardBadge: {
    marginTop: 12, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radii.pill, backgroundColor: "rgba(255,255,255,0.22)",
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  doneRewardText: { fontSize: 12, fontWeight: "800", color: "#fff" },

  overlay: { flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" },
  pickerSheet: { borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: 24, paddingBottom: 32 },
  pickerTitle: { fontSize: 19, fontWeight: "900", letterSpacing: -0.3, marginBottom: 4 },
  pickerSub: { fontSize: 13, marginBottom: 20 },
  closeGoalBtn: {
    borderRadius: radii.sm, padding: 14, borderWidth: 1, alignItems: "center", marginTop: 4,
  },
  closeGoalText: { fontWeight: "700", fontSize: 15 },
});
