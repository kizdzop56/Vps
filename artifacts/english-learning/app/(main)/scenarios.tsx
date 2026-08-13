// ─────────────────────────────────────────────────────────────────────────────
// Учитель: ситуации для разговора.
//
// Экран делает три вещи и в этом порядке:
//   1. показывает СВЕЖИЕ РАЗБОРЫ — то, ради чего учитель сюда заходит: кто
//      прошёл задание и где ошибался;
//   2. держит список своих ситуаций с выдачей;
//   3. позволяет создать новую.
//
// Сама форма живёт в components/ScenarioForm.tsx, потому что создавать ситуацию
// можно и из «Создать задание»: для учителя диалог — такая же работа для
// ученика, как тест или колода, и искать его в другой вкладке странно. Здесь
// форма остаётся под рукой, но кода не дублирует.
//
// ── Про «Выдать всем» ───────────────────────────────────────────────────────
// Главная кнопка выдачи — «всем моим ученикам»: на телефоне отмечать галочки по
// одному мучительно, а типичный случай именно такой. Список с выбором есть, но
// он второй, а не первый.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, Pressable, ScrollView, ActivityIndicator, Alert,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, Pill, SectionLabel } from "@/components/ui/GameKit";
import { ScenarioForm } from "@/components/ScenarioForm";
import { accents, radii } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";
import {
  finishText, scenarios, strictnessText, type TeacherScenario,
} from "@/hooks/useScenarios";

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
    padding: 14,
    shadowColor: accents.violetDeep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 2,
    ...extra,
  };
}

export default function TeacherScenarios() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const listQ = useQuery({ queryKey: ["scenarios"], queryFn: scenarios.list, staleTime: 10_000 });
  const attemptsQ = useQuery({ queryKey: ["scenario-attempts"], queryFn: scenarios.attempts, staleTime: 10_000 });

  /** Форма создания раскрыта. */
  const [creating, setCreating] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  /** Какая ситуация раскрыта: показываем выдачу и попытки. */
  const [open, setOpen] = React.useState<number | null>(null);

  const complain = (err: unknown) => {
    setProblem(err instanceof Error ? err.message : "Не получилось");
    setTimeout(() => setProblem(null), 3200);
  };
  const reload = () => {
    void qc.invalidateQueries({ queryKey: ["scenarios"] });
    void qc.invalidateQueries({ queryKey: ["scenario-attempts"] });
  };

  const assignM = useMutation({
    mutationFn: (v: { id: number; all?: boolean; studentIds?: number[] }) =>
      scenarios.assign(v.id, { assignAll: v.all, studentIds: v.studentIds }),
    onSuccess: reload,
    onError: complain,
  });

  const unassignM = useMutation({
    mutationFn: (v: { id: number; studentId: number }) => scenarios.unassign(v.id, v.studentId),
    onSuccess: reload,
    onError: complain,
  });

  const archiveM = useMutation({
    mutationFn: (v: { id: number; archived: boolean }) => scenarios.update(v.id, { archived: v.archived }),
    onSuccess: reload,
    onError: complain,
  });

  const detailsQ = useQuery({
    queryKey: ["scenario-details", open],
    queryFn: () => scenarios.details(open!),
    enabled: open !== null,
  });

  const fresh = (attemptsQ.data ?? []).filter((a) => a.fresh);
  const list = listQ.data ?? [];

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: screenTop(insets),
        paddingBottom: screenBottom(insets),
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: 28, fontWeight: "900", letterSpacing: -0.7, color: colors.foreground }}>
        Диалоги
      </Text>
      <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginTop: 5, marginBottom: 16 }}>
        Разговор с ролью для ученика: вы задаёте обстановку и условие, а после разговора получаете весь
        диалог с ошибками. Создать ситуацию можно и здесь, и в «Создать задание».
      </Text>

      {/* ── Свежие разборы ────────────────────────────────────────────── */}
      {fresh.length > 0 && (
        <>
          <SectionLabel>Новые разборы · {fresh.length}</SectionLabel>
          <View style={card(colors, { marginBottom: 14, gap: 10 })}>
            {fresh.slice(0, 8).map((a) => (
              <Pressable
                key={a.id}
                onPress={() => router.push(`/scenario-review/${a.id}` as any)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
                accessibilityRole="button"
              >
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  alignItems: "center", justifyContent: "center",
                  backgroundColor: a.mistakes > 0 ? "rgba(225,29,72,0.12)" : "rgba(139,92,246,0.14)",
                }}>
                  <Glyph name="chat" size={17} color={a.mistakes > 0 ? "#e11d48" : colors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "900", color: colors.foreground }}>
                    {a.studentName ?? "Ученик"}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 11.5, color: colors.mutedForeground, marginTop: 1 }}>
                    {a.scenarioTitle} · {a.turns} реплик · ошибок {a.mistakes}
                  </Text>
                </View>
                <Glyph name="chevron" size={18} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* ── Создание ──────────────────────────────────────────────────── */}
      {creating ? (
        <View style={{ marginBottom: 14 }}>
          <ScenarioForm
            onCreated={() => setCreating(false)}
            onCancel={() => setCreating(false)}
          />
        </View>
      ) : (
        <ChunkyButton
          label="Новая ситуация"
          sublabel="обстановка, роль Снежи, цель и число реплик"
          icon="plus"
          chevron
          onPress={() => setCreating(true)}
          style={{ marginBottom: 14 }}
        />
      )}

      {/* ── Мои ситуации ──────────────────────────────────────────────── */}
      <SectionLabel>Мои ситуации{list.length > 0 ? ` · ${list.length}` : ""}</SectionLabel>

      {listQ.isLoading && <ActivityIndicator color={colors.primary} />}

      {!listQ.isLoading && list.length === 0 && (
        <View style={card(colors)}>
          <Text style={{ fontSize: 13, lineHeight: 20, color: colors.mutedForeground }}>
            Ситуаций пока нет. Создайте первую: например, «спросить дорогу до магазина» или «заказать
            еду в кафе».
          </Text>
        </View>
      )}

      {list.map((s: TeacherScenario) => (
        <View key={s.id} style={card(colors, { marginBottom: 12, opacity: s.archived ? 0.6 : 1 })}>
          <Pressable
            onPress={() => setOpen(open === s.id ? null : s.id)}
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
            accessibilityRole="button"
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 15.5, fontWeight: "900", color: colors.foreground }}>{s.title}</Text>
              <Text style={{ fontSize: 11.5, color: colors.mutedForeground, marginTop: 2 }}>
                {finishText(s)} · проверка {strictnessText(s.strictness)} · выдана {s.assigned}
              </Text>
            </View>
            {s.fresh > 0 && <Pill text={`${s.fresh} новых`} tone="soft" color="#e11d48" />}
            {s.archived && <Pill text="в архиве" tone="soft" color={colors.mutedForeground} />}
            <View style={{ transform: [{ rotate: open === s.id ? "90deg" : "0deg" }] }}>
              <Glyph name="chevron" size={18} color={colors.mutedForeground} />
            </View>
          </Pressable>

          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.foreground, marginTop: 9 }}>
            {s.situation}
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: colors.mutedForeground, marginTop: 4 }}>
            Снежа: {s.role}{s.goal ? ` · Цель: ${s.goal}` : ""}
          </Text>

          {open === s.id && (
            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => assignM.mutate({ id: s.id, all: true })}
                  style={{
                    flex: 1, paddingVertical: 11, borderRadius: radii.sm, alignItems: "center",
                    backgroundColor: colors.primary + "1a",
                  }}
                  accessibilityRole="button"
                >
                  <Text style={{ fontSize: 12.5, fontWeight: "900", color: colors.primary }}>Выдать всем</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (s.archived) return archiveM.mutate({ id: s.id, archived: false });
                    Alert.alert(
                      "В архив?",
                      "Ученики больше не смогут начать эту ситуацию. Пройденные разборы останутся.",
                      [
                        { text: "Отмена", style: "cancel" },
                        { text: "В архив", style: "destructive", onPress: () => archiveM.mutate({ id: s.id, archived: true }) },
                      ],
                    );
                  }}
                  style={{
                    flex: 1, paddingVertical: 11, borderRadius: radii.sm, alignItems: "center",
                    backgroundColor: "rgba(120,110,170,0.12)",
                  }}
                  accessibilityRole="button"
                >
                  <Text style={{ fontSize: 12.5, fontWeight: "900", color: colors.mutedForeground }}>
                    {s.archived ? "Вернуть" : "В архив"}
                  </Text>
                </Pressable>
              </View>

              {detailsQ.isLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />}

              {detailsQ.data && detailsQ.data.scenario.id === s.id && (
                <>
                  <Text style={{ fontSize: 11, fontWeight: "900", letterSpacing: 1, color: colors.mutedForeground, marginTop: 14 }}>
                    ВЫДАНА · {detailsQ.data.students.length}
                  </Text>
                  <View style={{ gap: 6, marginTop: 7 }}>
                    {detailsQ.data.students.length === 0 && (
                      <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Пока никому.</Text>
                    )}
                    {detailsQ.data.students.map((st) => (
                      <View key={st.id} style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                        <View style={{
                          width: 26, height: 26, borderRadius: 13,
                          alignItems: "center", justifyContent: "center",
                          backgroundColor: st.avatarColor ?? colors.primary,
                        }}>
                          <Text style={{ fontSize: 12 }}>{st.avatarEmoji ?? ""}</Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: colors.foreground }}>
                          {st.name}
                        </Text>
                        <Pressable
                          onPress={() => unassignM.mutate({ id: s.id, studentId: st.id })}
                          hitSlop={8}
                          accessibilityLabel={`Снять у ${st.name}`}
                        >
                          <Glyph name="close" size={15} color={colors.mutedForeground} />
                        </Pressable>
                      </View>
                    ))}
                  </View>

                  <Text style={{ fontSize: 11, fontWeight: "900", letterSpacing: 1, color: colors.mutedForeground, marginTop: 14 }}>
                    РАЗБОРЫ · {detailsQ.data.attempts.length}
                  </Text>
                  <View style={{ gap: 8, marginTop: 7 }}>
                    {detailsQ.data.attempts.length === 0 && (
                      <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                        Никто пока не проходил.
                      </Text>
                    )}
                    {detailsQ.data.attempts.map((a) => (
                      <Pressable
                        key={a.id}
                        onPress={() => router.push(`/scenario-review/${a.id}` as any)}
                        style={{ flexDirection: "row", alignItems: "center", gap: 9 }}
                        accessibilityRole="button"
                      >
                        <Glyph
                          name={a.status === "done" ? "check" : a.status === "active" ? "clock" : "alert"}
                          size={16}
                          color={a.status === "done" ? colors.primary : colors.mutedForeground}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: a.fresh ? "900" : "700", color: colors.foreground }}>
                            {a.studentName ?? "Ученик"}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                            {a.turns} реплик · ошибок {a.mistakes}{a.goalReached ? " · цель" : ""}
                          </Text>
                        </View>
                        {a.fresh && <Pill text="новое" tone="soft" color="#e11d48" />}
                        <Glyph name="chevron" size={16} color={colors.mutedForeground} />
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      ))}

      {!!problem && (
        <View style={{
          position: "absolute", left: 16, right: 16, bottom: screenBottom(insets) - 60,
          backgroundColor: "#3b1d4d", borderRadius: radii.md, padding: 12,
        }}>
          <Text style={{ color: "#fff", fontSize: 12.5, fontWeight: "700" }}>{problem}</Text>
        </View>
      )}
    </ScrollView>
  );
}
