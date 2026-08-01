// Детальная страница колоды.
//
// Что здесь важно и почему так сделано:
//  1. Колода запрашивается отдельным эндпоинтом (fc.getDeck). Раньше страница
//     искала колоду в полном списке всех колод, а список читал на сервере всю
//     таблицу слов — пока он грузился, колода считалась ненайденной: учитель
//     видел вместо названия «Колода», а форма добавления слов не появлялась.
//  2. Право на правку берём с сервера (canEdit), а не выводим из !isSystem:
//     у ненайденной колоды прежняя проверка молча давала запрет.
//  3. Ошибки загрузки показываем с кнопкой «Повторить», а не бесконечным
//     спиннером.
//  4. Учителю вместо «Начать учить» — «Предпросмотр»: тренировка ведёт учёт
//     прогресса, учителю нужно просто посмотреть колоду глазами ученика.
import React, { useState, useEffect, useMemo } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator,
  Alert, Platform, Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { fc, apiFetch, speak, speakWord, speechAvailable, type ManualWordInput } from "@/hooks/useFlashcards";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import WordPicker from "@/components/WordPicker";

type StudentItem = { id: number; name: string; surname?: string | null; username: string };

// Подтверждение: на web — window.confirm, на нативе — Alert.
function confirmAction(title: string, message: string, onYes: () => void) {
  if (Platform.OS === "web") {
    if ((globalThis as any).confirm?.(message)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: "Отмена", style: "cancel" },
    { text: "Удалить", style: "destructive", onPress: onYes },
  ]);
}

export default function DeckDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckId = Number(id);
  // Битый номер в адресе раньше уходил в запрос как NaN и заканчивался
  // «вечной загрузкой» без объяснений.
  const validId = Number.isInteger(deckId) && deckId > 0;

  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const deckQ = useQuery({
    queryKey: ["fc-deck", deckId],
    queryFn: () => fc.getDeck(deckId),
    enabled: validId,
  });
  const wordsQ = useQuery({
    queryKey: ["fc-words", deckId],
    queryFn: () => fc.getDeckWords(deckId),
    enabled: validId,
  });

  const deck = deckQ.data;
  const words = wordsQ.data ?? [];
  const canEdit = !!deck?.canEdit;
  const { user } = useAuth();
  // Отправлять колоду ученикам может только учитель или админ. canEdit значит
  // лишь «колода моя»: ученик, создавший свою колоду, тоже владелец, но
  // рассылать её другим он не должен.
  const canAssign = canEdit && isTeacherOrAdmin(user?.role);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["fc-words", deckId] });
    qc.invalidateQueries({ queryKey: ["fc-deck", deckId] });
    qc.invalidateQueries({ queryKey: ["fc-decks"] });
    qc.invalidateQueries({ queryKey: ["fc-my-decks"] });
  };

  // ── добавление слов ───────────────────────────────────────────────────────
  const [addMode, setAddMode] = useState<"one" | "many">("one");
  const [newEn, setNewEn] = useState("");
  const [newRu, setNewRu] = useState("");
  const [bulk, setBulk] = useState("");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const addWord = async () => {
    const english = newEn.trim();
    if (!english) return;
    setAdding(true);
    setNotice(null);
    try {
      const added = await fc.addWord(deckId, {
        english,
        translationsRu: newRu.trim()
          ? newRu.split(/[,;/]/).map((s) => s.trim()).filter(Boolean)
          : undefined,
      });
      setNewEn("");
      setNewRu("");
      setNotice({
        type: "success",
        text: `Добавлено: ${added.english} — ${added.translationsRu.join(", ")}`
          + (newRu.trim() ? "" : " (перевод подобран автоматически)"),
      });
      refresh();
    } catch (e: any) {
      setNotice({ type: "error", text: e?.message ?? "Не удалось добавить слово." });
    } finally {
      setAdding(false);
    }
  };

  const addBulk = async () => {
    const content = bulk.trim();
    if (!content) return;
    setAdding(true);
    setNotice(null);
    try {
      const result = await fc.importWords(deckId, "lines", content);
      const skipped = result.skippedWords ?? [];
      setBulk("");
      setNotice({
        type: result.added > 0 ? "success" : "error",
        text: result.added > 0
          ? `Добавлено слов: ${result.added}.`
            + (skipped.length ? ` Пропущено: ${skipped.join(", ")} — уже есть в колоде или не удалось перевести.` : "")
          : "Ни одно слово не добавилось. Проверьте формат: одна строка — одно слово, перевод после тире.",
      });
      refresh();
    } catch (e: any) {
      setNotice({ type: "error", text: e?.message ?? "Не удалось добавить слова." });
    } finally {
      setAdding(false);
    }
  };

  const [removingWord, setRemovingWord] = useState<number | null>(null);
  const removeWord = (wordId: number, english: string) => {
    confirmAction("Удалить слово", `Удалить «${english}» из колоды?`, async () => {
      setRemovingWord(wordId);
      try {
        await fc.deleteWord(deckId, wordId);
        refresh();
      } catch (e: any) {
        setNotice({ type: "error", text: e?.message ?? "Не удалось удалить слово." });
      } finally {
        setRemovingWord(null);
      }
    });
  };

  // ── удаление колоды ───────────────────────────────────────────────────────
  const [deleting, setDeleting] = useState(false);
  // expo-router на web переиспользует экран deck/[id] для следующей колоды.
  // Сбрасываем индикатор, иначе спиннер «залипает» на новой колоде.
  useEffect(() => { setDeleting(false); }, [deckId]);

  const removeDeck = () => {
    confirmAction(
      "Удалить колоду",
      `Удалить колоду «${deck?.title ?? ""}»? Все слова и прогресс будут потеряны.`,
      async () => {
        setDeleting(true);
        try {
          await fc.deleteDeck(deckId);
          qc.invalidateQueries({ queryKey: ["fc-decks"] });
          qc.invalidateQueries({ queryKey: ["fc-my-decks"] });
          setDeleting(false);
          router.back();
        } catch (e: any) {
          setDeleting(false);
          Alert.alert("Ошибка", e?.message ?? "Не удалось удалить колоду.");
        }
      },
    );
  };

  const [sendOpen, setSendOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  // ── экран ошибки: раньше вместо него был спиннер без конца ───────────────
  if (!validId) {
    return (
      <ErrorScreen
        colors={colors}
        insets={insets}
        title="Колода не открывается"
        text="В адресе страницы нет номера колоды. Вернитесь назад и откройте колоду из списка."
        onBack={() => router.back()}
      />
    );
  }
  if (deckQ.isError) {
    return (
      <ErrorScreen
        colors={colors}
        insets={insets}
        title="Не удалось загрузить колоду"
        text={(deckQ.error as any)?.message ?? "Проверьте соединение и попробуйте ещё раз."}
        onBack={() => router.back()}
        onRetry={() => deckQ.refetch()}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, paddingBottom: 120 }}>
      {/* шапка */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={{ fontSize: 30 }}>{deck?.emoji ?? "📘"}</Text>
        <View style={{ flex: 1 }}>
          {deckQ.isLoading ? (
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.mutedForeground }}>Загрузка…</Text>
          ) : (
            <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>{deck?.title ?? "Колода"}</Text>
          )}
          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
            {words.length} слов{deck ? ` · выучено ${deck.learnedCount}` : ""}
            {canAssign && deck?.assignedCount ? ` · отправлена ${deck.assignedCount} ученикам` : ""}
          </Text>
        </View>
        {canEdit && (
          <TouchableOpacity onPress={removeDeck} disabled={deleting} style={{ padding: 6 }}>
            {deleting
              ? <ActivityIndicator color={colors.destructive} />
              : <Feather name="trash-2" size={22} color={colors.destructive} />}
          </TouchableOpacity>
        )}
      </View>

      {/* главное действие: учителю — предпросмотр, ученику — тренировка */}
      {canEdit ? (
        <>
          <TouchableOpacity
            onPress={() => router.push(`/flashcards/preview/${deckId}`)}
            activeOpacity={0.85}
            disabled={words.length === 0}
            style={{
              backgroundColor: words.length === 0 ? colors.border : colors.primary,
              borderRadius: 16, paddingVertical: 16, alignItems: "center",
              flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 10,
            }}
          >
            <Feather name="eye" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Предпросмотр колоды</Text>
          </TouchableOpacity>
          {canAssign && (
            <TouchableOpacity
              onPress={() => setSendOpen(true)}
              activeOpacity={0.85}
              style={{
                borderRadius: 16, paddingVertical: 15, alignItems: "center", flexDirection: "row",
                justifyContent: "center", gap: 8, marginBottom: 18,
                borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primary + "12",
              }}
            >
              <Feather name="send" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 15 }}>Отправить ученикам</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <TouchableOpacity
          onPress={() => router.push(`/flashcards/study/${deckId}`)}
          activeOpacity={0.85}
          disabled={words.length === 0}
          style={{
            backgroundColor: words.length === 0 ? colors.border : colors.primary,
            borderRadius: 16, paddingVertical: 16, alignItems: "center",
            flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 18,
          }}
        >
          <Feather name="play" size={18} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Начать учить</Text>
        </TouchableOpacity>
      )}

      {/* добавление слов — только в своей колоде */}
      {canEdit && (
        <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 18 }}>
          {/* Основной способ наполнить колоду — отметить готовые слова в каталоге
              (системные колоды по темам и уровням A1–C2). Раньше слова можно было
              только набирать руками, поэтому колода собиралась долго. */}
          <TouchableOpacity
            onPress={() => setCatalogOpen(true)}
            activeOpacity={0.85}
            style={{
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, marginBottom: 10,
            }}
          >
            <Feather name="grid" size={17} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Выбрать слова из каталога</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center", marginBottom: 12 }}>
            или наберите свои слова
          </Text>

          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            {(([["one", "Одно слово"], ["many", "Списком"]] as const)).map(([key, label]) => {
              const active = addMode === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => { setAddMode(key); setNotice(null); }}
                  style={{
                    flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primary + "14" : "transparent",
                  }}
                >
                  <Text style={{ fontWeight: "700", fontSize: 13, color: active ? colors.primary : colors.mutedForeground }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {addMode === "one" ? (
            <>
              <TextInput
                value={newEn}
                onChangeText={(v) => { setNewEn(v); setNotice(null); }}
                placeholder="Английское слово или фраза"
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={colors.mutedForeground}
                style={{
                  backgroundColor: colors.background === "transparent" ? "#fff" : colors.background,
                  borderWidth: 1, borderColor: colors.border, borderRadius: 12,
                  paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground, marginBottom: 8,
                }}
              />
              <TextInput
                value={newRu}
                onChangeText={(v) => { setNewRu(v); setNotice(null); }}
                placeholder="Перевод (можно не заполнять)"
                placeholderTextColor={colors.mutedForeground}
                style={{
                  backgroundColor: colors.background === "transparent" ? "#fff" : colors.background,
                  borderWidth: 1, borderColor: colors.border, borderRadius: 12,
                  paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground, marginBottom: 8,
                }}
              />
              <Hint colors={colors} text="Оставьте перевод пустым — его подберёт переводчик. Свой перевод всегда важнее: с ним слово добавится, даже если словарь такого слова не знает." />
              <ActionButton
                colors={colors}
                label="Добавить слово"
                busy={adding}
                disabled={!newEn.trim()}
                onPress={addWord}
              />
            </>
          ) : (
            <>
              <TextInput
                value={bulk}
                onChangeText={(v) => { setBulk(v); setNotice(null); }}
                placeholder={"hello — привет\nbook — книга\nrun — бежать"}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={colors.mutedForeground}
                style={{
                  backgroundColor: colors.background === "transparent" ? "#fff" : colors.background,
                  borderWidth: 1, borderColor: colors.border, borderRadius: 12,
                  paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground,
                  marginBottom: 8, minHeight: 120, textAlignVertical: "top",
                }}
              />
              <Hint colors={colors} text="Одна строка — одно слово. Перевод после тире, двоеточия или табуляции. Строку без перевода переведёт сервер." />
              <ActionButton
                colors={colors}
                label="Добавить все слова"
                busy={adding}
                disabled={!bulk.trim()}
                onPress={addBulk}
              />
            </>
          )}

          {notice && (
            <View style={{
              flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 10,
              backgroundColor: (notice.type === "success" ? colors.success : colors.destructive) + "14",
              borderWidth: 1, borderColor: (notice.type === "success" ? colors.success : colors.destructive) + "45",
              borderRadius: 12, padding: 10,
            }}>
              <Feather
                name={notice.type === "success" ? "check-circle" : "alert-circle"}
                size={16}
                color={notice.type === "success" ? colors.success : colors.destructive}
                style={{ marginTop: 1 }}
              />
              <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: notice.type === "success" ? colors.success : colors.destructive }}>
                {notice.text}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* список слов */}
      <Text style={{ fontSize: 13, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>
        Слова
      </Text>
      {wordsQ.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : wordsQ.isError ? (
        <InlineError
          colors={colors}
          text={(wordsQ.error as any)?.message ?? "Не удалось загрузить слова."}
          onRetry={() => wordsQ.refetch()}
        />
      ) : words.length === 0 ? (
        <Text style={{ color: colors.mutedForeground }}>
          {canEdit ? "Пока нет слов — добавьте первое слово выше." : "Пока нет слов."}
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
              <TouchableOpacity onPress={() => speakWord(w.id, w.english)} style={{ padding: 6 }}>
                <Feather name="volume-2" size={18} color={colors.primary} />
              </TouchableOpacity>
            )}
            {canEdit && (
              <TouchableOpacity onPress={() => removeWord(w.id, w.english)} disabled={removingWord === w.id} style={{ padding: 6 }}>
                {removingWord === w.id
                  ? <ActivityIndicator color={colors.destructive} />
                  : <Feather name="x" size={18} color={colors.destructive} />}
              </TouchableOpacity>
            )}
          </View>
        ))
      )}

      {canEdit && (
        <CatalogPickerModal
          visible={catalogOpen}
          onClose={() => setCatalogOpen(false)}
          deckId={deckId}
          alreadyIn={words.map((w) => w.english)}
          colors={colors}
          onSaved={(text, type) => { setNotice({ type, text }); refresh(); }}
        />
      )}

      {canAssign && (
        <SendDeckModal
          visible={sendOpen}
          onClose={() => { setSendOpen(false); qc.invalidateQueries({ queryKey: ["fc-deck", deckId] }); }}
          deckId={deckId}
          deckTitle={deck?.title ?? ""}
          wordCount={words.length}
          colors={colors}
        />
      )}
    </ScrollView>
  );
}

// ── мелкие переиспользуемые куски ──────────────────────────────────────────

function Hint({ colors, text }: { colors: any; text: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start", marginBottom: 10 }}>
      <Feather name="zap" size={14} color={colors.primary} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: colors.mutedForeground }}>{text}</Text>
    </View>
  );
}

function ActionButton({ colors, label, busy, disabled, onPress }: {
  colors: any; label: string; busy: boolean; disabled: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy || disabled}
      activeOpacity={0.85}
      style={{ backgroundColor: disabled ? colors.border : colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>{label}</Text>}
    </TouchableOpacity>
  );
}

function InlineError({ colors, text, onRetry }: { colors: any; text: string; onRetry: () => void }) {
  return (
    <View style={{ backgroundColor: colors.destructive + "12", borderWidth: 1, borderColor: colors.destructive + "40", borderRadius: 14, padding: 14, gap: 10 }}>
      <Text style={{ color: colors.destructive, fontSize: 14, fontWeight: "600" }}>{text}</Text>
      <TouchableOpacity onPress={onRetry} style={{ alignSelf: "flex-start", backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Повторить</Text>
      </TouchableOpacity>
    </View>
  );
}

function ErrorScreen({ colors, insets, title, text, onBack, onRetry }: {
  colors: any; insets: any; title: string; text: string; onBack: () => void; onRetry?: () => void;
}) {
  return (
    <View style={{ flex: 1, padding: 16, paddingTop: insets.top + 8, backgroundColor: colors.background }}>
      <TouchableOpacity onPress={onBack} style={{ padding: 6, alignSelf: "flex-start", marginBottom: 20 }}>
        <Feather name="arrow-left" size={24} color={colors.foreground} />
      </TouchableOpacity>
      <View style={{ alignItems: "center", gap: 12, marginTop: 40 }}>
        <Feather name="alert-circle" size={44} color={colors.destructive} />
        <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, textAlign: "center" }}>{title}</Text>
        <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 }}>{text}</Text>
        {onRetry && (
          <TouchableOpacity onPress={onRetry} style={{ marginTop: 8, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 }}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>Повторить</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── «Выбрать слова из каталога» ────────────────────────────────────────────
// Обёртка над WordPicker: сам компонент только ведёт выбор, записывает подборку
// этот экран одним запросом words/bulk. Слова каталога копируются в колоду
// учителя — прогресс ученика висит на конкретной карточке, поэтому у колоды
// должен быть свой независимый набор слов (см. api-server/src/lib/deckWords.ts).
function CatalogPickerModal({ visible, onClose, deckId, alreadyIn, colors, onSaved }: {
  visible: boolean;
  onClose: () => void;
  deckId: number;
  alreadyIn: string[];
  colors: any;
  onSaved: (text: string, type: "success" | "error") => void;
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [manualWords, setManualWords] = useState<ManualWordInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // При каждом открытии начинаем с чистой подборки.
  useEffect(() => {
    if (visible) { setSelectedIds([]); setManualWords([]); setError(null); }
  }, [visible]);

  const total = selectedIds.length + manualWords.length;

  const save = async () => {
    if (total === 0) return;
    setSaving(true);
    setError(null);
    try {
      const result = await fc.addWordsBulk(deckId, {
        wordIds: selectedIds.length ? selectedIds : undefined,
        words: manualWords.length ? manualWords : undefined,
      });
      // Частичный успех — не ошибка: сообщаем, что именно не прошло, но
      // добавленное остаётся в колоде.
      const parts: string[] = [];
      if (result.added > 0) parts.push(`Добавлено слов: ${result.added}.`);
      if (result.skipped > 0) parts.push(`Пропущено (уже в колоде): ${result.skipped}.`);
      if (result.failed.length > 0) {
        parts.push(`Не добавились: ${result.failed.map((f) => `${f.english} — ${f.reason}`).join("; ")}`);
      }
      if (result.added === 0) {
        setError(parts.join(" ") || "Ни одно слово не добавилось.");
        setSaving(false);
        return;
      }
      onSaved(parts.join(" "), "success");
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Не удалось добавить слова.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: colors.background === "transparent" ? "#fff" : colors.background,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, height: "92%",
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>Слова для колоды</Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                Отметьте готовые слова или добавьте свои
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* WordPicker не скроллится сам — оборачиваем в свой ScrollView. */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
            <WordPicker
              selectedIds={selectedIds}
              onChangeSelected={(ids) => { setSelectedIds(ids); setError(null); }}
              manualWords={manualWords}
              onChangeManual={(w) => { setManualWords(w); setError(null); }}
              excludeDeckId={deckId}
              alreadyIn={alreadyIn}
            />
          </ScrollView>

          {error && (
            <View style={{
              flexDirection: "row", gap: 8, alignItems: "flex-start", marginBottom: 10,
              backgroundColor: colors.destructive + "14", borderWidth: 1,
              borderColor: colors.destructive + "45", borderRadius: 12, padding: 10,
            }}>
              <Feather name="alert-circle" size={16} color={colors.destructive} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: colors.destructive }}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={save}
            disabled={saving || total === 0}
            activeOpacity={0.85}
            style={{
              borderRadius: 14, paddingVertical: 14, alignItems: "center",
              backgroundColor: total === 0 ? colors.border : colors.primary,
            }}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
                {total === 0 ? "Выберите слова" : `Добавить в колоду (${total})`}
              </Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── «Отправить ученикам» ───────────────────────────────────────────────────
// Несколько учеников отмечаются галочками и отправляются одним запросом.
// Кто уже получил колоду, приходит одним запросом assignees, а не опросом
// по каждому ученику.
function SendDeckModal({ visible, onClose, deckId, deckTitle, wordCount, colors }: {
  visible: boolean; onClose: () => void; deckId: number; deckTitle: string; wordCount: number; colors: any;
}) {
  const studentsQ = useQuery({
    queryKey: ["teacher-students-for-deck"],
    queryFn: () => apiFetch<StudentItem[]>("/api/connections/teacher/students"),
    enabled: visible,
  });
  const assigneesQ = useQuery({
    queryKey: ["fc-assignees", deckId],
    queryFn: () => fc.getAssignees(deckId),
    enabled: visible,
  });

  const students = studentsQ.data ?? [];
  const already = useMemo(() => new Set(assigneesQ.data ?? []), [assigneesQ.data]);

  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // При каждом открытии начинаем с чистого выбора.
  useEffect(() => {
    if (visible) { setPicked(new Set()); setResult(null); }
  }, [visible]);

  const toggle = (studentId: number) => {
    setResult(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
      return next;
    });
  };

  const send = async () => {
    if (picked.size === 0) return;
    setSending(true);
    setResult(null);
    try {
      await fc.assignDeckMany(deckId, [...picked]);
      await assigneesQ.refetch();
      setPicked(new Set());
      setResult({ type: "success", text: `Колода «${deckTitle}» отправлена. Она появилась у учеников в разделе «Слова».` });
    } catch (e: any) {
      setResult({ type: "error", text: e?.message ?? "Не удалось отправить колоду." });
    } finally {
      setSending(false);
    }
  };

  const revoke = async (studentId: number) => {
    setSending(true);
    setResult(null);
    try {
      await fc.unassignDeck(deckId, studentId);
      await assigneesQ.refetch();
    } catch (e: any) {
      setResult({ type: "error", text: e?.message ?? "Не удалось отозвать колоду." });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, maxHeight: "85%",
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: colors.foreground }}>Отправить ученикам</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 14 }}>
            Колода «{deckTitle}» · {wordCount} слов
          </Text>

          {wordCount === 0 && (
            <View style={{ backgroundColor: colors.destructive + "12", borderWidth: 1, borderColor: colors.destructive + "40", borderRadius: 12, padding: 12, marginBottom: 14 }}>
              <Text style={{ color: colors.destructive, fontSize: 13, lineHeight: 18 }}>
                В колоде пока нет слов. Отправить её можно, но учить ученику будет нечего — сначала добавьте слова.
              </Text>
            </View>
          )}

          {studentsQ.isLoading ? (
            <ActivityIndicator color={colors.primary} size="large" style={{ marginVertical: 40 }} />
          ) : studentsQ.isError ? (
            <InlineError colors={colors} text="Не удалось загрузить список учеников." onRetry={() => studentsQ.refetch()} />
          ) : students.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 26, gap: 10 }}>
              <Text style={{ fontSize: 40 }}>🧑‍🎓</Text>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>Учеников пока нет</Text>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", lineHeight: 19 }}>
                Добавьте учеников в разделе «Ученики», и колоду можно будет им отправить.
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 340 }}>
              {students.map((s) => {
                const has = already.has(s.id);
                const on = picked.has(s.id);
                const fullName = [s.name, s.surname].filter(Boolean).join(" ");
                return (
                  <View key={s.id} style={{
                    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card,
                    borderRadius: 14, padding: 14, borderWidth: 1,
                    borderColor: on ? colors.primary : colors.border, marginBottom: 10,
                  }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{fullName || s.username}</Text>
                      <Text style={{ fontSize: 12, color: has ? colors.success : colors.mutedForeground, marginTop: 2 }}>
                        {has ? "Колода уже отправлена" : `@${s.username}`}
                      </Text>
                    </View>
                    {has ? (
                      <TouchableOpacity onPress={() => revoke(s.id)} disabled={sending} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.destructive }}>
                        <Text style={{ color: colors.destructive, fontWeight: "700", fontSize: 12 }}>Отозвать</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={() => toggle(s.id)} style={{
                        width: 26, height: 26, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center",
                        borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent",
                      }}>
                        {on && <Feather name="check" size={16} color="#fff" />}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          {result && (
            <View style={{
              flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 10,
              backgroundColor: (result.type === "success" ? colors.success : colors.destructive) + "14",
              borderWidth: 1, borderColor: (result.type === "success" ? colors.success : colors.destructive) + "45",
              borderRadius: 12, padding: 10,
            }}>
              <Feather
                name={result.type === "success" ? "check-circle" : "alert-circle"}
                size={16}
                color={result.type === "success" ? colors.success : colors.destructive}
                style={{ marginTop: 1 }}
              />
              <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: result.type === "success" ? colors.success : colors.destructive }}>
                {result.text}
              </Text>
            </View>
          )}

          {students.length > 0 && (
            <TouchableOpacity
              onPress={send}
              disabled={sending || picked.size === 0}
              activeOpacity={0.85}
              style={{
                marginTop: 14, borderRadius: 14, paddingVertical: 14, alignItems: "center",
                backgroundColor: picked.size === 0 ? colors.border : colors.primary,
              }}
            >
              {sending
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
                  {picked.size === 0 ? "Выберите учеников" : `Отправить (${picked.size})`}
                </Text>}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}
