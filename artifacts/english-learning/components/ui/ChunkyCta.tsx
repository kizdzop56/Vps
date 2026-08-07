// ─────────────────────────────────────────────────────────────────────────────
// Кнопка окон гайда: объёмная, с нижней гранью и проседанием при нажатии.
//
// Почему отдельный компонент. Окна гайда два — подсказки по вкладкам
// (TabGuide) и окно маскота (Mascot). Кнопка в них выглядит одинаково, и если
// оставить по копии в каждом файле, они разъедутся при первой же правке.
//
// Почему объёмная. Во всём приложении всё нажимаемое имеет нижнюю грань и
// проседает при нажатии: карточки профиля, кнопки календаря, строки рейтинга,
// колоды в словах. Плоская заливка рядом с этим языком читается как
// неактивная кнопка.
//
// Грань — отдельный слой ПОД корпусом, сдвинутый вниз на свою толщину. При
// нажатии корпус уезжает вниз ровно на неё, и кнопка «вдавливается».
//
// ГРАБЛИ: useNativeDriver только не в вебе — react-native-web не умеет
// нативный драйвер, и с ним анимация просто не запускается.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { Animated, Easing, Platform, Pressable, Text, View, type ViewStyle } from "react-native";

const NATIVE_DRIVER = Platform.OS !== "web";

/** Толщина нижней грани и цвет под фиолетовым корпусом. */
const EDGE = 6;
const BODY = "#8b5cf6";
const EDGE_COLOR = "#5b21b6";

export function ChunkyCta({
  label,
  onPress,
  width,
  tone = "solid",
  style,
}: {
  label: string;
  onPress: () => void;
  width?: number;
  /** ghost — второстепенное действие: прозрачный корпус, чтобы не спорить с главным. */
  tone?: "solid" | "ghost";
  style?: ViewStyle;
}) {
  const press = React.useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: NATIVE_DRIVER,
    }).start();

  const ghost = tone === "ghost";

  return (
    <View style={[{ width, paddingBottom: EDGE }, style]}>
      {/* Нижняя грань: отдельный слой под корпусом. */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: EDGE,
          bottom: 0,
          borderRadius: 16,
          backgroundColor: ghost ? "rgba(255,255,255,0.22)" : EDGE_COLOR,
        }}
      />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={onPress}
          onPressIn={() => set(EDGE)}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={{
            borderRadius: 16,
            paddingVertical: 15,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: ghost ? "rgba(255,255,255,0.08)" : BODY,
            borderWidth: 2,
            borderColor: ghost ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.35)",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }}>{label}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
