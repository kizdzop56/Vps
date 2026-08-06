// ─────────────────────────────────────────────────────────────────────────────
// Живой фон за подиумом рейтинга.
//
// Раньше за тройкой лидеров лежало одно неподвижное световое пятно. Подиум —
// самое парадное место в приложении, и статичная заливка делала его похожей на
// заставку, а не на сцену: смотреть было не на что.
//
// ── Из чего собран ──────────────────────────────────────────────────────────
//   1. Лучи   — веер из 12 расходящихся полос, медленно вращается и дышит
//               прозрачностью. Это «прожектор» сцены. Один оборот идёт 48
//               секунд: движение должно ощущаться, но не тянуть на себя взгляд.
//   2. Ореол  — мягкий круг за первым местом. Пульсирует медленнее лучей,
//               из-за чего свет кажется живым, а не мигающим по таймеру.
//   3. Искры  — восемь точек, поднимающихся снизу вверх и гаснущих. У каждой
//               свой период и своя задержка, поэтому рисунок не повторяется
//               на глаз.
//
// ── Почему это не тормозит ──────────────────────────────────────────────────
// Анимируются ТОЛЬКО трансформы и прозрачность, никакого layout. На телефонах
// всё уходит в нативный драйвер и не стоит ничего; в вебе драйвера нет, но
// работа всё равно идёт на композиторе.
//
// Прошлый фон этого экрана (DarkVeil) был снят именно из-за нагрузки: он рисовал
// шейдер на каждый кадр во весь экран. Здесь ничего подобного нет — это
// несколько View с трансформами.
//
// ── ГРАБЛИ ──────────────────────────────────────────────────────────────────
// 1. В вебе свёрнутая вкладка замораживает requestAnimationFrame, и цикл сам
//    уже не оживает: анимация так и стоит, пока не перезагрузишь страницу. Та
//    же беда была у часов в карточке времени. Поэтому при возврате во вкладку
//    циклы поднимаются заново (wake).
// 2. useNativeDriver только не в вебе.
// 3. Фон не должен ловить нажатия: подиум под ним кликабельный.
//    pointerEvents="none" на всех слоях.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import { View, Animated, Easing, Platform, AppState, StyleSheet } from "react-native";
import Svg, { Path, Defs, RadialGradient, Stop, Circle } from "react-native-svg";

const NATIVE_DRIVER = Platform.OS !== "web";

/** Сколько лучей в веере. 12 — плотно, но просветы ещё читаются. */
const RAY_COUNT = 12;
/** Один оборот прожектора. Медленно: движение фоновое, а не главное. */
const SPIN_MS = 48_000;
/** Сколько искр летит одновременно. */
const SPARK_COUNT = 8;

/** Треугольный луч из центра. Строится один раз на весь набор. */
function rayPath(index: number): string {
  const step = 360 / RAY_COUNT;
  const half = step * 0.22; // толщина луча в градусах
  const a1 = ((index * step - half) * Math.PI) / 180;
  const a2 = ((index * step + half) * Math.PI) / 180;
  const r = 100;
  const x1 = 100 + Math.sin(a1) * r;
  const y1 = 100 - Math.cos(a1) * r;
  const x2 = 100 + Math.sin(a2) * r;
  const y2 = 100 - Math.cos(a2) * r;
  return `M100 100 L${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

const RAY_PATHS = Array.from({ length: RAY_COUNT }, (_, i) => rayPath(i));

/** Разброс искр по горизонтали в долях ширины и их периоды. */
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => ({
  // Простое неравномерное распределение: без него точки встают сеткой.
  left: 0.08 + ((i * 37) % 100) / 118,
  size: 3 + (i % 3),
  duration: 4200 + (i % 5) * 900,
  delay: i * 620,
}));

export interface PodiumGlowProps {
  /** Ширина области. Обычно ширина экрана. */
  width: number;
  /** Высота области подиума. */
  height: number;
}

export function PodiumGlow({ width, height }: PodiumGlowProps) {
  // Счётчик пробуждений: его изменение перезапускает все циклы.
  const [wake, setWake] = useState(0);

  const spin = useRef(new Animated.Value(0)).current;
  const rayPulse = useRef(new Animated.Value(0)).current;
  const halo = useRef(new Animated.Value(0)).current;
  // Значения искр создаются один раз: пересоздавать их на каждый рендер нельзя,
  // иначе анимация начиналась бы заново при любом обновлении экрана.
  const sparks = useRef(SPARKS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [];

    spin.setValue(0);
    loops.push(Animated.loop(
      Animated.timing(spin, {
        toValue: 1, duration: SPIN_MS,
        easing: Easing.linear, useNativeDriver: NATIVE_DRIVER,
      }),
    ));

    /** Маятник: значение ходит туда-обратно с разной скоростью. */
    const breathe = (v: Animated.Value, up: number, down: number) =>
      Animated.loop(Animated.sequence([
        Animated.timing(v, {
          toValue: 1, duration: up,
          easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER,
        }),
        Animated.timing(v, {
          toValue: 0, duration: down,
          easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER,
        }),
      ]));

    rayPulse.setValue(0);
    halo.setValue(0);
    // Периоды намеренно не кратны: совпади они — свет забился бы в такт.
    loops.push(breathe(rayPulse, 3100, 2600));
    loops.push(breathe(halo, 4300, 3700));

    sparks.forEach((v, i) => {
      v.setValue(0);
      loops.push(Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration: SPARKS[i]!.duration,
          delay: SPARKS[i]!.delay,
          easing: Easing.linear,
          useNativeDriver: NATIVE_DRIVER,
        }),
      ));
    });

    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [wake, spin, rayPulse, halo, sparks]);

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

  // Веер крупнее области: центр вращения уходит под подиум, поэтому лучи
  // расходятся снизу вверх, а не крутятся колесом посреди экрана.
  const fan = Math.max(width, height) * 1.9;

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { overflow: "hidden" }]}
    >
      {/* ── Лучи ── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: width / 2 - fan / 2,
          top: height - fan / 2,
          width: fan,
          height: fan,
          opacity: rayPulse.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.24] }),
          transform: [
            {
              rotate: spin.interpolate({
                inputRange: [0, 1], outputRange: ["0deg", "360deg"],
              }),
            },
            { scale: rayPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
          ],
        }}
      >
        <Svg width={fan} height={fan} viewBox="0 0 200 200">
          <Defs>
            <RadialGradient id="rayFade" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.9} />
              <Stop offset="0.55" stopColor="#e9d5ff" stopOpacity={0.35} />
              <Stop offset="1" stopColor="#c084fc" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {RAY_PATHS.map((d, i) => (
            <Path key={i} d={d} fill="url(#rayFade)" />
          ))}
        </Svg>
      </Animated.View>

      {/* ── Ореол за первым местом ── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          alignSelf: "center",
          left: width / 2 - 170,
          bottom: -120,
          width: 340,
          height: 340,
          opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.95] }),
          transform: [
            { scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.08] }) },
          ],
        }}
      >
        <Svg width={340} height={340}>
          <Defs>
            <RadialGradient id="haloGrad" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#f5d0fe" stopOpacity={0.3} />
              <Stop offset="0.6" stopColor="#d8b4fe" stopOpacity={0.12} />
              <Stop offset="1" stopColor="#a855f7" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={170} cy={170} r={170} fill="url(#haloGrad)" />
        </Svg>
      </Animated.View>

      {/* ── Искры ──
          Поднимаются снизу вверх и гаснут на подходе к верхнему краю.
          Заметны только краем глаза — так и надо: это фон, а не салют. */}
      {sparks.map((v, i) => {
        const cfg = SPARKS[i]!;
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: width * cfg.left,
              bottom: 0,
              width: cfg.size,
              height: cfg.size,
              borderRadius: cfg.size / 2,
              backgroundColor: i % 3 === 0 ? "#fde68a" : "#e9d5ff",
              opacity: v.interpolate({
                inputRange: [0, 0.15, 0.7, 1],
                outputRange: [0, 0.75, 0.3, 0],
              }),
              transform: [
                {
                  translateY: v.interpolate({
                    inputRange: [0, 1], outputRange: [0, -height],
                  }),
                },
                {
                  // Лёгкий снос вбок: строго вертикальный подъём выглядит
                  // механическим, будто точки едут по рельсам.
                  translateX: v.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, i % 2 === 0 ? 12 : -12, 0],
                  }),
                },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

export default PodiumGlow;
