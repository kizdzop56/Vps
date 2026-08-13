// ─────────────────────────────────────────────────────────────────────────────
// Форма ситуации для разговора (учитель).
//
// Живёт отдельным компонентом, потому что нужна В ДВУХ местах: в «Создать
// задание» (там учитель заводит любую работу для ученика, и диалог — такая же
// работа) и во вкладке «Диалоги», где лежат сами ситуации и разборы. Копия
// формы в двух экранах разъехалась бы на первой правке.
//
// ── Число реплик НЕОБЯЗАТЕЛЬНО ──────────────────────────────────────────────
// По умолчанию стоит «без ограничения»: задание закрывает достигнутая цель.
// Раньше здесь молча подставлялись двадцать реплик, и ученик, добившийся цели
// на пятой, продолжал говорить в никуда — выглядело как поломка.
//
// Если число выбрано, оно выполняется строго: цель задание не закроет, пока
// реплики не сказаны. Так и задумано — учитель выбирает длину разговора.
//
// Эмодзи в интерфейсе нет: значки — глифы из своего набора.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { View, Text, Pressable, TextInput, type ViewStyle } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import { scenarios, type ScenarioDraft, type Strictness } from "@/hooks/useScenarios";

const EMPTY: ScenarioDraft = {
  title: "",
  situation: "",
  role: "",
  goal: "",
  // Ноль — «без ограничения»: закрывает цель.
  turnsTarget: 0,
  criteria: [],
  strictness: "normal",
  opener: "",
};

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
  label, hint, options, value, onChange, colors,
}: {
  label: string;
  hint?: string;
  options: { key: T; text: string }[];
  value: T;
  onChange: (v: T) => void;
  colors: any;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 12.5, fontWeight: "900", color: colors.foreground }}>{label}</Text>
      {!!hint && (
        <Text style={{ fontSize: 11.5, lineHeight: 16, color: colors.mutedForeground, marginTop: 2 }}>{hint}</Text>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 6 }}>
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
              accessibilityState={{ selected: on }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: "900", color: on ? "#fff" : "#6b5f9c" }}>{o.text}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export interface ScenarioFormProps {
  /** Ситуация создана: закрыть форму, обновить списки. */
  onCreated?: () => void;
  /** Нажали крестик. Пусто — крестик не рисуем. */
  onCancel?: () => void;
  /** Заголовок формы. */
  title?: string;
}

export function ScenarioForm({ onCreated, onCancel, title = "Новая ситуация" }: ScenarioFormProps) {
  const colors = useColors();
  const qc = useQueryClient();

  const [form, setForm] = React.useState<ScenarioDraft>({ ...EMPTY });
  const [criterion, setCriterion] = React.useState("");
  const [picked, setPicked] = React.useState<number[]>([]);
  const [assignAll, setAssignAll] = React.useState(true);
  const [problem, setProblem] = React.useState<string | null>(null);

  const studentsQ = useQuery({
    queryKey: ["scenario-students"],
    queryFn: scenarios.students,
    staleTime: 60_000,
  });
  const students = studentsQ.data ?? [];

  const complain = (err: unknown) => {
    setProblem(err instanceof Error ? err.message : "Не получилось");
  };

  const createM = useMutation({
    mutationFn: (draft: ScenarioDraft) => scenarios.create(draft),
    onSuccess: () => {
      setForm({ ...EMPTY });
      setPicked([]);
      setCriterion("");
      setProblem(null);
      void qc.invalidateQueries({ queryKey: ["scenarios"] });
      void qc.invalidateQueries({ queryKey: ["scenario-attempts"] });
      onCreated?.();
    },
    onError: complain,
  });

  const submit = () => {
    setProblem(null);
    if (!form.title.trim() || !form.situation.trim() || !form.role.trim()) {
      complain(new Error("Заполните название, ситуацию и роль Снежи"));
      return;
    }
    // Без цели и без числа реплик задание нечем закрыть: то же правило, что на
    // сервере, но сказанное до отправки.
    if (!(form.goal ?? "").trim() && form.turnsTarget === 0) {
      complain(new Error("Опишите цель или выберите число реплик: иначе задание нечем закончить"));
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

  return (
    <View style={card(colors)}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Text style={{ fontSize: 17, fontWeight: "900", color: colors.foreground }}>{title}</Text>
        {!!onCancel && (
          <Pressable onPress={onCancel} hitSlop={10} accessibilityLabel="Закрыть форму">
            <Glyph name="close" size={20} color={colors.mutedForeground} />
          </Pressable>
        )}
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
        hint="Как только цель достигнута, задание закрывается само. Путь к ней Снежа не подсказывает."
        value={form.goal ?? ""}
        onChange={(v) => setForm({ ...form, goal: v })}
        placeholder="узнать, как дойти до магазина"
        multiline
      />

      <Choice<number>
        colors={colors}
        label="Сколько реплик должен сказать ученик"
        hint="Необязательно. Если число выбрано, оно выполняется строго: цель не закроет задание раньше."
        value={form.turnsTarget}
        onChange={(v) => setForm({ ...form, turnsTarget: v })}
        options={[
          { key: 0, text: "без ограничения" },
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

      {/* Кому выдать. Главный путь — всем: отмечать галочки по одному на
          телефоне мучительно, а типичный случай именно такой. */}
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
            accessibilityRole="button"
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
            accessibilityRole="button"
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
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
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

      {!!problem && (
        <View style={{
          flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 14,
          backgroundColor: "rgba(225,29,72,0.08)",
          borderRadius: radii.sm, borderWidth: 1, borderColor: "rgba(225,29,72,0.32)",
          padding: 10,
        }}>
          <Glyph name="alert" size={15} color="#e11d48" />
          <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: "700", color: "#e11d48" }}>
            {problem}
          </Text>
        </View>
      )}

      <ChunkyButton
        label={createM.isPending ? "Создаём…" : "Создать и выдать"}
        icon="check"
        center
        onPress={submit}
        disabled={createM.isPending}
        style={{ marginTop: 16 }}
      />
    </View>
  );
}

export default ScenarioForm;
