// Детальная страница колоды: прогресс, старт изучения, список слов.
// Для собственных колод — добавление слова (с автозаполнением) и импорт CSV/JSON.
import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { fc, speak, speechAvailable } from "@/hooks/useFlashcards";
import type { DeckWithProgress, FlashcardWord } from "@workspace/api-client-react";

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
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFormat, setImportFormat] = useState<"csv" | "json">("csv");
  const [importing, setImporting] = useState(false);

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

  const runImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      const r = await fc.importWords(deckId, importFormat, importText);
      Alert.alert("Импорт завершён", `Добавлено: ${r.added}, пропущено: ${r.skipped}`);
      setImportText(""); setShowImport(false); refresh();
    } catch (e: any) {
      Alert.alert("Ошибка импорта", e?.message ?? "Проверьте формат данных.");
    } finally {
      setImporting(false);
    }
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
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity onPress={addWord} disabled={adding || !newEn.trim()} activeOpacity={0.85}
              style={{ flex: 1, backgroundColor: newEn.trim() ? colors.primary : colors.border, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
              {adding ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>Добавить слово</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowImport((v) => !v)} activeOpacity={0.85}
              style={{ backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.primary, fontWeight: "800" }}>Импорт</Text>
            </TouchableOpacity>
          </View>

          {showImport && (
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                {(["csv", "json"] as const).map((f) => (
                  <TouchableOpacity key={f} onPress={() => setImportFormat(f)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: importFormat === f ? colors.primary : colors.border, backgroundColor: importFormat === f ? colors.primary + "18" : "transparent" }}>
                    <Text style={{ color: importFormat === f ? colors.primary : colors.mutedForeground, fontWeight: "700" }}>{f.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={{ fontSize: 11, color: colors.mutedForeground, marginBottom: 6 }}>
                {importFormat === "csv" ? "Формат: english,перевод[,транскрипция,пример EN,пример RU] — по строке на слово" : 'Формат: [{"english":"...","translationsRu":["..."]}]'}
              </Text>
              <TextInput value={importText} onChangeText={setImportText} multiline placeholder={importFormat === "csv" ? "cat,кошка\napple,яблоко" : '[{"english":"cat","translationsRu":["кошка"]}]'} placeholderTextColor={colors.mutedForeground}
                style={{ minHeight: 90, backgroundColor: colors.background === "transparent" ? "#fff" : colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, color: colors.foreground, textAlignVertical: "top" }} />
              <TouchableOpacity onPress={runImport} disabled={importing || !importText.trim()} activeOpacity={0.85}
                style={{ marginTop: 8, backgroundColor: importText.trim() ? colors.primary : colors.border, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
                {importing ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>Импортировать</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* список слов */}
      <Text style={{ fontSize: 13, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>Слова</Text>
      {wordsQ.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : words.length === 0 ? (
        <Text style={{ color: colors.mutedForeground }}>Пока нет слов.</Text>
      ) : (
        words.map((w: FlashcardWord) => (
          <View key={w.id} style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 }}>
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
