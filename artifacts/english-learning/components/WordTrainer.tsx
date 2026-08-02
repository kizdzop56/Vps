// Тренажёр слов: одно упражнение на экран, мгновенная реакция, итоги в конце.
//
// Раньше тренировка была одна — перевернуть карточку и самому нажать «знаю» или
// «учить». Ребёнок видел перевод и был уверен, что знал слово, хотя вспомнить сам
// не мог. Теперь упражнение подбирает сервер по уровню памяти слова
// (api-server/src/lib/wordExercise.ts), а здесь оно показывается:
//
//   знакомство — карточка с картинкой, переводом, примером и озвучкой;
//   выбор перевода (EN→RU) — узнавание;
//   выбор слова (RU→EN) — припоминание;
//   аудирование — только озвучка, выбрать перевод;
//   собери слово — буквы тапом, без клавиатуры (детям так проще).
//
// Оценку ученик не выставляет: на сервер уходит сам ответ (верно/неверно, число
// попыток, время, была ли подсказка), а оценку по нему считает srs.ts.
import React from "react";
import { View, Text, TouchableOpacity, Animated, ActivityIndicator, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { fc, speakWord, speechAvailable } from "@/hooks/useFlashcards";
import type { Exercise, ExerciseType, Grade, TrainerCard, TrainerQueue } from "@/hooks/useFlashcards";

const TRAINER_BACKGROUND = "#F8F7FF";
const OK_GREEN = "#16a34a";
const NEXT_DELAY_OK = 750;   // пауза после верного ответа
const NEXT_DELAY_BAD = 1900; // после ошибки даём время прочитать верный ответ

type Phase = "loading" | "run" | "done";
// retry — промежуточная реакция на первую ошибку в сборке слова: даём собрать
// заново, поэтому верный ответ показывать нельзя.
type Feedback = { correct: boolean; picked?: number; retry?: boolean } | null;

export function WordTrainer({
  loader,
  title,
  onExit,
  onFinished,
}: {
  loader: () => Promise<TrainerQueue>;
  title?: string;
  onExit: () => void;
  /** Вызывается один раз после завершения сессии — обновить экраны со статистикой. */
  onFinished?: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [queue, setQueue] = React.useState<TrainerQueue | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<Phase>("loading");
  const [cards, setCards] = React.useState<TrainerCard[]>([]);
  const [pos, setPos] = React.useState(0);

  // знакомство: перевод скрыт до нажатия
  const [revealed, setRevealed] = React.useState(false);
  // выбор варианта / сборка слова
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [built, setBuilt] = React.useState<number[]>([]);
  const [hintUsed, setHintUsed] = React.useState(false);
  const [attempts, setAttempts] = React.useState(1);

  // итоги сессии
  const [answered, setAnswered] = React.useState(0);
  const [correctCount, setCorrectCount] = React.useState(0);
  const [points, setPoints] = React.useState(0);
  const [learned, setLearned] = React.useState(0);
  const [progress, setProgress] = React.useState<{ wordsToday: number; dailyWordGoal: number } | null>(null);

  const shownAt = React.useRef<number>(Date.now());
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = React.useRef(false);
  const barWidth = React.useRef(new Animated.Value(0)).current;

  const card = cards[pos];
  const exercise: Exercise = card?.exercise ?? { type: "intro", prompt: card?.english ?? "" };
  const total = cards.length;

  // ── загрузка очереди ──
  React.useEffect(() => {
    let alive = true;
    loader()
      .then((q) => {
        if (!alive) return;
        setQueue(q);
        setCards(q.cards ?? []);
        if (q.wordsToday !== undefined && q.dailyWordGoal !== undefined) {
          setProgress({ wordsToday: q.wordsToday, dailyWordGoal: q.dailyWordGoal });
        }
        setPhase((q.cards ?? []).length === 0 ? "done" : "run");
      })
      .catch(() => alive && setError("Не удалось загрузить слова."));
    return () => { alive = false; };
  }, [loader]);

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // прогресс-бар сверху
  React.useEffect(() => {
    Animated.timing(barWidth, {
      toValue: total > 0 ? Math.min(1, pos / total) : 0,
      duration: 260,
      useNativeDriver: false,
    }).start();
  }, [pos, total, barWidth]);

  // Озвучка при показе карточки: слово ребёнок должен услышать, а в аудировании
  // это вообще единственная подсказка.
  React.useEffect(() => {
    if (phase !== "run" || !card) return;
    shownAt.current = Date.now();
    if (!speechAvailable()) return;
    if (exercise.type === "intro" || exercise.type === "choiceRu" || exercise.type === "listen") {
      speakWord(card.id, card.english);
    }
  }, [phase, pos, card?.id]);

  React.useEffect(() => {
    if (phase === "done" && !finishedRef.current) {
      finishedRef.current = true;
      onFinished?.();
    }
  }, [phase, onFinished]);

  const resetCardState = React.useCallback(() => {
    setRevealed(false);
    setFeedback(null);
    setBuilt([]);
    setHintUsed(false);
    setAttempts(1);
  }, []);

  const goNext = React.useCallback(() => {
    resetCardState();
    const next = pos + 1;
    if (next >= cards.length) setPhase("done");
    else setPos(next);
  }, [pos, cards.length, resetCardState]);

  /** Отправить результат карточки и перейти к следующей. */
  const submit = React.useCallback(
    (payload: { correct: boolean } | { grade: Grade }, mode: ExerciseType, delay: number) => {
      if (!card) return;
      const isCorrect = "correct" in payload ? payload.correct : payload.grade !== "again";
      setAnswered((n) => n + 1);
      if (isCorrect) setCorrectCount((n) => n + 1);

      const body = "correct" in payload
        ? { answer: { correct: payload.correct, attempts, elapsedMs: Date.now() - shownAt.current, hintUsed }, mode }
        : { grade: payload.grade, mode };

      fc.review(card.id, body)
        .then((out) => {
          setPoints((p) => p + (out.pointsEarned ?? 0));
          if (out.justLearned) setLearned((n) => n + 1);
          if (out.dailyWordGoal !== undefined) {
            setProgress({ wordsToday: out.wordsToday, dailyWordGoal: out.dailyWordGoal });
          }
        })
        .catch(() => { /* сеть могла мигнуть — тренировку не прерываем */ });

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(goNext, delay);
    },
    [card, attempts, hintUsed, goNext],
  );

  // ── обработчики упражнений ──
  const pickOption = React.useCallback((index: number) => {
    if (feedback || !card) return;
    const correct = index === exercise.answerIndex;
    setFeedback({ correct, picked: index });
    submit({ correct }, exercise.type, correct ? NEXT_DELAY_OK : NEXT_DELAY_BAD);
    if (correct && speechAvailable() && exercise.type !== "intro") speakWord(card.id, card.english);
  }, [feedback, card, exercise, submit]);

  const answerLetters = React.useMemo(() => (exercise.answer ?? "").toLowerCase().split(""), [exercise.answer]);
  const builtWord = built.map((i) => exercise.letters?.[i] ?? "").join("");

  const tapLetter = React.useCallback((index: number) => {
    if (feedback) return;
    const letters = exercise.letters ?? [];
    const next = [...built, index];
    setBuilt(next);
    if (next.length < answerLetters.length) return;

    const word = next.map((i) => letters[i] ?? "").join("");
    const correct = word === answerLetters.join("");
    if (!correct && attempts < 2) {
      // первая ошибка в сборке — даём собрать заново, оценка станет «трудно»
      setAttempts(2);
      setBuilt([]);
      setFeedback({ correct: false, retry: true });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setFeedback(null), 900);
      return;
    }
    setFeedback({ correct });
    submit({ correct }, "build", correct ? NEXT_DELAY_OK : NEXT_DELAY_BAD);
    if (correct && card && speechAvailable()) speakWord(card.id, card.english);
  }, [feedback, exercise.letters, built, answerLetters, attempts, submit, card]);

  const undoLetter = React.useCallback(() => {
    if (feedback) return;
    setBuilt((b) => b.slice(0, -1));
  }, [feedback]);

  const showHint = React.useCallback(() => {
    setHintUsed(true);
    setAttempts((a) => Math.max(a, 2));
  }, []);

  // ── экраны состояний ──
  if (error) {
    return (
      <Centered background={TRAINER_BACKGROUND}>
        <Text style={{ color: colors.foreground, textAlign: "center" }}>{error}</Text>
        <BigButton label="Закрыть" onPress={onExit} colors={colors} />
      </Centered>
    );
  }

  if (phase === "loading") {
    return <Centered background={TRAINER_BACKGROUND}><ActivityIndicator size="large" color={colors.primary} /></Centered>;
  }

  if (phase === "done") {
    return (
      <SessionSummary
        colors={colors}
        insets={insets}
        answered={answered}
        correctCount={correctCount}
        points={points}
        learned={learned}
        progress={progress}
        emptyQueue={total === 0}
        onExit={onExit}
      />
    );
  }

  const isIntro = exercise.type === "intro";
  const isBuild = exercise.type === "build";
  const isListen = exercise.type === "listen";
  const promptLabel = PROMPT_LABEL[exercise.type];

  return (
    <View style={{ flex: 1, backgroundColor: TRAINER_BACKGROUND, paddingTop: insets.top + 8 }}>
      {/* шапка: выход, счётчик, прогресс */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <TouchableOpacity onPress={onExit} style={{ padding: 8 }} accessibilityLabel="Закрыть тренировку">
          <Feather name="x" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: colors.mutedForeground, fontWeight: "800", fontSize: 13 }}>
            {title ?? queue?.deckTitle ?? "Слова"} · {Math.min(pos + 1, total)}/{total}
          </Text>
          <View style={{ width: 140, height: 6, borderRadius: 999, backgroundColor: "rgba(99,102,241,0.15)", marginTop: 6, overflow: "hidden" }}>
            <Animated.View
              style={{
                height: "100%", borderRadius: 999, backgroundColor: colors.primary,
                width: barWidth.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
              }}
            />
          </View>
        </View>
        <View style={{ width: 40, alignItems: "flex-end", paddingRight: 6 }}>
          {points > 0 && <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 13 }}>+{points}</Text>}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: Math.max(insets.bottom, 12) + 24, flexGrow: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>
          {promptLabel}
        </Text>

        {/* задание */}
        <View style={{ backgroundColor: colors.card, borderRadius: 24, borderWidth: 1, borderColor: "rgba(99,102,241,0.16)", padding: 22, marginTop: 12, alignItems: "center" }}>
          {isListen ? (
            <>
              <TouchableOpacity
                onPress={() => card && speakWord(card.id, card.english)}
                activeOpacity={0.85}
                style={{ alignItems: "center", justifyContent: "center", width: 116, height: 116, borderRadius: 58, backgroundColor: colors.accent }}
                accessibilityLabel="Прослушать слово"
              >
                <Feather name="volume-2" size={44} color={colors.primary} />
              </TouchableOpacity>
              {/* слово показываем только после ответа — иначе аудирования нет */}
              {!!feedback && (
                <Text style={{ fontSize: 22, fontWeight: "900", color: colors.foreground, marginTop: 12 }}>
                  {card?.emoji ? `${card.emoji} ` : ""}{card?.english}
                </Text>
              )}
            </>
          ) : (
            <>
              {/* Картинка — на знакомстве и после ответа. В упражнении «выбери
                  перевод» показывать её заранее нельзя: ребёнок угадает смысл по
                  картинке, не вспоминая само слово. */}
              {!!card?.emoji && (isIntro || !!feedback) && (
                <Text style={{ fontSize: isIntro ? 64 : 44 }}>{card.emoji}</Text>
              )}
              <Text
                style={{
                  fontSize: exercise.prompt.length > 18 ? 26 : 34, lineHeight: exercise.prompt.length > 18 ? 34 : 42,
                  fontWeight: "900", color: colors.foreground, textAlign: "center", marginTop: card?.emoji ? 6 : 0,
                }}
              >
                {exercise.prompt}
              </Text>
              {(isIntro || exercise.type === "choiceRu") && !!card?.ipa && (
                <Text style={{ fontSize: 16, color: colors.mutedForeground, marginTop: 6 }}>{card.ipa}</Text>
              )}
              {(isIntro || exercise.type === "choiceRu") && speechAvailable() && (
                <TouchableOpacity
                  onPress={() => card && speakWord(card.id, card.english)}
                  activeOpacity={0.8}
                  style={{ flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginTop: 12 }}
                >
                  <Feather name="volume-2" size={18} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: "800" }}>Прослушать</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* знакомство: перевод, пример */}
          {isIntro && revealed && card && (
            <View style={{ width: "100%", marginTop: 18 }}>
              <Text style={{ fontSize: 24, fontWeight: "900", color: colors.primary, textAlign: "center" }}>
                {card.translationsRu.join(", ")}
              </Text>
              {!!card.partOfSpeech && (
                <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", marginTop: 4, textTransform: "capitalize" }}>
                  {card.partOfSpeech}
                </Text>
              )}
              {!!card.exampleEn && (
                <View style={{ marginTop: 14, backgroundColor: colors.accent, borderRadius: 14, padding: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 15, color: colors.foreground, fontStyle: "italic" }}>{card.exampleEn}</Text>
                    {speechAvailable() && (
                      // У примера-предложения нет своего wordId — озвучиваем текст
                      // напрямую через /api/tts?text=... (см. speakWord). Раньше
                      // здесь стоял speak() — он всегда идёт мимо сервера, сразу
                      // в Web Speech API/expo-speech, поэтому пример звучал
                      // старым синтезом даже когда сервер уже умеет живые голоса.
                      <TouchableOpacity onPress={() => speakWord(undefined, card.exampleEn!)} accessibilityLabel="Прослушать пример">
                        <Feather name="volume-2" size={18} color={colors.primary} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {!!card.exampleRu && <Text style={{ marginTop: 6, fontSize: 14, color: colors.mutedForeground }}>{card.exampleRu}</Text>}
                </View>
              )}
            </View>
          )}

          {/* сборка слова: что уже собрано */}
          {isBuild && (
            <View style={{ width: "100%", marginTop: 18, alignItems: "center" }}>
              <View
                style={{
                  minHeight: 52, width: "100%", borderRadius: 14, borderWidth: 2, borderStyle: "dashed",
                  borderColor: feedback
                    ? (feedback.correct ? OK_GREEN : feedback.retry ? colors.warning : colors.destructive)
                    : "rgba(99,102,241,0.35)",
                  alignItems: "center", justifyContent: "center", paddingHorizontal: 10,
                }}
              >
                <Text style={{ fontSize: 26, fontWeight: "900", letterSpacing: 2, color: feedback && !feedback.correct && !feedback.retry ? colors.destructive : colors.foreground }}>
                  {builtWord || "…"}
                </Text>
              </View>
              {hintUsed && (
                <Text style={{ marginTop: 8, fontSize: 15, color: colors.mutedForeground, letterSpacing: 2 }}>
                  {answerLetters.map((l, i) => (i === 0 ? l : "•")).join(" ")}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* реакция на ответ */}
        {feedback && !isBuild && (
          <View style={{ marginTop: 14, alignItems: "center" }}>
            <Text style={{ fontSize: 15, fontWeight: "900", color: feedback.correct ? OK_GREEN : colors.destructive }}>
              {feedback.correct ? "Верно!" : `Верный ответ: ${exercise.options?.[exercise.answerIndex ?? 0] ?? exercise.answer ?? ""}`}
            </Text>
          </View>
        )}
        {feedback && isBuild && (
          <View style={{ marginTop: 14, alignItems: "center" }}>
            <Text
              style={{
                fontSize: 15, fontWeight: "900",
                color: feedback.correct ? OK_GREEN : feedback.retry ? colors.warning : colors.destructive,
              }}
            >
              {feedback.correct
                ? "Верно!"
                : feedback.retry
                  ? "Почти! Попробуй собрать ещё раз"
                  : `Верный ответ: ${exercise.answer ?? ""}`}
            </Text>
          </View>
        )}

        {/* варианты ответа */}
        {!isIntro && !isBuild && (
          <View style={{ marginTop: 18, gap: 10 }}>
            {(exercise.options ?? []).map((option, index) => {
              const isAnswer = index === exercise.answerIndex;
              const picked = feedback?.picked === index;
              const showCorrect = Boolean(feedback) && isAnswer;
              const showWrong = Boolean(feedback) && picked && !isAnswer;
              return (
                <TouchableOpacity
                  key={`${option}-${index}`}
                  onPress={() => pickOption(index)}
                  activeOpacity={0.85}
                  disabled={Boolean(feedback)}
                  style={{
                    backgroundColor: showCorrect ? OK_GREEN + "1f" : showWrong ? colors.destructive + "1f" : colors.card,
                    borderColor: showCorrect ? OK_GREEN : showWrong ? colors.destructive : colors.border,
                    borderWidth: showCorrect || showWrong ? 2 : 1,
                    borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16,
                    flexDirection: "row", alignItems: "center", gap: 10,
                  }}
                >
                  <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: colors.foreground }}>{option}</Text>
                  {showCorrect && <Feather name="check" size={20} color={OK_GREEN} />}
                  {showWrong && <Feather name="x" size={20} color={colors.destructive} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* буквы */}
        {isBuild && (
          <>
            <View style={{ marginTop: 18, flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
              {(exercise.letters ?? []).map((letter, index) => {
                const used = built.includes(index);
                return (
                  <TouchableOpacity
                    key={`${letter}-${index}`}
                    onPress={() => tapLetter(index)}
                    activeOpacity={0.85}
                    disabled={used || Boolean(feedback)}
                    style={{
                      width: 46, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center",
                      backgroundColor: used ? "rgba(99,102,241,0.08)" : colors.card,
                      borderWidth: 1, borderColor: used ? "transparent" : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 22, fontWeight: "900", color: used ? "transparent" : colors.foreground }}>{letter}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16, justifyContent: "center" }}>
              <SmallButton icon="delete" label="Стереть" onPress={undoLetter} colors={colors} disabled={built.length === 0 || Boolean(feedback)} />
              {!hintUsed && <SmallButton icon="help-circle" label="Подсказка" onPress={showHint} colors={colors} disabled={Boolean(feedback)} />}
            </View>
          </>
        )}

        {/* знакомство: кнопки внизу */}
        {isIntro && (
          <View style={{ marginTop: 20, gap: 10 }}>
            {!revealed ? (
              <BigButton label="Показать перевод" onPress={() => setRevealed(true)} colors={colors} />
            ) : (
              <>
                <BigButton label="Понятно, запомнил" onPress={() => submit({ grade: "good" }, "intro", 250)} colors={colors} />
                <TouchableOpacity
                  onPress={() => submit({ grade: "again" }, "intro", 250)}
                  activeOpacity={0.85}
                  style={{ borderRadius: 16, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}
                >
                  <Text style={{ color: colors.mutedForeground, fontWeight: "800", fontSize: 15 }}>Показать ещё раз позже</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const PROMPT_LABEL: Record<ExerciseType, string> = {
  intro: "Новое слово",
  choiceRu: "Выбери перевод",
  choiceEn: "Выбери слово",
  listen: "Послушай и выбери перевод",
  build: "Собери слово из букв",
};

// ── итоги сессии ────────────────────────────────────────────────────────────
function SessionSummary({
  colors, insets, answered, correctCount, points, learned, progress, emptyQueue, onExit,
}: {
  colors: any;
  insets: { top: number; bottom: number };
  answered: number;
  correctCount: number;
  points: number;
  learned: number;
  progress: { wordsToday: number; dailyWordGoal: number } | null;
  emptyQueue: boolean;
  onExit: () => void;
}) {
  const accuracy = answered > 0 ? Math.round((correctCount / answered) * 100) : 0;
  const goalPct = progress && progress.dailyWordGoal > 0
    ? Math.min(100, Math.round((progress.wordsToday / progress.dailyWordGoal) * 100))
    : 0;
  const goalReached = Boolean(progress && progress.wordsToday >= progress.dailyWordGoal);

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 26, paddingTop: insets.top + 20, paddingBottom: Math.max(insets.bottom, 16) + 20 }}
      style={{ backgroundColor: TRAINER_BACKGROUND }}
    >
      <View style={{ alignItems: "center" }}>
        <Text style={{ fontSize: 64 }}>{emptyQueue ? "😴" : goalReached ? "🏆" : "🎉"}</Text>
        <Text style={{ fontSize: 24, fontWeight: "900", color: colors.foreground, marginTop: 10, textAlign: "center" }}>
          {emptyQueue ? "Пока нечего повторять" : goalReached ? "Цель дня выполнена!" : "Хорошая работа!"}
        </Text>
        {emptyQueue && (
          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 8, textAlign: "center", lineHeight: 20 }}>
            Все слова повторены — новые появятся, когда придёт время следующего показа. Можно взять новую колоду или потренировать сложные слова.
          </Text>
        )}
      </View>

      {!emptyQueue && (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 22 }}>
            <SummaryCard colors={colors} icon="layers" value={answered} label="слов пройдено" />
            <SummaryCard colors={colors} icon="target" value={`${accuracy}%`} label="правильных" />
            <SummaryCard colors={colors} icon="star" value={`+${points}`} label="очков" />
            <SummaryCard colors={colors} icon="check-circle" value={learned} label="выучено" />
          </View>

          {progress && (
            <View style={{ marginTop: 18, backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>Цель дня</Text>
                <Text style={{ fontSize: 13, fontWeight: "800", color: colors.primary }}>
                  {progress.wordsToday} / {progress.dailyWordGoal} слов
                </Text>
              </View>
              <View style={{ height: 10, borderRadius: 999, backgroundColor: "rgba(99,102,241,0.14)", marginTop: 10, overflow: "hidden" }}>
                <View style={{ width: `${goalPct}%`, height: "100%", borderRadius: 999, backgroundColor: goalReached ? OK_GREEN : colors.primary }} />
              </View>
            </View>
          )}
        </>
      )}

      <BigButton label="Готово" onPress={onExit} colors={colors} />
    </ScrollView>
  );
}

function SummaryCard({ colors, icon, value, label }: any) {
  return (
    <View style={{ width: "47%", flexGrow: 1, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
      <Feather name={icon} size={17} color={colors.primary} />
      <Text style={{ fontSize: 24, fontWeight: "900", color: colors.foreground, marginTop: 5 }}>{value}</Text>
      <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{label}</Text>
    </View>
  );
}

function Centered({ children, background }: { children: React.ReactNode; background: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: background }}>
      {children}
    </View>
  );
}

function BigButton({ label, onPress, colors }: { label: string; onPress: () => void; colors: any }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{ marginTop: 22, backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 15, alignItems: "center" }}
    >
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function SmallButton({
  icon, label, onPress, colors, disabled,
}: { icon: any; label: string; onPress: () => void; colors: any; disabled?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      disabled={disabled}
      style={{
        flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10,
        backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: disabled ? 0.45 : 1,
      }}
    >
      <Feather name={icon} size={16} color={colors.mutedForeground} />
      <Text style={{ color: colors.mutedForeground, fontWeight: "800", fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}
