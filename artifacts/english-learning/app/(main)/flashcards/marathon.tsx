// «Марафон слов»: прогон всех слов уровня знаний пользователя. Экран-обзор
// показывает точность и прогресс; при точности ≥ порога и пройденных всех словах
// приложение сообщает, что уровень можно повысить, и ведёт на тест-подтверждение
// (после верного прохождения теста уровень меняется — уже реализованная функция).
//
// Эмодзи на экране не используются: значки — глифы из своего набора.
// Оформление собрано из GameKit: физические кнопки, плитки с цветной тенью.
import React from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { fc } from "@/hooks/useFlashcards";
import type { TrainerQueue } from "@/hooks/useFlashcards";
import { WordTrainer } from "@/components/WordTrainer";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, Tile, XpBar } from "@/components/ui/GameKit";
import { accents, gradients, radii } from "@/constants/theme";

export default function MarathonScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [started, setStarted] = React.useState(false);
  const notifiedRef = React.useRef(false);

  const q = useQuery({ queryKey: ["fc-marathon"], queryFn: fc.getMarathon });
  const data = q.data;

  // Один раз за заход уведомляем ученика, что он готов перейти на новый уровень.
  React.useEffect(() => {
    if (started || !data?.eligible || !data.nextLevel || notifiedRef.current) return;
    notifiedRef.current = true;
    const msg = `Отлично! Твоя точность на уровне ${data.level} — ${data.accuracy}%. Ты готов перейти на ${data.nextLevel}. Подтверди новый уровень тестом.`;
    if (Platform.OS === "web") (globalThis as any).alert?.(msg);
    else Alert.alert("Новый уровень доступен", msg);
  }, [started, data?.eligible, data?.nextLevel, data?.accuracy, data?.level]);

  // Стабильный загрузчик карточек для тренажёра: тянет свежий марафон и
  // приводит его к форме очереди (без «знакомства» — сразу тренировка).
  const loadQueue = React.useCallback(async (): Promise<TrainerQueue> => {
    const m = await fc.getMarathon();
    return {
      deckId: -1,
      deckTitle: `Марафон ${m.level}`,
      isSystem: true,
      needsIntro: false,
      newCount: m.cards.filter((c) => c.isNew).length,
      reviewCount: m.cards.filter((c) => !c.isNew).length,
      wordsToday: m.wordsToday,
      dailyWordGoal: m.dailyWordGoal,
      goalReached: m.goalReached,
      cards: m.cards,
    };
  }, []);

  if (started) {
    return (
      <View style={{ flex: 1 }}>
        <WordTrainer
          loader={loadQueue}
          title={`Марафон ${data?.level ?? ""}`.trim()}
          onExit={() => {
            setStarted(false);
            notifiedRef.current = false; // после сессии снова разрешаем уведомление
            q.refetch();
            qc.invalidateQueries({ queryKey: ["fc-decks"] });
            qc.invalidateQueries({ queryKey: ["fc-stats"] });
            qc.invalidateQueries({ queryKey: ["gamification-stats"] });
          }}
        />
      </View>
    );
  }

  // ── экран-обзор ──
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, paddingBottom: 120 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 }}>
        {/* Стрелка «назад» — chevron из набора, развёрнутый на 180°. */}
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          hitSlop={10}
          style={{ transform: [{ rotate: "180deg" }], padding: 4 }}
        >
          <Glyph name="chevron" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={{ fontSize: 26, fontWeight: "900", letterSpacing: -0.5, color: colors.foreground }}>Марафон слов</Text>
      </View>

      {q.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : !data ? (
        <Text style={{ color: colors.mutedForeground }}>Не удалось загрузить марафон.</Text>
      ) : (
        <>
          {/* карточка уровня и точности */}
          <Tile glow={data.accuracy >= data.threshold ? accents.gold : accents.violetDeep} style={{ padding: 18, marginBottom: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {/* Уровень в градиентном шильде: главный объект экрана. */}
                <LinearGradient
                  colors={gradients.action as unknown as string[]}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={{ width: 52, height: 52, borderRadius: radii.sm + 3, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] }}
                >
                  <Glyph name="route" size={26} color="#fff" />
                </LinearGradient>
                <View>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 }}>Твой уровень</Text>
                  <Text style={{ fontSize: 24, fontWeight: "900", letterSpacing: -0.5, color: colors.foreground }}>{data.level}</Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 }}>Точность</Text>
                <Text style={{
                  fontSize: 24, fontWeight: "900", letterSpacing: -0.5, fontVariant: ["tabular-nums"],
                  color: data.accuracy >= data.threshold ? accents.amber : colors.foreground,
                }}>
                  {data.accuracy}%
                </Text>
              </View>
            </View>

            {/* прогресс точности относительно порога */}
            <View>
              <XpBar
                progress={data.accuracy / 100}
                height={12}
                colors={data.accuracy >= data.threshold ? [accents.gold, accents.amber] : undefined}
              />
              {/* Засечка порога прямо на полосе: видно, сколько ещё не хватает. */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute", top: -3, bottom: -3,
                  left: `${Math.min(100, data.threshold)}%`,
                  width: 2, borderRadius: 1,
                  backgroundColor: colors.foreground, opacity: 0.35,
                }}
              />
            </View>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 9, fontVariant: ["tabular-nums"] }}>
              Пройдено слов: {data.answeredWords} из {data.totalWords} · порог перехода — {data.threshold}%
            </Text>
          </Tile>

          {/* готовность к переходу на новый уровень */}
          {data.eligible && data.nextLevel && (
            <Tile glow={accents.gold} style={{ padding: 18, marginBottom: 16, backgroundColor: accents.gold + "14", borderColor: accents.gold + "55" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 9 }}>
                <Glyph name="trophy" size={19} color={accents.amber} />
                <Text style={{ fontSize: 15, fontWeight: "900", color: "#a16207" }}>Уровень пройден</Text>
              </View>
              <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 21, marginBottom: 14 }}>
                Твоя точность {data.accuracy}% — этого достаточно для перехода {data.level} → {data.nextLevel}. Подтверди новый уровень тестом, и появятся новые слова.
              </Text>
              <ChunkyButton
                label={`Пройти тест на ${data.nextLevel}`}
                icon="rank"
                tone="warm"
                onPress={() => router.push("/flashcards/placement")}
              />
            </Tile>
          )}

          {/* старт марафона */}
          {data.totalWords === 0 ? (
            <View style={{ alignItems: "center", marginTop: 30, gap: 12 }}>
              <Glyph name="tray" size={44} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, textAlign: "center", fontSize: 14 }}>
                Для уровня {data.level} пока нет слов в готовых колодах.
              </Text>
            </View>
          ) : (
            <>
              <ChunkyButton
                label="Начать марафон"
                sublabel={`${data.totalWords - data.answeredWords} слов ещё не пройдено`}
                icon="play"
                chevron
                onPress={() => setStarted(true)}
              />
              <View style={{ flexDirection: "row", gap: 9, alignItems: "flex-start", marginTop: 14 }}>
                <View style={{ marginTop: 1 }}>
                  <Glyph name="compass" size={15} color={colors.mutedForeground} />
                </View>
                <Text style={{ flex: 1, fontSize: 12, lineHeight: 18, color: colors.mutedForeground }}>
                  В марафоне встречаются все слова твоего уровня. Когда ты пройдёшь их все с точностью не ниже {data.threshold}%, откроется переход на следующий уровень.
                </Text>
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
