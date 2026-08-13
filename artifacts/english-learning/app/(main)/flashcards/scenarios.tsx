// ─────────────────────────────────────────────────────────────────────────────
// Ситуации от учителя: экран-перенаправление.
//
// Раньше здесь был отдельный список заданий-диалогов. Теперь он живёт ВНУТРИ
// разговора со Снежей, второй вкладкой: два соседних входа в один и тот же
// разговор ученик читал как «одно и то же дважды» и не понимал, где задание.
//
// Сам маршрут оставлен и уводит туда же: на него могут вести старые ссылки,
// закладка в браузере и история навигации. Пустой экран или 404 на месте
// знакомого адреса выглядели бы как поломка.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";

export default function StudentScenariosRedirect() {
  const colors = useColors();
  const router = useRouter();

  // replace, а не push: возвращаться на пустой экран незачем. Внутри вкладок
  // back всё равно уводит на первую вкладку, а не на предыдущий экран.
  React.useEffect(() => {
    const t = setTimeout(() => router.replace("/flashcards/tutor" as any), 0);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
