// ─────────────────────────────────────────────────────────────────────────────
// Детальная страница колоды: прогресс, старт изучения, список слов.
//
// Для своих колод здесь же вся правка после сохранения:
//   • добавить слова из каталога (та же подборка, что и в конструкторе);
//   • добавить слово руками (с автопереводом) — как было раньше;
//   • убрать слово из колоды;
//   • переименовать колоду и сменить иконку;
//   • учителю — управлять получателями: кому колода отправлена.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, Platform, Modal } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import { fc, speak, speechAvailable, type DeckWithAssign, type ManualWordInput } from "@/hooks/useFlashcards";
import { formatStudentName } from "@/utils/displayName";
import WordPicker from "@/components/WordPicker";
import AssignStudentsSheet from "@/components/AssignStudentsSheet";

const EMOJI = ["📕", "📗", "📘", "📙", "🧠", "⭐", "🔤", "🌍", "🎯", "💡"];

export default function DeckDetail() {
  const { id, saved } = useLocalSearchParams<{ id: string; saved?: string }>();
  const deckId = Number(id);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();

  const canAssign = isTeacherOrAdmin(user?.role ?? "");

  const decksQ = useQuery({ queryKey: ["fc-decks"], queryFn: fc.getDecks });
  const wordsQ = useQuery({ queryKey: ["fc-words", deckId], queryFn: () => fc.getDeckWords(deckId) });

  const deck: DeckWithAssign | undefined = (decksQ.data ?? []).find((d) => d.id === deckId);
  const words = wordsQ.data ?? [];
  const isOwn = deck ? !deck.isSystem : false;

  // Сообщение после сохранения из конструктора («12 слов, отправлена 3 ученикам»).
  const [savedNotice, setSavedNotice] = useState<string | null>(saved ?? null);

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

  // ── Переименование ────────────────────────────────────────────────────────
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftEmoji, setDraftEmoji] = useState("📕");
  const [savingTitle, setSavingTitle] = useState(false);

  // expo-router на web переиспользует экран deck/[id] для следующей колоды.
  // Сбрасываем индикатор удаления при смене колоды, иначе спиннер «залипает»
  // и кнопка удаления остаётся заблокированной для новой колоды.
  useEffect(() => {
    setDeleting(false);
    setRenaming(false);
    setSavedNotice(saved ?? null);
  }, [deckId, saved]);

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

  const startRename = () => {
    setDraftTitle(deck?.title ?? "");
    setDraftEmoji(deck?.emoji ?? "📕");
    setRenaming(true);
  };

  const saveRename = async () => {
    const title = draftTitle.trim();
    if (!title) return;
    setSavingTitle(true);
    try {
      await fc.updateDeck(deckId, { title, emoji: draftEmoji });
      qc.invalidateQueries({ queryKey: ["fc-decks"] });
      setRenaming(false);
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message ?? "Не удалось переименовать колоду.");
    } finally {
      setSavingTitle(false);
    }
  };

  // ── Удаление слова ────────────────────────────────────────────────────────
  const [removingWordId, setRemovingWordId] = useState<number | null>(null);

  const removeWord = async (wordId: number, english: string) => {
    const go = async () => {
      setRemovingWordId(wordId);
      try {
        await fc.deleteWord(deckId, wordId);
        refresh();
      } catch (e: any) {
        Alert.alert("Ошибка", e?.message ?? "Не удалось убрать слово.");
      } finally {
        setRemovingWordId(null);
      }
    };
    const message = `Убрать «${english}» из колоды?`;
    if (Platform.OS === "web") {
      if ((globalThis as any).confirm?.(message)) go();
      return;
    }
    Alert.alert("Убрать слово", message, [
      { text: "Отмена", style: "cancel" },
      { text: "Убрать", style: "destructive", onPress: go },
    ]);
  };

  // ── Добавление из каталога ────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickIds, setPickIds] = useState<number[]>([]);
  const [pickManual, setPickManual] = useState<ManualWordInput[]>([]);
  const [savingPick, setSavingPick] = useState(false);

  const alreadyIn = useMemo(() => words.map((w) => w.english), [words]);
  const pickCount = pickIds.length + pickManual.length;

  const closePicker = () => {
    setPickerOpen(false);
    setPickIds([]);
    setPickManual([]);
  };

  const savePick = async () => {
    if (pickCount === 0) return;
    setSavingPick(true);
    try {
      const res = await fc.addWordsBulk(deckId, {
        wordIds: pickIds.length > 0 ? pickIds : undefined,
        words: pickManual.length > 0 ? pickManual : undefined,
      });
      refresh();
      closePicker();
      setAddNotice(res.failed.length > 0
        ? { type: "error", text: `Добавлено ${res.added} слов. Не удалось: ${res.failed.map((f) => f.english).join(", ")}.` }
        : { type: "success", text: `Добавлено слов: ${res.added}${res.skipped > 0 ? ` (пропущено дубликатов: ${res.skipped})` : ""}.` });
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message ?? "Не удалось добавить слова.");
    } finally {
      setSavingPick(false);
    }
  };

  // ── Получатели колоды ─────────────────────────────────────────────────────
  const showAssign = isOwn && canAssign;
  const assigneesQ = useQuery({
    queryKey: ["fc-assignees", deckId],
    queryFn: () => fc.getAssignees(deckId),
    enabled: showAssign,
  });
  const studentsQ = useQuery({
    queryKey: ["fc-teacher-students"],
    queryFn: fc.getTeacherStudents,
    enabled: showAssign,
  });

  const assignedIds = assigneesQ.data ?? [];
  const assignedStudents = useMemo(() => {
    const byId = new Map((studentsQ.data ?? []).map((s) => [s.id, s]));
    return assignedIds.map((sid) => byId.get(sid)).filter((s): s is NonNullable<typeof s> => !!s);
  }, [assignedIds, studentsQ.data]);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPick, setAssignPick] = useState<number[]>([]);
  const [savingAssign, setSavingAssign] = useState(false);

  const openAssign = () => {
    setAssignPick(assignedIds);
    setAssignOpen(true);
  };

  const saveAssign = async () => {
    setSavingAssign(true);
    try {
      // replace: список получателей становится ровно таким, как отмечено.
      const res = await fc.assignDeckBulk(deckId, assignPick, true);
      qc.invalidateQueries({ queryKey: ["fc-assignees", deckId] });
      qc.invalidateQueries({ queryKey: ["fc-decks"] });
      setAssignOpen(false);
      setAddNotice({
        type: "success",
        text: `Получателей: ${res.assigned}${res.revoked > 0 ? `, отозвано: ${res.revoked}` : ""}.`,
      });
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message ?? "Не удалось сохранить получателей.");
    } finally {
      setSavingAssign(false);
    }
  };

  const inputStyle = {
    backgroundColor: colors.background === "transparent" ? "#fff" : colors.background,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground,
  } as const;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, paddingBottom: 120 }}>
        {/* шапка */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
            <Feather name="arrow-left" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={{ fontSize: 30 }}>{deck?.emoji ?? "📘"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>{deck?.title ?? "Колода"}</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
              {words.length} слов{deck ? ` · выучено ${deck.learnedCount}` : ""}
              {showAssign && assignedIds.length > 0 ? ` · у ${assignedIds.length} учеников` : ""}
            </Text>
          </View>
          {isOwn && (
            <>
              <TouchableOpacity onPress={startRename} style={{ padding: 6 }}>
                <Feather name="edit-2" size={19} color={colors.mutedForeground} />
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDelete} disabled={deleting} style={{ padding: 6 }}>
                {deleting ? <ActivityIndicator color={colors.destructive} /> : <Feather name="trash-2" size={22} color={colors.destructive} />}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* колода сохранена из конструктора */}
        {savedNotice && (
          <View style={{
            flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 14,
            backgroundColor: colors.success + "14", borderWidth: 1, borderColor: colors.success + "45",
            borderRadius: 12, padding: 12,
          }}>
            <Feather name="check-circle" size={16} color={colors.success} />
            <Text style={{ flex: 1, fontSize: 13, color: colors.success }}>Колода сохранена: {savedNotice}</Text>
            <TouchableOpacity onPress={() => setSavedNotice(null)} style={{ padding: 4 }}>
              <Feather name="x" size={15} color={colors.success} />
            </TouchableOpacity>
          </View>
        )}

        {/* переименование */}
        {renaming && (
          <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 18 }}>
            <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginBottom: 10 }}>Название и иконка</Text>
            <TextInput value={draftTitle} onChangeText={setDraftTitle} placeholder="Название колоды"
              placeholderTextColor={colors.mutedForeground} style={{ ...inputStyle, marginBottom: 10 }} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {EMOJI.map((e) => (
                <TouchableOpacity key={e} onPress={() => setDraftEmoji(e)}
                  style={{
                    width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center",
                    borderWidth: 2, borderColor: draftEmoji === e ? colors.primary : colors.border,
                    backgroundColor: draftEmoji === e ? colors.primary + "18" : "transparent",
                  }}>
                  <Text style={{ fontSize: 20 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity onPress={() => setRenaming(false)} style={{ flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center", borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontWeight: "800", color: colors.foreground }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveRename} disabled={savingTitle || !draftTitle.trim()}
                style={{ flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center", backgroundColor: draftTitle.trim() ? colors.primary : colors.border }}>
                {savingTitle ? <ActivityIndicator color="#fff" /> : <Text style={{ fontWeight: "800", color: "#fff" }}>Сохранить</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* старт */}
        <TouchableOpacity
          onPress={() => router.push(`/flashcards/study/${deckId}`)}
          activeOpacity={0.85}
          style={{ backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 18 }}
        >
          <Feather name="play" size={18} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Начать учить</Text>
        </TouchableOpacity>

        {/* получатели колоды */}
        {showAssign && (
          <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 18 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
              <Feather name="users" size={16} color={colors.primary} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "800", color: colors.foreground, marginLeft: 8 }}>Кому отправлена</Text>
              <TouchableOpacity onPress={openAssign} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.primary }}>
                <Text style={{ fontSize: 12, fontWeight: "800", color: "#fff" }}>Управлять</Text>
              </TouchableOpacity>
            </View>
            {assigneesQ.isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : assignedStudents.length === 0 ? (
              <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
                Пока никому. Нажмите «Управлять», чтобы отправить колоду ученикам.
              </Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {assignedStudents.map((s) => (
                  <View key={s.id} style={{
                    flexDirection: "row", alignItems: "center", gap: 6,
                    backgroundColor: colors.primary + "14", borderWidth: 1, borderColor: colors.primary + "40",
                    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6,
                  }}>
                    <Text style={{ fontSize: 14 }}>{s.avatarEmoji ?? "🙂"}</Text>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>
                      {formatStudentName({ username: s.username ?? String(s.id), name: s.name, surname: s.surname }, "teacher")}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* инструменты своей колоды */}
        {isOwn && (
          <>
            <TouchableOpacity
              onPress={() => setPickerOpen(true)}
              activeOpacity={0.85}
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                borderRadius: 16, paddingVertical: 14, marginBottom: 12,
                borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primary + "14",
              }}
            >
              <Feather name="grid" size={17} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 14 }}>Добавить слова из каталога</Text>
            </TouchableOpacity>

            <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 18 }}>
              <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground, marginBottom: 10 }}>Добавить своё слово</Text>
              <TextInput value={newEn} onChangeText={(value) => { setNewEn(value); setAddNotice(null); }} placeholder="Английское слово или фраза" autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.mutedForeground}
                style={{ ...inputStyle, marginBottom: 8 }} />
              <TextInput value={newRu} onChangeText={(value) => { setNewRu(value); setAddNotice(null); }} placeholder="Перевод (необязательно)" placeholderTextColor={colors.mutedForeground}
                style={{ ...inputStyle, marginBottom: 8 }} />
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
          </>
        )}

        {/* список слов */}
        <Text style={{ fontSize: 13, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>Слова</Text>
        {wordsQ.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : words.length === 0 ? (
          <Text style={{ color: colors.mutedForeground }}>
            {isOwn ? "Пока нет слов. Добавьте их из каталога или введите своё слово." : "Пока нет слов."}
          </Text>
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
              {isOwn && (
                <TouchableOpacity onPress={() => removeWord(w.id, w.english)} disabled={removingWordId === w.id} style={{ padding: 6 }}>
                  {removingWordId === w.id
                    ? <ActivityIndicator color={colors.destructive} />
                    : <Feather name="x" size={18} color={colors.destructive} />}
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* ── Модалка: добавить слова из каталога ── */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={closePicker}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
          <View style={{
            backgroundColor: colors.background === "transparent" ? "#fff" : colors.background,
            borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%",
            paddingHorizontal: 20, paddingTop: 16,
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
              <Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: colors.foreground }}>Добавить слова</Text>
              <TouchableOpacity onPress={closePicker} style={{ padding: 6 }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: 12 }}>
              <WordPicker
                selectedIds={pickIds}
                onChangeSelected={setPickIds}
                manualWords={pickManual}
                onChangeManual={setPickManual}
                excludeDeckId={deckId}
                alreadyIn={alreadyIn}
              />
            </ScrollView>

            <View style={{ paddingVertical: 14, paddingBottom: insets.bottom + 14, borderTopWidth: 1, borderTopColor: colors.border }}>
              <TouchableOpacity
                onPress={savePick}
                disabled={savingPick || pickCount === 0}
                activeOpacity={0.85}
                style={{ borderRadius: 16, paddingVertical: 15, alignItems: "center", backgroundColor: pickCount > 0 ? colors.primary : colors.border }}
              >
                {savingPick
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
                      {pickCount > 0 ? `Добавить в колоду (${pickCount})` : "Выберите слова"}
                    </Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Модалка: получатели колоды ── */}
      <Modal visible={assignOpen} transparent animationType="slide" onRequestClose={() => setAssignOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
          <View style={{
            backgroundColor: colors.background === "transparent" ? "#fff" : colors.background,
            borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%",
            paddingHorizontal: 20, paddingTop: 16,
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
              <Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: colors.foreground }}>Кому отправить</Text>
              <TouchableOpacity onPress={() => setAssignOpen(false)} style={{ padding: 6 }}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 14 }}>
              Колода «{deck?.title ?? ""}»
            </Text>

            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 12 }}>
              <AssignStudentsSheet
                selectedIds={assignPick}
                onChangeSelected={setAssignPick}
                alreadyAssignedIds={assignedIds}
                hint="Снятая отметка отзовёт колоду у ученика — его прогресс по этим словам сохранится."
                onEmptyAction={{ label: "Добавить ученика", onPress: () => { setAssignOpen(false); router.push("/students" as any); } }}
              />
            </ScrollView>

            <View style={{ paddingVertical: 14, paddingBottom: insets.bottom + 14, borderTopWidth: 1, borderTopColor: colors.border }}>
              <TouchableOpacity
                onPress={saveAssign}
                disabled={savingAssign}
                activeOpacity={0.85}
                style={{ borderRadius: 16, paddingVertical: 15, alignItems: "center", backgroundColor: colors.primary }}
              >
                {savingAssign
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Сохранить получателей</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
