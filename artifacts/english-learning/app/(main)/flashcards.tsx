// ─────────────────────────────────────────────────────────────────────────────
// Главный экран раздела «Слова»: одна кнопка «Учить слова» (сквозная сессия по
// всем колодам), цель дня в словах, отработка сложных слов, библиотека готовых
// колод, собственные колоды и переходы к статистике / созданию колоды / тесту.
//
// ── Единая порода поверхностей ──────────────────────────────────────────────
// Экран говорит на том же языке, что профиль, календарь и рейтинг: у каждой
// карточки НИЖНЯЯ ГРАНЬ — отдельный слой под корпусом, сдвинутый вниз на свою
// толщину. Проседает при нажатии только то, что открывается: колода, группа
// уровня, плитки действий, «сложные слова». Цель дня грань имеет, но не
// проседает — там нечего открывать.
//
// Раньше всё было на Tile из GameKit: плоские карточки с цветной тенью. Рядом
// с объёмными блоками остального приложения они читались как незаконченные.
//
// Шапка экрана прижата к safe area через screenTop, а снизу стоит
// screenBottom: панель вкладок плавает ПОВЕРХ содержимого, и без отступа
// последняя колода уезжает под неё.
//
// ── Колоды ──────────────────────────────────────────────────────────────────
// Готовые колоды показываются двумя блоками:
//   • «Колоды по уровням» — колоды с заданным cefrLevel. Показывается уровень
//     ученика; он раскрыт по умолчанию.
//   • «Тематические колоды» — колоды без уровня: они охватывают сразу несколько
//     уровней (еда, животные, …), поэтому в уровневые группы не помещаются.
//
// Эмодзи на этом экране не используются: значок колоды рисует DeckGlyph — он
// подбирает иконку по ТЕМЕ из названия («Еда» → вилка, «Животные» → лапа), а
// первую букву показывает только для совсем непонятных названий. Поле
// deck.emoji в базе при этом не меняется.
//
// ── ГРАБЛИ ──────────────────────────────────────────────────────────────────
// 1. НЕ вкладывать <Text> в <Text>: в Safari это роняет весь экран целиком.
// 2. useNativeDriver только не в вебе.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, Pressable, TouchableOpacity, ScrollView, ActivityIndicator,
  RefreshControl, Animated, Easing, Platform,
  type ViewStyle, type StyleProp,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { fc, type DeckWithAssign } from "@/hooks/useFlashcards";
import { DeckGlyph } from "@/components/ui/DeckGlyph";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { ChunkyButton, GoalPips, Pill, SectionLabel } from "@/components/ui/GameKit";
import { accents, gradients, radii, timing } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";

const NATIVE_DRIVER = Platform.OS !== "web";

/** Толщина нижней грани и цвет под светлой карточкой — как в профиле. */
const EDGE = 5;
const EDGE_LIGHT = "#c9bdf0";

/**
 * Экран падал молча: при ошибке рендера React разворачивал дерево и вкладка
 * оставалась пустой, без подсказки о причине. Expo Router подхватывает
 * экспорт ErrorBoundary для конкретного роута, поэтому теперь вместо пустоты
 * видно текст ошибки и кнопку повторной загрузки — это же спасает пользователя
 * от «мёртвой» вкладки, если что-то отвалится в проде.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: "900", color: "#e11d48" }}>Экран не открылся</Text>
      <Text style={{ fontSize: 13, lineHeight: 20, color: "#5b4f8e" }}>
        {error?.message ?? "Неизвестная ошибка"}
      </Text>
      {!!error?.stack && (
        <Text style={{ fontSize: 10, lineHeight: 15, color: "#8b7fb0" }}>{error.stack}</Text>
      )}
      <TouchableOpacity
        onPress={() => { void retry(); }}
        style={{ alignSelf: "flex-start", backgroundColor: "#6366f1", borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 }}
      >
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Попробовать снова</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Объёмные оболочки ───────────────────────────────────────────────────────

/** Грань без проседания: для того, что не нажимается. */
function Chunky({
  color = EDGE_LIGHT, edge = EDGE, radius = radii.md, style, children,
}: {
  color?: string; edge?: number; radius?: number;
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

/** Грань + проседание: только там, где нажатие что-то открывает. */
function ChunkyTap({
  color = EDGE_LIGHT, edge = EDGE, radius = radii.md, onPress, style, accessibilityLabel, children,
}: {
  color?: string; edge?: number; radius?: number;
  onPress?: () => void; style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string; children: React.ReactNode;
}) {
  const press = React.useRef(new Animated.Value(0)).current;
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

/** Корпус светлой карточки: общий вид для всех блоков экрана. */
function cardBody(colors: any, extra?: ViewStyle): ViewStyle {
  return {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    shadowColor: accents.violetDeep,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
    ...extra,
  };
}

export default function FlashcardsHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const decksQ = useQuery({ queryKey: ["fc-decks"], queryFn: fc.getDecks });
  const settingsQ = useQuery({ queryKey: ["fc-settings"], queryFn: fc.getSettings });
  // Статистика нужна на главной для цели дня и числа сложных слов.
  const statsQ = useQuery({ queryKey: ["fc-stats"], queryFn: () => fc.getStats() });

  // Рефетч при фокусе: только когда данные реально устарели (isStale).
  // Раньше 3 запроса летели безусловно при каждом входе на вкладку, что
  // раздражало на медленной сети и загружало сервер без нужды.
  // Актуальность определяется staleTime (по умолчанию 5 минут, см. queryClient).
  const decksQRef = React.useRef(decksQ);
  const settingsQRef = React.useRef(settingsQ);
  const statsQRef = React.useRef(statsQ);
  decksQRef.current = decksQ;
  settingsQRef.current = settingsQ;
  statsQRef.current = statsQ;

  useFocusEffect(
    React.useCallback(() => {
      if (decksQRef.current.isStale) void decksQRef.current.refetch();
      if (settingsQRef.current.isStale) void settingsQRef.current.refetch();
      if (statsQRef.current.isStale) void statsQRef.current.refetch();
    }, [])
  );

  const decks = decksQ.data ?? [];
  // Колоды, назначенные учителем, — отдельная категория (см. DeckCard/бейдж
  // «От учителя» ниже). Раньше они молча попадали в «Мои колоды» вместе с
  // колодами, которые ученик создал сам: assigned-колода тоже !isSystem
  // (её владелец — учитель), и ученик не мог отличить одну от другой.
  const assignedDecks = decks.filter((d) => d.assigned);
  const systemDecks = decks.filter((d) => d.isSystem);
  const myDecks = decks.filter((d) => !d.isSystem && !d.assigned);
  const level = settingsQ.data?.placementLevel;

  // Уровневые колоды vs тематические (без cefrLevel) — см. комментарий к файлу.
  const levelDecks = systemDecks.filter((d) => d.cefrLevel);
  const themeDecks = systemDecks.filter((d) => !d.cefrLevel);

  // Пока тест уровня не пройден, считаем ученика начинающим и раскрываем A1.
  const myLevel = level ?? "A1";
  // Показываем только колоды уровня ученика — одна группа, без «следующего».
  // Тематические колоды (без cefrLevel) идут отдельным блоком ниже.
  const levelsWithDecks = [myLevel].filter((l) => levelDecks.some((d) => d.cefrLevel === l));

  // Раскрытие: null → уровень ученика раскрыт по умолчанию, остальные свёрнуты.
  const [openLevels, setOpenLevels] = React.useState<Record<string, boolean>>({});
  const isLevelOpen = (l: string) => openLevels[l] ?? l === myLevel;
  const toggleLevel = (l: string) =>
    setOpenLevels((s) => ({ ...s, [l]: !(s[l] ?? l === myLevel) }));

  const totalDue = decks.reduce((s, d) => s + d.dueCount, 0);
  const totalNew = decks.reduce((s, d) => s + d.newCount, 0);

  // Цель дня по словам и «сложные слова» приходят из статистики.
  const stats = statsQ.data;
  const wordsToday = stats?.wordsToday ?? 0;
  const dailyWordGoal = stats?.dailyWordGoal ?? settingsQ.data?.dailyWordGoal ?? 10;
  const goalReached = wordsToday >= dailyWordGoal;
  const hardCount = stats?.hardCount ?? 0;

  // Подпись главной кнопки: что именно ждёт в сессии. Цифры уже есть в данных,
  // раньше они просто не показывались — на кнопке они полезнее всего.
  const queueParts: string[] = [];
  if (totalDue > 0) queueParts.push(`${totalDue} ${pluralRu(totalDue, "повторение", "повторения", "повторений")}`);
  if (totalNew > 0) queueParts.push(`${totalNew} ${pluralRu(totalNew, "новое", "новых", "новых")}`);
  const sessionSublabel = queueParts.length
    ? queueParts.join(" · ")
    : "Все слова повторены — загляни позже";

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: screenTop(insets),
        paddingBottom: screenBottom(insets),
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={decksQ.isRefetching} onRefresh={() => { decksQ.refetch(); settingsQ.refetch(); statsQ.refetch(); }} />}
    >
      {/* Заголовок + уровень */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <Text style={{ fontSize: 28, fontWeight: "900", letterSpacing: -0.7, color: colors.foreground }}>Слова</Text>
        <Pressable onPress={() => router.push("/flashcards/placement")}>
          {/* Пройденный уровень — награда, поэтому золото. Непройденный тест —
              обычная метка-приглашение, не должен спорить с главной кнопкой. */}
          <Pill
            text={level ? `Уровень ${level}` : "Пройти тест"}
            icon="rank"
            tone={level ? "gold" : "soft"}
            color={level ? undefined : colors.primary}
            tilt={-2}
          />
        </Pressable>
      </View>

      {/* Главное действие */}
      <ChunkyButton
        label="Учить слова"
        sublabel={sessionSublabel}
        icon="play"
        chevron
        onPress={() => router.push("/flashcards/session")}
        style={{ marginBottom: 12 }}
      />

      {/* Цель дня: сегментами, а не полосой — закрытый сегмент виден сразу.
          Грань есть, проседания нет: блок ничего не открывает. */}
      <Chunky
        color={goalReached ? accents.gold + "66" : EDGE_LIGHT}
        style={{ marginBottom: 12 }}
      >
        <View style={cardBody(colors, goalReached
          ? { backgroundColor: accents.gold + "14", borderColor: accents.gold + "55" }
          : undefined)}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Glyph name={goalReached ? "check" : "target"} size={16} color={goalReached ? accents.amber : colors.primary} />
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>Цель дня</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: "900", color: goalReached ? accents.amber : colors.primary, fontVariant: ["tabular-nums"] }}>
              {wordsToday} / {dailyWordGoal}
            </Text>
          </View>
          <GoalPips value={wordsToday} target={dailyWordGoal} done={goalReached} />
        </View>
      </Chunky>

      {/* Сложные слова */}
      {hardCount > 0 && (
        <ChunkyTap
          color={colors.warning + "55"}
          onPress={() => router.push("/flashcards/hard")}
          style={{ marginBottom: 12 }}
          accessibilityLabel="Открыть сложные слова"
        >
          <View style={cardBody(colors, {
            flexDirection: "row", alignItems: "center", gap: 13,
            borderColor: colors.warning + "44",
          })}>
            {/* Плашка с глифом вместо эмодзи: цвет управляется темой, а не шрифтом ОС. */}
            <LinearGradient
              colors={gradients.fire as unknown as string[]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={{ width: 42, height: 42, borderRadius: radii.sm + 2, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-5deg" }] }}
            >
              <Glyph name="repeat" size={20} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>Сложные слова</Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                {hardCount} {pluralRu(hardCount, "слово", "слова", "слов")} с ошибками — потренируй отдельно
              </Text>
            </View>
            <Glyph name="chevron" size={20} color={colors.mutedForeground} />
          </View>
        </ChunkyTap>
      )}

      {/* Действия */}
      <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
        <ActionTile colors={colors} icon="chart" label="Статистика" onPress={() => router.push("/flashcards/stats")} />
        <ActionTile colors={colors} icon="plus" label="Своя колода" onPress={() => router.push("/flashcards/new-deck")} />
      </View>

      {/* Марафон слов: длинная цель, поэтому тон темнее главной кнопки —
          он не должен перетягивать внимание на себя. */}
      <ChunkyButton
        label="Марафон слов"
        sublabel={`Все слова уровня ${level ?? "A1"} · дойди до 75% и переходи выше`}
        icon="route"
        chevron
        tone="dark"
        onPress={() => router.push("/flashcards/marathon")}
        style={{ marginBottom: 18 }}
      />

      {decksQ.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : decksQ.isError ? (
        <Chunky color={colors.destructive + "55"} style={{ marginTop: 12 }}>
          <View style={cardBody(colors, {
            backgroundColor: colors.destructive + "12",
            borderColor: colors.destructive + "40",
            gap: 10,
          })}>
            <Text style={{ fontSize: 15, fontWeight: "800", color: colors.destructive }}>Колоды не загрузились</Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: colors.destructive }}>
              {(decksQ.error as any)?.message ?? "Проверьте соединение и попробуйте ещё раз."}
            </Text>
            <TouchableOpacity
              onPress={() => { decksQ.refetch(); settingsQ.refetch(); statsQ.refetch(); }}
              style={{ alignSelf: "flex-start", backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Повторить</Text>
            </TouchableOpacity>
          </View>
        </Chunky>
      ) : (
        <>
          {/* Назначенные учителем колоды — самый верх списка, ученик должен
              увидеть их сразу, не долистывая до колод по уровням. */}
          {assignedDecks.length > 0 && (
            <>
              <SectionLabel>От учителя</SectionLabel>
              {assignedDecks.map((d) => <DeckCard key={d.id} deck={d} colors={colors} onPress={() => router.push(`/flashcards/deck/${d.id}`)} />)}
              <View style={{ height: 8 }} />
            </>
          )}
          {myDecks.length > 0 && (
            <>
              <SectionLabel>Мои колоды</SectionLabel>
              {myDecks.map((d) => <DeckCard key={d.id} deck={d} colors={colors} onPress={() => router.push(`/flashcards/deck/${d.id}`)} />)}
              <View style={{ height: 8 }} />
            </>
          )}
          <SectionLabel>Колоды по уровням</SectionLabel>
          {levelsWithDecks.map((l) => (
            <LevelGroup
              key={l}
              colors={colors}
              level={l}
              isMyLevel={l === myLevel}
              open={isLevelOpen(l)}
              onToggle={() => toggleLevel(l)}
              decks={levelDecks.filter((d) => d.cefrLevel === l)}
              onOpenDeck={(id) => router.push(`/flashcards/deck/${id}`)}
            />
          ))}

          {themeDecks.length > 0 && (
            <>
              <View style={{ height: 8 }} />
              <SectionLabel>Тематические колоды</SectionLabel>
              {themeDecks.map((d) => <DeckCard key={d.id} deck={d} colors={colors} onPress={() => router.push(`/flashcards/deck/${d.id}`)} />)}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

/** Пара второстепенных действий под целью дня. */
function ActionTile({
  colors, icon, label, onPress,
}: { colors: any; icon: GlyphName; label: string; onPress: () => void }) {
  return (
    <ChunkyTap
      onPress={onPress}
      style={{ flex: 1 }}
      accessibilityLabel={label}
    >
      <View style={cardBody(colors, {
        flexDirection: "row", alignItems: "center", justifyContent: "center",
        gap: 9, paddingVertical: 14,
      })}>
        <Glyph name={icon} size={17} color={colors.primary} />
        <Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 14 }}>{label}</Text>
      </View>
    </ChunkyTap>
  );
}

function pluralRu(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function LevelGroup({
  colors, level, isMyLevel, open, onToggle, decks, onOpenDeck,
}: {
  colors: any;
  level: string;
  isMyLevel: boolean;
  open: boolean;
  onToggle: () => void;
  decks: DeckWithAssign[];
  onOpenDeck: (id: number) => void;
}) {
  const words = decks.reduce((s, d) => s + d.wordCount, 0);
  const learned = decks.reduce((s, d) => s + d.learnedCount, 0);
  const due = decks.reduce((s, d) => s + d.dueCount, 0);

  return (
    <View style={{ marginBottom: 10 }}>
      <ChunkyTap
        color={isMyLevel ? colors.primary + "4d" : EDGE_LIGHT}
        onPress={onToggle}
        accessibilityLabel={open ? `Свернуть уровень ${level}` : `Раскрыть уровень ${level}`}
      >
        <View style={cardBody(colors, {
          flexDirection: "row", alignItems: "center", gap: 12,
          borderColor: isMyLevel ? colors.primary + "44" : colors.border,
        })}>
          {/* Шильд уровня: у своего уровня — заливка градиентом, у остальных
              спокойная плашка, чтобы «мой уровень» читался с одного взгляда. */}
          {isMyLevel ? (
            <LinearGradient
              colors={gradients.action as unknown as string[]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={{ borderRadius: radii.sm, paddingHorizontal: 11, paddingVertical: 7, minWidth: 48, alignItems: "center" }}
            >
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>{level}</Text>
            </LinearGradient>
          ) : (
            <View style={{ backgroundColor: colors.primary + "1f", borderRadius: radii.sm, paddingHorizontal: 11, paddingVertical: 7, minWidth: 48, alignItems: "center" }}>
              <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 14 }}>{level}</Text>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>
              {decks.length} {pluralRu(decks.length, "колода", "колоды", "колод")}
              {isMyLevel ? " · ваш уровень" : ""}
            </Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
              {words} слов и фраз · выучено {learned}
            </Text>
          </View>
          {due > 0 && <Pill text={`${due}`} tone="solid" />}
          {/* Chevron из своего набора: вниз — раскрыто, вправо — свёрнуто. */}
          <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
            <Glyph name="chevron" size={20} color={colors.mutedForeground} />
          </View>
        </View>
      </ChunkyTap>

      {open && (
        <View style={{ marginTop: 8 }}>
          {decks.map((d) => (
            <DeckCard key={d.id} deck={d} colors={colors} onPress={() => onOpenDeck(d.id)} />
          ))}
        </View>
      )}
    </View>
  );
}

function DeckCard({ deck, colors, onPress }: { deck: DeckWithAssign; colors: any; onPress: () => void }) {
  const introduced = Math.max(0, deck.wordCount - deck.newCount);
  const learnedPct = deck.wordCount > 0 ? Math.round((deck.learnedCount / deck.wordCount) * 100) : 0;
  const startedPct = deck.wordCount > 0 ? Math.round((introduced / deck.wordCount) * 100) : 0;
  return (
    <ChunkyTap
      onPress={onPress}
      style={{ marginBottom: 10 }}
      accessibilityLabel={`Открыть колоду: ${deck.title}`}
    >
      <View style={cardBody(colors, {
        padding: 15, flexDirection: "row", alignItems: "center", gap: 14,
      })}>
        {/* Значок колоды: иконка по теме из названия, буква — крайний случай. */}
        <DeckGlyph title={deck.title} emoji={deck.emoji} size={48} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>{deck.title}</Text>
            {/* Колода, назначенная учителем, должна визуально отличаться от
                системных и собственных колод ученика. */}
            {deck.assigned && (
              <View style={{ backgroundColor: colors.primary + "18", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary }}>
                  {deck.ownerName ? `От ${deck.ownerName}` : "От учителя"}
                </Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 3 }}>
            {deck.wordCount} слов · начато {introduced} · выучено {deck.learnedCount}
          </Text>
          {/* Двойная полоса: светлая — начатые слова, тёмная — выученные. */}
          <View style={{ height: 7, backgroundColor: "rgba(160,140,220,0.2)", borderRadius: 4, marginTop: 9, overflow: "hidden" }}>
            <LinearGradient
              colors={[accents.lavender, "#A78BFA"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${startedPct}%`, borderRadius: 4 }}
            />
            <LinearGradient
              colors={["#A855F7", accents.violetDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${learnedPct}%`, borderRadius: 4 }}
            />
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 5 }}>
          {deck.dueCount > 0 && <Pill text={`${deck.dueCount}`} tone="solid" />}
          {deck.newCount > 0 && <Pill text={`+${deck.newCount}`} tone="warn" />}
          <Glyph name="chevron" size={20} color={colors.mutedForeground} />
        </View>
      </View>
    </ChunkyTap>
  );
}
