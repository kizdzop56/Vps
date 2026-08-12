// ─────────────────────────────────────────────────────────────────────────────
// НОВЫЙ УРОВЕНЬ: полоса опыта в центре экрана, свечение, номер уровня.
//
// ── Зачем отдельное окно ────────────────────────────────────────────────────
// Уровень рос молча. В шапке профиля менялась цифра на шильде и полоса опыта
// откатывалась к началу — и это читалось не как награда, а как сброс прогресса:
// «я копил, а полоса опять пустая».
//
// Поэтому переход показывается прямо: экран затемняется, полоса становится
// КРУПНОЙ и наливается от нуля до конца, а рядом появляется новый номер. То,
// что в шапке выглядело потерей, здесь выглядит тем, чем является.
//
// ── Порядок кадров важен ────────────────────────────────────────────────────
// Всё происходит по очереди, а не разом:
//
//   1. затемнение и подъём карточки        260 мс
//   2. полоса РАСТЁТ в размере (spring)    короткий рывок: она «выходит
//                                          вперёд», как будто её достали из шапки
//   3. полоса НАЛИВАЕТСЯ от нуля до конца  1100 мс — главный кадр
//   4. номер уровня подпрыгивает,
//      вокруг вспыхивает свечение          на завершении наполнения
//   5. название уровня и награда           проявляются последними
//
// Если показать всё сразу, глаз не успевает заметить, ЧТО произошло: он видит
// готовую картинку вместо события.
//
// ── Свечение ────────────────────────────────────────────────────────────────
// Три круга под значком: расходятся и гаснут по очереди. Радиального градиента
// в expo-linear-gradient нет, а тень в RN не размывается настолько сильно —
// поэтому свечение собрано из полупрозрачных окружностей. Приём дешёвый, но на
// движении читается именно как свет.
//
// Цвет свечения — цвет НОВОГО уровня из constants/xpLevels.ts. Своего цвета у
// окна нет намеренно: у пятидесяти уровней своя палитра, и здесь она главная.
//
// ── Про useNativeDriver ─────────────────────────────────────────────────────
// Ширину полосы нативный драйвер не анимирует ни на одной платформе, поэтому у
// наполнения он false. У всего остального (масштаб, прозрачность) — true.
// Смешивать драйверы в ОДНОЙ анимации нельзя, поэтому они разведены на разные
// Animated.Value и запускаются двумя ветками.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, Modal, Animated, Easing, StyleSheet,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { XP_LEVELS, type XpLevel } from "@/constants/xpLevels";
import { LevelBadge } from "@/components/ui/LevelGlyph";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyCta } from "@/components/ui/ChunkyCta";
import { accents, radii } from "@/constants/theme";

/** Уровень по номеру. Нет в таблице — берём ближайший разумный. */
function levelInfo(level: number): XpLevel {
  return (
    XP_LEVELS.find((l) => l.level === level) ??
    XP_LEVELS[Math.min(Math.max(level, 1), XP_LEVELS.length) - 1] ??
    XP_LEVELS[0]!
  );
}

/** Высота полосы. Заметно больше, чем 15 в шапке профиля: это её кадр. */
const TRACK_H = 30;

interface Props {
  visible: boolean;
  /** С какого уровня ушли. Показывается слева под полосой. */
  fromLevel: number;
  /** Какой уровень достигнут. Главное число окна. */
  toLevel: number;
  onClose: () => void;
}

export function LevelUpCelebration({ visible, fromLevel, toLevel, onClose }: Props) {
  const { width: W } = useWindowDimensions();
  const cardW = Math.min(W - 44, 360);

  const next = levelInfo(toLevel);
  const prev = levelInfo(fromLevel);

  // Разведены по драйверам: fill двигает ширину (layout), остальные — transform
  // и opacity.
  const fill = React.useRef(new Animated.Value(0)).current;
  const enter = React.useRef(new Animated.Value(0)).current;
  const grow = React.useRef(new Animated.Value(0.86)).current;
  const pop = React.useRef(new Animated.Value(0.7)).current;
  const halo = React.useRef(new Animated.Value(0)).current;
  const tail = React.useRef(new Animated.Value(0)).current;
  const sweep = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!visible) return;

    fill.setValue(0);
    enter.setValue(0);
    grow.setValue(0.86);
    pop.setValue(0.7);
    halo.setValue(0);
    tail.setValue(0);

    // Ветка 1: всё, что идёт нативным драйвером.
    const native = Animated.sequence([
      Animated.parallel([
        Animated.timing(enter, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(grow, { toValue: 1, tension: 70, friction: 7, useNativeDriver: true }),
      ]),
      // Пауза ровно на время наполнения: номер прыгает, когда полоса дошла.
      Animated.delay(1000),
      Animated.parallel([
        Animated.sequence([
          Animated.spring(pop, { toValue: 1.18, tension: 120, friction: 5, useNativeDriver: true }),
          Animated.spring(pop, { toValue: 1, tension: 90, friction: 8, useNativeDriver: true }),
        ]),
        Animated.timing(tail, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
    ]);

    // Ветка 2: наполнение полосы. Начинается после появления карточки.
    const layout = Animated.sequence([
      Animated.delay(260),
      Animated.timing(fill, {
        toValue: 1,
        duration: 1100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]);

    // Свечение и блик живут своей жизнью: они фон, а не событие.
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(halo, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
    );
    const glide = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: false }),
    );

    native.start();
    layout.start();
    pulse.start();
    glide.start();

    return () => {
      native.stop();
      layout.stop();
      pulse.stop();
      glide.stop();
    };
  }, [visible, toLevel, fill, enter, grow, pop, halo, tail, sweep]);

  if (!visible) return null;

  /** Один круг свечения. Сдвиг разводит волны, чтобы они шли друг за другом. */
  const ring = (size: number, shift: number) => (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: size, height: size, borderRadius: size / 2,
        borderWidth: 2,
        borderColor: next.color,
        opacity: halo.interpolate({
          inputRange: [0, shift, Math.min(1, shift + 0.45), 1],
          outputRange: [0, 0.5, 0, 0],
        }),
        transform: [{
          scale: halo.interpolate({
            inputRange: [0, shift, Math.min(1, shift + 0.45), 1],
            outputRange: [0.7, 0.85, 1.35, 1.35],
          }),
        }],
      }}
    />
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.overlay}>
        <Animated.View
          style={{
            width: cardW,
            alignItems: "center",
            opacity: enter,
            transform: [{
              translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }),
            }],
          }}
        >
          {/* Значок нового уровня в кольцах свечения. */}
          <View style={{ width: 190, height: 190, alignItems: "center", justifyContent: "center" }}>
            {ring(190, 0)}
            {ring(158, 0.18)}
            {ring(128, 0.36)}
            {/* Мягкая заливка под значком: без неё кольца висят в пустоте. */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute", width: 132, height: 132, borderRadius: 66,
                backgroundColor: next.color,
                opacity: halo.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.1, 0.22, 0.1] }),
              }}
            />
            <Animated.View style={{ transform: [{ scale: pop }] }}>
              <LevelBadge level={next.level} color={next.color} size={96} />
            </Animated.View>
          </View>

          <Text style={[s.kicker, { color: next.color }]}>НОВЫЙ УРОВЕНЬ</Text>

          {/* Крупная полоса: главный кадр окна. */}
          <Animated.View style={{ width: "100%", transform: [{ scale: grow }] }}>
            <View style={[s.track, { height: TRACK_H, borderColor: next.color + "55" }]}>
              <Animated.View
                style={{
                  height: "100%",
                  borderRadius: radii.pill,
                  overflow: "hidden",
                  width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                  shadowColor: next.color,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.9,
                  shadowRadius: 12,
                  elevation: 6,
                }}
              >
                <LinearGradient
                  colors={[prev.color, next.color, accents.magenta]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                {/* Блик бежит по заполненной части. */}
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: "absolute", top: 0, bottom: 0, width: "40%",
                    backgroundColor: "#ffffff",
                    opacity: sweep.interpolate({
                      inputRange: [0, 0.35, 0.7, 1],
                      outputRange: [0, 0.4, 0, 0],
                    }),
                    left: sweep.interpolate({ inputRange: [0, 1], outputRange: ["-45%", "135%"] }),
                    transform: [{ skewX: "-18deg" }],
                  }}
                />
              </Animated.View>
            </View>

            {/* Откуда и куда. Слева тускло — этот уровень уже позади. */}
            <View style={s.ends}>
              <Text style={s.endMuted}>{`Ур. ${prev.level}`}</Text>
              <Text style={[s.endBright, { color: next.color }]}>{`Ур. ${next.level}`}</Text>
            </View>
          </Animated.View>

          {/* Название и награда — последними: сначала событие, потом подписи. */}
          <Animated.View style={{ width: "100%", alignItems: "center", opacity: tail }}>
            <Text style={s.title}>{next.title}</Text>

            <View style={[s.reward, { borderColor: next.color + "4d" }]}>
              <Glyph name="medal" size={16} color={accents.gold} />
              <Text style={s.rewardText} numberOfLines={2}>{next.reward}</Text>
            </View>

            {toLevel - fromLevel > 1 && (
              <Text style={s.jump}>
                {`Сразу +${toLevel - fromLevel} уровня за один заход`}
              </Text>
            )}
          </Animated.View>

          <ChunkyCta label="Отлично!" onPress={onClose} width={cardW} style={{ marginTop: 18 }} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  // Плотное затемнение: сквозь полупрозрачное просвечивали карточки профиля, и
  // свечение на них терялось.
  overlay: {
    flex: 1,
    backgroundColor: "#08030fee",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  kicker: {
    fontSize: 12, fontWeight: "900", letterSpacing: 2.4,
    marginTop: 4, marginBottom: 14,
  },
  track: {
    width: "100%",
    borderRadius: radii.pill,
    backgroundColor: "rgba(23,8,56,0.75)",
    borderWidth: 1.5,
    overflow: "hidden",
    padding: 3,
  },
  ends: {
    flexDirection: "row", justifyContent: "space-between",
    marginTop: 8, paddingHorizontal: 2,
  },
  endMuted: {
    fontSize: 12, fontWeight: "800", color: "rgba(255,255,255,0.45)",
    fontVariant: ["tabular-nums"],
  },
  endBright: { fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },
  title: {
    fontSize: 26, fontWeight: "900", letterSpacing: -0.8,
    color: "#ffffff", marginTop: 16, textAlign: "center",
  },
  reward: {
    flexDirection: "row", alignItems: "center", gap: 9,
    marginTop: 12, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: radii.md, borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  rewardText: { flex: 1, fontSize: 13.5, fontWeight: "800", color: "#ede9ff" },
  jump: {
    fontSize: 12, fontWeight: "700", color: accents.gold,
    marginTop: 10, textAlign: "center",
  },
});

export default LevelUpCelebration;
