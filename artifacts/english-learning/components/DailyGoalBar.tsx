import React, { useRef, useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, Animated, StyleSheet, Modal, Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import authStorage from "@/utils/authStorage";

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

interface GoalType {
  id: string;
  emoji: string;
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
    emoji: "⏱",
    label: "Время в приложении",
    subLabel: "Занимайся сегодня",
    color: "#6366f1",
    bgColor: "#ede9fe",
    reward: "+20 XP",
    getTarget: (goalMinutes) => goalMinutes,
    getProgress: ({ todayMinutes }) => todayMinutes,
    formatRemaining: (rem, target) => `Осталось ${rem} мин из ${target}`,
    formatDone: (progress, target) => `${progress} из ${target} мин выполнено`,
    isTimeType: true,
  },
  {
    id: "tasks",
    emoji: "📝",
    label: "Выполни задания",
    subLabel: "Выполни 2 задания сегодня",
    color: "#6366f1",
    bgColor: "#e0e7ff",
    reward: "+30 XP",
    getTarget: () => 2,
    getProgress: ({ todayCompletions }) => todayCompletions,
    formatRemaining: (rem, target) => `Осталось ${rem} из ${target} заданий`,
    formatDone: (_, target) => `${target} из ${target} заданий выполнено! 🎉`,
    isTimeType: false,
  },
  {
    id: "voice",
    emoji: "🎤",
    label: "AI-разговор",
    subLabel: "Поговори с AI-учителем",
    color: "#8b5cf6",
    bgColor: "#f3e8ff",
    reward: "+25 XP",
    getTarget: () => 1,
    getProgress: ({ todayVoiceSessions }) => todayVoiceSessions,
    formatRemaining: (rem, target) => `Осталось ${rem} сессия из ${target}`,
    formatDone: (_, target) => `${target} из ${target} AI-сессий! 🎤`,
    isTimeType: false,
  },
  {
    id: "time2",
    emoji: "🔥",
    label: "Активное обучение",
    subLabel: "Занимайся усиленно",
    color: "#ec4899",
    bgColor: "#fce7f3",
    reward: "+20 XP",
    getTarget: (goalMinutes) => goalMinutes,
    getProgress: ({ todayMinutes }) => todayMinutes,
    formatRemaining: (rem, target) => `Осталось ${rem} мин из ${target}`,
    formatDone: (progress, target) => `${progress} из ${target} мин выполнено`,
    isTimeType: true,
  },
  {
    id: "tasks2",
    emoji: "🏆",
    label: "Марафон заданий",
    subLabel: "Выполни 3 задания сегодня",
    color: "#e11d48",
    bgColor: "#ffe4e6",
    reward: "+40 XP",
    getTarget: () => 3,
    getProgress: ({ todayCompletions }) => todayCompletions,
    formatRemaining: (rem, target) => `Осталось ${rem} из ${target} заданий`,
    formatDone: (_, target) => `${target} из ${target} заданий! Отлично 🏆`,
    isTimeType: false,
  },
  {
    id: "time3",
    emoji: "⚡",
    label: "Спринт знаний",
    subLabel: "Интенсивная сессия",
    color: "#6366f1",
    bgColor: "#e0e7ff",
    reward: "+20 XP",
    getTarget: (goalMinutes) => goalMinutes,
    getProgress: ({ todayMinutes }) => todayMinutes,
    formatRemaining: (rem, target) => `Осталось ${rem} мин из ${target}`,
    formatDone: (progress, target) => `${progress} из ${target} мин выполнено`,
    isTimeType: true,
  },
  {
    id: "voice2",
    emoji: "🗣️",
    label: "Разговорная практика",
    subLabel: "Проведи 2 AI-разговора",
    color: "#ec4899",
    bgColor: "#fce7f3",
    reward: "+35 XP",
    getTarget: () => 2,
    getProgress: ({ todayVoiceSessions }) => todayVoiceSessions,
    formatRemaining: (rem, target) => `Осталось ${rem} из ${target} сессий`,
    formatDone: (_, target) => `${target} из ${target} разговоров! 🗣️`,
    isTimeType: false,
  },
];

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
  const progressAnim = useRef(new Animated.Value(0)).current;
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
    Animated.timing(progressAnim, {
      toValue: pct,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [pct, progressAnim]);

  useEffect(() => {
    if (done) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, { toValue: 1, duration: 1500, useNativeDriver: false }),
          Animated.timing(shimmerAnim, { toValue: 0, duration: 1500, useNativeDriver: false }),
        ])
      ).start();
    } else {
      shimmerAnim.setValue(0);
    }
  }, [done, shimmerAnim]);

  const barColor = done ? "#6366f1" : goalType.color;
  const bgColor = done ? "#e0e7ff" : goalType.bgColor;
  const iconName = done ? "check-circle" : goalType.emoji === "⏱" ? "clock" : goalType.emoji === "📝" ? "book-open" : goalType.emoji === "🎤" ? "mic" : goalType.emoji === "🔥" ? "zap" : goalType.emoji === "🏆" ? "award" : goalType.emoji === "⚡" ? "zap" : "message-circle";

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
        <View style={[styles.doneContainer, { backgroundColor: "#6366f1" }]}>
          <Animated.View
            style={[
              styles.doneShimmer,
              {
                opacity: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] }),
              },
            ]}
          />
          <Text style={styles.doneEmoji}>🎉</Text>
          <Text style={styles.doneTitle}>Цель на сегодня выполнена!</Text>
          <Text style={styles.doneSub}>{goalType.formatDone(progress, target)}</Text>
          <View style={styles.doneRewardBadge}>
            <Text style={styles.doneRewardText}>{goalType.reward} получено</Text>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          onPress={goalType.isTimeType ? () => setShowPicker(true) : undefined}
          activeOpacity={goalType.isTimeType ? 0.85 : 1}
          style={[styles.container, { backgroundColor: colors.card, borderColor: goalType.color + "30" }]}
        >
          {/* Day badge */}
          <View style={[styles.dayBadge, { backgroundColor: bgColor }]}>
            <Text style={[styles.dayBadgeText, { color: goalType.color }]}>
              Цель дня
            </Text>
          </View>

          <View style={styles.header}>
            <View style={[styles.iconBox, { backgroundColor: bgColor }]}>
              <Text style={{ fontSize: 18 }}>{goalType.emoji}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>{goalType.label}</Text>
              <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                {goalType.formatRemaining(remaining, target)}
              </Text>
            </View>
            <View style={[styles.rewardBadge, { backgroundColor: bgColor }]}>
              <Text style={[styles.rewardText, { color: goalType.color }]}>
                {goalType.reward}
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={[styles.trackBg, { backgroundColor: colors.muted }]}>
            <Animated.View
              style={[
                styles.trackFill,
                {
                  backgroundColor: barColor,
                  width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                },
              ]}
            />
          </View>

          {/* Sub row */}
          {goalType.isTimeType && (
            <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 8 }]}>
              💡 Нажми, чтобы изменить цель
            </Text>
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
              <TouchableOpacity
                key={mins}
                onPress={() => handleGoalChange(mins)}
                style={[
                  styles.goalOption,
                  {
                    backgroundColor: mins === goalMinutes ? "#ede9fe" : colors.muted,
                    borderColor: mins === goalMinutes ? "#6366f1" : colors.border,
                  },
                ]}
              >
                <Text style={styles.goalEmoji}>
                  {mins <= 10 ? "🌱" : mins <= 15 ? "⭐" : mins <= 20 ? "🔥" : "🚀"}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.goalMin, { color: mins === goalMinutes ? "#6366f1" : colors.foreground }]}>
                    {mins} минут
                  </Text>
                  <Text style={[styles.goalDesc, { color: colors.mutedForeground }]}>
                    {mins <= 10 ? "Лёгкий старт" : mins <= 15 ? "Хорошая привычка" : mins <= 20 ? "Активное обучение" : "Максимальный результат"}
                  </Text>
                </View>
                {mins === goalMinutes && <Feather name="check" size={18} color="#6366f1" />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.closeGoalBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
              onPress={() => setShowPicker(false)}
            >
              <Text style={[styles.closeGoalText, { color: colors.mutedForeground }]}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16, borderWidth: 1.5, padding: 14, marginBottom: 12,
  },
  dayBadge: {
    alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, marginBottom: 10,
  },
  dayBadgeText: { fontSize: 11, fontWeight: "700" },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: "center", alignItems: "center",
  },
  title: { fontSize: 14, fontWeight: "700" },
  sub: { fontSize: 12, marginTop: 2 },
  rewardBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  rewardText: { fontSize: 11, fontWeight: "700" },
  trackBg: { height: 10, borderRadius: 5, overflow: "hidden", position: "relative" },
  trackFill: { height: "100%", borderRadius: 5 },
  hint: { fontSize: 11 },
  doneContainer: {
    borderRadius: 16, padding: 22, marginBottom: 12,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
    minHeight: 150,
  },
  doneShimmer: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "#fff",
  },
  doneEmoji: { fontSize: 34, marginBottom: 6 },
  doneTitle: { fontSize: 17, fontWeight: "800", color: "#fff", textAlign: "center" },
  doneSub: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.85)", marginTop: 4, textAlign: "center" },
  doneRewardBadge: {
    marginTop: 12, paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)",
  },
  doneRewardText: { fontSize: 12, fontWeight: "800", color: "#fff" },
  overlay: { flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" },
  pickerSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 32 },
  pickerTitle: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
  pickerSub: { fontSize: 13, marginBottom: 20 },
  goalOption: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 12, borderWidth: 1.5, marginBottom: 10,
  },
  goalEmoji: { fontSize: 22 },
  goalMin: { fontSize: 15, fontWeight: "700" },
  goalDesc: { fontSize: 12, marginTop: 2 },
  closeGoalBtn: {
    borderRadius: 12, padding: 14, borderWidth: 1, alignItems: "center", marginTop: 4,
  },
  closeGoalText: { fontWeight: "600", fontSize: 15 },
});
