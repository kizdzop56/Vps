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
const STUDY_BACKGROUND = "#F8F7FF";

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[.,!?;:()"']/g, "").replace(/ё/g, "е");
}
function isCorrect(typed: string, translations: string[]): boolean {
  const t = normalize(typed);
  if (!t) return false;
  // Разбиваем каждый перевод на варианты (по , ; /) ДО нормализации, чтобы
  // перевод из нескольких значений в одной строке («идти, ехать») матчился по «идти».
  return translations.some((tr) =>
    tr.split(/[,;/]/).some((part) => normalize(part) === t)
  );
}

// deckId — обычный режим (очередь колоды). loader — произвольный источник карточек
// (например «Марафон слов»), тогда deckId не нужен. Указывайте что-то одно.
export function FlashcardStudy({
  deckId,
  loader,
  onExit,
}: {
  deckId?: number;
  loader?: () => Promise<StudyQueue>;
  onExit: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const width = Dimensions.get("window").width;
  const height = Dimensions.get("window").height;
  const cardHeight = Math.min(500, Math.max(400, height - insets.top - insets.bottom - 260));

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
    const load = loader ?? (() => fc.getStudyQueue(deckId as number));
    load()
      .then((q) => {
        setQueue(q);
        if (q.cards.length === 0) setPhase("done");
        else setPhase(q.needsIntro ? "intro" : "train");
      })
      .catch(() => setError("Не удалось загрузить карточки."));
  }, [deckId, loader]);

  const doFlip = useCallback((to: boolean) => {
    setFlipped(to);
    // useNativeDriver:false — panX управляется JS-драйвером (Animated.event ниже),
    // поэтому все анимации карточки держим на одном (JS) драйвере во избежание
    // конфликта «два драйвера на одном узле» на iOS/Android.
    Animated.timing(flip, { toValue: to ? 1 : 0, duration: 320, useNativeDriver: false }).start();
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
  const displayEnglish = card?.english?.trim() || "Слово не загружено";
  const hasDisplayEnglish = Boolean(card?.english?.trim());
  const progress = cards.length ? (pos + 1) / cards.length : 0;

  // ── завершить карточку с оценкой (know/dont) ──
  const commit = useCallback((result: "know" | "dont") => {
    if (!card) return;
    if (result === "know") setKnown((n) => n + 1); else setLearning((n) => n + 1);
    fc.review(card.id, result).catch(() => {});
    Animated.timing(panX, {
      toValue: result === "know" ? width : -width,
      duration: 220,
      useNativeDriver: false,
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
    else Animated.spring(panX, { toValue: 0, useNativeDriver: false }).start();
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
    <View style={{ width: "100%", height: cardHeight }}>
      {/* ЛИЦО */}
      <Animated.View
        style={{
          position: "absolute", width: "100%", height: "100%",
          backgroundColor: colors.card, borderRadius: 28, borderWidth: 1, borderColor: "rgba(99,102,241,0.16)",
          padding: 28, alignItems: "center", justifyContent: "center", overflow: "hidden",
          shadowColor: "#4338ca", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.11, shadowRadius: 24, elevation: 6,
          opacity: frontOpacity,
          transform: [{ perspective: 1000 }, { rotateY: frontRotateY }],
          ...(Platform.OS === "web" ? ({ backfaceVisibility: "hidden" } as object) : {}),
        }}
      >
        <View style={{ position: "absolute", top: 20, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Feather name="book-open" size={13} color={colors.primary} />
          <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "800" }}>{isIntro ? "Знакомство" : "Новое слово"}</Text>
        </View>
        <View style={{ alignItems: "center", maxWidth: "100%" }}>
          {!!card?.partOfSpeech && <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 10, textTransform: "capitalize" }}>{card.partOfSpeech}</Text>}
          <Text style={{ fontSize: 40, lineHeight: 48, fontWeight: "900", letterSpacing: -0.6, color: hasDisplayEnglish ? colors.foreground : colors.destructive, textAlign: "center" }}>{displayEnglish}</Text>
          {/* Транскрипция на лицевой стороне — под словом */}
          {hasDisplayEnglish && !!card?.ipa && <Text style={{ fontSize: 18, color: colors.mutedForeground, marginTop: 8, textAlign: "center" }}>{card.ipa}</Text>}
          {!hasDisplayEnglish && <Text style={{ color: colors.mutedForeground, textAlign: "center", marginTop: 10, lineHeight: 19 }}>Вернитесь в колоду и добавьте карточку заново.</Text>}
        </View>
        {speechAvailable() && hasDisplayEnglish && (
          <TouchableOpacity onPress={() => card && speak(card.english)} activeOpacity={0.8} style={{ marginTop: 18, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }}>
            <Feather name="volume-2" size={19} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: "800" }}>Прослушать</Text>
          </TouchableOpacity>
        )}
        {!isIntro && (
          <View style={{ position: "absolute", bottom: 18, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="move" size={14} color={colors.mutedForeground} />
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Свайп: не знаю ←   знаю →</Text>
          </View>
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
    <View style={{ flex: 1, backgroundColor: STUDY_BACKGROUND, paddingTop: insets.top + 8 }}>
      {/* шапка */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 10 }}>
        <TouchableOpacity onPress={onExit} style={{ padding: 8 }}><Feather name="x" size={24} color={colors.foreground} /></TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: colors.mutedForeground, fontWeight: "800", fontSize: 13 }}>
            {isIntro ? "Знакомство" : "Тренировка"} · {Math.min(pos + 1, cards.length)}/{cards.length}
          </Text>
          <View style={{ width: 112, height: 5, borderRadius: 999, backgroundColor: "rgba(99,102,241,0.13)", marginTop: 7, overflow: "hidden" }}>
            <View style={{ width: `${Math.round(progress * 100)}%`, height: "100%", borderRadius: 999, backgroundColor: colors.primary }} />
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* карточка */}
      <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: "center" }}>
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
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 12, gap: 10 }}>
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
                onSubmitEditing={() => { setAnswered(typed.trim() ? isCorrect(typed, card?.translationsRu ?? []) : null); doFlip(true); }}
                style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.foreground }}
              />
            )}
            {!flipped ? (
              <TouchableOpacity onPress={() => { setAnswered(typed.trim() ? isCorrect(typed, card?.translationsRu ?? []) : null); doFlip(true); }} activeOpacity={0.85} style={{ backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 15, alignItems: "center" }}>
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
