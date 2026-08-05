// ─────────────────────────────────────────────────────────────────────────────
// Блок «О себе»: короткий рассказ и темы, которые интересны ученику.
//
// Зачем темы: по ним учитель понимает, на чём строить занятие («Футбол» —
// значит и слова, и тексты будут про футбол), а ученику приятно видеть в
// профиле что-то своё, а не только цифры прогресса.
//
// Как открывается выбор: нажатием на сам блок тем — отдельной кнопки
// «+ интерес» нет. Кнопка занимала место в ряду меток и ломала выравнивание:
// метки должны заполнять ширину карточки, а пунктирный «плюс» всегда оставался
// висеть хвостом в конце строки.
//
// Тем максимум пять. Это не техническое ограничение, а смысловое: пять тем
// ещё можно учесть при подготовке занятия, а список из десяти означает
// «мне интересно всё» и не говорит учителю ничего.
//
// Хранится в users.interests (jsonb), меняется через PUT /users/:id/interests.
// Сохраняем сразу при выборе: отдельная кнопка «Сохранить» для галочек —
// лишний шаг, а список маленький и восстановить его недолго.
//
// ── Каждая тема своим цветом ────────────────────────────────────────────────
// Раньше все метки были одного бледно-фиолетового тона, и четыре темы подряд
// читались как одна длинная полоса текста: чтобы понять, где кончается «Игры»
// и начинается «Рисование», приходилось всматриваться в промежутки. Цвет — это
// граница, которую видно раньше, чем прочитано слово.
//
// Цвет привязан к НАЗВАНИЮ темы (hueFor), а не к позиции в списке: «Футбол»
// всегда зелёный, и в своём профиле, и в чужом. Соседям при совпадении
// подбирается следующий свободный тон — иначе два одинаковых пятна рядом
// выглядят как ошибка, ради которой цвет и вводился.
//
// Оттенки заданы одной базой на тему: заливка — база с прозрачностью, рамка
// плотнее, текст сплошной. Так метки остаются одной породы и не превращаются в
// набор случайных наклеек.
//
// ── Объём ───────────────────────────────────────────────────────────────────
// У карточки есть нижняя грань, как у остальных блоков профиля. Но она не
// проседает при нажатии: нажимается только область тем внизу, и делать
// «клавишей» всю карточку было бы обещанием, которого она не выполняет.
//
// Про заглушку на чужом профиле: пола в базе нет, поэтому текст нейтральный —
// «не рассказал(а)». Прежнее «не рассказал о себе» на профиле девочки читалось
// как ошибка приложения.
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

/** Высота нижней грани. Совпадает с остальными карточками профиля. */
const EDGE = 6;

/**
 * Готовые темы. Список намеренно про жизнь ребёнка, а не про грамматику:
 * это ответ на вопрос «что тебе интересно», а не «что ты изучаешь».
 */
export const INTEREST_PRESETS = [
  "Игры", "Футбол", "Кино", "Музыка", "Аниме", "Книги",
  "Животные", "Космос", "Рисование", "Танцы", "Программирование", "Наука",
  "Путешествия", "Спорт", "Кулинария", "Мода", "Машины", "Природа",
];

/** Больше пяти тем перестают что-либо говорить о человеке. */
export const MAX_INTERESTS = 5;

/**
 * Палитра меток: восемь баз разного тона, но одной насыщенности — рядом они
 * читаются как один набор, а не как случайные наклейки. Восьми хватает с
 * запасом: тем не больше пяти, поэтому повторов в одном профиле не бывает.
 */
const INTEREST_BASES = [
  "#7c3aed", // фиолетовый
  "#2563eb", // синий
  "#0e9f6e", // зелёный
  "#e11d48", // алый
  "#d97706", // оранжевый
  "#0891b2", // бирюзовый
  "#c026d3", // маджента
  "#4f46e5", // индиго
];

/** Устойчивый номер тона по названию темы: одна тема — всегда один цвет. */
function hueIndex(topic: string): number {
  let h = 0;
  const key = topic.trim().toLowerCase();
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 100003;
  return h % INTEREST_BASES.length;
}

/**
 * Цвета для всего списка сразу.
 *
 * Цвет берётся от названия, но если тон уже занят другой темой из этого же
 * списка, берётся следующий свободный: два одинаковых пятна рядом сводят на
 * нет всю затею с различением.
 */
function hueMap(topics: string[]): Record<string, string> {
  const used = new Set<number>();
  const out: Record<string, string> = {};
  for (const topic of topics) {
    let idx = hueIndex(topic);
    let guard = 0;
    while (used.has(idx) && guard < INTEREST_BASES.length) {
      idx = (idx + 1) % INTEREST_BASES.length;
      guard++;
    }
    used.add(idx);
    out[topic] = INTEREST_BASES[idx] as string;
  }
  return out;
}

export interface AboutCardProps {
  bio: string;
  onSaveBio: (value: string) => void;
  interests: string[];
  onSaveInterests: (value: string[]) => void;
  /** Чужой профиль — только просмотр: ни правки текста, ни выбора тем. */
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
  // Сообщение под полем своей темы: «уже добавлена» или «больше пяти нельзя».
  const [hint, setHint] = useState("");

  const has = (topic: string) =>
    interests.some((i) => i.toLowerCase() === topic.toLowerCase());

  const full = interests.length >= MAX_INTERESTS;

  // Цвета выбранных тем. Пересчитываются только при смене списка.
  const hues = React.useMemo(() => hueMap(interests), [interests]);

  const toggle = (topic: string) => {
    setHint("");
    if (has(topic)) {
      onSaveInterests(interests.filter((i) => i.toLowerCase() !== topic.toLowerCase()));
      return;
    }
    if (full) {
      setHint(`Можно выбрать не больше ${MAX_INTERESTS} тем. Убери одну, чтобы добавить новую.`);
      return;
    }
    onSaveInterests([...interests, topic]);
  };

  const addCustom = () => {
    const value = custom.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!value) return;

    // Повтор — самая частая ошибка: тему уже выбрали галочкой выше и не
    // заметили. Молча ничего не делать нельзя, иначе выглядит как поломка.
    if (has(value)) {
      setHint(`Тема «${value}» уже добавлена`);
      return;
    }
    if (full) {
      setHint(`Можно выбрать не больше ${MAX_INTERESTS} тем. Убери одну, чтобы добавить новую.`);
      return;
    }

    onSaveInterests([...interests, value]);
    setCustom("");
    setHint("");
  };

  const s = StyleSheet.create({
    wrap: { marginHorizontal: 20, marginBottom: 14, paddingBottom: EDGE },
    edge: {
      position: "absolute", left: 0, right: 0, top: EDGE, bottom: 0,
      borderRadius: radii.md, backgroundColor: "#c9bdf0",
    },
    card: {
      backgroundColor: colors.card, borderRadius: radii.md, padding: 15,
      borderWidth: 1, borderColor: colors.border,
      shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16, shadowRadius: 15, elevation: 4,
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
    // Весь блок — одна кнопка: нажатие в любом месте открывает выбор тем.
    tagsArea: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
    tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    // flexGrow растягивает метки по строке, поэтому ряд всегда заканчивается
    // ровно у края карточки, а не рваным хвостом. Цвет задаётся на месте: он
    // свой у каждой темы.
    tag: {
      flexGrow: 1, minWidth: 84,
      alignItems: "center", justifyContent: "center",
      paddingHorizontal: 11, paddingVertical: 8, borderRadius: radii.pill,
      borderWidth: 1,
    },
    tagText: { fontSize: 12.5, fontWeight: "800" },
    emptyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    emptyText: { flex: 1, fontSize: 13, color: colors.mutedForeground },

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
    // Когда набрано пять тем, невыбранные гаснут: видно, что добавить нельзя.
    chipOff: { opacity: 0.45 },
    chipText: { fontSize: 13, fontWeight: "800", color: colors.foreground },

    customRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
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
    customBtnOff: { backgroundColor: colors.muted },
    hintRow: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: accents.amber + "1f", borderRadius: radii.sm,
      paddingHorizontal: 11, paddingVertical: 9, marginBottom: 12,
    },
    hintText: { flex: 1, fontSize: 12, fontWeight: "700", color: "#8a5a00", lineHeight: 16 },
    counter: { fontSize: 11.5, color: colors.mutedForeground, marginBottom: 14 },
  });

  return (
    <>
      <View style={s.wrap}>
        <View style={s.edge} />
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
              {bio || (readOnly
                ? "Пока ничего о себе не рассказал(а)"
                : "Нажми на карандаш, чтобы добавить описание")}
            </Text>
          )}

          {(interests.length > 0 || !readOnly) && (
            <Pressable
              style={s.tagsArea}
              onPress={readOnly ? undefined : () => { setHint(""); setPicker(true); }}
              disabled={readOnly}
            >
              {interests.length > 0 ? (
                <View style={s.tagsRow}>
                  {interests.map((topic) => {
                    // Один базовый цвет на метку: заливка прозрачная, рамка
                    // плотнее, текст сплошной.
                    const base = hues[topic] ?? INTEREST_BASES[0] as string;
                    return (
                      <View
                        key={topic}
                        style={[s.tag, { backgroundColor: base + "1a", borderColor: base + "4d" }]}
                      >
                        <Text style={[s.tagText, { color: base }]} numberOfLines={1}>{topic}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={s.emptyRow}>
                  <Glyph name="spark" size={15} color={colors.primary} />
                  <Text style={s.emptyText}>Выбери темы, которые тебе интересны</Text>
                  <Glyph name="chevron" size={15} color={colors.mutedForeground} />
                </View>
              )}
            </Pressable>
          )}
        </View>
      </View>

      <Modal visible={picker} transparent animationType="slide" onRequestClose={() => setPicker(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={s.overlay} onPress={() => setPicker(false)}>
            <Pressable style={s.sheet} onPress={() => {}}>
              <View style={s.handle} />
              <Text style={s.sheetTitle}>Что тебе интересно</Text>
              <Text style={s.sheetSub}>
                Учитель подберёт задания и слова по этим темам. Можно выбрать до {MAX_INTERESTS} тем
                или дописать свою.
              </Text>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.grid}>
                  {INTEREST_PRESETS.map((topic) => {
                    const on = has(topic);
                    // Выбранная тема сразу показывает свой цвет — тот же, что
                    // будет у метки в профиле.
                    const base = on ? (hues[topic] ?? INTEREST_BASES[0] as string) : null;
                    return (
                      <Pressable
                        key={topic}
                        style={[
                          s.chip,
                          base ? { backgroundColor: base + "1f", borderColor: base } : null,
                          !on && full && s.chipOff,
                        ]}
                        onPress={() => toggle(topic)}
                      >
                        {!!base && <Glyph name="check" size={12} color={base} />}
                        <Text style={[s.chipText, base ? { color: base } : null]}>{topic}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Свои темы: «Майнкрафт» и «шахматы» в готовый список не впихнуть. */}
                <View style={s.customRow}>
                  <TextInput
                    style={s.customInput}
                    value={custom}
                    onChangeText={(v) => { setCustom(v); if (hint) setHint(""); }}
                    placeholder="Своя тема"
                    placeholderTextColor={colors.mutedForeground}
                    maxLength={24}
                    onSubmitEditing={addCustom}
                    returnKeyType="done"
                  />
                  <Pressable
                    style={[s.customBtn, full && s.customBtnOff]}
                    onPress={addCustom}
                  >
                    <Glyph name="plus" size={18} color={full ? colors.mutedForeground : "#fff"} />
                  </Pressable>
                </View>

                {!!hint && (
                  <View style={s.hintRow}>
                    <Glyph name="alert" size={14} color="#8a5a00" />
                    <Text style={s.hintText}>{hint}</Text>
                  </View>
                )}

                <Text style={s.counter}>
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
