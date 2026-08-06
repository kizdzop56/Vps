// ─────────────────────────────────────────────────────────────────────────────
// Значок колоды без эмодзи.
//
// Поле deck.emoji приходит из базы: у системных колод оно проставлено, а свои
// колоды создают сами ученики и учителя. Схему БД мы НЕ трогаем — вместо этого
// на уровне представления подбираем глиф из своего набора.
//
// ── Порядок подбора ─────────────────────────────────────────────────────────
//   1. НАЗВАНИЕ. «Еда» → вилка, «Животные» → лапа, «Путешествия» → самолёт.
//      Это главный источник: название есть у любой колоды, оно осмысленно, и
//      его пишет человек, а не выбирает из палитры эмодзи.
//   2. ЭМОДЗИ из базы. Работает для системных колод, где оно проставлено.
//   3. Первая буква названия.
//
// Раньше первого шага не было, и половина списка показывала буквы: у
// пользовательских колод эмодзи пустое, а у системных встречалось не из карты.
// Экран выглядел как список инициалов, а не как набор тем.
//
// Ключевые слова ищутся ПОДСТРОКОЙ, поэтому одна запись «животн» ловит
// «Животные», «Животный мир» и «Домашние животные». Список отсортирован от
// частных тем к общим: «цвета» должны обогнать «цветы», а «дом» не должен
// перехватывать «домашние животные».
//
// Цвет плашки выводится из названия детерминированно: одна и та же колода
// всегда одного цвета, но соседние в списке различаются.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Glyph, type GlyphName } from "./Glyph";
import { gradients, radii } from "@/constants/theme";

/**
 * Тема → глиф. Порядок ВАЖЕН: побеждает первое совпадение, поэтому более
 * частные слова стоят выше общих.
 */
const TOPIC_RULES: { keys: string[]; glyph: GlyphName }[] = [
  // Сначала пары-ловушки: «цвета» vs «цветы», «домашние животные» vs «дом».
  { keys: ["домашн", "животн", "animal", "зверь", "звери", "птиц", "собак", "кошк", "питом", "pet"], glyph: "paw" },
  { keys: ["цвета", "цвет ", "colour", "color", "оттенк"], glyph: "palette" },

  // Учёба и язык
  { keys: ["глагол", "существит", "прилагат", "наречи", "предлог", "местоимен", "грамматик", "grammar", "времена глагол", "артикл"], glyph: "book" },
  { keys: ["идиом", "фразов", "phrasal", "выражени", "сленг", "поговор"], glyph: "chat" },
  { keys: ["школ", "school", "учеб", "урок", "класс", "образован", "универ", "студент", "экзамен", "ielts", "toefl", "егэ", "огэ"], glyph: "cap" },
  { keys: ["разговор", "speaking", "диалог", "общени", "знакомств", "приветств", "conversation", "small talk"], glyph: "chat" },

  // Быт
  { keys: ["еда", "food", "кухн", "ресторан", "фрукт", "овощ", "продукт", "завтрак", "обед", "ужин", "блюд", "готов"], glyph: "utensils" },
  { keys: ["напит", "drink", "кофе", "чай", "бар", "кафе"], glyph: "cup" },
  { keys: ["одежд", "cloth", "мода", "fashion", "обув", "стиль"], glyph: "shirt" },
  { keys: ["покупк", "shop", "магазин", "деньги", "money", "цена", "финанс", "банк", "рынок"], glyph: "cart" },
  { keys: ["дом", "house", "home", "квартир", "мебел", "комнат", "интерьер", "быт"], glyph: "home" },
  { keys: ["семь", "family", "родств", "друз", "люди", "people", "внешност"], glyph: "users" },

  // Мир вокруг
  { keys: ["путешеств", "travel", "аэропорт", "отпуск", "туриз", "отел", "каникул", "поездк"], glyph: "plane" },
  { keys: ["транспорт", "машин", "авто", "car", "поезд", "метро", "дорог", "traffic"], glyph: "car" },
  { keys: ["город", "city", "улиц", "здани", "навигац", "направлен", "место"], glyph: "building" },
  { keys: ["природ", "nature", "растен", "дерев", "лес", "эколог", "сад", "цветы"], glyph: "leaf" },
  { keys: ["погод", "weather", "климат", "сезон", "времена года", "зима", "лето", "осен", "весн"], glyph: "cloud" },
  { keys: ["стран", "country", "национальност", "язык", "мир", "world", "географи"], glyph: "globe" },

  // Человек и занятия
  { keys: ["здоров", "health", "медиц", "больниц", "врач", "тело", "body", "аптек", "любов", "love"], glyph: "heart" },
  { keys: ["эмоц", "чувств", "feeling", "emotion", "характер", "настроен"], glyph: "face" },
  { keys: ["спорт", "sport", "футбол", "фитнес", "тренир", "игр", "game", "хобби", "увлеч"], glyph: "ball" },
  { keys: ["работ", "work", "професс", "офис", "бизнес", "карьер", "job", "инструмент"], glyph: "tools" },
  { keys: ["наук", "science", "физик", "хими", "биолог", "технолог", "tech", "компьютер", "программ", "it "], glyph: "flask" },
  { keys: ["искусств", "art", "рисован", "музе", "творч", "дизайн"], glyph: "palette" },
  { keys: ["музык", "music", "песн", "song", "инструмент"], glyph: "music" },
  { keys: ["кино", "film", "movie", "сериал", "видео", "video", "театр"], glyph: "video" },
  { keys: ["телефон", "phone", "гаджет", "устройств", "интернет", "соцсет"], glyph: "phone" },

  // Абстрактное
  { keys: ["числ", "number", "счёт", "счет", "математ", "цифр"], glyph: "hash" },
  { keys: ["время", "time", "дата", "календар", "день недел", "месяц", "час"], glyph: "clock" },
  { keys: ["базов", "начин", "beginner", "старт", "перв", "основ", "basic"], glyph: "spark" },
  { keys: ["топ", "част", "frequent", "популярн", "главн", "важн"], glyph: "star" },
];

/**
 * Карта «эмодзи → глиф». Второй эшелон после названия: у системных колод поле
 * emoji проставлено, и это бесплатная подсказка о теме.
 */
const EMOJI_TO_GLYPH: Record<string, GlyphName> = {
  // учёба и колоды
  "📘": "book", "📗": "book", "📕": "book", "📙": "book", "📚": "book",
  "📖": "book", "📝": "cards", "✏️": "cards", "🎒": "bag", "🏫": "cap",
  "🎓": "cap", "🔤": "book", "🔡": "book", "💡": "spark",
  // навигация и путешествия
  "🧭": "compass", "🗺️": "compass", "✈️": "plane", "🚗": "car",
  "🚕": "car", "🚌": "car", "🚂": "car", "🏃": "ball",
  "🌍": "globe", "🌎": "globe", "🌏": "globe", "🏖️": "plane",
  "🏨": "building", "🏙️": "building", "🏠": "home", "🏡": "home",
  // еда
  "🍕": "utensils", "🍔": "utensils", "🍽️": "utensils", "🥗": "utensils",
  "🍎": "utensils", "🍏": "utensils", "🥐": "utensils", "🍜": "utensils",
  "☕": "cup", "🍵": "cup", "🥤": "cup",
  // природа и животные
  "🌱": "leaf", "🌿": "leaf", "🌳": "leaf", "🌸": "leaf",
  "🐶": "paw", "🐱": "paw", "🐾": "paw", "🦁": "paw", "🐻": "paw",
  "☁️": "cloud", "🌦️": "cloud", "🌧️": "cloud",
  // человек и занятия
  "❤️": "heart", "💚": "heart", "🏥": "heart", "💊": "heart",
  "👕": "shirt", "👗": "shirt", "👟": "shirt",
  "⚽": "ball", "🏀": "ball", "🎾": "ball", "🏋️": "ball",
  "🛒": "cart", "💰": "cart", "💵": "cart", "🏦": "cart",
  "🎨": "palette", "🖌️": "palette",
  "🔬": "flask", "🧪": "flask", "💻": "flask", "🖥️": "flask",
  "🔧": "tools", "🛠️": "tools", "💼": "tools",
  "📱": "phone", "☎️": "phone",
  "👨‍👩‍👧": "users", "👪": "users", "👥": "users",
  "😀": "face", "😊": "face", "🙂": "face",
  // прочее
  "🎵": "music", "🎶": "music", "🎤": "mic", "🎬": "video", "🔁": "repeat",
  "⭐": "star", "🌟": "star", "✨": "spark", "🔥": "flame",
  "🏆": "trophy", "🥇": "medal", "👑": "crown", "🎯": "target",
  "⏰": "clock", "🕐": "clock", "📅": "clock",
  "🌅": "sunrise", "☀️": "sunrise", "💬": "chat",
  "🔢": "hash", "#️⃣": "hash",
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

/** Глиф по названию колоды. null — тема не распознана. */
function glyphByTitle(title: string): GlyphName | null {
  const t = ` ${title.toLowerCase().replace(/ё/g, "е")} `;
  for (const rule of TOPIC_RULES) {
    for (const key of rule.keys) {
      if (t.includes(key.replace(/ё/g, "е"))) return rule.glyph;
    }
  }
  return null;
}

export interface DeckGlyphProps {
  /** Название колоды: из него берутся тема, цвет и буква фолбэка. */
  title: string;
  /** Значение deck.emoji из базы. Может быть пустым или неизвестным. */
  emoji?: string | null;
  size?: number;
  /** Наклон плашки. Лёгкий поворот убирает ощущение строгой сетки. */
  tilt?: number;
}

export function DeckGlyph({ title, emoji, size = 46, tilt = -4 }: DeckGlyphProps) {
  // Название важнее эмодзи: его пишет человек и оно есть всегда.
  const glyph = glyphByTitle(title) ?? (emoji ? EMOJI_TO_GLYPH[emoji.trim()] : undefined);
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
        // Фолбэк: буква названия. Срабатывает только на совсем непонятных
        // названиях вроде «Колода 1».
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
