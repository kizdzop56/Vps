// ─────────────────────────────────────────────────────────────────────────────
// Экран «Рейтинг»: подиум с тройкой лидеров и список остальных участников.
//
// Три категории (очки, время, задания) и два среза (все ученики / друзья)
// приходят одним запросом /api/leaderboard/categories и обновляются раз в минуту.
//
// Эмодзи на экране не используются: иконки категорий — глифы из своего набора
// (components/ui/Glyph.tsx), значение очков пишется числом без звезды. Поле
// avatarEmoji остаётся пользовательским выбором и показывается как есть, но
// дефолтного эмодзи больше нет — вместо него первая буква ника.
//
// ── Единая порода поверхностей ──────────────────────────────────────────────
// Экран говорит на том же языке, что профиль, друзья и календарь: у каждой
// карточки есть НИЖНЯЯ ГРАНЬ — отдельный слой под корпусом, сдвинутый вниз на
// свою толщину. Проседает при нажатии только то, что реально открывается:
// строка чужого участника, место на подиуме, кнопка «показать всех». Своя
// строка грань имеет, но не проседает: открывать в ней нечего.
//
// Переключатели собраны как в листе друзей: подложка с гранью, активный
// сегмент — светлая плашка с цветной тенью.
//
// ── Чип «Твоё место» ────────────────────────────────────────────────────────
// Он светлый и объёмный, а не полупрозрачный. Раньше это была стеклянная
// плашка на градиенте: на фиолетовом фоне она почти не отличалась от него, и
// самое нужное число экрана — своё место — приходилось выискивать. Теперь это
// белая табличка с гранью, единственное светлое пятно в шапке.
//
// ── Живой фон подиума ───────────────────────────────────────────────────────
// За тройкой лидеров работает PodiumGlow: медленно вращающийся веер лучей,
// дышащий ореол и редкие искры. Подиум — парадное место приложения, и
// неподвижная заливка делала его похожим на скриншот.
//
// Важно: это НЕ возврат к DarkVeil. Та плёнка рисовала шейдер во весь экран
// каждый кадр и красила всё в почти чёрный; здесь несколько слоёв, у которых
// анимируются только трансформы и прозрачность, а гамма остаётся фиолетовой.
//
// ── Пьедестал ───────────────────────────────────────────────────────────────
// Ступень — не полупрозрачный прямоугольник, а настоящая тумба из четырёх
// частей: верхняя площадка (на неё «стоит» участник), передняя грань в металле
// места, скошенные боковые фаски и утопленная табличка с номером.
//
// ── Рейтинг перестал быть просто списком ────────────────────────────────────
//  • Рядом с каждым участником видно отставание от того, кто выше — «отстаёт на
//    40 очков» превращает таблицу в дистанцию, которую можно сократить.
//  • Своё место вынесено в шапку отдельным чипом: там же написано, сколько
//    осталось до следующей строчки. Отдельного блока «догоняешь» под подиумом
//    больше нет — он повторял ту же дистанцию второй раз на одном экране.
//  • Длинный список сворачивается: первая десятка, разрыв «ещё N участников»
//    и своя строка с соседями.
//
// ── ГРАБЛИ ──────────────────────────────────────────────────────────────────
// 1. НЕ вкладывать <Text> в <Text>: в Safari это роняет весь экран целиком.
// 2. useNativeDriver только не в вебе.
// 3. Нижний отступ берётся из screenBottom: панель вкладок плавает поверх
//    содержимого, и без него последняя строка уезжает под неё.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, FlatList, ActivityIndicator, Platform,
  TouchableOpacity, Pressable, Image, RefreshControl,
  Animated, Easing, useWindowDimensions,
  type ViewStyle, type StyleProp,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "expo-router";
import authStorage from "@/utils/authStorage";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { ChunkyButton, SectionLabel } from "@/components/ui/GameKit";
import { PodiumGlow } from "@/components/ui/PodiumGlow";
import { accents, gradients, radii, timing } from "@/constants/theme";
import { screenBottom } from "@/constants/layout";

const NATIVE_DRIVER = Platform.OS !== "web";

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

// ── Толщина граней ──────────────────────────────────────────────────────────
/** Строки участников и переключатели. */
const EDGE = 5;
/** Цвет грани под светлой карточкой. Тот же, что в профиле и календаре. */
const EDGE_LIGHT = "#c9bdf0";
/** Грань под светлой табличкой НА ФИОЛЕТОВОМ: она должна быть темнее фона. */
const EDGE_ON_HERO = "#3b1a7a";

type CategoryKey = "points" | "time" | "assignments";
type Scope = "all" | "friends";

type CategoryEntry = {
  userId: number;
  name: string;
  surname?: string | null;
  username: string;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
  value: number;
  rank: number;
};

type CategoriesData = Record<CategoryKey, CategoryEntry[]>;

/** Строка списка: участник, разрыв или кнопка «показать всех». */
type Row =
  | { kind: "entry"; entry: CategoryEntry }
  | { kind: "gap"; count: number }
  | { kind: "more"; count: number };

const CATEGORIES: {
  key: CategoryKey;
  label: string;
  icon: GlyphName;
  color: string;
  formatValue: (v: number) => string;
  /** Формат отставания: «на 40 очков», «на 12 минут», «на 5%». */
  formatGap: (v: number) => string;
  subtitle: string;
}[] = [
  {
    key: "points", label: "Очки", icon: "star", color: "#a855f7",
    formatValue: (v) => `${v}`,
    formatGap: (v) => `${v} ${pluralRu(v, "очко", "очка", "очков")}`,
    subtitle: "Рейтинг по очкам опыта",
  },
  {
    key: "time", label: "Время", icon: "clock", color: "#6366f1",
    formatValue: (v) => v >= 60 ? `${Math.floor(v / 60)} ч ${v % 60} м` : `${v} м`,
    formatGap: (v) => v >= 60 ? `${Math.floor(v / 60)} ч ${v % 60} м` : `${v} ${pluralRu(v, "минуту", "минуты", "минут")}`,
    subtitle: "Кто больше занимался",
  },
  {
    key: "assignments", label: "Задания", icon: "check", color: "#c026d3",
    formatValue: (v) => v > 0 ? `${v}%` : "—",
    formatGap: (v) => `${v}%`,
    subtitle: "Средний процент по всем заданиям",
  },
];

const SCOPE_OPTIONS: { key: Scope; label: string }[] = [
  { key: "all",     label: "Все ученики" },
  { key: "friends", label: "Друзья" },
];

/** Сколько участников показываем до сворачивания списка. */
const VISIBLE_HEAD = 10;

/**
 * Металл мест: золото, серебро, бронза.
 *
 * gradient — оправа аватара и передняя грань тумбы;
 * plate    — верхняя площадка, она светлее: на неё падает свет сверху;
 * solid    — свечение вокруг аватара и цвет таблички;
 * dark     — тень под площадкой и боковая фаска.
 */
const PLACE_METALS = [
  {
    gradient: ["#fff6d0", "#f3cf6a", "#c9971f", "#8a6511"] as const,
    plate: ["#fff8dd", "#f6d97e"] as const,
    solid: "#d4af37", dark: "#7a5a0f",
  },
  {
    gradient: ["#fbfbfc", "#d8dce1", "#a3aab3", "#6f7680"] as const,
    plate: ["#ffffff", "#dde1e6"] as const,
    solid: "#b0b8bf", dark: "#5f666e",
  },
  {
    gradient: ["#f0c497", "#c9803f", "#9a5a24", "#5e3612"] as const,
    plate: ["#f6d3ae", "#cf8a49"] as const,
    solid: "#c17a3e", dark: "#53300f",
  },
];
const PLACE_COLORS = PLACE_METALS.map(m => m.solid);

/**
 * Высота тумбы под каждым местом. Разница между ступенями заметная:
 * пьедестал должен читаться как лестница, а не как три почти равные плашки.
 */
const STEP_HEIGHT = [78, 54, 38];
/** Толщина верхней площадки тумбы. */
const PLATE_H = 9;

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Первая буква ника: замена дефолтному эмодзи в аватаре. */
function initial(nick: string): string {
  const m = nick?.match(/[\p{L}\p{N}]/u);
  return (m?.[0] ?? "?").toUpperCase();
}

// ── Объёмные оболочки ───────────────────────────────────────────────────────

/** Грань без проседания: для того, что не нажимается. */
function Chunky({
  color, edge = EDGE, radius = radii.md, style, children,
}: {
  color: string; edge?: number; radius?: number;
  style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  return (
    <View style={[{ paddingBottom: edge }, style]}>
      <View style={{
        position: "absolute", left: 0, right: 0, top: edge, bottom: 0,
        borderRadius: radius, backgroundColor: color,
      }} />
      {children}
    </View>
  );
}

/**
 * Грань + проседание на её высоту при нажатии.
 *
 * Только там, где нажатие что-то делает: кнопка с гранью, которая не
 * проседает, рядом с проседающими соседями читается как неработающая.
 */
function ChunkyTap({
  color, edge = EDGE, radius = radii.md, onPress, style, accessibilityLabel, children,
}: {
  color: string; edge?: number; radius?: number;
  onPress?: () => void; style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string; children: React.ReactNode;
}) {
  const press = useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: timing.press,
      easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER,
    }).start();

  return (
    <View style={[{ paddingBottom: edge }, style]}>
      <View style={{
        position: "absolute", left: 0, right: 0, top: edge, bottom: 0,
        borderRadius: radius, backgroundColor: color,
      }} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={onPress}
          onPressIn={() => set(edge)}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ── Корона победителя ─────────────────────────────────────────────────
function Crown({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size * (18 / 24)} viewBox="0 0 24 18">
      <Defs>
        <SvgLinearGradient id="crownGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#ffe9a8" />
          <Stop offset="0.5" stopColor="#f7c948" />
          <Stop offset="1" stopColor="#d99a1c" />
        </SvgLinearGradient>
      </Defs>
      <Path
        d="M2 16 L1 6 L6.5 10.2 L12 2 L17.5 10.2 L23 6 L22 16 Z"
        fill="url(#crownGrad)"
        stroke="#a9720a"
        strokeWidth={0.6}
        strokeLinejoin="round"
      />
      <Circle cx="1" cy="5" r="2" fill="url(#crownGrad)" stroke="#a9720a" strokeWidth={0.6} />
      <Circle cx="12" cy="1.6" r="2.1" fill="url(#crownGrad)" stroke="#a9720a" strokeWidth={0.6} />
      <Circle cx="23" cy="5" r="2" fill="url(#crownGrad)" stroke="#a9720a" strokeWidth={0.6} />
    </Svg>
  );
}

// ── Аватар ────────────────────────────────────────────────────────────
function Avatar({ entry, size }: { entry: CategoryEntry; size: number }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: entry.avatarColor ?? "#6366f1",
      overflow: "hidden", justifyContent: "center", alignItems: "center",
    }}>
      {entry.avatarUrl
        ? <Image source={{ uri: entry.avatarUrl }} style={{ width: size, height: size }} />
        : entry.avatarEmoji
          // Эмодзи аватара выбирает сам ученик — это его выбор, не наша иконка.
          ? <Text style={{ fontSize: size * 0.44 }}>{entry.avatarEmoji}</Text>
          // Дефолт без эмодзи: буква ника в фирменной плашке.
          : <Text style={{ fontSize: size * 0.42, fontWeight: "900", color: "#fff" }}>{initial(entry.username)}</Text>
      }
    </View>
  );
}

/**
 * Тумба пьедестала.
 *
 * Собрана из четырёх слоёв, как настоящая:
 *   • верхняя ПЛОЩАДКА — светлая полоса, на которую «встаёт» участник. Именно
 *     она даёт ощущение горизонтальной поверхности, а не плоской наклейки;
 *   • тень под площадкой — тонкая тёмная линия, отделяющая верх от передней
 *     грани;
 *   • передняя ГРАНЬ в металле места, с бликом слева и затемнением справа:
 *     свет на экране падает сверху-слева, и фаски это повторяют;
 *   • ТАБЛИЧКА с номером — утопленная плашка со светлым верхним контуром,
 *     будто выгравирована в камне.
 *
 * Ступени стоят на нижней кромке шапки — на «полу»: paddingBottom у контейнера
 * подиума нет намеренно, иначе тумбы висели бы в воздухе.
 */
function Step({ rank, dim }: { rank: number; dim?: boolean }) {
  const metal = PLACE_METALS[rank - 1]!;
  const height = STEP_HEIGHT[rank - 1]!;

  // Свободное место: тумба есть, но она «нежилая» — приглушённое стекло.
  if (dim) {
    return (
      <View style={{ width: "100%", height }}>
        <View style={{
          height: PLATE_H,
          borderTopLeftRadius: 12, borderTopRightRadius: 12,
          backgroundColor: "rgba(255,255,255,0.12)",
          borderWidth: 1, borderBottomWidth: 0, borderColor: "rgba(255,255,255,0.16)",
        }} />
        <View style={{
          flex: 1,
          backgroundColor: "rgba(255,255,255,0.05)",
          borderWidth: 1, borderTopWidth: 0, borderBottomWidth: 0,
          borderColor: "rgba(255,255,255,0.12)",
          alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ fontSize: 15, fontWeight: "900", color: "rgba(255,255,255,0.26)" }}>
            {rank}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ width: "100%", height }}>
      {/* ── Верхняя площадка ── */}
      <LinearGradient
        colors={metal.plate as unknown as string[]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{
          height: PLATE_H,
          borderTopLeftRadius: 12, borderTopRightRadius: 12,
        }}
      />
      {/* Тень под площадкой: отделяет горизонталь от вертикали. */}
      <View style={{ height: 2, backgroundColor: metal.dark, opacity: 0.55 }} />

      {/* ── Передняя грань ── */}
      <LinearGradient
        colors={metal.gradient as unknown as string[]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ flex: 1, overflow: "hidden" }}
      >
        {/* Фаска слева: свет падает сверху-слева. */}
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(255,255,255,0.42)", "rgba(255,255,255,0)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14 }}
        />
        {/* Фаска справа: там тень. */}
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.3)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 16 }}
        />
        {/* Блик по верхней трети грани: полированный камень. */}
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(255,255,255,0.28)", "rgba(255,255,255,0)"]}
          style={{ position: "absolute", left: 0, right: 0, top: 0, height: "38%" }}
        />

        {/* ── Табличка с номером ──
            Утоплена в грань: тёмная подложка, светлая линия сверху и цифра с
            тенью. Ровно так выглядит гравировка на настоящем постаменте. */}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <View style={{
            minWidth: rank === 1 ? 40 : 32,
            paddingHorizontal: 9,
            paddingVertical: rank === 1 ? 5 : 3,
            borderRadius: 9,
            backgroundColor: "rgba(0,0,0,0.22)",
            borderTopWidth: 1.5, borderTopColor: "rgba(255,255,255,0.4)",
            alignItems: "center", justifyContent: "center",
          }}>
            <Text style={{
              fontSize: rank === 1 ? 21 : 17,
              fontWeight: "900",
              color: "#ffffff",
              fontVariant: ["tabular-nums"],
              textShadowColor: "rgba(0,0,0,0.45)",
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 2,
            }}>
              {rank}
            </Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

// ── Место на подиуме ──────────────────────────────────────────────────
function PodiumCard({
  entry, rank, isCenter, activeCat, isMe, onPress,
}: {
  entry: CategoryEntry | undefined;
  rank: number;
  isCenter: boolean;
  activeCat: typeof CATEGORIES[0];
  isMe: boolean;
  onPress: () => void;
}) {
  // Крупнее прежнего: тройка лидеров — главное на экране, а не подпись к нему.
  const avatarSize = isCenter ? 94 : 74;
  const placeColor = PLACE_COLORS[rank - 1];
  const placeMetal = PLACE_METALS[rank - 1]!;

  // Победитель слегка покачивается: он на сцене, и это видно.
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (rank !== 1 || !entry) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(float, {
        toValue: 1, duration: 1900,
        easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER,
      }),
      Animated.timing(float, {
        toValue: 0, duration: 1700,
        easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER,
      }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [rank, entry, float]);

  // ── Свободное место ──
  // Раньше это был пунктирный круг с замком и подпись «свободно» — рядом с
  // единственным участником выглядело как два провала по бокам. Теперь это
  // приглашение: силуэт человека и подпись «место ждёт».
  if (!entry) {
    return (
      <View style={{ flex: isCenter ? 1.16 : 1, alignItems: "center" }}>
        <View style={{ alignItems: "center", marginBottom: 10 }}>
          <View style={{
            width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2,
            backgroundColor: "rgba(255,255,255,0.09)",
            borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)",
            justifyContent: "center", alignItems: "center",
          }}>
            <Glyph name="user" size={Math.round(avatarSize * 0.42)} color="rgba(255,255,255,0.35)" />
          </View>
          <Text style={{
            marginTop: 10, fontSize: 11.5, fontWeight: "700",
            color: "rgba(255,255,255,0.42)",
          }}>
            место ждёт
          </Text>
        </View>
        <Step rank={rank} dim />
      </View>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={isMe ? 1 : 0.75}
      onPress={isMe ? undefined : onPress}
      style={{ flex: isCenter ? 1.16 : 1, alignItems: "center" }}
    >
      <Animated.View style={{
        alignItems: "center", marginBottom: 10,
        transform: rank === 1
          ? [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }]
          : [],
      }}>
        {/* Корона рисуется в потоке над аватаром, а не absolute сверху:
            абсолютная позиция вылезала за край шапки и наезжала на
            переключатель категорий. */}
        <View style={{ height: rank === 1 ? 30 : 0, justifyContent: "flex-end" }}>
          {rank === 1 && <Crown size={40} />}
        </View>

        <View style={{
          marginTop: rank === 1 ? -2 : 0,
          borderRadius: (avatarSize + 8) / 2,
          shadowColor: placeColor, shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.85, shadowRadius: 18, elevation: 12,
          ...(Platform.OS === "web"
            ? { boxShadow: `0 0 24px 4px ${placeColor}a0` } as any
            : {}),
        }}>
          <LinearGradient
            colors={placeMetal.gradient as unknown as string[]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{
              width: avatarSize + 8, height: avatarSize + 8, borderRadius: (avatarSize + 8) / 2,
              padding: 4, justifyContent: "center", alignItems: "center",
            }}
          >
            <Avatar entry={entry} size={avatarSize} />
          </LinearGradient>
        </View>

        {/* Номер места шильдом на стыке аватара и подписи. */}
        <LinearGradient
          colors={placeMetal.gradient as unknown as string[]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={{
            marginTop: -15,
            width: 30, height: 30, borderRadius: 15,
            borderWidth: 2.5, borderColor: "#fff",
            justifyContent: "center", alignItems: "center",
          }}
        >
          <Text style={{
            fontSize: 13.5, fontWeight: "900", color: "#fff",
            textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1,
          }}>
            {rank}
          </Text>
        </LinearGradient>

        <Text
          numberOfLines={1}
          style={{
            marginTop: 8, fontSize: isCenter ? 15.5 : 14,
            fontWeight: "800", color: "#fff",
            maxWidth: isCenter ? 120 : 100, textAlign: "center",
          }}
        >
          {entry.username}{isMe ? " (Я)" : ""}
        </Text>
        <Text style={{
          marginTop: 2, fontSize: isCenter ? 13.5 : 12.5, fontWeight: "800",
          color: "rgba(255,255,255,0.85)", fontVariant: ["tabular-nums"],
        }}>
          {activeCat.formatValue(entry.value)}
        </Text>
      </Animated.View>

      <Step rank={rank} />
    </TouchableOpacity>
  );
}

/**
 * Переключатель-сегменты с гранью — тот же, что в листе друзей и календаре.
 * Активный сегмент светлый и отбрасывает тень: понятно, что именно нажато,
 * даже боковым зрением.
 */
function Segments<T extends string>({
  options, value, onChange,
}: {
  options: { key: T; label: string; icon?: GlyphName }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <View style={{ marginHorizontal: 18, paddingBottom: 4 }}>
      <View style={{
        position: "absolute", left: 0, right: 0, top: 4, bottom: 0,
        borderRadius: radii.lg, backgroundColor: "rgba(23,8,56,0.42)",
      }} />
      <View style={{
        flexDirection: "row",
        backgroundColor: "rgba(255,255,255,0.14)",
        borderWidth: 1, borderColor: "rgba(255,255,255,0.22)",
        borderRadius: radii.lg,
        padding: 4,
        gap: 4,
      }}>
        {options.map((opt) => {
          const active = opt.key === value;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => onChange(opt.key)}
              activeOpacity={0.8}
              style={{
                flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6,
                paddingVertical: 9, borderRadius: radii.md,
                backgroundColor: active ? "#fff" : "transparent",
                ...(active ? {
                  shadowColor: "#2e1065",
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.35,
                  shadowRadius: 8,
                  elevation: 4,
                } : {}),
              }}
            >
              {opt.icon && <Glyph name={opt.icon} size={13} color={active ? "#6d28d9" : "rgba(255,255,255,0.78)"} />}
              <Text style={{ fontSize: 12.5, fontWeight: active ? "800" : "700", color: active ? "#6d28d9" : "rgba(255,255,255,0.78)" }}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function LeaderboardScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();

  const [scope, setScope] = useState<Scope>("all");
  const [activeKey, setActiveKey] = useState<CategoryKey>("points");
  const [data, setData] = useState<CategoriesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Свёрнутый список: показываем первую десятку и своё окружение.
  const [showAll, setShowAll] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * silent — фоновое обновление раз в минуту: без спиннера, иначе подиум
   * мигал бы у пользователя под руками.
   */
  const load = useCallback(async (s: Scope, mode: "initial" | "refresh" | "silent" = "initial") => {
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    try {
      const token = await authStorage.getItem("auth_token");
      const res = await fetch(`${BASE_URL}/api/leaderboard/categories?scope=${s}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData(await res.json());
    } catch { /* silent */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(scope, "initial");
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => load(scope, "silent"), 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [scope, load]);

  // Сворачивание сбрасывается при смене среза или категории: в новом списке
  // своё место другое, и раскрытое состояние прошлого уже не имеет смысла.
  useEffect(() => { setShowAll(false); }, [scope, activeKey]);

  const activeCat = CATEGORIES.find(c => c.key === activeKey)!;
  const entries = data?.[activeKey] ?? [];
  const myEntry = entries.find(e => e.userId === user?.id);

  const top3 = [
    entries.find(e => e.rank === 1),
    entries.find(e => e.rank === 2),
    entries.find(e => e.rank === 3),
  ];
  const rest = entries.filter(e => e.rank > 3);

  /**
   * Отставание от участника выше по списку.
   *
   * Именно от ближайшего соседа, а не от лидера: до первого места новичку
   * идти слишком далеко, чтобы это мотивировало, а «отстаёшь на 40 очков»
   * от соседа — обозримая цель на пару заданий.
   */
  const gapToAbove = (entry: CategoryEntry): number | null => {
    const above = entries.find((e) => e.rank === entry.rank - 1);
    if (!above) return null;
    const diff = above.value - entry.value;
    return diff > 0 ? diff : null;
  };

  const myGap = myEntry ? gapToAbove(myEntry) : null;
  /** Первое место имеет смысл праздновать, только если есть с кем соревноваться. */
  const isLonely = entries.length <= 1;

  /**
   * Строки списка.
   *
   * Длинный класс сворачивается: первая десятка, разрыв «ещё N участников» и
   * своё окружение (сосед сверху, ты, сосед снизу). Раньше на 14-м месте
   * приходилось прокручивать весь список, чтобы найти себя.
   */
  const rows: Row[] = React.useMemo(() => {
    const all: Row[] = rest.map(entry => ({ kind: "entry" as const, entry }));
    if (showAll || rest.length <= VISIBLE_HEAD + 3) return all;

    const head = all.slice(0, VISIBLE_HEAD);
    const tailStart = VISIBLE_HEAD;

    // Своё место внутри показанной части — сворачивать нечего сверх хвоста.
    if (!myEntry || myEntry.rank <= 3 + VISIBLE_HEAD) {
      return [...head, { kind: "more", count: rest.length - VISIBLE_HEAD }];
    }

    const around = rest.filter(e => Math.abs(e.rank - myEntry.rank) <= 1 && e.rank > 3 + VISIBLE_HEAD);
    const firstAroundIdx = rest.findIndex(e => e.userId === around[0]?.userId);
    const skipped = Math.max(0, firstAroundIdx - tailStart);

    return [
      ...head,
      ...(skipped > 0 ? [{ kind: "gap" as const, count: skipped }] : []),
      ...around.map(entry => ({ kind: "entry" as const, entry })),
      { kind: "more" as const, count: rest.length - VISIBLE_HEAD - around.length - skipped },
    ].filter(r => !(r.kind === "more" && r.count <= 0));
  }, [rest, showAll, myEntry]);

  const renderRow = ({ item }: { item: Row }) => {
    // ── Разрыв: сколько участников пропущено ──
    if (item.kind === "gap") {
      return (
        <View style={{
          flexDirection: "row", alignItems: "center", gap: 9,
          marginHorizontal: 22, marginTop: 4, marginBottom: 10,
        }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          <Text style={{ fontSize: 10.5, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.4 }}>
            ещё {item.count} {pluralRu(item.count, "участник", "участника", "участников")}
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        </View>
      );
    }

    // ── Кнопка «показать всех»: тоже клавиша с гранью ──
    if (item.kind === "more") {
      return (
        <ChunkyTap
          color={colors.primary + "33"}
          edge={4}
          onPress={() => setShowAll(true)}
          style={{ marginHorizontal: 20, marginTop: 2, marginBottom: 10 }}
          accessibilityLabel="Показать всех участников"
        >
          <View style={{
            paddingVertical: 12, borderRadius: radii.md,
            backgroundColor: colors.primary + "12",
            borderWidth: 1, borderColor: colors.primary + "2e",
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
          }}>
            <Text style={{ fontSize: 13, fontWeight: "800", color: colors.primary }}>
              Показать всех · ещё {item.count}
            </Text>
            <View style={{ transform: [{ rotate: "90deg" }] }}>
              <Glyph name="chevron" size={14} color={colors.primary} />
            </View>
          </View>
        </ChunkyTap>
      );
    }

    const entry = item.entry;
    const isMe = entry.userId === user?.id;
    const gap = gapToAbove(entry);

    const body = (
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 12,
        paddingVertical: 11, paddingHorizontal: 12,
        borderRadius: radii.md,
        backgroundColor: isMe ? activeCat.color + "10" : colors.card,
        borderWidth: isMe ? 1.5 : 1,
        borderColor: isMe ? activeCat.color + "55" : colors.border,
      }}>
        {/* Место в круглом шильде: цифра как объект, а не текст в строке. */}
        <View style={{
          width: 30, height: 30, borderRadius: 15,
          backgroundColor: isMe ? activeCat.color : "rgba(99,102,241,0.13)",
          alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{
            fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"],
            color: isMe ? "#fff" : accents.violetDeep,
          }}>
            {entry.rank}
          </Text>
        </View>

        <Avatar entry={entry} size={40} />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ fontSize: 15, fontWeight: isMe ? "800" : "700", color: isMe ? activeCat.color : colors.foreground }}
            numberOfLines={1}
          >
            {(user?.role === "teacher" || user?.role === "admin") && (entry.name || entry.surname)
              ? `${entry.username} (${[entry.name, entry.surname].filter(Boolean).join(" ")})`
              : entry.username}{isMe ? " (Я)" : ""}
          </Text>
          {/* Отставание от соседа сверху: превращает таблицу в дистанцию. */}
          {gap !== null && (
            <Text style={{ fontSize: 11.5, color: colors.mutedForeground, marginTop: 2, fontVariant: ["tabular-nums"] }}>
              {isMe ? "отстаёшь" : "отстаёт"} на {activeCat.formatGap(gap)}
            </Text>
          )}
        </View>

        <Text style={{
          fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"],
          color: isMe ? activeCat.color : colors.foreground,
        }}>
          {activeCat.formatValue(entry.value)}
        </Text>
      </View>
    );

    const edgeColor = isMe ? activeCat.color + "4d" : EDGE_LIGHT;

    // Своя строка не проседает: открывать в ней нечего. Грань при этом есть —
    // иначе она выглядела бы вдавленной среди соседей.
    return isMe ? (
      <Chunky color={edgeColor} style={{ marginBottom: 8, marginHorizontal: 20 }}>
        {body}
      </Chunky>
    ) : (
      <ChunkyTap
        color={edgeColor}
        style={{ marginBottom: 8, marginHorizontal: 20 }}
        onPress={() => router.push(`/(main)/friend/${entry.userId}` as any)}
        accessibilityLabel={`Открыть профиль: ${entry.username}`}
      >
        {body}
      </ChunkyTap>
    );
  };

  const ListHeader = (
    <>
      {/* ── Шапка-герой ──
          Градиент бренда, поверх него живой фон подиума: экран должен читаться
          как часть приложения, а не как отдельная тёмная заставка. */}
      <LinearGradient
        colors={["#2e1065", "#5b21b6", "#7c3aed"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          borderBottomLeftRadius: radii.xl,
          borderBottomRightRadius: radii.xl,
          overflow: "hidden",
        }}
      >
        {/* Живой свет сцены: лучи, ореол и искры. Нажатия не ловит. */}
        <PodiumGlow width={screenW} height={440} />

        {/* ── Заголовок и своё место ──
            Чип справа — единственное место, где написана своя дистанция, и
            единственное светлое пятно в шапке: на градиенте стеклянная плашка
            почти сливалась с фоном. */}
        <View style={{ paddingHorizontal: 18, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: "900", letterSpacing: -0.6, color: "#fff" }}>Рейтинг</Text>

          {myEntry && !isLonely ? (
            <Chunky
              color={EDGE_ON_HERO}
              edge={4}
              radius={radii.pill}
              style={{ marginLeft: "auto" }}
            >
              <View style={{
                flexDirection: "row", alignItems: "center", gap: 8,
                paddingVertical: 7, paddingLeft: 7, paddingRight: 14, borderRadius: radii.pill,
                backgroundColor: "#ffffff",
                borderWidth: 1, borderColor: "rgba(255,255,255,0.9)",
                shadowColor: "#2e1065", shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
              }}>
                {myEntry.rank <= 3 ? (
                  <LinearGradient
                    colors={[accents.gold, accents.amber]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "900", color: "#42200a", fontVariant: ["tabular-nums"] }}>
                      {myEntry.rank}
                    </Text>
                  </LinearGradient>
                ) : (
                  <View style={{
                    width: 26, height: 26, borderRadius: 13,
                    backgroundColor: accents.violetDeep,
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: "900", color: "#fff", fontVariant: ["tabular-nums"] }}>
                      {myEntry.rank}
                    </Text>
                  </View>
                )}
                <View>
                  <Text style={{ fontSize: 11.5, fontWeight: "900", color: accents.violetDeep }}>Твоё место</Text>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: "#7c6db8", marginTop: 2 }}>
                    {myGap !== null ? `до ${myEntry.rank - 1}-го ${activeCat.formatGap(myGap)}` : "выше никого нет"}
                  </Text>
                </View>
              </View>
            </Chunky>
          ) : (
            <Text style={{
              marginLeft: "auto", fontSize: 11.5, fontWeight: "600",
              color: "rgba(255,255,255,0.62)", maxWidth: 150, textAlign: "right",
            }}>
              {activeCat.subtitle}
            </Text>
          )}
        </View>

        {/* Срез: все ученики / друзья */}
        <View style={{ marginBottom: 9 }}>
          <Segments options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
        </View>

        {/* Категория */}
        <Segments
          options={CATEGORIES.map(c => ({ key: c.key, label: c.label, icon: c.icon }))}
          value={activeKey}
          onChange={setActiveKey}
        />

        {/* ── Подиум ──
            Тумбы упираются в нижнюю кромку шапки: paddingBottom здесь нет
            намеренно, иначе пьедестал висел бы в воздухе. */}
        {loading ? (
          <View style={{ height: 240, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color="rgba(255,255,255,0.7)" size="large" />
          </View>
        ) : entries.length > 0 ? (
          <View style={{
            flexDirection: "row", alignItems: "flex-end", gap: 6,
            paddingHorizontal: 12, paddingTop: 22,
          }}>
            <PodiumCard
              entry={top3[1]}
              rank={2}
              isCenter={false}
              activeCat={activeCat}
              isMe={top3[1]?.userId === user?.id}
              onPress={() => top3[1] && router.push(`/(main)/friend/${top3[1].userId}` as any)}
            />
            <PodiumCard
              entry={top3[0]}
              rank={1}
              isCenter={true}
              activeCat={activeCat}
              isMe={top3[0]?.userId === user?.id}
              onPress={() => top3[0] && router.push(`/(main)/friend/${top3[0].userId}` as any)}
            />
            <PodiumCard
              entry={top3[2]}
              rank={3}
              isCenter={false}
              activeCat={activeCat}
              isMe={top3[2]?.userId === user?.id}
              onPress={() => top3[2] && router.push(`/(main)/friend/${top3[2].userId}` as any)}
            />
          </View>
        ) : (
          // Пустой рейтинг: подиум не рисуем вообще. Три пустых постамента
          // выглядели заброшенной стройкой; объяснение уходит в блок ниже.
          <View style={{ height: 20 }} />
        )}
      </LinearGradient>

      {/* Первый в рейтинге. Если участник вообще один — это не победа, а
         пустой класс: честнее позвать других, чем поздравлять с отрывом
         от никого. */}
      {!loading && myEntry && myEntry.rank === 1 && (
        <Chunky
          color={isLonely ? colors.primary + "3d" : accents.gold + "66"}
          style={{ marginHorizontal: 20, marginTop: 16, marginBottom: 2 }}
        >
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 11,
            paddingVertical: 12, paddingHorizontal: 13, borderRadius: radii.md,
            backgroundColor: isLonely ? colors.primary + "12" : accents.gold + "1f",
            borderWidth: 1.5, borderColor: isLonely ? colors.primary + "33" : accents.gold + "55",
          }}>
            <LinearGradient
              colors={isLonely ? (gradients.action as unknown as string[]) : [accents.gold, accents.amber]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={{ width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" }}
            >
              <Glyph name={isLonely ? "users" : "crown"} size={17} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.foreground }}>
                {isLonely ? "Пока ты один в рейтинге" : "Ты на первом месте"}
              </Text>
              <Text style={{ fontSize: 11.5, fontWeight: "600", color: colors.mutedForeground, marginTop: 2 }}>
                {isLonely ? "Добавь друзей — будет с кем соревноваться" : "Держи отрыв: тебя догоняют"}
              </Text>
            </View>
            {isLonely && (
              <Pressable
                onPress={() => router.push("/(main)/profile" as any)}
                style={({ pressed }) => ({
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.sm,
                  backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ fontSize: 12, fontWeight: "800", color: "#fff" }}>Добавить</Text>
              </Pressable>
            )}
          </View>
        </Chunky>
      )}

      {/* Метка секции */}
      {!loading && rows.length > 0 && (
        <SectionLabel style={{ marginHorizontal: 20, marginTop: 16, marginBottom: 8 }}>
          Участники · {entries.length}
        </SectionLabel>
      )}

      {/* ── Пусто ──
          Раньше здесь была только надпись. Теперь у экрана есть выход: кнопка
          ведёт в профиль, где живёт добавление друзей по коду. */}
      {!loading && entries.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 36, paddingHorizontal: 34, gap: 11 }}>
          <LinearGradient
            colors={gradients.action as unknown as string[]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{
              width: 66, height: 66, borderRadius: 22,
              alignItems: "center", justifyContent: "center",
              shadowColor: colors.primary, shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.35, shadowRadius: 22, elevation: 8,
            }}
          >
            <Glyph name={scope === "friends" ? "users" : "trophy"} size={28} color="#fff" />
          </LinearGradient>

          <Text style={{ fontSize: 16.5, fontWeight: "900", color: colors.foreground, letterSpacing: -0.3, textAlign: "center" }}>
            {scope === "friends" ? "Соревноваться пока не с кем" : "Рейтинг пока пуст"}
          </Text>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.mutedForeground, textAlign: "center", lineHeight: 19 }}>
            {scope === "friends"
              ? "Добавь друзей по коду, и увидишь, кто из вас впереди по очкам, времени и заданиям."
              : "Как только ученики начнут выполнять задания, здесь появятся места."}
          </Text>

          {scope === "friends" && (
            <View style={{ alignSelf: "stretch", marginTop: 6 }}>
              <ChunkyButton
                label="Добавить друзей"
                icon="userPlus"
                chevron
                onPress={() => router.push("/(main)/profile" as any)}
              />
            </View>
          )}
        </View>
      )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={rows}
        keyExtractor={(r, i) => r.kind === "entry" ? `u${r.entry.userId}` : `${r.kind}-${i}`}
        renderItem={renderRow}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: screenBottom(insets) }}
        showsVerticalScrollIndicator={false}
        // Ручное обновление: раньше экран умел только ждать минуту до
        // автообновления, и после сданного задания рейтинг выглядел застывшим.
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(scope, "refresh")}
            tintColor={colors.primary}
          />
        }
      />
    </View>
  );
}
