// «Сложные слова»: отдельная отработка того, на чём ребёнок спотыкается —
// слова со срывами и низкой точностью (см. isHardCard в api-server/src/lib/srs.ts).
import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { WordTrainer } from "@/components/WordTrainer";
import { fc } from "@/hooks/useFlashcards";

export default function HardWordsScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const loadQueue = React.useCallback(() => fc.getHard(), []);
  const refreshLists = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["fc-decks"] });
    qc.invalidateQueries({ queryKey: ["fc-stats"] });
    qc.invalidateQueries({ queryKey: ["gamification-stats"] });
  }, [qc]);

  return (
    <View style={{ flex: 1 }}>
      <WordTrainer
        loader={loadQueue}
        title="Сложные слова"
        onFinished={refreshLists}
        onExit={() => { refreshLists(); router.back(); }}
      />
    </View>
  );
}
