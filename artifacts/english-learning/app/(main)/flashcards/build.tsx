// ─────────────────────────────────────────────────────────────────────────────
// Режим «Собери предложение».
//
// Дан русский перевод — надо дать английское предложение. Два способа ответа:
//
//   tiles — собрать из плиток (среди них есть лишние слова);
//   write — написать целиком.
//
// Какой именно, решает СЕРВЕР по уровню ученика (см. routes/practice.ts): на A1
// всегда плитки, потому что написать фразу целиком новичок физически не может,
// и упражнение превратилось бы в проверку раскладки клавиатуры.
//
// ── Решения, взятые из уже набитых шишек тренажёра слов ─────────────────────
// 1. Вердикт живёт ВНУТРИ карточки, под заданием. Отдельной строкой между
//    карточкой и кнопками он читался как третий несвязанный блок.
// 2. Верный ответ листается сам, ошибка — никогда. Разбор ошибки самая полезная
//    секунда тренировки, и отмерять её таймером нельзя: дальше ведёт кнопка.
// 3. Ошибка показывает МЕСТО расхождения, а не только правильный ответ: номер
//    первого неверного слова, пропущенные и лишние слова, правило одной фразой.
//    Иначе ученик перебирает порядок наугад.
// 4. У поля ввода отключены автокоррекция, автодополнение и проверка
//    орфографии. Это не мелочь: телефон достраивает предложение за ребёнка, и
//    упражнение превращается в набор текста под диктовку клавиатуры.
// 5. Есть «Не знаю»: без неё единственный выход из незнакомого предложения —
//    ткнуть наугад и получить ошибку.
//
// Экран полноэкранный (см. FULLSCREEN_ROUTES в app/(main)/_layout.tsx): панель
// вкладок скрыта, выход — крестик в шапке.
//
// ГРАБЛИ: не вкладывать <Text> в <Text> — в Safari это роняет экран целиком.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, Pressable, ScrollView, TextInput, ActivityIndicator,
  Animated, Easing, Platform, type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { practice, type BuildCheck, type BuildTask } from "@/hooks/usePractice";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { ChunkyButton, Pill, Tile } from "@/components/ui/GameKit";
import { accents, gradients, radii, timing } from "@/constants/theme";

const NATIVE_DRIVER = Platform.OS !== "web";

/** Сколько заданий в одном заходе. Короткая сессия, как у слов. */
const BATCH = 8;

/** Пауза перед следующим заданием после ВЕРНОГО ответа. */
const NEXT_DELAY_OK = 1200;
/** Технический пропуск (сервер не помнит задание): держать нечего. */
const NEXT_DELAY_INFO = 1500;

/** Толщина нижней грани у плиток. */
const EDGE = 4;

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: "900", color: "#e11d48" }}>Экран не открылся</Text>
      <Text style={{ fontSize: 13, lineHeight: 20, color: "#5b4f8e" }}>
        {error?.message ?? "Неизвестная ошибка"}
      </Text>
      <ChunkyButton label="Попробовать снова" icon="repeat" center onPress={() => { void retry(); }} />
    </ScrollView>
  );
}

type Phase = "loading" | "run" | "done";

/** Что показать под заданием после ответа. */
type Feedback = {
  correct: boolean;
  expected?: string;
  note?: string;
  firstWrongWord?: number;
  missing?: string[];
  extra?: string[];
  /** Ответ не проверен: в счёт не идёт. */
  info?: boolean;
  /** Ученик нажал «Не знаю». */
  gaveUp?: boolean;
};

export default function SentenceBuilderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [phase, setPhase] = React.useState<Phase>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [level, setLevel] = React.useState("");
  const [tasks, setTasks] = React.useState<BuildTask[]>([]);
  const [pos, setPos] = React.useState(0);

  /** Выбранные плитки: индексы в task.tokens, по порядку нажатия. */
  const [picked, setPicked] = React.useState<number[]>([]);
  const [typed, setTyped] = React.useState("");
  const [feedback, setFeedback] = React.useState<Feedback | null>(null);
  const [checking, setChecking] = React.useState(false);

  const [answered, setAnswered] = React.useState(0);
  const [correctCount, setCorrectCount] = React.useState(0);

  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardIn = React.useRef(new Animated.Value(0)).current;

  const task = tasks[pos];
  const total = tasks.length;

  // ── загрузка ──
  React.useEffect(() => {
    let alive = true;
    practice.getSentences(BATCH)
      .then((batch) => {
        if (!alive) return;
        setLevel(batch.level);
        setTasks(batch.tasks ?? []);
        setPhase((batch.tasks ?? []).length === 0 ? "done" : "run");
      })
      .catch((err) => {
        if (!alive) return;
        setError(err?.message ?? "Не удалось загрузить задания.");
      });
    return () => { alive = false; };
  }, []);

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Лёгкий «вдох» карточки: только opacity и scale, чтобы анимация ушла в
  // нативный драйвер и не грузила JS-поток.
  React.useEffect(() => {
    if (!task) return;
    cardIn.setValue(0);
    Animated.timing(cardIn, {
      toValue: 1, duration: timing.react,
      easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [task, cardIn]);

  const exit = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    router.replace("/flashcards");
  }, [router]);

  const resetCard = React.useCallback(() => {
    setPicked([]);
    setTyped("");
    setFeedback(null);
    setChecking(false);
  }, []);

  const goNext = React.useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    resetCard();
    setPos((prev) => {
      const next = prev + 1;
      if (next >= tasks.length) { setPhase("done"); return prev; }
      return next;
    });
  }, [resetCard, tasks.length]);

  /** Ответ ученика строкой: из плиток или из поля ввода. */
  const currentAnswer = React.useMemo(() => {
    if (!task) return "";
    if (task.mode === "write") return typed;
    return picked.map((i) => task.tokens[i]).join(" ");
  }, [task, picked, typed]);

  const submit = React.useCallback(async (given: string, gaveUp = false) => {
    if (!task || checking) return;
    setChecking(true);
    try {
      const verdict: BuildCheck = await practice.checkSentence(task.id, given);

      if (verdict.unknown) {
        // Сервер перезапустился между выдачей и ответом. Ученик ни при чём:
        // в счёт не идёт, листаем сами.
        setFeedback({ correct: false, info: true });
        timer.current = setTimeout(goNext, NEXT_DELAY_INFO);
        return;
      }

      const correct = verdict.correct && !gaveUp;
      setAnswered((n) => n + 1);
      if (correct) setCorrectCount((n) => n + 1);

      setFeedback({
        correct,
        gaveUp,
        ...(verdict.expected ? { expected: verdict.expected } : {}),
        ...(verdict.note ? { note: verdict.note } : {}),
        ...(verdict.firstWrongWord ? { firstWrongWord: verdict.firstWrongWord } : {}),
        ...(verdict.missing ? { missing: verdict.missing } : {}),
        ...(verdict.extra ? { extra: verdict.extra } : {}),
      });

      // Верный ответ уходит сам, ошибка ждёт нажатия: см. шапку файла.
      if (correct) timer.current = setTimeout(goNext, NEXT_DELAY_OK);
    } catch {
      setFeedback({ correct: false, info: true });
      timer.current = setTimeout(goNext, NEXT_DELAY_INFO);
    } finally {
      setChecking(false);
    }
  }, [task, checking, goNext]);

  // ── экраны состояний ──

  if (error) {
    return (
      <Screen insets={insets}>
        <Tile glow={colors.destructive} style={{ padding: 18 }}>
          <Text style={{ fontSize: 15, fontWeight: "900", color: colors.destructive, marginBottom: 8 }}>
            Задания не загрузились
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginBottom: 14 }}>
            {error}
          </Text>
          <ChunkyButton label="В раздел" icon="chevron" center onPress={exit} />
        </Tile>
      </Screen>
    );
  }

  if (phase === "loading") {
    return (
      <Screen insets={insets}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
        <Text style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: colors.mutedForeground }}>
          Готовим предложения по твоему уровню
        </Text>
      </Screen>
    );
  }

  if (phase === "done") {
    return (
      <Screen insets={insets}>
        <Summary
          colors={colors}
          answered={answered}
          correctCount={correctCount}
          onDone={exit}
        />
      </Screen>
    );
  }

  if (!task) return <Screen insets={insets}><View /></Screen>;

  const done = feedback !== null;
  const canCheck = task.mode === "write"
    ? typed.trim().length > 0
    : picked.length > 0;

  return (
    <Screen insets={insets}>
      {/* Шапка: выход, прогресс, уровень */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <Pressable onPress={exit} hitSlop={12} accessibilityRole="button" accessibilityLabel="Закрыть">
          <Glyph name="close" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13, fontWeight: "900", color: colors.foreground }} numberOfLines={1}>
            Собери предложение · {pos + 1}/{total}
          </Text>
          <View style={{ height: 6, backgroundColor: "rgba(99,102,241,0.16)", borderRadius: 3, marginTop: 6, overflow: "hidden" }}>
            <LinearGradient
              colors={gradients.progress as unknown as string[]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${((pos) / total) * 100}%` }}
            />
          </View>
        </View>
        {!!level && <Pill text={level} icon="rank" tone="soft" color={colors.primary} />}
      </View>

      <Animated.View style={{
        opacity: cardIn,
        transform: [{ scale: cardIn.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
      }}>
        {/* Карточка задания */}
        <Tile glow={accents.violetDeep} style={{ padding: 18, marginBottom: 14 }}>
          <Text style={{
            fontSize: 11, fontWeight: "800", color: colors.mutedForeground,
            textTransform: "uppercase", letterSpacing: 1.2, textAlign: "center",
          }}>
            {task.mode === "write" ? "Напиши по-английски" : "Собери по-английски"}
          </Text>

          <Text style={{
            fontSize: 21, lineHeight: 29, fontWeight: "800", color: colors.foreground,
            textAlign: "center", marginTop: 12,
          }}>
            {task.ru}
          </Text>

          <Text style={{
            fontSize: 12, color: colors.mutedForeground, textAlign: "center", marginTop: 8,
            fontVariant: ["tabular-nums"],
          }}>
            {task.words} {pluralRu(task.words, "слово", "слова", "слов")} в ответе
          </Text>

          {/* Вердикт внутри карточки, под заданием. */}
          {done && (
            <VerdictBlock colors={colors} feedback={feedback!} />
          )}
        </Tile>
      </Animated.View>

      {/* Ответ */}
      {task.mode === "write" ? (
        <View style={{ marginBottom: 14 }}>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            editable={!done}
            placeholder="Напиши предложение"
            placeholderTextColor={colors.mutedForeground}
            // Автокоррекция достраивает предложение за ребёнка — упражнение
            // превратилось бы в набор текста под диктовку клавиатуры.
            autoCorrect={false}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            multiline
            style={{
              backgroundColor: colors.card,
              borderRadius: radii.md,
              borderWidth: 1.5,
              borderColor: done ? colors.border : colors.primary + "55",
              paddingHorizontal: 14, paddingVertical: 13,
              fontSize: 17, color: colors.foreground, minHeight: 76,
            }}
          />
        </View>
      ) : (
        <>
          {/* Строка ответа: нажатие на слово убирает его назад в набор. */}
          <View style={{
            minHeight: 58, borderRadius: radii.md,
            borderWidth: 1.5, borderStyle: "dashed",
            borderColor: colors.primary + "55",
            backgroundColor: colors.card,
            padding: 9, marginBottom: 14,
            flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "flex-start",
          }}>
            {picked.length === 0 ? (
              <Text style={{ fontSize: 13, color: colors.mutedForeground, padding: 6 }}>
                Нажимай на слова снизу
              </Text>
            ) : picked.map((tokenIndex, at) => (
              <WordTile
                key={`${tokenIndex}-${at}`}
                label={task.tokens[tokenIndex] ?? ""}
                colors={colors}
                tone="filled"
                disabled={done}
                onPress={() => setPicked((cur) => cur.filter((_, i) => i !== at))}
              />
            ))}
          </View>

          {/* Набор плиток */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {task.tokens.map((word, i) => (
              picked.includes(i) ? null : (
                <WordTile
                  key={`${word}-${i}`}
                  label={word}
                  colors={colors}
                  tone="bank"
                  disabled={done}
                  onPress={() => setPicked((cur) => [...cur, i])}
                />
              )
            ))}
          </View>
        </>
      )}

      {/* Кнопки */}
      {done ? (
        // После верного ответа карточка уходит сама, поэтому кнопка нужна
        // только для разбора ошибки.
        !feedback!.correct && !feedback!.info ? (
          <ChunkyButton label="Дальше" icon="forward" chevron onPress={goNext} />
        ) : null
      ) : (
        <>
          <ChunkyButton
            label={checking ? "Проверяем…" : "Проверить"
            }
            icon="check"
            center
            disabled={!canCheck || checking}
            onPress={() => { void submit(currentAnswer); }}
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10, justifyContent: "center" }}>
            {task.mode === "tiles" && picked.length > 0 && (
              <SmallButton
                label="Стереть"
                icon="backspace"
                colors={colors}
                onPress={() => setPicked((cur) => cur.slice(0, -1))}
              />
            )}
            {/* Без этой кнопки единственный выход из незнакомого предложения —
                ткнуть наугад и получить ошибку. */}
            <SmallButton
              label="Не знаю"
              icon="help"
              colors={colors}
              onPress={() => { void submit("", true); }}
            />
          </View>
        </>
      )}
    </Screen>
  );
}

// ── Части экрана ────────────────────────────────────────────────────────────

function Screen({ insets, children }: { insets: { top: number; bottom: number }; children: React.ReactNode }) {
  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: Math.max(insets.top, 10) + 12,
        // Панель вкладок на этом экране скрыта, поэтому снизу нужен только
        // запас под домашнюю полосу и воздух под последней кнопкой.
        paddingBottom: Math.max(insets.bottom, 12) + 28,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

/**
 * Плитка слова.
 *
 * Нижняя грань и проседание — те же, что у клавиш ответа в тренажёре слов:
 * плоская плитка рядом с проседающими кнопками читается как неработающая.
 */
function WordTile({
  label, colors, tone, disabled, onPress,
}: {
  label: string; colors: any; tone: "bank" | "filled";
  disabled?: boolean; onPress: () => void;
}) {
  const press = React.useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: timing.press,
      easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER,
    }).start();

  const filled = tone === "filled";
  const edgeColor = filled ? accents.indigoDeep : "#c9bdf0";

  return (
    <View style={{ paddingBottom: EDGE }}>
      <View style={{
        position: "absolute", left: 0, right: 0, top: EDGE, bottom: 0,
        borderRadius: radii.sm, backgroundColor: edgeColor, opacity: disabled ? 0.4 : 1,
      }} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={disabled ? undefined : onPress}
          onPressIn={() => !disabled && set(EDGE)}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <View style={{
            backgroundColor: filled ? colors.primary : colors.card,
            borderRadius: radii.sm,
            borderWidth: 1,
            borderColor: filled ? "transparent" : colors.border,
            paddingHorizontal: 13, paddingVertical: 10,
            opacity: disabled ? 0.6 : 1,
          }}>
            <Text style={{
              fontSize: 16, fontWeight: "800",
              color: filled ? "#fff" : colors.foreground,
            }}>
              {label}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** Мелкая кнопка действия: тоже с гранью, иначе выглядит выключенной. */
function SmallButton({
  label, icon, colors, onPress,
}: { label: string; icon: GlyphName; colors: any; onPress: () => void }) {
  const press = React.useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: timing.press,
      easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER,
    }).start();

  return (
    <View style={{ paddingBottom: EDGE }}>
      <View style={{
        position: "absolute", left: 0, right: 0, top: EDGE, bottom: 0,
        borderRadius: radii.pill, backgroundColor: "#c9bdf0",
      }} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={onPress}
          onPressIn={() => set(EDGE)}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 7,
            backgroundColor: colors.card,
            borderRadius: radii.pill,
            borderWidth: 1, borderColor: colors.border,
            paddingHorizontal: 15, paddingVertical: 9,
          }}>
            <Glyph name={icon} size={15} color={colors.mutedForeground} />
            <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.foreground }}>{label}</Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/**
 * Разбор ответа.
 *
 * У ошибки показываем не только эталон, но и МЕСТО расхождения: без этого
 * ученик перебирает порядок слов наугад, а не понимает правило.
 */
function VerdictBlock({ colors, feedback }: { colors: any; feedback: Feedback }) {
  const look = feedback.info
    ? { color: colors.warning, icon: "alert" as GlyphName, title: "Не удалось проверить" }
    : feedback.gaveUp
      ? { color: colors.warning, icon: "help" as GlyphName, title: "Запомни это предложение" }
      : feedback.correct
        ? { color: colors.success, icon: "check" as GlyphName, title: "Верно!" }
        : { color: colors.destructive, icon: "close" as GlyphName, title: "Неверно" };

  return (
    <View style={{
      marginTop: 16, paddingTop: 14,
      borderTopWidth: 1, borderTopColor: colors.border,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 }}>
        <View style={{
          width: 26, height: 26, borderRadius: 13,
          backgroundColor: look.color,
          alignItems: "center", justifyContent: "center",
        }}>
          <Glyph name={look.icon} size={15} color="#fff" />
        </View>
        <Text style={{ fontSize: 17, fontWeight: "900", color: look.color }}>{look.title}</Text>
      </View>

      {!!feedback.expected && !feedback.correct && (
        <Text style={{
          fontSize: 16, fontWeight: "800", color: colors.foreground,
          textAlign: "center", marginTop: 10,
        }}>
          {feedback.expected}
        </Text>
      )}

      {/* Место ошибки. Формулировки разные, потому что это разные ошибки:
          порядок слов и состав слов исправляются по-разному. */}
      {!feedback.correct && !feedback.info && !feedback.gaveUp && (
        <View style={{ marginTop: 9, gap: 3 }}>
          {!!feedback.firstWrongWord && (
            <Text style={{ fontSize: 12.5, color: colors.mutedForeground, textAlign: "center" }}>
              Разошлось с {feedback.firstWrongWord}-го слова
            </Text>
          )}
          {!!feedback.missing?.length && (
            <Text style={{ fontSize: 12.5, color: colors.mutedForeground, textAlign: "center" }}>
              Не хватает: {feedback.missing.join(", ")}
            </Text>
          )}
          {!!feedback.extra?.length && (
            <Text style={{ fontSize: 12.5, color: colors.mutedForeground, textAlign: "center" }}>
              Лишнее: {feedback.extra.join(", ")}
            </Text>
          )}
        </View>
      )}

      {/* Правило одной фразой: главное в разборе ошибки. */}
      {!!feedback.note && !feedback.correct && (
        <View style={{
          marginTop: 12, padding: 12,
          backgroundColor: colors.primary + "12",
          borderRadius: radii.sm,
          borderWidth: 1, borderColor: colors.primary + "2a",
        }}>
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.foreground }}>
            {feedback.note}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Итоги захода. Наградный экран, а не отчёт: поверхности физические. */
function Summary({
  colors, answered, correctCount, onDone,
}: { colors: any; answered: number; correctCount: number; onDone: () => void }) {
  const accuracy = answered > 0 ? Math.round((correctCount / answered) * 100) : 0;

  const tiles: { key: string; icon: GlyphName; tint: string; edge: string; value: string; label: string }[] = [
    { key: "count", icon: "list", tint: colors.primary, edge: accents.indigoDeep, value: String(answered), label: "предложений" },
    { key: "acc", icon: "target", tint: accents.amber, edge: "#b45309", value: `${accuracy}%`, label: "с первого раза" },
  ];

  return (
    <View style={{ paddingTop: 24 }}>
      <View style={{ alignItems: "center", marginBottom: 22 }}>
        <View style={{ paddingBottom: 6 }}>
          <View style={{
            position: "absolute", left: 0, right: 0, top: 6, bottom: 0,
            borderRadius: radii.lg, backgroundColor: accents.indigoDeep,
          }} />
          <LinearGradient
            colors={gradients.reward as unknown as string[]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={{
              width: 84, height: 84, borderRadius: radii.lg,
              alignItems: "center", justifyContent: "center",
            }}
          >
            <Glyph name="trophy" size={40} color="#fff" />
          </LinearGradient>
        </View>
        <Text style={{ fontSize: 24, fontWeight: "900", color: colors.foreground, marginTop: 14, letterSpacing: -0.5 }}>
          {answered === 0 ? "Заданий не было" : "Заход закончен"}
        </Text>
      </View>

      {answered > 0 && (
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 22 }}>
          {tiles.map((t) => (
            <View key={t.key} style={{ flex: 1, paddingBottom: 5 }}>
              <View style={{
                position: "absolute", left: 0, right: 0, top: 5, bottom: 0,
                borderRadius: radii.md, backgroundColor: t.edge,
              }} />
              <View style={cardBody(colors, { alignItems: "center", paddingVertical: 16 })}>
                <View style={{
                  width: 38, height: 38, borderRadius: radii.sm,
                  backgroundColor: t.tint + "1f",
                  alignItems: "center", justifyContent: "center", marginBottom: 8,
                }}>
                  <Glyph name={t.icon} size={19} color={t.tint} />
                </View>
                <Text style={{ fontSize: 24, fontWeight: "900", color: colors.foreground, fontVariant: ["tabular-nums"] }}>
                  {t.value}
                </Text>
                <Text style={{ fontSize: 11.5, color: colors.mutedForeground, marginTop: 2, textAlign: "center" }}>
                  {t.label}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <ChunkyButton label="Готово" icon="check" center onPress={onDone} />
    </View>
  );
}

function cardBody(colors: any, extra?: ViewStyle): ViewStyle {
  return {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...extra,
  };
}

function pluralRu(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
