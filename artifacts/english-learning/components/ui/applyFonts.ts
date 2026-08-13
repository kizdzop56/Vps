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
// ── ГРАБЛИ: ПОДМЕНЯТЬ НАДО ВХОД, А НЕ РЕЗУЛЬТАТ ────────────────────────────
// Первая версия вызывала оригинальный render, а потом делала cloneElement с
// массивом стилей. На вебе это ломалось, причём двумя разными способами сразу.
//
// Обычный <Text> в react-native-web возвращает не сам узел, а обёртку
// (провайдер контекста направления письма). Клонировать её бессмысленно: стиль
// уходит в проп, который никто не читает, и шрифт молча не применялся вовсе.
//
// А <Text> ВНУТРИ другого <Text> возвращает уже готовый DOM-узел (span) с
// разобранным стилем. Ему в style прилетал МАССИВ, который React DOM пытался
// разложить по ключам: у массива это «0», «1», и браузер падал с «Cannot set
// indexed properties on this object». Экран при этом умирал целиком — так
// падал список учеников, где под именем стоит «средний <Text>73%</Text>».
//
// Теперь стиль дописывается ВО ВХОДЯЩИЕ пропсы, до вызова оригинала: массив
// разбирает сам react-native-web, как он это делает с любым style, а наружу
// уходит ровно то, что вернул бы компонент без патча.
//
// Остальные детали:
//   1. Если у стиля УЖЕ задан fontFamily, ничего не трогаем. Так остаются целы
//      иконочный Feather и любые намеренные исключения.
//   2. Вместе с fontFamily убираем fontWeight. На Android системный движок
//      иначе дорисовывает синтетическую жирность поверх и без того жирного
//      начертания, и буквы «залипают». Насыщенность несёт само семейство
//      (Unbounded_900Black, Manrope_800ExtraBold и так далее).
//   3. Шрифты грузятся в app/_layout.tsx НЕ блокируя запуск. Пока их нет,
//      fontFamily указывает на ещё не готовое семейство и платформа рисует
//      системным шрифтом — это ожидаемое поведение, текст не пропадает.
// ─────────────────────────────────────────────────────────────────────────────

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

    // Сигнатура forwardRef: (props, ref). Сохраняем её как есть — оригинал
    // ждёт ровно эти два аргумента.
    Component.render = function patchedRender(props: any, ref: any) {
      let family: string | null = null;
      try {
        family = pickFamily(StyleSheet.flatten(props?.style) ?? {});
      } catch {
        // Разбор стиля не должен ронять отрисовку текста: без шрифта экран
        // выглядит скучнее, без текста — не выглядит вообще.
        family = null;
      }
      if (!family) return original.call(this, props, ref);

      return original.call(
        this,
        {
          ...props,
          // Массив, а не слияние объектов: свой стиль остаётся сверху и
          // разбирается платформой, как любой другой style.
          style: [props?.style, { fontFamily: family, fontWeight: undefined }],
        },
        ref,
      );
    };
  }
}

export default applyGlobalFonts;
