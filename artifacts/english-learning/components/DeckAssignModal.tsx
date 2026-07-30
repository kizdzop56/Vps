// Шторка «кому выдать колоду»: мультивыбор учеников + сохранение одним запросом.
//
// Раньше выдать колоду можно было только по одному ученику из его карточки: на
// группу из десяти человек — десять переходов. Здесь учитель отмечает всех сразу,
// а PUT /api/flashcards/decks/:id/assignees сам добавляет новых и снимает лишних.
//
// Компонент общий для вкладки «Колоды» и страницы конкретной колоды.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator, TextInput,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import authStorage from "@/utils/authStorage";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { fc } from "@/hooks/useFlashcards";

const BASE = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

export type AssignableStudent = {
  id: number;
  name: string;
  surname?: string | null;
  username: string;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarUrl?: string | null;
};

export async function fetchTeacherStudents(): Promise<AssignableStudent[]> {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE}/api/connections/teacher/students`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token ?? ""}` },
  });
  if (res.status === 204) return [];
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Ошибка ${res.status}`);
  return data as AssignableStudent[];
}

/** Минимум, который нужен шторке от колоды. */
export type AssignableDeck = { id: number; title: string; emoji?: string | null };

export function DeckAssignModal({
  visible, deck, onClose,
}: {
  visible: boolean;
  deck: AssignableDeck | null;
  /** changed = true, если состав выдачи действительно изменился. */
  onClose: (changed: boolean) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [initial, setInitial] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const studentsQ = useQuery({
    queryKey: ["teacher-students-assign"],
    queryFn: fetchTeacherStudents,
    enabled: visible,
    staleTime: 60_000,
  });

  const assigneesQ = useQuery({
    queryKey: ["deck-assignees", deck?.id],
    queryFn: () => fc.getAssignees(deck!.id),
    enabled: visible && !!deck,
    staleTime: 0,
  });

  // Текущий состав подставляем один раз на открытие: иначе повторный ответ
  // сервера затирал бы галочки, которые учитель уже успел поставить.
  const loadedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!visible) {
      loadedFor.current = null;
      setSearch("");
      setError(null);
      return;
    }
    if (!deck || !assigneesQ.data) return;
    if (loadedFor.current === deck.id) return;
    loadedFor.current = deck.id;
    setSelected(new Set(assigneesQ.data));
    setInitial(new Set(assigneesQ.data));
  }, [visible, deck, assigneesQ.data]);

  const students = studentsQ.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      [s.username, s.name, s.surname].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [students, search]);

  const dirty = useMemo(() => {
    if (selected.size !== initial.size) return true;
    for (const id of selected) if (!initial.has(id)) return true;
    return false;
  }, [selected, initial]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!deck) return;
    setSaving(true);
    setError(null);
    try {
      await fc.setAssignees(deck.id, [...selected]);
      onClose(true);
    } catch (e: any) {
      setError(e?.message ?? "Не удалось сохранить.");
    } finally {
      setSaving(false);
    }
  };

  const loading = studentsQ.isLoading || assigneesQ.isLoading;
  const allSelected = students.length > 0 && selected.size === students.length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => onClose(false)}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: colors.background,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingHorizontal: 20, paddingTop: 16,
          paddingBottom: Math.max(insets.bottom, 16) + 8,
          maxHeight: "85%",
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
            <Text style={{ flex: 1, fontSize: 18, fontWeight: "800", color: colors.foreground }}>
              Кому выдать колоду
            </Text>
            <TouchableOpacity onPress={() => onClose(false)} style={{ padding: 6 }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 14 }} numberOfLines={1}>
            {deck?.emoji ?? "📘"} {deck?.title}
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} size="large" style={{ marginVertical: 40 }} />
          ) : students.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 30, gap: 10 }}>
              <Text style={{ fontSize: 40 }}>👨‍🎓</Text>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>Учеников пока нет</Text>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
                Добавьте учеников на вкладке «Ученики» — после этого колоду можно будет выдать.
              </Text>
            </View>
          ) : (
            <>
              {students.length > 6 ? (
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 8,
                  backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                  borderRadius: 12, paddingHorizontal: 12, marginBottom: 12,
                }}>
                  <Feather name="search" size={15} color={colors.mutedForeground} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Поиск ученика"
                    placeholderTextColor={colors.mutedForeground}
                    style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: colors.foreground }}
                  />
                </View>
              ) : null}

              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 12, color: colors.mutedForeground }}>
                  Выбрано: {selected.size} из {students.length}
                </Text>
                <TouchableOpacity
                  onPress={() => setSelected(allSelected ? new Set() : new Set(students.map((s) => s.id)))}
                  style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>
                    {allSelected ? "Снять всех" : "Выбрать всех"}
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                {filtered.map((s) => {
                  const on = selected.has(s.id);
                  const full = [s.name, s.surname].filter(Boolean).join(" ");
                  return (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => toggle(s.id)}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 12,
                        backgroundColor: on ? colors.primary + "12" : colors.card,
                        borderRadius: 14, padding: 12, marginBottom: 8,
                        borderWidth: 1, borderColor: on ? colors.primary : colors.border,
                      }}
                    >
                      <AnimatedAvatar
                        size={36}
                        avatarColor={s.avatarColor ?? "#6366f1"}
                        avatarEmoji={s.avatarEmoji}
                        avatarUrl={s.avatarUrl}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>
                          {s.username}
                        </Text>
                        {full ? (
                          <Text style={{ fontSize: 11.5, color: colors.mutedForeground }} numberOfLines={1}>{full}</Text>
                        ) : null}
                      </View>
                      <View style={{
                        width: 24, height: 24, borderRadius: 7,
                        alignItems: "center", justifyContent: "center",
                        backgroundColor: on ? colors.primary : "transparent",
                        borderWidth: on ? 0 : 2, borderColor: colors.border,
                      }}>
                        {on ? <Feather name="check" size={15} color="#fff" /> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {filtered.length === 0 ? (
                  <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center", paddingVertical: 20 }}>
                    Никого не найдено.
                  </Text>
                ) : null}
              </ScrollView>

              {error ? (
                <Text style={{ fontSize: 12.5, color: colors.destructive, marginTop: 10 }}>{error}</Text>
              ) : null}

              <TouchableOpacity
                onPress={save}
                disabled={saving || !dirty}
                activeOpacity={0.85}
                style={{
                  marginTop: 14, borderRadius: 14, paddingVertical: 14, alignItems: "center",
                  backgroundColor: dirty ? colors.primary : colors.border,
                }}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
                      {dirty ? "Сохранить" : "Изменений нет"}
                    </Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
