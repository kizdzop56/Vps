// Создание задания или колоды слов (учитель).
//
// Эмодзи в интерфейсе не используются: значки — глифы из своего набора.
// ВАЖНО про иконку колоды: пользователь выбирает глиф, но в базу уходит
// эмодзи-символ (см. ICON_CHOICES). Так схема БД и API остаются нетронутыми,
// старые колоды продолжают работать, а обратно эмодзи превращается в глиф
// через DeckGlyph — символ ОС на экране не появляется. Тот же приём, что на
// экране flashcards/new-deck.
//
// Выбор типа задания использует те же иллюстрированные значки (TypeArt), что и
// список заданий: учитель выбирает ровно ту картинку, которую потом увидит на
// карточке и увидит ученик. Раньше здесь были мелкие линейные глифы в чипах —
// пять почти одинаковых кнопок, различимых только по подписи.
//
// Наклоны убраны по всему экрану — как на остальных вкладках.
import React, { useState, useRef, useCallback } from "react";
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, Pressable, ActivityIndicator, Platform, Switch, Image,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import authStorage from "@/utils/authStorage";
import { useQueryClient } from "@tanstack/react-query";
import { fc } from "@/hooks/useFlashcards";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { TypeArt } from "@/components/ui/TypeArt";
import { ChunkyButton, SectionLabel } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import { DUE_PRESETS, type DuePresetKey } from "@/utils/dueDate";

const BASE = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string, options?: RequestInit) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Ошибка сервера (${res.status})`);
  return data;
}

// Типы задания. Цвета совпадают с экранами «Задания», «Анализ» и «История»:
// один и тот же тип везде одного цвета. Рисунок берётся из TypeArt — того же
// компонента, что рисует значок в списке заданий.
const TYPES = [
  { key: "text_test", label: "Тест",            hint: "Вопросы с проверкой",     color: "#8b5cf6" },
  { key: "audio",     label: "Аудирование",     hint: "Слушать и отвечать",      color: "#6366f1" },
  { key: "reading",   label: "Чтение",          hint: "Текст и вопросы",         color: "#d946ef" },
  { key: "video",     label: "Видео",           hint: "Смотреть и отвечать",     color: "#ec4899" },
  { key: "free_form", label: "Свободный ответ", hint: "Проверяете вручную",      color: "#f59e0b" },
] as const;
type AssignmentType = typeof TYPES[number]["key"];

// Что создаёт учитель: обычное задание или колоду слов. Колода после создания
// доступна ученикам в разделе «Слова» (у ученика — только там, не в заданиях).
type CreateMode = "assignment" | "deck";

/**
 * Варианты иконки колоды: что показываем (glyph) и что при этом храним (value).
 * Список совпадает с flashcards/new-deck, поэтому колода выглядит одинаково,
 * из какого бы экрана её ни создали. Каждое value обязано присутствовать в
 * карте EMOJI_TO_GLYPH внутри DeckGlyph.
 */
const DECK_ICONS: { glyph: GlyphName; value: string; label: string }[] = [
  { glyph: "book",    value: "📘", label: "Учебник" },
  { glyph: "cards",   value: "📝", label: "Карточки" },
  { glyph: "bag",     value: "🎒", label: "Школа" },
  { glyph: "compass", value: "🧭", label: "Путешествия" },
  { glyph: "globe",   value: "🌍", label: "Мир" },
  { glyph: "cup",     value: "☕", label: "Еда и кафе" },
  { glyph: "leaf",    value: "🌱", label: "Природа" },
  { glyph: "paw",     value: "🐾", label: "Животные" },
  { glyph: "music",   value: "🎵", label: "Музыка" },
  { glyph: "target",  value: "🎯", label: "Цель" },
];

type QuestionFormat = "open" | "choice";
type QuestionDraft = {
  text: string;
  format: QuestionFormat;
  correctAnswer: string;
  options: string[];
  correctIndex: number;
};

const DEFAULT_QUESTION = (): QuestionDraft => ({
  text: "", format: "open", correctAnswer: "", options: ["", "", ""], correctIndex: 0,
});

const FRESH = () => ({
  type: "text_test" as AssignmentType,
  title: "", description: "",
  ageMin: "5", ageMax: "18",
  content: "",
  mediaUrl: "", mediaInputMode: "url" as "url" | "file", uploadedFileName: "",
  imageUrl: "", imageInputMode: "url" as "url" | "file", uploadedImageName: "",
  audioUrl: "", audioInputMode: "url" as "url" | "file", uploadedAudioName: "",
  videoUrl: "", videoInputMode: "url" as "url" | "file", uploadedVideoName: "",
  timerEnabled: false, timerMinutes: "30",
  // Срок сдачи по умолчанию. Уходит в задание как число дней и подставляется
  // в окно отправки — сам срок всё равно считается в момент отправки.
  duePreset: "none" as DuePresetKey,
  questions: [DEFAULT_QUESTION()],
  formError: "", success: false,
});

export default function CreateAssignmentScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [st, setSt] = useState(FRESH());
  const [uploading, setUploading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<any>(null);
  const imageInputRef = useRef<any>(null);
  const audioInputRef = useRef<any>(null);
  const videoInputRef = useRef<any>(null);

  const qc = useQueryClient();

  // Режим экрана + состояние формы колоды (простая: название + иконка). Слова
  // добавляются уже на странице колоды после создания.
  const [mode, setMode] = useState<CreateMode>("assignment");
  const [deckTitle, setDeckTitle] = useState("");
  const [deckEmoji, setDeckEmoji] = useState(DECK_ICONS[0]!.value);
  const [deckSaving, setDeckSaving] = useState(false);
  const [deckError, setDeckError] = useState("");

  const set = <K extends keyof ReturnType<typeof FRESH>>(k: K, v: ReturnType<typeof FRESH>[K]) =>
    setSt(prev => ({ ...prev, [k]: v }));

  useFocusEffect(useCallback(() => {
    setSt(FRESH()); setUploading(null); setSaving(false);
    setMode("assignment"); setDeckTitle(""); setDeckEmoji(DECK_ICONS[0]!.value);
    setDeckSaving(false); setDeckError("");
  }, []));

  const { type, title, description, ageMin, ageMax, content,
    mediaUrl, mediaInputMode, uploadedFileName,
    imageUrl, imageInputMode, uploadedImageName,
    audioUrl, audioInputMode, uploadedAudioName,
    videoUrl, videoInputMode, uploadedVideoName,
    timerEnabled, timerMinutes, duePreset, questions, formError, success } = st;

  const activeType = TYPES.find((t) => t.key === type) ?? TYPES[0];
  const dueDays = DUE_PRESETS.find((p) => p.key === duePreset)?.days ?? null;

  // ── Question helpers ────────────────────────────────────────────────
  const addQuestion = () => setSt(p => ({ ...p, questions: [...p.questions, DEFAULT_QUESTION()] }));
  const removeQuestion = (i: number) => setSt(p => ({ ...p, questions: p.questions.filter((_, idx) => idx !== i) }));
  const updateQ = <K extends keyof QuestionDraft>(i: number, key: K, val: QuestionDraft[K]) =>
    setSt(p => ({ ...p, questions: p.questions.map((q, idx) => idx === i ? { ...q, [key]: val } : q) }));
  const updateOption = (qi: number, oi: number, val: string) =>
    setSt(p => ({ ...p, questions: p.questions.map((q, idx) =>
      idx === qi ? { ...q, options: q.options.map((o, j) => j === oi ? val : o) } : q) }));
  const addOption = (qi: number) =>
    setSt(p => ({ ...p, questions: p.questions.map((q, idx) =>
      idx === qi && q.options.length < 6 ? { ...q, options: [...q.options, ""] } : q) }));
  const removeOption = (qi: number, oi: number) =>
    setSt(p => ({ ...p, questions: p.questions.map((q, idx) => {
      if (idx !== qi || q.options.length <= 2) return q;
      const next = q.options.filter((_, j) => j !== oi);
      return { ...q, options: next, correctIndex: q.correctIndex >= next.length ? next.length - 1 : q.correctIndex };
    }) }));

  // ── Создание колоды ─────────────────────────────────────────────────
  // Переиспользуем тот же API, что и экран flashcards/new-deck. После создания
  // переходим на страницу колоды, где учитель добавляет слова и назначает её
  // ученикам — так колода появляется у ученика в разделе «Слова».
  const handleCreateDeck = async () => {
    setDeckError("");
    if (!deckTitle.trim()) { setDeckError("Введите название колоды"); return; }
    setDeckSaving(true);
    try {
      const deck = await fc.createDeck({ title: deckTitle.trim(), emoji: deckEmoji });
      // Кладём созданную колоду прямо в кэш: страница колоды покажет название,
      // иконку и форму добавления слов сразу. Раньше она ждала полный список
      // всех колод и до его прихода считала колоду ненайденной — учитель видел
      // заголовок «Колода» и не получал формы добавления слов.
      qc.setQueryData(["fc-deck", deck.id], {
        ...deck, wordCount: 0, learnedCount: 0, dueCount: 0, newCount: 0, canEdit: true,
      });
      qc.setQueryData(["fc-words", deck.id], []);
      qc.invalidateQueries({ queryKey: ["fc-decks"] });
      qc.invalidateQueries({ queryKey: ["fc-my-decks"] });
      router.replace(`/flashcards/deck/${deck.id}`);
    } catch (e: any) {
      setDeckError(e?.message ?? "Не удалось создать колоду");
      setDeckSaving(false);
    }
  };

  // ── File upload (GCS presigned URL — persistent, survives redeploy) ──
  const handleUpload = async (file: File, kind: "audio" | "video" | "image") => {
    setUploading(kind);
    set("formError" as any, "");
    try {
      const token = await authStorage.getItem("auth_token");

      // Step 1: request a presigned PUT URL from our server (tiny JSON — no proxy size limit).
      const presignedRes = await fetch(`${BASE}/api/storage/request-upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const presignedData = await presignedRes.json();
      if (!presignedRes.ok) throw new Error(presignedData.error ?? "Ошибка получения URL загрузки");

      const { uploadURL, objectPath } = presignedData as { uploadURL: string; objectPath: string };

      // Step 2: upload directly to object storage via the presigned URL
      // (bypasses our proxy entirely). When storage isn't configured the server
      // returns a RELATIVE url pointing at its own local-put endpoint — prefix
      // it with BASE so native builds (no page origin) work too.
      const uploadTarget = uploadURL.startsWith("http")
        ? uploadURL
        : `${BASE}${uploadURL}`;
      const uploadRes = await fetch(uploadTarget, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Ошибка загрузки файла на сервер");

      // Serving URL goes through our storage proxy (GET requests are not limited by proxy).
      // Append kind so viewers can detect video vs audio without relying on file extension.
      const serveUrl = `${BASE}/api/storage${objectPath}?kind=${kind}`;

      if (kind === "image") setSt(p => ({ ...p, imageUrl: serveUrl, uploadedImageName: file.name }));
      else if (kind === "audio") setSt(p => ({ ...p, audioUrl: serveUrl, uploadedAudioName: file.name }));
      else setSt(p => ({ ...p, videoUrl: serveUrl, uploadedVideoName: file.name }));
    } catch (e: any) {
      set("formError" as any, e.message);
    } finally {
      setUploading(null);
    }
  };

  // ── Submit ──────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    set("formError", "");
    if (!title.trim()) { set("formError", "Введите название задания"); return; }
    if (timerEnabled) {
      const mins = parseInt(timerMinutes, 10);
      if (isNaN(mins) || mins < 1 || mins > 360) { set("formError", "Таймер: введите 1–360 минут"); return; }
    }

    // ── Media validation by type ───────────────────────────────────────
    if (type === "video") {
      const hasVideoUrl = videoInputMode === "url" && videoUrl.trim() !== "";
      const hasVideoFile = videoInputMode === "file" && uploadedVideoName !== "";
      if (!hasVideoUrl && !hasVideoFile) {
        set("formError", "Для задания «Видео» необходимо прикрепить видео или ссылку на него");
        return;
      }
    }

    if (type === "audio") {
      const hasAudioUrl = audioInputMode === "url" && audioUrl.trim() !== "";
      const hasAudioFile = audioInputMode === "file" && uploadedAudioName !== "";
      if (!hasAudioUrl && !hasAudioFile) {
        set("formError", "Для задания «Аудирование» необходимо прикрепить аудио или ссылку на него");
        return;
      }
    }

    if (type === "reading" && !imageUrl.trim() && !videoUrl.trim() && !content.trim()) {
      set("formError", "Для задания «Чтение» необходимо добавить хотя бы одно: текст, изображение или видео");
      return;
    }

    // ── Question validation — every added question must be fully filled ─
    // (not applicable to free-form assignments — no questions/answer key)
    for (let i = 0; type !== "free_form" && i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) {
        set("formError", `Вопрос ${i + 1}: введите текст вопроса`);
        return;
      }
      if (q.format === "open") {
        if (!q.correctAnswer.trim()) {
          set("formError", `Вопрос ${i + 1}: введите правильный ответ`);
          return;
        }
      } else {
        const filledOptions = q.options.filter(o => o.trim());
        if (filledOptions.length < 2) {
          set("formError", `Вопрос ${i + 1}: заполните минимум 2 варианта ответа`);
          return;
        }
        if (!q.options[q.correctIndex]?.trim()) {
          set("formError", `Вопрос ${i + 1}: выберите правильный вариант из заполненных`);
          return;
        }
      }
    }

    const questionPayload = type === "free_form" ? [] : questions
      .filter(q => q.text.trim())
      .map((q, i) => {
        if (q.format === "choice") {
          const filled = q.options.filter(o => o.trim());
          if (filled.length < 2) return null;
          const filledCorrect = q.options[q.correctIndex]?.trim();
          const correctAns = filled.find(o => o.trim() === filledCorrect) ?? filled[0];
          return { text: q.text.trim(), options: filled, correctAnswer: correctAns.trim(), orderIndex: i };
        }
        return { text: q.text.trim(), options: [] as string[], correctAnswer: q.correctAnswer.trim(), orderIndex: i };
      })
      .filter(Boolean);

    // Determine mediaUrl for audio/video types
    const finalMediaUrl = type === "audio" ? (audioUrl.trim() || mediaUrl.trim() || undefined)
      : type === "video" ? (videoUrl.trim() || mediaUrl.trim() || undefined)
      : type === "free_form" ? (audioUrl.trim() || videoUrl.trim() || undefined)
      : type === "text_test" ? (videoUrl.trim() || undefined)
      : undefined;
    // For reading: optional supplementary audio/video
    const suppAudio = type === "reading" ? audioUrl.trim() || undefined : undefined;
    const suppVideo = type === "reading" ? videoUrl.trim() || undefined : undefined;
    const finalContent = type === "reading" ? content.trim() || undefined : undefined;

    setSaving(true);
    try {
      await apiFetch("/api/assignments", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          type,
          content: finalContent,
          mediaUrl: finalMediaUrl ?? suppAudio ?? suppVideo ?? undefined,
          imageUrl: imageUrl.trim() || undefined,
          questions: questionPayload,
          timeLimitMinutes: timerEnabled ? parseInt(timerMinutes, 10) : null,
          defaultDueDays: dueDays,
        }),
      });
      set("success", true);
      setTimeout(() => router.back(), 900);
    } catch (e: any) {
      set("formError", e?.message ?? "Не удалось создать задание");
    } finally {
      setSaving(false);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 8,
      flexDirection: "row", alignItems: "center", gap: 12,
    },
    backBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
    headerTitle: { fontSize: 22, fontWeight: "900", letterSpacing: -0.4, color: colors.foreground, flex: 1 },
    scroll: { paddingHorizontal: 20, paddingBottom: insets.bottom + 140 },
    section: { marginBottom: 20 },
    // Выбор типа: строки-карточки с крупным рисунком. Пять чипов с мелкими
    // глифами различались только подписью, и выбранный тип не читался.
    typeCard: {
      flexDirection: "row", alignItems: "center", gap: 13,
      paddingHorizontal: 13, paddingVertical: 11, borderRadius: radii.md,
      borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card,
      marginBottom: 9,
    },
    typeName: { fontSize: 15, fontWeight: "800", color: colors.foreground },
    typeHint: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
    // Переключатель «Задание / Колода» — крупные вкладки вверху экрана.
    modeRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
    modeBtn: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 8, paddingVertical: 13, borderRadius: radii.sm + 2,
      borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card,
    },
    modeBtnActive: {
      borderColor: colors.primary, backgroundColor: colors.primary + "12",
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25, shadowRadius: 9, elevation: 4,
    },
    modeBtnText: { fontSize: 15, fontWeight: "800", color: colors.mutedForeground },
    modeBtnTextActive: { color: colors.primary },
    iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
    iconBtn: {
      width: 48, height: 48, borderRadius: radii.sm, alignItems: "center", justifyContent: "center",
      borderWidth: 2,
    },
    label: { fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 6 },
    input: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radii.sm, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, color: colors.foreground, marginBottom: 12,
      ...(Platform.OS === "web" ? { outlineWidth: 0, outlineStyle: "none" } as any : {}),
    },
    textArea: { minHeight: 90, textAlignVertical: "top" },
    timerRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      backgroundColor: colors.card, borderRadius: radii.sm + 2, padding: 14,
      borderWidth: 1, borderColor: colors.border, marginBottom: 12,
    },
    timerInput: {
      backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.warning,
      borderRadius: radii.sm - 2, paddingHorizontal: 14, paddingVertical: 10,
      fontSize: 18, fontWeight: "900", color: colors.foreground,
      width: 80, textAlign: "center", fontVariant: ["tabular-nums"],
      ...(Platform.OS === "web" ? { outlineWidth: 0, outlineStyle: "none" } as any : {}),
    },
    // Пресеты срока сдачи — те же, что в окне отправки задания.
    duePreset: {
      paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.pill,
      borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card,
    },
    duePresetText: { fontSize: 13, fontWeight: "800", color: colors.mutedForeground },
    mediaToggle: { flexDirection: "row", gap: 8, marginBottom: 14 },
    mediaBtn: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 6, paddingVertical: 9, borderRadius: radii.sm - 2, borderWidth: 1.5,
    },
    mediaBtnText: { fontSize: 13, fontWeight: "700" },
    uploadArea: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 8, paddingVertical: 16, borderRadius: radii.sm,
      borderWidth: 1.5, borderStyle: "dashed",
    },
    uploadedRow: {
      flexDirection: "row", alignItems: "center", gap: 10,
      backgroundColor: colors.success + "12", borderWidth: 1, borderColor: colors.success + "44",
      borderRadius: radii.sm, padding: 12, marginBottom: 8,
    },
    imagePreview: {
      width: "100%", height: 160, borderRadius: radii.sm,
      backgroundColor: colors.muted, marginBottom: 8,
    },
    questionCard: {
      backgroundColor: colors.card, borderRadius: radii.md, padding: 14,
      borderWidth: 1, borderColor: colors.border, marginBottom: 12,
      shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1, shadowRadius: 12, elevation: 2,
    },
    questionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    questionNum: { fontSize: 13, fontWeight: "900", color: colors.primary, fontVariant: ["tabular-nums"] },
    formatRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
    formatBtn: {
      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 6, paddingVertical: 9, borderRadius: radii.sm - 2, borderWidth: 1.5,
    },
    formatBtnText: { fontSize: 13, fontWeight: "700" },
    optionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
    optionInput: {
      flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      borderRadius: radii.sm - 2, paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 14, color: colors.foreground,
      ...(Platform.OS === "web" ? { outlineWidth: 0, outlineStyle: "none" } as any : {}),
    },
    addOptBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 6, paddingVertical: 9, borderRadius: radii.sm - 2,
      borderWidth: 1.5, borderColor: colors.border, borderStyle: "dashed", marginBottom: 4,
    },
    addQBtn: {
      flexDirection: "row", alignItems: "center", gap: 7, justifyContent: "center",
      paddingVertical: 13, borderRadius: radii.sm,
      borderWidth: 1.5, borderColor: colors.border, borderStyle: "dashed",
    },
    errorBox: {
      backgroundColor: colors.destructive + "12", borderRadius: radii.sm, padding: 12, marginBottom: 12,
      borderWidth: 1, borderColor: colors.destructive + "44",
      flexDirection: "row", alignItems: "flex-start", gap: 9,
    },
    hintBox: {
      backgroundColor: colors.primary + "10", borderRadius: radii.sm + 2, padding: 14, marginBottom: 20,
      borderWidth: 1, borderColor: colors.primary + "33", flexDirection: "row", gap: 10,
    },
  });

  // ── Media sub-section helper ────────────────────────────────────────
  const renderMediaSection = (
    kind: "audio" | "video" | "image",
    urlVal: string, setUrl: (v: string) => void,
    modeVal: "url" | "file", setModeVal: (v: "url" | "file") => void,
    uploadedName: string, clearUploaded: () => void,
    inputRef: React.RefObject<any>,
    accentColor: string,
    glyphName: GlyphName,
    sectionLabel: string,
    urlPlaceholder: string,
    acceptMime: string,
  ) => (
    <View style={s.section}>
      <SectionLabel>{sectionLabel}</SectionLabel>
      <View style={s.mediaToggle}>
        {(["url", "file"] as const).map(m => {
          const active = modeVal === m;
          return (
            <TouchableOpacity key={m}
              activeOpacity={0.85}
              style={[s.mediaBtn, {
                borderColor: active ? accentColor : colors.border,
                backgroundColor: active ? accentColor + "12" : colors.card,
              }]}
              onPress={() => setModeVal(m)}
            >
              <Glyph name={m === "url" ? "link" : "upload"} size={14} color={active ? accentColor : colors.mutedForeground} />
              <Text style={[s.mediaBtnText, { color: active ? accentColor : colors.mutedForeground }]}>
                {m === "url" ? "По ссылке" : "Загрузить файл"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {modeVal === "url" ? (
        <TextInput
          style={s.input} value={urlVal} onChangeText={setUrl}
          placeholder={urlPlaceholder} placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none" keyboardType="url"
        />
      ) : (
        <>
          {uploadedName ? (
            <View style={s.uploadedRow}>
              <Glyph name="check" size={16} color={colors.success} />
              <Text style={{ flex: 1, fontSize: 13, color: colors.success, fontWeight: "700" }}>{uploadedName}</Text>
              <Pressable onPress={clearUploaded} hitSlop={8}>
                <Glyph name="close" size={16} color={colors.success} />
              </Pressable>
            </View>
          ) : null}

          {/* Image preview */}
          {kind === "image" && urlVal ? (
            <Image source={{ uri: urlVal }} style={s.imagePreview} resizeMode="cover" />
          ) : null}

          {Platform.OS === "web" ? (
            <>
              {/* @ts-ignore */}
              <input type="file" accept={acceptMime} id={`file-input-${kind}`} style={{ display: "none" }} ref={inputRef}
                onChange={(e: any) => { const f = e.target.files?.[0]; if (f) handleUpload(f, kind); }} />
              {uploading === kind ? (
                <View style={[s.uploadArea, { borderColor: accentColor, paddingVertical: 18 }]}>
                  <ActivityIndicator size="small" color={accentColor} />
                  <Text style={{ fontSize: 14, fontWeight: "700", color: accentColor }}>Загрузка…</Text>
                </View>
              ) : (
                // label triggers file picker natively — no .click() needed (bypasses browser security block)
                /* @ts-ignore */
                <label htmlFor={`file-input-${kind}`} style={{
                  display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center",
                  gap: 8, paddingTop: 18, paddingBottom: 18, borderRadius: 12,
                  border: `1.5px dashed ${accentColor}`, cursor: "pointer", backgroundColor: "transparent",
                }}>
                  <Glyph name={glyphName} size={20} color={accentColor} />
                  <Text style={{ fontSize: 14, fontWeight: "700", color: accentColor }}>Выбрать файл</Text>
                </label>
              )}
            </>
          ) : (
            <TextInput
              style={s.input} value={urlVal} onChangeText={setUrl}
              placeholder={urlPlaceholder} placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none" keyboardType="url"
            />
          )}
        </>
      )}
    </View>
  );

  if (success) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={8}>
            <View style={{ transform: [{ rotate: "180deg" }] }}>
              <Glyph name="chevron" size={22} color={colors.foreground} />
            </View>
          </Pressable>
          <Text style={s.headerTitle}>Создать задание</Text>
        </View>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16 }}>
          {/* Плашка стоит ровно: наклон убран вместе с остальными наклонами. */}
          <View style={{
            width: 76, height: 76, borderRadius: radii.xl,
            backgroundColor: colors.success + "18",
            justifyContent: "center", alignItems: "center",
            borderWidth: 2, borderColor: colors.success + "55",
            shadowColor: colors.success, shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.3, shadowRadius: 16, elevation: 6,
          }}>
            <Glyph name="check" size={36} color={colors.success} />
          </View>
          <Text style={{ fontSize: 21, fontWeight: "900", letterSpacing: -0.4, color: colors.foreground }}>Задание создано!</Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground }}>Возвращаемся к заданиям…</Text>
        </View>
      </View>
    );
  }

  if (user && !isTeacherOrAdmin(user.role)) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center", padding: 32 }]}>
        <Glyph name="lock" size={48} color={colors.mutedForeground} />
        <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, marginTop: 16, textAlign: "center" }}>
          Нет доступа
        </Text>
        <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 8, textAlign: "center" }}>
          Создавать задания могут только учителя
        </Text>
        <ChunkyButton
          label="Назад"
          onPress={() => router.back()}
          style={{ marginTop: 24, alignSelf: "stretch" }}
        />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        {/* Стрелка «назад» — тот же chevron, развёрнутый на 180°. */}
        <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={8} accessibilityLabel="Назад">
          <View style={{ transform: [{ rotate: "180deg" }] }}>
            <Glyph name="chevron" size={22} color={colors.foreground} />
          </View>
        </Pressable>
        <Text style={s.headerTitle}>{mode === "deck" ? "Создать колоду" : "Создать задание"}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Что создаём: задание или колода слов */}
        <View style={s.modeRow}>
          {([
            { key: "assignment" as CreateMode, label: "Задание", glyph: "book" as GlyphName },
            { key: "deck" as CreateMode, label: "Колода", glyph: "cards" as GlyphName },
          ]).map((m) => {
            const active = mode === m.key;
            return (
              <TouchableOpacity key={m.key}
                activeOpacity={0.85}
                style={[s.modeBtn, active && s.modeBtnActive]}
                onPress={() => setMode(m.key)}
              >
                <Glyph name={m.glyph} size={18} color={active ? colors.primary : colors.mutedForeground} />
                <Text style={[s.modeBtnText, active && s.modeBtnTextActive]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {mode === "deck" ? (
          // ── Форма колоды ──────────────────────────────────────────────
          <>
            <View style={s.hintBox}>
              <View style={{ marginTop: 1 }}>
                <Glyph name="compass" size={18} color={colors.primary} />
              </View>
              <Text style={{ fontSize: 13, color: colors.foreground, flex: 1, lineHeight: 19 }}>
                Создайте колоду и добавьте в неё слова. Затем назначьте её ученикам — она появится у них в разделе «Слова».
              </Text>
            </View>

            <View style={s.section}>
              <SectionLabel>Название колоды</SectionLabel>
              <TextInput
                style={s.input} value={deckTitle} onChangeText={setDeckTitle}
                placeholder="Например: Слова из урока 5" placeholderTextColor={colors.mutedForeground}
              />
            </View>

            <View style={s.section}>
              <SectionLabel>Иконка</SectionLabel>
              <View style={s.iconGrid}>
                {DECK_ICONS.map((ic) => {
                  const active = deckEmoji === ic.value;
                  return (
                    <TouchableOpacity
                      key={ic.value}
                      onPress={() => setDeckEmoji(ic.value)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={ic.label}
                      accessibilityState={{ selected: active }}
                      style={[s.iconBtn, {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary + "18" : colors.card,
                      }]}
                    >
                      <Glyph name={ic.glyph} size={22} color={active ? colors.primary : colors.mutedForeground} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {!!deckError && (
              <View style={s.errorBox}>
                <Glyph name="alert" size={16} color={colors.destructive} />
                <Text style={{ color: colors.destructive, fontSize: 14, fontWeight: "700", flex: 1 }}>{deckError}</Text>
              </View>
            )}

            {deckSaving ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <ChunkyButton label="Создать колоду" icon="check" onPress={handleCreateDeck} />
            )}
          </>
        ) : (
          // ── Форма задания ─────────────────────────────────────────────
          <>
        {/* Тип задания. Крупный рисунок вместо мелкого глифа: учитель видит
            ровно тот значок, который потом появится на карточке и у ученика. */}
        <View style={s.section}>
          <SectionLabel>Тип задания</SectionLabel>
          {TYPES.map((t) => {
            const active = type === t.key;
            return (
              <TouchableOpacity key={t.key}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  s.typeCard,
                  active && {
                    // Активный тип светится своим цветом: тест, аудирование и
                    // видео различаются раньше, чем прочитан текст.
                    borderColor: t.color,
                    backgroundColor: t.color + "0d",
                    shadowColor: t.color,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.28,
                    shadowRadius: 12,
                    elevation: 4,
                  },
                ]}
                onPress={() => set("type", t.key)}
              >
                <TypeArt type={t.key} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.typeName, active && { color: t.color }]}>{t.label}</Text>
                  <Text style={s.typeHint}>{t.hint}</Text>
                </View>
                {/* Радио справа: выбранная строка отмечена, а не просто
                    подсвечена — на цветном фоне это читается однозначно. */}
                <View style={{
                  width: 22, height: 22, borderRadius: 11, borderWidth: 2,
                  alignItems: "center", justifyContent: "center",
                  borderColor: active ? t.color : colors.border,
                  backgroundColor: active ? t.color : "transparent",
                }}>
                  {active && <Glyph name="check" size={12} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Основная информация */}
        <View style={s.section}>
          <SectionLabel>Основная информация</SectionLabel>
          <Text style={s.label}>Название</Text>
          <TextInput style={s.input} value={title} onChangeText={v => set("title", v)}
            placeholder="Например: Глаголы прошедшего времени" placeholderTextColor={colors.mutedForeground} />
          <Text style={s.label}>Описание</Text>
          <TextInput style={[s.input, s.textArea]} value={description} onChangeText={v => set("description", v)}
            placeholder="Краткое описание задания для ученика" placeholderTextColor={colors.mutedForeground} multiline />
        </View>

        {/* Срок сдачи по умолчанию.
            Отличается от таймера ниже: таймер ограничивает саму попытку
            (сколько минут на решение), а срок — когда задание должно быть
            сдано. По истечении срока задание закрывается само и уходит
            учителю как несданное. */}
        <View style={s.section}>
          <SectionLabel>Срок сдачи</SectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {DUE_PRESETS.map((preset) => {
              const active = duePreset === preset.key;
              return (
                <TouchableOpacity
                  key={preset.key}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => set("duePreset", preset.key)}
                  style={[s.duePreset, active && {
                    borderColor: colors.primary,
                    backgroundColor: colors.primary + "14",
                  }]}
                >
                  <Text style={[s.duePresetText, active && { color: colors.primary }]}>
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={[s.hintBox, { marginBottom: 0 }]}>
            <View style={{ marginTop: 1 }}>
              <Glyph name={dueDays === null ? "calendar" : "clock"} size={18} color={colors.primary} />
            </View>
            <Text style={{ fontSize: 13, color: colors.foreground, flex: 1, lineHeight: 19 }}>
              {dueDays === null
                ? "Без срока: задание будет висеть у ученика, пока он его не сдаст. Срок можно выбрать и позже, при отправке."
                : `Срок подставится при отправке: ${preset_label(duePreset)}. Если ученик не сдаст вовремя, задание закроется само и придёт вам с пометкой «не сдано в срок».`}
            </Text>
          </View>
        </View>

        {/* Таймер */}
        <View style={s.section}>
          <SectionLabel>Таймер на решение</SectionLabel>
          <View style={s.timerRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <View style={{
                width: 36, height: 36, borderRadius: radii.sm - 2,
                backgroundColor: colors.warning + "20",
                justifyContent: "center", alignItems: "center",
              }}>
                <Glyph name="clock" size={18} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>Ограничение по времени</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 1 }}>
                  {timerEnabled ? `${timerMinutes} мин на саму попытку` : "Без ограничения"}
                </Text>
              </View>
            </View>
            <Switch value={timerEnabled} onValueChange={v => set("timerEnabled", v)}
              trackColor={{ false: colors.border, true: colors.warning }} thumbColor="#fff" />
          </View>
          {timerEnabled && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10,
              backgroundColor: colors.card, borderRadius: radii.sm + 2, padding: 14,
              borderWidth: 1, borderColor: colors.warning + "40", marginBottom: 12 }}>
              <Glyph name="clock" size={16} color={colors.warning} />
              <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: "700" }}>Время:</Text>
              <TextInput style={s.timerInput} value={timerMinutes}
                onChangeText={v => set("timerMinutes", v.replace(/[^0-9]/g, ""))}
                keyboardType="numeric" maxLength={3} placeholderTextColor={colors.mutedForeground} />
              <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: "700" }}>мин</Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, flex: 1 }}>(1–360)</Text>
            </View>
          )}
        </View>

        {/* Изображение — только text_test и reading */}
        {(type === "text_test" || type === "reading") && renderMediaSection(
          "image",
          imageUrl, v => set("imageUrl", v),
          imageInputMode, v => set("imageInputMode", v),
          uploadedImageName, () => setSt(p => ({ ...p, imageUrl: "", uploadedImageName: "" })),
          imageInputRef,
          "#8b5cf6", "image",
          type === "reading" ? "Изображение" : "Изображение (необязательно)",
          "https://example.com/image.jpg",
          "image/*",
        )}

        {/* Аудио — только audio */}
        {type === "audio" && renderMediaSection(
          "audio",
          audioUrl, v => set("audioUrl", v),
          audioInputMode, v => {
            if (v === "url") setSt(p => ({ ...p, audioInputMode: "url", audioUrl: "", uploadedAudioName: "" }));
            else set("audioInputMode", "file");
          },
          uploadedAudioName, () => setSt(p => ({ ...p, audioUrl: "", uploadedAudioName: "" })),
          audioInputRef,
          "#6366f1", "sound",
          "Аудио",
          "https://example.com/audio.mp3",
          "audio/*",
        )}

        {/* Видео — для reading, video и text_test */}
        {(type === "reading" || type === "video" || type === "text_test") && renderMediaSection(
          "video",
          videoUrl, v => set("videoUrl", v),
          videoInputMode, v => {
            set("formError" as any, "");
            if (v === "url") setSt(p => ({ ...p, videoInputMode: "url", videoUrl: "", uploadedVideoName: "" }));
            else set("videoInputMode", "file");
          },
          uploadedVideoName, () => setSt(p => ({ ...p, videoUrl: "", uploadedVideoName: "" })),
          videoInputRef,
          "#ec4899", "video",
          type === "video" ? "Видео" : "Видео (необязательно)",
          "https://youtube.com/watch?v=... или https://example.com/video.mp4",
          "video/*",
        )}

        {/* Текст для чтения — необязательный */}
        {type === "reading" && (
          <View style={s.section}>
            <SectionLabel>Текст для чтения (необязательно)</SectionLabel>
            <TextInput
              style={[s.input, s.textArea]}
              value={content} onChangeText={v => set("content", v)}
              placeholder="Вставьте текст для чтения…"
              placeholderTextColor={colors.mutedForeground}
              multiline
            />
          </View>
        )}

        {/* Свободный ответ — пояснение + необязательные медиа */}
        {type === "free_form" && (
          <>
            <View style={s.hintBox}>
              <View style={{ marginTop: 1 }}>
                <Glyph name="compass" size={18} color={colors.primary} />
              </View>
              <Text style={{ fontSize: 13, color: colors.foreground, flex: 1, lineHeight: 19 }}>
                Ученик пришлёт текстовый ответ и/или фото. Автоматической проверки нет — вы сами оцените ответ и начислите баллы.
              </Text>
            </View>
            {renderMediaSection(
              "image",
              imageUrl, v => set("imageUrl", v),
              imageInputMode, v => set("imageInputMode", v),
              uploadedImageName, () => setSt(p => ({ ...p, imageUrl: "", uploadedImageName: "" })),
              imageInputRef,
              "#8b5cf6", "image",
              "Изображение к заданию (необязательно)",
              "https://example.com/image.jpg",
              "image/*",
            )}
            {renderMediaSection(
              "audio",
              audioUrl, v => set("audioUrl", v),
              audioInputMode, v => {
                if (v === "url") setSt(p => ({ ...p, audioInputMode: "url", audioUrl: "", uploadedAudioName: "" }));
                else set("audioInputMode", "file");
              },
              uploadedAudioName, () => setSt(p => ({ ...p, audioUrl: "", uploadedAudioName: "" })),
              audioInputRef,
              "#6366f1", "sound",
              "Аудио к заданию (необязательно)",
              "https://example.com/audio.mp3",
              "audio/*",
            )}
            {renderMediaSection(
              "video",
              videoUrl, v => set("videoUrl", v),
              videoInputMode, v => {
                if (v === "url") setSt(p => ({ ...p, videoInputMode: "url", videoUrl: "", uploadedVideoName: "" }));
                else set("videoInputMode", "file");
              },
              uploadedVideoName, () => setSt(p => ({ ...p, videoUrl: "", uploadedVideoName: "" })),
              videoInputRef,
              "#ec4899", "video",
              "Видео к заданию (необязательно)",
              "https://youtube.com/watch?v=... или https://example.com/video.mp4",
              "video/*",
            )}
          </>
        )}

        {/* Вопросы */}
        {type !== "free_form" && (
        <View style={s.section}>
          <SectionLabel>Вопросы · {questions.length}</SectionLabel>
          {questions.map((q, qi) => (
            <View key={qi} style={s.questionCard}>
              <View style={s.questionHeader}>
                <Text style={s.questionNum}>Вопрос {qi + 1}</Text>
                {questions.length > 1 && (
                  <Pressable onPress={() => removeQuestion(qi)} hitSlop={8} accessibilityLabel="Удалить вопрос">
                    <Glyph name="trash" size={17} color={colors.destructive} />
                  </Pressable>
                )}
              </View>
              <TextInput
                style={[s.input, s.textArea, { minHeight: 60 }]}
                value={q.text} onChangeText={v => updateQ(qi, "text", v)}
                placeholder="Текст вопроса" placeholderTextColor={colors.mutedForeground} multiline
              />
              <View style={s.formatRow}>
                {(["open", "choice"] as QuestionFormat[]).map(fmt => {
                  const active = q.format === fmt;
                  return (
                    <TouchableOpacity key={fmt}
                      activeOpacity={0.85}
                      style={[s.formatBtn, {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary + "12" : colors.card,
                      }]}
                      onPress={() => updateQ(qi, "format", fmt)}
                    >
                      <Glyph name={fmt === "open" ? "pen" : "list"} size={14} color={active ? colors.primary : colors.mutedForeground} />
                      <Text style={[s.formatBtnText, { color: active ? colors.primary : colors.mutedForeground }]}>
                        {fmt === "open" ? "Свободный ответ" : "Варианты ответов"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {q.format === "open" && (
                <TextInput style={s.input} value={q.correctAnswer}
                  onChangeText={v => updateQ(qi, "correctAnswer", v)}
                  placeholder="Правильный ответ" placeholderTextColor={colors.mutedForeground} />
              )}
              {q.format === "choice" && (
                <View>
                  {q.options.map((opt, oi) => (
                    <View key={oi} style={s.optionRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: q.correctIndex === oi }}
                        accessibilityLabel={`Вариант ${oi + 1} — правильный`}
                        style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, justifyContent: "center", alignItems: "center",
                          borderColor: q.correctIndex === oi ? colors.primary : colors.border,
                          backgroundColor: q.correctIndex === oi ? colors.primary : "transparent" }}
                        onPress={() => updateQ(qi, "correctIndex", oi)}
                      >
                        {q.correctIndex === oi && <Glyph name="check" size={13} color="#fff" />}
                      </TouchableOpacity>
                      <TextInput style={s.optionInput} value={opt}
                        onChangeText={v => updateOption(qi, oi, v)}
                        placeholder={`Вариант ${oi + 1}`} placeholderTextColor={colors.mutedForeground} />
                      {q.options.length > 2 && (
                        <Pressable onPress={() => removeOption(qi, oi)} hitSlop={8} accessibilityLabel="Удалить вариант">
                          <Glyph name="close" size={16} color={colors.destructive} />
                        </Pressable>
                      )}
                    </View>
                  ))}
                  {q.options.length < 6 && (
                    <TouchableOpacity style={s.addOptBtn} onPress={() => addOption(qi)} activeOpacity={0.8}>
                      <Glyph name="plus" size={14} color={colors.mutedForeground} />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.mutedForeground }}>Добавить вариант</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          ))}
          <TouchableOpacity style={s.addQBtn} onPress={addQuestion} activeOpacity={0.8}>
            <Glyph name="plus" size={16} color={colors.mutedForeground} />
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.mutedForeground }}>Добавить вопрос</Text>
          </TouchableOpacity>
        </View>
        )}

        {!!formError && (
          <View style={s.errorBox}>
            <View style={{ marginTop: 1 }}>
              <Glyph name="alert" size={16} color={colors.destructive} />
            </View>
            <Text style={{ color: colors.destructive, fontSize: 14, fontWeight: "700", flex: 1, lineHeight: 19 }}>{formError}</Text>
          </View>
        )}

        {saving ? (
          <View style={{ paddingVertical: 20, alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <ChunkyButton
            label="Создать задание"
            sublabel={dueDays === null ? activeType.label : `${activeType.label} · срок: ${preset_label(duePreset)}`}
            icon="check"
            onPress={handleSubmit}
            style={{ marginTop: 8 }}
          />
        )}
          </>
        )}

      </ScrollView>
    </View>
  );
}

/** Подпись выбранного пресета срока в нижнем регистре — для строк в тексте. */
function preset_label(key: DuePresetKey): string {
  const preset = DUE_PRESETS.find((p) => p.key === key);
  return (preset?.label ?? "без срока").toLowerCase();
}
