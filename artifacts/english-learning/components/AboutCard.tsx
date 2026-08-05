// ─────────────────────────────────────────────────────────────────────────────
// Блок «О себе»: короткий рассказ и темы, которые интересны ученику.
//
// Зачем темы: по ним учитель понимает, на чём строить занятие («Футбол» —
// значит и слова, и тексты будут про футбол), а ученику приятно видеть в
// профиле что-то своё, а не только цифры прогресса.
//
// Раньше в макете темы были, а в приложении их не было вообще: нажать было
// некуда. Теперь метки стоят прямо под текстом, а «+ интерес» открывает окно
// с готовым набором и полем для своей темы.
//
// Хранится в users.interests (jsonb), меняется через PUT /users/:id/interests.
// Сохраняем сразу при выборе: отдельная кнопка «Сохранить» для галочек —
// лишний шаг, а список маленький и восстановить его недолго.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, TouchableOpacity, Modal,
  ScrollView, StyleSheet, KeyboardAvoidingView, Platform,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, SectionLabel } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";

/**
 * Готовые темы. Список намеренно про жизнь ребёнка, а не про грамматику:
 * это ответ на вопрос «что тебе интересно», а не «что ты изучаешь».
 */
export const INTEREST_PRESETS = [
  "Игры", "Футбол", "Кино", "Музыка", "Аниме", "Книги",
  "Животные", "Космос", "Рисование", "Танцы", "Программирование", "Наука",
  "Путешествия", "Спорт", "Кулинария", "Мода", "Машины", "Природа",
];

const MAX_INTERESTS = 10;

export interface AboutCardProps {
  bio: string;
  onSaveBio: (value: string) => void;
  interests: string[];
  onSaveInterests: (value: string[]) => void;
  /** Чужой профиль — только просмотр, без карандаша и кнопки «+ интерес». */
  readOnly?: boolean;
}

export function AboutCard({
  bio, onSaveBio, interests, onSaveInterests, readOnly,
}: AboutCardProps) {
  const colors = useColors();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bio);
  const [picker, setPicker] = useState(false);
  const [custom, setCustom] = useState("");

  const toggle = (topic: string) => {
    const has = interests.some((i) => i.toLowerCase() === topic.toLowerCase());
    if (has) {
      onSaveInterests(interests.filter((i) => i.toLowerCase() !== topic.toLowerCase()));
      return;
    }
    if (interests.length >= MAX_INTERESTS) return;
    onSaveInterests([...interests, topic]);
  };

  const addCustom = () => {
    const value = custom.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!value) return;
    if (!interests.some((i) => i.toLowerCase() === value.toLowerCase())) toggle(value);
    setCustom("");
  };

  const s = StyleSheet.create({
    card: {
      backgroundColor: colors.card, borderRadius: radii.md, padding: 15,
      borderWidth: 1, borderColor: colors.border,
      marginHorizontal: 20, marginBottom: 14,
      shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.13, shadowRadius: 14, elevation: 3,
    },
    head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
    text: { fontSize: 14.5, color: colors.foreground, lineHeight: 21 },
    placeholder: { fontSize: 14, color: colors.mutedForeground, fontStyle: "italic" },
    input: { fontSize: 14.5, color: colors.foreground, lineHeight: 21, minHeight: 60 },
    actions: { flexDirection: "row", gap: 8, marginTop: 8, justifyContent: "flex-end" },
    saveBtn: { backgroundColor: colors.primary, borderRadius: 9, paddingHorizontal: 15, paddingVertical: 7 },
    saveText: { fontSize: 13, fontWeight: "800", color: "#fff" },
    cancelBtn: { paddingHorizontal: 14, paddingVertical: 7 },
    cancelText: { fontSize: 13, color: colors.mutedForeground },

    // ── Метки интересов ──
    tags: {
      flexDirection: "row", flexWrap: "wrap", gap: 7,
      marginTop: 12, paddingTop: 12,
      borderTopWidth: 1, borderTopColor: colors.border,
    },
    tag: {
      flexDirection: "row", alignItems: "center", gap: 5,
      paddingHorizontal: 11, paddingVertical: 6, borderRadius: radii.pill,
      backgroundColor: colors.primary + "14",
      borderWidth: 1, borderColor: colors.primary + "33",
    },
    tagText: { fontSize: 12.5, fontWeight: "800", color: colors.primary },
    // Пунктирная рамка = «сюда можно добавить», как в макете.
    addTag: {
      flexDirection: "row", alignItems: "center", gap: 5,
      paddingHorizontal: 11, paddingVertical: 6, borderRadius: radii.pill,
      borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.primary + "66",
    },
    addText: { fontSize: 12.5, fontWeight: "800", color: colors.primary },

    // ── Окно выбора ──
    overlay: { flex: 1, backgroundColor: "#00000070", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
      paddingTop: 12, paddingHorizontal: 20, paddingBottom: 28, maxHeight: "82%",
    },
    handle: {
      width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
      alignSelf: "center", marginBottom: 16,
    },
    sheetTitle: { fontSize: 19, fontWeight: "900", color: colors.foreground, letterSpacing: -0.4 },
    sheetSub: {
      fontSize: 12.5, fontWeight: "600", color: colors.mutedForeground,
      marginTop: 5, marginBottom: 16, lineHeight: 18,
    },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
    chip: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 13, paddingVertical: 9, borderRadius: radii.pill,
      backgroundColor: colors.muted, borderWidth: 2, borderColor: "transparent",
    },
    chipOn: { backgroundColor: colors.primary + "18", borderColor: colors.primary },
    chipText: { fontSize: 13, fontWeight: "800", color: colors.foreground },
    chipTextOn: { color: colors.primary },

    customRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
    customInput: {
      flex: 1, backgroundColor: colors.muted, borderRadius: radii.sm,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 14, color: colors.foreground,
      borderWidth: 1.5, borderColor: colors.border,
    },
    customBtn: {
      paddingHorizontal: 16, borderRadius: radii.sm,
      alignItems: "center", justifyContent: "center",
      backgroundColor: colors.primary,
    },
    limit: { fontSize: 11.5, color: colors.mutedForeground, marginBottom: 14 },
  });

  const selected = (topic: string) =>
    interests.some((i) => i.toLowerCase() === topic.toLowerCase());

  return (
    <>
      <View style={s.card}>
        <View style={s.head}>
          <SectionLabel style={{ marginBottom: 0 }}>О себе</SectionLabel>
          {!editing && !readOnly && (
            <Pressable onPress={() => { setDraft(bio); setEditing(true); }} hitSlop={10}>
              <Glyph name="pen" size={14} color={colors.primary} />
            </Pressable>
          )}
        </View>

        {editing ? (
          <>
            <TextInput
              style={s.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Расскажи о себе..."
              placeholderTextColor={colors.mutedForeground}
              multiline
              autoFocus
            />
            <View style={s.actions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setEditing(false)}>
                <Text style={s.cancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.saveBtn}
                onPress={() => { onSaveBio(draft); setEditing(false); }}
              >
                <Text style={s.saveText}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <Text style={bio ? s.text : s.placeholder}>
            {bio || (readOnly ? "Пока ничего не рассказал о себе" : "Нажми на карандаш, чтобы добавить описание")}
          </Text>
        )}

        {/* Метки показываем всегда, когда есть что показать; кнопка добавления —
            только в своём профиле. */}
        {(interests.length > 0 || !readOnly) && (
          <View style={s.tags}>
            {interests.map((topic) => (
              <Pressable
                key={topic}
                style={s.tag}
                onPress={readOnly ? undefined : () => toggle(topic)}
              >
                <Text style={s.tagText}>{topic}</Text>
                {!readOnly && <Glyph name="close" size={11} color={colors.primary} />}
              </Pressable>
            ))}

            {!readOnly && interests.length < MAX_INTERESTS && (
              <Pressable style={s.addTag} onPress={() => setPicker(true)}>
                <Glyph name="plus" size={12} color={colors.primary} />
                <Text style={s.addText}>интерес</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      <Modal visible={picker} transparent animationType="slide" onRequestClose={() => setPicker(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={s.overlay} onPress={() => setPicker(false)}>
            <Pressable style={s.sheet} onPress={() => {}}>
              <View style={s.handle} />
              <Text style={s.sheetTitle}>Что тебе интересно</Text>
              <Text style={s.sheetSub}>
                Учитель подберёт задания и слова по этим темам. Можно выбрать несколько
                или дописать свою.
              </Text>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.grid}>
                  {INTEREST_PRESETS.map((topic) => {
                    const on = selected(topic);
                    return (
                      <Pressable
                        key={topic}
                        style={[s.chip, on && s.chipOn]}
                        onPress={() => toggle(topic)}
                      >
                        {on && <Glyph name="check" size={12} color={colors.primary} />}
                        <Text style={[s.chipText, on && s.chipTextOn]}>{topic}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Свои темы: «Майнкрафт» и «шахматы» в готовый список не впихнуть. */}
                <View style={s.customRow}>
                  <TextInput
                    style={s.customInput}
                    value={custom}
                    onChangeText={setCustom}
                    placeholder="Своя тема"
                    placeholderTextColor={colors.mutedForeground}
                    maxLength={24}
                    onSubmitEditing={addCustom}
                    returnKeyType="done"
                  />
                  <Pressable style={s.customBtn} onPress={addCustom}>
                    <Glyph name="plus" size={18} color="#fff" />
                  </Pressable>
                </View>

                <Text style={s.limit}>
                  Выбрано {interests.length} из {MAX_INTERESTS}
                </Text>
              </ScrollView>

              <ChunkyButton label="Готово" icon="check" onPress={() => setPicker(false)} />
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

export default AboutCard;
