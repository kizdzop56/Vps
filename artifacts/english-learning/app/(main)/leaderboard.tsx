// Экран «Рейтинг»: подиум с тройкой лидеров и список остальных участников.
// Три категории (очки, время, задания) и два среза (все ученики / друзья)
// приходят одним запросом /api/leaderboard/categories и обновляются раз в минуту.
//
// Эмодзи на экране не используются: иконки категорий — глифы из своего набора
// (components/ui/Glyph.tsx), значение очков пишется числом без звезды. Поле
// avatarEmoji остаётся пользовательским выбором и показывается как есть, но
// дефолтного эмодзи больше нет — вместо него первая буква ника.
//
// Оформление собрано из GameKit: плитки с цветной тенью, пилюли, метки секций.
//
// Рейтинг перестал быть просто списком:
//  • Рядом с каждым участником видно отставание от того, кто выше — «отстаёт на
//    40 очков» превращает таблицу в дистанцию, которую можно сократить.
//  • Своё место вынесено в шапку отдельным чипом. Это первое, что ищут на
//    экране, а раньше приходилось прокручивать список и искать подсветку.
//  • У подиума появились настоящие ступени: первое место физически выше.
//    Раньше разница задавалась отступами у аватара и читалась случайной.
//  • Блок «Моё место» заменён на «догоняешь»: он повторял номер, который уже
//    виден строкой ниже, вместо того чтобы назвать соперника и дистанцию.
//  • Длинный список сворачивается: первая десятка, разрыв «ещё N участников»
//    и своя строка с соседями. Раньше на 14-м месте себя приходилось искать
//    прокруткой через весь класс.
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, FlatList, ActivityIndicator, Platform,
  TouchableOpacity, Pressable, Image, useWindowDimensions, RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "expo-router";
import authStorage from "@/utils/authStorage";
import DarkVeil from "@/components/DarkVeil";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { Tile, ChunkyButton, SectionLabel } from "@/components/ui/GameKit";
import { accents, gradients, radii } from "@/constants/theme";

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

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

// Metallic place colors: gold, silver, bronze — rendered as real metal gradients
const PLACE_METALS = [
  { gradient: ["#fff6d0", "#f3cf6a", "#c9971f", "#8a6511"] as const, solid: "#d4af37" }, // gold
  { gradient: ["#fbfbfc", "#d8dce1", "#a3aab3", "#6f7680"] as const, solid: "#b0b8bf" }, // silver
  { gradient: ["#f0c497", "#c9803f", "#9a5a24", "#5e3612"] as const, solid: "#c17a3e" }, // bronze
];
const PLACE_COLORS = PLACE_METALS.map(m => m.solid);

/** Высота ступени под каждым местом: 1-е выше 2-го, 2-е выше 3-го. */
const STEP_HEIGHT = [56, 38, 26];

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

// ── Custom crown icon (flat, gold gradient) ───────────────────────────
function Crown({ size = 34 }: { size?: number }) {
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

// ── Avatar component ──────────────────────────────────────────────────
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
 * Ступень подиума под карточкой места.
 *
 * Раньше высоту изображали отступами вокруг аватара: второе и третье место
 * просто опускались ниже, и пьедестал читался как случайный сдвиг. Настоящая
 * ступень объясняет иерархию мгновенно, даже если имена не прочитаны.
 */
function Step({ rank }: { rank: number }) {
  return (
    <View style={{
      width: "100%", height: STEP_HEIGHT[rank - 1],
      borderTopLeftRadius: 14, borderTopRightRadius: 14,
      backgroundColor: "rgba(255,255,255,0.14)",
      borderWidth: 1, borderBottomWidth: 0, borderColor: "rgba(255,255,255,0.2)",
      alignItems: "center", justifyContent: "center",
    }}>
      <Text style={{ fontSize: 15, fontWeight: "900", color: "rgba(255,255,255,0.5)" }}>{rank}</Text>
    </View>
  );
}

// ── Podium card (top 3) ───────────────────────────────────────────────
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
  const avatarSize = isCenter ? 78 : 64;
  const placeColor = PLACE_COLORS[rank - 1];
  const placeMetal = PLACE_METALS[rank - 1];

  if (!entry) {
    return (
      <View style={{ alignItems: "center", flex: isCenter ? 1.18 : 1 }}>
        <View style={{ alignItems: "center", marginBottom: 10 }}>
          <View style={{
            width: avatarSize + 6, height: avatarSize + 6, borderRadius: (avatarSize + 6) / 2,
            borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", borderStyle: "dashed",
            justifyContent: "center", alignItems: "center",
          }}>
            {/* Свободное место — замок, а не знак вопроса: место можно занять. */}
            <Glyph name="lock" size={Math.round(avatarSize * 0.3)} color="rgba(255,255,255,0.45)" />
          </View>
          <Text style={{ marginTop: 10, fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.45)" }}>
            свободно
          </Text>
        </View>
        <Step rank={rank} />
      </View>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={isMe ? 1 : 0.75}
      onPress={isMe ? undefined : onPress}
      style={{ alignItems: "center", flex: isCenter ? 1.18 : 1 }}
    >
      <View style={{ alignItems: "center", marginBottom: 10 }}>
        <View style={{
          borderRadius: (avatarSize + 6) / 2 + 4,
          shadowColor: placeColor, shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.9, shadowRadius: 18, elevation: 14,
          ...(Platform.OS === "web"
            ? { boxShadow: `0 0 22px 4px ${placeColor}b0, 0 0 6px 1px ${placeColor}` } as any
            : {}),
        }}>
          <LinearGradient
            colors={placeMetal.gradient}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{ width: avatarSize + 6, height: avatarSize + 6, borderRadius: (avatarSize + 6) / 2, padding: 4, justifyContent: "center", alignItems: "center" }}
          >
            <Avatar entry={entry} size={avatarSize} />
          </LinearGradient>
        </View>

        {rank === 1 && (
          <View style={{
            position: "absolute", top: -24, left: 0, right: 0,
            alignItems: "center", zIndex: 5,
          }}>
            <Crown size={36} />
          </View>
        )}

        {/* Place number badge */}
        <LinearGradient
          colors={placeMetal.gradient}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={{
            marginTop: -14,
            width: 28, height: 28, borderRadius: 14,
            borderWidth: 2, borderColor: "#fff",
            justifyContent: "center", alignItems: "center",
            shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
          }}
        >
          <Text style={{
            fontSize: 13, fontWeight: "900", color: "#fff",
            textShadowColor: "rgba(0,0,0,0.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1,
          }}>
            {rank}
          </Text>
        </LinearGradient>

        <Text
          numberOfLines={1}
          style={{
            marginTop: 9, fontSize: isCenter ? 15 : 14,
            fontWeight: "800", color: "#fff",
            maxWidth: 100, textAlign: "center",
          }}
        >
          {entry.username}{isMe ? " (Я)" : ""}
        </Text>
        <Text style={{ marginTop: 3, fontSize: 12.5, color: "rgba(255,255,255,0.8)", fontWeight: "800", fontVariant: ["tabular-nums"] }}>
          {activeCat.formatValue(entry.value)}
        </Text>
      </View>

      <Step rank={rank} />
    </TouchableOpacity>
  );
}

/**
 * Переключатель-сегменты. Активный сегмент приподнят и отбрасывает тень —
 * это тот же физический приём, что у кнопок: понятно, что именно нажато,
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
    <View style={{
      marginHorizontal: 18,
      flexDirection: "row",
      backgroundColor: "rgba(255,255,255,0.13)",
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
            {opt.icon && <Glyph name={opt.icon} size={13} color={active ? "#6d28d9" : "rgba(255,255,255,0.74)"} />}
            <Text style={{ fontSize: 12.5, fontWeight: active ? "800" : "700", color: active ? "#6d28d9" : "rgba(255,255,255,0.74)" }}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function LeaderboardScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();

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
  /** Кого именно догоняем: сосед на одну строку выше. */
  const rival = myEntry ? entries.find(e => e.rank === myEntry.rank - 1) : undefined;

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

    // ── Кнопка «показать всех» ──
    if (item.kind === "more") {
      return (
        <Pressable
          onPress={() => setShowAll(true)}
          style={({ pressed }) => ({
            marginHorizontal: 20, marginTop: 2, marginBottom: 10,
            paddingVertical: 12, borderRadius: radii.md,
            backgroundColor: colors.primary + "12",
            borderWidth: 1, borderColor: colors.primary + "2e",
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontSize: 13, fontWeight: "800", color: colors.primary }}>
            Показать всех · ещё {item.count}
          </Text>
          <View style={{ transform: [{ rotate: "90deg" }] }}>
            <Glyph name="chevron" size={14} color={colors.primary} />
          </View>
        </Pressable>
      );
    }

    const entry = item.entry;
    const isMe = entry.userId === user?.id;
    const gap = gapToAbove(entry);

    return (
      <Tile
        onPress={isMe ? undefined : () => router.push(`/(main)/friend/${entry.userId}` as any)}
        glow={isMe ? activeCat.color : accents.violetDeep}
        style={{
          flexDirection: "row", alignItems: "center", gap: 12,
          paddingVertical: 11, paddingHorizontal: 12,
          marginBottom: 8, marginHorizontal: 20,
          ...(isMe ? { borderWidth: 1.5, borderColor: activeCat.color + "55", backgroundColor: activeCat.color + "10" } : {}),
        }}
      >
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

        <View style={{ flex: 1 }}>
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
      </Tile>
    );
  };

  const ListHeader = (
    <>
      {/* ── Шапка-герой ── */}
      <LinearGradient
        colors={["#2e1065", "#5b21b6", "#7c3aed"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), paddingBottom: 0, overflow: "hidden" }}
      >
        {/* Animated veil background (web) — static gradient stays underneath as fallback */}
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}>
          <DarkVeil scanlineIntensity={0.03} speed={1} scanlineFrequency={1.7} warpAmount={1.1} />
        </View>

        {/* ── Заголовок и своё место ──
            Раньше под заголовком стояла подпись категории, а собственное место
            приходилось искать прокруткой. Теперь номер и дистанция до
            следующего места стоят прямо в шапке. */}
        <View style={{ paddingHorizontal: 18, paddingBottom: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ fontSize: 24, fontWeight: "900", letterSpacing: -0.6, color: "#fff" }}>Рейтинг</Text>

          {myEntry ? (
            <View style={{
              marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8,
              paddingVertical: 7, paddingLeft: 7, paddingRight: 13, borderRadius: radii.pill,
              backgroundColor: "rgba(255,255,255,0.16)",
              borderWidth: 1, borderColor: "rgba(255,255,255,0.28)",
            }}>
              {/* Тройка призёров — золотой шильд, остальные — фиолетовый. */}
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
                  backgroundColor: "rgba(255,255,255,0.24)",
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Text style={{ fontSize: 12, fontWeight: "900", color: "#fff", fontVariant: ["tabular-nums"] }}>
                    {myEntry.rank}
                  </Text>
                </View>
              )}
              <View>
                <Text style={{ fontSize: 11.5, fontWeight: "800", color: "#fff" }}>Твоё место</Text>
                <Text style={{ fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
                  {myGap !== null ? `до ${myEntry.rank - 1}-го ${activeCat.formatGap(myGap)}` : "выше никого нет"}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: "600", color: "rgba(255,255,255,0.62)", maxWidth: 150, textAlign: "right" }}>
              {activeCat.subtitle}
            </Text>
          )}
        </View>

        {/* Срез: все ученики / друзья */}
        <View style={{ marginBottom: 10 }}>
          <Segments options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
        </View>

        {/* Категория */}
        <View style={{ marginBottom: 4 }}>
          <Segments
            options={CATEGORIES.map(c => ({ key: c.key, label: c.label, icon: c.icon }))}
            value={activeKey}
            onChange={setActiveKey}
          />
        </View>

        {/* ── Подиум ──
            Отступ сверху оставляет место короне: она висит на 24 пикселя выше
            центрального аватара и иначе наезжала бы на переключатель категорий. */}
        {loading ? (
          <View style={{ height: 190, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color="rgba(255,255,255,0.7)" size="large" />
          </View>
        ) : (
          <View style={{
            flexDirection: "row", alignItems: "flex-end", gap: 8,
            paddingHorizontal: 14, paddingTop: 34,
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
        )}

        {/* Волна: стык градиента со светлым фоном списка. */}
        <View style={{ marginBottom: -1 }}>
          <Svg width={width} height={44} viewBox={`0 0 ${width} 44`} preserveAspectRatio="none">
            <Path
              d={`M0,18 C ${width * 0.3},44 ${width * 0.62},-2 ${width},24 L ${width},44 L 0,44 Z`}
              fill={colors.background}
            />
          </Svg>
        </View>
      </LinearGradient>

      {/* ── Кого догоняешь ──
          Заменил блок «Моё место»: тот показывал номер, который уже виден в
          подсвеченной строке, вместо того чтобы назвать соперника и дистанцию. */}
      {!loading && myEntry && rival && myGap !== null && (
        <View style={{
          marginHorizontal: 20, marginTop: 14, marginBottom: 2,
          flexDirection: "row", alignItems: "center", gap: 11,
          paddingVertical: 12, paddingHorizontal: 13, borderRadius: radii.md,
          backgroundColor: activeCat.color + "14",
          borderWidth: 1.5, borderColor: activeCat.color + "3d",
        }}>
          <LinearGradient
            colors={[accents.magenta, "#a855f7"]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{
              width: 34, height: 34, borderRadius: 12,
              alignItems: "center", justifyContent: "center",
              shadowColor: accents.magenta, shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4, shadowRadius: 11, elevation: 4,
            }}
          >
            <Glyph name="trendUp" size={17} color="#fff" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.foreground }} numberOfLines={1}>
              Догоняешь {rival.username}
            </Text>
            <Text style={{ fontSize: 11.5, fontWeight: "600", color: colors.mutedForeground, marginTop: 2, fontVariant: ["tabular-nums"] }}>
              {activeCat.formatGap(myGap)} до {myEntry.rank - 1}-го места
            </Text>
          </View>
        </View>
      )}

      {/* Первый в рейтинге: догонять некого, но сказать об этом стоит. */}
      {!loading && myEntry && myEntry.rank === 1 && (
        <View style={{
          marginHorizontal: 20, marginTop: 14, marginBottom: 2,
          flexDirection: "row", alignItems: "center", gap: 11,
          paddingVertical: 12, paddingHorizontal: 13, borderRadius: radii.md,
          backgroundColor: accents.gold + "1f",
          borderWidth: 1.5, borderColor: accents.gold + "55",
        }}>
          <LinearGradient
            colors={[accents.gold, accents.amber]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{ width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" }}
          >
            <Glyph name="crown" size={17} color="#fff" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.foreground }}>Ты на первом месте</Text>
            <Text style={{ fontSize: 11.5, fontWeight: "600", color: colors.mutedForeground, marginTop: 2 }}>
              Держи отрыв: тебя догоняют
            </Text>
          </View>
        </View>
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
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
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
