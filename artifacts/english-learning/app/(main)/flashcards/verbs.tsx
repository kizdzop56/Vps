// ─────────────────────────────────────────────────────────────────────────────
// Неправильные глаголы: выбор между формами и предложениями.
//
// ── Зачем экран ─────────────────────────────────────────────────────────────
// Раздел начинался сразу с предложений, куда надо вставить нужную форму. Это
// второй шаг, а первого не существовало: формы глагола негде было выучить, и
// незнакомый глагол в предложении оставлял ученику единственный выход — «Не
// знаю».
//
// Поэтому входа два, и порядок в них — сама подсказка, с чего начинать: формы
// стоят первыми и открыты по умолчанию.
//
// ── Почему переключатель, а не список карточек ──────────────────────────────
// Выбор ровно из двух, и это две стороны одного раздела, а не два разных
// раздела. Две карточки в столбик читались бы как «ещё два режима» — тогда
// непонятно, зачем они лежат внутри третьего.
//
// ── БУКВЫ ───────────────────────────────────────────────────────────────────
// Формы разложены по первой букве — столбиками, как в таблице в конце любого
// учебника. Раньше здесь была одна кнопка «Учить формы», и она выдавала
// двенадцать случайных глаголов со всего уровня: be, buy, forget, swim. Учить
// так неудобно, и главное — непонятно, где ты находишься и что уже закрыто.
//
// Просьба была буквальная: «если вкладка называется „глаголы на букву B“, там и
// должны попадаться глаголы на B». Так и сделано — сервер режет банк по букве и
// ничего чужого в заход не пускает.
//
// На каждой строке стоит объём группы («5 глаголов · 15 вопросов») и сколько в
// ней уже знакомо. Группы очень разные: на A1 буква S даёт четыре глагола, а
// буква M — один. Досыпать в мелкие группы соседние буквы нельзя, это ровно то,
// о чём просили не делать, поэтому объём просто написан — ученик выбирает,
// зная, что берёт.
//
// Закрытая буква (все глаголы знакомы) помечается галочкой и фиолетовым. Зелёный
// в палитре отсутствует намеренно: «готово» здесь фиолетовое.
//
// «Все буквы вперемешку» осталось отдельной кнопкой внизу и намеренно тише
// буквенных строк. Это не второй способ учить, а ПОВТОРЕНИЕ: когда буквы
// пройдены, спрашивать их вперемешку полезнее, чем столбиками — в жизни глагол
// не приходит с подсказкой «мы сейчас на букве B».
//
// ── Что показано, кроме кнопок ──────────────────────────────────────────────
// Сколько глаголов уже знакомо: по ним вопросы идут письмом, а не вариантами, и
// видеть, что счётчик двигается, полезнее любой мотивирующей надписи. И слабые
// глаголы отдельной строкой — как факт, а не как обещание: подборка их вперёд не
// выносит, и писать обратное значило бы соврать.
//
// Статистика грузится отдельным запросом, и её отсутствие ничего не ломает:
// экран работает и без неё, просто без цифр.
//
// Эмодзи не используются: значки — глифы из своего набора.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, Pressable, ScrollView, ActivityIndicator, Animated, Easing, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import {
  grammar,
  type GrammarModeInfo,
  type TopicStat,
  type VerbLetterGroup,
} from "@/hooks/useGrammar";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, Pill, SectionLabel, Tile } from "@/components/ui/GameKit";
import { accents, radii, timing } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";

const NATIVE_DRIVER = Platform.OS !== "web";

/** Нижняя грань буквенной строки и глубина нажатия. */
const EDGE = 5;
const EDGE_LIGHT = "#c9bdf0";

/** Вкладка раздела. Порядок здесь и есть порядок обучения. */
const TABS = [
  { key: "forms", label: "Формы глаголов" },
  { key: "verbs", label: "В предложениях" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Русское склонение по числу. */
function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 14) return forms[2];
  const last = abs % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/** Подпись «N заходов без повторов» — она же ответ на «а дальше что». */
function roundsLabel(batches: number): string {
  return `${batches} ${plural(batches, ["заход", "захода", "заходов"])} без повторов`;
}

/**
 * Падение этого экрана иначе выглядело бы как «кнопка не работает»: навигатор
 * остался бы на оглавлении.
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
      <ChunkyButton label="Попробовать снова" icon="repeat" center onPress={() => { void retry(); }} />
    </ScrollView>
  );
}

/**
 * Строка одной буквы: сама буква крупно, объём группы и прогресс по ней.
 *
 * Нижняя грань и проседание при нажатии — как у клавиш GameKit: строка
 * открывается, значит обязана вести себя как кнопка.
 */
function LetterRow({
  group, colors, onPress,
}: {
  group: VerbLetterGroup;
  colors: any;
  onPress: () => void;
}) {
  const press = React.useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to,
      duration: timing.press,
      easing: Easing.out(Easing.quad),
      useNativeDriver: NATIVE_DRIVER,
    }).start();

  const done = group.verbCount > 0 && group.knownVerbs >= group.verbCount;
  const percent = group.verbCount > 0
    ? Math.round((group.knownVerbs / group.verbCount) * 100)
    : 0;
  // «Готово» — фиолетовое: зелёного в палитре нет намеренно.
  const tint = done ? colors.success : colors.primary;

  return (
    <View style={{ paddingBottom: EDGE, marginBottom: 8 }}>
      <View style={{
        position: "absolute", left: 0, right: 0, top: EDGE, bottom: 0,
        borderRadius: radii.md, backgroundColor: done ? "#b9a7ea" : EDGE_LIGHT,
      }} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={onPress}
          onPressIn={() => set(EDGE)}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={`Неправильные глаголы на букву ${group.letter}`}
          style={{
            flexDirection: "row", alignItems: "center", gap: 13,
            backgroundColor: colors.card,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: done ? tint + "55" : colors.border,
            paddingVertical: 12,
            paddingHorizontal: 14,
            shadowColor: accents.violetDeep,
            shadowOffset: { width: 0, height: 5 },
            shadowOpacity: 0.12,
            shadowRadius: 13,
            elevation: 3,
          }}
        >
          {/* Сама буква. Она здесь главный ориентир, поэтому крупная. */}
          <View style={{
            width: 42, height: 42, borderRadius: radii.sm,
            backgroundColor: tint + "18",
            alignItems: "center", justifyContent: "center",
          }}>
            <Text style={{ fontSize: 20, fontWeight: "900", color: tint, letterSpacing: -0.5 }}>
              {group.letter}
            </Text>
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14.5, fontWeight: "800", color: colors.foreground }}>
              {`На букву ${group.letter}`}
            </Text>
            <Text style={{ fontSize: 11.5, color: colors.mutedForeground, marginTop: 2, fontVariant: ["tabular-nums"] }}>
              {`${group.verbCount} ${plural(group.verbCount, ["глагол", "глагола", "глаголов"])} · ${group.taskCount} ${plural(group.taskCount, ["вопрос", "вопроса", "вопросов"])}`}
            </Text>

            {/* Прогресс по группе: он же ответ на «я выучила эту букву или нет».
                Пустая полоса не рисуется — ноль лучше показать словом. */}
            {group.knownVerbs > 0 ? (
              <View style={{ marginTop: 7 }}>
                <View style={{ height: 6, backgroundColor: colors.muted, borderRadius: 3, overflow: "hidden" }}>
                  <View style={{ height: 6, width: `${percent}%` as any, backgroundColor: tint, borderRadius: 3 }} />
                </View>
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, marginTop: 4, fontVariant: ["tabular-nums"] }}>
                  {done
                    ? "все формы знакомы"
                    : `${group.knownVerbs} из ${group.verbCount} уже знаешь`}
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 5 }}>
                ещё не начата
              </Text>
            )}
          </View>

          {done
            ? <Glyph name="check" size={18} color={tint} />
            : <Glyph name="chevron" size={18} color={colors.mutedForeground} />}
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function IrregularVerbsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const q = useQuery({ queryKey: ["grammar-overview"], queryFn: grammar.getOverview });
  const statsQ = useQuery({ queryKey: ["grammar-stats"], queryFn: grammar.getStats });

  /** Формы открыты по умолчанию: с них раздел и начинается. */
  const [tab, setTab] = React.useState<TabKey>("forms");

  // Возврат задан явным адресом: router.back() в навигации по вкладкам ведёт на
  // первую вкладку, а не на экран, откуда пришли.
  const back = React.useCallback(() => {
    router.replace("/flashcards");
  }, [router]);

  const modeInfo = (id: string): GrammarModeInfo | undefined =>
    (q.data?.modes ?? []).find((m) => m.id === id);

  const forms = modeInfo("forms");
  const inSentences = modeInfo("verbs");
  const letters: VerbLetterGroup[] = q.data?.verbLetters ?? [];

  /** Слабые глаголы: показываем как факт, вперёд в подборке они не идут. */
  const weakVerbs: TopicStat[] = React.useMemo(
    () =>
      (statsQ.data?.weak ?? [])
        .filter((t) => t.mode === "forms" || t.mode === "verbs")
        .slice(0, 4),
    [statsQ.data],
  );

  const current = tab === "forms" ? forms : inSentences;
  const ready = (current?.taskCount ?? 0) > 0;

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: screenTop(insets),
        paddingBottom: screenBottom(insets),
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Pressable
          onPress={back}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          style={{ transform: [{ rotate: "180deg" }], padding: 4 }}
        >
          <Glyph name="chevron" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 25, fontWeight: "900", letterSpacing: -0.7, color: colors.foreground }}>
          Неправильные глаголы
        </Text>
        {!!q.data?.level && <Pill text={q.data.level} icon="rank" tone="gold" />}
      </View>

      {/* Переключатель. Выбранная вкладка приподнята и залита цветом карточки:
          видно, что нажато, не читая подписей. */}
      <View style={{
        flexDirection: "row",
        backgroundColor: colors.primary + "14",
        borderRadius: radii.pill,
        padding: 4,
        marginTop: 10,
        marginBottom: 16,
      }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t.label}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: radii.pill,
                alignItems: "center",
                backgroundColor: active ? colors.card : "transparent",
                shadowColor: accents.violetDeep,
                shadowOffset: { width: 0, height: active ? 3 : 0 },
                shadowOpacity: active ? 0.18 : 0,
                shadowRadius: active ? 8 : 0,
                elevation: active ? 2 : 0,
              }}
            >
              <Text style={{
                fontSize: 13.5,
                fontWeight: active ? "900" : "700",
                color: active ? colors.primary : colors.mutedForeground,
              }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {q.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : !q.data ? (
        <Tile glow={colors.destructive} style={{ padding: 18 }}>
          <Text style={{ fontSize: 15, fontWeight: "900", color: colors.destructive, marginBottom: 8 }}>
            Не загрузилось
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginBottom: 14 }}>
            {(q.error as any)?.message ?? "Проверь соединение и попробуй ещё раз."}
          </Text>
          <ChunkyButton label="Повторить" icon="repeat" center onPress={() => { void q.refetch(); }} />
        </Tile>
      ) : (
        <>
          {tab === "forms" ? (
            <>
              <Tile glow={accents.amber} style={{ padding: 16 }}>
                <Text style={{ fontSize: 17, fontWeight: "900", color: colors.foreground }}>
                  Сначала сами формы
                </Text>
                <Text style={{ fontSize: 13.5, lineHeight: 20, color: colors.mutedForeground, marginTop: 6 }}>
                  Три вопроса на глагол: как это будет по-английски, вторая форма и
                  третья. Пока глагол новый, ответ выбираешь из вариантов, дальше
                  пишешь сам.
                </Text>

                {/* Пример вместо описания: по нему сразу понятно, что внутри. */}
                <View style={{
                  marginTop: 12,
                  backgroundColor: colors.accent,
                  borderRadius: radii.sm,
                  padding: 12,
                }}>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary, letterSpacing: 1, textTransform: "uppercase" }}>
                    например
                  </Text>
                  <Text style={{ fontSize: 14.5, lineHeight: 22, color: colors.foreground, marginTop: 6 }}>
                    «покупать» — buy{"\n"}buy — вторая форма — bought{"\n"}buy — третья форма — bought
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {!!forms?.verbCount && (
                    <Pill text={`${forms.verbCount} глаголов`} tone="soft" color={colors.primary} />
                  )}
                  {/* Счётчик знакомых глаголов появляется, когда он не ноль: ноль в
                      таком месте — это упрёк, а не прогресс. */}
                  {!!forms?.knownVerbs && (
                    <Pill text={`${forms.knownVerbs} уже знаешь`} icon="check" tone="soft" color={colors.success} />
                  )}
                </View>
              </Tile>

              {/* ── Столбики по буквам ── */}
              {letters.length > 0 && (
                <View style={{ marginTop: 18 }}>
                  <SectionLabel>По буквам · {letters.length}</SectionLabel>
                  <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.mutedForeground, marginBottom: 12 }}>
                    Как в таблице в конце учебника. Внутри буквы попадаются только её
                    глаголы, и каждый следующий заход — другие.
                  </Text>

                  {letters.map((group) => (
                    <LetterRow
                      key={group.letter}
                      group={group}
                      colors={colors}
                      onPress={() =>
                        router.push(`/flashcards/grammar/forms?letter=${group.letter}` as any)
                      }
                    />
                  ))}
                </View>
              )}

              {/* Вперемешку — намеренно ниже и тише букв: это повторение, а не
                  второй способ учить. */}
              {ready && (
                <View style={{ marginTop: 10 }}>
                  <SectionLabel>Когда буквы пройдены</SectionLabel>
                  <ChunkyButton
                    label="Все буквы вперемешку"
                    sublabel={forms?.batches && forms.batches > 1
                      ? roundsLabel(forms.batches)
                      : `${q.data.sessionSize} вопросов за заход`}
                    icon="repeat"
                    tone="dark"
                    onPress={() => router.push("/flashcards/grammar/forms")}
                  />
                  <Text style={{ fontSize: 12, lineHeight: 18, color: colors.mutedForeground, marginTop: 9 }}>
                    В жизни глагол не приходит с подсказкой «мы сейчас на букве B»,
                    поэтому вперемешку сложнее и полезнее — но только после букв.
                  </Text>
                </View>
              )}
            </>
          ) : (
            <Tile glow={accents.indigoDeep} style={{ padding: 16 }}>
              <Text style={{ fontSize: 17, fontWeight: "900", color: colors.foreground }}>
                Форма в живом предложении
              </Text>
              <Text style={{ fontSize: 13.5, lineHeight: 20, color: colors.mutedForeground, marginTop: 6 }}>
                Вставить нужную форму в пропуск: написать самому или выбрать из
                вариантов. Имеет смысл, когда формы уже более-менее выучены —
                иначе это угадывание.
              </Text>

              <View style={{
                marginTop: 12,
                backgroundColor: colors.accent,
                borderRadius: radii.sm,
                padding: 12,
              }}>
                <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary, letterSpacing: 1, textTransform: "uppercase" }}>
                  например
                </Text>
                <Text style={{ fontSize: 14.5, lineHeight: 22, color: colors.foreground, marginTop: 6 }}>
                  My father ______ a new phone last week. (buy)
                </Text>
              </View>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {!!inSentences?.taskCount && (
                  <Pill text={`${inSentences.taskCount} предложений`} tone="soft" color={colors.primary} />
                )}
                {!!inSentences?.batches && inSentences.batches > 1 && (
                  <Pill text={roundsLabel(inSentences.batches)} tone="soft" color={colors.primary} />
                )}
              </View>

              <ChunkyButton
                label="Тренировать в предложениях"
                sublabel={ready ? `${q.data.sessionSize} заданий за заход` : undefined}
                icon="play"
                disabled={!ready}
                onPress={() => router.push("/flashcards/grammar/verbs")}
                style={{ marginTop: 14 }}
              />
            </Tile>
          )}

          {/* Слабые глаголы — общая строка для обеих вкладок: это то, чем стоит
              заняться, независимо от того, какой вход выбран. */}
          {weakVerbs.length > 0 && (
            <Tile glow={colors.warning} style={{ padding: 15, marginTop: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: "900", color: colors.foreground }}>
                Пока даются хуже всего
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {weakVerbs.map((t) => (
                  <Pill key={`${t.mode}:${t.topic}`} text={`${t.title} · ${t.accuracy}%`} tone="warn" />
                ))}
              </View>
              <Text style={{ fontSize: 12, lineHeight: 18, color: colors.mutedForeground, marginTop: 10 }}>
                Точность считается по последним ответам, так что она подрастёт
                сама, как только эти глаголы начнут получаться.
              </Text>
            </Tile>
          )}

          {!ready && (
            <Text style={{ fontSize: 13, lineHeight: 20, color: colors.mutedForeground, marginTop: 14 }}>
              Для твоего уровня заданий в этом режиме пока нет. Они появятся, когда
              уровень подрастёт.
            </Text>
          )}
        </>
      )}
    </ScrollView>
  );
}
