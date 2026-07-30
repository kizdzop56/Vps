// ─────────────────────────────────────────────────────────────────────────────
// Конструктор своей колоды: название → слова → ученики → «Сохранить колоду».
//
// Колода живёт черновиком в состоянии экрана и попадает в базу одним действием
// в конце. Раньше колода создавалась сразу при вводе названия — то есть до того,
// как учитель выбрал слова, и в списке оставались пустые колоды.
//
// Порядок сохранения: создать колоду → добавить слова → отправить ученикам.
// Если спотыкается второй или третий шаг, уже созданную колоду не удаляем и
// подборку не теряем: показываем, что именно не прошло, и даём повторить —
// повтор продолжает с места сбоя, а не создаёт колоду заново.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import { fc, type BulkAddResult, type ManualWordInput } from "@/hooks/useFlashcards";
import WordPicker from "@/components/WordPicker";
import AssignStudentsSheet from "@/components/AssignStudentsSheet";

const EMOJI = ["📕", "📗", "📘", "📙", "🧠", "⭐", "🔤", "🌍", "🎯", "💡"];

type Notice = { type: "success" | "error"; text: string; details?: string[] };

export default function NewDeckScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();

  const canAssign = isTeacherOrAdmin(user?.role ?? "");
  const lastStep = canAssign ? 3 : 2;

  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("📕");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [manualWords, setManualWords] = useState<ManualWordInput[]>([]);
  const [studentIds, setStudentIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Колода, созданная в неудачной попытке сохранения: повтор дописывает слова в
  // неё, а не создаёт вторую такую же.
  const createdDeckId = useRef<number | null>(null);

  const wordCount = selectedIds.length + manualWords.length;
  const titleReady = title.trim().length > 0;

  const steps = useMemo(() => {
    const base = [
      { n: 1, label: "Название" },
      { n: 2, label: "Слова" },
    ];
    return canAssign ? [...base, { n: 3, label: "Ученики" }] : base;
  }, [canAssign]);

  // ── Сохранение ────────────────────────────────────────────────────────────
  const save = async () => {
    if (!titleReady || saving) return;
    setSaving(true);
    setNotice(null);

    try {
      // 1. Колода
      let deckId = createdDeckId.current;
      if (deckId === null) {
        const deck = await fc.createDeck({ title: title.trim(), emoji });
        deckId = deck.id;
        createdDeckId.current = deckId;
        qc.invalidateQueries({ queryKey: ["fc-decks"] });
      }

      // 2. Слова
      let added: BulkAddResult | null = null;
      if (wordCount > 0) {
        added = await fc.addWordsBulk(deckId, {
          wordIds: selectedIds.length > 0 ? selectedIds : undefined,
          words: manualWords.length > 0 ? manualWords : undefined,
        });
      }

      // 3. Ученики
      let assigned = 0;
      if (canAssign && studentIds.length > 0) {
        const res = await fc.assignDeckBulk(deckId, studentIds);
        assigned = res.assigned;
      }

      qc.invalidateQueries({ queryKey: ["fc-decks"] });
      qc.invalidateQueries({ queryKey: ["fc-words", deckId] });

      // Слова, не прошедшие проверку, не должны выглядеть как успех без объяснения.
      if (added?.failed.length) {
        setNotice({
          type: "error",
          text: `Колода сохранена (${added.added} слов), но часть слов добавить не удалось.`,
          details: added.failed.map((f) => `${f.english} — ${f.reason}`),
        });
        setSaving(false);
        // Уже добавленные слова повторно не отправляем.
        setSelectedIds([]);
        setManualWords([]);
        return;
      }

      const parts = [`${added?.added ?? 0} слов`];
      if (assigned > 0) parts.push(`отправлена ${assigned} ${assigned === 1 ? "ученику" : "ученикам"}`);
      qc.invalidateQueries({ queryKey: ["fc-teacher-students"] });

      router.replace({
        pathname: "/flashcards/deck/[id]",
        params: { id: String(deckId), saved: parts.join(", ") },
      } as any);
    } catch (e: any) {
      setNotice({
        type: "error",
        text: createdDeckId.current !== null
          ? e?.message ?? "Колода создана, но слова или получатели не сохранились. Попробуйте ещё раз."
          : e?.message ?? "Не удалось сохранить колоду.",
      });
      setSaving(false);
    }
  };

  // ── Шаги ──────────────────────────────────────────────────────────────────
  const goBack = () => {
    if (step > 1) { setStep(step - 1); setNotice(null); return; }
    router.back();
  };

  const inputStyle = {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.foreground,
  } as const;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 8, paddingBottom: 140 }}>
        {/* шапка */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <TouchableOpacity onPress={goBack} style={{ padding: 6 }}>
            <Feather name="arrow-left" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={{ fontSize: 24, fontWeight: "900", color: colors.foreground }}>Своя колода</Text>
        </View>

        {/* индикатор шагов */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 22 }}>
          {steps.map((s, i) => {
            const done = step > s.n;
            const active = step === s.n;
            return (
              <React.Fragment key={s.n}>
                <TouchableOpacity
                  onPress={() => { if (s.n < step) { setStep(s.n); setNotice(null); } }}
                  disabled={s.n >= step}
                  activeOpacity={0.7}
                  style={{ alignItems: "center", gap: 4 }}
                >
                  <View style={{
                    width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center",
                    backgroundColor: done || active ? colors.primary : colors.card,
                    borderWidth: 2, borderColor: done || active ? colors.primary : colors.border,
                  }}>
                    {done
                      ? <Feather name="check" size={14} color="#fff" />
                      : <Text style={{ fontSize: 13, fontWeight: "800", color: active ? "#fff" : colors.mutedForeground }}>{s.n}</Text>}
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: done || active ? colors.primary : colors.mutedForeground }}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
                {i < steps.length - 1 && (
                  <View style={{ flex: 1, height: 2, marginHorizontal: 6, marginBottom: 15, backgroundColor: step > s.n ? colors.primary : colors.border }} />
                )}
              </React.Fragment>
            );
          })}
        </View>

        {/* ── Шаг 1: название и иконка ── */}
        {step === 1 && (
          <>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>Название</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Например: Слова к уроку про еду"
              placeholderTextColor={colors.mutedForeground}
              style={{ ...inputStyle, marginBottom: 18 }}
            />

            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8 }}>Иконка</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {EMOJI.map((e) => (
                <TouchableOpacity
                  key={e}
                  onPress={() => setEmoji(e)}
                  style={{
                    width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center",
                    borderWidth: 2, borderColor: emoji === e ? colors.primary : colors.border,
                    backgroundColor: emoji === e ? colors.primary + "18" : colors.card,
                  }}
                >
                  <Text style={{ fontSize: 24 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* ── Шаг 2: слова ── */}
        {step === 2 && (
          <>
            <Text style={{ fontSize: 13, lineHeight: 18, color: colors.mutedForeground, marginBottom: 14 }}>
              Отметьте слова в каталоге или добавьте свои. Колода сохранится вместе с подборкой на последнем шаге.
            </Text>
            <WordPicker
              selectedIds={selectedIds}
              onChangeSelected={setSelectedIds}
              manualWords={manualWords}
              onChangeManual={setManualWords}
            />
          </>
        )}

        {/* ── Шаг 3: ученики ── */}
        {step === 3 && (
          <AssignStudentsSheet
            selectedIds={studentIds}
            onChangeSelected={setStudentIds}
            hint="Кому отправить колоду. Шаг можно пропустить — отправить получится позже со страницы колоды."
            onEmptyAction={{ label: "Добавить ученика", onPress: () => router.push("/students" as any) }}
          />
        )}

        {/* итог перед сохранением */}
        {step === lastStep && (
          <View style={{
            marginTop: 20, backgroundColor: colors.card, borderRadius: 14,
            borderWidth: 1, borderColor: colors.border, padding: 14, gap: 6,
          }}>
            <Text style={{ fontSize: 12, fontWeight: "800", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.4 }}>
              Что будет сохранено
            </Text>
            <Text style={{ fontSize: 14, color: colors.foreground }}>{emoji} {title.trim() || "Без названия"}</Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
              Слов: {wordCount}{canAssign ? ` · получателей: ${studentIds.length}` : ""}
            </Text>
          </View>
        )}

        {/* сообщение о сбое */}
        {notice && (
          <View style={{
            marginTop: 16, flexDirection: "row", gap: 8, alignItems: "flex-start",
            backgroundColor: (notice.type === "success" ? colors.success : colors.destructive) + "14",
            borderWidth: 1, borderColor: (notice.type === "success" ? colors.success : colors.destructive) + "45",
            borderRadius: 12, padding: 12,
          }}>
            <Feather
              name={notice.type === "success" ? "check-circle" : "alert-circle"}
              size={16}
              color={notice.type === "success" ? colors.success : colors.destructive}
              style={{ marginTop: 1 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, lineHeight: 18, color: notice.type === "success" ? colors.success : colors.destructive }}>
                {notice.text}
              </Text>
              {notice.details?.slice(0, 5).map((d) => (
                <Text key={d} style={{ fontSize: 12, lineHeight: 17, color: colors.mutedForeground, marginTop: 3 }}>• {d}</Text>
              ))}
              {notice.type === "error" && createdDeckId.current !== null && (
                <TouchableOpacity
                  onPress={() => router.replace(`/flashcards/deck/${createdDeckId.current}` as any)}
                  style={{ marginTop: 8 }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "800", color: colors.primary }}>Открыть колоду →</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* нижняя панель навигации */}
      <View style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        flexDirection: "row", gap: 10, padding: 16, paddingBottom: insets.bottom + 16,
        backgroundColor: colors.background === "transparent" ? "rgba(0,0,0,0.35)" : colors.background,
        borderTopWidth: 1, borderTopColor: colors.border,
      }}>
        {step > 1 && (
          <TouchableOpacity
            onPress={goBack}
            disabled={saving}
            style={{
              paddingHorizontal: 20, borderRadius: 16, alignItems: "center", justifyContent: "center",
              borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
            }}
          >
            <Text style={{ fontWeight: "800", fontSize: 14, color: colors.foreground }}>Назад</Text>
          </TouchableOpacity>
        )}

        {step < lastStep ? (
          <TouchableOpacity
            onPress={() => { setStep(step + 1); setNotice(null); }}
            disabled={step === 1 && !titleReady}
            activeOpacity={0.85}
            style={{
              flex: 1, borderRadius: 16, paddingVertical: 15, alignItems: "center",
              backgroundColor: step === 1 && !titleReady ? colors.border : colors.primary,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
              {step === 1 ? "Выбрать слова" : "Далее"}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={save}
            disabled={saving || !titleReady}
            activeOpacity={0.85}
            style={{
              flex: 1, borderRadius: 16, paddingVertical: 15, alignItems: "center",
              backgroundColor: !titleReady ? colors.border : colors.primary,
            }}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>
                  {createdDeckId.current !== null ? "Повторить сохранение" : "Сохранить колоду"}
                </Text>}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
