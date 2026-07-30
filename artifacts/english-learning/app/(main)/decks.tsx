// Вкладка «Колоды» у учителя: свои наборы слов и выдача их ученикам.
//
// Раньше конструктор колод существовал, но добраться до него можно было только
// так: «Ученики» → карточка ученика → «Отправить колоду» → «Создать колоду».
// Учителя эту функцию не находили, а назначить колоду получалось лишь по одному
// ученику за раз. Здесь всё в одном месте: список своих колод, создание,
// редактирование слов и выдача сразу нескольким ученикам одним запросом
// (PUT /api/flashcards/decks/:id/assignees).
import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
  Platform, RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import ConfirmModal from "@/components/ConfirmModal";
import { InfoHint } from "@/components/InfoHint";
import { DeckAssignModal } from "@/components/DeckAssignModal";
import { fc, type DeckWithAssign } from "@/hooks/useFlashcards";
import { plural } from "@/hooks/useStudentAnalysis";

const DECKS_HINT = {
  title: "Как работают колоды",
  summary:
    "Колода — это ваш набор слов. Вы собираете его один раз и выдаёте любому числу учеников; у них он появится на вкладке «Слова» в разделе «От учителя».",
  points: [
    "Слово достаточно ввести по-английски: перевод, транскрипция, часть речи и пример подставятся автоматически. Свой перевод можно указать вручную — он будет главным.",
    "Есть импорт списком: вставьте слова из файла или таблицы, чтобы не вводить по одному.",
    "Выдача обратима. Снимете галочку — колода исчезнет у ученика, но выученные слова в его статистике останутся.",
    "Слова повторяются по интервальному алгоритму: чем увереннее ученик отвечает, тем реже видит карточку. Поэтому лучше выдать 20 слов и следить за повторениями, чем 200 сразу.",
    "Прогресс по выданным колодам виден на вкладке «Анализ» в блоке «Слова» у каждого ученика.",
    "Готовые системные колоды по уровням здесь не показываются: их нельзя изменить, ученику они и так доступны.",
  ],
};

// ── Экран ───────────────────────────────────────────────────────────────────

export default function DecksScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [assignDeck, setAssignDeck] = useState<DeckWithAssign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeckWithAssign | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const decksQ = useQuery({
    queryKey: ["fc-decks"],
    queryFn: fc.getDecks,
    staleTime: 30_000,
  });

  // Только свои колоды: системные редактировать нельзя, а ученику они видны и так.
  const myDecks = useMemo(
    () => (decksQ.data ?? []).filter((d) => !d.isSystem && d.ownerId === user?.id),
    [decksQ.data, user?.id],
  );

  useFocusEffect(useCallback(() => {
    qc.invalidateQueries({ queryKey: ["fc-decks"] });
  }, [qc]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await qc.refetchQueries({ queryKey: ["fc-decks"] }); }
    finally { setRefreshing(false); }
  }, [qc]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await fc.deleteDeck(target.id);
      qc.invalidateQueries({ queryKey: ["fc-decks"] });
    } catch {
      /* список обновится при следующем открытии */
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 14,
    },
    title: { fontSize: 26, fontWeight: "800", color: colors.foreground },
    subtitle: { fontSize: 13.5, color: colors.mutedForeground, marginTop: 2 },
    scroll: { paddingHorizontal: 20, paddingBottom: insets.bottom + 90 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingHorizontal: 34, paddingBottom: 80 },
    card: {
      backgroundColor: colors.card, borderRadius: 18, padding: 16, marginBottom: 12,
      shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08, shadowRadius: 10, elevation: 3,
    },
    createBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
      backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 14, marginBottom: 16,
    },
    action: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={styles.title}>Колоды</Text>
          <InfoHint title={DECKS_HINT.title} summary={DECKS_HINT.summary} points={DECKS_HINT.points} size={20} />
        </View>
        <Text style={styles.subtitle}>Свои наборы слов и выдача ученикам</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <TouchableOpacity
          style={styles.createBtn}
          activeOpacity={0.85}
          onPress={() => router.push("/(main)/flashcards/new-deck" as any)}
        >
          <Feather name="plus" size={18} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Создать колоду</Text>
        </TouchableOpacity>

        {decksQ.isLoading ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 40 }} />
        ) : decksQ.isError ? (
          <View style={{ alignItems: "center", gap: 12, paddingVertical: 30 }}>
            <Text style={{ fontSize: 40 }}>⚠️</Text>
            <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: "center" }}>
              Не удалось загрузить колоды.
            </Text>
            <TouchableOpacity
              onPress={() => decksQ.refetch()}
              style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Повторить</Text>
            </TouchableOpacity>
          </View>
        ) : myDecks.length === 0 ? (
          <View style={{ alignItems: "center", gap: 10, paddingVertical: 34, paddingHorizontal: 14 }}>
            <Text style={{ fontSize: 48 }}>🗂️</Text>
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>Своих колод пока нет</Text>
            <Text style={{ fontSize: 13.5, lineHeight: 20, color: colors.mutedForeground, textAlign: "center" }}>
              Создайте колоду, добавьте слова — перевод и пример подставятся сами — и выдайте её ученикам.
              Колода появится у них на вкладке «Слова».
            </Text>
          </View>
        ) : (
          myDecks.map((deck) => {
            const assigned = deck.assignedCount ?? 0;
            const words = deck.wordCount ?? 0;
            return (
              <View key={deck.id} style={styles.card}>
                <TouchableOpacity
                  onPress={() => router.push(`/(main)/flashcards/deck/${deck.id}` as any)}
                  activeOpacity={0.7}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
                >
                  <View style={{
                    width: 46, height: 46, borderRadius: 14,
                    alignItems: "center", justifyContent: "center",
                    backgroundColor: colors.primary + "14",
                  }}>
                    <Text style={{ fontSize: 24 }}>{deck.emoji ?? "📘"}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15.5, fontWeight: "800", color: colors.foreground }} numberOfLines={1}>
                      {deck.title}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                      {words} {plural(words, "слово", "слова", "слов")}
                      {assigned > 0
                        ? ` · выдана ${assigned} ${plural(assigned, "ученику", "ученикам", "ученикам")}`
                        : " · пока никому не выдана"}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>

                {words === 0 ? (
                  <View style={{
                    flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12,
                    backgroundColor: "#fff7ed", borderRadius: 10, padding: 10,
                  }}>
                    <Feather name="alert-triangle" size={13} color="#ea580c" />
                    <Text style={{ flex: 1, fontSize: 11.5, color: "#9a3412", lineHeight: 17 }}>
                      В колоде нет слов — ученику её выдавать нечего. Откройте колоду и добавьте слова.
                    </Text>
                  </View>
                ) : null}

                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
                  <TouchableOpacity
                    onPress={() => setAssignDeck(deck)}
                    disabled={words === 0}
                    activeOpacity={0.8}
                    style={[styles.action, {
                      backgroundColor: words === 0 ? colors.muted : colors.primary + "14",
                    }]}
                  >
                    <Feather name="send" size={13} color={words === 0 ? colors.mutedForeground : colors.primary} />
                    <Text style={{
                      fontSize: 12.5, fontWeight: "700",
                      color: words === 0 ? colors.mutedForeground : colors.primary,
                    }}>
                      Выдать ученикам
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => router.push(`/(main)/flashcards/deck/${deck.id}` as any)}
                    activeOpacity={0.8}
                    style={[styles.action, { backgroundColor: colors.muted }]}
                  >
                    <Feather name="edit-2" size={13} color={colors.foreground} />
                    <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.foreground }}>Слова</Text>
                  </TouchableOpacity>

                  <View style={{ flex: 1 }} />

                  <TouchableOpacity
                    onPress={() => setDeleteTarget(deck)}
                    activeOpacity={0.8}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ padding: 8 }}
                  >
                    <Feather name="trash-2" size={15} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <DeckAssignModal
        visible={!!assignDeck}
        deck={assignDeck}
        onClose={(changed) => {
          setAssignDeck(null);
          if (changed) qc.invalidateQueries({ queryKey: ["fc-decks"] });
        }}
      />

      <ConfirmModal
        visible={!!deleteTarget}
        title="Удалить колоду?"
        message={
          deleteTarget
            ? `«${deleteTarget.title}» и все её слова будут удалены. Колода исчезнет у всех учеников, которым была выдана. Отменить это нельзя.`
            : ""
        }
        confirmText="Удалить"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </View>
  );
}
