// «Марафон слов» — ЗАЛ ПОВТОРЕНИЙ выученного.
//
// Сюда попадают только слова уровня, доведённые до «выучено», и только те из
// них, у которых наступил срок. Всё остальное живёт в «Учить слова». Пустой
// марафон — нормальное состояние, а не ошибка: чем лучше ученик знает слово,
// тем позже оно вернётся.
//
// ── Три разных числа, которые легко перепутать ──────────────────────────────
//   totalWords    — сколько слов на уровне вообще;
//   answeredWords — на сколько ученик хоть раз отвечал (по ним полоса);
//   learnedCount  — сколько доведено до «выучено» (это и есть зал повторений);
//   dueNow        — сколько из выученных созрело прямо сейчас.
//
// Полоса показывает пройденные слова — то же, о чём её подпись. Раньше она
// заполнялась ПО ТОЧНОСТИ, а подпись говорила о пройденных: выходило «93%
// марафона пройдено» при 940 нетронутых словах.
//
// Точность считается по последним ответам, а не за всю биографию: иначе ученик,
// начинавший с ошибок, не мог отыграть порог никогда.
//
// ── Отсюда не выходят «сами собой» ──────────────────────────────────────────
// Единственный возврат — стрелка в шапке, и она ведёт в «Слова»
// (/flashcards/words), а не на вкладку: вкладка теперь оглавление режимов, то
// есть на шаг дальше того места, откуда ученик пришёл.
//
// Раньше на пустом марафоне (у новичка это первый же заход) стояла большая
// кнопка «Учить слова», которая вела на ту же вкладку: единственное действие
// экрана возвращало ровно туда, откуда пришёл, и всё вместе читалось как
// «кнопка марафона выкидывает назад». Теперь она ведёт прямо в сессию.
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

/**
 * Падение рендера этого экрана было НЕВИДИМЫМ.
 *
 * Своей ловушки у роута не было: при ошибке React разворачивал дерево, а
 * навигатор оставался на последнем живом экране — то есть на вкладке раздела.
 * Снаружи это выглядит как «нажимаю Марафон, меня выкидывает назад», и
 * докопаться до причины было нельзя: продовая сборка идёт без source maps.
 *
 * Expo Router подхватывает экспорт ErrorBoundary для конкретного роута. Тот же
 * приём стоит на вкладке раздела и на экране слов — здесь его просто забыли.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: "900", color: "#e11d48" }}>Марафон не открылся</Text>
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

  // Выход задан явным адресом, а не router.back(): в навигации по вкладкам
  // «назад» возвращает на ПЕРВУЮ вкладку («Задания»), а не на предыдущий экран.
  // Панель вкладок здесь скрыта, поэтому стрелка в шапке — единственный выход.
  const backToWords = React.useCallback(() => {
    router.replace("/flashcards/words");
  }, [router]);

  /** Пустой зал повторений отправляет учиться, а не обратно назад. */
  const goLearn = React.useCallback(() => {
    router.replace("/flashcards/session");
  }, [router]);

  // Один раз за заход уведомляем ученика, что он готов перейти на новый уровень.
  React.useEffect(() => {
    if (started || !data?.eligible || !data.nextLevel || notifiedRef.current) return;
    notifiedRef.current = true;
    const msg = `Отлично! Твоя точность на уровне ${data.level} — ${data.accuracy}%. Ты готов перейти на ${data.nextLevel}. Подтверди новый уровень тестом.`;
    // Встроенный браузер (Telegram, VK) умеет запрещать alert, и тогда вызов
    // бросает исключение. Ронять из-за поздравления целый экран нельзя.
    try {
      if (Platform.OS === "web") (globalThis as any).alert?.(msg);
      else Alert.alert("Новый уровень доступен", msg);
    } catch { /* поздравление не показалось — не повод ломать марафон */ }
  }, [started, data?.eligible, data?.nextLevel, data?.accuracy, data?.level]);

  // Стабильный загрузчик карточек для тренажёра: тянет свежий марафон и
  // приводит его к форме очереди (без «знакомства» — сразу тренировка).
  const loadQueue = React.useCallback(async (): Promise<TrainerQueue> => {
    const m = await fc.getMarathon();
    const cards = m.cards ?? [];
    return {
      deckId: -1,
      deckTitle: `Марафон ${m.level}`,
      isSystem: true,
      needsIntro: false,
      newCount: cards.filter((c) => c.isNew).length,
      reviewCount: cards.filter((c) => !c.isNew).length,
      wordsToday: m.wordsToday,
      dailyWordGoal: m.dailyWordGoal,
      goalReached: m.goalReached,
      cards,
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
            // точность после прогона.
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
  const donePct = data && data.totalWords > 0 ? data.answeredWords / data.totalWords : 0;
  const passing = data ? data.accuracy >= data.threshold : false;

  // Зал повторений. Старый сервер этих полей не присылал — тогда считаем по
  // самой очереди, чтобы обновление клиента не обогнало обновление сервера.
  //
  // Вопросительный знак после cards не лишний: `data?.cards.length` защищало
  // только от отсутствия data. Пустой массив сервер шлёт всегда, но одного
  // ответа без поля хватило бы, чтобы уронить весь экран.
  const learnedCount = data?.learnedCount ?? 0;
  const dueNow = data?.dueNow ?? data?.cards?.length ?? 0;
  // Сколько слов надо пройти для перехода. Раньше требовались ВСЕ.
  const answeredTarget = data?.answeredTarget ?? data?.totalWords ?? 0;
  const recentAnswers = data?.recentAnswers ?? 0;
  const minAnswers = data?.minAnswers ?? 0;
  const enoughAnswers = recentAnswers >= minAnswers;

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
        // Сетевую ошибку показываем текстом, а не пустотой: пустой экран
        // неотличим от «здесь ничего нет».
        <Tile glow={colors.destructive} style={{ padding: 18 }}>
          <Text style={{ fontSize: 15, fontWeight: "900", color: colors.destructive, marginBottom: 8 }}>
            Марафон не загрузился
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginBottom: 14 }}>
            {(q.error as any)?.message ?? "Проверь соединение и попробуй ещё раз."}
          </Text>
          <ChunkyButton label="Повторить" icon="repeat" center onPress={() => { void q.refetch(); }} />
        </Tile>
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
                {/* Точность считается по последним ответам, а не за всю историю —
                    так и подписано, иначе число выглядит взявшимся ниоткуда. */}
                <Text style={{ fontSize: 11, color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>
                  {recentAnswers > 0
                    ? `по последним ${recentAnswers} ${pluralRu(recentAnswers, "ответу", "ответам", "ответам")}`
                    : "пока нет ответов"}
                </Text>
              </View>
            </View>

            {/* Полоса показывает ПРОЙДЕННЫЕ СЛОВА — то же, о чём подпись ниже.
                Засечки порога здесь нет: порог относится к точности, а не к
                прогрессу, и размечать им эту полосу нечем. */}
            <XpBar progress={donePct} height={12} />
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 9, fontVariant: ["tabular-nums"] }}>
              Пройдено {data.answeredWords} из {data.totalWords} · выучено {learnedCount}
            </Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 3, fontVariant: ["tabular-nums"] }}>
              Для перехода на следующий уровень: пройти {answeredTarget} {pluralRu(answeredTarget, "слово", "слова", "слов")} и держать точность не ниже {data.threshold}%
            </Text>
            {!enoughAnswers && minAnswers > 0 && (
              <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 3, fontVariant: ["tabular-nums"] }}>
                Точность начнём засчитывать после {minAnswers} ответов — сейчас {recentAnswers}.
              </Text>
            )}
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
          ) : dueNow === 0 ? (
            // Повторять нечего. Кнопка ведёт УЧИТЬСЯ, а не назад: единственное
            // действие экрана не должно возвращать туда, откуда пришёл, — со
            // стороны это неотличимо от «выкинуло назад».
            <Tile glow={accents.violetDeep} style={{ padding: 18 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 9 }}>
                <Glyph name={learnedCount > 0 ? "trophy" : "compass"} size={19} color={colors.primary} />
                <Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>
                  {learnedCount > 0 ? "Всё повторено" : "Зал повторений пока пуст"}
                </Text>
              </View>
              <Text style={{ fontSize: 14, color: colors.mutedForeground, lineHeight: 21, marginBottom: 14 }}>
                {learnedCount > 0
                  ? `Все ${learnedCount} выученных ${pluralRu(learnedCount, "слово", "слова", "слов")} этого уровня повторены. Следующее вернётся, когда придёт срок: чем лучше ты знаешь слово, тем реже оно появляется.`
                  : "В марафон слово попадает после того, как ты его выучишь. Сейчас выученных слов нет — начнём учить, и они появятся здесь сами."}
              </Text>
              <ChunkyButton label="Учить слова" icon="play" chevron onPress={goLearn} />
            </Tile>
          ) : (
            <>
              {/* Без подписи: сколько повторить, сказано абзацем ниже. */}
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
                  Марафон повторяет слова, которые ты уже выучил. Сейчас к повторению готово {dueNow} из {learnedCount}; остальные вернутся по сроку.
                </Text>
              </View>
            </>
          )}

          {/* Строка состояния. Не украшение: по ней видно, ПОЧЕМУ экран
              выглядит именно так, и не приходится гадать, дошёл ли до
              устройства свежий ответ сервера. */}
          <Text style={{
            marginTop: 22, fontSize: 11, textAlign: "center",
            color: colors.mutedForeground, fontVariant: ["tabular-nums"],
          }}>
            {`Уровень ${data.level} · слов ${data.totalWords} · выучено ${learnedCount} · к повторению ${dueNow}`}
          </Text>
        </>
      )}
    </ScrollView>
  );
}
