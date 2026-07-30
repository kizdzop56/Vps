// «Марафон слов»: прогон всех слов уровня знаний пользователя. Экран-обзор
// показывает точность и прогресс; при точности ≥ порога и пройденных всех словах
// приложение сообщает, что уровень можно повысить, и ведёт на тест-подтверждение
// (после верного прохождения теста уровень меняется — уже реализованная функция).
import React from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Platform, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { fc } from "@/hooks/useFlashcards";
import type { TrainerQueue } from "@/hooks/useFlashcards";
import { WordTrainer } from "@/components/WordTrainer";

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
    else Alert.alert("Новый уровень доступен 🎉", msg);
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: "900", color: colors.foreground }}>Марафон слов</Text>
      </View>

      {q.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : !data ? (
        <Text style={{ color: colors.mutedForeground }}>Не удалось загрузить марафон.</Text>
      ) : (
        <>
          {/* карточка уровня и точности */}
          <View style={{ backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 20, marginBottom: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 34 }}>🏃</Text>
                <View>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, fontWeight: "700" }}>Твой уровень</Text>
                  <Text style={{ fontSize: 22, fontWeight: "900", color: colors.foreground }}>{data.level}</Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, fontWeight: "700" }}>Точность</Text>
                <Text style={{ fontSize: 22, fontWeight: "900", color: data.accuracy >= data.threshold ? colors.success : colors.foreground }}>
                  {data.accuracy}%
                </Text>
              </View>
            </View>

            {/* прогресс точности относительно порога */}
            <View style={{ height: 8, backgroundColor: "rgba(160,140,220,0.2)", borderRadius: 5, overflow: "hidden" }}>
              <View style={{ width: `${Math.min(100, data.accuracy)}%`, height: "100%", backgroundColor: data.accuracy >= data.threshold ? colors.success : colors.primary, borderRadius: 5 }} />
            </View>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 8 }}>
              Пройдено слов: {data.answeredWords} из {data.totalWords} · порог перехода — {data.threshold}%
            </Text>
          </View>

          {/* готовность к переходу на новый уровень */}
          {data.eligible && data.nextLevel && (
            <View style={{ backgroundColor: colors.success + "16", borderRadius: 18, borderWidth: 1, borderColor: colors.success + "55", padding: 18, marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Feather name="award" size={18} color={colors.success} />
                <Text style={{ fontSize: 15, fontWeight: "900", color: colors.success }}>Уровень пройден!</Text>
              </View>
              <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 20, marginBottom: 14 }}>
                Твоя точность {data.accuracy}% — этого достаточно для перехода {data.level} → {data.nextLevel}. Подтверди новый уровень тестом, и появятся новые слова.
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/flashcards/placement")}
                activeOpacity={0.85}
                style={{ backgroundColor: colors.success, borderRadius: 14, paddingVertical: 13, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
              >
                <Feather name="check-circle" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Пройти тест на {data.nextLevel}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* старт марафона */}
          {data.totalWords === 0 ? (
            <Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: 20 }}>
              Для уровня {data.level} пока нет слов в готовых колодах.
            </Text>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => setStarted(true)}
                activeOpacity={0.85}
                style={{ backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
              >
                <Feather name="play" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Начать марафон</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 14 }}>
                <Feather name="info" size={14} color={colors.mutedForeground} style={{ marginTop: 1 }} />
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
