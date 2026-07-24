import React from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FlashcardStudy } from "@/components/FlashcardStudy";

export default function StudyScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const router = useRouter();
  return (
    <View style={{ flex: 1 }}>
      <FlashcardStudy deckId={Number(deckId)} onExit={() => router.back()} />
    </View>
  );
}
