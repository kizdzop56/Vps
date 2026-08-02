// Главный экран раздела «Слова»: одна кнопка «Учить слова» (сквозная сессия по
// всем колодам), цель дня в словах, отработка сложных слов, библиотека готовых
// колод, собственные колоды и переходы к статистике / созданию колоды / тесту.
//
// Готовые колоды показываются двумя блоками:
//   • «Колоды по уровням» — колоды с заданным cefrLevel.
//     Показываются только уровень ученика и следующий (A1 → A1+A2, B1 → B1+B2, C2 → C2).
//     Уровень ученика раскрыт, следующий свёрнут.
//   • «Тематические колоды» — колоды без уровня: они охватывают сразу несколько
//     уровней (еда, животные, …), поэтому в уровневые группы не помещаются.
import React from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { fc, type DeckWithAssign } from "@/hooks/useFlashcards";

// Порядок уровней должен совпадать с CEFR_ORDER на бэкенде (routes/flashcards.ts).
const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default function FlashcardsHome() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const decksQ = useQuery({ queryKey: ["fc-decks"], queryFn: fc.getDecks });
  const settingsQ = useQuery({ queryKey: ["fc-settings"], queryFn: fc.getSettings });
  // Статистика нужна на главной для цели дня и числа сложных слов.
  const statsQ = useQuery({ queryKey: ["fc-stats"], queryFn: () => fc.getStats() });

  // Рефетч при фокусе: только когда данные реально устарели (isStale).
  // Раньше 3 запроса летели безусловно при каждом входе на вкладку, что
  // раздражало на медленной сети и загружало сервер без нужды.
  // Актуальность определяется staleTime (по умолчанию 5 минут, см. queryClient).
  const decksQRef = React.useRef(decksQ);
  const settingsQRef = React.useRef(settingsQ);
  const statsQRef = React.useRef(statsQ);
  decksQRef.current = decksQ;
  settingsQRef.current = settingsQ;
  statsQRef.current = statsQ;

  useFocusEffect(
    React.useCallback(() => {
      if (decksQRef.current.isStale) void decksQRef.current.refetch();
      if (settingsQRef.current.isStale) void settingsQRef.current.refetch();
      if (statsQRef.current.isStale) void statsQRef.current.refetch();
    }, [])
  );

  const decks = decksQ.data ?? [];
  // Колоды, назначенные учителем, — отдельная категория (см. DeckCard/бейдж
  // «От учителя» ниже). Раньше они молча попадали в «Мои колоды» вместе с
  // колодами, которые ученик создал сам: assigned-колода тоже !isSystem
  // (её владелец — учитель), и ученик не мог отличить одну от другой.
  const assignedDecks = decks.filter((d) => d.assigned);
  const systemDecks = decks.filter((d) => d.isSystem);
  const myDecks = decks.filter((d) => !d.isSystem && !d.assigned);
  const level = settingsQ.data?.placementLevel;

  // Уровневые колоды vs тематические (без cefrLevel) — см. комментарий к файлу.
  const levelDecks = systemDecks.filter((d) => d.cefrLevel);
  const themeDecks = systemDecks.filter((d) => !d.cefrLevel);

  // Пока тест уровня не пройден, считаем ученика начинающим и раскрываем A1.
  const myLevel = level ?? "A1";
  // Показываем только колоды уровня ученика — одна группа, без «следующего».
  // Тематические колоды (без cefrLevel) идут отдельным блоком ниже.
  const levelsWithDecks = [myLevel].filter((l) => levelDecks.some((d) => d.cefrLevel === l));

  // Раскрытие: null → уровень ученика раскрыт по умолчанию, остальные свёрнуты.
  const [openLevels, setOpenLevels] = React.useState<Record<string, boolean>>({});
  const isLevelOpen = (l: string) => openLevels[l] ?? l === myLevel;
  const toggleLevel = (l: string) =>
    setOpenLevels((s) => ({ ...s, [l]: !(s[l] ?? l === myLevel) }));

  const totalDue = decks.reduce((s, d) => s + d.dueCount, 0);
  const totalNew = decks.reduce((s, d) => s + d.newCount, 0);

  // Цель дня по словам и «сложные слова» приходят из статистики.
  const stats = statsQ.data;
  const wordsToday = stats?.wordsToday ?? 0;
  const dailyWordGoal = stats?.dailyWordGoal ?? settingsQ.data?.dailyWordGoal ?? 10;
  const goalPct = dailyWordGoal > 0 ? Math.min(100, Math.round((wordsToday / dailyWordGoal) * 100)) : 0;
  const goalReached = wordsToday >= dailyWordGoal;
  const hardCount = stats?.hardCount ?? 0;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={decksQ.isRefetching} onRefresh={() => { decksQ.refetch(); settingsQ.refetch(); statsQ.refetch(); }} />}
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

      {/* Главное действие */}
      <TouchableOpacity
        onPress={() => router.push("/flashcards/session")}
        activeOpacity={0.9}
        style={{ borderRadius: 20, overflow: "hidden", marginBottom: 12 }}
      >
        <LinearGradient
          colors={["#7C3AED", "#4F46E5"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: 18, flexDirection: "row", alignItems: "center", gap: 14 }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
            <Feather name="play" size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 19, fontWeight: "900", color: "#fff" }}>Учить слова</Text>
            {totalDue === 0 && totalNew === 0 ? (
              <Text style={{ fontSize: 13, color: "#ffffffdd", marginTop: 3 }}>
                Все слова повторены — загляни позже
              </Text>
            ) : null}
          </View>
          <Feather name="chevron-right" size={24} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      {/* Цель дня */}
      <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Feather name={goalReached ? "check-circle" : "target"} size={15} color={goalReached ? colors.success : colors.primary} />
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground }}>Цель дня</Text>
          </View>
          <Text style={{ fontSize: 13, fontWeight: "800", color: goalReached ? colors.success : colors.primary }}>
            {wordsToday} / {dailyWordGoal} слов
          </Text>
        </View>
        <View style={{ height: 8, borderRadius: 999, backgroundColor: "rgba(99,102,241,0.14)", marginTop: 10, overflow: "hidden" }}>
          <View style={{ width: `${goalPct}%`, height: "100%", borderRadius: 999, backgroundColor: goalReached ? colors.success : colors.primary }} />
        </View>
      </View>

      {/* Сложные слова */}
      {hardCount > 0 && (
        <TouchableOpacity
          onPress={() => router.push("/flashcards/hard")}
          activeOpacity={0.85}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.warning + "14", borderColor: colors.warning + "55", borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 }}
        >
          <Text style={{ fontSize: 24 }}>🔁</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>Сложные слова</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
              {hardCount} {pluralRu(hardCount, "слово", "слова", "слов")} с ошибками — потренируй отдельно
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      )}

      {/* Действия */}
      <View style={{ flexDirection: "row", gap: 12, marginBottom: 14 }}>
        <ActionBtn colors={colors} icon="bar-chart-2" label="Статистика" onPress={() => router.push("/flashcards/stats")} />
        <ActionBtn colors={colors} icon="plus" label="Своя колода" onPress={() => router.push("/flashcards/new-deck")} />
      </View>

      {/* Марафон слов */}
      <TouchableOpacity
        onPress={() => router.push("/flashcards/marathon")}
        activeOpacity={0.85}
        style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.primary, borderRadius: 18, padding: 16, marginBottom: 22 }}
      >
        <Text style={{ fontSize: 30 }}>🏃</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "900", color: "#fff" }}>Марафон слов</Text>
          <Text style={{ fontSize: 12, color: "#ffffffcc", marginTop: 2 }}>
            Все слова уровня {level ?? "A1"} · дойди до 75% и переходи выше
          </Text>
        </View>
        <Feather name="chevron-right" size={22} color="#fff" />
      </TouchableOpacity>

      {decksQ.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : decksQ.isError ? (
        <View style={{ marginTop: 24, backgroundColor: colors.destructive + "12", borderWidth: 1, borderColor: colors.destructive + "40", borderRadius: 16, padding: 16, gap: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: colors.destructive }}>Колоды не загрузились</Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.destructive }}>
            {(decksQ.error as any)?.message ?? "Проверьте соединение и попробуйте ещё раз."}
          </Text>
          <TouchableOpacity
            onPress={() => { decksQ.refetch(); settingsQ.refetch(); statsQ.refetch(); }}
            style={{ alignSelf: "flex-start", backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Назначенные учителем колоды — самый верх списка, ученик должен
              увидеть их сразу, не долистывая до колод по уровням. */}
          {assignedDecks.length > 0 && (
            <>
              <SectionTitle colors={colors} title="От учителя" />
              {assignedDecks.map((d) => <DeckCard key={d.id} deck={d} colors={colors} onPress={() => router.push(`/flashcards/deck/${d.id}`)} />)}
              <View style={{ height: 10 }} />
            </>
          )}
          {myDecks.length > 0 && (
            <>
              <SectionTitle colors={colors} title="Мои колоды" />
              {myDecks.map((d) => <DeckCard key={d.id} deck={d} colors={colors} onPress={() => router.push(`/flashcards/deck/${d.id}`)} />)}
              <View style={{ height: 10 }} />
            </>
          )}
          <SectionTitle colors={colors} title="Колоды по уровням" />
          {levelsWithDecks.map((l) => (
            <LevelGroup
              key={l}
              colors={colors}
              level={l}
              isMyLevel={l === myLevel}
              open={isLevelOpen(l)}
              onToggle={() => toggleLevel(l)}
              decks={levelDecks.filter((d) => d.cefrLevel === l)}
              onOpenDeck={(id) => router.push(`/flashcards/deck/${id}`)}
            />
          ))}

          {themeDecks.length > 0 && (
            <>
              <View style={{ height: 10 }} />
              <SectionTitle colors={colors} title="Тематические колоды" />
              {themeDecks.map((d) => <DeckCard key={d.id} deck={d} colors={colors} onPress={() => router.push(`/flashcards/deck/${d.id}`)} />)}
            </>
          )}
        </>
      )}
    </ScrollView>
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

function pluralRu(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function LevelGroup({
  colors, level, isMyLevel, open, onToggle, decks, onOpenDeck,
}: {
  colors: any;
  level: string;
  isMyLevel: boolean;
  open: boolean;
  onToggle: () => void;
  decks: DeckWithAssign[];
  onOpenDeck: (id: number) => void;
}) {
  const words = decks.reduce((s, d) => s + d.wordCount, 0);
  const learned = decks.reduce((s, d) => s + d.learnedCount, 0);
  const due = decks.reduce((s, d) => s + d.dueCount, 0);

  return (
    <View style={{ marginBottom: 12 }}>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.85}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: isMyLevel ? colors.primary + "14" : colors.card,
          borderColor: isMyLevel ? colors.primary + "55" : colors.border,
          borderWidth: 1,
          borderRadius: 16,
          padding: 14,
        }}
      >
        <View
          style={{
            backgroundColor: isMyLevel ? colors.primary : colors.primary + "22",
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 5,
            minWidth: 46,
            alignItems: "center",
          }}
        >
          <Text style={{ color: isMyLevel ? "#fff" : colors.primary, fontWeight: "900", fontSize: 14 }}>{level}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>
            {decks.length} {pluralRu(decks.length, "колода", "колоды", "колод")}
            {isMyLevel ? " · ваш уровень" : ""}
          </Text>
          <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
            {words} слов и фраз · выучено {learned}
          </Text>
        </View>
        {due > 0 && <Badge colors={colors} color={colors.primary} text={`${due}`} />}
        <Feather name={open ? "chevron-down" : "chevron-right"} size={20} color={colors.mutedForeground} />
      </TouchableOpacity>

      {open && (
        <View style={{ marginTop: 10 }}>
          {decks.map((d) => (
            <DeckCard key={d.id} deck={d} colors={colors} onPress={() => onOpenDeck(d.id)} />
          ))}
        </View>
      )}
    </View>
  );
}

function DeckCard({ deck, colors, onPress }: { deck: DeckWithAssign; colors: any; onPress: () => void }) {
  const introduced = Math.max(0, deck.wordCount - deck.newCount);
  const learnedPct = deck.wordCount > 0 ? Math.round((deck.learnedCount / deck.wordCount) * 100) : 0;
  const startedPct = deck.wordCount > 0 ? Math.round((introduced / deck.wordCount) * 100) : 0;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 14 }}>
      <Text style={{ fontSize: 32 }}>{deck.emoji ?? "📘"}</Text>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>{deck.title}</Text>
          {/* Колода, назначенная учителем, должна визуально отличаться от
              системных и собственных колод ученика. */}
          {deck.assigned && (
            <View style={{ backgroundColor: colors.primary + "18", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary }}>
                {deck.ownerName ? `От ${deck.ownerName}` : "От учителя"}
              </Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
          {deck.wordCount} слов · начато {introduced} · выучено {deck.learnedCount}
        </Text>
        <View style={{ height: 6, backgroundColor: "rgba(160,140,220,0.2)", borderRadius: 4, marginTop: 8, overflow: "hidden" }}>
          <LinearGradient
            colors={["#C4B5FD", "#A78BFA"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${startedPct}%`, borderRadius: 4 }}
          />
          <LinearGradient
            colors={["#A855F7", "#6D28D9"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${learnedPct}%`, borderRadius: 4 }}
          />
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
