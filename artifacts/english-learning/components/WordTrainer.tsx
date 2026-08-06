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
//
// ── Цвет состояния не трогает текст ─────────────────────────────────────────
// Клавиша ответа НИКОГДА не заливается цветом состояния целиком. Раньше
// заливка шла на всю площадь, и под красным или фиолетовым терялся сам текст
// ответа — то единственное, что ученик должен прочитать в этот момент. Особенно
// это било по верному ответу после ошибки: его надо запомнить, а он лежал под
// пятном.
//
// Состояние показывают три вещи по краям: рамка, нижняя грань и круглый значок
// справа. Корпус остаётся светлым, текст — всегда colors.foreground. Контраст
// не зависит от того, верно ответил ученик или нет.
//
// «Верно» окрашено фирменным фиолетовым (зелёного в палитре нет намеренно).
// Эмодзи в интерфейсе не используются; card.emoji приходит из данных слова
// и остаётся как иллюстрация к слову, это не иконка интерфейса.
import React from "react";
import { View, Text, TouchableOpacity, Pressable, Animated, Easing, ActivityIndicator, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { fc, speakWord, speechAvailable, stopSpeaking } from "@/hooks/useFlashcards";
import type { Exercise, ExerciseType, Grade, TrainerCard, TrainerQueue } from "@/hooks/useFlashcards";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { ChunkyButton, XpBar, GoalPips } from "@/components/ui/GameKit";
import { accents, gradients, radii, chunky } from "@/constants/theme";

// Пауза после верного ответа: карточка не улетает мгновенно, за это время
// доигрывает озвучка правильного слова. Кто не хочет ждать — жмёт «Дальше».
const NEXT_DELAY_OK = 1200;
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

  // Фон тренажёра берём из палитры: экран открывается поверх общего градиента,
  // поэтому собственный оттенок должен совпадать с фирменным светлым.
  const background = colors.background;
  // «Верно» — фиолетовый success из палитры. Зелёного в продукте нет намеренно.
  const okColor = colors.success;

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
  // Лёгкий «вдох» карточки при появлении: только opacity и scale, чтобы
  // анимация ушла в нативный драйвер и не грузила JS-поток.
  const cardIn = React.useRef(new Animated.Value(0)).current;

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

  // Уходя с тренажёра, обрываем и таймер перелистывания, и звук: иначе слово
  // продолжает звучать уже на другом экране.
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    stopSpeaking();
  }, []);

  // Появление новой карточки.
  React.useEffect(() => {
    cardIn.setValue(0);
    Animated.timing(cardIn, {
      toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [pos, phase]);

  // Озвучка при показе карточки: слово ребёнок должен услышать, а в аудировании
  // это вообще единственная подсказка.
  React.useEffect(() => {
    if (phase !== "run" || !card) return;
    shownAt.current = Date.now();
    if (!speechAvailable()) return;
    if (exercise.type === "intro" || exercise.type === "choiceRu" || exercise.type === "listen") {
      speakWord(card.id, card.english);
    }
    // Смена карточки обрывает её озвучку — новое слово не должно накладываться
    // на предыдущее, даже если mp3 предыдущего ещё качается.
    return () => stopSpeaking();
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
    stopSpeaking(); // звук предыдущей карточки не тянем на следующую
    resetCardState();
    const next = pos + 1;
    if (next >= cards.length) setPhase("done");
    else setPos(next);
  }, [pos, cards.length, resetCardState]);

  /**
   * Тап по «Дальше» до истечения паузы: не заставляем ждать доигрывания —
   * обрываем звук и листаем сразу.
   */
  const skipToNext = React.useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    goNext();
  }, [goNext]);

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
      <Centered background={background}>
        <Glyph name="alert" size={40} color={colors.destructive} />
        <Text style={{ color: colors.foreground, textAlign: "center", marginTop: 12, fontSize: 15 }}>{error}</Text>
        <ChunkyButton label="Закрыть" icon="close" onPress={onExit} style={{ alignSelf: "stretch", marginTop: 20 }} />
      </Centered>
    );
  }

  if (phase === "loading") {
    return <Centered background={background}><ActivityIndicator size="large" color={colors.primary} /></Centered>;
  }

  if (phase === "done") {
    return (
      <SessionSummary
        colors={colors}
        insets={insets}
        background={background}
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
    <View style={{ flex: 1, backgroundColor: background, paddingTop: insets.top + 8 }}>
      {/* шапка: выход, счётчик, прогресс */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <Pressable onPress={onExit} hitSlop={10} style={{ padding: 8 }} accessibilityLabel="Закрыть тренировку">
          <Glyph name="close" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: colors.mutedForeground, fontWeight: "800", fontSize: 13, fontVariant: ["tabular-nums"] }}>
            {title ?? queue?.deckTitle ?? "Слова"} · {Math.min(pos + 1, total)}/{total}
          </Text>
          {/* Прогресс сессии — та же полоса, что у XP: один язык на весь продукт. */}
          <XpBar
            progress={total > 0 ? Math.min(1, pos / total) : 0}
            height={7}
            shine={false}
            style={{ width: 150, marginTop: 6 }}
          />
        </View>
        <View style={{ width: 44, alignItems: "flex-end", paddingRight: 6 }}>
          {points > 0 && (
            <Text style={{ color: colors.primary, fontWeight: "900", fontSize: 13, fontVariant: ["tabular-nums"] }}>
              +{points}
            </Text>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: Math.max(insets.bottom, 12) + 24, flexGrow: 1 }}>
        <Text style={{ fontSize: 11, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 1.2, textAlign: "center" }}>
          {promptLabel}
        </Text>

        {/* задание */}
        <Animated.View
          style={{
            backgroundColor: colors.card, borderRadius: radii.lg,
            borderWidth: 1, borderColor: colors.border,
            padding: 22, marginTop: 12, alignItems: "center",
            // Цветная тень вместо серой: карточка «висит» над фоном.
            shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.16, shadowRadius: 22, elevation: 6,
            opacity: cardIn,
            transform: [{ scale: cardIn.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
          }}
        >
          {isListen ? (
            <>
              {/* Кнопка звука — главный объект в аудировании, поэтому градиент
                  бренда и свечение, а не плоская плашка. */}
              <TouchableOpacity
                onPress={() => card && speakWord(card.id, card.english)}
                activeOpacity={0.85}
                accessibilityLabel="Прослушать слово"
              >
                <LinearGradient
                  colors={gradients.action as unknown as string[]}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={{
                    alignItems: "center", justifyContent: "center",
                    width: 116, height: 116, borderRadius: 58,
                    shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.4, shadowRadius: 20, elevation: 9,
                  }}
                >
                  <Glyph name="sound" size={44} color="#ffffff" />
                </LinearGradient>
              </TouchableOpacity>
              {/* слово показываем только после ответа — иначе аудирования нет */}
              {!!feedback && (
                <Text style={{ fontSize: 22, fontWeight: "900", color: colors.foreground, marginTop: 14 }}>
                  {card?.emoji ? `${card.emoji} ` : ""}{card?.english}
                </Text>
              )}
            </>
          ) : (
            <>
              {/* Картинка — на знакомстве и после ответа. В упражнении «выбери
                  перевод» показывать её заранее нельзя: ребёнок угадает смысл по
                  картинке, не вспоминая само слово.
                  card.emoji — это иллюстрация к слову из данных, а не иконка
                  интерфейса, поэтому здесь эмодзи остаётся намеренно. */}
              {!!card?.emoji && (isIntro || !!feedback) && (
                <Text style={{ fontSize: isIntro ? 64 : 44 }}>{card.emoji}</Text>
              )}
              <Text
                style={{
                  fontSize: exercise.prompt.length > 18 ? 26 : 34, lineHeight: exercise.prompt.length > 18 ? 34 : 42,
                  fontWeight: "900", letterSpacing: -0.5,
                  color: colors.foreground, textAlign: "center", marginTop: card?.emoji ? 6 : 0,
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
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 7,
                    backgroundColor: colors.primary + "18", borderRadius: radii.pill,
                    paddingHorizontal: 15, paddingVertical: 9, marginTop: 12,
                  }}
                >
                  <Glyph name="sound" size={18} color={colors.primary} />
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
                <View style={{ marginTop: 14, backgroundColor: colors.accent, borderRadius: radii.sm + 2, padding: 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 15, color: colors.foreground, fontStyle: "italic" }}>{card.exampleEn}</Text>
                    {speechAvailable() && (
                      // У примера-предложения нет своего wordId — озвучиваем текст
                      // напрямую через /api/tts?text=... (см. speakWord). Раньше
                      // здесь стоял speak() — он всегда идёт мимо сервера, сразу
                      // в Web Speech API/expo-speech, поэтому пример звучал
                      // старым синтезом даже когда сервер уже умеет живые голоса.
                      <Pressable onPress={() => speakWord(undefined, card.exampleEn!)} hitSlop={8} accessibilityLabel="Прослушать пример">
                        <Glyph name="sound" size={18} color={colors.primary} />
                      </Pressable>
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
                  minHeight: 54, width: "100%", borderRadius: radii.sm + 2, borderWidth: 2, borderStyle: "dashed",
                  borderColor: feedback
                    ? (feedback.correct ? okColor : feedback.retry ? colors.warning : colors.destructive)
                    : "rgba(99,102,241,0.35)",
                  alignItems: "center", justifyContent: "center", paddingHorizontal: 10,
                }}
              >
                <Text style={{
                  fontSize: 26, fontWeight: "900", letterSpacing: 2,
                  color: feedback && !feedback.correct && !feedback.retry ? colors.destructive : colors.foreground,
                }}>
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
        </Animated.View>

        {/* реакция на ответ */}
        {feedback && !isBuild && (
          <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <Glyph name={feedback.correct ? "check" : "close"} size={17} color={feedback.correct ? okColor : colors.destructive} />
            <Text style={{ fontSize: 15, fontWeight: "900", color: feedback.correct ? okColor : colors.destructive, flexShrink: 1 }}>
              {feedback.correct ? "Верно!" : `Верный ответ: ${exercise.options?.[exercise.answerIndex ?? 0] ?? exercise.answer ?? ""}`}
            </Text>
          </View>
        )}
        {feedback && isBuild && (
          <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <Glyph
              name={feedback.correct ? "check" : feedback.retry ? "repeat" : "close"}
              size={17}
              color={feedback.correct ? okColor : feedback.retry ? colors.warning : colors.destructive}
            />
            <Text
              style={{
                fontSize: 15, fontWeight: "900", flexShrink: 1,
                color: feedback.correct ? okColor : feedback.retry ? colors.warning : colors.destructive,
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

        {/* Пауза перед следующей карточкой нужна, чтобы доиграла озвучка
            верного слова. Нетерпеливых не держим: тап по «Дальше» обрывает
            звук и листает сразу. При retry кнопки нет — там продолжается
            та же карточка. */}
        {feedback && !feedback.retry && (
          <TouchableOpacity
            onPress={skipToNext}
            activeOpacity={0.85}
            accessibilityLabel="Следующая карточка"
            style={{
              marginTop: 12, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 7,
              borderRadius: radii.pill, paddingHorizontal: 18, paddingVertical: 10,
              backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.mutedForeground, fontWeight: "800", fontSize: 14 }}>Дальше</Text>
            <Glyph name="arrowRight" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}

        {/* варианты ответа */}
        {!isIntro && !isBuild && (
          <View style={{ marginTop: 18, gap: 12 }}>
            {(exercise.options ?? []).map((option, index) => {
              const isAnswer = index === exercise.answerIndex;
              const picked = feedback?.picked === index;
              const showCorrect = Boolean(feedback) && isAnswer;
              const showWrong = Boolean(feedback) && picked && !isAnswer;
              return (
                <OptionKey
                  key={`${option}-${index}`}
                  label={option}
                  colors={colors}
                  okColor={okColor}
                  state={showCorrect ? "correct" : showWrong ? "wrong" : "idle"}
                  dimmed={Boolean(feedback) && !showCorrect && !showWrong}
                  disabled={Boolean(feedback)}
                  onPress={() => pickOption(index)}
                />
              );
            })}
          </View>
        )}

        {/* буквы */}
        {isBuild && (
          <>
            <View style={{ marginTop: 18, flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
              {(exercise.letters ?? []).map((letter, index) => (
                <LetterKey
                  key={`${letter}-${index}`}
                  letter={letter}
                  colors={colors}
                  used={built.includes(index)}
                  disabled={built.includes(index) || Boolean(feedback)}
                  onPress={() => tapLetter(index)}
                />
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16, justifyContent: "center" }}>
              <SmallButton icon="backspace" label="Стереть" onPress={undoLetter} colors={colors} disabled={built.length === 0 || Boolean(feedback)} />
              {!hintUsed && <SmallButton icon="help" label="Подсказка" onPress={showHint} colors={colors} disabled={Boolean(feedback)} />}
            </View>
          </>
        )}

        {/* знакомство: кнопки внизу */}
        {isIntro && (
          <View style={{ marginTop: 20 }}>
            {!revealed ? (
              <ChunkyButton label="Показать перевод" icon="face" onPress={() => setRevealed(true)} />
            ) : (
              <>
                <ChunkyButton label="Понятно, запомнил" icon="check" onPress={() => submit({ grade: "good" }, "intro", 250)} />
                <TouchableOpacity
                  onPress={() => submit({ grade: "again" }, "intro", 250)}
                  activeOpacity={0.85}
                  style={{
                    borderRadius: radii.md, paddingVertical: 14, alignItems: "center",
                    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginTop: 4,
                  }}
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

// ── физические клавиши ──────────────────────────────────────────────────────

/**
 * Вариант ответа как клавиша: у неё есть нижняя грань, и при нажатии корпус
 * проседает. Тот же приём, что у ChunkyButton, но плоский и светлый — вариантов
 * на экране четыре, и все они не могут кричать цветом бренда.
 *
 * ЦВЕТ СОСТОЯНИЯ НЕ ЗАЛИВАЕТ КОРПУС. Раньше клавиша красилась целиком (accent +
 * "1f" по всей площади плюс жирная рамка), и текст ответа читался сквозь пятно.
 * Теперь состояние живёт по краям: рамка, нижняя грань и круглый значок справа.
 * Корпус остаётся colors.card, текст — colors.foreground, контраст одинаковый
 * в любом состоянии.
 *
 * Остальные варианты после ответа притушены (dimmed): внимание должно уйти на
 * верный ответ, а не делиться поровну между четырьмя строками.
 */
function OptionKey({
  label, colors, okColor, state, dimmed, disabled, onPress,
}: {
  label: string;
  colors: any;
  okColor: string;
  state: "idle" | "correct" | "wrong";
  dimmed?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const press = React.useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: chunky.duration, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();

  const accent = state === "correct" ? okColor : state === "wrong" ? colors.destructive : null;
  const edge = accent ?? "rgba(160,140,220,0.35)";

  return (
    <View style={{ opacity: dimmed ? 0.45 : 1 }}>
      {/* Нижняя грань клавиши: отдельный слой под корпусом. */}
      <View style={{
        position: "absolute", left: 0, right: 0, top: 5, bottom: 0,
        borderRadius: radii.md, backgroundColor: edge,
      }} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={disabled ? undefined : onPress}
          onPressIn={() => !disabled && set(4)}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={{
            // Корпус всегда светлый: цвет состояния не должен лежать под текстом.
            backgroundColor: colors.card,
            borderColor: accent ?? colors.border,
            borderWidth: accent ? 2 : 1,
            borderRadius: radii.md, paddingVertical: 16, paddingHorizontal: 16,
            flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56,
          }}
        >
          <Text style={{ flex: 1, fontSize: 17, fontWeight: "800", color: colors.foreground }}>{label}</Text>
          {/* Значок состояния — единственное цветное пятно, и оно стоит рядом с
              текстом, а не под ним. */}
          {!!accent && (
            <View style={{
              width: 26, height: 26, borderRadius: 13,
              alignItems: "center", justifyContent: "center",
              backgroundColor: accent,
            }}>
              <Glyph name={state === "correct" ? "check" : "close"} size={16} color="#ffffff" />
            </View>
          )}
        </Pressable>
      </Animated.View>
      <View style={{ height: 5 }} />
    </View>
  );
}

/** Буква в сборке слова — та же клавиша, только квадратная. */
function LetterKey({
  letter, colors, used, disabled, onPress,
}: {
  letter: string;
  colors: any;
  used: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const press = React.useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: chunky.duration, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();

  if (used) {
    // Использованная буква оставляет «дырку» в ряду: видно, сколько осталось.
    return (
      <View style={{
        width: 46, height: 54, borderRadius: radii.sm,
        backgroundColor: "rgba(99,102,241,0.08)",
      }} />
    );
  }

  return (
    <View>
      <View style={{
        position: "absolute", left: 0, right: 0, top: 4, bottom: 0,
        borderRadius: radii.sm, backgroundColor: "rgba(160,140,220,0.4)",
      }} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={disabled ? undefined : onPress}
          onPressIn={() => !disabled && set(4)}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={`Буква ${letter}`}
          style={{
            width: 46, height: 54, borderRadius: radii.sm,
            alignItems: "center", justifyContent: "center",
            backgroundColor: colors.card,
            borderWidth: 1, borderColor: colors.border,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: "900", color: colors.foreground }}>{letter}</Text>
        </Pressable>
      </Animated.View>
      <View style={{ height: 4 }} />
    </View>
  );
}

// ── итоги сессии ────────────────────────────────────────────────────────────
function SessionSummary({
  colors, insets, background, answered, correctCount, points, learned, progress, emptyQueue, onExit,
}: {
  colors: any;
  insets: { top: number; bottom: number };
  background: string;
  answered: number;
  correctCount: number;
  points: number;
  learned: number;
  progress: { wordsToday: number; dailyWordGoal: number } | null;
  emptyQueue: boolean;
  onExit: () => void;
}) {
  const accuracy = answered > 0 ? Math.round((correctCount / answered) * 100) : 0;
  const goalReached = Boolean(progress && progress.wordsToday >= progress.dailyWordGoal);

  // Итог сессии — наградный момент, поэтому крупный трофей в градиентной
  // плашке вместо эмодзи. Пустая очередь наградой не считается.
  const heroGlyph: GlyphName = emptyQueue ? "clock" : goalReached ? "trophy" : "spark";
  const heroGradient = emptyQueue
    ? (["#a5b4fc", "#818cf8"] as const)
    : goalReached
      ? gradients.medalEasy
      : gradients.action;

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 26, paddingTop: insets.top + 20, paddingBottom: Math.max(insets.bottom, 16) + 20 }}
      style={{ backgroundColor: background }}
    >
      <View style={{ alignItems: "center" }}>
        <LinearGradient
          colors={heroGradient as unknown as string[]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={{
            width: 96, height: 96, borderRadius: radii.xl,
            alignItems: "center", justifyContent: "center",
            transform: [{ rotate: "-4deg" }],
            shadowColor: goalReached ? accents.amber : colors.primary,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.4, shadowRadius: 20, elevation: 9,
          }}
        >
          <Glyph name={heroGlyph} size={46} color="#ffffff" />
        </LinearGradient>
        <Text style={{ fontSize: 25, fontWeight: "900", letterSpacing: -0.6, color: colors.foreground, marginTop: 16, textAlign: "center" }}>
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
            <SummaryCard colors={colors} icon="cards" tint={colors.primary} value={answered} label="слов пройдено" />
            <SummaryCard colors={colors} icon="target" tint={accents.amber} value={`${accuracy}%`} label="правильных" />
            <SummaryCard colors={colors} icon="star" tint={accents.magenta} value={`+${points}`} label="очков" />
            <SummaryCard colors={colors} icon="check" tint={colors.success} value={learned} label="выучено" />
          </View>

          {progress && (
            <View style={{
              marginTop: 18, backgroundColor: colors.card, borderRadius: radii.md,
              borderWidth: 1, borderColor: colors.border, padding: 16,
              shadowColor: goalReached ? accents.gold : accents.violetDeep,
              shadowOffset: { width: 0, height: 5 },
              shadowOpacity: 0.15, shadowRadius: 14, elevation: 3,
            }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 11 }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>Цель дня</Text>
                <Text style={{
                  fontSize: 14, fontWeight: "900", fontVariant: ["tabular-nums"],
                  color: goalReached ? accents.amber : colors.primary,
                }}>
                  {progress.wordsToday} / {progress.dailyWordGoal}
                </Text>
              </View>
              {/* Та же сегментированная цель, что на «Словах» и в статистике. */}
              <GoalPips value={progress.wordsToday} target={progress.dailyWordGoal} done={goalReached} />
            </View>
          )}
        </>
      )}

      <ChunkyButton label="Готово" icon="check" onPress={onExit} style={{ marginTop: 22 }} />
    </ScrollView>
  );
}

function SummaryCard({
  colors, icon, tint, value, label,
}: {
  colors: any;
  icon: GlyphName;
  tint: string;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <View style={{
      width: "47%", flexGrow: 1, backgroundColor: colors.card, borderRadius: radii.md,
      borderWidth: 1, borderColor: colors.border, padding: 14,
      shadowColor: tint, shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.16, shadowRadius: 14, elevation: 3,
    }}>
      <View style={{
        width: 30, height: 30, borderRadius: 9,
        backgroundColor: tint + "1f",
        alignItems: "center", justifyContent: "center",
      }}>
        <Glyph name={icon} size={17} color={tint} />
      </View>
      <Text style={{
        fontSize: 25, fontWeight: "900", letterSpacing: -0.8,
        color: colors.foreground, marginTop: 8, fontVariant: ["tabular-nums"],
      }}>
        {value}
      </Text>
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

function SmallButton({
  icon, label, onPress, colors, disabled,
}: { icon: GlyphName; label: string; onPress: () => void; colors: any; disabled?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      disabled={disabled}
      style={{
        flexDirection: "row", alignItems: "center", gap: 7, borderRadius: radii.pill,
        paddingHorizontal: 16, paddingVertical: 11,
        backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Glyph name={icon} size={16} color={colors.mutedForeground} />
      <Text style={{ color: colors.mutedForeground, fontWeight: "800", fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}
