// ─────────────────────────────────────────────────────────────────────────────
// Собственный иконочный набор.
//
// Зачем он вместо эмодзи: эмодзи рендерятся системным шрифтом, поэтому на
// iPhone это Apple Color Emoji, на Android — Noto, а в вебе третий вариант.
// Их нельзя перекрасить токеном темы, нельзя выровнять по базовой линии и
// привести к одной толщине штриха. Плюс скринридер читает «огонь» вместо
// «серия 4 дня».
//
// Все глифы нарисованы на сетке 24×24 с одной толщиной штриха (2.1) и
// одинаковыми скруглениями концов. Заливка только там, где нужен вес:
// огонь, звезда, вспышка, play. Цвет берётся из пропа color, по умолчанию
// currentColor-подобное поведение обеспечивает вызывающий компонент.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import Svg, { Path, Circle, Rect, G } from "react-native-svg";

export type GlyphName =
  | "play" | "chevron" | "close" | "sound" | "rank"
  | "repeat" | "route" | "bag" | "compass" | "cup"
  | "target" | "alert" | "tray" | "flame" | "spark"
  | "trophy" | "medal" | "star" | "sunrise" | "mic"
  | "lock" | "crown" | "gear" | "cards" | "check"
  | "chart" | "user" | "users" | "calendar" | "plus"
  | "book" | "globe" | "leaf" | "paw" | "music"
  | "clock" | "handshake" | "chat" | "trendUp" | "trendDown"
  | "pen" | "video" | "note"
  | "camera" | "face" | "trash" | "key" | "copy"
  | "userPlus" | "userX" | "logout" | "cap"
  | "send" | "search" | "backspace" | "help" | "arrowRight"
  | "link" | "upload" | "image" | "list";

export interface GlyphProps {
  name: GlyphName;
  size?: number;
  color?: string;
  /** Описание для скринридера. Без него иконка считается декоративной. */
  label?: string;
}

export function Glyph({ name, size = 24, color = "#0f172a", label }: GlyphProps) {
  // Общие параметры штриха: одна толщина и одни скругления на весь набор.
  const s = {
    fill: "none" as const,
    stroke: color,
    strokeWidth: 2.1,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessible={!!label}
      accessibilityLabel={label}
      accessibilityRole={label ? "image" : undefined}
    >
      {render(name, s, color)}
    </Svg>
  );
}

function render(name: GlyphName, s: any, color: string) {
  switch (name) {
    case "play":
      return <Path d="M8 5.2v13.6a1 1 0 0 0 1.53.85l10.4-6.8a1 1 0 0 0 0-1.7L9.53 4.35A1 1 0 0 0 8 5.2Z" fill={color} />;

    case "chevron":
      return <Path {...s} strokeWidth={2.6} d="m9 5 7 7-7 7" />;

    case "close":
      return <Path {...s} strokeWidth={2.6} d="M18 6 6 18M6 6l12 12" />;

    case "arrowRight":
      return <Path {...s} strokeWidth={2.4} d="M3.6 12h16.8M14 5.6l6.4 6.4-6.4 6.4" />;

    case "link":
      return (
        <G>
          <Path {...s} d="M10 13.4a4.6 4.6 0 0 0 6.9.5l2.7-2.7a4.6 4.6 0 0 0-6.5-6.5l-1.6 1.5" />
          <Path {...s} d="M14 10.6a4.6 4.6 0 0 0-6.9-.5l-2.7 2.7a4.6 4.6 0 0 0 6.5 6.5l1.5-1.5" />
        </G>
      );

    case "upload":
      return (
        <G>
          <Path {...s} d="M21 15.4v3.2a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 18.6v-3.2" />
          <Path {...s} d="m7.4 8.4 4.6-4.6 4.6 4.6M12 3.8v11.6" />
        </G>
      );

    case "image":
      return (
        <G>
          <Rect {...s} x={3} y={4.4} width={18} height={15.2} rx={2.4} />
          <Circle cx={8.6} cy={9.6} r={1.6} fill={color} />
          <Path {...s} d="m3.6 17.2 5-5 3.4 3.4 3.2-3.2 5.2 5.2" />
        </G>
      );

    case "list":
      return (
        <G>
          <Path {...s} d="M9 6.4h11.4M9 12h11.4M9 17.6h11.4" />
          <Circle cx={4.4} cy={6.4} r={1.5} fill={color} />
          <Circle cx={4.4} cy={12} r={1.5} fill={color} />
          <Circle cx={4.4} cy={17.6} r={1.5} fill={color} />
        </G>
      );

    case "backspace":
      // Кнопка «Стереть» в сборке слова: клавиша со стрелкой и крестиком.
      return (
        <G>
          <Path {...s} d="M9.4 4.6h10a2 2 0 0 1 2 2v10.8a2 2 0 0 1-2 2h-10L2.6 12l6.8-7.4Z" />
          <Path {...s} d="m17 9.4-5.2 5.2M11.8 9.4l5.2 5.2" />
        </G>
      );

    case "help":
      return (
        <G>
          <Circle {...s} cx={12} cy={12} r={8.8} />
          <Path {...s} d="M9.4 9.2a2.7 2.7 0 0 1 5.25.9c0 1.8-2.65 2.7-2.65 2.7" />
          <Circle cx={12} cy={16.8} r={1.2} fill={color} />
        </G>
      );

    case "send":
      // Бумажный самолётик с залитым «крылом»: направление читается сразу.
      return (
        <G>
          <Path {...s} d="M21.4 2.6 2.8 9.9l7.5 2.9 2.9 7.5 8.2-17.7Z" />
          <Path {...s} d="M10.3 12.8 21.4 2.6" />
        </G>
      );

    case "search":
      return (
        <G>
          <Circle {...s} cx={10.6} cy={10.6} r={7} />
          <Path {...s} strokeWidth={2.5} d="m15.8 15.8 5 5" />
        </G>
      );

    case "sound":
      return (
        <G>
          <Path {...s} d="M11 5 6 9H2v6h4l5 4z" />
          <Path {...s} d="M15.5 8.5a5 5 0 0 1 0 7" />
          <Path {...s} d="M19 5a9 9 0 0 1 0 14" />
        </G>
      );

    case "rank":
      return (
        <G>
          <Path {...s} d="M12 2.6 4.5 5.4v5.9c0 4.7 3.1 8.5 7.5 10.1 4.4-1.6 7.5-5.4 7.5-10.1V5.4L12 2.6Z" />
          <Path d="m12 8 1.3 2.8 3 .4-2.2 2.1.55 3L12 14.9 9.35 16.3l.55-3-2.2-2.1 3-.4L12 8Z" fill={color} />
        </G>
      );

    case "repeat":
      return (
        <G>
          <Path {...s} d="M4 9a8 8 0 0 1 13.3-3.3L20 8" />
          <Path {...s} d="M20 4v4h-4" />
          <Path {...s} d="M20 15a8 8 0 0 1-13.3 3.3L4 16" />
          <Path {...s} d="M4 20v-4h4" />
        </G>
      );

    case "route":
      return (
        <G>
          <Path {...s} d="M6 21V4" />
          <Path {...s} d="M6 4.5h10.5l-2.4 3.6 2.4 3.6H6" />
          <Circle cx={6} cy={21} r={1.6} fill={color} />
        </G>
      );

    case "bag":
      return (
        <G>
          <Path {...s} d="M4.5 8.5h15v10a2.5 2.5 0 0 1-2.5 2.5H7a2.5 2.5 0 0 1-2.5-2.5v-10Z" />
          <Path {...s} d="M9 8.5V6.6A3 3 0 0 1 15 6.6v1.9" />
          <Path {...s} d="M9.5 13.5h5" />
        </G>
      );

    case "compass":
      return (
        <G>
          <Circle {...s} cx={12} cy={12} r={8.6} />
          <Path d="m15.8 8.2-2 5.6-5.6 2 2-5.6 5.6-2Z" fill={color} />
        </G>
      );

    case "cup":
      return (
        <G>
          <Path {...s} d="M4.5 9.5h12v6a4 4 0 0 1-4 4H8.5a4 4 0 0 1-4-4v-6Z" />
          <Path {...s} d="M16.5 11h1.8a2.7 2.7 0 0 1 0 5.4h-1.8" />
          <Path {...s} d="M8 3v2.6M12 2.6v3" />
        </G>
      );

    case "target":
      return (
        <G>
          <Circle {...s} cx={12} cy={12} r={8.6} />
          <Circle {...s} cx={12} cy={12} r={4.4} />
          <Circle cx={12} cy={12} r={1.7} fill={color} />
        </G>
      );

    case "clock":
      return (
        <G>
          <Circle {...s} cx={12} cy={12} r={8.6} />
          <Path {...s} d="M12 7.2V12l3.4 2" />
        </G>
      );

    case "handshake":
      return (
        <G>
          <Path {...s} d="M11.6 7.4 9.2 9.8a1.9 1.9 0 0 0 2.7 2.7l1.4-1.4 3.5 3.5a1.9 1.9 0 0 1-2.7 2.7" />
          <Path {...s} d="M14.1 17.3a1.9 1.9 0 0 1-2.7 0l-.8-.8" />
          <Path {...s} d="M2.6 8.4 6.4 5.6l4 1.2M21.4 8.4 17.6 5.6l-3.4 1M2.6 8.4l3.2 5.4M21.4 8.4l-3.2 5.4" />
        </G>
      );

    case "chat":
      return (
        <G>
          <Path {...s} d="M20.4 4.6H3.6A1.6 1.6 0 0 0 2 6.2v9.4a1.6 1.6 0 0 0 1.6 1.6h2.2v3.6l4.4-3.6h10.2a1.6 1.6 0 0 0 1.6-1.6V6.2a1.6 1.6 0 0 0-1.6-1.6Z" />
          <Path {...s} d="M7.2 9.2h9.6M7.2 12.8h6" />
        </G>
      );

    case "trendUp":
      return (
        <G>
          <Path {...s} d="m2.8 17.2 6-6.2 3.6 3.6 7.4-7.4" />
          <Path {...s} d="M15.6 7.2h4.6v4.6" />
        </G>
      );

    case "trendDown":
      return (
        <G>
          <Path {...s} d="m2.8 6.8 6 6.2 3.6-3.6 7.4 7.4" />
          <Path {...s} d="M15.6 16.8h4.6v-4.6" />
        </G>
      );

    case "pen":
      return (
        <G>
          <Path {...s} d="M16.4 3.6a2.3 2.3 0 0 1 3.3 3.3L8.4 18.2l-4.4 1.2 1.2-4.4L16.4 3.6Z" />
          <Path {...s} d="m14.6 5.4 4 4" />
        </G>
      );

    case "video":
      return (
        <G>
          <Rect {...s} x={2.6} y={5.6} width={13.4} height={12.8} rx={2.6} />
          <Path {...s} d="m16 10.6 5.4-3.2v9.2L16 13.4z" />
        </G>
      );

    case "note":
      return (
        <G>
          <Path {...s} d="M13.4 2.6H6.4a1.8 1.8 0 0 0-1.8 1.8v15.2a1.8 1.8 0 0 0 1.8 1.8h11.2a1.8 1.8 0 0 0 1.8-1.8V8.6l-6-6Z" />
          <Path {...s} d="M13.4 2.6v6h6" />
          <Path {...s} d="M8.4 13.4h7.2M8.4 17h4.8" />
        </G>
      );

    case "camera":
      return (
        <G>
          <Path {...s} d="M4.4 7.4h3.1l1.5-2.4h6l1.5 2.4h3.1a1.8 1.8 0 0 1 1.8 1.8v9a1.8 1.8 0 0 1-1.8 1.8H4.4a1.8 1.8 0 0 1-1.8-1.8v-9a1.8 1.8 0 0 1 1.8-1.8Z" />
          <Circle {...s} cx={12} cy={13.4} r={3.6} />
        </G>
      );

    case "face":
      // Плейсхолдер выбора аватара. Сам аватар остаётся выбором ученика,
      // а вот пункт меню рисуем своей иконкой, а не эмодзи.
      return (
        <G>
          <Circle {...s} cx={12} cy={12} r={8.8} />
          <Path {...s} d="M8.4 14.2a4.4 4.4 0 0 0 7.2 0" />
          <Circle cx={9.2} cy={9.8} r={1.25} fill={color} />
          <Circle cx={14.8} cy={9.8} r={1.25} fill={color} />
        </G>
      );

    case "trash":
      return (
        <G>
          <Path {...s} d="M3.6 6.4h16.8M8.4 6.4V4.6a1.8 1.8 0 0 1 1.8-1.8h3.6a1.8 1.8 0 0 1 1.8 1.8v1.8" />
          <Path {...s} d="M6 6.4v13a1.8 1.8 0 0 0 1.8 1.8h8.4a1.8 1.8 0 0 0 1.8-1.8v-13" />
          <Path {...s} d="M10.2 10.8v6M13.8 10.8v6" />
        </G>
      );

    case "key":
      return (
        <G>
          <Circle {...s} cx={7.6} cy={8.4} r={4.4} />
          <Path {...s} d="m10.9 11.4 9 9M17.4 17.9l2-2M14.6 15.1l2-2" />
        </G>
      );

    case "copy":
      return (
        <G>
          <Rect {...s} x={8.4} y={8.4} width={12} height={12} rx={2.2} />
          <Path {...s} d="M15.6 5.4v-.8a2 2 0 0 0-2-2H5.6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h.8" />
        </G>
      );

    case "userPlus":
      return (
        <G>
          <Circle {...s} cx={9.6} cy={8} r={4} />
          <Path {...s} d="M2.6 20.6c0-4 3.1-6.6 7-6.6s7 2.6 7 6.6" />
          <Path {...s} d="M19.4 7.6v6.2M22.5 10.7h-6.2" />
        </G>
      );

    case "userX":
      return (
        <G>
          <Circle {...s} cx={9.6} cy={8} r={4} />
          <Path {...s} d="M2.6 20.6c0-4 3.1-6.6 7-6.6s7 2.6 7 6.6" />
          <Path {...s} d="m17.2 8.6 4.6 4.6M21.8 8.6l-4.6 4.6" />
        </G>
      );

    case "logout":
      return (
        <G>
          <Path {...s} d="M14.6 3.6h3.8a2 2 0 0 1 2 2v12.8a2 2 0 0 1-2 2h-3.8" />
          <Path {...s} d="M9.4 16.4 4.6 12l4.8-4.4M4.8 12h10.4" />
        </G>
      );

    case "cap":
      // Академическая шапочка — метка учителя вместо эмодзи 🎓.
      return (
        <G>
          <Path {...s} d="M12 3.4 1.8 8.2 12 13l10.2-4.8L12 3.4Z" />
          <Path {...s} d="M6 10.4v5.2c0 1.9 2.7 3.4 6 3.4s6-1.5 6-3.4v-5.2" />
          <Path {...s} d="M22.2 8.2v5.4" />
        </G>
      );

    case "alert":
      return (
        <G>
          <Path {...s} d="M12 3.6 2.8 19.4A1 1 0 0 0 3.7 21h16.6a1 1 0 0 0 .87-1.6L12 3.6Z" />
          <Path {...s} d="M12 9.6v4.2" />
          <Circle cx={12} cy={17.2} r={1.15} fill={color} />
        </G>
      );

    case "tray":
      return (
        <G>
          <Path {...s} d="M3.5 13.5h4.2l1.6 2.6h5.4l1.6-2.6h4.2" />
          <Path {...s} d="M5.6 4.6h12.8l2.1 8.9v4a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2v-4l2.1-8.9Z" />
        </G>
      );

    case "flame":
      return <Path d="M13 2.2c.4 3.4 3.2 4.6 4.4 7.4a7 7 0 1 1-12.4 5.6c0-3.4 2-5.3 3.2-7.2.5 1.5 1.4 2.3 2.4 2.4-.3-3.4.9-6.2 2.4-8.2Z" fill={color} />;

    case "spark":
      return (
        <G>
          <Path d="M12 1.8 14 9l7.2 2-7.2 2-2 7.2-2-7.2L2.8 11 10 9l2-7.2Z" fill={color} />
          <Path d="M19.4 2.6 20.3 5l2.4.9-2.4.9-.9 2.4-.9-2.4L16.1 6l2.4-.9.9-2.5Z" fill={color} opacity={0.6} />
        </G>
      );

    case "trophy":
      return (
        <G>
          <Path {...s} d="M7.5 3.6h9v5.2a4.5 4.5 0 0 1-9 0V3.6Z" />
          <Path {...s} d="M7.5 5.4H4.8v1.5a3.4 3.4 0 0 0 2.9 3.3" />
          <Path {...s} d="M16.5 5.4h2.7v1.5a3.4 3.4 0 0 1-2.9 3.3" />
          <Path {...s} d="M12 13.3v3.3M8.6 20.6h6.8l-1-4H9.6l-1 4Z" />
        </G>
      );

    case "medal":
      return (
        <G>
          <Path {...s} d="m8.4 2.6 2.5 5.3M15.6 2.6l-2.5 5.3" />
          <Circle {...s} cx={12} cy={14.6} r={6.4} />
          <Path d="m12 10.8 1.15 2.4 2.6.35-1.9 1.8.47 2.6-2.32-1.25-2.32 1.25.47-2.6-1.9-1.8 2.6-.35L12 10.8Z" fill={color} />
        </G>
      );

    case "star":
      return <Path d="m12 2.4 2.9 6.2 6.7.85-4.95 4.6 1.28 6.65L12 17.5l-5.93 3.2 1.28-6.65L2.4 9.45l6.7-.85L12 2.4Z" fill={color} />;

    case "sunrise":
      return (
        <G>
          <Path {...s} d="M12 2.6v3.2M4.6 6.4l2.2 2.2M19.4 6.4l-2.2 2.2M2.4 15.4h3.2M18.4 15.4h3.2" />
          <Path {...s} d="M6.8 15.4a5.2 5.2 0 0 1 10.4 0" />
          <Path {...s} d="M2.6 19.6h18.8" />
        </G>
      );

    case "mic":
      return (
        <G>
          <Rect {...s} x={9} y={2.4} width={6} height={11.4} rx={3} />
          <Path {...s} d="M5.4 11.4a6.6 6.6 0 0 0 13.2 0" />
          <Path {...s} d="M12 18v3.4M8.6 21.4h6.8" />
        </G>
      );

    case "lock":
      return (
        <G>
          <Rect {...s} x={4.6} y={10} width={14.8} height={10.6} rx={2.6} />
          <Path {...s} d="M8.2 10V7.4a3.8 3.8 0 0 1 7.6 0V10" />
          <Circle cx={12} cy={15.3} r={1.5} fill={color} />
        </G>
      );

    case "crown":
      return (
        <G>
          <Path {...s} d="M3.4 7.4 5 18.6h14l1.6-11.2-4.9 3.6L12 4.4l-3.7 6.6L3.4 7.4Z" />
          <Path {...s} d="M5.6 21.4h12.8" />
        </G>
      );

    case "gear":
      return (
        <G>
          <Circle {...s} cx={12} cy={12} r={3.1} />
          <Path {...s} d="M19.1 14.4a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.46v.16a2 2 0 1 1-4 0v-.09a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.46-.97H2.9a2 2 0 1 1 0-4h.09a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32h.08a1.6 1.6 0 0 0 .97-1.46V2.9a2 2 0 1 1 4 0v.09a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77v.08a1.6 1.6 0 0 0 1.46.97h.16a2 2 0 1 1 0 4h-.09a1.6 1.6 0 0 0-1.46.97Z" />
        </G>
      );

    case "cards":
      return (
        <G>
          <Rect {...s} x={3.4} y={6.6} width={12.4} height={14} rx={2.4} />
          <Path {...s} d="M8 3.4h9.6a3 3 0 0 1 3 3V16" />
          <Path {...s} d="M7 11.4h5M7 15h3.4" />
        </G>
      );

    case "check":
      return (
        <G>
          <Path {...s} d="m9 12.4 2.6 2.6L20 6.6" />
          <Path {...s} d="M20.4 12.6V19a2.4 2.4 0 0 1-2.4 2.4H6A2.4 2.4 0 0 1 3.6 19V6.4A2.4 2.4 0 0 1 6 4h10" />
        </G>
      );

    case "chart":
      return <Path {...s} d="M18.4 20.4V9.6M12 20.4V3.6M5.6 20.4v-6.8" />;

    case "user":
      return (
        <G>
          <Circle {...s} cx={12} cy={8.2} r={4.1} />
          <Path {...s} d="M4 21c0-4.4 3.6-7.2 8-7.2s8 2.8 8 7.2" />
        </G>
      );

    case "users":
      return (
        <G>
          <Circle {...s} cx={9.4} cy={7.6} r={3.8} />
          <Path {...s} d="M2.6 20.6c0-3.9 3-6.4 6.8-6.4s6.8 2.5 6.8 6.4" />
          <Path {...s} d="M17 4.4a3.8 3.8 0 0 1 0 7M18.6 14.6c2 .8 3.4 2.7 3.4 5.4" />
        </G>
      );

    case "calendar":
      return (
        <G>
          <Rect {...s} x={3.4} y={5} width={17.2} height={16} rx={2.4} />
          <Path {...s} d="M16 2.6v4.4M8 2.6v4.4M3.4 10.6h17.2" />
        </G>
      );

    case "plus":
      return <Path {...s} strokeWidth={2.6} d="M12 5.4v13.2M5.4 12h13.2" />;

    case "book":
      return (
        <G>
          <Path {...s} d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <Path {...s} d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </G>
      );

    case "globe":
      return (
        <G>
          <Circle {...s} cx={12} cy={12} r={8.8} />
          <Path {...s} d="M3.2 12h17.6" />
          <Path {...s} d="M12 3.2a13.6 13.6 0 0 1 0 17.6 13.6 13.6 0 0 1 0-17.6Z" />
        </G>
      );

    case "leaf":
      return (
        <G>
          <Path {...s} d="M4.6 19.4C3.2 14 6 8 11.4 6.2c2.8-.9 6-.6 8.4.4.6 4.4-.8 8.6-4 11-2.9 2.2-7.2 2.4-11.2 1.8Z" />
          <Path {...s} d="M5.4 20.4C7.6 15.6 11 12 15.6 9.8" />
        </G>
      );

    case "paw":
      return (
        <G>
          <Circle cx={7.4} cy={8.6} r={2.5} fill={color} />
          <Circle cx={12} cy={6.6} r={2.5} fill={color} />
          <Circle cx={16.6} cy={8.6} r={2.5} fill={color} />
          <Path d="M12 11.2c3 0 5.4 2.2 5.4 4.8 0 2.2-1.8 3.6-4 3.2-.9-.2-1.9-.2-2.8 0-2.2.4-4-1-4-3.2 0-2.6 2.4-4.8 5.4-4.8Z" fill={color} />
        </G>
      );

    case "music":
      return (
        <G>
          <Path {...s} d="M9 18V5.4l11-2v12.2" />
          <Circle {...s} cx={6.4} cy={18} r={2.6} />
          <Circle {...s} cx={17.4} cy={15.6} r={2.6} />
        </G>
      );

    default:
      return null;
  }
}

export default Glyph;
