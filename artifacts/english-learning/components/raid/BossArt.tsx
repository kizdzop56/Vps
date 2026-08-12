// ─────────────────────────────────────────────────────────────────────────────
// Фигура босса.
//
// Рисуется кодом, а не картинкой, и вот почему: боссов пять, у каждого три
// состояния (дышит, ранен, берсерк), и это уже пятнадцать файлов по несколько
// сотен килобайт — при том что на 3G у нас и один маскот прорисовывался с
// трудом. Фигуры собраны из примитивов react-native-svg, цвет приходит с
// сервера (BOSSES.colors), а «жизнь» даёт анимация, не кадры.
//
// Анимируются только transform и opacity: на слабом телефоне всё остальное
// плывёт. Дыхание — бесконечный цикл масштаба, удар — короткий шейк по X плюс
// вспышка. Эмодзи нет, как и во всём интерфейсе.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { Animated, Easing, Platform, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";

const NATIVE_DRIVER = Platform.OS !== "web";

export interface BossArtProps {
  boss: string;
  colors: [string, string];
  /** normal | hardened | berserk — от фазы зависит частота дыхания. */
  phase: string;
  /** Меняется на каждый удар: по смене запускается шейк. */
  hitToken: number;
  size?: number;
  /** Босс повержен: фигура оседает и гаснет. */
  defeated?: boolean;
}

export function BossArt({ boss, colors, phase, hitToken, size = 200, defeated = false }: BossArtProps) {
  const breathe = React.useRef(new Animated.Value(0)).current;
  const shake = React.useRef(new Animated.Value(0)).current;
  const flash = React.useRef(new Animated.Value(0)).current;

  // Дыхание: чем ниже здоровье, тем чаще.
  React.useEffect(() => {
    const duration = phase === "berserk" ? 900 : phase === "hardened" ? 1400 : 2200;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(breathe, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, phase]);

  // Удар: шейк и вспышка. Первый рендер не считается ударом.
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) { first.current = false; return; }
    shake.setValue(0);
    flash.setValue(1);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 55, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(shake, { toValue: -1, duration: 55, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(shake, { toValue: 0.6, duration: 55, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(shake, { toValue: 0, duration: 70, useNativeDriver: NATIVE_DRIVER }),
      ]),
      Animated.timing(flash, { toValue: 0, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
    ]).start();
  }, [hitToken, shake, flash]);

  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });
  const translateX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={{
          transform: [{ translateX }, { scale }],
          opacity: defeated ? 0.35 : 1,
        }}
      >
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <Defs>
            <LinearGradient id="bossBody" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors[0]} />
              <Stop offset="1" stopColor={colors[1]} />
            </LinearGradient>
          </Defs>
          {shape(boss, colors)}
        </Svg>
      </Animated.View>

      {/* Вспышка попадания: белое свечение поверх фигуры. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: size * 0.8,
          height: size * 0.8,
          borderRadius: size,
          backgroundColor: "#ffffff",
          opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }),
        }}
      />
    </View>
  );
}

/** Тело босса. Один силуэт на босса, узнаваемый по контуру. */
function shape(boss: string, colors: [string, string]) {
  const dark = colors[1];
  const eye = "#0b1020";

  if (boss === "dragon") {
    return (
      <G>
        {/* Крылья */}
        <Path d="M42 96 8 62l14 46-14 10 34 6Z" fill={dark} opacity={0.65} />
        <Path d="M158 96l34-34-14 46 14 10-34 6Z" fill={dark} opacity={0.65} />
        {/* Тело */}
        <Ellipse cx={100} cy={116} rx={54} ry={48} fill="url(#bossBody)" />
        {/* Голова */}
        <Ellipse cx={100} cy={66} rx={38} ry={32} fill="url(#bossBody)" />
        {/* Рога */}
        <Path d="M74 44 62 20l24 14ZM126 44l12-24-24 14Z" fill={dark} />
        {/* Глаза и пасть */}
        <Ellipse cx={86} cy={64} rx={6} ry={8} fill={eye} />
        <Ellipse cx={114} cy={64} rx={6} ry={8} fill={eye} />
        <Path d="M82 84h36l-6 10H88Z" fill={eye} opacity={0.85} />
        <Path d="M88 94l4 8 6-8 6 8 4-8Z" fill="#ffffff" />
      </G>
    );
  }

  if (boss === "phantom") {
    return (
      <G>
        <Path
          d="M100 24c30 0 50 24 50 56v72l-16-14-14 14-20-14-20 14-14-14-16 14V80c0-32 20-56 50-56Z"
          fill="url(#bossBody)"
          opacity={0.9}
        />
        <Ellipse cx={84} cy={78} rx={9} ry={12} fill={eye} />
        <Ellipse cx={116} cy={78} rx={9} ry={12} fill={eye} />
        {/* Открытый «поющий» рот: фантом слышен, а не виден */}
        <Ellipse cx={100} cy={110} rx={12} ry={16} fill={eye} opacity={0.85} />
        <Circle cx={100} cy={110} r={5} fill="#ffffff" opacity={0.5} />
      </G>
    );
  }

  if (boss === "elemental") {
    return (
      <G>
        <Path
          d="M100 18c22 26 44 34 44 66 0 30-20 52-44 52s-44-22-44-52c0-32 22-40 44-66Z"
          fill="url(#bossBody)"
        />
        <Circle cx={100} cy={158} r={26} fill={dark} opacity={0.55} />
        <Ellipse cx={86} cy={92} rx={7} ry={10} fill={eye} />
        <Ellipse cx={114} cy={92} rx={7} ry={10} fill={eye} />
        <Path d="M84 118c6 8 26 8 32 0" stroke={eye} strokeWidth={5} strokeLinecap="round" fill="none" />
      </G>
    );
  }

  if (boss === "titan") {
    return (
      <G>
        <Rect x={44} y={56} width={112} height={110} rx={22} fill="url(#bossBody)" />
        <Rect x={62} y={22} width={76} height={52} rx={16} fill="url(#bossBody)" />
        {/* Корона экзаменатора */}
        <Path d="M58 24l10 14 12-18 12 18 12-18 12 18 10-14v-8H58Z" fill={dark} />
        <Rect x={74} y={40} width={14} height={12} rx={4} fill={eye} />
        <Rect x={112} y={40} width={14} height={12} rx={4} fill={eye} />
        <Rect x={78} y={92} width={44} height={14} rx={7} fill={eye} opacity={0.85} />
        <Rect x={84} y={92} width={4} height={14} fill="#ffffff" />
        <Rect x={100} y={92} width={4} height={14} fill="#ffffff" />
        <Rect x={112} y={92} width={4} height={14} fill="#ffffff" />
      </G>
    );
  }

  // Голем по умолчанию: каменная кладка правил.
  return (
    <G>
      <Rect x={40} y={70} width={120} height={100} rx={18} fill="url(#bossBody)" />
      <Rect x={64} y={28} width={72} height={58} rx={16} fill="url(#bossBody)" />
      <Rect x={26} y={84} width={20} height={62} rx={10} fill={dark} opacity={0.7} />
      <Rect x={154} y={84} width={20} height={62} rx={10} fill={dark} opacity={0.7} />
      {/* Трещины по кладке */}
      <Path d="M70 96h60M70 124h60M100 96v56" stroke={dark} strokeWidth={4} opacity={0.5} fill="none" />
      <Ellipse cx={84} cy={54} rx={8} ry={9} fill={eye} />
      <Ellipse cx={116} cy={54} rx={8} ry={9} fill={eye} />
      <Rect x={80} y={70} width={40} height={9} rx={4} fill={eye} opacity={0.85} />
    </G>
  );
}

export default BossArt;
