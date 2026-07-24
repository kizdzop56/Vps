// Экран изучения колоды (в стиле DuoCards):
//  • слайд-шоу-знакомство (для готовых колод при первом заходе): лицо → оборот → далее;
//  • тренировка: ввод перевода → «Показать перевод» → оборот (перевод, транскрипция,
//    пример EN+RU, аудио, верно/неверно) → свайп влево (не знаю) / вправо (знаю);
//  • оценка уходит в интервальное повторение (fc.review).
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Animated, ActivityIndicator, Dimensions, Platform,
} from "react-native";
import { PanGestureHandler, State, type PanGestureHandlerStateChangeEvent } from "react-native-gesture-handler";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { fc, speak, speechAvailable } from "@/hooks/useFlashcards";
import type { StudyCard, StudyQueue } from "@workspace/api-client-react";

const SWIPE_THRESHOLD = 110;

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[.,!?;:()"']/g, "").replace(/ё/g, "е");
}
function isCorrect(typed: string, translations: string[]): boolean {
  const t = normalize(typed);
  if (!t) return false;
  return translations.some((tr) => {
    const n = normalize(tr);
    return n === t || n.split(/[,;/]/).map((x) => x.trim()).includes(t);
  });
}

export function FlashcardStudy({ deckId, onExit }: { deckId: number; onExit: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const width = Dimensions.get("window").width;

  const [queue, setQueue] = useState<StudyQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "intro" | "train" | "done">("loading");
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState("");
  const [answered, setAnswered] = useState<null | boolean>(null);
  const [known, setKnown] = useState(0);
  const [learning, setLearning] = useState(0);

  const flip = useRef(new Animated.Value(0)).current;
  const panX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fc.getStudyQueue(deckId)
      .then((q) => {
        setQueue(q);
        if (q.cards.length === 0) setPhase("done");
        else setPhase(q.needsIntro ? "intro" : "train");
      })
      .catch(() => setError("Не удалось загрузить карточки."));
  }, [deckId]);

  const doFlip = useCallback((to: boolean) => {
    setFlipped(to);
    Animated.timing(flip, { toValue: to ? 1 : 0, duration: 320, useNativeDriver: Platform.OS !== "web" }).start();
  }, [flip]);

  const resetCard = useCallback(() => {
    panX.setValue(0);
    flip.setValue(0);
    setFlipped(false);
    setTyped("");
    setAnswered(null);
  }, [panX, flip]);

  const cards: StudyCard[] = queue?.cards ?? [];
  const card = cards[pos];

  // ── завершить карточку с оценкой (know/dont) ──
  const commit = useCallback((result: "know" | "dont") => {
    if (!card) return;
    if (result === "know") setKnown((n) => n + 1); else setLearning((n) => n + 1);
    fc.review(card.id, result).catch(() => {});
    Animated.timing(panX, {
      toValue: result === "know" ? width : -width,
      duration: 220,
      useNativeDriver: Platform.OS !== "web",
    }).start(() => {
      if (pos + 1 >= cards.length) { setPhase("done"); return; }
      setPos((p) => p + 1);
      resetCard();
    });
  }, [card, cards.length, pos, panX, width, resetCard]);

  const onPanEnd = useCallback((e: PanGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state !== State.END) return;
    const { translationX } = e.nativeEvent;
    if (translationX > SWIPE_THRESHOLD) commit("know");
    else if (translationX < -SWIPE_THRESHOLD) commit("dont");
    else Animated.spring(panX, { toValue: 0, useNativeDriver: Platform.OS !== "web" }).start();
  }, [commit, panX]);

  // ── слайд-шоу-знакомство ──
  const introNext = useCallback(() => {
    if (!flipped) { doFlip(true); return; }        // сначала показать оборот
    if (pos + 1 >= cards.length) {                  // знакомство завершено → тренировка
      setPos(0); resetCard(); setPhase("train"); return;
    }
    setPos((p) => p + 1); resetCard();
  }, [flipped, pos, cards.length, doFlip, resetCard]);

  // ── состояния экрана ──
  if (error) return <Centered><Text style={{ color: colors.foreground }}>{error}</Text><ExitBtn onExit={onExit} colors={colors} /></Centered>;
  if (phase === "loading") return <Centered><ActivityIndicator size="large" color={colors.primary} /></Centered>;

  if (phase === "done") {
    return (
      <Centered>
        <Text style={{ fontSize: 60 }}>🎉</Text>
        <Text style={{ fontSize: 22, fontWeight: "900", color: colors.foreground, marginTop: 10 }}>На сегодня всё!</Text>
        <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 6, textAlign: "center" }}>
          {cards.length === 0 ? "Новых карточек и повторений на сегодня нет." : `Знаю: ${known} · Учу: ${learning}`}
        </Text>
        <ExitBtn onExit={onExit} colors={colors} label="Готово" />
      </Centered>
    );
  }

  const rotate = panX.interpolate({ inputRange: [-width, 0, width], outputRange: ["-14deg", "0deg", "14deg"] });
  const frontRotateY = flip.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const backRotateY = flip.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });
  const frontOpacity = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] });
  const backOpacity = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });
  const likeOpacity = panX.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: "clamp" });
  const nopeOpacity = panX.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: "clamp" });

  const isIntro = phase === "intro";
  const correct = card ? isCorrect(typed, card.translationsRu) : false;

  const CardFaces = (
    <View style={{ width: "100%", height: 440 }}>
      {/* ЛИЦО */}
      <Animated.View
        style={{
          position: "absolute", width: "100%", height: "100%",
          backgroundColor: colors.card, borderRadius: 24, borderWidth: 1, borderColor: colors.border,
          padding: 24, alignItems: "center", justifyContent: "center",
          opacity: frontOpacity,
          transform: [{ perspective: 1000 }, { rotateY: frontRotateY }],
          ...(Platform.OS === "web" ? ({ backfaceVisibility: "hidden" } as object) : {}),
        }}
      >
        <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 8 }}>{card?.partOfSpeech ?? ""}</Text>
        <Text style={{ fontSize: 40, fontWeight: "900", color: colors.foreground, textAlign: "center" }}>{card?.english}</Text>
        {speechAvailable() && (
          <TouchableOpacity onPress={() => card && speak(card.english)} style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="volume-2" size={20} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: "600" }}>Озвучить</Text>
          </TouchableOpacity>
        )}
        {!isIntro && (
          <Text style={{ position: "absolute", bottom: 16, color: colors.mutedForeground, fontSize: 12 }}>
            ← не знаю   ·   знаю →
          </Text>
        )}
      </Animated.View>

      {/* ОБОРОТ */}
      <Animated.View
        style={{
          position: "absolute", width: "100%", height: "100%",
          backgroundColor: colors.card, borderRadius: 24, borderWidth: 1, borderColor: colors.border,
          padding: 22, opacity: backOpacity,
          transform: [{ perspective: 1000 }, { rotateY: backRotateY }],
          ...(Platform.OS === "web" ? ({ backfaceVisibility: "hidden" } as object) : {}),
        }}
      >
        {card && (
          <View style={{ flex: 1 }}>
            {!isIntro && answered !== null && (
              <View style={{
                alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6,
                backgroundColor: (correct ? colors.success : colors.warning) + "22",
                borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10,
              }}>
                <Feather name={correct ? "check-circle" : "x-circle"} size={14} color={correct ? colors.success : colors.warning} />
                <Text style={{ color: correct ? colors.success : colors.warning, fontWeight: "700", fontSize: 12 }}>
                  {correct ? "Верно!" : "Пока неверно"}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text style={{ fontSize: 28, fontWeight: "900", color: colors.foreground }}>{card.translationsRu.join(", ")}</Text>
            </View>
            {!!card.ipa && <Text style={{ fontSize: 16, color: colors.mutedForeground, marginTop: 6 }}>{card.ipa}</Text>}

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }}>
              <Text style={{ fontSize: 20, fontWeight: "700", color: colors.primary }}>{card.english}</Text>
              {speechAvailable() && (
                <TouchableOpacity onPress={() => speak(card.english)}>
                  <Feather name="volume-2" size={20} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>

            {!!card.exampleEn && (
              <View style={{ marginTop: 18, backgroundColor: colors.accent, borderRadius: 14, padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <Text style={{ flex: 1, fontSize: 15, color: colors.foreground, fontStyle: "italic" }}>{card.exampleEn}</Text>
                  {speechAvailable() && (
                    <TouchableOpacity onPress={() => speak(card.exampleEn!)}>
                      <Feather name="volume-2" size={18} color={colors.primary} />
                    </TouchableOpacity>
                  )}
                </View>
                {!!card.exampleRu && <Text style={{ marginTop: 6, fontSize: 14, color: colors.mutedForeground }}>{card.exampleRu}</Text>}
              </View>
            )}
          </View>
        )}
      </Animated.View>

      {/* бейджи свайпа */}
      {!isIntro && (
        <>
          <Animated.View style={{ position: "absolute", top: 20, left: 20, opacity: likeOpacity, borderWidth: 3, borderColor: colors.success, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, transform: [{ rotate: "-16deg" }] }}>
            <Text style={{ color: colors.success, fontWeight: "900", fontSize: 20 }}>ЗНАЮ</Text>
          </Animated.View>
          <Animated.View style={{ position: "absolute", top: 20, right: 20, opacity: nopeOpacity, borderWidth: 3, borderColor: colors.warning, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, transform: [{ rotate: "16deg" }] }}>
            <Text style={{ color: colors.warning, fontWeight: "900", fontSize: 18 }}>УЧИТЬ</Text>
          </Animated.View>
        </>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 8 }}>
      {/* шапка */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 8 }}>
        <TouchableOpacity onPress={onExit} style={{ padding: 8 }}><Feather name="x" size={24} color={colors.foreground} /></TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: colors.mutedForeground, fontWeight: "700", fontSize: 13 }}>
            {isIntro ? "Знакомство" : "Тренировка"} · {Math.min(pos + 1, cards.length)}/{cards.length}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* карточка */}
      <View style={{ flex: 1, paddingHorizontal: 16, justifyContent: "center" }}>
        {isIntro ? (
          <TouchableOpacity activeOpacity={0.95} onPress={() => doFlip(!flipped)}>{CardFaces}</TouchableOpacity>
        ) : (
          <PanGestureHandler onHandlerStateChange={onPanEnd} onGestureEvent={Animated.event([{ nativeEvent: { translationX: panX } }], { useNativeDriver: false })}>
            <Animated.View style={{ transform: [{ translateX: panX }, { rotate }] }}>
              <TouchableOpacity activeOpacity={0.97} onPress={() => doFlip(!flipped)}>{CardFaces}</TouchableOpacity>
            </Animated.View>
          </PanGestureHandler>
        )}
      </View>

      {/* низ: ввод/кнопки */}
      <View style={{ padding: 16, paddingBottom: Math.max(insets.bottom, 12) + 8, gap: 10 }}>
        {isIntro ? (
          <TouchableOpacity onPress={introNext} activeOpacity={0.85} style={{ backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 15, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{!flipped ? "Показать перевод" : (pos + 1 >= cards.length ? "Начать тренировку" : "Следующее слово")}</Text>
          </TouchableOpacity>
        ) : (
          <>
            {!flipped && (
              <TextInput
                value={typed}
                onChangeText={setTyped}
                placeholder="Введите перевод…"
                placeholderTextColor={colors.mutedForeground}
                onSubmitEditing={() => { setAnswered(isCorrect(typed, card?.translationsRu ?? [])); doFlip(true); }}
                style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.foreground }}
              />
            )}
            {!flipped ? (
              <TouchableOpacity onPress={() => { setAnswered(isCorrect(typed, card?.translationsRu ?? [])); doFlip(true); }} activeOpacity={0.85} style={{ backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 15, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Показать перевод</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity onPress={() => commit("dont")} activeOpacity={0.85} style={{ flex: 1, backgroundColor: colors.warning + "1e", borderWidth: 1.5, borderColor: colors.warning, borderRadius: 16, paddingVertical: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}>
                  <Feather name="rotate-ccw" size={18} color={colors.warning} />
                  <Text style={{ color: colors.warning, fontWeight: "800", fontSize: 15 }}>Не знаю</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => commit("know")} activeOpacity={0.85} style={{ flex: 1, backgroundColor: colors.success + "1e", borderWidth: 1.5, borderColor: colors.success, borderRadius: 16, paddingVertical: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}>
                  <Feather name="check" size={18} color={colors.success} />
                  <Text style={{ color: colors.success, fontWeight: "800", fontSize: 15 }}>Знаю</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }}>{children}</View>;
}
function ExitBtn({ onExit, colors, label = "Закрыть" }: { onExit: () => void; colors: any; label?: string }) {
  return (
    <TouchableOpacity onPress={onExit} activeOpacity={0.85} style={{ marginTop: 26, backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 40 }}>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{label}</Text>
    </TouchableOpacity>
  );
}
