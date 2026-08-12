// ─────────────────────────────────────────────────────────────────────────────
// Ученик: ситуации от учителя.
//
// Отдельный экран, а не раздел внутри разговора со Снежей: это ЗАДАНИЕ. У него
// есть условие завершения, отчёт учителю и оценка ошибок, а у свободного
// разговора ничего этого нет. Смешивать их в одной ленте значит превратить
// болтовню в проверку — и наоборот.
//
// Экран отвечает на три вопроса: что задали, сколько говорить и в каком это
// состоянии (не начато, идёт, пройдено).
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, Pill, SectionLabel } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";
import { finishText, scenarios, type StudentScenario } from "@/hooks/useScenarios";

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: "900", color: "#e11d48" }}>Экран не открылся</Text>
      <Text style={{ fontSize: 13, lineHeight: 20, color: "#5b4f8e" }}>{error?.message}</Text>
      <ChunkyButton label="Попробовать снова" icon="repeat" center onPress={() => { void retry(); }} />
    </ScrollView>
  );
}

function card(colors: any, extra?: ViewStyle): ViewStyle {
  return {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
    shadowColor: accents.violetDeep,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
    ...extra,
  };
}

/** Состояние задания одной меткой: по нему понятно, что делать дальше. */
function state(s: StudentScenario): { text: string; color: string } {
  if (s.attempt?.status === "active") return { text: "идёт", color: accents.amber };
  if (s.done > 0) return { text: "пройдено", color: accents.violetDeep };
  return { text: "новое", color: "#e11d48" };
}

export default function StudentScenarios() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const q = useQuery({
    queryKey: ["scenarios-mine"],
    queryFn: scenarios.mine,
    // Учитель может выдать задание, пока приложение открыто.
    refetchOnMount: "always",
    staleTime: 5_000,
  });

  if (q.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const list = q.data ?? [];

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: screenTop(insets),
        paddingBottom: screenBottom(insets),
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          onPress={() => router.replace("/flashcards" as any)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Назад в Учёбу"
          style={{ padding: 4 }}
        >
          <Glyph name="close" size={22} color={colors.mutedForeground} />
        </Pressable>
        <Text style={{ fontSize: 26, fontWeight: "900", letterSpacing: -0.7, color: colors.foreground }}>
          Ситуации
        </Text>
      </View>
      <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginTop: 5, marginBottom: 16 }}>
        Задания от учителя: разговор в заданной обстановке. Снежа играет роль, а ошибки увидит учитель.
      </Text>

      {list.length === 0 && (
        <View style={card(colors)}>
          <Text style={{ fontSize: 15, fontWeight: "900", color: colors.foreground }}>Заданий пока нет</Text>
          <Text style={{ fontSize: 13, lineHeight: 20, color: colors.mutedForeground, marginTop: 6 }}>
            Когда учитель выдаст ситуацию, она появится здесь. А поговорить просто так можно в разделе
            «Разговор со Снежей» — там без проверки и отчёта.
          </Text>
        </View>
      )}

      {list.map((s) => {
        const badge = state(s);
        return (
          <View key={s.id} style={card(colors, { marginBottom: 12 })}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <View style={{
                width: 42, height: 42, borderRadius: radii.sm,
                alignItems: "center", justifyContent: "center",
                backgroundColor: "rgba(236,72,153,0.14)",
              }}>
                <Glyph name="chat" size={21} color="#db2777" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 16, fontWeight: "900", color: colors.foreground }}>{s.title}</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                  {s.teacherName ? `от ${s.teacherName} · ` : ""}{finishText(s)}
                </Text>
              </View>
              <Pill text={badge.text} tone="soft" color={badge.color} />
            </View>

            <Text style={{ fontSize: 13.5, lineHeight: 20, color: colors.foreground, marginTop: 11 }}>
              {s.situation}
            </Text>
            <Text style={{ fontSize: 12.5, lineHeight: 19, color: colors.mutedForeground, marginTop: 6 }}>
              Снежа: {s.role}
            </Text>
            {!!s.goal && (
              <View style={{
                flexDirection: "row", alignItems: "flex-start", gap: 7, marginTop: 8,
                backgroundColor: "rgba(99,102,241,0.1)", borderRadius: radii.sm, padding: 10,
              }}>
                <Glyph name="target" size={16} color={colors.primary} />
                <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.foreground }}>
                  Цель: {s.goal}
                </Text>
              </View>
            )}

            <ChunkyButton
              label={s.attempt?.status === "active" ? "Продолжить разговор" : s.done > 0 ? "Пройти ещё раз" : "Начать разговор"}
              sublabel={s.attempt?.status === "active"
                ? `сказано ${s.attempt.turns} из ${s.turnsTarget}`
                : undefined}
              icon="sound"
              chevron
              onPress={() => router.push(`/flashcards/scenario/${s.id}` as any)}
              style={{ marginTop: 12 }}
            />

            {/* Свой разбор ученику показываем тем же экраном, что и учителю:
                данные одни, и прятать от ученика его собственные ошибки
                бессмысленно. */}
            {!!s.attempt && s.attempt.status !== "active" && (
              <Pressable
                onPress={() => router.push(`/scenario-review/${s.attempt!.id}` as any)}
                style={{ paddingVertical: 10, alignItems: "center" }}
                accessibilityRole="button"
              >
                <Text style={{ fontSize: 12.5, fontWeight: "800", color: colors.primary }}>
                  Посмотреть разбор прошлой попытки
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}

      {list.length > 0 && (
        <>
          <SectionLabel style={{ marginTop: 6 }}>Как это работает</SectionLabel>
          <View style={card(colors)}>
            <Text style={{ fontSize: 12.5, lineHeight: 19, color: colors.mutedForeground }}>
              Снежа отвечает как персонаж и не подсказывает, о чём спросить: добиться своего — твоя
              задача. Ошибку она назовёт по ходу, но разговор из-за неё не остановится. Когда задание
              закончится, учитель получит весь диалог с разбором ошибок.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}
