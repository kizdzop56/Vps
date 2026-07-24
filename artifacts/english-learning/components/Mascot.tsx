import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, Animated, StyleSheet, Modal, TextInput, Image,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { AnimatedMascotImage, type MascotPose } from "@/components/AnimatedMascotImage";

export type MascotMood = "happy" | "celebrate" | "sad" | "thinking" | "wave" | "sleep";

const MOOD_EMOJIS: Record<MascotMood, string> = {
  happy:     "😊",
  celebrate: "🎉",
  sad:       "😢",
  thinking:  "🤔",
  wave:      "👋",
  sleep:     "😴",
};

// Map legacy moods to AnimatedMascotImage poses
const MOOD_TO_POSE: Record<MascotMood, MascotPose> = {
  happy:     "happy",
  celebrate: "celebrate",
  sad:       "sit",       // sitting quietly
  thinking:  "think",
  wave:      "wave",
  sleep:     "lie",       // lying down = sleep/rest
};

// Keep the static image for the name-picker mini preview
const MASCOT_IMAGE = require("../assets/images/mascot_full.png");

interface MascotProps {
  visible: boolean;
  mood?: MascotMood;
  message: string;
  onClose: () => void;
  mascotName?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function MascotModal({
  visible,
  mood = "happy",
  message,
  onClose,
  mascotName = "Снежа",
  actionLabel,
  onAction,
}: MascotProps) {
  const colors   = useColors();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const glowAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scaleAnim.setValue(0);
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }).start();

      if (mood === "celebrate") {
        Animated.loop(
          Animated.sequence([
            Animated.timing(glowAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
            Animated.timing(glowAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
          ])
        ).start();
      }
    } else {
      glowAnim.stopAnimation();
    }
  }, [visible, mood]);

  if (!visible) return null;

  const bgColor     = mood === "celebrate" ? "#f3e8ff" : mood === "sad" ? "#ffe4e6" : "#ede9fe";
  const borderColor = mood === "celebrate" ? "#a855f7" : mood === "sad" ? "#e11d48" : "#8b5cf6";
  const pose        = MOOD_TO_POSE[mood];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <Animated.View
          style={[
            styles.container,
            { backgroundColor: colors.card, transform: [{ scale: scaleAnim }] },
          ]}
        >
          <TouchableOpacity activeOpacity={1}>
            {/* ── Mascot — static, parts animate on their own ── */}
            <View style={styles.mascotArea}>
              <AnimatedMascotImage
                pose={pose}
                width={pose === "lie" ? 240 : 150}
                height={pose === "lie" ? 135 : 210}
              />
              <View style={[styles.moodBadge, { backgroundColor: bgColor, borderColor }]}>
                <Text style={styles.moodEmoji}>{MOOD_EMOJIS[mood]}</Text>
                <Text
                  style={[
                    styles.mascotName,
                    {
                      color: "#8b5cf6",
                      // @ts-ignore web gradient text
                      backgroundImage: "linear-gradient(90deg, #7c3aed, #a78bfa, #c084fc)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    },
                  ]}
                >
                  {mascotName}
                </Text>
              </View>
            </View>

            <View style={[styles.bubble, { backgroundColor: bgColor, borderColor }]}>
              <Text style={[styles.messageText, { color: "#1e293b" }]}>{message}</Text>
            </View>

            <View style={styles.actions}>
              {actionLabel && onAction && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: borderColor }]}
                  onPress={() => { onAction(); onClose(); }}
                >
                  <Text style={styles.actionBtnText}>{actionLabel}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.closeBtn,
                  { borderColor: colors.border, backgroundColor: colors.muted },
                ]}
                onPress={onClose}
              >
                <Text style={[styles.closeBtnText, { color: colors.mutedForeground }]}>Понял!</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Floating mascot button ────────────────────────────────────────────────
interface FloatingMascotProps {
  mascotName?: string;
  message?: string;
  mood?: MascotMood;
  onPress?: () => void;
}

export function FloatingMascot({
  mascotName = "Снежа",
  message,
  mood = "wave",
  onPress,
}: FloatingMascotProps) {
  const [showModal, setShowModal] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.15, duration: 90, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1,    duration: 90, useNativeDriver: true }),
    ]).start();
    if (message) setShowModal(true);
    onPress?.();
  };

  const pose = MOOD_TO_POSE[mood];

  return (
    <>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.9}
        style={styles.floatingBtn}
      >
        {/* Static mascot — only internal part-animations (blink/tail/ear) */}
        <Animated.View style={{ transform: [{ scale: scaleAnim }], alignItems: "center" }}>
          <AnimatedMascotImage pose={pose} width={72} height={100} />
          <View style={styles.floatingMood}>
            <Text style={{ fontSize: 11 }}>{MOOD_EMOJIS[mood]}</Text>
          </View>
        </Animated.View>
      </TouchableOpacity>

      <MascotModal
        visible={showModal}
        mood={mood}
        message={message ?? "Привет!"}
        mascotName={mascotName}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}

// ── Name picker modal ─────────────────────────────────────────────────────
interface MascotNamePickerProps {
  visible: boolean;
  currentName: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

export function MascotNamePicker({
  visible,
  currentName,
  onSave,
  onClose,
}: MascotNamePickerProps) {
  const colors    = useColors();
  const [name, setName] = useState(currentName);
  useEffect(() => { if (visible) setName(currentName); }, [visible, currentName]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.namePickerContainer, { backgroundColor: colors.card }]}>
          <Text style={[styles.namePickerTitle, { color: colors.foreground }]}>
            Имя маскота
          </Text>
          <View style={{ alignItems: "center", marginVertical: 8 }}>
            <AnimatedMascotImage pose="wave" width={120} height={168} />
          </View>
          <TextInput
            style={[
              styles.nameInput,
              {
                borderColor: colors.border,
                color: colors.foreground,
                backgroundColor: colors.muted,
              },
            ]}
            value={name}
            onChangeText={setName}
            placeholder="Имя маскота"
            placeholderTextColor={colors.mutedForeground}
            maxLength={20}
            autoFocus
          />
          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            <TouchableOpacity
              style={[
                styles.closeBtn,
                { flex: 1, borderColor: colors.border, backgroundColor: colors.muted },
              ]}
              onPress={onClose}
            >
              <Text style={[styles.closeBtnText, { color: colors.mutedForeground }]}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { flex: 1, backgroundColor: "#6366f1" }]}
              onPress={() => {
                if (name.trim()) { onSave(name.trim()); onClose(); }
              }}
            >
              <Text style={styles.actionBtnText}>Сохранить</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Mascot messages library ───────────────────────────────────────────────
export function getMascotMessage(
  event:
    | "daily_login"
    | "level_up"
    | "achievement"
    | "perfect_score"
    | "error"
    | "idle"
    | "streak",
  context?: Record<string, any>
): { message: string; mood: MascotMood } {
  switch (event) {
    case "daily_login":
      return {
        mood: "wave",
        message:
          context?.streak && context.streak > 1
            ? `С возвращением! 🔥 Твой стрик уже ${context.streak} дней! Так держать! +${context.points ?? 30} очков за вход.`
            : `Привет! Рад тебя видеть! Ты получаешь +${context?.points ?? 30} очков за ежедневный вход. Начнём учиться?`,
      };
    case "level_up":
      return {
        mood: "celebrate",
        message: `Поздравляю! 🎉 Ты достиг уровня ${context?.level ?? ""}! Ты получил новый значок: ${context?.reward ?? ""}. Продолжай в том же духе!`,
      };
    case "achievement":
      return {
        mood: "celebrate",
        message: `Новое достижение разблокировано! 🏅 «${context?.title ?? ""}» — ${context?.description ?? ""}. Ты молодец!`,
      };
    case "perfect_score":
      return {
        mood: "celebrate",
        message: `Невероятно! 💯 Ты получил идеальный результат! 100% правильных ответов. Ты настоящий гений!`,
      };
    case "error":
      return {
        mood: "sad",
        message:
          context?.message ??
          "Не грусти! Ошибки — это часть обучения. Попробуй ещё раз, у тебя получится! 💪",
      };
    case "streak":
      return {
        mood: "celebrate",
        message: `🔥 ${context?.streak ?? ""} дней подряд! Невероятная серия! Продолжай заниматься каждый день и получи бонусные очки!`,
      };
    case "idle":
    default: {
      const messages = [
        "Не забывай про ежедневные занятия! Даже 10 минут в день делают чудеса 🌟",
        "Хочешь поговорить с AI-тьютором? Это отличный способ улучшить разговорный английский! 🎤",
        "Каждое выполненное задание приближает тебя к следующему уровню! 🚀",
        "Помни: постоянство — ключ к успеху! Занимайся каждый день ⚡",
      ];
      return {
        mood: "thinking",
        message: messages[Math.floor(Math.random() * messages.length)]!,
      };
    }
  }
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "#00000066",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  container: {
    width: "100%",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  mascotArea: { alignItems: "center", marginBottom: 4 },
  moodBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 6,
    marginBottom: 4,
  },
  moodEmoji:   { fontSize: 16 },
  mascotName:  { fontSize: 13, fontWeight: "700" },
  bubble: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    marginTop: 8,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
    textAlign: "center",
  },
  actions: { flexDirection: "row", gap: 12, marginTop: 20 },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  closeBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: { fontWeight: "600", fontSize: 15 },
  floatingBtn: {
    position: "absolute",
    bottom: 90,
    right: 12,
    zIndex: 100,
  },
  floatingMood: {
    marginTop: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ede9fe",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#8b5cf6",
    shadowColor: "#8b5cf6",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  namePickerContainer: { width: "100%", borderRadius: 24, padding: 24 },
  namePickerTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  nameInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    fontWeight: "600",
  },
});
