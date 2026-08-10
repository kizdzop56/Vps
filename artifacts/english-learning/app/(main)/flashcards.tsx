// ─────────────────────────────────────────────────────────────────────────────
// Главный экран раздела: ВЫБОР РЕЖИМА и списки колод.
//
// Наверху два равных по весу входа:
//   «Учить слова»           — сквозная сессия по всем колодам (карточки);
//   «Составлять предложения» — грамматика: неправильные глаголы, времена,
//                              порядок слов (см. flashcards/grammar.tsx).
//
// Ниже — отработка сложных слов, статистика, создание колоды, марафон и сами
// колоды.
//
// ── Почему вкладка не переименована ─────────────────────────────────────────
// Адрес /flashcards зашит в выходы из тренажёра, марафона, статистики и в
// возврат после сессии. Переезд ради заголовка сломал бы половину переходов в
// разделе — а по сути вкладка и так стала выбором режима.
//
// ── Единая порода поверхностей ──────────────────────────────────────────────
// Экран говорит на том же языке, что профиль, календарь и рейтинг: у каждой
// карточки НИЖНЯЯ ГРАНЬ — отдельный слой под корпусом, сдвинутый вниз на свою
// толщину. Здесь ВСЁ, что нажимается, ещё и проседает: колода, плитки
// действий, «сложные слова», кнопка повтора после ошибки. Кнопки без отдачи
// рядом с проседающими читаются как неработающие.
//
// У колод грань толще остальных карточек (EDGE_DECK): это главные объекты
// экрана, ради них сюда и заходят, и они должны выступать вперёд.
//
// Шапка экрана прижата к safe area через screenTop, а снизу стоит
// screenBottom: панель вкладок плавает ПОВЕРХ содержимого, и без отступа
// последняя колода уезжает под неё.
//
// ── Какие колоды здесь показываются ─────────────────────────────────────────
// Только три вида: присланные учителем, свои и ТЕМАТИЧЕСКИЕ.
//
// Уровневых колод (A1 · …, A2 · …) на экране нет вообще. В базе каталог
// разложен по уровням CEFR, и раньше экран показывал это как есть: группа
// «Колоды по уровням» разворачивалась в десяток строк, а следом шли ещё
// тематические. Список рос вместе с каталогом и превращался в кашу.
//
// Тематическая колода — системная колода БЕЗ cefrLevel (см. pickThemeDecks).
// Проверка именно по уровню, а не по названию: тема есть и у уровневых колод,
// поэтому при группировке по теме они лезли обратно в список и занимали места
// среди пятнадцати.
//
// Слова уровневых колод НЕ потеряны. Сквозная сессия («Учить слова») и
// «Марафон слов» читают все доступные колоды, включая скрытые misc_{level}:
// visibleDeckIds() на сервере колоды по видимости не фильтрует. Сессия
// подбирает новые слова по уровню подготовки ученика, марафон — строго по
// текущему уровню. То есть слова приходят сами, по мере роста уровня, и
// перебирать колоды руками не нужно.
//
// ── Одна колонка значков ────────────────────────────────────────────────────
// Все ведущие значки строк — ровно ICON пикселей и без наклона. Раньше размеры
// гуляли (48, 42, шильд по содержимому), а плашки были повёрнуты на несколько
// градусов — в списке из десятка строк левый край шёл лесенкой и выглядел как
// брак вёрстки, а не как приём.
//
// ── Чего здесь нет ──────────────────────────────────────────────────────────
// 1. Цели дня по словам. Она жила отдельной карточкой «Повторить N слов» и
//    дублировала задачу из «Цели дня» в профиле.
// 2. Счётчиков на главной кнопке. Подпись «N повторений · M новых» менялась
//    после каждого ответа и превращала кнопку в табло: цифры притягивали
//    взгляд сильнее самого действия, а пользы не несли — состав сессии
//    ученик всё равно узнаёт, когда её открывает.
// 3. Условий перехода на следующий уровень. Они стояли подписью на кнопке
//    марафона («дойди до 75%»), причём в устаревшем виде. Место условий — на
//    самом экране марафона, где показаны оба числа сразу.
// 4. Пояснения под заголовком тематических колод. Абзац объяснял устройство
//    системы там, где от экрана ждут список: три строки серого текста между
//    заголовком и первой колодой отодвигали главное вниз.
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
  View, Text, Pressable, ScrollView, ActivityIndicator,
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
import { ChunkyButton, Pill, SectionLabel } from "@/components/ui/GameKit";
import { accents, gradients, radii, timing } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";

const NATIVE_DRIVER = Platform.OS !== "web";

/** Толщина нижней грани и цвет под светлой карточкой — как в профиле. */
const EDGE = 5;
/** Колоды — главный объект экрана, у них грань толще. */
const EDGE_DECK = 7;
const EDGE_LIGHT = "#c9bdf0";

/** Размер ведущего значка строки. Один на весь экран: колонка должна быть ровной. */
const ICON = 46;

/** Потолок списка тем. Больше — снова каша, ради которой всё и затевалось. */
const THEME_LIMIT = 15;

/**
 * Тематические колоды экрана.
 *
 * Берём только системные колоды БЕЗ уровня: наличие cefrLevel — это ровно
 * признак уровневой колоды каталога, а такие на экране не показываются. По теме
 * дополнительно схлопываем дубликаты (одна строка на тему) и режем список по
 * THEME_LIMIT: тем в каталоге может стать больше, экран от этого длиннее стать
 * не должен. Оставляем самые наполненные темы, показываем по алфавиту — порядок
 * не должен прыгать после каждого выученного слова.
 */
function pickThemeDecks(systemDecks: DeckWithAssign[]): DeckWithAssign[] {
  const byTheme = new Map<string, DeckWithAssign>();
  for (const d of systemDecks) {
    if (d.cefrLevel) continue; // уровневая колода — не тема
    const key = (d.theme ?? d.title).trim().toLowerCase();
    if (!key) continue;
    const cur = byTheme.get(key);
    if (!cur || d.wordCount > cur.wordCount) byTheme.set(key, d);
  }

  return [...byTheme.values()]
    .sort((a, b) => b.wordCount - a.wordCount || a.title.localeCompare(b.title, "ru"))
    .slice(0, THEME_LIMIT)
    .sort((a, b) => a.title.localeCompare(b.title, "ru"));
}

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
  // Статистика нужна на главной ради числа сложных слов.
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

  // Тематические колоды: системные без уровня, по одной на тему.
  const themeDecks = React.useMemo(
    () => pickThemeDecks(systemDecks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [decksQ.data],
  );

  const hardCount = statsQ.data?.hardCount ?? 0;

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
          />
        </Pressable>
      </View>

      {/* ── Выбор режима ──────────────────────────────────────────────────────
          Два входа, оба главные. Слова — это запас, грамматика — то, как из
          этого запаса собирается речь; одно без другого не работает, поэтому
          ни один из режимов не задвинут в мелкую строчку. */}
      <ChunkyButton
        label="Учить слова"
        sublabel={`Слова по твоему уровню · вперемешку с повторением`}
        icon="play"
        chevron
        onPress={() => router.push("/flashcards/session")}
        style={{ marginBottom: 12 }}
      />

      <ChunkyButton
        label="Составлять предложения"
        sublabel="Неправильные глаголы · времена · порядок слов"
        icon="pen"
        chevron
        tone="warm"
        onPress={() => router.push("/flashcards/grammar")}
        style={{ marginBottom: 12 }}
      />

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
            {/* Плашка ровно того же размера, что значок колоды: значки всех
                строк экрана стоят одной колонкой. */}
            <LinearGradient
              colors={gradients.fire as unknown as string[]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={{ width: ICON, height: ICON, borderRadius: radii.sm + 3, alignItems: "center", justifyContent: "center" }}
            >
              <Glyph name="repeat" size={Math.round(ICON * 0.5)} color="#fff" />
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
          он не должен перетягивать внимание на себя.

          Подпись говорит, ЧТО это, и ничего не обещает. Прежняя («Все слова
          уровня A1 · дойди до 75% и переходи выше») была неверна дважды: в
          марафон попадают только выученные слова с наступившим сроком, а 75% —
          это порог точности, у которого есть ещё и второе условие. Оба числа
          показаны на самом экране марафона, где им и место. */}
      <ChunkyButton
        label="Марафон слов"
        sublabel={`Повторение выученных слов уровня ${level ?? "A1"}`}
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
            gap: 12,
          })}>
            <Text style={{ fontSize: 15, fontWeight: "800", color: colors.destructive }}>Колоды не загрузились</Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: colors.destructive }}>
              {(decksQ.error as any)?.message ?? "Проверьте соединение и попробуйте ещё раз."}
            </Text>
            <ChunkyButton
              label="Повторить"
              icon="repeat"
              center
              onPress={() => { decksQ.refetch(); settingsQ.refetch(); statsQ.refetch(); }}
            />
          </View>
        </Chunky>
      ) : (
        <>
          {/* Присланные учителем колоды — самый верх списка: это личное задание
              ученику, оно не должно теряться среди тем. */}
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

          {themeDecks.length > 0 && (
            <>
              <SectionLabel>Тематические колоды</SectionLabel>
              {themeDecks.map((d) => <DeckCard key={d.id} deck={d} colors={colors} onPress={() => router.push(`/flashcards/deck/${d.id}`)} />)}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

/** Пара второстепенных действий под главной кнопкой. */
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

function DeckCard({ deck, colors, onPress }: { deck: DeckWithAssign; colors: any; onPress: () => void }) {
  const introduced = Math.max(0, deck.wordCount - deck.newCount);
  const learnedPct = deck.wordCount > 0 ? Math.round((deck.learnedCount / deck.wordCount) * 100) : 0;
  const startedPct = deck.wordCount > 0 ? Math.round((introduced / deck.wordCount) * 100) : 0;
  return (
    <ChunkyTap
      edge={EDGE_DECK}
      onPress={onPress}
      style={{ marginBottom: 10 }}
      accessibilityLabel={`Открыть колоду: ${deck.title}`}
    >
      <View style={cardBody(colors, {
        padding: 15, flexDirection: "row", alignItems: "center", gap: 13,
      })}>
        {/* Значок колоды: иконка по теме из названия, буква — крайний случай.
            Размер общий для всех строк экрана — колонка значков ровная. */}
        <DeckGlyph title={deck.title} emoji={deck.emoji} size={ICON} />
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
