// ─────────────────────────────────────────────────────────────────────────────
// Ученик: разговор по ситуации от учителя.
//
// Отличий от свободного разговора со Снежей три, и все важные:
//   • у задания есть КОНЕЦ: полоса сверху показывает, сколько реплик осталось,
//     и по её заполнении беседа закрывается сама;
//   • ошибка НЕ останавливает разговор. Снежа играет роль, а не ведёт урок:
//     поправка приходит подписью под репликой, сцена идёт дальше. В свободном
//     разговоре наоборот — там фразу просят повторить;
//   • всё это уезжает учителю: диалог с ошибками и итоговый разбор.
//
// Говорить можно голосом и текстом. Запись заканчивает сам ученик кнопкой
// «Стоп»: автоматическая остановка по тишине срезает ребёнка на вдохе (та же
// причина, что в тренажёре слов).
//
// Выход — router.replace, а не back: внутри вкладок back возвращает на первую
// вкладку, а не на предыдущий экран.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, Pressable, ScrollView, TextInput, ActivityIndicator,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, Pill } from "@/components/ui/GameKit";
import { VoiceWave } from "@/components/ui/VoiceWave";
import { accents, gradients, radii } from "@/constants/theme";
import { screenTop } from "@/constants/layout";
import { speakWord, speechAvailable, stopSpeaking } from "@/hooks/useFlashcards";
import {
  cancelListening, isSpeechInputAvailable, startListening,
  type SpeechResult, type SpeechSession,
} from "@/hooks/useSpeechInput";
import { scenarios, type ScenarioMessage, type ScenarioRun } from "@/hooks/useScenarios";

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: "900", color: "#e11d48" }}>Разговор не открылся</Text>
      <Text style={{ fontSize: 13, lineHeight: 20, color: "#5b4f8e" }}>{error?.message}</Text>
      <ChunkyButton label="Попробовать снова" icon="repeat" center onPress={() => { void retry(); }} />
    </ScrollView>
  );
}

function card(colors: any, extra?: ViewStyle): ViewStyle {
  return {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    shadowColor: accents.violetDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 2,
    ...extra,
  };
}

export default function ScenarioRunScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const scenarioId = Number(params.id);

  const [run, setRun] = React.useState<ScenarioRun | null>(null);
  const [messages, setMessages] = React.useState<ScenarioMessage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [typed, setTyped] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [turns, setTurns] = React.useState(0);
  const [mistakes, setMistakes] = React.useState(0);
  const [goalReached, setGoalReached] = React.useState(false);
  const [finished, setFinished] = React.useState(false);
  const [summary, setSummary] = React.useState<string | null>(null);
  const [attemptId, setAttemptId] = React.useState<number | null>(null);

  /** Микрофон: idle → listening → checking. */
  const [mic, setMic] = React.useState<"idle" | "listening" | "checking">("idle");
  const [partial, setPartial] = React.useState("");
  const [micHint, setMicHint] = React.useState<string | null>(null);
  const speechRef = React.useRef<SpeechSession | null>(null);
  const speechInput = React.useMemo(() => isSpeechInputAvailable(), []);

  const listRef = React.useRef<ScrollView | null>(null);

  // Начать или продолжить: сервер сам решает, есть ли активная попытка.
  React.useEffect(() => {
    let alive = true;
    if (!Number.isInteger(scenarioId)) {
      setError("Ситуация не найдена");
      setLoading(false);
      return;
    }
    scenarios.start(scenarioId)
      .then((data) => {
        if (!alive) return;
        setRun(data);
        setMessages(data.messages);
        setTurns(data.attempt.turns);
        setMistakes(data.attempt.mistakes);
        setGoalReached(data.attempt.goalReached);
        setAttemptId(data.attempt.id);
        setFinished(data.attempt.status !== "active");
        setSummary(data.attempt.summary ?? null);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Не удалось начать");
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => {
      alive = false;
      stopSpeaking();
      cancelListening();
    };
  }, [scenarioId]);

  const leave = () => router.replace("/flashcards/scenarios" as any);

  const send = React.useCallback(async (text: string) => {
    const value = text.trim();
    if (!value || !attemptId || sending || finished) return;
    setSending(true);
    setMicHint(null);
    try {
      const res = await scenarios.reply(attemptId, { text: value });
      setMessages((cur) => [...cur, res.student, res.reply]);
      setTyped("");
      setTurns(res.attempt.turns);
      setMistakes(res.attempt.mistakes);
      setGoalReached(res.attempt.goalReached);
      if (res.finished) {
        setFinished(true);
        setSummary(res.attempt.summary);
      }
      // Реплику роли сразу озвучиваем: это разговор, а не переписка.
      if (speechAvailable()) speakWord(undefined, res.reply.text);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (err) {
      setMicHint(err instanceof Error ? err.message : "Реплика не отправилась");
    } finally {
      setSending(false);
    }
  }, [attemptId, sending, finished]);

  /** Итог записи: пришёл после нажатия «Стоп». */
  const onSpeech = React.useCallback(async (result: SpeechResult) => {
    speechRef.current = null;
    setPartial("");
    if (!result.ok) {
      setMic("idle");
      setMicHint(result.reason === "denied"
        ? "Нет доступа к микрофону. Напиши текстом."
        : "Микрофон недоступен. Напиши текстом.");
      return;
    }
    const heard = result.transcript.trim();
    if (!heard) {
      setMic("idle");
      setMicHint("Ничего не услышал. Нажми микрофон, скажи фразу и нажми «Стоп».");
      return;
    }
    setMic("idle");
    await send(heard);
  }, [send]);

  const listen = () => {
    if (mic !== "idle" || finished) return;
    stopSpeaking(); // озвучка не должна попасть в микрофон
    setMicHint(null);
    setPartial("");
    setMic("listening");
    speechRef.current = startListening({
      lang: "en-US",
      onPartial: setPartial,
      onDone: (result) => { void onSpeech(result); },
    });
  };

  const stopListen = () => {
    const session = speechRef.current;
    if (!session) return;
    setMic("checking");
    session.stop();
  };

  const stopTask = async () => {
    if (!attemptId) return leave();
    try {
      const res = await scenarios.finish(attemptId);
      if (res.status === "discarded") return leave();
      setFinished(true);
      setSummary(res.summary);
    } catch {
      leave();
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !run) {
    return (
      <View style={{ flex: 1, padding: 24, paddingTop: screenTop(insets, 40), gap: 14 }}>
        <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>Не получилось</Text>
        <Text style={{ fontSize: 13.5, lineHeight: 21, color: colors.mutedForeground }}>
          {error ?? "Ситуация не найдена"}
        </Text>
        <ChunkyButton label="К заданиям" icon="arrowRight" center onPress={leave} />
      </View>
    );
  }

  const target = run.scenario.turnsTarget;
  const ratio = target > 0 ? Math.min(1, turns / target) : 0;
  const byGoal = run.scenario.finishMode !== "turns";

  return (
    <View style={{ flex: 1, paddingTop: screenTop(insets) }}>
      {/* ── Шапка: выход, прогресс, цель ─────────────────────────────── */}
      <View style={{ paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable onPress={leave} hitSlop={12} style={{ padding: 4 }} accessibilityLabel="Выйти">
            <Glyph name="close" size={22} color={colors.mutedForeground} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>
              {run.scenario.title}
            </Text>
            <Text style={{ fontSize: 11.5, color: colors.mutedForeground, marginTop: 1 }}>
              {turns} из {target} реплик{mistakes > 0 ? ` · ошибок ${mistakes}` : ""}
            </Text>
          </View>
          {goalReached && <Pill text="цель" tone="soft" color={accents.gold} />}
        </View>
        <View style={{
          height: 8, borderRadius: 8, marginTop: 8, overflow: "hidden",
          backgroundColor: "rgba(109,40,217,0.16)",
        }}>
          <View style={{ width: `${Math.round(ratio * 100)}%`, height: "100%" }}>
            <LinearGradient
              colors={gradients.action as unknown as string[]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1, borderRadius: 8 }}
            />
          </View>
        </View>
      </View>

      {/* ── Лента разговора ───────────────────────────────────────────── */}
      <ScrollView
        ref={listRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      >
        {/* Обстановка и цель: ученик должен видеть, во что играет, не выходя. */}
        <View style={card(colors, { backgroundColor: "rgba(99,102,241,0.08)" })}>
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.foreground }}>{run.scenario.situation}</Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: colors.mutedForeground, marginTop: 5 }}>
            Снежа: {run.scenario.role}
          </Text>
          {!!run.scenario.goal && (
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.primary, fontWeight: "800", marginTop: 6 }}>
              Цель: {run.scenario.goal}
            </Text>
          )}
        </View>

        {messages.map((m) => (
          <View key={`${m.role}-${m.id}`} style={{ alignItems: m.role === "student" ? "flex-end" : "flex-start" }}>
            <View style={{
              maxWidth: "88%",
              backgroundColor: m.role === "student" ? colors.primary : colors.card,
              borderRadius: radii.md,
              borderWidth: m.role === "student" ? 0 : 1,
              borderColor: colors.border,
              paddingHorizontal: 13, paddingVertical: 10,
            }}>
              <Text style={{
                fontSize: 14.5, lineHeight: 21,
                color: m.role === "student" ? "#fff" : colors.foreground,
              }}>
                {m.text}
              </Text>
            </View>

            {/* Реплику роли можно переслушать: разговор, а не переписка. */}
            {m.role === "ai" && speechAvailable() && (
              <Pressable
                onPress={() => speakWord(undefined, m.text)}
                hitSlop={8}
                style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4, marginLeft: 4 }}
                accessibilityLabel="Прослушать"
              >
                <Glyph name="sound" size={14} color={colors.primary} />
                <Text style={{ fontSize: 11.5, fontWeight: "800", color: colors.primary }}>Прослушать</Text>
              </Pressable>
            )}

            {/* Поправка: подписью, а не остановкой сцены. */}
            {m.role === "student" && m.correct === false && (
              <View style={{
                maxWidth: "88%", marginTop: 5,
                backgroundColor: "rgba(225,29,72,0.08)",
                borderRadius: radii.sm, borderWidth: 1, borderColor: "rgba(225,29,72,0.3)",
                padding: 9,
              }}>
                {!!m.issue && (
                  <Text style={{ fontSize: 12, lineHeight: 17, color: "#e11d48", fontWeight: "800" }}>
                    {m.issue}
                  </Text>
                )}
                {!!m.fixed && (
                  <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.foreground, marginTop: 3 }}>
                    Правильно: {m.fixed}
                  </Text>
                )}
              </View>
            )}
          </View>
        ))}

        {/* ── Итог задания ──────────────────────────────────────────── */}
        {finished && (
          <View style={card(colors, {
            backgroundColor: "rgba(139,92,246,0.1)",
            borderColor: "rgba(139,92,246,0.4)",
            marginTop: 6,
          })}>
            <Text style={{ fontSize: 16, fontWeight: "900", color: colors.primary }}>Задание закрыто</Text>
            <Text style={{ fontSize: 13, lineHeight: 20, color: colors.foreground, marginTop: 6 }}>
              Реплик: {turns}. Ошибок: {mistakes}.{goalReached ? " Цель достигнута." : ""}
            </Text>
            {!!summary && (
              <Text style={{ fontSize: 12.5, lineHeight: 19, color: colors.mutedForeground, marginTop: 8 }}>
                {summary}
              </Text>
            )}
            <Text style={{ fontSize: 12, lineHeight: 18, color: colors.mutedForeground, marginTop: 8 }}>
              Диалог с разбором уже у учителя.
            </Text>
            {!!attemptId && (
              <ChunkyButton
                label="Посмотреть разбор"
                icon="note"
                center
                onPress={() => router.replace(`/scenario-review/${attemptId}` as any)}
                style={{ marginTop: 12 }}
              />
            )}
            <ChunkyButton label="К заданиям" icon="arrowRight" center tone="dark" onPress={leave} style={{ marginTop: 4 }} />
          </View>
        )}
      </ScrollView>

      {/* ── Ввод ──────────────────────────────────────────────────────── */}
      {!finished && (
        <View style={{
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 12) + 8,
          paddingTop: 8,
          gap: 8,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.background,
        }}>
          {mic === "listening" && (
            <View style={card(colors, { paddingVertical: 8 })}>
              <VoiceWave active />
              <Text numberOfLines={1} style={{
                fontSize: 13, fontWeight: "800", textAlign: "center", marginTop: 6,
                color: partial ? colors.primary : colors.mutedForeground,
              }}>
                {partial || "Говори…"}
              </Text>
            </View>
          )}

          {!!micHint && (
            <Text style={{ fontSize: 12, lineHeight: 17, color: colors.mutedForeground }}>{micHint}</Text>
          )}

          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              editable={!sending && mic === "idle"}
              placeholder="Ответь по-английски"
              placeholderTextColor="#a99fce"
              autoCapitalize="sentences"
              autoCorrect={false}
              multiline
              onSubmitEditing={() => void send(typed)}
              style={{
                flex: 1,
                maxHeight: 96,
                backgroundColor: colors.card,
                borderRadius: radii.md,
                borderWidth: 2,
                borderColor: typed.trim() ? colors.primary : colors.border,
                paddingHorizontal: 14,
                paddingVertical: 11,
                fontSize: 15.5,
                fontWeight: "600",
                color: colors.foreground,
              }}
            />

            {/* Микрофон и отправка — одна пара кнопок: пока ученик пишет,
                микрофон не нужен, и наоборот. */}
            {typed.trim() || !speechInput ? (
              <Pressable
                onPress={() => void send(typed)}
                disabled={sending || !typed.trim()}
                style={{
                  width: 50, height: 50, borderRadius: 25,
                  alignItems: "center", justifyContent: "center",
                  backgroundColor: colors.primary,
                  opacity: sending || !typed.trim() ? 0.5 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel="Отправить"
              >
                {sending ? <ActivityIndicator color="#fff" /> : <Glyph name="send" size={21} color="#fff" />}
              </Pressable>
            ) : (
              <Pressable
                onPress={mic === "listening" ? stopListen : listen}
                disabled={sending || mic === "checking"}
                style={{
                  width: 50, height: 50, borderRadius: 25,
                  alignItems: "center", justifyContent: "center",
                  backgroundColor: mic === "listening" ? accents.amber : colors.primary,
                  opacity: sending || mic === "checking" ? 0.6 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel={mic === "listening" ? "Остановить запись" : "Сказать голосом"}
              >
                {sending || mic === "checking"
                  ? <ActivityIndicator color="#fff" />
                  : mic === "listening"
                    ? <View style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: "#fff" }} />
                    : <Glyph name="mic" size={22} color="#fff" />}
              </Pressable>
            )}
          </View>

          <Pressable onPress={() => void stopTask()} style={{ alignSelf: "center", paddingVertical: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: "800", color: colors.mutedForeground }}>
              Закончить задание
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
