// ─────────────────────────────────────────────────────────────────────────────
// Колокольчик со счётчиком непрочитанного.
//
// Почему не глиф из общего набора: колокольчику нужен счётчик ПОВЕРХ иконки и
// собственная область нажатия, то есть это в любом случае отдельный компонент,
// а не одна иконка. Сам колокол нарисован в том же языке, что и весь набор
// (сетка 24×24, штрих 2.1, скруглённые концы) — в ряду с остальными значками он
// не выделяется.
//
// Счётчик показывается только когда есть что считать. Ноль в кружке — это
// сообщение «у тебя ничего нет», написанное самым заметным элементом экрана.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { View, Text, Pressable } from "react-native";
import Svg, { Path } from "react-native-svg";
import { radii } from "@/constants/theme";

function BellIcon({ size, color }: { size: number; color: string }) {
  const stroke = {
    fill: "none" as const,
    stroke: color,
    strokeWidth: 2.1,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path {...stroke} d="M18.2 9.2a6.2 6.2 0 1 0-12.4 0c0 5.4-2.3 6.9-2.3 6.9h17S18.2 14.6 18.2 9.2Z" />
      <Path {...stroke} d="M13.9 19.4a2.2 2.2 0 0 1-3.8 0" />
    </Svg>
  );
}

export interface NotificationBellProps {
  /** Непрочитанных. Ноль — счётчика нет. */
  count: number;
  onPress: () => void;
  /** Цвет иконки. По умолчанию белый: колокольчик лежит на тёмной шапке. */
  color?: string;
  /** Подложка под иконкой. */
  background?: string;
  size?: number;
}

export function NotificationBell({
  count, onPress, color = "#ffffff", background = "rgba(255,255,255,0.18)", size = 38,
}: NotificationBellProps) {
  const shown = count > 99 ? "99+" : String(count);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Уведомления, непрочитанных: ${count}` : "Уведомления"}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: radii.sm,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: background,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.28)",
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <BellIcon size={Math.round(size * 0.56)} color={color} />
      {count > 0 && (
        <View
          style={{
            position: "absolute",
            top: -5,
            right: -5,
            minWidth: 19,
            height: 19,
            paddingHorizontal: 4,
            borderRadius: 10,
            backgroundColor: "#e11d48",
            alignItems: "center",
            justifyContent: "center",
            // Белая обводка отделяет счётчик от иконки: без неё красное пятно
            // сливается с фоном шапки.
            borderWidth: 2,
            borderColor: "#ffffff",
          }}
        >
          <Text style={{ color: "#ffffff", fontSize: 10, fontWeight: "900", lineHeight: 13 }}>
            {shown}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export default NotificationBell;
