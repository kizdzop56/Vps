// ─────────────────────────────────────────────────────────────────────────────
// Диалоги учителя: экран-перенаправление.
//
// Раньше здесь была отдельная вкладка со списком ситуаций, формой создания и
// разборами. Всё это переехало: создание — в «Создать задание», сами диалоги и
// разборы — во вкладку «Задания» (см. components/TeacherDialogs.tsx). Держать
// вторую точку правды ради того же самого незачем, а лишняя кнопка внизу у
// учителя отнимала место у вкладок, которыми он пользуется каждый день.
//
// Маршрут оставлен и уводит в «Задания»: на него могут вести старые ссылки,
// закладка в браузере и история навигации. Пустой экран или 404 на месте
// знакомого адреса выглядели бы как поломка.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";

export default function TeacherScenariosRedirect() {
  const colors = useColors();
  const router = useRouter();

  React.useEffect(() => {
    const t = setTimeout(() => router.replace("/(main)/assignments" as any), 0);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
