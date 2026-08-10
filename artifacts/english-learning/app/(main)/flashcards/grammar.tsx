// ─────────────────────────────────────────────────────────────────────────────
// Раздел «Составлять»: выбор режима.
//
// Три режима, каждый учит своему:
//   Неправильные глаголы — формы, которые надо просто помнить;
//   Времена             — правила: когда какая форма и почему;
//   Собери предложение  — порядок слов, самая частая беда после форм.
//
// ── Почему у времён отдельный выбор ─────────────────────────────────────────
// Тренировать все времена вперемешку почти бесполезно: ученик каждый раз
// угадывает форму заново. Правило закрепляется, когда задания идут подряд на
// ОДНО время — тогда закономерность видна, а не выводится с нуля на каждом
// задании.
//
// Рядом с названием стоит формула («I have worked · He has worked»). Это не
// украшение: по формуле время узнаётся, даже если название забыто.
//
// Времена выше уровня ученика не показываются вовсе. Запертая кнопка с замком в
// списке из шести штук раздражает и ничего не объясняет — на сервере такие
// времена просто не попадают в ответ.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { grammar, type GrammarMode, type TenseInfo } from "@/hooks/useGrammar";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { ChunkyButton, Pill, SectionLabel, Tile } from "@/components/ui/GameKit";
import { accents, gradients, radii } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";

/** Размер ведущего значка: одна колонка на весь экран, как в «Словах». */
const ICON = 46;

const MODE_ICON: Record<GrammarMode, GlyphName> = {
  verbs: "repeat",
  tense: "clock",
  build: "cards",
};

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

export default function GrammarHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const q = useQuery({ queryKey: ["grammar-overview"], queryFn: grammar.getOverview });
  const data = q.data;

  /** Какое время раскрыто: список правил показывается по нажатию. */
  const [openTense, setOpenTense] = React.useState<string | null>(null);

  const backToWords = React.useCallback(() => {
    router.replace("/flashcards");
  }, [router]);

  const start = React.useCallback((mode: GrammarMode, tense?: string) => {
    router.push(tense ? `/flashcards/grammar/${mode}?tense=${tense}` : `/flashcards/grammar/${mode}`);
  }, [router]);

  const tenses = data?.tenses.filter((t) => t.taskCount > 0) ?? [];

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: screenTop(insets),
        paddingBottom: screenBottom(insets),
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <Pressable
          onPress={backToWords}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          style={{ transform: [{ rotate: "180deg" }], padding: 4 }}
        >
          <Glyph name="chevron" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 27, fontWeight: "900", letterSpacing: -0.7, color: colors.foreground }}>
          Составлять
        </Text>
        {!!data?.level && <Pill text={`Уровень ${data.level}`} icon="rank" tone="gold" />}
      </View>

      {q.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : !data ? (
        <Tile glow={colors.destructive} style={{ padding: 18 }}>
          <Text style={{ fontSize: 15, fontWeight: "900", color: colors.destructive, marginBottom: 8 }}>
            Раздел не загрузился
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginBottom: 14 }}>
            {(q.error as any)?.message ?? "Проверь соединение и попробуй ещё раз."}
          </Text>
          <ChunkyButton label="Повторить" icon="repeat" center onPress={() => { void q.refetch(); }} />
        </Tile>
      ) : (
        <>
          {/* Режимы, кроме времён: у них один шаг до старта. */}
          {data.modes.filter((m) => m.id !== "tense").map((m) => (
            <Tile
              key={m.id}
              glow={accents.violetDeep}
              onPress={m.taskCount > 0 ? () => start(m.id) : undefined}
              style={{ padding: 15, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 13 }}
            >
              <LinearGradient
                colors={gradients.action as unknown as string[]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={{ width: ICON, height: ICON, borderRadius: radii.sm + 3, alignItems: "center", justifyContent: "center" }}
              >
                <Glyph name={MODE_ICON[m.id]} size={Math.round(ICON * 0.5)} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>{m.title}</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 3 }}>{m.subtitle}</Text>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 4, fontVariant: ["tabular-nums"] }}>
                  {m.taskCount > 0
                    ? `${m.taskCount} заданий на твоём уровне${m.verbCount ? ` · ${m.verbCount} глаголов` : ""}`
                    : "на твоём уровне пока нет заданий"}
                </Text>
              </View>
              <Glyph name="chevron" size={20} color={colors.mutedForeground} />
            </Tile>
          ))}

          {/* Времена: сначала выбор времени, потом заход. */}
          {tenses.length > 0 && (
            <>
              <SectionLabel style={{ marginTop: 8 }}>Времена</SectionLabel>
              <Text style={{ fontSize: 12, lineHeight: 18, color: colors.mutedForeground, marginBottom: 12 }}>
                Выбери одно время: задания пойдут подряд на его правила, и закономерность станет видна.
              </Text>

              {tenses.map((t: TenseInfo) => {
                const open = openTense === t.id;
                return (
                  <Tile key={t.id} glow={accents.indigoDeep} style={{ padding: 15, marginBottom: 12 }}>
                    <Pressable
                      onPress={() => setOpenTense(open ? null : t.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${t.title}: показать правило`}
                      style={{ flexDirection: "row", alignItems: "center", gap: 13 }}
                    >
                      <View style={{
                        width: ICON, height: ICON, borderRadius: radii.sm + 3,
                        backgroundColor: colors.primary + "18",
                        alignItems: "center", justifyContent: "center",
                      }}>
                        <Glyph name="clock" size={Math.round(ICON * 0.46)} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{t.title}</Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>{t.titleRu}</Text>
                        {/* Формула: по ней время узнаётся без названия. */}
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary, marginTop: 4 }}>
                          {t.formula}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 6 }}>
                        <Pill text={t.level} tone="soft" color={colors.primary} />
                        <Glyph name="chevron" size={18} color={colors.mutedForeground} />
                      </View>
                    </Pressable>

                    {open && (
                      <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
                        <Text style={{ fontSize: 13, lineHeight: 20, color: colors.foreground }}>{t.rule}</Text>
                        <Text style={{ fontSize: 12, fontWeight: "800", color: colors.mutedForeground, marginTop: 10, textTransform: "uppercase", letterSpacing: 1 }}>
                          Когда используется
                        </Text>
                        {t.usage.map((u, i) => (
                          <Text key={i} style={{ fontSize: 13, lineHeight: 20, color: colors.mutedForeground, marginTop: 4 }}>
                            {`· ${u}`}
                          </Text>
                        ))}
                        <Text style={{ fontSize: 12, lineHeight: 18, color: colors.mutedForeground, marginTop: 10 }}>
                          {`Слова-подсказки: ${t.markers.join(", ")}`}
                        </Text>
                      </View>
                    )}

                    <ChunkyButton
                      label={`Тренировать ${t.title}`}
                      icon="play"
                      center
                      onPress={() => start("tense", t.id)}
                      style={{ marginTop: 12 }}
                    />
                  </Tile>
                );
              })}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
