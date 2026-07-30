// Детальная страница колоды: прогресс, старт изучения, список слов.
// Для собственных колод — добавление слова (с автозаполнением перевода).
import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { fc, speak, speechAvailable } from "@/hooks/useFlashcards";
import type { DeckWithProgress } from "@workspace/api-client-react";

export default function DeckDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckId = Number(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const decksQ = useQuery({ queryKey: ["fc-decks"], queryFn: fc.getDecks });
  const wordsQ = useQuery({ queryKey: ["fc-words", deckId], queryFn: () => fc.getDeckWords(deckId) });

  const deck: DeckWithProgress | undefined = (decksQ.data ?? []).find((d) => d.id === deckId);
  const words = wordsQ.data ?? [];
  const isOwn = deck ? !deck.isSystem : false;

  // формы для своих колод
  const [newEn, setNewEn] = useState("");
  const [newRu, setNewRu] = useState("");
  const [adding, setAdding] = useState(false);
  const [addNotice, setAddNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["fc-words", deckId] });
    qc.invalidateQueries({ queryKey: ["fc-decks"] });
  };

  const addWord = async () => {
    const english = newEn.trim();
    if (!english) return;
    setAdding(true);
    setAddNotice(null);
    try {
      const added = await fc.addWord(deckId, {
        english,
        translationsRu: newRu.trim() ? newRu.split(/[,;/]/).map((s) => s.trim()).filter(Boolean) : undefined,
      });
      const translation = added.translationsRu.join(", ");
      setNewEn("");
      setNewRu("");
      setAddNotice({
        type: "success",
        text: `Добавлено: ${added.english} — ${translation}${newRu.trim() ? "" : " (перевод получен автоматически)"}`,
      });
      refresh();
    } catch (e: any) {
      setAddNotice({ type: "error", text: e?.message ?? "Не удалось добавить слово. Проверьте написание и попробуйте ещё раз." });
    } finally {
      setAdding(false);
    }
  };

  const [deleting, setDeleting] = useState(false);

  // expo-router на web переиспользует экран deck/[id] для следующей колоды.
  // Сбрасываем индикатор удаления при смене колоды, иначе спиннер «залипает»
  // и кнопка удаления остаётся заблокированной для новой колоды.
  useEffect(() => {
    setDeleting(false);
  }, [deckId]);

  const removeDeck = async () => {
    setDeleting(true);
    try {
      await fc.deleteDeck(deckId);
      qc.invalidateQueries({ queryKey: ["fc-decks"] });
      setDeleting(false);
      router.back();
    } catch (e: any) {
      setDeleting(false);
      Alert.alert("Ошибка", e?.message ?? "Не удалось удалить колоду.");
    }
  };

  // Подтверждение удаления: на web — window.confirm, на нативе — Alert.
  const confirmDelete = () => {
    const message = `Удалить колоду «${deck?.title ?? ""}»? Все слова и прогресс будут потеряны.`;
    if (Platform.OS === "web") {
      if ((globalThis as any).confirm?.(message)) removeDeck();
      return;
    }
    Alert.alert("Удалить колоду", message, [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: removeDeck },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, paddingBottom: 120 }}>
      {/* шапка */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}><Feather name="arrow-left" size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 30 }}>{deck?.emoji ?? "📘"}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>{deck?.title ?? "Колода"}</Text>
          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
            {words.length} слов{deck ? ` · выучено ${deck.learnedCount}` : ""}
          </Text>
        </View>
        {isOwn && (
          <TouchableOpacity onPress={confirmDelete} disabled={deleting} style={{ padding: 6 }}>
            {deleting ? <ActivityIndicator color={colors.destructive} /> : <Feather name="trash-2" size={22} color={colors.destructive} />}
          </TouchableOpacity>
        )}
      </View>

      {/* старт */}
      <TouchableOpacity
        onPress={() => router.push(`/flashcards/study/${deckId}`)}
        activeOpacity={0.85}
        style={{ backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 18 }}
      >
        <Feather name="play" size={18} color="#fff" />
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Начать учить</Text>
      </TouchableOpacity>

      {/* инструменты своей колоды */}
      {isOwn && (
        <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 18 }}>
          <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginBottom: 10 }}>Добавить слово</Text>
          <TextInput value={newEn} onChangeText={(value) => { setNewEn(value); setAddNotice(null); }} placeholder="Английское слово или фраза" autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.mutedForeground}
            style={{ backgroundColor: colors.background === "transparent" ? "#fff" : colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground, marginBottom: 8 }} />
          <TextInput value={newRu} onChangeText={(value) => { setNewRu(value); setAddNotice(null); }} placeholder="Перевод (необязательно)" placeholderTextColor={colors.mutedForeground}
            style={{ backgroundColor: colors.background === "transparent" ? "#fff" : colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground, marginBottom: 8 }} />
          <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start", marginBottom: 10 }}>
            <Feather name="zap" size={14} color={colors.primary} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: colors.mutedForeground }}>
              Оставьте перевод пустым — его найдёт Google Translate. Неверно написанное или несуществующее слово не будет добавлено.
            </Text>
          </View>
          {addNotice && (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: (addNotice.type === "success" ? colors.success : colors.destructive) + "14", borderWidth: 1, borderColor: (addNotice.type === "success" ? colors.success : colors.destructive) + "45", borderRadius: 12, padding: 10, marginBottom: 10 }}>
              <Feather name={addNotice.type === "success" ? "check-circle" : "alert-circle"} size={16} color={addNotice.type === "success" ? colors.success : colors.destructive} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: addNotice.type === "success" ? colors.success : colors.destructive }}>{addNotice.text}</Text>
            </View>
          )}
          <TouchableOpacity onPress={addWord} disabled={adding || !newEn.trim()} activeOpacity={0.85}
            style={{ backgroundColor: newEn.trim() ? colors.primary : colors.border, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
            {adding ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>Добавить слово</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* список слов */}
      <Text style={{ fontSize: 13, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>Слова</Text>
      {wordsQ.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : words.length === 0 ? (
        <Text style={{ color: colors.mutedForeground }}>Пока нет слов.</Text>
      ) : (
        words.map((w) => (
          <View key={w.id} style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 }}>
            {!!w.emoji && <Text style={{ fontSize: 24 }}>{w.emoji}</Text>}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>{w.english}</Text>
                {!!w.ipa && <Text style={{ fontSize: 13, color: colors.mutedForeground }}>{w.ipa}</Text>}
              </View>
              <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 2 }}>{w.translationsRu.join(", ")}</Text>
            </View>
            {speechAvailable() && (
              <TouchableOpacity onPress={() => speak(w.english)} style={{ padding: 6 }}>
                <Feather name="volume-2" size={18} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}
