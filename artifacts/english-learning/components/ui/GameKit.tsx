// ─────────────────────────────────────────────────────────────────────────────
// Игровой набор компонентов.
//
// Это то, что делает интерфейс похожим на игру, а не на таблицу успеваемости:
//   • ChunkyButton — кнопка с физической нижней гранью: при нажатии корпус
//     проседает, грань схлопывается. Ощущается как настоящая клавиша.
//   • Tile — плитка с цветной тенью вместо серой. На светло-фиолетовом фоне
//     серая тень читается грязью, цветная даёт свечение.
//   • XpBar — полоса опыта с бликом и анимацией заполнения.
//   • GoalPips — цель дня сегментами, а не сплошной полосой: закрытые сегменты
//     читаются как «сделано», это нагляднее процента.
//   • Pill — метка-пилюля для статусов и счётчиков.
//   • MedalTile — медаль как трофей: металлическая заливка по сложности,
//     заблокированная показывает замок, а не прячется.
//
// Все размеры, цвета и тайминги берутся из constants/theme.ts и colors.ts —
// своих значений здесь нет, чтобы палитра оставалась единой.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from "react";
import {
  View, Text, Pressable, Animated, Easing, StyleSheet, Platform,
  type ViewStyle, type StyleProp,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { accents, gradients, radii, chunky, timing } from "@/constants/theme";
import { Glyph, type GlyphName } from "./Glyph";

// Анимации через нативный драйвер только там, где он есть. На вебе его нет,
// и попытка его использовать даёт предупреждения и рассинхрон анимаций.
const NATIVE_DRIVER = Platform.OS !== "web";

/**
 * Короткая отдача в палец при нажатии.
 *
 * expo-haptics намеренно НЕ импортируется статически: на вебе нативный модуль
 * ExpoHaptics не зарегистрирован, и падает сам импорт — а вместе с ним весь
 * модуль экрана, который тянет этот файл. Expo Router грузит роуты лениво,
 * поэтому такая ошибка выглядит как белый экран на одной вкладке.
 * Ленивый require под try/catch решает это: на вебе просто ничего не делаем.
 */
function tapFeedback() {
  if (Platform.OS === "web") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Haptics = require("expo-haptics");
    Haptics.impactAsync?.(Haptics.ImpactFeedbackStyle.Light)?.catch?.(() => {});
  } catch {
    // Тактильная отдача — приятная мелочь, её отсутствие не должно ничего ломать.
  }
}

// ── ChunkyButton ────────────────────────────────────────────────────────────

export interface ChunkyButtonProps {
  label: string;
  /** Вторая строка мелким шрифтом: «12 к повторению · 6 новых». */
  sublabel?: string;
  /** Глиф слева. У тонов primary/dark/warm — в круглой плашке. */
  icon?: GlyphName;
  /** Стрелка справа: для кнопок-переходов. */
  chevron?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /**
   * primary — градиент бренда, dark — глубокий индиго, warm — огонь,
   * danger — красный для выхода и удаления.
   */
  tone?: "primary" | "dark" | "warm" | "danger";
  /** Небольшой наклон: убирает ощущение строгой сетки. Градусы. */
  tilt?: number;
  /** Текст по центру, без растяжки на всю ширину: для коротких действий. */
  center?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ChunkyButton({
  label, sublabel, icon, chevron, onPress, disabled,
  tone = "primary", tilt = 0, center, style,
}: ChunkyButtonProps) {
  // Анимируем сдвиг корпуса вниз: 0 в покое, chunky.pressDepth при нажатии.
  const press = useRef(new Animated.Value(0)).current;

  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to,
      duration: chunky.duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: NATIVE_DRIVER,
    }).start();

  const palette = {
    primary: { fill: gradients.action, edge: accents.indigoDeep },
    dark:    { fill: [accents.indigoDeep, accents.violetDeep] as const, edge: "#312e81" },
    warm:    { fill: gradients.fire, edge: "#b45309" },
    // Красный не из палитры градиентов: он используется только здесь и в
    // подтверждениях удаления, отдельного gradients.danger заводить незачем.
    danger:  { fill: ["#f43f5e", "#e11d48"] as const, edge: "#9f1239" },
  }[tone];

  // У danger значок стоит рядом с текстом, без белой плашки: квадрат на
  // красном перетягивает внимание сильнее самого действия.
  const plainIcon = tone === "danger";
  const centered = center ?? tone === "danger";

  return (
    <View style={[{ transform: [{ rotate: `${tilt}deg` }] }, style]}>
      {/* Нижняя грань: отдельный слой под корпусом. В RN у View не может быть
          двух теней, поэтому «толщину» кнопки рисуем настоящим прямоугольником. */}
      <View
        style={{
          position: "absolute", left: 0, right: 0, top: chunky.edge, bottom: 0,
          borderRadius: radii.lg,
          backgroundColor: disabled ? "#c7c3d4" : palette.edge,
        }}
      />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={disabled ? undefined : onPress}
          onPressIn={() => {
            if (disabled) return;
            set(chunky.pressDepth);
            // Отдача подтверждает нажатие раньше, чем отработает переход.
            tapFeedback();
          }}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={sublabel ? `${label}. ${sublabel}` : label}
          accessibilityState={{ disabled: !!disabled }}
        >
          <LinearGradient
            colors={(disabled ? ["#ddd9e8", "#cfcadc"] : palette.fill) as unknown as string[]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{
              borderRadius: radii.lg,
              paddingVertical: 15,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: centered ? "center" : "flex-start",
              gap: plainIcon ? 9 : 13,
              minHeight: 56,
            }}
          >
            {icon && (
              plainIcon ? (
                <Glyph name={icon} size={19} color="#fff" />
              ) : (
                <View style={{
                  width: 44, height: 44, borderRadius: radii.sm + 3,
                  backgroundColor: "rgba(255,255,255,0.2)",
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Glyph name={icon} size={21} color="#fff" />
                </View>
              )
            )}
            <View style={centered ? undefined : { flex: 1 }}>
              <Text style={{
                fontSize: 17, fontWeight: "900", color: "#fff",
                textAlign: centered ? "center" : "left",
              }}>
                {label}
              </Text>
              {!!sublabel && (
                <Text style={{
                  fontSize: 12.5, fontWeight: "600", color: "#ffffffdd", marginTop: 2,
                  textAlign: centered ? "center" : "left",
                }}>
                  {sublabel}
                </Text>
              )}
            </View>
            {chevron && <Glyph name="chevron" size={21} color="#fff" />}
          </LinearGradient>
        </Pressable>
      </Animated.View>
      {/* Резерв под грань, чтобы соседние блоки не наезжали на неё. */}
      <View style={{ height: chunky.edge }} />
    </View>
  );
}

// ── Tile ────────────────────────────────────────────────────────────────────

export interface TileProps {
  children: React.ReactNode;
  /** Цвет тени. По умолчанию фиолетовый бренда. */
  glow?: string;
  tilt?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Tile({ children, glow, tilt = 0, onPress, style }: TileProps) {
  const colors = useColors();
  const base: ViewStyle = {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    transform: [{ rotate: `${tilt}deg` }],
    // Тень в цвете элемента, а не серая.
    shadowColor: glow ?? accents.violetDeep,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 3,
  };

  // Кликабельная плитка — ОДИН элемент, а не Pressable поверх View: иначе
  // переданные flex/ширина уходят внутрь и ряд плиток не растягивается.
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [base, style, pressed ? { opacity: 0.92 } : null]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

// ── XpBar ───────────────────────────────────────────────────────────────────

export interface XpBarProps {
  /** Доля заполнения 0..1. */
  progress: number;
  height?: number;
  /** Блик, пробегающий по заполненной части. */
  shine?: boolean;
  /** Своя заливка вместо градиента прогресса. */
  colors?: readonly string[];
  style?: StyleProp<ViewStyle>;
}

export function XpBar({ progress, height = 14, shine = true, colors: fill, style }: XpBarProps) {
  const width = useRef(new Animated.Value(0)).current;
  const glide = useRef(new Animated.Value(0)).current;
  const clamped = Math.max(0, Math.min(1, progress));

  useEffect(() => {
    // Ширина не поддерживается нативным драйвером, поэтому здесь всегда JS.
    Animated.timing(width, {
      toValue: clamped,
      duration: timing.progress,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [clamped]);

  useEffect(() => {
    if (!shine) return;
    const loop = Animated.loop(
      Animated.timing(glide, {
        toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [shine]);

  return (
    <View style={[{
      height, borderRadius: radii.pill, overflow: "hidden",
      backgroundColor: "rgba(99,102,241,0.16)",
    }, style]}>
      <Animated.View style={{
        height: "100%",
        width: width.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
        borderRadius: radii.pill,
        overflow: "hidden",
      }}>
        <LinearGradient
          colors={(fill ?? gradients.progress) as unknown as string[]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        {shine && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute", top: 0, bottom: 0, width: "45%",
              backgroundColor: "#fff",
              opacity: glide.interpolate({ inputRange: [0, 0.35, 0.7, 1], outputRange: [0, 0.4, 0, 0] }),
              left: glide.interpolate({ inputRange: [0, 1], outputRange: ["-50%", "140%"] }),
              transform: [{ skewX: "-18deg" }],
            }}
          />
        )}
      </Animated.View>
    </View>
  );
}

// ── GoalPips ────────────────────────────────────────────────────────────────

export interface GoalPipsProps {
  /** Сделано. */
  value: number;
  /** Сколько нужно. */
  target: number;
  /** Сколько сегментов рисуем. Больше 12 — рябит, меньше 6 — грубо. */
  segments?: number;
  done?: boolean;
}

/**
 * Цель дня сегментами. Почему не полоса: закрытый сегмент читается как
 * «ещё одна галочка», это ощутимее, чем прирост процента, и лучше работает
 * на маленьких значениях (2 из 10 видно сразу).
 */
export function GoalPips({ value, target, segments = 10, done }: GoalPipsProps) {
  const filled = target > 0 ? Math.round((Math.min(value, target) / target) * segments) : 0;
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {Array.from({ length: segments }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1, height: 11, borderRadius: 4,
            backgroundColor: i < filled ? "transparent" : "rgba(99,102,241,0.16)",
            overflow: "hidden",
          }}
        >
          {i < filled && (
            <LinearGradient
              colors={done ? [accents.gold, accents.amber] : ["#a855f7", accents.violetDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
        </View>
      ))}
    </View>
  );
}

// ── Pill ────────────────────────────────────────────────────────────────────

export interface PillProps {
  text: string;
  icon?: GlyphName;
  /** gold — уровень и награда, solid — счётчик, soft — нейтральная метка. */
  tone?: "gold" | "solid" | "soft" | "warn" | "danger";
  color?: string;
  tilt?: number;
}

export function Pill({ text, icon, tone = "soft", color, tilt = 0 }: PillProps) {
  const colors = useColors();
  const cfg = {
    gold:   { bg: accents.gold,               fg: "#42200a", grad: [accents.gold, accents.amber] as const },
    solid:  { bg: color ?? colors.primary,    fg: "#fff",    grad: null },
    soft:   { bg: (color ?? colors.success) + "26", fg: color ?? accents.violetDeep, grad: null },
    warn:   { bg: colors.warning,             fg: "#fff",    grad: null },
    danger: { bg: colors.destructive + "22",  fg: colors.destructive, grad: null },
  }[tone];

  const inner = (
    <>
      {icon && <Glyph name={icon} size={13} color={cfg.fg} />}
      <Text style={{ fontSize: 12, fontWeight: "800", color: cfg.fg, fontVariant: ["tabular-nums"] }}>
        {text}
      </Text>
    </>
  );

  const box: ViewStyle = {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: radii.pill,
    transform: [{ rotate: `${tilt}deg` }],
  };

  if (cfg.grad) {
    return (
      <LinearGradient colors={cfg.grad as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={box}>
        {inner}
      </LinearGradient>
    );
  }
  return <View style={[box, { backgroundColor: cfg.bg }]}>{inner}</View>;
}

// ── MedalTile ───────────────────────────────────────────────────────────────

export interface MedalTileProps {
  icon: GlyphName;
  difficulty?: "easy" | "medium" | "hard";
  locked?: boolean;
  size?: number;
  label?: string;
  onPress?: () => void;
}

/**
 * Медаль-трофей. Заблокированная не прячется, а показывает замок: скрытая
 * награда не тянет вперёд, видимая недостижимая — тянет.
 */
export function MedalTile({ icon, difficulty = "easy", locked, size = 64, label, onPress }: MedalTileProps) {
  const grad = {
    easy: gradients.medalEasy,
    medium: gradients.medalMedium,
    hard: gradients.medalHard,
  }[difficulty];
  const edge = { easy: "#b45309", medium: accents.indigoDeep, hard: "#581c87" }[difficulty];

  const body = locked ? (
    <View style={{
      width: size, height: size, borderRadius: radii.md + 2,
      alignItems: "center", justifyContent: "center",
      backgroundColor: "rgba(160,140,220,0.14)",
      borderWidth: 2, borderColor: "rgba(139,92,246,0.42)", borderStyle: "dashed",
    }}>
      <Glyph name="lock" size={Math.round(size * 0.36)} color="rgba(91,79,142,0.5)" />
    </View>
  ) : (
    <View>
      {/* Нижняя грань — тот же приём, что у кнопки: медаль выглядит объёмной. */}
      <View style={{
        position: "absolute", left: 0, right: 0, top: 5, height: size,
        borderRadius: radii.md + 2, backgroundColor: edge,
      }} />
      <LinearGradient
        colors={grad as unknown as string[]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{
          width: size, height: size, borderRadius: radii.md + 2,
          alignItems: "center", justifyContent: "center",
          borderWidth: 2, borderColor: "rgba(255,255,255,0.7)",
        }}
      >
        <Glyph name={icon} size={Math.round(size * 0.42)} color="#fff" />
      </LinearGradient>
    </View>
  );

  const wrapped = (
    <View style={{ alignItems: "center", gap: 6 }}>
      {body}
      {!!label && (
        <Text numberOfLines={2} style={{
          fontSize: 9.5, fontWeight: "700", textAlign: "center",
          color: locked ? "#9b8ec4" : accents.violetDeep, lineHeight: 12,
        }}>
          {label}
        </Text>
      )}
    </View>
  );

  if (!onPress) return wrapped;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label ? `${label}${locked ? ", не получена" : ", получена"}` : undefined}
      style={({ pressed }) => pressed ? { transform: [{ scale: 0.95 }] } : undefined}
    >
      {wrapped}
    </Pressable>
  );
}

// ── SectionLabel ────────────────────────────────────────────────────────────

/** Метка секции: капс с трекингом. Вынесена, чтобы не дублировать стиль. */
export function SectionLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return (
    <Text style={[{
      fontSize: 11, fontWeight: "800", color: colors.mutedForeground,
      textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10,
    }, style as any]}>
      {children}
    </Text>
  );
}

export default {
  ChunkyButton, Tile, XpBar, GoalPips, Pill, MedalTile, SectionLabel,
};
