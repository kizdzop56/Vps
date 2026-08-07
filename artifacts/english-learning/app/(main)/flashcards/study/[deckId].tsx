// Изучение конкретной колоды — тем же тренажёром, что и сквозная сессия:
// упражнения подбираются по уровню памяти каждого слова.
import React from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { WordTrainer } from "@/components/WordTrainer";
import { fc } from "@/hooks/useFlashcards";

export default function StudyScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = Number(deckId);

  const loadQueue = React.useCallback(() => fc.getStudyQueue(id), [id]);
  const refreshLists = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["fc-decks"] });
    qc.invalidateQueries({ queryKey: ["fc-words", id] });
    qc.invalidateQueries({ queryKey: ["fc-stats"] });
    qc.invalidateQueries({ queryKey: ["gamification-stats"] });
  }, [qc, id]);

  // См. session.tsx: router.back() в табах уводит на первую вкладку.
  const exit = React.useCallback(() => {
    refreshLists();
    router.replace("/flashcards");
  }, [refreshLists, router]);

  return (
    <View style={{ flex: 1 }}>
      <WordTrainer loader={loadQueue} onFinished={refreshLists} onExit={exit} />
    </View>
  );
}
