// Детальная страница колоды: прогресс, старт изучения, список слов.
// Для собственных колод — добавление слова (с автозаполнением перевода).
// Для собственных колод учителя — отправка колоды своим ученикам.
//
// Колода запрашивается по id (`fc.getDeck`), а не ищется в общем списке колод.
// Раньше экран брал её из `fc.getDecks()`, и если список не загружался, колода
// «не находилась»: isOwn становился false, а вместе с ним пропадали и форма
// добавления слова, и все инструменты владельца — выглядело так, будто
// функционал не реализован.
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { useColors } from "@/hooks/useColors";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import { fc, speak, speechAvailable, type DeckWithAssign, type MyStudent } from "@/hooks/useFlashcards";
import type { FlashcardWord } from "@workspace/api-client-react";

export default function DeckDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckId = Number(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();

  const deckQ = useQuery({ queryKey: ["fc-deck", deckId], queryFn: () => fc.getDeck(deckId) });
  const wordsQ = useQuery({ queryKey: ["fc-words", deckId], queryFn: () => fc.getDeckWords(deckId) });

  const deck: DeckWithAssign | undefined = deckQ.data;
  const words = wordsQ.data ?? [];
  const isOwn = deck ? !deck.isSystem && deck.ownerId === user?.id : false;
  // Отправлять колоду ученикам может только учитель — и только свою колоду.
  const canAssign = isOwn && isTeacherOrAdmin(user?.role ?? "");

  // формы для своих колод
  const [newEn, setNewEn] = useState("");
  const [newRu, setNewRu] = useState("");
  const [adding, setAdding] = useState(false);
  const [addNotice, setAddNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["fc-words", deckId] });
    qc.invalidateQueries({ queryKey: ["fc-deck", deckId] });
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

  // Колода не загрузилась — показываем причину, а не пустой экран без кнопок.
  if (deckQ.isError) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6, alignSelf: "flex-start", marginBottom: 20 }}>
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: "center" }}>
          <Feather name="alert-triangle" size={28} color={colors.destructive} />
          <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, marginTop: 10 }}>Не удалось открыть колоду</Text>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 6, textAlign: "center" }}>
            {deckQ.error instanceof Error ? deckQ.error.message : "Попробуйте ещё раз"}
          </Text>
          <TouchableOpacity onPress={() => deckQ.refetch()} activeOpacity={0.85}
            style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 10 }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Повторить</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

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

      {/* отправка колоды ученикам (только учитель, только своя колода) */}
      {canAssign && (
        <AssignToStudents
          deckId={deckId}
          wordCount={words.length}
          colors={colors}
          onChanged={() => qc.invalidateQueries({ queryKey: ["fc-deck", deckId] })}
        />
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

// ── Отправка колоды ученикам ───────────────────────────────────────────────
// Раньше отправить колоду можно было только с профиля каждого ученика
// (модалка «Отправить колоду» на friend/[id]). С экрана самой колоды — того
// места, где учитель её и создаёт, — сделать это было нельзя. Здесь обратный
// и более естественный порядок: одна колода → отметить учеников.
function AssignToStudents({
  deckId,
  wordCount,
  colors,
  onChanged,
}: {
  deckId: number;
  wordCount: number;
  colors: any;
  onChanged: () => void;
}) {
  const studentsQ = useQuery({ queryKey: ["my-students"], queryFn: fc.getMyStudents });
  const assigneesQ = useQuery({ queryKey: ["fc-assignees", deckId], queryFn: () => fc.getAssignees(deckId) });

  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Локальное состояние поверх ответа сервера: кнопка должна реагировать сразу.
  const [assigned, setAssigned] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (assigneesQ.data) setAssigned(new Set(assigneesQ.data));
  }, [assigneesQ.data]);

  const students = studentsQ.data ?? [];
  const empty = wordCount === 0;

  const toggle = useCallback(async (studentId: number) => {
    setBusyId(studentId);
    setError(null);
    const isOn = assigned.has(studentId);
    try {
      if (isOn) {
        await fc.unassignDeck(deckId, studentId);
        setAssigned((prev) => { const next = new Set(prev); next.delete(studentId); return next; });
      } else {
        await fc.assignDeck(deckId, studentId);
        setAssigned((prev) => new Set(prev).add(studentId));
      }
      onChanged();
    } catch (e: any) {
      // Ошибку показываем: молчаливый отказ выглядел как «кнопка не работает».
      setError(e?.message ?? "Не удалось изменить назначение колоды");
    } finally {
      setBusyId(null);
    }
  }, [assigned, deckId, onChanged]);

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Feather name="send" size={15} color={colors.primary} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "800", color: colors.foreground }}>Отправить ученикам</Text>
        {assigned.size > 0 && (
          <View style={{ backgroundColor: colors.primary + "22", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 12 }}>{assigned.size}</Text>
          </View>
        )}
      </View>
      <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 12 }}>
        Колода появится у ученика в разделе «Слова».
      </Text>

      {empty && (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: colors.warning + "14", borderWidth: 1, borderColor: colors.warning + "45", borderRadius: 12, padding: 10, marginBottom: 12 }}>
          <Feather name="info" size={15} color={colors.warning} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: colors.foreground }}>
            В колоде пока нет слов. Добавьте хотя бы одно — иначе ученику будет нечего учить.
          </Text>
        </View>
      )}

      {!!error && (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: colors.destructive + "14", borderWidth: 1, borderColor: colors.destructive + "45", borderRadius: 12, padding: 10, marginBottom: 12 }}>
          <Feather name="alert-circle" size={15} color={colors.destructive} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: colors.destructive }}>{error}</Text>
        </View>
      )}

      {studentsQ.isLoading || assigneesQ.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
      ) : studentsQ.isError ? (
        <View style={{ alignItems: "center", paddingVertical: 12, gap: 10 }}>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
            {studentsQ.error instanceof Error ? studentsQ.error.message : "Не удалось загрузить список учеников"}
          </Text>
          <TouchableOpacity onPress={() => studentsQ.refetch()} style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : students.length === 0 ? (
        <Text style={{ fontSize: 13, color: colors.mutedForeground, paddingVertical: 8 }}>
          У вас пока нет учеников. Пригласите их по коду в разделе «Ученики» — после этого колоду можно будет отправить.
        </Text>
      ) : (
        students.map((s: MyStudent) => {
          const on = assigned.has(s.id);
          return (
            <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
              <AnimatedAvatar size={34} avatarColor={s.avatarColor ?? "#6366f1"} avatarEmoji={s.avatarEmoji} avatarUrl={s.avatarUrl} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>
                  {s.name}{s.surname ? ` ${s.surname}` : ""}
                </Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>@{s.username}</Text>
              </View>
              <TouchableOpacity
                onPress={() => toggle(s.id)}
                disabled={busyId === s.id}
                activeOpacity={0.85}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 6,
                  backgroundColor: on ? colors.muted : colors.primary,
                  borderWidth: on ? 1 : 0, borderColor: colors.border,
                  borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9,
                  minWidth: 124, justifyContent: "center",
                }}
              >
                {busyId === s.id ? (
                  <ActivityIndicator size="small" color={on ? colors.mutedForeground : "#fff"} />
                ) : (
                  <>
                    <Feather name={on ? "check" : "send"} size={14} color={on ? colors.mutedForeground : "#fff"} />
                    <Text style={{ fontSize: 13, fontWeight: "700", color: on ? colors.mutedForeground : "#fff" }}>
                      {on ? "Отправлено" : "Отправить"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          );
        })
      )}
    </View>
  );
}
