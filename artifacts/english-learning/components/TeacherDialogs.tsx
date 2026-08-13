// ─────────────────────────────────────────────────────────────────────────────
// Диалоги учителя внутри вкладки «Задания».
//
// Раньше у ситуаций была своя вкладка в нижней панели. Это было лишним: для
// учителя диалог — такая же работа для ученика, как тест или колода, и жить он
// должен там же, где остальные задания. Отдельная вкладка ещё и вводила в
// заблуждение: создание переехало в «Создать задание», а вкладка осталась.
//
// Здесь три вещи, и все они про ПОВТОРНОЕ использование:
//   • созданный диалог никуда не девается и выдаётся сколько угодно раз —
//     кнопкой «Выдать», а не пересозданием;
//   • видно, кому уже выдан и кто прошёл;
//   • разборы приходят сюда же, в «Ответы учеников».
//
// Компонент отдельный, а не кусок assignments.tsx: тот экран и так на восемьдесят
// килобайт, и дописывать в него ещё один раздел значит окончательно похоронить
// его читаемость.
//
// Эмодзи не используются: значки — глифы из своего набора.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, Pressable, ScrollView, Modal, ActivityIndicator, Alert,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, Pill, SectionLabel } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import {
  finishText, scenarios, strictnessText,
  type TeacherScenario,
} from "@/hooks/useScenarios";

/** Ключи запросов. Те же, что использует экран заданий для счётчиков. */
export const DIALOGS_KEY = ["scenarios"] as const;
export const DIALOG_REVIEWS_KEY = ["scenario-attempts"] as const;

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
    shadowRadius: 11,
    elevation: 3,
    ...extra,
  };
}

// ── Кому выдать ─────────────────────────────────────────────────────────────
//
// Модалка, а не переход на экран: выдача — это одно решение из двух шагов
// («всем» или «этим»), и уводить ради него с экрана заданий незачем.
function AssignDialogModal({
  scenario, onClose,
}: {
  scenario: TeacherScenario | null;
  onClose: () => void;
}) {
  const colors = useColors();
  const qc = useQueryClient();
  const [picked, setPicked] = React.useState<number[]>([]);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<number | null>(null);

  const studentsQ = useQuery({
    queryKey: ["scenario-students"],
    queryFn: scenarios.students,
    enabled: !!scenario,
    staleTime: 60_000,
  });
  const students = studentsQ.data ?? [];

  React.useEffect(() => {
    if (!scenario) return;
    setPicked([]);
    setProblem(null);
    setDone(null);
  }, [scenario?.id]);

  const assignM = useMutation({
    mutationFn: (target: { assignAll?: boolean; studentIds?: number[] }) =>
      scenarios.assign(scenario!.id, target),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: DIALOGS_KEY });
      void qc.invalidateQueries({ queryKey: ["scenario-details", scenario?.id] });
      setDone(res.assigned.length);
    },
    onError: (err) => setProblem(err instanceof Error ? err.message : "Не удалось выдать"),
  });

  if (!scenario) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: colors.card,
          borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg,
          padding: 22, maxHeight: "85%",
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 19, fontWeight: "900", letterSpacing: -0.3, color: colors.foreground }}>
              Выдать диалог
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Закрыть">
              <Glyph name="close" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 4, marginBottom: 16 }}>
            {scenario.title} · {finishText(scenario)}
          </Text>

          {done !== null ? (
            <View style={{ alignItems: "center", paddingVertical: 22, gap: 12 }}>
              <View style={{
                width: 62, height: 62, borderRadius: radii.md,
                alignItems: "center", justifyContent: "center",
                backgroundColor: colors.primary + "14",
                borderWidth: 1, borderColor: colors.primary + "2e",
              }}>
                <Glyph name="check" size={30} color={colors.primary} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>
                {done === 0 ? "Никому не выдано" : `Выдано ученикам: ${done}`}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, textAlign: "center" }}>
                Диалог остаётся здесь: его можно выдать снова в любой момент, заново создавать не нужно.
              </Text>
              <ChunkyButton label="Готово" icon="check" center onPress={onClose} style={{ alignSelf: "stretch" }} />
            </View>
          ) : (
            <>
              {studentsQ.isLoading && <ActivityIndicator color={colors.primary} style={{ marginVertical: 26 }} />}

              {!studentsQ.isLoading && students.length === 0 && (
                <Text style={{ fontSize: 13.5, lineHeight: 20, color: colors.mutedForeground, marginBottom: 14 }}>
                  Учеников пока нет. Добавьте их на вкладке «Ученики», и диалог можно будет выдать.
                </Text>
              )}

              {students.length > 0 && (
                <>
                  <ChunkyButton
                    label={`Выдать всем (${students.length})`}
                    icon="users"
                    center
                    disabled={assignM.isPending}
                    onPress={() => assignM.mutate({ assignAll: true })}
                  />

                  <SectionLabel style={{ marginTop: 16 }}>Или выбрать</SectionLabel>
                  <ScrollView style={{ maxHeight: 300 }}>
                    {students.map((st) => {
                      const on = picked.includes(st.id);
                      return (
                        <Pressable
                          key={st.id}
                          onPress={() => setPicked((cur) => on ? cur.filter((x) => x !== st.id) : [...cur, st.id])}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          style={{
                            flexDirection: "row", alignItems: "center", gap: 11,
                            padding: 11, borderRadius: radii.sm + 2, marginBottom: 8,
                            backgroundColor: on ? colors.primary + "15" : colors.card,
                            borderWidth: 1.5, borderColor: on ? colors.primary : colors.border,
                          }}
                        >
                          <View style={{
                            width: 34, height: 34, borderRadius: 17,
                            alignItems: "center", justifyContent: "center",
                            backgroundColor: st.avatarColor ?? colors.primary,
                          }}>
                            <Text style={{ fontSize: 15 }}>{st.avatarEmoji ?? ""}</Text>
                          </View>
                          <Text style={{ flex: 1, fontSize: 14.5, fontWeight: on ? "900" : "700", color: colors.foreground }}>
                            {st.name}
                          </Text>
                          <Glyph name={on ? "check" : "plus"} size={16} color={on ? colors.primary : colors.mutedForeground} />
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  <ChunkyButton
                    label={assignM.isPending ? "Выдаём…" : `Выдать выбранным${picked.length > 0 ? ` (${picked.length})` : ""}`}
                    icon="send"
                    center
                    disabled={picked.length === 0 || assignM.isPending}
                    onPress={() => assignM.mutate({ studentIds: picked })}
                    style={{ marginTop: 8 }}
                  />
                </>
              )}

              {!!problem && (
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.destructive, marginTop: 10 }}>
                  {problem}
                </Text>
              )}

              <Pressable onPress={onClose} style={{ paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ fontSize: 14, color: colors.mutedForeground }}>Отмена</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Одна карточка диалога ───────────────────────────────────────────────────
function DialogCard({
  dialog, onAssign,
}: {
  dialog: TeacherScenario;
  onAssign: () => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const detailsQ = useQuery({
    queryKey: ["scenario-details", dialog.id],
    queryFn: () => scenarios.details(dialog.id),
    enabled: open,
  });

  const archiveM = useMutation({
    mutationFn: (archived: boolean) => scenarios.update(dialog.id, { archived }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: DIALOGS_KEY }); },
  });

  const unassignM = useMutation({
    mutationFn: (studentId: number) => scenarios.unassign(dialog.id, studentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: DIALOGS_KEY });
      void qc.invalidateQueries({ queryKey: ["scenario-details", dialog.id] });
    },
  });

  return (
    <View style={card(colors, { marginBottom: 12, opacity: dialog.archived ? 0.6 : 1 })}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 11 }}>
        <View style={{
          width: 44, height: 44, borderRadius: radii.sm,
          alignItems: "center", justifyContent: "center",
          backgroundColor: "rgba(236,72,153,0.14)",
        }}>
          <Glyph name="handshake" size={22} color="#db2777" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 15.5, fontWeight: "800", color: colors.foreground }}>{dialog.title}</Text>
          <Text style={{ fontSize: 11.5, color: colors.mutedForeground, marginTop: 2 }}>
            {finishText(dialog)} · проверка {strictnessText(dialog.strictness)}
          </Text>
        </View>
        {dialog.fresh > 0 && <Pill text={`${dialog.fresh} новых`} tone="danger" icon="chat" />}
        {dialog.archived && <Pill text="в архиве" tone="soft" color={colors.mutedForeground} />}
      </View>

      <Text style={{ fontSize: 13, lineHeight: 19, color: colors.foreground, marginTop: 10 }}>
        {dialog.situation}
      </Text>
      <Text style={{ fontSize: 12, lineHeight: 18, color: colors.mutedForeground, marginTop: 4 }}>
        Снежа: {dialog.role}{dialog.goal ? ` · Цель: ${dialog.goal}` : ""}
      </Text>

      {/* Сколько раз уже сработал: по этой строке видно, что диалог живой и его
          не надо создавать заново. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        <Pill
          text={dialog.assigned > 0 ? `выдан ${dialog.assigned}` : "ещё не выдан"}
          icon="users"
          tone="soft"
          color={dialog.assigned > 0 ? colors.primary : colors.mutedForeground}
        />
        {dialog.attempts > 0 && (
          <Pill text={`прохождений ${dialog.attempts}`} icon="check" tone="soft" color={accents.violetDeep} />
        )}
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <Pressable
          onPress={onAssign}
          disabled={dialog.archived}
          accessibilityRole="button"
          accessibilityLabel="Выдать диалог"
          style={{
            flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
            paddingVertical: 10, borderRadius: radii.sm - 2,
            backgroundColor: colors.primary,
            opacity: dialog.archived ? 0.45 : 1,
          }}
        >
          <Glyph name="send" size={14} color="#fff" />
          <Text style={{ fontSize: 13, fontWeight: "800", color: "#fff" }}>
            {dialog.assigned > 0 ? "Выдать ещё" : "Выдать"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Подробности"
          style={{
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
            paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.sm - 2,
            borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
          }}
        >
          <Glyph name="chart" size={14} color={colors.mutedForeground} />
          <Text style={{ fontSize: 13, fontWeight: "800", color: colors.mutedForeground }}>
            {open ? "Свернуть" : "Кому выдан"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            if (dialog.archived) return archiveM.mutate(false);
            Alert.alert(
              "В архив?",
              "Ученики больше не смогут начать этот диалог. Пройденные разборы останутся.",
              [
                { text: "Отмена", style: "cancel" },
                { text: "В архив", style: "destructive", onPress: () => archiveM.mutate(true) },
              ],
            );
          }}
          accessibilityRole="button"
          accessibilityLabel={dialog.archived ? "Вернуть из архива" : "В архив"}
          style={{
            paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.sm - 2,
            borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
            alignItems: "center", justifyContent: "center",
          }}
        >
          <Glyph name={dialog.archived ? "repeat" : "trash"} size={14} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {open && (
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
          {detailsQ.isLoading && <ActivityIndicator color={colors.primary} />}

          {detailsQ.data && (
            <>
              <SectionLabel>Выдан · {detailsQ.data.students.length}</SectionLabel>
              <View style={{ gap: 7, marginBottom: 14 }}>
                {detailsQ.data.students.length === 0 && (
                  <Text style={{ fontSize: 12.5, color: colors.mutedForeground }}>Пока никому.</Text>
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
                      onPress={() => unassignM.mutate(st.id)}
                      hitSlop={8}
                      accessibilityLabel={`Снять у ${st.name}`}
                    >
                      <Glyph name="close" size={15} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                ))}
              </View>

              <SectionLabel>Прохождения · {detailsQ.data.attempts.length}</SectionLabel>
              <View style={{ gap: 9 }}>
                {detailsQ.data.attempts.length === 0 && (
                  <Text style={{ fontSize: 12.5, color: colors.mutedForeground }}>Никто пока не проходил.</Text>
                )}
                {detailsQ.data.attempts.map((a) => (
                  <Pressable
                    key={a.id}
                    onPress={() => router.push(`/(main)/scenario-review/${a.id}` as any)}
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
                    {a.fresh && <Pill text="новое" tone="danger" />}
                    <Glyph name="chevron" size={16} color={colors.mutedForeground} />
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ── Список диалогов: раздел вкладки «Задания» ───────────────────────────────
export function TeacherDialogs({ search }: { search: string }) {
  const colors = useColors();
  const router = useRouter();
  const [assignTarget, setAssignTarget] = React.useState<TeacherScenario | null>(null);

  const listQ = useQuery({ queryKey: DIALOGS_KEY, queryFn: scenarios.list, staleTime: 10_000 });
  const all = listQ.data ?? [];
  const visible = search
    ? all.filter((d) => `${d.title} ${d.situation}`.toLowerCase().includes(search))
    : all;

  return (
    <>
      <AssignDialogModal scenario={assignTarget} onClose={() => setAssignTarget(null)} />

      {/* Создание живёт в «Создать задание»: там учитель заводит любую работу
          для ученика, и диалог — такая же работа. */}
      <ChunkyButton
        label="Создать диалог"
        sublabel="в «Создать задание», вкладка «Диалог»"
        icon="plus"
        chevron
        onPress={() => router.push("/(main)/create-assignment" as any)}
        style={{ marginBottom: 16 }}
      />

      <SectionLabel>Мои диалоги · {visible.length}</SectionLabel>

      {listQ.isLoading && <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 20 }} />}

      {!listQ.isLoading && visible.length === 0 && (
        <View style={card(colors)}>
          <Text style={{ fontSize: 13.5, lineHeight: 20, color: colors.mutedForeground }}>
            {all.length === 0
              ? "Диалогов пока нет. Создайте первый: например, «спросить дорогу до магазина» или «заказать еду в кафе». Созданный диалог остаётся здесь, и выдать его можно сколько угодно раз."
              : "По этому запросу ничего не нашлось."}
          </Text>
        </View>
      )}

      {visible.map((d) => (
        <DialogCard key={d.id} dialog={d} onAssign={() => setAssignTarget(d)} />
      ))}
    </>
  );
}

// ── Строка диалога для общего списка «Все» ──────────────────────────────────
export function DialogRow({
  dialog, onPress,
}: {
  dialog: TeacherScenario;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={dialog.title}
      style={({ pressed }) => [
        card(colors, {
          flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12,
        }),
        pressed ? { opacity: 0.9 } : null,
      ]}
    >
      <View style={{
        width: 44, height: 44, borderRadius: radii.sm,
        alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(236,72,153,0.14)",
      }}>
        <Glyph name="handshake" size={22} color="#db2777" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{dialog.title}</Text>
        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 3 }}>
          Диалог · {finishText(dialog)}
          {dialog.assigned > 0 ? ` · выдан ${dialog.assigned}` : " · ещё не выдан"}
        </Text>
      </View>
      {dialog.fresh > 0 && <Pill text={`${dialog.fresh}`} icon="chat" tone="danger" />}
      <Glyph name="chevron" size={20} color={colors.mutedForeground} />
    </Pressable>
  );
}

// ── Разборы: раздел «Ответы учеников» ───────────────────────────────────────
//
// Учитель узнавал о пройденном диалоге, только если сам заходил в бывшую вкладку
// «Диалоги». Теперь разборы лежат там же, где ответы на обычные задания, и
// свежие стоят сверху.
export function TeacherDialogReviews() {
  const colors = useColors();
  const router = useRouter();

  const q = useQuery({
    queryKey: DIALOG_REVIEWS_KEY,
    queryFn: scenarios.attempts,
    staleTime: 10_000,
  });

  // Активные попытки не показываем: разбирать ещё нечего, ученик в процессе.
  const rows = (q.data ?? []).filter((a) => a.status !== "active");
  if (rows.length === 0) return null;

  const ordered = [...rows].sort((a, b) => {
    if (a.fresh !== b.fresh) return a.fresh ? -1 : 1;
    return new Date(b.finishedAt ?? b.startedAt).getTime()
      - new Date(a.finishedAt ?? a.startedAt).getTime();
  });
  const fresh = rows.filter((a) => a.fresh).length;

  return (
    <>
      <SectionLabel>
        Разборы диалогов · {rows.length}{fresh > 0 ? ` · новых ${fresh}` : ""}
      </SectionLabel>

      {ordered.map((a) => {
        const stopped = a.status !== "done";
        const tint = stopped ? accents.amber : a.mistakes > 0 ? "#e11d48" : colors.primary;
        return (
          <Pressable
            key={a.id}
            onPress={() => router.push(`/(main)/scenario-review/${a.id}` as any)}
            accessibilityRole="button"
            accessibilityLabel={`${a.studentName ?? "Ученик"}: ${a.scenarioTitle}`}
            style={({ pressed }) => [
              card(colors, {
                marginBottom: 12,
                shadowColor: tint,
                borderColor: a.fresh ? tint + "66" : colors.border,
              }),
              pressed ? { opacity: 0.9 } : null,
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
              <View style={{
                width: 40, height: 40, borderRadius: 20,
                alignItems: "center", justifyContent: "center",
                backgroundColor: tint + "1f",
              }}>
                <Glyph name="chat" size={19} color={tint} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: a.fresh ? "900" : "800", color: colors.foreground }}>
                  {a.studentName ?? "Ученик"}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                  {a.scenarioTitle}
                </Text>
              </View>
              {a.fresh && <Pill text="новое" tone="danger" />}
              <Glyph name="chevron" size={17} color={colors.mutedForeground} />
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
              <Pill text={`${a.turns} реплик`} tone="soft" color={colors.primary} />
              <Pill
                text={`ошибок ${a.mistakes}`}
                tone="soft"
                color={a.mistakes === 0 ? accents.violetDeep : "#e11d48"}
              />
              {a.goalReached && <Pill text="цель достигнута" tone="soft" color={accents.gold} />}
              {stopped && <Pill text="вышел на середине" icon="alert" tone="danger" />}
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>
                {new Date(a.finishedAt ?? a.startedAt).toLocaleDateString("ru-RU")}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </>
  );
}

export default TeacherDialogs;
