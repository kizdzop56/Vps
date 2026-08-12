// ─────────────────────────────────────────────────────────────────────────────
// Учитель: ситуации для разговора.
//
// Экран делает три вещи и в этом порядке:
//   1. показывает СВЕЖИЕ РАЗБОРЫ — то, ради чего учитель сюда заходит: кто
//      прошёл задание и где ошибался;
//   2. держит список своих ситуаций с выдачей;
//   3. позволяет создать новую.
//
// Создание — форма на этом же экране, а не отдельный маршрут: полей мало, и
// переход туда-обратно ради шести строк на телефоне только мешает.
//
// ── Про «Выдать всем» ───────────────────────────────────────────────────────
// Главная кнопка выдачи — «всем моим ученикам»: на телефоне отмечать галочки по
// одному мучительно, а типичный случай именно такой. Список с выбором есть, но
// он второй, а не первый.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import {
  View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Alert,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, Pill, SectionLabel } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";
import {
  finishText, scenarios, strictnessText,
  type FinishMode, type ScenarioDraft, type Strictness, type TeacherScenario,
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

/** Поле формы: подпись сверху, ввод снизу. */
function Field({
  label, hint, value, onChange, placeholder, multiline, colors,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
  colors: any;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 12.5, fontWeight: "900", color: colors.foreground }}>{label}</Text>
      {!!hint && (
        <Text style={{ fontSize: 11.5, lineHeight: 16, color: colors.mutedForeground, marginTop: 2 }}>{hint}</Text>
      )}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#a99fce"
        multiline={multiline}
        style={{
          marginTop: 6,
          minHeight: multiline ? 78 : 46,
          backgroundColor: colors.card,
          borderRadius: radii.sm + 2,
          borderWidth: 2,
          borderColor: value.trim() ? colors.primary : colors.border,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 14.5,
          color: colors.foreground,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}

/** Ряд выбора одного значения. */
function Choice<T extends string | number>({
  label, options, value, onChange, colors,
}: {
  label: string;
  options: { key: T; text: string }[];
  value: T;
  onChange: (v: T) => void;
  colors: any;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 12.5, fontWeight: "900", color: colors.foreground, marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <Pressable
              key={String(o.key)}
              onPress={() => onChange(o.key)}
              style={{
                paddingHorizontal: 13, paddingVertical: 9, borderRadius: radii.pill,
                backgroundColor: on ? colors.primary : "rgba(120,110,170,0.12)",
              }}
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 12.5, fontWeight: "900", color: on ? "#fff" : "#6b5f9c" }}>{o.text}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const EMPTY: ScenarioDraft = {
  title: "",
  situation: "",
  role: "",
  goal: "",
  finishMode: "turns",
  turnsTarget: 20,
  criteria: [],
  strictness: "normal",
  opener: "",
};

export default function TeacherScenarios() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const listQ = useQuery({ queryKey: ["scenarios"], queryFn: scenarios.list, staleTime: 10_000 });
  const attemptsQ = useQuery({ queryKey: ["scenario-attempts"], queryFn: scenarios.attempts, staleTime: 10_000 });
  const studentsQ = useQuery({ queryKey: ["scenario-students"], queryFn: scenarios.students, staleTime: 60_000 });

  const [form, setForm] = React.useState<ScenarioDraft | null>(null);
  const [criterion, setCriterion] = React.useState("");
  const [picked, setPicked] = React.useState<number[]>([]);
  const [assignAll, setAssignAll] = React.useState(true);
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

  const createM = useMutation({
    mutationFn: (draft: ScenarioDraft) => scenarios.create(draft),
    onSuccess: () => {
      setForm(null);
      setPicked([]);
      setCriterion("");
      reload();
    },
    onError: complain,
  });

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

  const submit = () => {
    if (!form) return;
    if (!form.title.trim() || !form.situation.trim() || !form.role.trim()) {
      complain(new Error("Заполните название, ситуацию и роль Снежи"));
      return;
    }
    if (form.finishMode !== "turns" && !(form.goal ?? "").trim()) {
      complain(new Error("Для завершения по цели опишите цель"));
      return;
    }
    createM.mutate({
      ...form,
      goal: (form.goal ?? "").trim(),
      opener: (form.opener ?? "").trim(),
      assignAll,
      studentIds: assignAll ? [] : picked,
    });
  };

  const fresh = (attemptsQ.data ?? []).filter((a) => a.fresh);
  const list = listQ.data ?? [];
  const students = studentsQ.data ?? [];

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
        Ситуации
      </Text>
      <Text style={{ fontSize: 13, lineHeight: 19, color: colors.mutedForeground, marginTop: 5, marginBottom: 16 }}>
        Разговор с ролью для ученика: вы задаёте обстановку и условие, а после разговора получаете весь
        диалог с ошибками.
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

      {/* ── Форма создания ────────────────────────────────────────────── */}
      {form ? (
        <View style={card(colors, { marginBottom: 14 })}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ fontSize: 17, fontWeight: "900", color: colors.foreground }}>Новая ситуация</Text>
            <Pressable onPress={() => setForm(null)} hitSlop={10} accessibilityLabel="Закрыть форму">
              <Glyph name="close" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <Field
            colors={colors}
            label="Название"
            value={form.title}
            onChange={(v) => setForm({ ...form, title: v })}
            placeholder="Дорога до магазина"
          />
          <Field
            colors={colors}
            label="Ситуация"
            hint="Где происходит разговор и что вокруг. Это увидит ученик."
            value={form.situation}
            onChange={(v) => setForm({ ...form, situation: v })}
            placeholder="Ты в незнакомом городе и не знаешь, где магазин."
            multiline
          />
          <Field
            colors={colors}
            label="Кем будет Снежа"
            hint="Роль собеседника: она будет отвечать как этот персонаж."
            value={form.role}
            onChange={(v) => setForm({ ...form, role: v })}
            placeholder="прохожий на улице, местный житель"
          />
          <Field
            colors={colors}
            label="Цель ученика"
            hint="Необязательно. Подсказывать путь к цели Снежа не будет."
            value={form.goal ?? ""}
            onChange={(v) => setForm({ ...form, goal: v })}
            placeholder="узнать, как дойти до магазина"
            multiline
          />

          <Choice<FinishMode>
            colors={colors}
            label="Когда задание закончится"
            value={form.finishMode}
            onChange={(v) => setForm({ ...form, finishMode: v })}
            options={[
              { key: "turns", text: "по числу реплик" },
              { key: "goal", text: "по цели" },
              { key: "both", text: "что раньше" },
            ]}
          />
          <Choice<number>
            colors={colors}
            label="Сколько реплик должен сказать ученик"
            value={form.turnsTarget}
            onChange={(v) => setForm({ ...form, turnsTarget: v })}
            options={[
              { key: 10, text: "10" },
              { key: 20, text: "20" },
              { key: 40, text: "40" },
              { key: 60, text: "60" },
            ]}
          />
          <Choice<Strictness>
            colors={colors}
            label="Насколько строго проверять"
            value={form.strictness}
            onChange={(v) => setForm({ ...form, strictness: v })}
            options={[
              { key: "gentle", text: "мягко" },
              { key: "normal", text: "обычно" },
              { key: "strict", text: "строго" },
            ]}
          />

          <Field
            colors={colors}
            label="Первая реплика Снежи"
            hint="Необязательно. Без неё разговор начинает ученик."
            value={form.opener ?? ""}
            onChange={(v) => setForm({ ...form, opener: v })}
            placeholder="Hi! You look lost. Can I help you?"
            multiline
          />

          {/* Критерии: короткие правила игры для Снежи. */}
          <Text style={{ fontSize: 12.5, fontWeight: "900", color: colors.foreground }}>Критерии</Text>
          <Text style={{ fontSize: 11.5, lineHeight: 16, color: colors.mutedForeground, marginTop: 2 }}>
            По ним Снежа ведёт разговор: чего требовать, о чём спрашивать, какие слова ждать.
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 6, alignItems: "center" }}>
            <TextInput
              value={criterion}
              onChangeText={setCriterion}
              placeholder="Отвечай короткими фразами"
              placeholderTextColor="#a99fce"
              style={{
                flex: 1, minHeight: 44,
                backgroundColor: colors.card, borderRadius: radii.sm + 2,
                borderWidth: 2, borderColor: colors.border,
                paddingHorizontal: 12, fontSize: 14, color: colors.foreground,
              }}
            />
            <Pressable
              onPress={() => {
                const v = criterion.trim();
                if (!v) return;
                setForm({ ...form, criteria: [...form.criteria, v].slice(0, 10) });
                setCriterion("");
              }}
              style={{
                width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
                backgroundColor: colors.primary,
              }}
              accessibilityLabel="Добавить критерий"
            >
              <Glyph name="plus" size={20} color="#fff" />
            </Pressable>
          </View>
          {form.criteria.length > 0 && (
            <View style={{ gap: 6, marginTop: 8 }}>
              {form.criteria.map((c, i) => (
                <Pressable
                  key={`${c}-${i}`}
                  onPress={() => setForm({ ...form, criteria: form.criteria.filter((_, j) => j !== i) })}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 8,
                    backgroundColor: "rgba(99,102,241,0.08)", borderRadius: radii.sm, padding: 9,
                  }}
                  accessibilityLabel={`Убрать критерий: ${c}`}
                >
                  <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.foreground }}>{c}</Text>
                  <Glyph name="trash" size={15} color={colors.mutedForeground} />
                </Pressable>
              ))}
            </View>
          )}

          {/* Кому выдать. Главный путь — всем: см. шапку. */}
          <View style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 12.5, fontWeight: "900", color: colors.foreground, marginBottom: 6 }}>
              Кому выдать
            </Text>
            <View style={{ flexDirection: "row", gap: 7 }}>
              <Pressable
                onPress={() => setAssignAll(true)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: radii.pill, alignItems: "center",
                  backgroundColor: assignAll ? colors.primary : "rgba(120,110,170,0.12)",
                }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: "900", color: assignAll ? "#fff" : "#6b5f9c" }}>
                  Всем ({students.length})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setAssignAll(false)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: radii.pill, alignItems: "center",
                  backgroundColor: !assignAll ? colors.primary : "rgba(120,110,170,0.12)",
                }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: "900", color: !assignAll ? "#fff" : "#6b5f9c" }}>
                  Выбрать
                </Text>
              </Pressable>
            </View>

            {!assignAll && (
              <View style={{ gap: 6, marginTop: 8 }}>
                {students.length === 0 && (
                  <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                    Учеников пока нет: добавьте их в разделе «Ученики».
                  </Text>
                )}
                {students.map((s) => {
                  const on = picked.includes(s.id);
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => setPicked((cur) => on ? cur.filter((x) => x !== s.id) : [...cur, s.id])}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 10,
                        backgroundColor: on ? "rgba(139,92,246,0.12)" : "rgba(120,110,170,0.07)",
                        borderRadius: radii.sm, padding: 9,
                      }}
                    >
                      <View style={{
                        width: 30, height: 30, borderRadius: 15,
                        alignItems: "center", justifyContent: "center",
                        backgroundColor: s.avatarColor ?? colors.primary,
                      }}>
                        <Text style={{ fontSize: 14 }}>{s.avatarEmoji ?? ""}</Text>
                      </View>
                      <Text style={{ flex: 1, fontSize: 13.5, fontWeight: on ? "900" : "700", color: colors.foreground }}>
                        {s.name}
                      </Text>
                      <Glyph name={on ? "check" : "plus"} size={16} color={on ? colors.primary : colors.mutedForeground} />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <ChunkyButton
            label={createM.isPending ? "Создаём…" : "Создать и выдать"}
            icon="check"
            center
            onPress={submit}
            disabled={createM.isPending}
            style={{ marginTop: 16 }}
          />
        </View>
      ) : (
        <ChunkyButton
          label="Новая ситуация"
          sublabel="обстановка, роль Снежи, цель и условие завершения"
          icon="plus"
          chevron
          onPress={() => setForm({ ...EMPTY })}
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
