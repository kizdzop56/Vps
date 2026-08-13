// ─────────────────────────────────────────────────────────────────────────────
// Вкладка раздела: ВЫБОР РЕЖИМА.
//
// Раньше эта вкладка была сразу экраном слов. Пока режим был один, так и
// работало, но у раздела появились соседи — конструктор предложений,
// неправильные глаголы, времена, разговор со Снежей, — и деть их было некуда:
// либо кнопка среди колод (там она теряется), либо ещё одна вкладка в панели
// (места нет, и панель не резиновая).
//
// Поэтому вкладка стала оглавлением. Её работа — за один взгляд показать, что
// вообще есть в разделе, и увести внутрь.
//
// ── Куда ведут карточки ─────────────────────────────────────────────────────
// Слова, сборка предложений и разговор начинаются сразу: выбирать там нечего.
//
// Два режима ведут на ПРОМЕЖУТОЧНЫЙ экран, и в обоих случаях по одной причине —
// внутри есть выбор, который решает, будет ли занятие полезным:
//   • неправильные глаголы — сначала сами формы, потом они же в предложениях.
//     Вставлять форму в пропуск, не зная форм, — это угадывание;
//   • времена — гонять все времена вперемешку почти бесполезно, ученик каждый
//     раз выводит форму с нуля вместо того, чтобы увидеть закономерность.
//
// ── Ситуации от учителя больше НЕ отдельная карточка ────────────────────────
// Раньше они стояли последним режимом, рядом с «Разговором со Снежей». Два
// соседних входа в один и тот же разговор ученик читает как «одно и то же
// дважды»: он открывал то одно, то другое и не понимал, где задание.
//
// Теперь ситуации живут ВНУТРИ разговора со Снежей — там же, где сама Снежа, — а
// здесь о них сообщает метка на карточке разговора: «есть задание». Метка
// красная и с числом: задание от учителя не должно теряться среди тренажёров.
//
// ── Заглушки стоят в списке, а не спрятаны ──────────────────────────────────
// Режим без адреса показывается с подписью «Скоро»: карточка сразу говорит, что
// будет внутри. Сейчас таких нет, и раздел «Скоро» не рисуется вовсе — но
// механика оставлена, следующий режим снова начнётся с заглушки.
//
// Заглушка ОТЛИЧАЕТСЯ на ощупь: не проседает при нажатии, без стрелки, значок
// приглушён. Кнопка, которая выглядит рабочей и ничего не делает, раздражает
// сильнее, чем честно недоступная.
//
// ── Порядок карточек ────────────────────────────────────────────────────────
// Не по алфавиту и не по сложности разработки, а по порядку обучения: сначала
// слова (без них остальное бессмысленно), потом сборка фразы из готовых слов,
// потом формы глагола, потом времена — самое абстрактное. Разговор стоит
// последним намеренно: говорить имеет смысл, когда есть чем.
//
// Эмодзи не используются: значки — глифы из своего набора.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, Pressable, ScrollView, Animated, Easing, Platform,
  type ViewStyle, type StyleProp,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { ChunkyButton, Pill, SectionLabel } from "@/components/ui/GameKit";
import { accents, gradients, radii, timing } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";
import { freshScenarioCount, scenarios } from "@/hooks/useScenarios";

const NATIVE_DRIVER = Platform.OS !== "web";

/** Толщина нижней грани и цвет под светлой карточкой — как на других экранах. */
const EDGE = 6;
const EDGE_LIGHT = "#c9bdf0";

/** Размер значка режима. Один на все карточки: колонка должна быть ровной. */
const ICON = 52;

/** Режим раздела. */
type Mode = {
  key: string;
  title: string;
  /** Одна строка о том, что внутри. Без обещаний, которых экран не выполняет. */
  about: string;
  icon: GlyphName;
  /** Градиент плашки значка: разводит режимы по цвету, не только по иконке. */
  fill: readonly string[];
  /** Цвет нижней грани — тёмный тон того же градиента. */
  edge: string;
  /** Куда ведёт. Пусто — режим ещё не сделан. */
  href?: string;
};

const MODES: Mode[] = [
  {
    key: "words",
    title: "Слова",
    about: "Учить и повторять слова: карточки, письмо, произношение",
    icon: "cards",
    fill: gradients.action,
    edge: accents.indigoDeep,
    href: "/flashcards/words",
  },
  {
    key: "build",
    title: "Собери предложение",
    about: "Дан русский перевод — собираешь фразу из слов или пишешь сам",
    icon: "list",
    fill: ["#8b5cf6", "#6366f1"] as const,
    edge: accents.violetDeep,
    href: "/flashcards/grammar/build",
  },
  {
    key: "verbs",
    title: "Неправильные глаголы",
    // Порядок должен быть виден ДО нажатия: иначе ученик идёт вставлять формы,
    // которых ещё не знает.
    about: "Сначала сами формы (buy — bought), потом они же в предложениях",
    icon: "repeat",
    fill: gradients.fire,
    edge: "#b45309",
    href: "/flashcards/verbs",
  },
  {
    key: "tenses",
    title: "Времена",
    about: "Выбираешь время и тренируешь его правила. Ошибку разбираем подробно",
    icon: "clock",
    fill: ["#d946ef", "#a855f7"] as const,
    edge: "#86198f",
    // Не сразу в тренажёр: сначала выбор времени, см. шапку файла.
    href: "/flashcards/tenses",
  },
  {
    key: "tutor",
    title: "Разговор со Снежей",
    // Единственный режим, где отвечают голосом, — это и сказано первым словом.
    // Здесь же лежат ситуации от учителя: они внутри разговора, а не рядом.
    about: "Говоришь вслух, Снежа отвечает голосом. Здесь же задания-диалоги от учителя",
    icon: "sound",
    fill: ["#f472b6", "#db2777"] as const,
    edge: "#9d174d",
    href: "/flashcards/tutor",
  },
];

/**
 * Экран падал молча: при ошибке рендера React разворачивал дерево и вкладка
 * оставалась пустой, без подсказки о причине. Expo Router подхватывает экспорт
 * ErrorBoundary для конкретного роута, поэтому вместо пустоты видно текст
 * ошибки и кнопку повторной загрузки.
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

/** Корпус светлой карточки: общий вид для всех блоков раздела. */
function cardBody(colors: any, extra?: ViewStyle): ViewStyle {
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

export default function PracticeHub() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /** Какая заглушка раскрыта: подпись «в работе» показывается по нажатию. */
  const [asked, setAsked] = React.useState<string | null>(null);

  // Ситуации от учителя: нужны только ради метки на карточке разговора. Сам
  // список живёт внутри разговора со Снежей.
  const scenariosQ = useQuery({
    queryKey: ["scenarios-mine"],
    queryFn: scenarios.mine,
    // Учитель может выдать задание, пока приложение открыто.
    refetchOnMount: "always",
    staleTime: 15_000,
  });
  const waiting = freshScenarioCount(scenariosQ.data ?? []);

  const ready = MODES.filter((m) => m.href);
  const soon = MODES.filter((m) => !m.href);

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: screenTop(insets),
        paddingBottom: screenBottom(insets),
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={{ fontSize: 28, fontWeight: "900", letterSpacing: -0.7, color: colors.foreground }}>
        Учёба
      </Text>
      <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginTop: 5, marginBottom: 18 }}>
        Выбери, чем заняться сейчас
      </Text>

      {ready.map((mode) => {
        // Метка о заданиях от учителя висит на разговоре: ситуации теперь внутри
        // него, и узнать о них ученик должен здесь.
        const badge = mode.key === "tutor" && waiting > 0 ? waiting : 0;
        return (
          <ChunkyTap
            key={mode.key}
            color={mode.edge + "66"}
            onPress={() => router.push(mode.href as any)}
            style={{ marginBottom: 12 }}
            accessibilityLabel={badge > 0
              ? `${mode.title}. ${mode.about}. Заданий от учителя: ${badge}`
              : `${mode.title}. ${mode.about}`}
          >
            <View style={cardBody(colors, { flexDirection: "row", alignItems: "center", gap: 13 })}>
              <View>
                <LinearGradient
                  colors={mode.fill as unknown as string[]}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={{
                    width: ICON, height: ICON, borderRadius: radii.sm + 3,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Glyph name={mode.icon} size={Math.round(ICON * 0.5)} color="#fff" />
                </LinearGradient>

                {/* Счётчик на значке, а не строкой ниже: заметен боковым
                    зрением, как метка на календаре. */}
                {badge > 0 && (
                  <View style={{
                    position: "absolute", top: -6, right: -8,
                    backgroundColor: "#e11d48", borderRadius: 10,
                    minWidth: 20, height: 20, paddingHorizontal: 5,
                    alignItems: "center", justifyContent: "center",
                    borderWidth: 2, borderColor: "#ffffff",
                  }}>
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: "900", lineHeight: 14 }}>
                      {badge > 9 ? "9+" : badge}
                    </Text>
                  </View>
                )}
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <Text style={{ fontSize: 17, fontWeight: "900", color: colors.foreground, letterSpacing: -0.3 }}>
                    {mode.title}
                  </Text>
                  {badge > 0 && <Pill text="есть задание" tone="soft" color="#e11d48" />}
                </View>
                <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.mutedForeground, marginTop: 3 }}>
                  {mode.about}
                </Text>
              </View>
              <Glyph name="chevron" size={21} color={colors.mutedForeground} />
            </View>
          </ChunkyTap>
        );
      })}

      {soon.length > 0 && (
        <>
          <SectionLabel style={{ marginTop: 14 }}>Скоро</SectionLabel>
          {soon.map((mode) => (
            <View key={mode.key} style={{ marginBottom: 10 }}>
              {/* Заглушка без грани и без проседания: на ощупь сразу понятно,
                  что открывать нечего. Нажатие даёт пояснение, а не тишину. */}
              <Pressable
                onPress={() => setAsked((cur) => (cur === mode.key ? null : mode.key))}
                accessibilityRole="button"
                accessibilityLabel={`${mode.title}. ${mode.about}. Режим ещё готовится`}
              >
                <View style={cardBody(colors, {
                  flexDirection: "row", alignItems: "center", gap: 13,
                  backgroundColor: colors.card,
                  borderStyle: "dashed",
                  borderColor: "rgba(139,92,246,0.38)",
                  shadowOpacity: 0,
                  elevation: 0,
                })}>
                  {/* Приглушённая плашка вместо градиента: цвет — награда за
                      готовность, у недоступного режима его быть не должно. */}
                  <View style={{
                    width: ICON, height: ICON, borderRadius: radii.sm + 3,
                    alignItems: "center", justifyContent: "center",
                    backgroundColor: "rgba(160,140,220,0.16)",
                  }}>
                    <Glyph name={mode.icon} size={Math.round(ICON * 0.46)} color="rgba(91,79,142,0.55)" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <Text style={{ fontSize: 16, fontWeight: "800", color: colors.mutedForeground }}>
                        {mode.title}
                      </Text>
                      <Pill text="Скоро" tone="soft" color={colors.primary} />
                    </View>
                    <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.mutedForeground, marginTop: 3 }}>
                      {mode.about}
                    </Text>
                  </View>
                </View>
              </Pressable>

              {asked === mode.key && (
                <Text style={{
                  fontSize: 12, lineHeight: 17, color: colors.mutedForeground,
                  marginTop: 7, marginLeft: 4,
                }}>
                  Режим ещё готовится. Задания к нему пишутся под уровни A1–C1 и
                  вычитываются вручную — пустой тренажёр открывать смысла нет.
                </Text>
              )}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}
