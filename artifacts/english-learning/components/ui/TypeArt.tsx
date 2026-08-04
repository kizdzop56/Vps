// ─────────────────────────────────────────────────────────────────────────────
// Значки типов заданий.
//
// Раньше это была линейная иконка из Glyph на градиентной плашке (TYPE_ICONS +
// TYPE_GRADIENTS в assignments.tsx). Приём честный, но для детей такой значок
// читается как служебный символ: пять разных заданий выглядели одинаково, менялся
// только цвет квадрата.
//
// Здесь каждый тип — маленькая сцена с узнаваемым предметом:
//   • text_test  — лист с галочками и жёлтый карандаш поверх
//   • audio      — наушники и звуковая волна между чашками
//   • reading    — раскрытая книга с золотой закладкой
//   • video      — экран с крупной кнопкой Play и солнцем в кадре
//   • free_form  — блокнот на пружине, белое перо и чернильная клякса
//
// Почему SVG, а не картинки: рисунок масштабируется под любой размер без второго
// комплекта ассетов, весит ноль байт в бандле и выглядит одинаково на iOS,
// Android и в вебе. Эмодзи по той же причине не используем — см. Glyph.tsx.
//
// Палитра — ось бренда из constants/colors.ts и theme.ts, новых цветов нет:
// фиолетовый (тест), индиго (аудио), маджента (чтение), розовый (видео),
// янтарь (свободный ответ). Жёлтый работает только как акцент внутри сцены.
//
// Наклон намеренно НЕ применяется: значок стоит ровно. В плотном списке
// микро-поворот читался как брак вёрстки, а не как приём.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import Svg, { Defs, LinearGradient, Stop, Path, Rect, Circle, G } from "react-native-svg";

/** Типы заданий, как они лежат в базе. */
export type AssignmentArtType = "text_test" | "audio" | "reading" | "video" | "free_form";

/**
 * Цвет тени под значком: совпадает с доминантой сцены. Держим рядом с самими
 * сценами, чтобы тень и рисунок нельзя было развести по цвету.
 */
export const TYPE_ART_SHADOW: Record<string, string> = {
  text_test: "#8b5cf6",
  audio: "#6366f1",
  reading: "#d946ef",
  video: "#ec4899",
  free_form: "#f59e0b",
};

/**
 * Идентификаторы градиентов должны быть уникальны на весь документ: в вебе все
 * SVG живут в одном DOM, и одинаковый id заставит второй значок красться
 * градиентом первого. Поэтому у каждого экземпляра свой суффикс.
 */
let seq = 0;
function useArtId(): string {
  const ref = React.useRef<string | null>(null);
  if (ref.current === null) {
    seq += 1;
    ref.current = `ta${seq}`;
  }
  return ref.current;
}

export interface TypeArtProps {
  /** Тип задания. Незнакомое значение рисуется как тест — экран не ломается. */
  type: string;
  size?: number;
  /** Описание для скринридера. Без него значок считается декоративным. */
  label?: string;
}

export function TypeArt({ type, size = 52, label }: TypeArtProps) {
  const id = useArtId();

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      accessible={!!label}
      accessibilityLabel={label}
      accessibilityRole={label ? "image" : undefined}
    >
      {scene(type, id)}
    </Svg>
  );
}

function scene(type: string, id: string) {
  switch (type) {
    case "audio":
      return audio(id);
    case "reading":
      return reading(id);
    case "video":
      return video(id);
    case "free_form":
      return freeForm(id);
    case "text_test":
    default:
      return textTest(id);
  }
}

// ── Тест: лист с галочками и карандаш ───────────────────────────────────────
function textTest(id: string) {
  return (
    <G>
      <Defs>
        <LinearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#c084fc" />
          <Stop offset="1" stopColor="#7c3aed" />
        </LinearGradient>
        <LinearGradient id={`${id}p`} x1="0.2" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#ffffff" />
          <Stop offset="1" stopColor="#ede9fe" />
        </LinearGradient>
      </Defs>
      <Rect width={64} height={64} rx={17} fill={`url(#${id}b)`} />
      {/* Светлый круг в углу — источник света, он же убирает плоскость фона. */}
      <Circle cx={49} cy={15} r={12} fill="#ffffff" opacity={0.14} />
      <Rect x={16} y={12} width={30} height={40} rx={5} fill={`url(#${id}p)`} />
      <Rect x={26} y={9} width={12} height={6} rx={3} fill="#6d28d9" />
      {/* Две задачи отмечены, третья пустая: тест «в процессе», а не абстракция. */}
      <Circle cx={24} cy={24} r={3.4} fill="#a855f7" opacity={0.28} />
      <Path d="M22.2 24.1l1.5 1.6 2.6-3" stroke="#6d28d9" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Rect x={30} y={22.4} width={12} height={3.2} rx={1.6} fill="#c4b5fd" />
      <Circle cx={24} cy={33} r={3.4} fill="#a855f7" opacity={0.28} />
      <Path d="M22.2 33.1l1.5 1.6 2.6-3" stroke="#6d28d9" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Rect x={30} y={31.4} width={9} height={3.2} rx={1.6} fill="#c4b5fd" />
      <Circle cx={24} cy={42} r={3.4} fill="none" stroke="#c4b5fd" strokeWidth={1.8} />
      <Rect x={30} y={40.4} width={11} height={3.2} rx={1.6} fill="#ddd6fe" />
      {/* Карандаш заходит за край листа — сцена получает глубину. */}
      <Path d="M40 46l12-13.5 5.2 4.6L45.2 50.6 38.8 52Z" fill="#fbbf24" />
      <Path d="M52 32.5l5.2 4.6 2.6-2.9a2.6 2.6 0 0 0-.2-3.7l-1.6-1.4a2.6 2.6 0 0 0-3.7.2Z" fill="#f59e0b" />
      <Path d="M38.8 52l6.4-1.4-5.2-4.6Z" fill="#fff7ed" />
      <Path d="M40 46l12-13.5 1.8 1.6L41.8 47.6Z" fill="#ffffff" opacity={0.35} />
    </G>
  );
}

// ── Аудирование: наушники и волна ───────────────────────────────────────────
function audio(id: string) {
  return (
    <G>
      <Defs>
        <LinearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#a5b4fc" />
          <Stop offset="1" stopColor="#4338ca" />
        </LinearGradient>
        <LinearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#ffffff" />
          <Stop offset="1" stopColor="#e0e7ff" />
        </LinearGradient>
      </Defs>
      <Rect width={64} height={64} rx={17} fill={`url(#${id}b)`} />
      <Circle cx={32} cy={30} r={21} fill="#ffffff" opacity={0.12} />
      <Path d="M16 34v-4a16 16 0 0 1 32 0v4" stroke="#eef2ff" strokeWidth={4.4} fill="none" strokeLinecap="round" />
      <Rect x={10} y={31} width={12} height={20} rx={6} fill={`url(#${id}c)`} />
      <Rect x={13} y={34.5} width={6} height={13} rx={3} fill="#4338ca" opacity={0.22} />
      <Rect x={42} y={31} width={12} height={20} rx={6} fill={`url(#${id}c)`} />
      <Rect x={45} y={34.5} width={6} height={13} rx={3} fill="#4338ca" opacity={0.22} />
      {/* Янтарная волна: единственный тёплый акцент, он же «звук идёт». */}
      <G stroke="#fbbf24" strokeWidth={3} strokeLinecap="round" fill="none">
        <Path d="M26 41v-6" />
        <Path d="M32 44v-12" />
        <Path d="M38 41v-6" />
      </G>
      <Circle cx={32} cy={19} r={3} fill="#ffffff" opacity={0.5} />
    </G>
  );
}

// ── Чтение: раскрытая книга с закладкой ─────────────────────────────────────
function reading(id: string) {
  return (
    <G>
      <Defs>
        <LinearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#f0abfc" />
          <Stop offset="1" stopColor="#c026d3" />
        </LinearGradient>
        <LinearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#ffffff" />
          <Stop offset="1" stopColor="#fae8ff" />
        </LinearGradient>
      </Defs>
      <Rect width={64} height={64} rx={17} fill={`url(#${id}b)`} />
      <Circle cx={16} cy={14} r={14} fill="#ffffff" opacity={0.12} />
      <Path d="M32 20c-4.5-3.6-10-4.6-16-3.6v27c6-1 11.5 0 16 3.6Z" fill={`url(#${id}p)`} />
      <Path d="M32 20c4.5-3.6 10-4.6 16-3.6v27c-6-1-11.5 0-16 3.6Z" fill={`url(#${id}p)`} />
      <Path d="M32 20v27" stroke="#c026d3" strokeWidth={2.2} strokeLinecap="round" opacity={0.55} />
      {/* Строки текста короче на последней линии — страница выглядит живой. */}
      <G stroke="#e879f9" strokeWidth={1.9} strokeLinecap="round">
        <Path d="M21 24h7" />
        <Path d="M21 29h7" />
        <Path d="M21 34h5" />
        <Path d="M36 24h7" />
        <Path d="M36 29h7" />
        <Path d="M36 34h5" />
      </G>
      <Path d="M40 12h7v14l-3.5-3.2L40 26Z" fill="#fbbf24" />
      <Path d="M40 12h7v3h-7Z" fill="#f59e0b" />
      <Path d="M32 47c4.5-3.6 10-4.6 16-3.6l-1 4c-5.6-.9-10.8.2-15 3.4-4.2-3.2-9.4-4.3-15-3.4l-1-4c6-1 11.5 0 16 3.6Z" fill="#ffffff" opacity={0.45} />
    </G>
  );
}

// ── Видео: экран с кнопкой Play ─────────────────────────────────────────────
function video(id: string) {
  return (
    <G>
      <Defs>
        <LinearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#f9a8d4" />
          <Stop offset="1" stopColor="#db2777" />
        </LinearGradient>
        <LinearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#ffffff" />
          <Stop offset="1" stopColor="#fce7f3" />
        </LinearGradient>
      </Defs>
      <Rect width={64} height={64} rx={17} fill={`url(#${id}b)`} />
      <Circle cx={50} cy={16} r={14} fill="#ffffff" opacity={0.12} />
      <Rect x={10} y={15} width={44} height={30} rx={7} fill={`url(#${id}s)`} />
      <Rect x={14} y={19} width={36} height={22} rx={4} fill="#fbcfe8" opacity={0.55} />
      {/* В кадре пейзаж и солнце: экран не пустой, значит внутри что-то есть. */}
      <Path d="M14 34l7-7 6 6 6-8 13 12v-4a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4Z" fill="#f9a8d4" opacity={0.6} />
      <Circle cx={41} cy={26} r={3.4} fill="#fbbf24" />
      <Circle cx={32} cy={30} r={10.5} fill="#db2777" />
      <Path d="M29.4 25.6l7.4 4.4-7.4 4.4Z" fill="#ffffff" />
      {/* Подставка снизу: экран становится предметом, а не прямоугольником. */}
      <Rect x={26} y={47} width={12} height={4} rx={2} fill="#ffffff" opacity={0.8} />
      <Rect x={20} y={51} width={24} height={4} rx={2} fill="#ffffff" opacity={0.55} />
    </G>
  );
}

// ── Свободный ответ: блокнот, перо и клякса ─────────────────────────────────
function freeForm(id: string) {
  return (
    <G>
      <Defs>
        <LinearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#fcd34d" />
          <Stop offset="1" stopColor="#d97706" />
        </LinearGradient>
        <LinearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#ffffff" />
          <Stop offset="1" stopColor="#fef3c7" />
        </LinearGradient>
      </Defs>
      <Rect width={64} height={64} rx={17} fill={`url(#${id}b)`} />
      <Circle cx={15} cy={15} r={13} fill="#ffffff" opacity={0.14} />
      <Rect x={13} y={11} width={32} height={42} rx={5} fill={`url(#${id}p)`} />
      <Rect x={13} y={11} width={6} height={42} fill="#f59e0b" opacity={0.22} />
      <G fill="#b45309" opacity={0.55}>
        <Circle cx={16} cy={19} r={1.6} />
        <Circle cx={16} cy={30} r={1.6} />
        <Circle cx={16} cy={41} r={1.6} />
      </G>
      <G stroke="#fbbf24" strokeWidth={2.1} strokeLinecap="round">
        <Path d="M24 21h15" />
        <Path d="M24 27h15" />
        <Path d="M24 33h11" />
      </G>
      {/* Волнистая строка — «пишется прямо сейчас», текст не закончен. */}
      <Path d="M24 39c4 0 5-3 8-3s5 3 8 1" stroke="#d97706" strokeWidth={2.1} fill="none" strokeLinecap="round" opacity={0.65} />
      <Path d="M52 14c-6 2-12 8-15 15-1.5 3.5-1.8 7-1 10 2.5-2 6-4 9.5-7 5.5-4.7 8-12 6.5-18Z" fill="#ffffff" />
      <Path d="M52 14c-6 2-12 8-15 15-1.5 3.5-1.8 7-1 10 4-6 9-12 16-25Z" fill="#fde68a" />
      <Path d="M36 39l-6 8" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" />
      {/* Клякса фиолетовая, а не жёлтая: связывает значок с осью бренда. */}
      <Circle cx={28} cy={49} r={4} fill="#6d28d9" opacity={0.85} />
      <Circle cx={34} cy={51} r={2} fill="#6d28d9" opacity={0.55} />
    </G>
  );
}

export default TypeArt;
