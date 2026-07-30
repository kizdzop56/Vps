// Сквозная сессия «Учить слова»: повторения и новые слова из всех доступных
// колод в одной очереди. Раньше ученику нужно было самому выбирать колоду и
// заходить в каждую по отдельности.
import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { WordTrainer } from "@/components/WordTrainer";
import { fc } from "@/hooks/useFlashcards";

export default function SessionScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const loadQueue = React.useCallback(() => fc.getSession(), []);
  const refreshLists = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["fc-decks"] });
    qc.invalidateQueries({ queryKey: ["fc-stats"] });
    qc.invalidateQueries({ queryKey: ["gamification-stats"] });
  }, [qc]);

  return (
    <View style={{ flex: 1 }}>
      <WordTrainer
        loader={loadQueue}
        title="Учим слова"
        onFinished={refreshLists}
        onExit={() => { refreshLists(); router.back(); }}
      />
    </View>
  );
}
