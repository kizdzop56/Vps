import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { PlacementTest } from "@/components/PlacementTest";

export default function PlacementScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  return (
    <View style={{ flex: 1 }}>
      <PlacementTest
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["fc-settings"] });
          qc.invalidateQueries({ queryKey: ["fc-decks"] });
          router.replace("/flashcards");
        }}
      />
    </View>
  );
}
