// ─────────────────────────────────────────────────────────────────────────────
// Значок колоды без эмодзи.
//
// Поле deck.emoji приходит из базы: у системных колод оно проставлено, а свои
// колоды создают сами ученики и учителя. Схему БД мы НЕ трогаем — вместо этого
// на уровне представления сопоставляем известные эмодзи с глифами из своего
// набора, а для незнакомых показываем первую букву названия колоды в фирменной
// плашке. Так эмодзи исчезают с экрана, но данные остаются валидными и старые
// колоды продолжают работать.
//
// Цвет плашки выводится из названия колоды детерминированно: одна и та же
// колода всегда одного цвета, но соседние в списке различаются.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Glyph, type GlyphName } from "./Glyph";
import { gradients, radii } from "@/constants/theme";

/**
 * Карта «эмодзи → глиф». Покрывает то, что реально стоит у системных колод
 * и что чаще всего выбирают пользователи. Всё остальное уходит в фолбэк с
 * буквой, поэтому карту можно спокойно дополнять по мере необходимости.
 */
const EMOJI_TO_GLYPH: Record<string, GlyphName> = {
  // учёба и колоды
  "📘": "book", "📗": "book", "📕": "book", "📙": "book", "📚": "book",
  "📖": "book", "📝": "cards", "✏️": "cards", "🎒": "bag", "🏫": "bag",
  // навигация и путешествия
  "🧭": "compass", "🗺️": "compass", "✈️": "route", "🚗": "route",
  "🏃": "route", "🌍": "globe", "🌎": "globe", "🌏": "globe",
  // еда
  "🍕": "cup", "🍔": "cup", "☕": "cup", "🍽️": "cup", "🥗": "leaf",
  "🍎": "leaf", "🍏": "leaf",
  // природа и животные
  "🌱": "leaf", "🌿": "leaf", "🐶": "paw", "🐱": "paw", "🐾": "paw",
  "🦁": "paw", "🐻": "paw",
  // прочее
  "🎵": "music", "🎶": "music", "🎤": "mic", "🔁": "repeat",
  "⭐": "star", "🌟": "star", "✨": "spark", "🔥": "flame",
  "🏆": "trophy", "🥇": "medal", "👑": "crown", "🎯": "target",
  "⏰": "target", "🌅": "sunrise", "☀️": "sunrise", "💬": "mic",
};

/** Палитры плашки. Порядок фиксирован — от него зависит выбор по хешу. */
const PALETTES = [
  gradients.action,
  gradients.reward,
  ["#6366f1", "#4338ca"] as const,
  ["#d946ef", "#ec4899"] as const,
  ["#a855f7", "#6d28d9"] as const,
] as const;

/** Стабильный хеш строки: одна колода всегда получает один и тот же цвет. */
function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * Первая буква названия для фолбэка. Берём именно букву или цифру, пропуская
 * эмодзи и знаки препинания в начале строки: иначе в плашку попадёт кавычка.
 */
function initial(title: string): string {
  const m = title.match(/[\p{L}\p{N}]/u);
  return (m?.[0] ?? "?").toUpperCase();
}

export interface DeckGlyphProps {
  /** Название колоды: из него берётся цвет и буква фолбэка. */
  title: string;
  /** Значение deck.emoji из базы. Может быть пустым или неизвестным. */
  emoji?: string | null;
  size?: number;
  /** Наклон плашки. Лёгкий поворот убирает ощущение строгой сетки. */
  tilt?: number;
}

export function DeckGlyph({ title, emoji, size = 46, tilt = -4 }: DeckGlyphProps) {
  const glyph = emoji ? EMOJI_TO_GLYPH[emoji.trim()] : undefined;
  const colors = PALETTES[hash(title) % PALETTES.length]!;

  return (
    <LinearGradient
      colors={colors as unknown as string[]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: radii.sm + 3,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ rotate: `${tilt}deg` }],
        shadowColor: colors[0],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
        elevation: 4,
      }}
    >
      {glyph ? (
        <Glyph name={glyph} size={Math.round(size * 0.5)} color="#ffffff" />
      ) : (
        // Фолбэк: буква названия. Работает для любой колоды, которую создал
        // пользователь, и не зависит от того, что лежит в поле emoji.
        <View style={{ transform: [{ rotate: `${-tilt}deg` }] }}>
          <Text
            style={{
              color: "#ffffff",
              fontSize: Math.round(size * 0.42),
              fontWeight: "900",
              letterSpacing: -0.5,
            }}
          >
            {initial(title)}
          </Text>
        </View>
      )}
    </LinearGradient>
  );
}

export default DeckGlyph;
