// ─────────────────────────────────────────────────────────────────────────────
// Живой огонёк.
//
// Статичный глиф «flame» рядом с числом дней подряд выглядел наклейкой: серия —
// единственная величина в приложении, которая ГОРИТ и может погаснуть, а иконка
// об этом никак не сообщала.
//
// ── Как устроено пламя ──────────────────────────────────────────────────────
// Настоящий огонь — это не одна дрожащая картинка, а несколько слоёв, которые
// живут в разном ритме. Здесь их четыре:
//
//   1. Ореол   — тот же силуэт, крупнее и полупрозрачный. Дышит медленно и даёт
//                ощущение жара вокруг пламени.
//   2. Тело    — основной силуэт. Вытягивается вверх и слегка сужается, как
//                настоящий язык пламени.
//   3. Ядро    — маленький горячий язычок внутри. Мерцает ВДВОЕ быстрее тела:
//                именно рассинхрон слоёв читается как живой огонь, а не как
//                пульсирующая иконка.
//   4. Искры   — две точки, поднимающиеся вверх и гаснущие. Периоды у них
//                разные и не кратны друг другу, поэтому повтор не улавливается.
//
// Все длительности намеренно НЕ кратны: 620/520, 900/780, 380/460 мс. Совпади
// они — слои начали бы биться в такт, и пламя превратилось бы в мигающую
// лампочку.
//
// ── ГРАБЛИ ──────────────────────────────────────────────────────────────────
// 1. transformOrigin в react-native-web ведёт себя непредсказуемо: scaleY
//    растягивает фигуру от ЦЕНТРА, и пламя раздувалось бы вниз, сквозь
//    подставку. Поэтому вместе с каждым scaleY идёт компенсирующий translateY
//    на половину прироста — низ пламени остаётся на месте, растёт только
//    верхушка. translateY стоит в списке ПЕРВЫМ: трансформы применяются слева
//    направо, и после scale сдвиг тоже масштабировался бы.
// 2. useNativeDriver только не в вебе. Здесь анимируются исключительно
//    трансформы и прозрачность, поэтому на устройствах драйвер нативный и
//    пламя ничего не стоит по производительности.
// 3. В вебе свёрнутая вкладка замораживает requestAnimationFrame, и цикл сам
//    уже не оживает — ровно та же беда, что была у часов в карточке времени.
//    Поэтому при возврате во вкладку анимации поднимаются заново (wake).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import { View, Animated, Easing, Platform, AppState, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import { accents } from "@/constants/theme";

const NATIVE_DRIVER = Platform.OS !== "web";

/** Силуэт пламени. Тот же путь, что у глифа «flame», — набор остаётся единым. */
const FLAME_PATH =
  "M13 2.2c.4 3.4 3.2 4.6 4.4 7.4a7 7 0 1 1-12.4 5.6c0-3.4 2-5.3 3.2-7.2.5 1.5 1.4 2.3 2.4 2.4-.3-3.4.9-6.2 2.4-8.2Z";

/** Горячий язычок внутри: уменьшенная копия силуэта. */
const CORE_PATH =
  "M12.2 10.6c.3 2.3 2.1 3 2.1 4.9a3 3 0 0 1-6 0c0-1.8 1.1-2.9 2-4 .3.9.8 1.4 1.4 1.5-.1-1 0-1.7.5-2.4Z";

export interface LiveFlameProps {
  size?: number;
  /** Цвет пламени. По умолчанию белый: он стоит на цветных подложках. */
  color?: string;
  /** Цвет ядра. Тёплый оттенок — от него огонь читается огнём, а не каплей. */
  coreColor?: string;
  /** Описание для скринридера. Без него иконка считается декоративной. */
  label?: string;
}

export function LiveFlame({
  size = 16,
  color = "#ffffff",
  coreColor = accents.gold,
  label,
}: LiveFlameProps) {
  // Счётчик пробуждений: его изменение перезапускает все циклы.
  const [wake, setWake] = useState(0);

  const body = useRef(new Animated.Value(0)).current;
  const aura = useRef(new Animated.Value(0)).current;
  const core = useRef(new Animated.Value(0)).current;
  const sparkA = useRef(new Animated.Value(0)).current;
  const sparkB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    /** Маятник: значение ходит 0 → 1 → 0 с разной скоростью в обе стороны. */
    const breathe = (value: Animated.Value, up: number, down: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1, duration: up,
            easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER,
          }),
          Animated.timing(value, {
            toValue: 0, duration: down,
            easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER,
          }),
        ]),
      );

    /** Искра: один проход снизу вверх, потом сразу заново. */
    const rise = (value: Animated.Value, duration: number, delay: number) =>
      Animated.loop(
        Animated.timing(value, {
          toValue: 1, duration, delay,
          easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER,
        }),
      );

    body.setValue(0); aura.setValue(0); core.setValue(0);
    sparkA.setValue(0); sparkB.setValue(0);

    const anims = [
      breathe(body, 620, 520),
      breathe(aura, 900, 780),
      breathe(core, 380, 460),
      rise(sparkA, 1500, 0),
      rise(sparkB, 1900, 700),
    ];
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [wake, body, aura, core, sparkA, sparkB]);

  // Возврат во вкладку или в приложение — поднимаем циклы заново.
  useEffect(() => {
    const revive = () => setWake((n) => n + 1);

    if (Platform.OS === "web" && typeof document !== "undefined") {
      const onVisibility = () => { if (!document.hidden) revive(); };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("focus", revive);
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("focus", revive);
      };
    }

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") revive();
    });
    return () => sub.remove();
  }, []);

  /**
   * Трансформ слоя: тянемся вверх, слегка сужаемся и держим низ на месте.
   * Компенсация translateY = −(scaleY − 1) · size / 2 — без неё пламя росло бы
   * в обе стороны от центра.
   */
  const grow = (value: Animated.Value, from: number, to: number, squeeze: number) => ({
    transform: [
      {
        translateY: value.interpolate({
          inputRange: [0, 1],
          outputRange: [-(from - 1) * size / 2, -(to - 1) * size / 2],
        }),
      },
      { scaleY: value.interpolate({ inputRange: [0, 1], outputRange: [from, to] }) },
      { scaleX: value.interpolate({ inputRange: [0, 1], outputRange: [from, squeeze] }) },
    ],
  });

  const sparkStyle = (value: Animated.Value, dx: number) => ({
    position: "absolute" as const,
    left: size / 2 + dx - size * 0.045,
    top: size * 0.16,
    width: size * 0.09,
    height: size * 0.09,
    borderRadius: size * 0.045,
    backgroundColor: coreColor,
    opacity: value.interpolate({
      inputRange: [0, 0.25, 0.75, 1],
      outputRange: [0, 0.9, 0.35, 0],
    }),
    transform: [
      { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.42] }) },
      { scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) },
    ],
  });

  return (
    <View
      style={{ width: size, height: size }}
      accessible={!!label}
      accessibilityLabel={label}
      accessibilityRole={label ? "image" : undefined}
    >
      {/* Ореол: медленное дыхание жара вокруг пламени. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            opacity: aura.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.42] }),
          },
          grow(aura, 1.1, 1.26, 1.14),
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d={FLAME_PATH} fill={color} />
        </Svg>
      </Animated.View>

      {/* Тело пламени. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, grow(body, 1, 1.14, 0.93)]}
      >
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d={FLAME_PATH} fill={color} />
        </Svg>
      </Animated.View>

      {/* Ядро: мерцает вдвое быстрее тела — из-за этого огонь и оживает. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { opacity: core.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) },
          grow(core, 0.88, 1.12, 1.02),
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d={CORE_PATH} fill={coreColor} />
        </Svg>
      </Animated.View>

      {/* Искры. Мелкие настолько, что заметны только краем глаза, — так и надо. */}
      <Animated.View pointerEvents="none" style={sparkStyle(sparkA, -size * 0.13)} />
      <Animated.View pointerEvents="none" style={sparkStyle(sparkB, size * 0.15)} />
    </View>
  );
}

export default LiveFlame;
