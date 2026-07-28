// Тест определения уровня (CEFR). Используется:
//  • как обязательный шаг при первом входе ученика (гейт в (main)/_layout);
//  • как экран перепрохождения из раздела «Слова».
import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { fc } from "@/hooks/useFlashcards";
import type { PlacementQuestion, PlacementResultResponse } from "@workspace/api-client-react";

// подпись раздела вопроса на русском
function sectionLabel(section: string): string {
  if (section === "Grammar") return "Грамматика";
  if (section === "Translation") return "Перевод слова";
  return "Лексика";
}

export function PlacementTest({ onDone }: { onDone: (r: PlacementResultResponse) => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [questions, setQuestions] = useState<PlacementQuestion[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PlacementResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fc.getPlacement()
      .then((t) => setQuestions(t.questions))
      .catch(() => setError("Не удалось загрузить тест. Попробуйте позже."));
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ color: colors.foreground, fontSize: 15, textAlign: "center" }}>{error}</Text>
      </View>
    );
  }

  if (!questions) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // экран результата
  if (result) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, paddingTop: insets.top + 20 }}>
        <Text style={{ fontSize: 56 }}>🎓</Text>
        <Text style={{ fontSize: 16, color: colors.mutedForeground, marginTop: 10 }}>Твой уровень</Text>
        <Text style={{ fontSize: 64, fontWeight: "900", color: colors.primary, marginVertical: 6 }}>{result.cefrLevel}</Text>
        <Text style={{ fontSize: 15, color: colors.foreground, textAlign: "center", marginBottom: 6 }}>{result.message}</Text>
        <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 28 }}>
          Правильных ответов: {result.score} из {result.total}
        </Text>
        <TouchableOpacity
          onPress={() => onDone(result)}
          activeOpacity={0.85}
          style={{ backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 40, width: "100%", alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Начать учить слова</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const q = questions[idx]!;
  const selected = answers[q.id];
  const isLast = idx === questions.length - 1;
  const progress = ((idx + 1) / questions.length) * 100;

  const choose = (choice: number) => setAnswers((a) => ({ ...a, [q.id]: choice }));

  const next = async () => {
    if (selected === undefined) return;
    if (!isLast) { setIdx((i) => i + 1); return; }
    // отправка
    setSubmitting(true);
    try {
      const payload = questions.map((qq) => ({ id: qq.id, choice: answers[qq.id] ?? -1 }));
      const r = await fc.submitPlacement(payload);
      setResult(r);
    } catch {
      setError("Не удалось отправить ответы. Проверьте соединение.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, paddingTop: insets.top + 12 }}>
      {/* прогресс */}
      <View style={{ paddingHorizontal: 20 }}>
        <View style={{ height: 10, backgroundColor: "rgba(160,140,220,0.25)", borderRadius: 6, overflow: "hidden" }}>
          <View style={{ width: `${progress}%`, height: "100%", backgroundColor: colors.primary, borderRadius: 6 }} />
        </View>
        <Text style={{ marginTop: 8, color: colors.mutedForeground, fontSize: 12, fontWeight: "600" }}>
          Вопрос {idx + 1} из {questions.length} · {sectionLabel(q.section)}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
        <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 20, marginBottom: 18 }}>
          <Text style={{ fontSize: 19, fontWeight: "700", color: colors.foreground, lineHeight: 27 }}>{q.question}</Text>
        </View>

        {q.options.map((opt, i) => {
          const active = selected === i;
          return (
            <TouchableOpacity
              key={i}
              onPress={() => choose(i)}
              activeOpacity={0.8}
              style={{
                backgroundColor: active ? colors.primary + "18" : colors.card,
                borderColor: active ? colors.primary : colors.border,
                borderWidth: active ? 2 : 1,
                borderRadius: 14, padding: 16, marginBottom: 10,
                flexDirection: "row", alignItems: "center", gap: 12,
              }}
            >
              <View style={{
                width: 22, height: 22, borderRadius: 11,
                borderWidth: 2, borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.primary : "transparent",
                alignItems: "center", justifyContent: "center",
              }}>
                {active && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />}
              </View>
              <Text style={{ fontSize: 16, color: colors.foreground, flex: 1 }}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* навигация */}
      <View style={{ flexDirection: "row", gap: 12, padding: 20, paddingBottom: Math.max(insets.bottom, 12) + 8 }}>
        {idx > 0 && (
          <TouchableOpacity
            onPress={() => setIdx((i) => i - 1)}
            activeOpacity={0.8}
            style={{ flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 15, alignItems: "center" }}
          >
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 15 }}>Назад</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={next}
          disabled={selected === undefined || submitting}
          activeOpacity={0.85}
          style={{ flex: 2, backgroundColor: selected === undefined ? colors.border : colors.primary, borderRadius: 16, paddingVertical: 15, alignItems: "center" }}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{isLast ? "Завершить" : "Далее"}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}
