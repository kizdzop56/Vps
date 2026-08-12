// ─────────────────────────────────────────────────────────────────────────────
// Вкладка «Рейд»: недельный босс на всё сообщество.
//
// Экран отвечает на четыре вопроса и в этом порядке:
//   1. кого бьём и сколько у него осталось (босс, шкала, фаза, таймер);
//   2. чем бить выгоднее прямо сейчас (слабости босса);
//   3. что могу я (мой урон, энергия, мана, спецатаки);
//   4. что мне за это будет (вехи вклада, сундук, лиги).
//
// Урон ЗДЕСЬ НЕ НАНОСИТСЯ. Он снимается ответами в тренажёрах — экран рейда это
// табло, а не тренажёр. Отсюда и главная кнопка внизу: она уводит в «Учёбу», а
// не предлагает «ударить» на месте. Кнопка «ударить» без задания превратила бы
// событие в тапалку, а смысл ровно обратный: бьёшь тем, что выучил.
//
// Цифры урона вылетают поверх ЛЮБОГО экрана (components/raid/RaidHitOverlay),
// поэтому здесь их дублировать не нужно: сюда ученик приходит смотреть итог.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, Pressable, ScrollView, Animated, Easing, Platform, ActivityIndicator,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { ChunkyButton, Pill, SectionLabel } from "@/components/ui/GameKit";
import { accents, radii, timing } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";
import { BossArt } from "@/components/raid/BossArt";
import { onRaidHit } from "@/utils/raidBus";
import {
  phaseAbout, phaseTitle, raid, tagTitle,
  type RaidLeague, type RaidSnapshot,
} from "@/hooks/useRaid";

const NATIVE_DRIVER = Platform.OS !== "web";
const EDGE_LIGHT = "#c9bdf0";

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
      // Ширина не поддерживается нативным драйвером — здесь это одна полоса,
      // и на неё это не влияет.
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

/** Счётчик с иконкой: энергия, мана, монеты. */
function Stat({
  icon, value, label, color,
}: { icon: GlyphName; value: string; label: string; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 3 }}>
      <Glyph name={icon} size={18} color={color} />
      <Text style={{ fontSize: 17, fontWeight: "900", color: "#1e1b3a", letterSpacing: -0.4 }}>{value}</Text>
      <Text style={{ fontSize: 10, fontWeight: "700", color: "#7a6ea8", letterSpacing: 0.4 }}>{label}</Text>
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

export default function RaidScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["raid"],
    queryFn: raid.current,
    // Пул общий: пока ученик смотрит на шкалу, её двигают другие.
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  /** Токен удара для шейка фигуры и мгновенного обновления шкалы. */
  const [hitToken, setHitToken] = React.useState(0);
  React.useEffect(() => onRaidHit(() => {
    setHitToken((t) => t + 1);
    void qc.invalidateQueries({ queryKey: ["raid"] });
  }), [qc]);

  const [league, setLeague] = React.useState<RaidLeague | null>(null);
  const [granted, setGranted] = React.useState<string[] | null>(null);
  const [chestText, setChestText] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);

  const refresh = (snapshot: RaidSnapshot) => {
    qc.setQueryData(["raid"], snapshot);
  };
  const complain = (err: unknown) => {
    setProblem(err instanceof Error ? err.message : "Не получилось");
    setTimeout(() => setProblem(null), 2600);
  };

  const abilityM = useMutation({
    mutationFn: (ability: "power" | "aoe" | "shield") => raid.ability(ability),
    onSuccess: refresh,
    onError: complain,
  });
  const claimM = useMutation({
    mutationFn: () => raid.claim(),
    onSuccess: (res) => {
      refresh(res.snapshot);
      setGranted(res.granted.map((g) => g.label));
    },
    onError: complain,
  });
  const questM = useMutation({ mutationFn: () => raid.quest(), onSuccess: refresh, onError: complain });
  const shopM = useMutation({
    mutationFn: (item: "mana" | "stamina") => raid.shop(item),
    onSuccess: refresh,
    onError: complain,
  });
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

  React.useEffect(() => {
    if (data && league === null) setLeague(data.me.league);
  }, [data, league]);

  if (q.isLoading || !data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const { event, me, quest, abilities, shop, track } = data;
  const hpRatio = event.hpTotal > 0 ? event.hpLeft / event.hpTotal : 0;
  const dead = event.hpLeft <= 0;
  const weak = event.weak.map(tagTitle).join(" · ");
  const nextMilestone = track.milestones.find((m) => !m.reached);
  const shownLeague = data.leagues.find((l) => l.key === (league ?? me.league)) ?? data.leagues[0];

  return (
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
        Бьём все вместе. Каждый верный ответ в упражнениях снимает боссу здоровье.
      </Text>

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

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
          <View style={{
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill,
            backgroundColor: "rgba(255,255,255,0.16)",
          }}>
            <Text style={{ fontSize: 11, fontWeight: "900", color: "#fff" }}>
              {phaseTitle(event.phase)} · {event.percentLeft}%
            </Text>
          </View>
          {dead && (
            <View style={{
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill,
              backgroundColor: accents.gold,
            }}>
              <Text style={{ fontSize: 11, fontWeight: "900", color: "#3b2506" }}>ПОВЕРЖЕН</Text>
            </View>
          )}
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
            <Pill text={`${me.leagueTitle} · ${me.rank} место`} tone="soft" color={colors.primary} />
            {me.combo >= 3 && <Pill text={`комбо ${me.combo}`} tone="soft" color={accents.amber} />}
            {me.rusty && <Pill text="ржавчина −20%" tone="soft" color="#e11d48" />}
            {me.boosted && <Pill text="множитель ×1.5" tone="soft" color={accents.gold} />}
          </View>
        </View>

        <View style={{ flexDirection: "row", marginTop: 14, marginBottom: 10 }}>
          <Stat icon="spark" value={`${me.stamina}/${me.staminaMax}`} label="ЭНЕРГИЯ" color={accents.amber} />
          <Stat icon="flask" value={String(me.mana)} label="МАНА" color={colors.primary} />
          <Stat icon="cup" value={String(me.coins)} label="МОНЕТЫ" color={accents.gold} />
          <Stat icon="key" value={String(me.keys)} label="КЛЮЧИ" color={accents.violetDeep} />
        </View>
        <Bar ratio={me.stamina / me.staminaMax} colors={["#fbbf24", "#f59e0b"]} />
        <Text style={{ fontSize: 11.5, color: colors.mutedForeground, marginTop: 6 }}>
          Одно задание — одна энергия. Восстановление: +1 каждые 30 минут.
          {me.stamina >= me.staminaMax ? " Запас полный." : ""}
        </Text>
        {(me.title || me.merciless || me.lastHero) && (
          <View style={{ flexDirection: "row", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
            {!!me.title && <Pill text={me.title} tone="soft" color={accents.gold} />}
            {me.merciless && <Pill text="Безжалостный критик" tone="soft" color={accents.magenta} />}
            {me.lastHero && <Pill text="Последний герой" tone="soft" color={accents.gold} />}
          </View>
        )}
      </View>

      {/* ── Спецатаки ───────────────────────────────────────────────────── */}
      <SectionLabel>Спецатаки за ману</SectionLabel>
      <View style={{ gap: 9, marginBottom: 14 }}>
        <Ability
          icon="flame"
          title="Мощный удар"
          about={`Следующий верный ответ бьёт ×${abilities.power.mult}`}
          cost={abilities.power.cost}
          mana={me.mana}
          active={abilities.power.armed}
          activeText="заряжен"
          onPress={() => abilityM.mutate("power")}
          busy={abilityM.isPending}
        />
        <Ability
          icon="spark"
          title="AOE-удар"
          about={`Урон следующих ${abilities.aoe.tasks} заданий ×${abilities.aoe.mult}`}
          cost={abilities.aoe.cost}
          mana={me.mana}
          active={abilities.aoe.left > 0}
          activeText={`осталось ${abilities.aoe.left}`}
          onPress={() => abilityM.mutate("aoe")}
          busy={abilityM.isPending}
        />
        <Ability
          icon="rank"
          title="Щит"
          about="Снимает штраф за пропуск дней («языковая ржавчина»)"
          cost={abilities.shield.cost}
          mana={me.mana}
          active={abilities.shield.active}
          activeText="стоит"
          onPress={() => abilityM.mutate("shield")}
          busy={abilityM.isPending}
        />
      </View>

      {/* ── Дневное задание ────────────────────────────────────────────── */}
      <View style={card(colors, { marginBottom: 12 })}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Glyph name="target" size={22} color={colors.primary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>
              Нанеси {quest.need} урона за день
            </Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
              {quest.done} из {quest.need} · награда {quest.coins} монет и {quest.mana} маны
            </Text>
          </View>
        </View>
        <View style={{ marginTop: 10 }}>
          <Bar ratio={quest.done / quest.need} colors={["#a855f7", "#6366f1"]} />
        </View>
        {quest.claimed ? (
          <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary, marginTop: 9 }}>
            Награда за сегодня получена
          </Text>
        ) : (
          <ChunkyButton
            label={quest.done >= quest.need ? "Забрать награду" : "Ещё не выполнено"}
            icon="check"
            center
            onPress={() => { if (quest.done >= quest.need) questM.mutate(); }}
            style={{ marginTop: 11, opacity: quest.done >= quest.need ? 1 : 0.45 }}
          />
        )}
      </View>

      {/* ── Шкала личного вклада ───────────────────────────────────────── */}
      <SectionLabel>Награды за вклад</SectionLabel>
      <View style={card(colors, { marginBottom: 12 })}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground }}>
            Веха {Math.min(track.claimed + track.ready, track.milestones.length)} из {track.milestones.length}
          </Text>
          {track.ready > 0 && <Pill text={`готово: ${track.ready}`} tone="soft" color={accents.gold} />}
        </View>
        {!!nextMilestone && (
          <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 4 }}>
            До следующей: {(nextMilestone.at - me.damage).toLocaleString("ru-RU")} урона · {nextMilestone.label}
          </Text>
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 12, marginHorizontal: -4 }}
          contentContainerStyle={{ paddingHorizontal: 4, gap: 8 }}
        >
          {track.milestones.map((m, i) => (
            <View
              key={m.at}
              style={{
                width: 104, padding: 10, borderRadius: radii.sm,
                backgroundColor: m.claimed
                  ? "rgba(139,92,246,0.14)"
                  : m.reached ? "rgba(251,191,36,0.18)" : "rgba(120,110,170,0.08)",
                borderWidth: 1,
                borderColor: m.reached ? "rgba(139,92,246,0.4)" : "rgba(120,110,170,0.18)",
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: "900", color: "#7a6ea8", letterSpacing: 0.6 }}>
                {i + 1} ВЕХА
              </Text>
              <Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground, marginTop: 2 }}>
                {m.at.toLocaleString("ru-RU")}
              </Text>
              <Text style={{ fontSize: 10.5, lineHeight: 15, color: colors.mutedForeground, marginTop: 4 }}>
                {m.label}
              </Text>
              <View style={{ marginTop: 6 }}>
                <Glyph
                  name={m.claimed ? "check" : m.reached ? "bag" : "lock"}
                  size={15}
                  color={m.claimed ? colors.primary : m.reached ? accents.gold : "#a99fce"}
                />
              </View>
            </View>
          ))}
        </ScrollView>
        <ChunkyButton
          label={track.ready > 0 ? `Забрать ${track.ready} награды` : "Новых вех пока нет"}
          icon="bag"
          center
          onPress={() => { if (track.ready > 0) claimM.mutate(); }}
          style={{ marginTop: 12, opacity: track.ready > 0 ? 1 : 0.45 }}
        />
      </View>

      {/* ── Магазин монет ──────────────────────────────────────────────── */}
      <View style={card(colors, { marginBottom: 12, flexDirection: "row", gap: 9 })}>
        <Pressable
          onPress={() => shopM.mutate("mana")}
          style={{ flex: 1, alignItems: "center", padding: 10, borderRadius: radii.sm, backgroundColor: "rgba(99,102,241,0.1)" }}
        >
          <Glyph name="flask" size={19} color={colors.primary} />
          <Text style={{ fontSize: 12.5, fontWeight: "900", color: colors.foreground, marginTop: 5 }}>
            {shop.mana.label}
          </Text>
          <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{shop.mana.coins} монет</Text>
        </Pressable>
        <Pressable
          onPress={() => shopM.mutate("stamina")}
          style={{ flex: 1, alignItems: "center", padding: 10, borderRadius: radii.sm, backgroundColor: "rgba(245,158,11,0.12)" }}
        >
          <Glyph name="spark" size={19} color={accents.amber} />
          <Text style={{ fontSize: 12.5, fontWeight: "900", color: colors.foreground, marginTop: 5 }}>
            {shop.stamina.label}
          </Text>
          <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{shop.stamina.coins} монет</Text>
        </Pressable>
      </View>

      {/* ── Лиги ───────────────────────────────────────────────────────── */}
      <SectionLabel>Топ по урону</SectionLabel>
      <View style={{ flexDirection: "row", gap: 7, marginBottom: 10 }}>
        {data.leagues.map((l) => {
          const on = (league ?? me.league) === l.key;
          return (
            <Pressable
              key={l.key}
              onPress={() => setLeague(l.key)}
              style={{
                flex: 1, paddingVertical: 8, borderRadius: radii.pill, alignItems: "center",
                backgroundColor: on ? colors.primary : "rgba(120,110,170,0.1)",
              }}
            >
              <Text style={{ fontSize: 11.5, fontWeight: "900", color: on ? "#fff" : "#6b5f9c" }}>
                {l.title.replace(" лига", "")}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={card(colors, { marginBottom: 12, gap: 8 })}>
        {!shownLeague || shownLeague.rows.length === 0 ? (
          <Text style={{ fontSize: 12.5, lineHeight: 19, color: colors.mutedForeground }}>
            В этой лиге ещё никто не ударил. Первый удар — первое место.
          </Text>
        ) : (
          shownLeague.rows.map((row, i) => (
            <View key={row.userId} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{
                width: 22, fontSize: 13, fontWeight: "900",
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
      </View>

      {/* ── История ────────────────────────────────────────────────────── */}
      {data.history.length > 0 && (
        <>
          <SectionLabel>Прошлые рейды</SectionLabel>
          <View style={card(colors, { marginBottom: 12, gap: 9 })}>
            {data.history.map((h) => (
              <View key={h.weekKey} style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                <Glyph
                  name={h.status === "won" ? "trophy" : "medal"}
                  size={17}
                  color={h.status === "won" ? accents.gold : colors.mutedForeground}
                />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 12.5, fontWeight: "700", color: colors.foreground }}>
                  {h.bossName}
                </Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                  мой урон {h.myDamage.toLocaleString("ru-RU")}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      <ChunkyButton
        label="В упражнения — бить босса"
        icon="arrowRight"
        center
        onPress={() => router.push("/flashcards" as any)}
        style={{ marginTop: 4 }}
      />

      {/* ── Окна: сундук, награды, ошибка ─────────────────────────────── */}
      {!!data.chest && (
        <Modal
          title={data.chest.status === "won" ? "Босс повержен" : "Рейд закончился"}
          body={
            data.chest.status === "won"
              ? `${data.chest.bossName} пал. Ты нанёс ${data.chest.damage.toLocaleString("ru-RU")} урона — забирай золотой сундук.`
              : `${data.chest.bossName} выжил. Твои ${data.chest.damage.toLocaleString("ru-RU")} урона не пропали: держи утешительный сундук.`
          }
          action={data.chest.status === "won" ? "Открыть золотой сундук" : "Открыть серебряный сундук"}
          onAction={() => chestM.mutate(data.chest!.eventId)}
        />
      )}
      {!!chestText && (
        <Modal title="Сундук открыт" body={chestText} action="Отлично" onAction={() => setChestText(null)} />
      )}
      {!!granted && (
        <Modal
          title="Награды за вклад"
          body={granted.join("\n")}
          action="Забрал"
          onAction={() => setGranted(null)}
        />
      )}
      {!!problem && (
        <View style={{
          position: "absolute", left: 16, right: 16, bottom: screenBottom(insets) - 60,
          backgroundColor: "#3b1d4d", borderRadius: radii.md, padding: 12,
        }}>
          <Text style={{ color: "#fff", fontSize: 12.5, fontWeight: "700" }}>{problem}</Text>
        </View>
      )}
    </ScrollView>
  );
}

/** Кнопка спецатаки: цена маной, состояние «уже действует». */
function Ability({
  icon, title, about, cost, mana, active, activeText, onPress, busy,
}: {
  icon: GlyphName; title: string; about: string; cost: number; mana: number;
  active: boolean; activeText: string; onPress: () => void; busy: boolean;
}) {
  const colors = useColors();
  const enough = mana >= cost && !active && !busy;
  const press = React.useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: timing.press,
      easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER,
    }).start();

  return (
    <View style={{ paddingBottom: 6 }}>
      <View style={{
        position: "absolute", left: 0, right: 0, top: 6, bottom: 0,
        borderRadius: radii.md, backgroundColor: enough ? EDGE_LIGHT : "transparent",
      }} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={() => { if (enough) onPress(); }}
          onPressIn={() => { if (enough) set(6); }}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={`${title}. ${about}. Цена ${cost} маны`}
        >
          <View style={card(colors, {
            flexDirection: "row", alignItems: "center", gap: 11,
            opacity: enough || active ? 1 : 0.55,
          })}>
            <View style={{
              width: 42, height: 42, borderRadius: radii.sm,
              alignItems: "center", justifyContent: "center",
              backgroundColor: active ? "rgba(251,191,36,0.2)" : "rgba(99,102,241,0.12)",
            }}>
              <Glyph name={icon} size={20} color={active ? accents.gold : colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14.5, fontWeight: "900", color: colors.foreground }}>{title}</Text>
              <Text style={{ fontSize: 11.5, lineHeight: 17, color: colors.mutedForeground, marginTop: 2 }}>
                {about}
              </Text>
            </View>
            {active
              ? <Pill text={activeText} tone="soft" color={accents.gold} />
              : <Pill text={`${cost} маны`} tone="soft" color={colors.primary} />}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** Простое окно события: сундук, награды. */
function Modal({
  title, body, action, onAction,
}: { title: string; body: string; action: string; onAction: () => void }) {
  const colors = useColors();
  return (
    <View style={{
      position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
      alignItems: "center", justifyContent: "center", padding: 24,
      backgroundColor: "rgba(20,10,40,0.55)",
    }}>
      <View style={card(colors, { width: "100%", maxWidth: 340, padding: 20 })}>
        <Text style={{ fontSize: 19, fontWeight: "900", color: colors.foreground, letterSpacing: -0.4 }}>
          {title}
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 20, color: colors.mutedForeground, marginTop: 8 }}>
          {body}
        </Text>
        <ChunkyButton label={action} icon="check" center onPress={onAction} style={{ marginTop: 16 }} />
      </View>
    </View>
  );
}
