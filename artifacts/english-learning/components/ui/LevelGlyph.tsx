// ─────────────────────────────────────────────────────────────────────────────
// Значок уровня.
//
// В constants/xpLevels.ts у каждого из 50 уровней есть поле emoji (🌱 🐣 🔍 …).
// Файл данных мы НЕ трогаем: он задаёт прогрессию, цвета и награды, на него
// завязан сервер и медали. Вместо этого здесь лежит карта «номер уровня →
// глиф из своего набора». Поле emoji остаётся в данных как источник правды
// для тех мест, где значок не рисуется, а карта отвечает только за экран.
//
// Логика соответствия: глиф подбирается по смыслу титула уровня, а не по
// картинке эмодзи. Росток и птенец — начало пути (leaf), поиск и книга —
// обучение (compass, book), звёзды и трофеи — мастерство (star, trophy),
// корона — вершина (crown).
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { View, Text } from "react-native";
import { Glyph, type GlyphName } from "./Glyph";

/**
 * Карта уровней. Ключ — номер уровня из XP_LEVELS, значение — глиф.
 * Уровни без явной записи получают глиф по диапазону (см. glyphForLevel).
 */
const LEVEL_GLYPHS: Record<number, GlyphName> = {
  1: "leaf",      // Новичок
  2: "leaf",      // Любопытный
  3: "compass",   // Искатель
  4: "book",      // Ученик
  5: "star",      // Старатель
  6: "target",    // Знаток
  7: "spark",     // Мыслитель
  8: "flame",     // Мастер
  9: "spark",     // Эксперт
  10: "medal",    // Профессионал
  11: "music",    // Виртуоз
  12: "trophy",   // Чемпион
  13: "paw",      // Герой
  14: "flame",    // Легенда
  15: "star",     // Супергерой
  16: "spark",    // Волшебник
  17: "rank",     // Рыцарь
  18: "rank",     // Страж
  19: "compass",  // Адмирал
  20: "star",     // Гений
  21: "spark",    // Архимаг
  22: "flame",    // Дракон
  23: "flame",    // Феникс
  24: "crown",    // Повелитель
  25: "spark",    // Воин света
  26: "compass",  // Оракул
  27: "compass",  // Провидец
  28: "medal",    // Бессмертный
  29: "flame",    // Полубог
  30: "trophy",   // Титан
  31: "rank",     // Колосс
  32: "globe",    // Нептун
  33: "flame",    // Громовержец
  34: "sunrise",  // Солнечный
  35: "star",     // Звёздный
  36: "route",    // Космический
  37: "spark",    // Галактический
  38: "star",     // Межзвёздный
  39: "globe",    // Вселенский
  40: "spark",    // Создатель
  41: "rank",     // Хранитель
  42: "medal",    // Избранный
  43: "book",     // Пророк
  44: "trophy",   // Олимпиец
  45: "paw",      // Мифический
  46: "rank",     // Эпический
  47: "trophy",   // Легендарный
  48: "star",     // Мифический
  49: "spark",    // Абсолют
  50: "crown",    // Бог знаний
};

/** Глиф уровня. Для неизвестных номеров подбираем по диапазону прогрессии. */
export function glyphForLevel(level: number): GlyphName {
  const exact = LEVEL_GLYPHS[level];
  if (exact) return exact;
  if (level <= 5) return "leaf";
  if (level <= 12) return "star";
  if (level <= 25) return "trophy";
  if (level <= 40) return "spark";
  return "crown";
}

export interface LevelGlyphProps {
  level: number;
  size?: number;
  color?: string;
}

/** Просто глиф уровня без оправы — для строк и компактных мест. */
export function LevelGlyph({ level, size = 22, color = "#fff" }: LevelGlyphProps) {
  return <Glyph name={glyphForLevel(level)} size={size} color={color} />;
}

export interface LevelBadgeProps {
  level: number;
  /** Цвет уровня из xpLevels.ts — берём его, а не выдумываем свой. */
  color: string;
  size?: number;
  /** Показывать номер уровня под глифом. */
  showNumber?: boolean;
}

/**
 * Круглый значок уровня: глиф плюс номер. Цвет всегда приходит из данных
 * уровня, поэтому прогрессия остаётся узнаваемой.
 */
export function LevelBadge({ level, color, size = 56, showNumber = true }: LevelBadgeProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: color,
        shadowOpacity: 0.35,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
      }}
    >
      <Glyph name={glyphForLevel(level)} size={Math.round(size * 0.4)} color="#fff" />
      {showNumber && (
        <Text style={{ fontSize: Math.max(9, Math.round(size * 0.19)), color: "#fff", fontWeight: "900", marginTop: -1 }}>
          {level}
        </Text>
      )}
    </View>
  );
}

export default LevelBadge;
