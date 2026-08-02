// Создание собственной колоды. После создания — переход к странице колоды,
// где можно добавлять слова (с автозаполнением) и импортировать списки.
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { fc } from "@/hooks/useFlashcards";

const EMOJI = ["📕", "📗", "📘", "📙", "🧠", "⭐", "🔤", "🌍", "🎯", "💡"];

export default function NewDeckScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("📕");
  const [theme, setTheme] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const deck = await fc.createDeck({ title: title.trim(), emoji, theme: theme.trim() || undefined });
      // Кладём колоду в кэш, чтобы её страница открылась с готовым названием и
      // формой добавления слов, а не ждала загрузки общего списка колод.
      qc.setQueryData(["fc-deck", deck.id], {
        ...deck, wordCount: 0, learnedCount: 0, dueCount: 0, newCount: 0, canEdit: true,
      });
      qc.setQueryData(["fc-words", deck.id], []);
      qc.invalidateQueries({ queryKey: ["fc-decks"] });
      qc.invalidateQueries({ queryKey: ["fc-my-decks"] });
      router.replace(`/flashcards/deck/${deck.id}`);
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message ?? "Не удалось создать колоду.");
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, paddingBottom: 120 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}><Feather name="arrow-left" size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 24, fontWeight: "900", color: colors.foreground }}>Своя колода</Text>
      </View>

      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>Название</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="Например: Мои слова из фильма" placeholderTextColor={colors.mutedForeground}
        style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.foreground, marginBottom: 18 }} />

      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>Тема (необязательно)</Text>
      <TextInput value={theme} onChangeText={setTheme} placeholder="например: Мои фразы с урока" placeholderTextColor={colors.mutedForeground}
        maxLength={60}
        style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.foreground, marginBottom: 18 }} />

      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>Иконка</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 26 }}>
        {EMOJI.map((e) => (
          <TouchableOpacity key={e} onPress={() => setEmoji(e)} style={{ width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: emoji === e ? colors.primary : colors.border, backgroundColor: emoji === e ? colors.primary + "18" : colors.card }}>
            <Text style={{ fontSize: 24 }}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity onPress={create} disabled={saving || !title.trim()} activeOpacity={0.85}
        style={{ backgroundColor: title.trim() ? colors.primary : colors.border, borderRadius: 16, paddingVertical: 15, alignItems: "center" }}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Создать колоду</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}
