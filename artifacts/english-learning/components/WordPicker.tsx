// ─────────────────────────────────────────────────────────────────────────────
// Конструктор подборки слов: учитель ищет слова в готовом каталоге (системные
// колоды по темам и уровням CEFR), отмечает нужные, при необходимости дописывает
// свои. Компонент ничего не сохраняет — он только ведёт выбор, а записывают его
// экраны: мастер создания колоды и страница колоды.
//
// Сам по себе компонент не скроллится: и мастер, и модалка на странице колоды
// оборачивают его в свой ScrollView, поэтому вложенных скроллов не возникает.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { fc, speak, speechAvailable, type CatalogWord, type ManualWordInput } from "@/hooks/useFlashcards";

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const PAGE_SIZE = 40;

/** Ключ сравнения слов — как на сервере (lib/deckWords.ts). */
function wordKey(english: string): string {
  return english.trim().toLowerCase().replace(/\s+/g, " ");
}

export type WordPickerProps = {
  /** Отмеченные слова каталога. */
  selectedIds: number[];
  onChangeSelected: (ids: number[]) => void;
  /** Слова, которые учитель ввёл руками (перевод необязателен). */
  manualWords: ManualWordInput[];
  onChangeManual: (words: ManualWordInput[]) => void;
  /** Колода, которую собираем: её слова в каталоге не показываем. */
  excludeDeckId?: number;
  /** Слова, уже лежащие в колоде — помечаем и не даём выбрать повторно. */
  alreadyIn?: string[];
};

export default function WordPicker({
  selectedIds, onChangeSelected, manualWords, onChangeManual, excludeDeckId, alreadyIn = [],
}: WordPickerProps) {
  const colors = useColors();

  const [tab, setTab] = useState<"catalog" | "manual">("catalog");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [theme, setTheme] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [accumulated, setAccumulated] = useState<CatalogWord[]>([]);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const alreadyKeys = useMemo(() => new Set(alreadyIn.map(wordKey)), [alreadyIn]);
  const manualKeys = useMemo(() => new Set(manualWords.map((w) => wordKey(w.english))), [manualWords]);

  // Поиск с задержкой: не дёргаем сервер на каждую букву.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Смена фильтров начинает выдачу заново.
  useEffect(() => { setPage(0); setAccumulated([]); }, [debounced, theme, level]);

  // Темы для чипсов берём из готовых колод — отдельного эндпоинта не нужно.
  const decksQ = useQuery({ queryKey: ["fc-decks"], queryFn: fc.getDecks });
  const themes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of decksQ.data ?? []) {
      if (d.isSystem && d.theme && !seen.has(d.theme)) seen.set(d.theme, d.title);
    }
    return [...seen.entries()].map(([key, title]) => ({ key, title }));
  }, [decksQ.data]);

  const catalogQ = useQuery({
    queryKey: ["fc-catalog", debounced, theme, level, page, excludeDeckId ?? 0],
    queryFn: () => fc.searchCatalog({
      q: debounced || undefined,
      theme: theme ?? undefined,
      level: level ?? undefined,
      excludeDeckId,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
  });

  // Накопительная выдача: «Показать ещё» дописывает следующую страницу.
  useEffect(() => {
    const words = catalogQ.data?.words;
    if (!words) return;
    setAccumulated((prev) => {
      if (page === 0) return words;
      const have = new Set(prev.map((w) => w.id));
      return [...prev, ...words.filter((w) => !have.has(w.id))];
    });
  }, [catalogQ.data, page]);

  const total = catalogQ.data?.total ?? 0;
  const hasMore = accumulated.length < total;

  const toggle = (id: number) => {
    onChangeSelected(selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  // ── Ручной ввод ───────────────────────────────────────────────────────────
  const [manualEn, setManualEn] = useState("");
  const [manualRu, setManualRu] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);

  const addManual = () => {
    const english = manualEn.trim();
    if (!english) return;
    const key = wordKey(english);
    if (alreadyKeys.has(key)) { setManualError("Это слово уже есть в колоде."); return; }
    if (manualKeys.has(key)) { setManualError("Это слово уже в подборке."); return; }
    const translationsRu = manualRu.trim()
      ? manualRu.split(/[,;/]/).map((s) => s.trim()).filter(Boolean)
      : undefined;
    onChangeManual([...manualWords, { english, translationsRu }]);
    setManualEn("");
    setManualRu("");
    setManualError(null);
  };

  const removeManual = (english: string) => {
    onChangeManual(manualWords.filter((w) => w.english !== english));
  };

  const totalPicked = selectedIds.length + manualWords.length;

  const inputStyle = {
    backgroundColor: colors.background === "transparent" ? "#fff" : colors.background,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground,
  } as const;

  return (
    <View>
      {/* переключатель источника слов */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
        {([["catalog", "Каталог", "grid"], ["manual", "Своё слово", "edit-3"]] as const).map(([key, label, icon]) => {
          const on = tab === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setTab(key)}
              activeOpacity={0.85}
              style={{
                flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                paddingVertical: 11, borderRadius: 12, borderWidth: 2,
                borderColor: on ? colors.primary : colors.border,
                backgroundColor: on ? colors.primary + "18" : colors.card,
              }}
            >
              <Feather name={icon} size={15} color={on ? colors.primary : colors.mutedForeground} />
              <Text style={{ fontWeight: "800", fontSize: 13, color: on ? colors.primary : colors.mutedForeground }}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* счётчик выбранного */}
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14,
        backgroundColor: totalPicked > 0 ? colors.primary + "14" : colors.card,
        borderWidth: 1, borderColor: totalPicked > 0 ? colors.primary + "45" : colors.border,
        borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
      }}>
        <Feather name="check-square" size={16} color={totalPicked > 0 ? colors.primary : colors.mutedForeground} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: totalPicked > 0 ? colors.primary : colors.mutedForeground }}>
          {totalPicked > 0 ? `Выбрано слов: ${totalPicked}` : "Слова пока не выбраны"}
        </Text>
        {totalPicked > 0 && (
          <TouchableOpacity onPress={() => { onChangeSelected([]); onChangeManual([]); }} style={{ padding: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedForeground }}>Очистить</Text>
          </TouchableOpacity>
        )}
      </View>

      {tab === "catalog" ? (
        <>
          {/* поиск */}
          <View style={{ position: "relative", marginBottom: 12 }}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Поиск по слову или переводу"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ ...inputStyle, paddingLeft: 38, paddingRight: search ? 38 : 12 }}
            />
            <Feather name="search" size={16} color={colors.mutedForeground} style={{ position: "absolute", left: 13, top: 13 }} />
            {!!search && (
              <TouchableOpacity onPress={() => setSearch("")} style={{ position: "absolute", right: 10, top: 10, padding: 3 }}>
                <Feather name="x" size={15} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>

          {/* уровни CEFR */}
          <Text style={{ fontSize: 11, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
            Уровень
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {CEFR_LEVELS.map((lv) => {
              const on = level === lv;
              return (
                <TouchableOpacity
                  key={lv}
                  onPress={() => setLevel(on ? null : lv)}
                  style={{
                    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5,
                    borderColor: on ? colors.primary : colors.border,
                    backgroundColor: on ? colors.primary : colors.card,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "800", color: on ? "#fff" : colors.mutedForeground }}>{lv}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* темы */}
          {themes.length > 0 && (
            <>
              <Text style={{ fontSize: 11, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
                Тема
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {themes.map((t) => {
                  const on = theme === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      onPress={() => setTheme(on ? null : t.key)}
                      style={{
                        paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5,
                        borderColor: on ? colors.primary : colors.border,
                        backgroundColor: on ? colors.primary : colors.card,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "700", color: on ? "#fff" : colors.mutedForeground }}>{t.title}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* результаты */}
          {catalogQ.isLoading && accumulated.length === 0 ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 28 }} />
          ) : catalogQ.isError ? (
            <View style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
              <Feather name="alert-circle" size={22} color={colors.destructive} />
              <Text style={{ fontSize: 13, color: colors.destructive, textAlign: "center" }}>
                Не удалось загрузить каталог слов.
              </Text>
              <TouchableOpacity onPress={() => catalogQ.refetch()} style={{ marginTop: 4, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.primary }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Повторить</Text>
              </TouchableOpacity>
            </View>
          ) : accumulated.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 28, gap: 8 }}>
              <Text style={{ fontSize: 32 }}>🔍</Text>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Ничего не нашлось</Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center" }}>
                Измените запрос или снимите фильтры. Своё слово можно добавить на вкладке «Своё слово».
              </Text>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 8 }}>
                Показано {accumulated.length} из {total}
              </Text>
              {accumulated.map((w) => {
                const inDeck = alreadyKeys.has(wordKey(w.english));
                const on = selected.has(w.id);
                return (
                  <TouchableOpacity
                    key={w.id}
                    onPress={() => !inDeck && toggle(w.id)}
                    disabled={inDeck}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8,
                      backgroundColor: colors.card, borderRadius: 14, padding: 12,
                      borderWidth: on ? 2 : 1,
                      borderColor: on ? colors.primary : colors.border,
                      opacity: inDeck ? 0.5 : 1,
                    }}
                  >
                    <View style={{
                      width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center",
                      borderColor: on ? colors.primary : colors.border,
                      backgroundColor: on ? colors.primary : "transparent",
                    }}>
                      {on && <Feather name="check" size={14} color="#fff" />}
                      {inDeck && !on && <Feather name="check" size={14} color={colors.mutedForeground} />}
                    </View>

                    {!!w.emoji && <Text style={{ fontSize: 22 }}>{w.emoji}</Text>}

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{w.english}</Text>
                        {!!w.cefrLevel && (
                          <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, backgroundColor: colors.muted }}>
                            <Text style={{ fontSize: 10, fontWeight: "800", color: colors.mutedForeground }}>{w.cefrLevel}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 1 }} numberOfLines={2}>
                        {w.translationsRu.join(", ")}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 2, opacity: 0.8 }}>
                        {inDeck ? "уже в колоде" : w.deckTitle ?? ""}
                      </Text>
                    </View>

                    {speechAvailable() && (
                      <TouchableOpacity onPress={() => speak(w.english)} style={{ padding: 6 }}>
                        <Feather name="volume-2" size={17} color={colors.primary} />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })}

              {hasMore && (
                <TouchableOpacity
                  onPress={() => setPage((p) => p + 1)}
                  disabled={catalogQ.isFetching}
                  style={{
                    alignItems: "center", paddingVertical: 12, borderRadius: 12, marginTop: 2,
                    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
                  }}
                >
                  {catalogQ.isFetching
                    ? <ActivityIndicator color={colors.primary} />
                    : <Text style={{ fontSize: 13, fontWeight: "800", color: colors.primary }}>Показать ещё</Text>}
                </TouchableOpacity>
              )}
            </>
          )}
        </>
      ) : (
        <>
          {/* ручной ввод */}
          <TextInput
            value={manualEn}
            onChangeText={(v) => { setManualEn(v); setManualError(null); }}
            placeholder="Английское слово или фраза"
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={colors.mutedForeground}
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <TextInput
            value={manualRu}
            onChangeText={(v) => { setManualRu(v); setManualError(null); }}
            placeholder="Перевод (необязательно)"
            placeholderTextColor={colors.mutedForeground}
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start", marginBottom: 10 }}>
            <Feather name="zap" size={14} color={colors.primary} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: colors.mutedForeground }}>
              Оставьте перевод пустым — его найдёт Google Translate. Написание проверяется при сохранении колоды.
            </Text>
          </View>
          {manualError && (
            <Text style={{ fontSize: 12, color: colors.destructive, marginBottom: 10 }}>{manualError}</Text>
          )}
          <TouchableOpacity
            onPress={addManual}
            disabled={!manualEn.trim()}
            activeOpacity={0.85}
            style={{
              backgroundColor: manualEn.trim() ? colors.primary : colors.border,
              borderRadius: 12, paddingVertical: 12, alignItems: "center", marginBottom: 16,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>Добавить в подборку</Text>
          </TouchableOpacity>

          {manualWords.length > 0 && (
            <>
              <Text style={{ fontSize: 11, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
                Свои слова ({manualWords.length})
              </Text>
              {manualWords.map((w) => (
                <View
                  key={w.english}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8,
                    backgroundColor: colors.card, borderRadius: 14, padding: 12,
                    borderWidth: 1, borderColor: colors.border,
                  }}
                >
                  <Feather name="edit-3" size={16} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{w.english}</Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 1 }}>
                      {w.translationsRu?.length ? w.translationsRu.join(", ") : "перевод подберётся автоматически"}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeManual(w.english)} style={{ padding: 6 }}>
                    <Feather name="x" size={17} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}
        </>
      )}
    </View>
  );
}
