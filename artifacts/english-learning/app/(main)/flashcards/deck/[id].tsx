// Детальная страница колоды: прогресс, старт изучения, список слов.
// Для собственных колод — добавление слова (с автозаполнением перевода) и
// импорт списком. Учителю здесь же доступна выдача колоды ученикам, чтобы после
// наполнения слов не искать эту кнопку на другом экране.
import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import { InfoHint } from "@/components/InfoHint";
import { DeckAssignModal } from "@/components/DeckAssignModal";
import { fc, speak, speechAvailable } from "@/hooks/useFlashcards";
import type { DeckWithProgress, FlashcardWord } from "@workspace/api-client-react";

const IMPORT_HINT = {
  title: "Импорт списком",
  summary:
    "Быстрый способ наполнить колоду: одна строка — одно слово с переводом через запятую. Например: apple, яблоко",
  points: [
    "Перевод при импорте обязателен — строки без него будут пропущены. Это главное отличие от формы выше: там одно слово можно добавить без перевода, и он найдётся автоматически.",
    "Несколько переводов одного слова разделяйте точкой с запятой: run, бежать; управлять",
    "Через запятую можно добавить ещё три необязательных колонки, по порядку: транскрипция, пример по-английски, перевод примера.",
    "Подходит вставка прямо из таблицы: разделителем может быть и запятая, и табуляция. Строка-заголовок вида «english, translation» распознаётся и пропускается.",
    "Импорт можно повторять: слова, которые уже есть в колоде, не задублируются.",
    "После импорта появится отчёт: сколько слов добавлено и сколько пропущено.",
  ],
};

export default function DeckDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckId = Number(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const decksQ = useQuery({ queryKey: ["fc-decks"], queryFn: fc.getDecks });
  const wordsQ = useQuery({ queryKey: ["fc-words", deckId], queryFn: () => fc.getDeckWords(deckId) });

  const { user } = useAuth();
  const isTeacher = isTeacherOrAdmin(user?.role ?? "");

  const deck: DeckWithProgress | undefined = (decksQ.data ?? []).find((d) => d.id === deckId);
  const words = wordsQ.data ?? [];
  const isOwn = deck ? !deck.isSystem : false;

  // формы для своих колод
  const [newEn, setNewEn] = useState("");
  const [newRu, setNewRu] = useState("");
  const [adding, setAdding] = useState(false);
  const [addNotice, setAddNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // импорт списком
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // выдача колоды ученикам (учитель)
  const [assignOpen, setAssignOpen] = useState(false);

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
    const content = importText.trim();
    if (!content) return;
    setImporting(true);
    setImportNotice(null);
    try {
      const result = await fc.importWords(deckId, "csv", content);
      if (result.added > 0) {
        setImportText("");
        setImportNotice({
          type: "success",
          text: `Добавлено слов: ${result.added}${result.skipped > 0 ? `, пропущено: ${result.skipped} (нет перевода или слово уже в колоде)` : ""}`,
        });
        refresh();
      } else {
        setImportNotice({
          type: "error",
          text: "Ничего не добавлено. Проверьте, что у каждой строки есть перевод после запятой — без него слово пропускается.",
        });
      }
    } catch (e: any) {
      setImportNotice({ type: "error", text: e?.message ?? "Не удалось разобрать список." });
    } finally {
      setImporting(false);
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

      {/* старт. У учителя главное действие — выдать колоду ученикам, а не учить
          её самому: своя статистика повторений ему не нужна. */}
      {isTeacher && isOwn ? (
        <View style={{ gap: 10, marginBottom: 18 }}>
          <TouchableOpacity
            onPress={() => setAssignOpen(true)}
            disabled={words.length === 0}
            activeOpacity={0.85}
            style={{
              backgroundColor: words.length === 0 ? colors.border : colors.primary,
              borderRadius: 16, paddingVertical: 16, alignItems: "center",
              flexDirection: "row", justifyContent: "center", gap: 8,
            }}
          >
            <Feather name="send" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Выдать ученикам</Text>
          </TouchableOpacity>
          {words.length === 0 ? (
            <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center" }}>
              Сначала добавьте хотя бы одно слово — пустую колоду выдавать нечего.
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={() => router.push(`/flashcards/study/${deckId}`)}
            activeOpacity={0.85}
            style={{
              backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
              borderRadius: 16, paddingVertical: 13, alignItems: "center",
              flexDirection: "row", justifyContent: "center", gap: 8,
            }}
          >
            <Feather name="eye" size={16} color={colors.foreground} />
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>
              Посмотреть карточки
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => router.push(`/flashcards/study/${deckId}`)}
          activeOpacity={0.85}
          style={{ backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 18 }}
        >
          <Feather name="play" size={18} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Начать учить</Text>
        </TouchableOpacity>
      )}

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

          {/* Импорт списком: наполнить колоду целиком, не вводя слова по одному. */}
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 14 }} />
          <TouchableOpacity
            onPress={() => setImportOpen((v) => !v)}
            activeOpacity={0.7}
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <Feather name="upload" size={15} color={colors.primary} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: "800", color: colors.foreground }}>
              Импорт списком
            </Text>
            <Feather name={importOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
          </TouchableOpacity>

          {importOpen && (
            <View style={{ marginTop: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Text style={{ flex: 1, fontSize: 12, color: colors.mutedForeground }}>
                  Одна строка — одно слово с переводом через запятую.
                </Text>
                <InfoHint
                  title={IMPORT_HINT.title}
                  summary={IMPORT_HINT.summary}
                  points={IMPORT_HINT.points}
                  size={16}
                />
              </View>
              <TextInput
                value={importText}
                onChangeText={(value) => { setImportText(value); setImportNotice(null); }}
                placeholder={"apple, яблоко\nrun, бежать; управлять\nbook, книга"}
                placeholderTextColor={colors.mutedForeground}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  backgroundColor: colors.background === "transparent" ? "#fff" : colors.background,
                  borderWidth: 1, borderColor: colors.border, borderRadius: 12,
                  paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground,
                  minHeight: 96, textAlignVertical: "top", marginBottom: 8,
                  ...(Platform.OS === "web" ? { fontFamily: "monospace" as any } : {}),
                }}
              />
              {importNotice && (
                <View style={{
                  flexDirection: "row", gap: 8, alignItems: "flex-start",
                  backgroundColor: (importNotice.type === "success" ? colors.success : colors.destructive) + "14",
                  borderWidth: 1, borderColor: (importNotice.type === "success" ? colors.success : colors.destructive) + "45",
                  borderRadius: 12, padding: 10, marginBottom: 10,
                }}>
                  <Feather
                    name={importNotice.type === "success" ? "check-circle" : "alert-circle"}
                    size={16}
                    color={importNotice.type === "success" ? colors.success : colors.destructive}
                    style={{ marginTop: 1 }}
                  />
                  <Text style={{
                    flex: 1, fontSize: 13, lineHeight: 18,
                    color: importNotice.type === "success" ? colors.success : colors.destructive,
                  }}>
                    {importNotice.text}
                  </Text>
                </View>
              )}
              <TouchableOpacity
                onPress={runImport}
                disabled={importing || !importText.trim()}
                activeOpacity={0.85}
                style={{
                  backgroundColor: importText.trim() ? colors.primary : colors.border,
                  borderRadius: 12, paddingVertical: 12, alignItems: "center",
                }}
              >
                {importing
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: "#fff", fontWeight: "800" }}>Импортировать</Text>}
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

      {isTeacher && isOwn && deck ? (
        <DeckAssignModal
          visible={assignOpen}
          deck={{ id: deck.id, title: deck.title, emoji: deck.emoji ?? null }}
          onClose={(changed) => {
            setAssignOpen(false);
            if (changed) qc.invalidateQueries({ queryKey: ["fc-decks"] });
          }}
        />
      ) : null}
    </ScrollView>
  );
}
