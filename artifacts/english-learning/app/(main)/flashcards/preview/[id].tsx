// Предпросмотр колоды для учителя.
//
// Тренажёр («Начать учить») ведёт учёт прогресса: вводит слова, ставит сроки
// повторения, начисляет очки. Учителю это только портит статистику — ему нужно
// просмотреть колоду глазами ученика. Поэтому здесь нет ни одного пишущего
// запроса: карточки листаются и переворачиваются локально.
import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { fc, speak, speakWord, speechAvailable } from "@/hooks/useFlashcards";

export default function DeckPreview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckId = Number(id);
  const validId = Number.isInteger(deckId) && deckId > 0;

  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const deckQ = useQuery({ queryKey: ["fc-deck", deckId], queryFn: () => fc.getDeck(deckId), enabled: validId });
  const wordsQ = useQuery({ queryKey: ["fc-words", deckId], queryFn: () => fc.getDeckWords(deckId), enabled: validId });

  const words = wordsQ.data ?? [];
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // Смена колоды или списка слов — начинаем просмотр заново.
  useEffect(() => { setPos(0); setFlipped(false); }, [deckId, words.length]);

  const card = words[Math.min(pos, Math.max(0, words.length - 1))];

  const go = (delta: number) => {
    setFlipped(false);
    setPos((p) => Math.min(Math.max(0, p + delta), Math.max(0, words.length - 1)));
  };

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 18 }}>
      <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
        <Feather name="arrow-left" size={24} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={{ fontSize: 26 }}>{deckQ.data?.emoji ?? "📘"}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 18, fontWeight: "900", color: colors.foreground }}>
          {deckQ.data?.title ?? "Предпросмотр"}
        </Text>
        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
          Предпросмотр — прогресс не сохраняется
        </Text>
      </View>
    </View>
  );

  if (!validId) {
    return (
      <View style={{ flex: 1, padding: 16, paddingTop: insets.top + 8, backgroundColor: colors.background }}>
        {header}
        <Text style={{ color: colors.mutedForeground }}>В адресе страницы нет номера колоды.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, paddingBottom: 120, flexGrow: 1 }}
      style={{ backgroundColor: colors.background }}
    >
      {header}

      {wordsQ.isLoading ? (
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 60 }} />
      ) : wordsQ.isError ? (
        <View style={{ backgroundColor: colors.destructive + "12", borderWidth: 1, borderColor: colors.destructive + "40", borderRadius: 14, padding: 14, gap: 10 }}>
          <Text style={{ color: colors.destructive, fontSize: 14, fontWeight: "600" }}>
            {(wordsQ.error as any)?.message ?? "Не удалось загрузить слова."}
          </Text>
          <TouchableOpacity onPress={() => wordsQ.refetch()} style={{ alignSelf: "flex-start", backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : words.length === 0 || !card ? (
        <View style={{ alignItems: "center", gap: 12, marginTop: 50 }}>
          <Text style={{ fontSize: 44 }}>📝</Text>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>В колоде пока нет слов</Text>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", lineHeight: 19 }}>
            Вернитесь назад и добавьте слова — здесь появится то, что увидит ученик.
          </Text>
        </View>
      ) : (
        <>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.mutedForeground, textAlign: "center", marginBottom: 12 }}>
            {pos + 1} из {words.length}
          </Text>

          {/* карточка: тап переворачивает, как у ученика */}
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setFlipped((f) => !f)}
            style={{
              backgroundColor: colors.card, borderRadius: 22, borderWidth: 1, borderColor: colors.border,
              paddingVertical: 46, paddingHorizontal: 20, alignItems: "center", justifyContent: "center",
              minHeight: 250, gap: 10,
            }}
          >
            {!!card.emoji && <Text style={{ fontSize: 46 }}>{card.emoji}</Text>}
            {flipped ? (
              <>
                <Text style={{ fontSize: 26, fontWeight: "900", color: colors.primary, textAlign: "center" }}>
                  {card.translationsRu.join(", ")}
                </Text>
                {!!card.exampleEn && (
                  <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginTop: 6, lineHeight: 20 }}>
                    {card.exampleEn}
                  </Text>
                )}
                {!!card.exampleRu && (
                  <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", lineHeight: 19 }}>
                    {card.exampleRu}
                  </Text>
                )}
              </>
            ) : (
              <>
                <Text style={{ fontSize: 30, fontWeight: "900", color: colors.foreground, textAlign: "center" }}>
                  {card.english}
                </Text>
                {!!card.ipa && <Text style={{ fontSize: 15, color: colors.mutedForeground }}>{card.ipa}</Text>}
              </>
            )}
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 14 }}>
              {flipped ? "Нажмите, чтобы скрыть перевод" : "Нажмите, чтобы увидеть перевод"}
            </Text>
          </TouchableOpacity>

          {speechAvailable() && (
            <TouchableOpacity
              onPress={() => speakWord(card.id, card.english)}
              style={{ alignSelf: "center", marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}
            >
              <Feather name="volume-2" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>Послушать</Text>
            </TouchableOpacity>
          )}

          <View style={{ flexDirection: "row", gap: 10, marginTop: 22 }}>
            <TouchableOpacity
              onPress={() => go(-1)}
              disabled={pos === 0}
              style={{
                flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: "center",
                borderWidth: 1, borderColor: colors.border,
                opacity: pos === 0 ? 0.4 : 1,
              }}
            >
              <Text style={{ color: colors.foreground, fontWeight: "700" }}>Назад</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => go(1)}
              disabled={pos >= words.length - 1}
              style={{
                flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: "center",
                backgroundColor: colors.primary,
                opacity: pos >= words.length - 1 ? 0.4 : 1,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>Дальше</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}
