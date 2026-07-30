// ─────────────────────────────────────────────────────────────────────────────
// Выбор учеников, которым отправляется колода. Мультивыбор из списка своих
// учеников (accepted-связь учитель↔ученик).
//
// Компонент только ведёт выбор — сохраняет его вызывающий экран:
//   • мастер создания колоды — последним шагом, вместе с самой колодой;
//   • страница колоды — кнопкой «Сохранить получателей» (replace-синхронизация).
//
// Сам по себе не скроллится: оба экрана оборачивают его в свой ScrollView.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { fc, type TeacherStudent } from "@/hooks/useFlashcards";
import { formatStudentName } from "@/utils/displayName";

export type AssignStudentsSheetProps = {
  /** Отмеченные ученики. */
  selectedIds: number[];
  onChangeSelected: (ids: number[]) => void;
  /** Кому колода уже отправлена — показываем отметкой рядом с именем. */
  alreadyAssignedIds?: number[];
  /** Подсказка над списком (у мастера и у страницы колоды она разная). */
  hint?: string;
  /** Что показать, если учеников ещё нет. */
  onEmptyAction?: { label: string; onPress: () => void };
};

export default function AssignStudentsSheet({
  selectedIds, onChangeSelected, alreadyAssignedIds = [], hint, onEmptyAction,
}: AssignStudentsSheetProps) {
  const colors = useColors();
  const studentsQ = useQuery({ queryKey: ["fc-teacher-students"], queryFn: fc.getTeacherStudents });

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const assigned = useMemo(() => new Set(alreadyAssignedIds), [alreadyAssignedIds]);
  const students: TeacherStudent[] = studentsQ.data ?? [];

  const toggle = (id: number) => {
    onChangeSelected(selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const allSelected = students.length > 0 && students.every((s) => selected.has(s.id));

  if (studentsQ.isLoading) {
    return <ActivityIndicator color={colors.primary} style={{ marginVertical: 28 }} />;
  }

  if (studentsQ.isError) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
        <Feather name="alert-circle" size={22} color={colors.destructive} />
        <Text style={{ fontSize: 13, color: colors.destructive, textAlign: "center" }}>
          Не удалось загрузить список учеников.
        </Text>
        <TouchableOpacity
          onPress={() => studentsQ.refetch()}
          style={{ marginTop: 4, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.primary }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Повторить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (students.length === 0) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 28, gap: 10 }}>
        <Text style={{ fontSize: 34 }}>🧑‍🎓</Text>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>У вас пока нет учеников</Text>
        <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
          Добавьте ученика по коду или имени пользователя — и колоду можно будет отправить.
        </Text>
        {onEmptyAction && (
          <TouchableOpacity
            onPress={onEmptyAction.onPress}
            style={{ marginTop: 4, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>{onEmptyAction.label}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View>
      {!!hint && (
        <Text style={{ fontSize: 13, lineHeight: 18, color: colors.mutedForeground, marginBottom: 12 }}>{hint}</Text>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: colors.foreground }}>
          {selectedIds.length > 0 ? `Выбрано: ${selectedIds.length}` : "Ученики"}
        </Text>
        <TouchableOpacity
          onPress={() => onChangeSelected(allSelected ? [] : students.map((s) => s.id))}
          style={{ padding: 4 }}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>
            {allSelected ? "Снять всех" : "Выбрать всех"}
          </Text>
        </TouchableOpacity>
      </View>

      {students.map((s) => {
        const on = selected.has(s.id);
        const wasAssigned = assigned.has(s.id);
        return (
          <TouchableOpacity
            key={s.id}
            onPress={() => toggle(s.id)}
            activeOpacity={0.7}
            style={{
              flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 8,
              backgroundColor: colors.card, borderRadius: 14, padding: 12,
              borderWidth: on ? 2 : 1, borderColor: on ? colors.primary : colors.border,
            }}
          >
            <View style={{
              width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center",
              borderColor: on ? colors.primary : colors.border,
              backgroundColor: on ? colors.primary : "transparent",
            }}>
              {on && <Feather name="check" size={14} color="#fff" />}
            </View>

            <View style={{
              width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
              backgroundColor: s.avatarColor ?? colors.muted,
            }}>
              <Text style={{ fontSize: 17 }}>{s.avatarEmoji ?? "🙂"}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>
                {formatStudentName({ username: s.username ?? String(s.id), name: s.name, surname: s.surname }, "teacher")}
              </Text>
              {wasAssigned && (
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.success, marginTop: 1 }}>
                  колода уже отправлена
                </Text>
              )}
            </View>

            {s.isOnline && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
