// ─────────────────────────────────────────────────────────────────────────────
// Подсказка по вкладке: затемнённый экран, крупный маскот, реплика и кнопка.
//
// Окно устроено так, чтобы главным на экране был ПЕРСОНАЖ: карточки нет вовсе,
// маскот занимает почти всю ширину, ниже — имя градиентом, заголовок, реплика
// в неоновом пузыре и одна кнопка.
//
// Размеры считаются от ТЕКУЩЕГО окна (useWindowDimensions), а не через
// Dimensions.get на момент импорта: со вторым при повороте телефона числа
// оставались от прежней ориентации, и маскот уезжал за край.
//
// Высота маскота — не доля экрана, а остаток: сколько нужно тексту и кнопке,
// столько и резервируется (mascotBox в WavingMascot.tsx). Прежняя половина
// экрана не учитывала длину подсказки, и самая длинная из них («Успеваемость»,
// восемь строк) на низком телефоне упиралась в кнопку.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef } from "react";
import {
  View, Text, Animated, StyleSheet, Modal, useWindowDimensions,
} from "react-native";
import { WavingMascot, mascotBox } from "@/components/WavingMascot";
import { ChunkyCta } from "@/components/ui/ChunkyCta";

export type TabGuideTab =
  | "assignments"
  | "leaderboard"
  | "calendar"
  | "profile"
  | "students"
  | "analysis"
  | "progress";

interface TabGuideInfo {
  tab: TabGuideTab;
  emoji: string;
  title: string;
  description: string;
}

export const TAB_GUIDE_CONTENT: Record<TabGuideTab, TabGuideInfo> = {
  assignments: {
    tab: "assignments",
    emoji: "📚",
    title: "Задания",
    description:
      "Здесь собраны все задания от твоего учителя: тесты, аудирование, чтение и видео. Выполняй их и зарабатывай XP очки — чем больше заданий, тем выше уровень!",
  },
  leaderboard: {
    tab: "leaderboard",
    emoji: "🏆",
    title: "Рейтинг",
    description:
      "Смотри, кто набрал больше всего XP за неделю! Соревнуйся с друзьями, поднимайся в топ и получай бонусы за лидерство. Стань лучшим учеником!",
  },
  calendar: {
    tab: "calendar",
    emoji: "📅",
    title: "Календарь",
    description:
      "Все занятия и задания по дням. Ты всегда будешь знать, что нужно сдать и когда — никаких неожиданностей и пропущенных дедлайнов!",
  },
  profile: {
    tab: "profile",
    emoji: "👤",
    title: "Профиль",
    description:
      "Твои достижения, уровень, XP и статистика. Здесь же можно добавить друзей и следить за их прогрессом. Можешь даже переименовать меня — Снежу! 😄",
  },
  students: {
    tab: "students",
    emoji: "👨‍🎓",
    title: "Ученики",
    description:
      "Список всех твоих учеников. Смотри их прогресс, уровень и статистику. Назначай задания отдельным ученикам или группам!",
  },
  analysis: {
    tab: "analysis",
    emoji: "📊",
    title: "Анализ",
    description:
      "Детальная аналитика по всем ученикам: успеваемость, выполнение заданий и прогресс по времени. Принимай решения на основе данных!",
  },
  progress: {
    tab: "progress",
    emoji: "📈",
    title: "Успеваемость",
    description:
      "Полная картина по вашему ребёнку: средний балл и его динамика, успеваемость по всем шкалам, история выполненных заданий, словарный запас и время в приложении. Всё, что нужно знать об учёбе — на одном экране.",
  },
};

/**
 * Сколько места по вертикали занимает всё, что стоит НИЖЕ маскота: имя,
 * заголовок, пузырь с подсказкой и кнопка вместе с отступами окна.
 *
 * Подсказки разной длины, поэтому резерв считается от самой длинной строки: у
 * «Успеваемости» это восемь строк на узком экране. Переоценка лишь чуть
 * уменьшает картинку, недооценка режет текст.
 */
const RESERVED_BASE = 200;
const LINE_HEIGHT = 24;
/** Сколько символов помещается в строку пузыря на телефоне. */
const CHARS_PER_LINE = 34;

function reservedFor(description: string): number {
  const lines = Math.ceil(description.length / CHARS_PER_LINE);
  return RESERVED_BASE + lines * LINE_HEIGHT;
}

interface TabGuideProps {
  tabName: TabGuideTab | null;
  visible: boolean;
  mascotName?: string;
  onClose: () => void;
}

export function TabGuide({
  tabName,
  visible,
  mascotName = "Снежа",
  onClose,
}: TabGuideProps) {
  const { width: W, height: H } = useWindowDimensions();
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const info = tabName ? TAB_GUIDE_CONTENT[tabName] : null;

  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      slideAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 340, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 90, friction: 10, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, tabName]);

  if (!visible || !info) return null;

  const cardW = Math.min(W - 40, 380);
  const { width: mascotW, height: mascotH } = mascotBox({
    W, H,
    reserved: reservedFor(info.description),
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Маскот — крупно, прозрачный фон. */}
          <View style={{ marginBottom: -8 }}>
            <WavingMascot width={mascotW} height={mascotH} />
          </View>

          <Text
            style={[
              styles.nameLabel,
              {
                // @ts-ignore web
                backgroundImage: "linear-gradient(90deg, #a78bfa, #c084fc, #e879f9)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              },
            ]}
          >
            {mascotName}
          </Text>

          <Text style={styles.title}>
            {info.emoji}{"  "}{info.title}
          </Text>

          <View
            style={[
              styles.bubble,
              {
                width: cardW,
                // @ts-ignore web
                boxShadow: "0 0 16px rgba(168,85,247,0.7), 0 0 5px rgba(168,85,247,0.4)",
              },
            ]}
          >
            <Text style={styles.desc}>{info.description}</Text>
          </View>

          {/* Кнопка объёмная: как всё нажимаемое в приложении. Эмодзи нет —
              палец вверх ничего не добавляет к слову «Понятно». */}
          <ChunkyCta label="Понятно" onPress={onClose} width={cardW} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Затемнение плотное: через полупрозрачное просвечивал экран под окном, и
  // белый зверь на пёстрой карточке терял силуэт.
  overlay: {
    flex: 1,
    backgroundColor: "#000000e6",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  content: {
    alignItems: "center",
  },
  nameLabel: {
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    color: "#c084fc",
    marginTop: 12,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
    color: "#ffffff",
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  bubble: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#a855f7",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 22,
  },
  desc: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: "500",
    textAlign: "center",
    color: "#ede9ff",
  },
});
