// ─────────────────────────────────────────────────────────────────────────────
// Разбор диалога: весь разговор с ошибками.
//
// ОДИН экран на учителя и ученика намеренно. Данные одни и те же (сервер
// пускает автора ситуации и владельца попытки), а прятать от ученика его
// собственные ошибки бессмысленно: он их и так видел по ходу разговора.
//
// Порядок: сначала итог цифрами и разбор от Снежи, потом сам диалог. Учителю
// нужен ответ на «стоит ли вообще читать», и он должен быть первым.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, type ViewStyle } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, Pill, SectionLabel } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import { screenTop } from "@/constants/layout";
import { finishText, scenarios } from "@/hooks/useScenarios";

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: "900", color: "#e11d48" }}>Разбор не открылся</Text>
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
    padding: 14,
    shadowColor: accents.violetDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 2,
    ...extra,
  };
}

export default function ScenarioReview() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const attemptId = Number(params.id);

  const q = useQuery({
    queryKey: ["scenario-report", attemptId],
    queryFn: () => scenarios.report(attemptId),
    enabled: Number.isInteger(attemptId),
  });

  if (q.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (q.error || !q.data) {
    return (
      <View style={{ flex: 1, padding: 24, paddingTop: screenTop(insets, 40), gap: 14 }}>
        <Text style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>Разбор недоступен</Text>
        <Text style={{ fontSize: 13.5, lineHeight: 21, color: colors.mutedForeground }}>
          {q.error instanceof Error ? q.error.message : "Диалог не найден"}
        </Text>
        <ChunkyButton label="Назад" icon="arrowRight" center onPress={() => router.back()} />
      </View>
    );
  }

  const { scenario, student, attempt, messages } = q.data;
  const mistakes = messages.filter((m) => m.role === "student" && m.correct === false);
  const said = messages.filter((m) => m.role === "student").length;
  const accuracy = said > 0 ? Math.round(((said - mistakes.length) / said) * 100) : 0;

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: screenTop(insets),
        paddingBottom: Math.max(insets.bottom, 16) + 40,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4 }} accessibilityLabel="Назад">
          <Glyph name="close" size={22} color={colors.mutedForeground} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 20, fontWeight: "900", color: colors.foreground }}>
            {scenario.title}
          </Text>
          <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
            {student?.name ?? "Ученик"} · {finishText(scenario)}
          </Text>
        </View>
      </View>

      {/* ── Итог ──────────────────────────────────────────────────────── */}
      <View style={card(colors, { marginTop: 14 })}>
        <View style={{ flexDirection: "row", gap: 7, flexWrap: "wrap" }}>
          <Pill
            text={attempt.status === "done" ? "пройдено" : attempt.status === "stopped" ? "вышел на середине" : "идёт"}
            tone="soft"
            color={attempt.status === "done" ? accents.violetDeep : accents.amber}
          />
          {attempt.goalReached && <Pill text="цель достигнута" tone="soft" color={accents.gold} />}
          <Pill text={`${said} реплик`} tone="soft" color={colors.primary} />
          <Pill
            text={`ошибок ${mistakes.length}`}
            tone="soft"
            color={mistakes.length === 0 ? accents.violetDeep : "#e11d48"}
          />
          <Pill text={`точность ${accuracy}%`} tone="soft" color={colors.primary} />
        </View>

        <Text style={{ fontSize: 12.5, lineHeight: 19, color: colors.mutedForeground, marginTop: 10 }}>
          Ситуация: {scenario.situation}
        </Text>
        <Text style={{ fontSize: 12.5, lineHeight: 19, color: colors.mutedForeground, marginTop: 4 }}>
          Роль Снежи: {scenario.role}
          {scenario.goal ? ` · Цель: ${scenario.goal}` : ""}
        </Text>
      </View>

      {/* Разбор от Снежи: пишется один раз при закрытии попытки. */}
      {!!attempt.summary && (
        <>
          <SectionLabel style={{ marginTop: 16 }}>Что говорит разбор</SectionLabel>
          <View style={card(colors, { backgroundColor: "rgba(99,102,241,0.08)" })}>
            <Text style={{ fontSize: 13.5, lineHeight: 21, color: colors.foreground }}>{attempt.summary}</Text>
          </View>
        </>
      )}

      {/* ── Ошибки списком: то, ради чего этот экран и нужен ─────────── */}
      {mistakes.length > 0 && (
        <>
          <SectionLabel style={{ marginTop: 16 }}>Ошибки · {mistakes.length}</SectionLabel>
          <View style={card(colors, { gap: 11 })}>
            {mistakes.map((m) => (
              <View key={`bad-${m.id}`}>
                <Text style={{ fontSize: 13.5, lineHeight: 20, color: "#e11d48", fontWeight: "800" }}>
                  {m.text}
                </Text>
                {!!m.fixed && (
                  <Text style={{ fontSize: 13.5, lineHeight: 20, color: colors.foreground, marginTop: 2 }}>
                    → {m.fixed}
                  </Text>
                )}
                {!!m.issue && (
                  <Text style={{ fontSize: 12, lineHeight: 18, color: colors.mutedForeground, marginTop: 2 }}>
                    {m.issue}
                  </Text>
                )}
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── Весь диалог ───────────────────────────────────────────────── */}
      <SectionLabel style={{ marginTop: 16 }}>Диалог целиком</SectionLabel>
      <View style={{ gap: 9 }}>
        {messages.map((m) => (
          <View key={`${m.role}-${m.id}`} style={{ alignItems: m.role === "student" ? "flex-end" : "flex-start" }}>
            <View style={{
              maxWidth: "90%",
              backgroundColor: m.role === "student"
                ? (m.correct === false ? "rgba(225,29,72,0.1)" : "rgba(139,92,246,0.12)")
                : colors.card,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: m.role === "student"
                ? (m.correct === false ? "rgba(225,29,72,0.35)" : "rgba(139,92,246,0.3)")
                : colors.border,
              paddingHorizontal: 12, paddingVertical: 9,
            }}>
              <Text style={{ fontSize: 10, fontWeight: "900", letterSpacing: 0.8, color: colors.mutedForeground }}>
                {m.role === "student" ? (student?.name ?? "УЧЕНИК").toUpperCase() : "СНЕЖА"}
              </Text>
              <Text style={{ fontSize: 14, lineHeight: 20, color: colors.foreground, marginTop: 3 }}>
                {m.text}
              </Text>
              {m.role === "student" && m.correct === false && (
                <View style={{ marginTop: 6, borderTopWidth: 1, borderTopColor: "rgba(225,29,72,0.25)", paddingTop: 6 }}>
                  {!!m.fixed && (
                    <Text style={{ fontSize: 13, lineHeight: 19, color: colors.foreground, fontWeight: "700" }}>
                      Правильно: {m.fixed}
                    </Text>
                  )}
                  {!!m.issue && (
                    <Text style={{ fontSize: 12, lineHeight: 18, color: "#e11d48", marginTop: 2 }}>{m.issue}</Text>
                  )}
                </View>
              )}
            </View>
          </View>
        ))}
      </View>

      <ChunkyButton
        label="Готово"
        icon="check"
        center
        tone="dark"
        onPress={() => router.back()}
        style={{ marginTop: 18 }}
      />
    </ScrollView>
  );
}
