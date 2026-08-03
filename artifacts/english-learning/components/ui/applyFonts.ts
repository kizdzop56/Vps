// ─────────────────────────────────────────────────────────────────────────────
// Глобальная типографика.
//
// Почему так, а не правкой каждого экрана: в проекте больше двадцати экранов и
// несколько из них по 45–80 КБ (профиль, календарь, прогресс, задания). Ручная
// расстановка fontFamily в каждом <Text> это сотни точек изменения, где легко
// что-то пропустить и невозможно потом поддерживать. Вместо этого один раз
// переопределяем отрисовку Text и TextInput и подставляем шрифт по тем
// признакам, которые уже есть в разметке: насыщенности и кеглю.
//
// Правило соответствует шкале из constants/theme.ts:
//   • тяжёлое и крупное (вес ≥ 800, кегль ≥ 17, либо вес 900) → Unbounded.
//     Это заголовки экранов, названия блоков, крупные числа XP и очков.
//   • всё остальное → Manrope: текст, подписи, метки, таблицы.
//
// Важные детали:
//   1. Если у стиля УЖЕ задан fontFamily, ничего не трогаем. Так остаются целы
//      иконочный Feather и любые намеренные исключения.
//   2. Вместе с fontFamily убираем fontWeight. На Android системный движок
//      иначе дорисовывает синтетическую жирность поверх и без того жирного
//      начертания, и буквы «залипают».
//   3. Шрифты грузятся в app/_layout.tsx НЕ блокируя запуск. Пока их нет,
//      fontFamily указывает на ещё не готовое семейство и платформа рисует
//      системным шрифтом — это ожидаемое поведение, текст не пропадает.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Text, TextInput, StyleSheet } from "react-native";
import { fonts } from "@/constants/theme";

/** Порог кегля, с которого тяжёлый текст считается заголовочным. */
const DISPLAY_MIN_SIZE = 17;

/** Нормализуем вес: RN допускает и число, и строку, и "bold". */
function weightOf(style: any): number {
  const w = style?.fontWeight;
  if (w == null) return 400;
  if (w === "bold") return 700;
  if (w === "normal") return 400;
  const n = typeof w === "number" ? w : parseInt(String(w), 10);
  return Number.isFinite(n) ? n : 400;
}

/**
 * Подбор начертания. Возвращает null, если вмешиваться не нужно
 * (уже задан свой fontFamily).
 */
function pickFamily(style: any): string | null {
  if (!style || style.fontFamily) return null;

  const weight = weightOf(style);
  const size = typeof style.fontSize === "number" ? style.fontSize : 14;

  // Заголовочная ветка: крупное и тяжёлое, либо предельно тяжёлое любого кегля.
  const isDisplay = weight >= 900 || (weight >= 800 && size >= DISPLAY_MIN_SIZE);
  if (isDisplay) {
    if (weight >= 900) return fonts.display;
    return fonts.displayBold;
  }

  // Текстовая ветка.
  if (weight >= 800) return fonts.textHeavy;
  if (weight >= 600) return fonts.textBold;
  return fonts.text;
}

/** Один раз на модуль: повторный импорт не должен патчить дважды. */
let patched = false;

export function applyGlobalFonts() {
  if (patched) return;
  patched = true;

  for (const Component of [Text, TextInput] as any[]) {
    const original = Component.render;
    // Если внутренности React Native изменятся и render пропадёт, просто
    // выходим: приложение продолжит работать на системном шрифте.
    if (typeof original !== "function") continue;

    Component.render = function patchedRender(...args: any[]) {
      const element = original.apply(this, args);
      if (!element) return element;

      const incoming = element.props?.style;
      const flat = StyleSheet.flatten(incoming) ?? {};
      const family = pickFamily(flat);
      if (!family) return element;

      return React.cloneElement(element, {
        style: [
          incoming,
          // fontWeight сбрасываем: см. пункт 2 в шапке файла.
          { fontFamily: family, fontWeight: undefined },
        ],
      });
    };
  }
}

export default applyGlobalFonts;
