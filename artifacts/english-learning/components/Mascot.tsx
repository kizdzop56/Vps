// ─────────────────────────────────────────────────────────────────────────────
// Маскот: окно с сообщением, плавающая кнопка и выбор имени.
//
// ── Окно как гайд ───────────────────────────────────────────────────────────
// Раньше это была белая карточка посреди экрана: маскот в ней помещался ростом
// 210 пикселей, то есть меньше, чем кнопка «Понял!», и «привет от Снежи»
// выглядел системным диалогом, а не персонажем.
//
// Теперь окно устроено как подсказки по вкладкам (components/TabGuide.tsx):
// весь экран затемняется, карточки нет вовсе, а маскот занимает почти всю
// ширину. Персонаж должен быть главным на экране, ради него всё и затевалось.
// Ниже — имя градиентом, реплика в неоновом пузыре и одна большая кнопка.
//
// Затемнение ПЛОТНОЕ. Через полупрозрачное просвечивал экран под окном: реплика
// ложилась поверх карточек профиля, а белый зверь на пёстром фоне терял силуэт
// и выглядел как не прорисовавшаяся картинка.
//
// Размер маскота считается от окна: ширина почти во весь экран, но высота
// ограничена долей экрана, иначе на низких телефонах пузырь с текстом уезжает
// под кнопку. Пропорция берётся из WavingMascot (MASCOT_RATIO), чтобы
// картинка не растягивалась.
//
// Поза зависит от настроения: радость, грусть, раздумье — это разные картинки
// из AnimatedMascotImage, а не одна и та же с разным смайликом.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, Animated, StyleSheet, Modal, TextInput,
  useWindowDimensions,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { AnimatedMascotImage, type MascotPose } from "@/components/AnimatedMascotImage";
import { MASCOT_RATIO } from "@/components/WavingMascot";
import { ChunkyCta } from "@/components/ui/ChunkyCta";

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

/** Цвет свечения пузыря по настроению: праздник ярче, грусть теплее. */
const MOOD_GLOW: Record<MascotMood, string> = {
  happy:     "#a855f7",
  celebrate: "#c084fc",
  sad:       "#fb7185",
  thinking:  "#818cf8",
  wave:      "#a855f7",
  sleep:     "#7c8cf8",
};

/**
 * Цена дня серии и её потолок. ДОЛЖНЫ совпадать с сервером
 * (api-server/src/routes/gamification.ts): маскот называет завтрашнюю сумму, и
 * обещать больше, чем начислят, нельзя.
 */
const LOGIN_POINTS_STEP = 5;
const LOGIN_POINTS_CAP = 50;

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
  const { width: W, height: H } = useWindowDimensions();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const riseAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    if (!visible) return;
    fadeAnim.setValue(0);
    riseAnim.setValue(30);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.spring(riseAnim, { toValue: 0, tension: 90, friction: 10, useNativeDriver: true }),
    ]).start();
  }, [visible, mood, message]);

  if (!visible) return null;

  const pose = MOOD_TO_POSE[mood];
  const glow = MOOD_GLOW[mood];
  const cardW = Math.min(W - 40, 380);

  // Маскот почти во всю ширину, но по высоте не больше 44 % экрана: ниже
  // должны поместиться имя, реплика и кнопка.
  let mascotW = Math.min(W - 24, 420);
  let mascotH = pose === "lie"
    ? Math.round(mascotW * 0.56)
    : Math.round(mascotW / MASCOT_RATIO);
  const maxH = H * 0.44;
  if (mascotH > maxH) {
    mascotH = Math.round(maxH);
    mascotW = pose === "lie"
      ? Math.round(mascotH / 0.56)
      : Math.round(mascotH * MASCOT_RATIO);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Тап по затемнению закрывает окно — как и в подсказках по вкладкам. */}
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: riseAnim }] },
          ]}
        >
          {/* Сам маскот. Нажатие на него окно не закрывает: по нему хочется
              просто потыкать, и захлопывать за это несправедливо. */}
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ marginBottom: -6 }}>
            <AnimatedMascotImage pose={pose} width={mascotW} height={mascotH} />
          </TouchableOpacity>

          <Text
            style={[
              styles.nameLabel,
              {
                // @ts-ignore web gradient text
                backgroundImage: "linear-gradient(90deg, #a78bfa, #c084fc, #e879f9)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              },
            ]}
          >
            {MOOD_EMOJIS[mood]}{"  "}{mascotName}
          </Text>

          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={[
              styles.bubble,
              {
                width: cardW,
                borderColor: glow,
                // @ts-ignore web
                boxShadow: `0 0 16px ${glow}b3, 0 0 5px ${glow}66`,
              },
            ]}
          >
            <Text style={styles.messageText}>{message}</Text>
          </TouchableOpacity>

          {actionLabel && onAction && (
            <ChunkyCta
              label={actionLabel}
              tone="ghost"
              width={cardW}
              onPress={() => { onAction(); onClose(); }}
              style={{ marginBottom: 4 }}
            />
          )}

          {/* Кнопка объёмная: как всё нажимаемое в приложении. Эмодзи нет —
              палец вверх ничего не добавляет к слову «Понятно». */}
          <ChunkyCta label="Понятно" onPress={onClose} width={cardW} />
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
      <View style={styles.pickerOverlay}>
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

/** Русское склонение по числу. */
function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 14) return forms[2]!;
  const last = abs % 10;
  if (last === 1) return forms[0]!;
  if (last >= 2 && last <= 4) return forms[1]!;
  return forms[2]!;
}

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
    // Очки за вход маленькие и растут вместе с серией. Поэтому в реплике важна
    // не сегодняшняя сумма, а ЗАВТРАШНЯЯ: она и есть повод вернуться.
    case "daily_login": {
      const streak = Number(context?.streak ?? 1);
      const points = Number(context?.points ?? LOGIN_POINTS_STEP);
      // Сервер присылает точную сумму. Запасной расчёт повторяет его правило
      // вместе с потолком: обещать «завтра +55» и выдать 50 нельзя.
      const nextPoints = Number(
        context?.nextPoints ?? Math.min(points + LOGIN_POINTS_STEP, LOGIN_POINTS_CAP),
      );
      const days = plural(streak, ["день", "дня", "дней"]);

      if (context?.streakReset) {
        return {
          mood: "sad",
          message: `Ты пропустил день, и серия обнулилась. Начинаем заново: сегодня +${points} очков. Завтра будет +${nextPoints} — только не пропускай!`,
        };
      }
      if (streak > 1) {
        const tail = nextPoints > points
          ? ` Придёшь завтра — получишь +${nextPoints}.`
          : " Пропустишь день — серия начнётся заново.";
        return {
          mood: "celebrate",
          message: `С возвращением! 🔥 Серия уже ${streak} ${days} подряд, +${points} очков за вход.${tail}`,
        };
      }
      return {
        mood: "wave",
        message: `Привет! Первый день серии: +${points} очков за вход. Каждый следующий день дороже — завтра будет +${nextPoints}.`,
      };
    }
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
  // Затемнение во весь экран, без карточки: как в подсказках по вкладкам.
  // Плотное намеренно — через полупрозрачное просвечивал профиль, и белый зверь
  // на пёстрых карточках терял силуэт.
  overlay: {
    flex: 1,
    backgroundColor: "#000000e6",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  content: { alignItems: "center" },
  nameLabel: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    color: "#c084fc",
    marginTop: 12,
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  bubble: {
    borderRadius: 18,
    borderWidth: 2,
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: "500",
    textAlign: "center",
    color: "#ede9ff",
  },

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

  // ── Выбор имени: обычное окно, персонаж здесь не главный ──
  pickerOverlay: {
    flex: 1,
    backgroundColor: "#00000066",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
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
  actionBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  closeBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: { fontWeight: "600", fontSize: 15 },
});
