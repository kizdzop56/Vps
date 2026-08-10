// ─────────────────────────────────────────────────────────────────────────────
// Выбор времени перед тренировкой.
//
// ── Зачем промежуточный экран ───────────────────────────────────────────────
// Тренировать все времена вперемешку почти бесполезно: ученик каждый раз выводит
// форму с нуля вместо того, чтобы увидеть закономерность. Правило закрепляется,
// когда задания идут подряд на ОДНО время.
//
// ── Он же справочник ────────────────────────────────────────────────────────
// У каждого времени на карточке стоит формула («I have worked · He has worked»),
// а по нажатию раскрываются правило, случаи употребления и слова-маркеры. Это не
// украшение: повторить теорию можно, не заходя в задания, а формула позволяет
// узнать время, даже если название забыто.
//
// ── Он же подсказывает, ЧТО брать ───────────────────────────────────────────
// Шесть времён на равных выбрать не помогают: ученик берёт первое или привычное,
// то есть как раз то, что уже умеет. Поэтому у каждого времени показана его
// собственная точность по последним ответам, а темы с проваленной точностью
// поднимаются наверх и помечаются.
//
// Порядок меняется только когда есть чем: пока ответов мало, список остаётся в
// программном порядке (от простого к сложному). Перетасовать его по двум
// случайным ошибкам — значит выдать шум за диагноз.
//
// Статистика грузится ОТДЕЛЬНЫМ запросом, и её отсутствие ничего не ломает:
// экран работает и без неё, просто без цифр. Ставить выбор темы в зависимость от
// второстепенного запроса нельзя.
//
// ── Чего здесь нет ──────────────────────────────────────────────────────────
// Времён выше уровня ученика: сервер их просто не отдаёт. Запертая кнопка с
// замком в списке из шести штук раздражает и ничему не учит.
//
// Эмодзи не используются: значки — глифы из своего набора.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { grammar, type TenseInfo, type TopicStat } from "@/hooks/useGrammar";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, Pill, Tile } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";

/** Размер значка: одна колонка на весь экран, как в оглавлении раздела. */
const ICON = 46;

/**
 * Падение этого экрана иначе выглядело бы как «кнопка не работает»: навигатор
 * остался бы на оглавлении. Такую же ловушку мы ставили на марафон.
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

export default function TensesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const q = useQuery({ queryKey: ["grammar-overview"], queryFn: grammar.getOverview });
  // Статистика второстепенна: без неё экран работает, просто без цифр.
  const statsQ = useQuery({ queryKey: ["grammar-stats"], queryFn: grammar.getStats });
  const data = q.data;

  /** Какое время раскрыто: правило показывается по нажатию, а не всё сразу. */
  const [open, setOpen] = React.useState<string | null>(null);

  // Возврат задан явным адресом: router.back() в навигации по вкладкам ведёт на
  // первую вкладку, а не на экран, откуда пришли.
  const back = React.useCallback(() => {
    router.replace("/flashcards");
  }, [router]);

  /** Точность по id времени. Пусто — ответов ещё не было. */
  const statByTense = React.useMemo(() => {
    const map = new Map<string, TopicStat>();
    for (const s of statsQ.data?.topics ?? []) {
      if (s.mode === "tense") map.set(s.topic, s);
    }
    return map;
  }, [statsQ.data]);

  // Слабое вперёд. Внутри групп порядок программный (как пришёл с сервера): от
  // простого времени к сложному.
  const tenses = React.useMemo(() => {
    const list = (data?.tenses ?? []).filter((t) => t.taskCount > 0);
    return [...list].sort((a, b) => {
      const wa = statByTense.get(a.id)?.weak ? 1 : 0;
      const wb = statByTense.get(b.id)?.weak ? 1 : 0;
      return wb - wa;
    });
  }, [data?.tenses, statByTense]);

  const weakCount = tenses.filter((t) => statByTense.get(t.id)?.weak).length;

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
        <Text style={{ flex: 1, fontSize: 27, fontWeight: "900", letterSpacing: -0.7, color: colors.foreground }}>
          Времена
        </Text>
        {!!data?.level && <Pill text={data.level} icon="rank" tone="gold" />}
      </View>

      <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginBottom: 16 }}>
        {weakCount > 0
          ? "Сверху — то, что пока даётся хуже всего. Нажми на карточку, чтобы повторить правило."
          : "Выбери одно время: задания пойдут подряд на его правила. Нажми на карточку, чтобы сначала повторить теорию."}
      </Text>

      {q.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : !data ? (
        <Tile glow={colors.destructive} style={{ padding: 18 }}>
          <Text style={{ fontSize: 15, fontWeight: "900", color: colors.destructive, marginBottom: 8 }}>
            Не загрузилось
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginBottom: 14 }}>
            {(q.error as any)?.message ?? "Проверь соединение и попробуй ещё раз."}
          </Text>
          <ChunkyButton label="Повторить" icon="repeat" center onPress={() => { void q.refetch(); }} />
        </Tile>
      ) : tenses.length === 0 ? (
        <View style={{ alignItems: "center", marginTop: 30, gap: 12 }}>
          <Glyph name="tray" size={44} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, textAlign: "center", fontSize: 14, lineHeight: 21 }}>
            Для твоего уровня заданий на времена пока нет. Они появятся, когда
            уровень подрастёт.
          </Text>
        </View>
      ) : (
        tenses.map((t: TenseInfo) => {
          const shown = open === t.id;
          const stat = statByTense.get(t.id);
          return (
            <Tile
              key={t.id}
              glow={stat?.weak ? colors.warning : accents.indigoDeep}
              style={{ padding: 15, marginBottom: 12 }}
            >
              <Pressable
                onPress={() => setOpen(shown ? null : t.id)}
                accessibilityRole="button"
                accessibilityLabel={`${t.title}: показать правило`}
                style={{ flexDirection: "row", alignItems: "center", gap: 13 }}
              >
                <View style={{
                  width: ICON, height: ICON, borderRadius: radii.sm + 3,
                  backgroundColor: (stat?.weak ? colors.warning : colors.primary) + "18",
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Glyph
                    name="clock"
                    size={Math.round(ICON * 0.46)}
                    color={stat?.weak ? colors.warning : colors.primary}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>{t.title}</Text>
                    {/* Метка только у слабых: пометить всё — значит не пометить
                        ничего. */}
                    {stat?.weak && <Pill text="нужно повторить" tone="warn" />}
                  </View>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>{t.titleRu}</Text>
                  {/* Формула: по ней время узнаётся без названия. */}
                  <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.primary, marginTop: 4 }}>
                    {t.formula}
                  </Text>
                  {/* Своя точность по этому времени. Строка появляется только
                      когда есть ответы: «0% по 0 ответам» — не информация. */}
                  {!!stat && stat.answers > 0 && (
                    <Text style={{ fontSize: 11.5, color: colors.mutedForeground, marginTop: 4, fontVariant: ["tabular-nums"] }}>
                      {`Точность ${stat.accuracy}% по последним ${stat.answers}`}
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Pill text={t.level} tone="soft" color={colors.primary} />
                  <Glyph name="chevron" size={18} color={colors.mutedForeground} />
                </View>
              </Pressable>

              {shown && (
                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
                  <Text style={{ fontSize: 13, lineHeight: 20, color: colors.foreground }}>{t.rule}</Text>

                  <Text style={{
                    fontSize: 11, fontWeight: "800", color: colors.mutedForeground,
                    marginTop: 12, textTransform: "uppercase", letterSpacing: 1,
                  }}>
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
                label="Тренировать"
                icon="play"
                center
                tone={stat?.weak ? "warm" : "primary"}
                onPress={() => router.push(`/flashcards/grammar/tense?tense=${t.id}`)}
                style={{ marginTop: 12 }}
              />
            </Tile>
          );
        })
      )}
    </ScrollView>
  );
}
