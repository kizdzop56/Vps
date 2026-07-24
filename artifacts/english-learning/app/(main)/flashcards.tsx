// Главный экран раздела «Слова»: уровень пользователя, библиотека готовых колод,
// собственные колоды, переходы к статистике / созданию колоды / тесту уровня.
import React from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { fc } from "@/hooks/useFlashcards";
import type { DeckWithProgress } from "@workspace/api-client-react";

export default function FlashcardsHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const decksQ = useQuery({ queryKey: ["fc-decks"], queryFn: fc.getDecks });
  const settingsQ = useQuery({ queryKey: ["fc-settings"], queryFn: fc.getSettings });

  useFocusEffect(
    React.useCallback(() => {
      decksQ.refetch();
      settingsQ.refetch();
    }, [])
  );

  const decks = decksQ.data ?? [];
  const systemDecks = decks.filter((d) => d.isSystem);
  const myDecks = decks.filter((d) => !d.isSystem);
  const level = settingsQ.data?.placementLevel;

  const totalDue = decks.reduce((s, d) => s + d.dueCount, 0);
  const totalNew = decks.reduce((s, d) => s + d.newCount, 0);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={decksQ.isRefetching} onRefresh={() => { decksQ.refetch(); settingsQ.refetch(); }} />}
    >
      {/* Заголовок + уровень */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <Text style={{ fontSize: 28, fontWeight: "900", color: colors.foreground }}>Слова</Text>
        <TouchableOpacity
          onPress={() => router.push("/flashcards/placement")}
          activeOpacity={0.8}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary + "18", borderColor: colors.primary + "55", borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Feather name="award" size={14} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 13 }}>{level ? `Уровень ${level}` : "Пройти тест"}</Text>
        </TouchableOpacity>
      </View>

      {/* Сводка на сегодня */}
      <View style={{ flexDirection: "row", gap: 12, marginBottom: 18 }}>
        <SummaryPill colors={colors} icon="refresh-cw" value={totalDue} label="к повторению" />
        <SummaryPill colors={colors} icon="plus-circle" value={totalNew} label="новых" />
      </View>

      {/* Действия */}
      <View style={{ flexDirection: "row", gap: 12, marginBottom: 22 }}>
        <ActionBtn colors={colors} icon="bar-chart-2" label="Статистика" onPress={() => router.push("/flashcards/stats")} />
        <ActionBtn colors={colors} icon="plus" label="Своя колода" onPress={() => router.push("/flashcards/new-deck")} />
      </View>

      {decksQ.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          {myDecks.length > 0 && (
            <>
              <SectionTitle colors={colors} title="Мои колоды" />
              {myDecks.map((d) => <DeckCard key={d.id} deck={d} colors={colors} onPress={() => router.push(`/flashcards/deck/${d.id}`)} />)}
              <View style={{ height: 10 }} />
            </>
          )}
          <SectionTitle colors={colors} title="Готовые колоды" />
          {systemDecks.map((d) => <DeckCard key={d.id} deck={d} colors={colors} onPress={() => router.push(`/flashcards/deck/${d.id}`)} />)}
        </>
      )}
    </ScrollView>
  );
}

function SummaryPill({ colors, icon, value, label }: any) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: "center" }}>
      <Feather name={icon} size={16} color={colors.primary} />
      <Text style={{ fontSize: 22, fontWeight: "900", color: colors.foreground, marginTop: 4 }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{label}</Text>
    </View>
  );
}

function ActionBtn({ colors, icon, label, onPress }: any) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingVertical: 13 }}>
      <Feather name={icon} size={16} color={colors.foreground} />
      <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function SectionTitle({ colors, title }: any) {
  return <Text style={{ fontSize: 13, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>{title}</Text>;
}

function DeckCard({ deck, colors, onPress }: { deck: DeckWithProgress; colors: any; onPress: () => void }) {
  const pct = deck.wordCount > 0 ? Math.round((deck.learnedCount / deck.wordCount) * 100) : 0;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 14 }}>
      <Text style={{ fontSize: 32 }}>{deck.emoji ?? "📘"}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>{deck.title}</Text>
        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
          {deck.wordCount} слов · выучено {deck.learnedCount}
        </Text>
        {/* прогресс-бар */}
        <View style={{ height: 6, backgroundColor: "rgba(160,140,220,0.2)", borderRadius: 4, marginTop: 8, overflow: "hidden" }}>
          <View style={{ width: `${pct}%`, height: "100%", backgroundColor: colors.success, borderRadius: 4 }} />
        </View>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        {deck.dueCount > 0 && <Badge colors={colors} color={colors.primary} text={`${deck.dueCount}`} />}
        {deck.newCount > 0 && <Badge colors={colors} color={colors.warning} text={`+${deck.newCount}`} />}
        <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );
}

function Badge({ colors, color, text }: any) {
  return (
    <View style={{ backgroundColor: color + "22", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color, fontWeight: "800", fontSize: 12 }}>{text}</Text>
    </View>
  );
}
