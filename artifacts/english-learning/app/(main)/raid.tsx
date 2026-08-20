// ─────────────────────────────────────────────────────────────────────────────
// Вкладка «Рейд»: недельный босс на всё сообщество.
//
// Порядок экрана теперь разделён на ТРИ внутренние вкладки:
//   • Бой              — всё про текущего босса, цель дня и топ;
//   • Лавка усилений   — отдельный магазин бафов в стиле лавки колдуна;
//   • Прошлый рейд     — итог только прошлого события.
//
// Почему так лучше, чем одна длинная простыня. У боя, магазина и истории разный
// темп чтения: в бою нужен быстрый доступ к кнопке «Бить босса», в лавке —
// спокойный выбор и сравнение усилений, в прошлом рейде — постфактум разбор.
// Когда всё лежит в одном ScrollView, эти режимы мешают друг другу: ради покупки
// приходится пролистывать топ, ради истории — магазин, и наоборот.
//
// Цель дня остаётся только на вкладке боя: это действие «прямо сейчас», а не
// часть лавки или архива. Сам бой по-прежнему отдельный экран (raid/battle).
//
// ── Лавка усилений ──────────────────────────────────────────────────────────
// Это не просто «ещё один список бафов». Пользователь просил ощущение лавки
// старца-колдуна, поэтому здесь свой визуальный язык:
//   • тёмная подложка и витринные карточки-талисманы;
//   • у каждой покупки свой амулет/ингредиент, цена и легенда;
//   • сверху — прилавок «что уже лежит в сумке»;
//   • магазин не прячется за модалкой внизу, а живёт отдельной вкладкой и не
//     спорит за место с боссом и рейтингом.
//
// Подтверждение покупки осталось настоящим модальным окном по центру: оно не
// уезжает со скроллом и подходит и бою, и лавке одинаково.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, Pressable, ScrollView, Animated, Easing, Platform, ActivityIndicator,
  Modal as RNModal, type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { Coin } from "@/components/ui/Coin";
import { ChunkyButton, Pill, SectionLabel } from "@/components/ui/GameKit";
import { accents, radii, timing } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";
import { BossArt } from "@/components/raid/BossArt";
import { onRaidHit } from "@/utils/raidBus";
import {
  phaseAbout, phaseTitle, raid, tagTitle,
  type RaidBuff, type RaidPrevious, type RaidSnapshot,
} from "@/hooks/useRaid";

const NATIVE_DRIVER = Platform.OS !== "web";
const EDGE_LIGHT = "#c9bdf0";

type RaidTab = "battle" | "shop" | "previous";

/**
 * Сколько времени сервер копит одну единицу энергии.
 *
 * Держим её здесь же, рядом с UI, а не тянем из lib/raid.ts (сервер): значение
 * нужно только для доли шкалы (сколько уже прошло из тридцати минут), сама
 * длительность окна сюда не приходит — только момент, когда истечёт текущее.
 * Если серверная константа когда-нибудь изменится, это единственное место на
 * клиенте, которое придётся поправить вместе с ней.
 */
const STAMINA_REGEN_MS = 30 * 60 * 1000;

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: "900", color: "#e11d48" }}>Рейд не открылся</Text>
      <Text style={{ fontSize: 13, lineHeight: 20, color: "#5b4f8e" }}>
        {error?.message ?? "Неизвестная ошибка"}
      </Text>
      <ChunkyButton
        label="Попробовать снова"
        icon="repeat"
        center
        onPress={() => { void retry(); }}
        style={{ alignSelf: "flex-start", minWidth: 220 }}
      />
    </ScrollView>
  );
}

/** Светлая карточка — тот же корпус, что у остальных экранов раздела. */
function card(colors: any, extra?: ViewStyle): ViewStyle {
  return {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
    shadowColor: accents.violetDeep,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
    ...extra,
  };
}

/** Полоса с заливкой градиентом. Ширина анимируется от прошлого значения. */
function Bar({
  ratio, colors: fill, height = 10, glow = false,
}: { ratio: number; colors: readonly string[]; height?: number; glow?: boolean }) {
  const width = React.useRef(new Animated.Value(Math.max(0, Math.min(1, ratio)))).current;

  React.useEffect(() => {
    Animated.timing(width, {
      toValue: Math.max(0, Math.min(1, ratio)),
      duration: timing.progress,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [ratio, width]);

  return (
    <View style={{
      height, borderRadius: height, backgroundColor: "rgba(109,40,217,0.16)", overflow: "hidden",
    }}>
      <Animated.View
        style={{
          height: "100%",
          width: width.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
          ...(glow
            ? { shadowColor: fill[fill.length - 1] ?? accents.magenta, shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }
            : {}),
        }}
      >
        <LinearGradient
          colors={fill as unknown as string[]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1, borderRadius: height }}
        />
      </Animated.View>
    </View>
  );
}

/** Счётчик с иконкой: энергия, монеты, комбо, ключи. */
function Stat({
  icon, coin, value, label, color,
}: { icon?: GlyphName; coin?: boolean; value: string; label: string; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 3 }}>
      {coin ? <Coin size={18} /> : <Glyph name={icon ?? "star"} size={18} color={color} />}
      <Text style={{ fontSize: 17, fontWeight: "900", color: "#1e1b3a", letterSpacing: -0.4 }}>{value}</Text>
      <Text style={{ fontSize: 10, fontWeight: "700", color: "#7a6ea8", letterSpacing: 0.4, textAlign: "center" }}>
        {label}
      </Text>
    </View>
  );
}

/** Оставшееся время события словами. */
function useCountdown(endsAt: string | undefined): string {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!endsAt) return "";
  const left = new Date(endsAt).getTime() - now;
  if (left <= 0) return "событие закончилось";
  const days = Math.floor(left / 86400000);
  const hours = Math.floor((left % 86400000) / 3600000);
  const minutes = Math.floor((left % 3600000) / 60000);
  const seconds = Math.floor((left % 60000) / 1000);
  if (days > 0) return `${days} д ${hours} ч`;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Шкала до следующей энергии. */
function useStaminaRefill(nextAt: string | null): { ratio: number; label: string } | null {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!nextAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [nextAt]);

  if (!nextAt) return null;

  const target = new Date(nextAt).getTime();
  const remaining = Math.max(0, target - now);
  if (remaining <= 0) return { ratio: 1, label: "0:00" };

  const ratio = 1 - remaining / STAMINA_REGEN_MS;
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return {
    ratio: Math.max(0, Math.min(1, ratio)),
    label: `${minutes}:${String(seconds).padStart(2, "0")}`,
  };
}

function StaminaRefillBar({ nextAt }: { nextAt: string | null }) {
  const colors = useColors();
  const refill = useStaminaRefill(nextAt);
  if (!refill) return null;

  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground }}>
          До следующей энергии
        </Text>
        <Text style={{ fontSize: 12, fontWeight: "900", color: accents.amber, fontVariant: ["tabular-nums"] }}>
          {refill.label}
        </Text>
      </View>
      <Bar ratio={refill.ratio} height={5} colors={["#fde68a", "#fbbf24"]} />
    </View>
  );
}

/** Разбор прошлого рейда: одна неделя, один босс, один итог. */
function PreviousRaidBody({ previous, colors }: { previous: RaidPrevious; colors: any }) {
  const won = previous.status === "won";
  const percent = previous.hpTotal > 0
    ? Math.round((previous.damageDealt / previous.hpTotal) * 1000) / 10
    : 0;
  return (
    <View style={{ gap: 12 }}>
      <LinearGradient
        colors={["#1e1b4b", previous.colors[1], "#2e1065"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ borderRadius: radii.md, padding: 16, overflow: "hidden" }}
      >
        <Text style={{ fontSize: 10.5, fontWeight: "900", color: "rgba(255,255,255,0.7)", letterSpacing: 1.2 }}>
          {previous.weekKey}
        </Text>
        <Text style={{ fontSize: 21, fontWeight: "900", color: "#fff", letterSpacing: -0.5, marginTop: 3 }}>
          {previous.bossName}
        </Text>
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: "rgba(255,255,255,0.84)", marginTop: 6 }}>
          {won ? "Сообщество добило босса" : "Босс пережил эту неделю"}
        </Text>
        <View style={{ marginTop: 12 }}>
          <Bar ratio={Math.max(0, Math.min(1, previous.damageDealt / Math.max(1, previous.hpTotal)))} height={14} colors={won ? ["#f59e0b", "#fbbf24"] : ["#f472b6", "#a855f7"]} glow />
        </View>
        <Text style={{ fontSize: 12, fontWeight: "800", color: "#fff", marginTop: 7 }}>
          Снято {previous.damageDealt.toLocaleString("ru-RU")} из {previous.hpTotal.toLocaleString("ru-RU")} HP · {percent}%
        </Text>
      </LinearGradient>

      <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
        <View style={[card(colors, { flexGrow: 1, flexBasis: "47%", paddingVertical: 13 }), { alignItems: "center" }]}> 
          <Text style={{ fontSize: 10.5, fontWeight: "800", color: colors.mutedForeground, letterSpacing: 0.8 }}>МОЙ УРОН</Text>
          <Text style={{ fontSize: 24, fontWeight: "900", color: colors.foreground, marginTop: 4 }}>
            {previous.myDamage.toLocaleString("ru-RU")}
          </Text>
          <Text style={{ fontSize: 11.5, color: colors.mutedForeground, marginTop: 2 }}>{previous.myShare}% от общего</Text>
        </View>
        <View style={[card(colors, { flexGrow: 1, flexBasis: "47%", paddingVertical: 13 }), { alignItems: "center" }]}> 
          <Text style={{ fontSize: 10.5, fontWeight: "800", color: colors.mutedForeground, letterSpacing: 0.8 }}>ЛУЧШЕЕ КОМБО</Text>
          <Text style={{ fontSize: 24, fontWeight: "900", color: colors.foreground, marginTop: 4 }}>
            {previous.myBestCombo}
          </Text>
          <Text style={{ fontSize: 11.5, color: colors.mutedForeground, marginTop: 2 }}>подряд без ошибки</Text>
        </View>
        <View style={[card(colors, { flexGrow: 1, flexBasis: "47%", paddingVertical: 13 }), { alignItems: "center" }]}> 
          <Text style={{ fontSize: 10.5, fontWeight: "800", color: colors.mutedForeground, letterSpacing: 0.8 }}>УДАРОВ</Text>
          <Text style={{ fontSize: 24, fontWeight: "900", color: colors.foreground, marginTop: 4 }}>
            {previous.myHits}
          </Text>
          <Text style={{ fontSize: 11.5, color: colors.mutedForeground, marginTop: 2 }}>всего за рейд</Text>
        </View>
        <View style={[card(colors, { flexGrow: 1, flexBasis: "47%", paddingVertical: 13 }), { alignItems: "center" }]}> 
          <Text style={{ fontSize: 10.5, fontWeight: "800", color: colors.mutedForeground, letterSpacing: 0.8 }}>КРИТЫ</Text>
          <Text style={{ fontSize: 24, fontWeight: "900", color: colors.foreground, marginTop: 4 }}>
            {previous.myCrits}
          </Text>
          <Text style={{ fontSize: 11.5, color: colors.mutedForeground, marginTop: 2 }}>мощных ударов</Text>
        </View>
      </View>

      {previous.lastHero && (
        <View style={card(colors, { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: accents.gold + "18", borderColor: accents.gold + "55" })}>
          <Glyph name="trophy" size={18} color={accents.amber} />
          <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "800", color: colors.foreground }}>
            Добивающий удар был твоим
          </Text>
        </View>
      )}
    </View>
  );
}

/** Внутренняя навигация вкладки рейда. */
function RaidTabs({
  tab, onChange, previousAvailable,
}: {
  tab: RaidTab;
  onChange: (tab: RaidTab) => void;
  previousAvailable: boolean;
}) {
  const colors = useColors();
  const tabs: Array<{ key: RaidTab; label: string; icon: GlyphName; disabled?: boolean }> = [
    { key: "battle", label: "Бой", icon: "flame" },
    { key: "shop", label: "Лавка усилений", icon: "spark" },
    { key: "previous", label: "Прошлый рейд", icon: "note", disabled: !previousAvailable },
  ];

  return (
    <View style={{
      flexDirection: "row",
      backgroundColor: colors.primary + "14",
      borderRadius: radii.pill,
      padding: 4,
      marginBottom: 14,
      gap: 4,
    }}>
      {tabs.map((item) => {
        const active = tab === item.key;
        const disabled = !!item.disabled;
        return (
          <Pressable
            key={item.key}
            onPress={() => { if (!disabled) onChange(item.key); }}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            style={{
              flex: 1,
              borderRadius: radii.pill,
              paddingVertical: 10,
              paddingHorizontal: 10,
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              backgroundColor: active ? colors.card : "transparent",
              opacity: disabled ? 0.45 : 1,
            }}
          >
            <Glyph name={item.icon} size={16} color={active ? colors.primary : colors.mutedForeground} />
            <Text
              numberOfLines={1}
              style={{
                fontSize: 11.5,
                fontWeight: active ? "900" : "700",
                color: active ? colors.primary : colors.mutedForeground,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Карточка с атмосферой лавки: амулет, легенда, цена и что уже куплено. */
function ShopItem({
  title,
  lore,
  effect,
  icon,
  color,
  price,
  owned,
  canBuy,
  onPress,
}: {
  title: string;
  lore: string;
  effect: string;
  icon: GlyphName;
  color: string;
  price: number;
  owned?: string;
  canBuy: boolean;
  onPress: () => void;
}) {
  const press = React.useRef(new Animated.Value(0)).current;
  const set = (to: number) => Animated.timing(press, {
    toValue: to,
    duration: timing.press,
    easing: Easing.out(Easing.quad),
    useNativeDriver: NATIVE_DRIVER,
  }).start();

  return (
    <View style={{ paddingBottom: 6 }}>
      <View style={{
        position: "absolute", left: 0, right: 0, top: 6, bottom: 0,
        borderRadius: radii.lg, backgroundColor: canBuy ? "#3b2b63" : "#2a2341",
      }} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={onPress}
          onPressIn={() => { if (canBuy) set(6); }}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={`${title}. ${effect}. Цена ${price} монет`}
        >
          <LinearGradient
            colors={["#25183d", "#19132c"]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: color + "66",
              padding: 15,
              opacity: canBuy || owned ? 1 : 0.55,
            }}
          >
            <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
              <View style={{
                width: 54, height: 54, borderRadius: 18,
                alignItems: "center", justifyContent: "center",
                backgroundColor: color + "22",
                borderWidth: 1.5,
                borderColor: color + "66",
              }}>
                <Glyph name={icon} size={25} color={color} />
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 17, fontWeight: "900", color: "#fff", letterSpacing: -0.4 }}>
                  {title}
                </Text>
                <Text style={{ fontSize: 11.5, lineHeight: 17, color: "rgba(255,255,255,0.58)", marginTop: 3 }}>
                  {lore}
                </Text>
                <Text style={{ fontSize: 12.5, lineHeight: 18, color: "rgba(255,255,255,0.9)", marginTop: 7 }}>
                  {effect}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
              <View style={{
                flexDirection: "row", alignItems: "center", gap: 6,
                paddingHorizontal: 11, paddingVertical: 6,
                borderRadius: radii.pill,
                backgroundColor: "rgba(255,255,255,0.08)",
              }}>
                <Coin size={16} />
                <Text style={{ fontSize: 13, fontWeight: "900", color: "#fff" }}>{price}</Text>
              </View>

              {owned ? (
                <Pill text={owned} tone="soft" color={color} />
              ) : !canBuy ? (
                <Text style={{ fontSize: 11.5, fontWeight: "800", color: "rgba(255,255,255,0.6)" }}>
                  не хватает монет
                </Text>
              ) : (
                <Text style={{ fontSize: 11.5, fontWeight: "900", color }}>
                  купить
                </Text>
              )}
            </View>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function WizardShopTab({
  data,
  onBuy,
  buying,
}: {
  data: RaidSnapshot;
  onBuy: (payload: { buff: RaidBuff; title: string; about: string; cost: number; disabled: boolean }) => void;
  buying: boolean;
}) {
  const colors = useColors();
  const { me, abilities } = data;
  const active: Array<{ icon: GlyphName; label: string; value: string; color: string }> = [];
  if (abilities.power.stacks > 0) active.push({ icon: "flame", label: "Мощный удар", value: `${abilities.power.stacks} заряд${abilities.power.stacks === 1 ? "" : abilities.power.stacks < 5 ? "а" : "ов"}`, color: accents.amber });
  if (abilities.aoe.left > 0) active.push({ icon: "spark", label: "AOE-удар", value: `${abilities.aoe.left} усиленных заданий`, color: "#c084fc" });
  if (abilities.shield.active) active.push({ icon: "rank", label: "Щит", value: "защита стоит", color: "#7dd3fc" });
  if (abilities.stamina.full) active.push({ icon: "cards", label: "Энергия", value: "бак полный", color: "#fbbf24" });

  return (
    <View style={{ gap: 14 }}>
      <LinearGradient
        colors={["#140f26", "#1f1636", "#120d22"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{
          borderRadius: radii.lg,
          padding: 16,
          borderWidth: 1,
          borderColor: "rgba(192,132,252,0.24)",
          overflow: "hidden",
        }}
      >
        <View style={{
          position: "absolute", width: 240, height: 240, borderRadius: 120,
          top: -150, right: -80, backgroundColor: "rgba(192,132,252,0.10)",
        }} />
        <Text style={{ fontSize: 11, fontWeight: "900", color: "rgba(255,255,255,0.62)", letterSpacing: 1.2 }}>
          ЛАВКА СТАРЦА-КОЛДУНА
        </Text>
        <Text style={{ fontSize: 21, fontWeight: "900", color: "#fff", letterSpacing: -0.5, marginTop: 4 }}>
          Усиления за монеты
        </Text>
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: "rgba(255,255,255,0.78)", marginTop: 7 }}>
          Старец не спорит, зачем тебе сила. Есть монеты, значит бери амулеты впрок.
        </Text>

        <View style={{ marginTop: 14, flexDirection: "row", gap: 10 }}>
          <View style={[card(colors, { flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.10)" })]}>
            <Text style={{ fontSize: 10.5, fontWeight: "800", color: "rgba(255,255,255,0.62)", letterSpacing: 0.8 }}>МОИ МОНЕТЫ</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 6 }}>
              <Coin size={18} />
              <Text style={{ fontSize: 26, fontWeight: "900", color: "#fff", letterSpacing: -0.8 }}>{me.coins}</Text>
            </View>
          </View>
          <View style={[card(colors, { flex: 1, backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.10)" })]}>
            <Text style={{ fontSize: 10.5, fontWeight: "800", color: "rgba(255,255,255,0.62)", letterSpacing: 0.8 }}>ЭНЕРГИЯ</Text>
            <Text style={{ fontSize: 26, fontWeight: "900", color: "#fff", letterSpacing: -0.8, marginTop: 6 }}>{me.stamina}/{me.staminaMax}</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={[card(colors, { backgroundColor: "#221936", borderColor: "rgba(192,132,252,0.22)" })]}>
        <Text style={{ fontSize: 12, fontWeight: "900", color: "rgba(255,255,255,0.68)", letterSpacing: 1, marginBottom: 10 }}>
          СЕЙЧАС В СУМКЕ
        </Text>
        {active.length === 0 ? (
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: "rgba(255,255,255,0.62)" }}>
            Пусто. Старец качает головой: без артефактов бить босса честнее, но дольше.
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {active.map((item) => (
              <View
                key={item.label}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 10,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderRadius: radii.sm,
                  padding: 11,
                  borderWidth: 1,
                  borderColor: item.color + "44",
                }}
              >
                <Glyph name={item.icon} size={16} color={item.color} />
                <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "800", color: "#fff" }}>{item.label}</Text>
                <Text style={{ fontSize: 12, fontWeight: "800", color: item.color }}>{item.value}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <SectionLabel>Товары колдуна</SectionLabel>
      <View style={{ gap: 10 }}>
        <ShopItem
          title="Мощный удар"
          lore="Амулет с пламенной жилой. Старец говорит: сработает на первом же точном ответе."
          effect={`Следующий верный ответ бьёт ×${abilities.power.mult}. Можно хранить запасом.`}
          icon="flame"
          color={accents.amber}
          price={abilities.power.cost}
          owned={abilities.power.stacks > 0 ? `заряжено ${abilities.power.stacks}` : undefined}
          canBuy={me.coins >= abilities.power.cost && !buying}
          onPress={() => onBuy({
            buff: "power",
            title: "Мощный удар",
            about: `Следующий верный ответ бьёт ×${abilities.power.mult}`,
            cost: abilities.power.cost,
            disabled: me.coins < abilities.power.cost,
          })}
        />
        <ShopItem
          title="AOE-удар"
          lore="Пыль звёзд в узком флаконе. Разлетается на несколько заданий сразу."
          effect={`Урон следующих ${abilities.aoe.tasks} заданий ×${abilities.aoe.mult}. Покупка добавляет ещё ${abilities.aoe.tasks}.`}
          icon="spark"
          color="#c084fc"
          price={abilities.aoe.cost}
          owned={abilities.aoe.left > 0 ? `осталось ${abilities.aoe.left}` : undefined}
          canBuy={me.coins >= abilities.aoe.cost && !buying}
          onPress={() => onBuy({
            buff: "aoe",
            title: "AOE-удар",
            about: `Урон следующих ${abilities.aoe.tasks} заданий ×${abilities.aoe.mult}`,
            cost: abilities.aoe.cost,
            disabled: me.coins < abilities.aoe.cost,
          })}
        />
        <ShopItem
          title="Щит от ржавчины"
          lore="Руна, которую старец выжигает на старой бляхе. Спасает от языковой ржавчины."
          effect="Гасит штраф за пропуск дней. Повторная покупка продлевает защиту ещё на 7 дней."
          icon="rank"
          color="#7dd3fc"
          price={abilities.shield.cost}
          owned={abilities.shield.active ? "щит стоит" : undefined}
          canBuy={me.coins >= abilities.shield.cost && !buying}
          onPress={() => onBuy({
            buff: "shield",
            title: "Щит",
            about: "Гасит штраф за пропуск дней («языковая ржавчина»)",
            cost: abilities.shield.cost,
            disabled: me.coins < abilities.shield.cost,
          })}
        />
        <ShopItem
          title="Полная энергия"
          lore="Запечатанная колба с жёлтым светом. Открывать только когда уже вымотан."
          effect={`Сразу ${me.staminaMax} энергии. Полный бак второй раз не зальёшь.`}
          icon="cards"
          color="#fbbf24"
          price={abilities.stamina.cost}
          owned={abilities.stamina.full ? "бак полный" : undefined}
          canBuy={me.coins >= abilities.stamina.cost && !abilities.stamina.full && !buying}
          onPress={() => onBuy({
            buff: "stamina",
            title: "Полная энергия",
            about: `Сразу ${me.staminaMax} энергии — бьёшь дальше, не ожидая`,
            cost: abilities.stamina.cost,
            disabled: me.coins < abilities.stamina.cost || abilities.stamina.full,
          })}
        />
      </View>
    </View>
  );
}

function BattleTab({
  data,
  countdown,
  hitToken,
  top,
  meInTop,
  onOpenPrevious,
}: {
  data: RaidSnapshot;
  countdown: string;
  hitToken: number;
  top: RaidSnapshot["top"];
  meInTop: boolean;
  onOpenPrevious: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { event, me, quest, previous } = data;
  const hpRatio = event.hpTotal > 0 ? event.hpLeft / event.hpTotal : 0;
  const dead = event.hpLeft <= 0;
  const weak = event.weak.map(tagTitle).join(" · ");
  const questDone = quest.done >= quest.need;

  return (
    <View>
      {/* ── Цель на сегодня: первый блок экрана ─────────────────────────── */}
      <SectionLabel>Цель на сегодня</SectionLabel>
      <View style={card(colors, { marginBottom: 14 })}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{
            width: 42, height: 42, borderRadius: radii.sm,
            alignItems: "center", justifyContent: "center",
            backgroundColor: questDone ? "rgba(251,191,36,0.2)" : "rgba(99,102,241,0.12)",
          }}>
            <Glyph name={questDone ? "check" : "target"} size={21} color={questDone ? accents.gold : colors.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15.5, fontWeight: "900", color: colors.foreground }}>
              Нанеси {quest.need} урона боссу
            </Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
              {quest.done} из {quest.need} · награда {quest.coins} монет
            </Text>
          </View>
          <Text style={{
            fontSize: 20, fontWeight: "900", letterSpacing: -0.8,
            color: questDone ? accents.gold : colors.primary,
          }}>
            {Math.min(100, Math.round((quest.done / Math.max(1, quest.need)) * 100))}%
          </Text>
        </View>
        <View style={{ marginTop: 11 }}>
          <Bar ratio={quest.done / Math.max(1, quest.need)} colors={["#a855f7", "#6366f1"]} />
        </View>
        {quest.claimed ? (
          <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary, marginTop: 9 }}>
            Награда за сегодня получена
          </Text>
        ) : (
          <ChunkyButton
            label={questDone ? "Забрать награду" : "Ещё не выполнено"}
            icon="check"
            center
            onPress={() => {}}
            disabled
            style={{ marginTop: 11, opacity: questDone ? 1 : 0.45 }}
          />
        )}
      </View>

      {/* ── Босс ────────────────────────────────────────────────────────── */}
      <LinearGradient
        colors={["#1e1b4b", event.colors[1], "#2e1065"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ borderRadius: radii.lg, padding: 16, marginBottom: 14, overflow: "hidden" }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 10.5, fontWeight: "900", color: "rgba(255,255,255,0.7)", letterSpacing: 1.3 }}>
              {event.seasonal ? "СЕЗОННЫЙ БОСС" : `НЕДЕЛЯ ${event.weekKey}`}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: "900", color: "#fff", letterSpacing: -0.5, marginTop: 2 }}>
              {event.bossName}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 10.5, fontWeight: "900", color: "rgba(255,255,255,0.7)", letterSpacing: 1.1 }}>
              БОЙЦОВ
            </Text>
            <Text style={{ fontSize: 18, fontWeight: "900", color: "#fff" }}>{event.fighters}</Text>
          </View>
        </View>

        <View style={{ alignItems: "center", marginVertical: 6 }}>
          <BossArt
            boss={event.boss}
            colors={event.colors}
            phase={event.phase}
            hitToken={hitToken}
            size={190}
            defeated={dead}
          />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: "900", color: "#fff" }}>
            {event.hpLeft.toLocaleString("ru-RU")} HP
          </Text>
          <Text style={{ fontSize: 11.5, fontWeight: "700", color: "rgba(255,255,255,0.75)" }}>
            снято {event.damageDealt.toLocaleString("ru-RU")} из {event.hpTotal.toLocaleString("ru-RU")}
          </Text>
        </View>
        <Bar
          ratio={hpRatio}
          height={16}
          glow
          colors={event.phase === "berserk" ? ["#fb7185", "#e11d48"] : ["#f472b6", "#a855f7", "#6366f1"]}
        />

        <ChunkyButton
          label={dead ? "Босс повержен" : "Бить босса"}
          sublabel={dead ? "Ждём следующего в понедельник" : "12 заданий на практику · удар за каждый верный ответ"}
          icon="flame"
          chevron={!dead}
          disabled={dead}
          onPress={() => router.push("/raid/battle" as any)}
          style={{ marginTop: 12 }}
        />

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
          <View style={{
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill,
            backgroundColor: "rgba(255,255,255,0.16)",
          }}>
            <Text style={{ fontSize: 11, fontWeight: "900", color: "#fff" }}>
              {phaseTitle(event.phase)} · {event.percentLeft}%
            </Text>
          </View>
          <View style={{
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill,
            backgroundColor: "rgba(255,255,255,0.16)",
          }}>
            <Text style={{ fontSize: 11, fontWeight: "900", color: "#fff" }}>
              до конца {countdown}
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 12, lineHeight: 18, color: "rgba(255,255,255,0.82)", marginTop: 8 }}>
          {event.about} {phaseAbout(event.phase)}
        </Text>
        <Text style={{ fontSize: 12, lineHeight: 18, color: "#fff", marginTop: 6, fontWeight: "800" }}>
          Слабости: {weak}
        </Text>
      </LinearGradient>

      {/* ── Мой вклад ───────────────────────────────────────────────────── */}
      <View style={card(colors, { marginBottom: 12 })}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontSize: 11, fontWeight: "800", color: colors.mutedForeground, letterSpacing: 1 }}>
              МОЙ УРОН
            </Text>
            <Text style={{ fontSize: 30, fontWeight: "900", color: colors.foreground, letterSpacing: -1.2 }}>
              {me.damage.toLocaleString("ru-RU")}
            </Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
              {me.share}% от общего · {me.hits} ударов
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <Pill text={`${me.rank} место`} tone="soft" color={colors.primary} />
            {me.combo >= 3 && <Pill text={`комбо ${me.combo}`} tone="soft" color={accents.amber} />}
            {me.rusty && <Pill text="ржавчина −20%" tone="soft" color="#e11d48" />}
            {me.boosted && <Pill text="множитель ×1.5" tone="soft" color={accents.gold} />}
          </View>
        </View>

        <View style={{ flexDirection: "row", marginTop: 14, marginBottom: 10 }}>
          <Stat icon="spark" value={`${me.stamina}/${me.staminaMax}`} label="ЭНЕРГИЯ" color={accents.amber} />
          <Stat coin value={String(me.coins)} label="МОНЕТЫ" color={accents.gold} />
          <Stat icon="flame" value={String(me.bestCombo)} label="КОМБО" color={colors.primary} />
          <Stat icon="key" value={String(me.keys)} label="КЛЮЧИ" color={accents.violetDeep} />
        </View>
        <Bar ratio={me.stamina / me.staminaMax} colors={["#fbbf24", "#f59e0b"]} />
        <StaminaRefillBar nextAt={me.staminaNextAt} />
        {me.stamina >= me.staminaMax && (
          <Text style={{ fontSize: 11.5, fontWeight: "800", color: colors.primary, marginTop: 10 }}>
            Энергия — максимум
          </Text>
        )}

        {(me.title || me.merciless || me.lastHero) && (
          <View style={{ flexDirection: "row", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
            {!!me.title && <Pill text={me.title} tone="soft" color={accents.gold} />}
            {me.merciless && <Pill text="Безжалостный критик" tone="soft" color={accents.magenta} />}
            {me.lastHero && <Pill text="Последний герой" tone="soft" color={accents.gold} />}
          </View>
        )}
      </View>

      <SectionLabel>Топ по урону</SectionLabel>
      <View style={card(colors, { marginBottom: 12, gap: 8 })}>
        {top.length === 0 ? (
          <Text style={{ fontSize: 12.5, lineHeight: 19, color: colors.mutedForeground }}>
            Никто ещё не ударил. Первый удар — первое место.
          </Text>
        ) : (
          top.map((row, i) => (
            <View key={row.userId} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{
                width: 24, fontSize: 13, fontWeight: "900",
                color: i === 0 ? accents.gold : colors.mutedForeground,
              }}>
                {i + 1}
              </Text>
              <View style={{
                width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center",
                backgroundColor: row.avatarColor ?? colors.primary,
              }}>
                <Text style={{ fontSize: 14 }}>{row.avatarEmoji ?? ""}</Text>
              </View>
              <Text
                numberOfLines={1}
                style={{
                  flex: 1, fontSize: 13.5,
                  fontWeight: row.me ? "900" : "700",
                  color: row.me ? colors.primary : colors.foreground,
                }}
              >
                {row.name}{row.me ? " · ты" : ""}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "900", color: colors.foreground }}>
                {row.damage.toLocaleString("ru-RU")}
              </Text>
            </View>
          ))
        )}

        {top.length > 0 && !meInTop && me.damage > 0 && (
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 10,
            borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9, marginTop: 2,
          }}>
            <Text style={{ width: 24, fontSize: 13, fontWeight: "900", color: colors.primary }}>
              {me.rank}
            </Text>
            <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "900", color: colors.primary }}>
              Ты
            </Text>
            <Text style={{ fontSize: 13, fontWeight: "900", color: colors.foreground }}>
              {me.damage.toLocaleString("ru-RU")}
            </Text>
          </View>
        )}
      </View>

      {previous && (
        <>
          <SectionLabel>Прошлый рейд</SectionLabel>
          <Pressable
            onPress={onOpenPrevious}
            accessibilityRole="button"
            accessibilityLabel={`Открыть итог рейда против ${previous.bossName}`}
            style={card(colors, {
              marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 11,
            })}
          >
            <View style={{
              width: 42, height: 42, borderRadius: radii.sm,
              alignItems: "center", justifyContent: "center",
              backgroundColor: previous.status === "won" ? accents.gold + "1f" : colors.primary + "12",
            }}>
              <Glyph name={previous.status === "won" ? "trophy" : "note"} size={20} color={previous.status === "won" ? accents.amber : colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14.5, fontWeight: "900", color: colors.foreground }} numberOfLines={1}>
                {previous.bossName}
              </Text>
              <Text style={{ fontSize: 11.5, lineHeight: 17, color: colors.mutedForeground, marginTop: 2 }}>
                {previous.status === "won" ? "победа сообщества" : "босс выжил"} · мой урон {previous.myDamage.toLocaleString("ru-RU")}
              </Text>
            </View>
            <Glyph name="chevron" size={17} color={colors.mutedForeground} />
          </Pressable>
        </>
      )}
    </View>
  );
}

function PreviousRaidTab({ previous }: { previous: RaidPrevious | null }) {
  const colors = useColors();
  if (!previous) {
    return (
      <View style={card(colors, { alignItems: "center", gap: 10, paddingVertical: 26 })}>
        <Glyph name="note" size={28} color={colors.mutedForeground} />
        <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>Прошлого рейда ещё нет</Text>
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.mutedForeground, textAlign: "center" }}>
          Как только неделя закроется, здесь останется только её итог, без старого хвоста из прошлых событий.
        </Text>
      </View>
    );
  }
  return <PreviousRaidBody previous={previous} colors={colors} />;
}

export default function RaidScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["raid"],
    queryFn: raid.current,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const [tab, setTab] = React.useState<RaidTab>("battle");
  const [hitToken, setHitToken] = React.useState(0);
  React.useEffect(() => onRaidHit(() => {
    setHitToken((t) => t + 1);
    void qc.invalidateQueries({ queryKey: ["raid"] });
  }), [qc]);

  const [chestText, setChestText] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [confirmBuff, setConfirmBuff] = React.useState<null | {
    buff: RaidBuff;
    title: string;
    about: string;
    cost: number;
  }>(null);
  const [previousOpen, setPreviousOpen] = React.useState(false);

  const refresh = (snapshot: RaidSnapshot) => {
    qc.setQueryData(["raid"], snapshot);
  };
  const complain = (err: unknown) => {
    setProblem(err instanceof Error ? err.message : "Не получилось");
    setTimeout(() => setProblem(null), 2600);
  };

  const buyM = useMutation({
    mutationFn: (buff: RaidBuff) => raid.buy(buff),
    onSuccess: (snapshot) => {
      refresh(snapshot);
      setConfirmBuff(null);
    },
    onError: complain,
  });
  const questM = useMutation({ mutationFn: () => raid.quest(), onSuccess: refresh, onError: complain });
  const chestM = useMutation({
    mutationFn: (eventId: number) => raid.chest(eventId),
    onSuccess: (res) => {
      refresh(res.snapshot);
      setChestText(
        res.chest.status === "won"
          ? `Золотой сундук: ${res.chest.coins} монет, титул «${res.chest.title}» и множитель урона ×1.5 на 48 часов`
          : `Серебряный сундук: ${res.chest.coins} монет и титул «${res.chest.title}»`,
      );
    },
    onError: complain,
  });

  const data = q.data;
  const countdown = useCountdown(data?.event.endsAt);

  if (q.isLoading || !data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const { previous } = data;
  if (tab === "previous" && !previous) setTab("battle");

  return (
    <>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: screenTop(insets),
          paddingBottom: screenBottom(insets),
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 28, fontWeight: "900", letterSpacing: -0.7, color: colors.foreground }}>
            Рейд
          </Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.6 }}>
              ДО КОНЦА
            </Text>
            <Text style={{ fontSize: 15, fontWeight: "900", color: accents.violetDeep }}>{countdown}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginTop: 5, marginBottom: 14 }}>
          Бьём все вместе. В бою тренируемся, в лавке усиливаемся, а прошлый рейд оставляем как один понятный итог, без мусорной истории.
        </Text>

        <RaidTabs tab={tab} onChange={setTab} previousAvailable={!!previous} />

        {tab === "battle" && (
          <BattleTab
            data={data}
            countdown={countdown}
            hitToken={hitToken}
            top={data.top ?? []}
            meInTop={(data.top ?? []).some((r) => r.me)}
            onOpenPrevious={() => setPreviousOpen(true)}
          />
        )}

        {tab === "shop" && (
          <WizardShopTab
            data={data}
            buying={buyM.isPending}
            onBuy={(payload) => {
              if (payload.disabled || buyM.isPending) return;
              setConfirmBuff({ buff: payload.buff, title: payload.title, about: payload.about, cost: payload.cost });
            }}
          />
        )}

        {tab === "previous" && <PreviousRaidTab previous={previous} />}
      </ScrollView>

      {!!data.chest && (
        <CenteredModal>
          <ModalCard
            title={data.chest.status === "won" ? "Босс повержен" : "Рейд закончился"}
            body={
              data.chest.status === "won"
                ? `${data.chest.bossName} пал. Ты нанёс ${data.chest.damage.toLocaleString("ru-RU")} урона — забирай золотой сундук.`
                : `${data.chest.bossName} выжил. Твои ${data.chest.damage.toLocaleString("ru-RU")} урона не пропали: держи утешительный сундук.`
            }
            action={data.chest.status === "won" ? "Открыть золотой сундук" : "Открыть серебряный сундук"}
            onAction={() => chestM.mutate(data.chest!.eventId)}
          />
        </CenteredModal>
      )}
      {!!confirmBuff && (
        <CenteredModal onDismiss={() => setConfirmBuff(null)}>
          <ModalCard
            title={`Купить: ${confirmBuff.title}?`}
            body={`${confirmBuff.about}\n\nЦена: ${confirmBuff.cost} монет.`}
            action="Купить"
            cancel="Отмена"
            onCancel={() => setConfirmBuff(null)}
            onAction={() => buyM.mutate(confirmBuff.buff)}
          />
        </CenteredModal>
      )}
      {previousOpen && previous && (
        <CenteredModal onDismiss={() => setPreviousOpen(false)}>
          <DetailCard
            title="Итог прошлого рейда"
            onClose={() => setPreviousOpen(false)}
          >
            <PreviousRaidBody previous={previous} colors={colors} />
          </DetailCard>
        </CenteredModal>
      )}
      {!!chestText && (
        <CenteredModal>
          <ModalCard title="Сундук открыт" body={chestText} action="Отлично" onAction={() => setChestText(null)} />
        </CenteredModal>
      )}
      {!!problem && (
        <View style={{
          position: "absolute", left: 16, right: 16, bottom: screenBottom(insets) - 60,
          backgroundColor: "#3b1d4d", borderRadius: radii.md, padding: 12,
        }}>
          <Text style={{ color: "#fff", fontSize: 12.5, fontWeight: "700" }}>{problem}</Text>
        </View>
      )}
    </>
  );
}

/** Центрированный системный оверлей поверх всего экрана, а не над скроллом. */
function CenteredModal({
  children, onDismiss,
}: { children: React.ReactNode; onDismiss?: () => void }) {
  return (
    <RNModal visible transparent animationType="fade" onRequestClose={onDismiss ?? (() => {})}>
      <Pressable
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          backgroundColor: "rgba(20,10,40,0.55)",
        }}
        onPress={() => onDismiss?.()}
      >
        <Pressable onPress={() => {}} style={{ width: "100%", alignItems: "center", justifyContent: "center" }}>
          {children}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

/** Простое окно события: сундук, подтверждение покупки. */
function ModalCard({
  title, body, action, onAction, cancel, onCancel,
}: {
  title: string;
  body: string;
  action: string;
  onAction: () => void;
  cancel?: string;
  onCancel?: () => void;
}) {
  const colors = useColors();
  return (
    <View style={card(colors, { width: "100%", maxWidth: 340, padding: 20 })}>
      <Text style={{ fontSize: 19, fontWeight: "900", color: colors.foreground, letterSpacing: -0.4 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 13, lineHeight: 20, color: colors.mutedForeground, marginTop: 8 }}>
        {body}
      </Text>
      <ChunkyButton label={action} icon="check" center onPress={onAction} style={{ marginTop: 16 }} />
      {cancel && onCancel && (
        <ChunkyButton label={cancel} tone="dark" center onPress={onCancel} style={{ marginTop: 8 }} />
      )}
    </View>
  );
}

/** Большое окно деталей: прошлый рейд. */
function DetailCard({
  title, children, onClose,
}: { title: string; children: React.ReactNode; onClose: () => void }) {
  const colors = useColors();
  return (
    <View style={card(colors, { width: "100%", maxWidth: 420, padding: 18, maxHeight: "85%" })}>
      <Text style={{ fontSize: 19, fontWeight: "900", color: colors.foreground, letterSpacing: -0.4, marginBottom: 12 }}>
        {title}
      </Text>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
        {children}
      </ScrollView>
      <ChunkyButton label="Закрыть" tone="dark" center onPress={onClose} style={{ marginTop: 14 }} />
    </View>
  );
}
