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
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, FlatList, ActivityIndicator, Platform,
  TouchableOpacity, Image, useWindowDimensions,
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
import { Tile, SectionLabel } from "@/components/ui/GameKit";
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

const CATEGORIES: {
  key: CategoryKey;
  label: string;
  icon: GlyphName;
  color: string;
  formatValue: (v: number) => string;
  subtitle: string;
}[] = [
  { key: "points",      label: "Очки",    icon: "star",  color: "#a855f7", formatValue: (v) => `${v}`,                                                subtitle: "Рейтинг по очкам опыта" },
  { key: "time",        label: "Время",   icon: "clock", color: "#6366f1", formatValue: (v) => v >= 60 ? `${Math.floor(v/60)} ч ${v%60} м` : `${v} м`, subtitle: "Кто больше занимался" },
  { key: "assignments", label: "Задания", icon: "check", color: "#c026d3", formatValue: (v) => v > 0 ? `${v}%` : "—",                                 subtitle: "Средний процент по всем заданиям" },
];

const SCOPE_OPTIONS: { key: Scope; label: string }[] = [
  { key: "all",     label: "Все ученики" },
  { key: "friends", label: "Друзья" },
];

// Metallic place colors: gold, silver, bronze — rendered as real metal gradients
const PLACE_METALS = [
  { gradient: ["#fff6d0", "#f3cf6a", "#c9971f", "#8a6511"] as const, solid: "#d4af37" }, // gold
  { gradient: ["#fbfbfc", "#d8dce1", "#a3aab3", "#6f7680"] as const, solid: "#b0b8bf" }, // silver
  { gradient: ["#f0c497", "#c9803f", "#9a5a24", "#5e3612"] as const, solid: "#c17a3e" }, // bronze
];
const PLACE_COLORS = PLACE_METALS.map(m => m.solid);

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
  const avatarSize = isCenter ? 88 : 72;
  const placeColor = PLACE_COLORS[rank - 1];
  const placeMetal = PLACE_METALS[rank - 1];

  if (!entry) {
    return (
      <View style={{ alignItems: "center", flex: 1 }}>
        <View style={{
          width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2,
          backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 2,
          borderColor: "rgba(255,255,255,0.2)", borderStyle: "dashed",
          justifyContent: "center", alignItems: "center",
        }}>
          {/* Свободное место — замок, а не знак вопроса: место можно занять. */}
          <Glyph name="lock" size={Math.round(avatarSize * 0.3)} color="rgba(255,255,255,0.45)" />
        </View>
        <Text style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          {rank} место свободно
        </Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={isMe ? 1 : 0.75}
      onPress={isMe ? undefined : onPress}
      style={{ alignItems: "center", flex: 1 }}
    >
      {/* Avatar + place badge */}
      <View style={{
        alignItems: "center",
        marginBottom: isCenter ? 0 : 18,
        marginTop: isCenter ? 0 : 18,
      }}>
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
            position: "absolute", top: -26, left: 0, right: 0,
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
            marginTop: -15,
            width: 30, height: 30, borderRadius: 15,
            borderWidth: 2, borderColor: "#fff",
            justifyContent: "center", alignItems: "center",
            shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "900", color: "#fff", textShadowColor: "rgba(0,0,0,0.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 }}>{rank}</Text>
        </LinearGradient>
      </View>

      <Text
        numberOfLines={1}
        style={{
          marginTop: 12, fontSize: isCenter ? 19 : 17,
          fontWeight: "800", color: "#fff",
          maxWidth: 110, textAlign: "center",
        }}
      >
        {entry.username}{isMe ? " (Я)" : ""}
      </Text>
      <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", fontWeight: "700", fontVariant: ["tabular-nums"] }}>
        {activeCat.formatValue(entry.value)}
      </Text>
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
      marginHorizontal: 20,
      flexDirection: "row",
      backgroundColor: "rgba(255,255,255,0.12)",
      borderRadius: radii.lg,
      padding: 4,
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
              paddingVertical: 10, borderRadius: radii.md,
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
            {opt.icon && <Glyph name={opt.icon} size={14} color={active ? "#6d28d9" : "rgba(255,255,255,0.7)"} />}
            <Text style={{ fontSize: 13.5, fontWeight: active ? "800" : "700", color: active ? "#6d28d9" : "rgba(255,255,255,0.75)" }}>
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (s: Scope) => {
    setLoading(true);
    try {
      const token = await authStorage.getItem("auth_token");
      const res = await fetch(`${BASE_URL}/api/leaderboard/categories?scope=${s}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData(await res.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load(scope);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => load(scope), 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [scope, load]);

  const activeCat = CATEGORIES.find(c => c.key === activeKey)!;
  const entries = data?.[activeKey] ?? [];
  const myEntry = entries.find(e => e.userId === user?.id);

  const top3 = [
    entries.find(e => e.rank === 1),
    entries.find(e => e.rank === 2),
    entries.find(e => e.rank === 3),
  ];
  const rest = entries.filter(e => e.rank > 3);

  const renderItem = ({ item }: { item: CategoryEntry }) => {
    const isMe = item.userId === user?.id;

    return (
      <Tile
        onPress={isMe ? undefined : () => router.push(`/(main)/friend/${item.userId}` as any)}
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
            {item.rank}
          </Text>
        </View>

        <Avatar entry={item} size={40} />

        <Text
          style={{ flex: 1, fontSize: 15, fontWeight: "700", color: colors.foreground }}
          numberOfLines={1}
        >
          {(user?.role === "teacher" || user?.role === "admin") && (item.name || item.surname)
            ? `${item.username} (${[item.name, item.surname].filter(Boolean).join(" ")})`
            : item.username}{isMe ? " (Я)" : ""}
        </Text>
        <Text style={{
          fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"],
          color: isMe ? activeCat.color : colors.foreground,
        }}>
          {activeCat.formatValue(item.value)}
        </Text>
      </Tile>
    );
  };

  const ListHeader = (
    <>
      {/* ── Hero gradient section ── */}
      <LinearGradient
        colors={["#2e1065", "#5b21b6", "#7c3aed"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), paddingBottom: 0, overflow: "hidden" }}
      >
        {/* Animated veil background (web) — static gradient stays underneath as fallback */}
        <View
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}
        >
          <DarkVeil scanlineIntensity={0.03} speed={1} scanlineFrequency={1.7} warpAmount={1.1} />
        </View>

        {/* Title — centered at the top */}
        <View style={{ paddingHorizontal: 20, marginBottom: 16, alignItems: "center" }}>
          <Text style={{ fontSize: 28, fontWeight: "900", letterSpacing: -0.6, color: "#fff", textAlign: "center" }}>Рейтинг</Text>
          <Text style={{ fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.6)", marginTop: 3 }}>
            {activeCat.subtitle}
          </Text>
        </View>

        {/* Scope segmented control (full width) */}
        <View style={{ marginBottom: 12 }}>
          <Segments options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
        </View>

        {/* Category segmented control (full width) */}
        {/* Extra bottom margin lifts the categories away from the podium so the
            winner's crown (rendered at top: -26 above the center avatar) never
            overlaps the category chips. */}
        <View style={{ marginBottom: 34 }}>
          <Segments
            options={CATEGORIES.map(c => ({ key: c.key, label: c.label, icon: c.icon }))}
            value={activeKey}
            onChange={setActiveKey}
          />
        </View>

        {/* Podium — 2nd | 1st | 3rd */}
        {loading ? (
          <View style={{ height: 160, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator color="rgba(255,255,255,0.7)" size="large" />
          </View>
        ) : (
          <View style={{
            flexDirection: "row", alignItems: "flex-end",
            paddingHorizontal: 10, paddingBottom: 24, minHeight: 160,
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

        {/* Wave transition into the list background */}
        <View style={{ marginBottom: -1 }}>
          <Svg width={width} height={48} viewBox={`0 0 ${width} 48`} preserveAspectRatio="none">
            <Path
              d={`M0,20 C ${width * 0.3},48 ${width * 0.62},-2 ${width},26 L ${width},48 L 0,48 Z`}
              fill={colors.background}
            />
          </Svg>
        </View>
      </LinearGradient>

      {/* ── My position banner (if I'm outside top 3) ── */}
      {!loading && myEntry && myEntry.rank > 3 && (
        <Tile
          glow={activeCat.color}
          style={{
            marginHorizontal: 20, marginTop: 14, marginBottom: 4,
            backgroundColor: activeCat.color + "12",
            borderWidth: 1.5, borderColor: activeCat.color + "45",
            flexDirection: "row", alignItems: "center", gap: 12,
          }}
        >
          <LinearGradient
            colors={gradients.action as unknown as string[]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{ width: 38, height: 38, borderRadius: 19, justifyContent: "center", alignItems: "center" }}
          >
            <Text style={{ fontSize: 14, fontWeight: "900", color: "#fff", fontVariant: ["tabular-nums"] }}>{myEntry.rank}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 1 }}>Моё место</Text>
            <Text style={{ fontSize: 15, fontWeight: "800", color: activeCat.color }}>{user?.name}</Text>
          </View>
          <Text style={{ fontSize: 19, fontWeight: "900", color: activeCat.color, fontVariant: ["tabular-nums"] }}>
            {activeCat.formatValue(myEntry.value)}
          </Text>
        </Tile>
      )}

      {/* Section label */}
      {!loading && rest.length > 0 && (
        <SectionLabel style={{ marginHorizontal: 20, marginTop: 16, marginBottom: 8 }}>
          Участники · {entries.length}
        </SectionLabel>
      )}

      {!loading && entries.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 40, gap: 12 }}>
          <Glyph name="trophy" size={48} color={colors.mutedForeground} />
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>
            {scope === "friends" ? "Нет друзей в рейтинге" : "Пока никого нет"}
          </Text>
          {scope === "friends" && (
            <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", paddingHorizontal: 40 }}>
              Добавьте друзей через профиль другого ученика
            </Text>
          )}
        </View>
      )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={rest}
        keyExtractor={e => String(e.userId)}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
