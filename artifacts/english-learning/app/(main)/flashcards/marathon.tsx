// «Марафон слов»: прогон всех слов уровня знаний пользователя. Экран-обзор
// показывает точность и прогресс; при точности ≥ порога и пройденных всех словах
// приложение сообщает, что уровень можно повысить, и ведёт на тест-подтверждение
// (после верного прохождения теста уровень меняется — уже реализованная функция).
//
// ── Точность и прогресс — РАЗНЫЕ величины ───────────────────────────────────
// Точность считается только по словам, на которые ученик уже отвечал: пока
// слово не показали, ответа по нему нет. Поэтому «точность 93%» при 120
// пройденных из 1060 — это честно, но рядом друг с другом два процента читаются
// как одно и то же.
//
// Раньше полоса заполнялась ПО ТОЧНОСТИ, а подпись под ней говорила о
// пройденных словах — выходило «93% марафона пройдено», хотя 940 слов не
// тронуты. Полоса обязана показывать то же, о чём говорит её подпись.
//
// Теперь: полоса = пройденные слова, а точность подписана числом отвеченных
// слов и порогом перехода. Порог относится к точности, поэтому и стоит рядом с
// ней, а не размечает полосу прогресса.
//
// ── На кнопке только действие ───────────────────────────────────────────────
// У «Начать марафон» нет подписи. Она сообщала «N слов ещё не пройдено» — ровно
// то же число, что стоит строкой выше в карточке уровня («Пройдено X из Y ·
// осталось N»). От текста на кнопке ждут действия, а не повторного отчёта.
//
// Эмодзи на экране не используются: значки — глифы из своего набора.
// Оформление собрано из GameKit: физические кнопки, плитки с цветной тенью.
//
// ГРАБЛИ: значок рядом с абзацем нельзя ставить на marginTop «на глаз» —
// высота глифа не равна размеру шрифта, и подгонка разъезжается при смене
// кегля. Значок кладём в коробку высотой в строку (HINT_LINE) и центрируем.
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

/** Подсказка под кнопкой: кегль, высота строки и размер значка-маркера. */
const HINT_SIZE = 12;
const HINT_LINE = 18;
const HINT_ICON = 14;

/** Русское склонение по числу. */
function pluralRu(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export default function MarathonScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [started, setStarted] = React.useState(false);
  const notifiedRef = React.useRef(false);

  const q = useQuery({ queryKey: ["fc-marathon"], queryFn: fc.getMarathon });
  const data = q.data;

  // Выход в раздел «Слова» задан явным адресом, а не router.back(). В навигации
  // по вкладкам «назад» возвращает на ПЕРВУЮ вкладку («Задания»), а не на
  // предыдущий экран. Здесь это особенно заметно: панель вкладок на марафоне
  // скрыта, и стрелка — единственный выход.
  const backToWords = React.useCallback(() => {
    router.replace("/flashcards");
  }, [router]);

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
            // Возвращаемся на обзор марафона — там сразу видно, как изменилась
            // точность после прогона. Это по-прежнему раздел «Слова».
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
  const left = data ? Math.max(0, data.totalWords - data.answeredWords) : 0;
  const donePct = data && data.totalWords > 0 ? data.answeredWords / data.totalWords : 0;
  const passing = data ? data.accuracy >= data.threshold : false;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, paddingBottom: 120 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 }}>
        {/* Стрелка «назад» — chevron из набора, развёрнутый на 180°. */}
        <Pressable
          onPress={backToWords}
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
          <Tile glow={passing ? accents.gold : accents.violetDeep} style={{ padding: 18, marginBottom: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {/* Шильд уровня стоит ровно: наклон остался от прежнего вида и
                    был единственным кривым элементом на экране. */}
                <LinearGradient
                  colors={gradients.action as unknown as string[]}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={{ width: 52, height: 52, borderRadius: radii.sm + 3, alignItems: "center", justifyContent: "center" }}
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
                  color: passing ? accents.amber : colors.foreground,
                }}>
                  {data.accuracy}%
                </Text>
                {/* Главное пояснение: точность посчитана НЕ по всему марафону, а
                    по тем словам, на которые ученик успел ответить. */}
                <Text style={{ fontSize: 11, color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>
                  по {data.answeredWords} {pluralRu(data.answeredWords, "слову", "словам", "словам")}
                </Text>
              </View>
            </View>

            {/* Полоса показывает ПРОЙДЕННЫЕ СЛОВА — то же, о чём подпись ниже.
                Засечки порога здесь нет: порог относится к точности, а не к
                прогрессу, и размечать им эту полосу нечем. */}
            <XpBar progress={donePct} height={12} />
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 9, fontVariant: ["tabular-nums"] }}>
              Пройдено {data.answeredWords} из {data.totalWords} · осталось {left}
            </Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 3, fontVariant: ["tabular-nums"] }}>
              Для перехода на следующий уровень: все слова и точность не ниже {data.threshold}%
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
              {/* Без подписи: сколько осталось, сказано строкой выше. */}
              <ChunkyButton
                label="Начать марафон"
                icon="play"
                chevron
                onPress={() => setStarted(true)}
              />
              <View style={{ flexDirection: "row", gap: 9, alignItems: "flex-start", marginTop: 14 }}>
                {/* Коробка ровно в высоту строки: центр значка совпадает с
                    центром первой строки абзаца при любом кегле. */}
                <View style={{ width: HINT_LINE, height: HINT_LINE, alignItems: "center", justifyContent: "center" }}>
                  <Glyph name="compass" size={HINT_ICON} color={colors.mutedForeground} />
                </View>
                <Text style={{ flex: 1, fontSize: HINT_SIZE, lineHeight: HINT_LINE, color: colors.mutedForeground }}>
                  В марафоне встречаются все слова твоего уровня. Точность считается по тем словам, на которые ты уже отвечал, — сейчас это {data.answeredWords} из {data.totalWords}.
                </Text>
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
