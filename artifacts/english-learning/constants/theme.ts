// ─────────────────────────────────────────────────────────────────────────────
// Слой темы игрового дизайна.
//
// Базовые цвета живут в constants/colors.ts и НЕ меняются: это ось бренда
// индиго → фиолетовый → розовый, на которую завязаны роли, уровни и медали.
// Здесь только то, чего в базовой палитре не хватало для игрового вида:
// глубокие оттенки для нижней грани кнопок, тёплые акценты для стрика и
// медалей, а также токены теней, радиусов и длительностей анимаций.
//
// Зелёный намеренно не вводится: в этом продукте «успех» фиолетовый
// (colors.success = #8b5cf6), зелёный сломал бы узнаваемость.
// ─────────────────────────────────────────────────────────────────────────────

import { Platform } from "react-native";

/** Дополнительные оттенки на той же оси, что и базовая палитра. */
export const accents = {
  /** Яркая маджента — вершина градиентов, редкие акценты. */
  magenta: "#d946ef",
  /** Глубокий индиго — нижняя грань кнопок, тени в цвете. */
  indigoDeep: "#4338ca",
  /** Глубокий фиолет — нижняя грань вторичных поверхностей. */
  violetDeep: "#6d28d9",
  /** Лавандовый — «начато, но не выучено» в двойных прогресс-барах. */
  lavender: "#c7d2fe",
  /** Янтарь — огонь, серия дней. Тёплый акцент, использовать точечно. */
  amber: "#f59e0b",
  /** Золото — медали, корона, максимальные достижения. */
  gold: "#fbbf24",
} as const;

/** Градиенты по оси бренда. Массивы под expo-linear-gradient. */
export const gradients = {
  /** Основное действие: кнопка «Учить слова» и подобные. */
  action: ["#a855f7", "#6366f1"] as const,
  /** Награда: карточка уровня, крупные наградные поверхности. */
  reward: ["#6d28d9", "#a855f7", "#d946ef"] as const,
  /** Прогресс: заполнение полосы XP. */
  progress: ["#6366f1", "#a855f7", "#d946ef"] as const,
  /** Огонь: серия дней, сложные слова. */
  fire: ["#f59e0b", "#ec4899"] as const,
  /** Металл медали по сложности. */
  medalEasy: ["#fbbf24", "#f59e0b"] as const,
  medalMedium: ["#a855f7", "#6366f1"] as const,
  medalHard: ["#d946ef", "#6d28d9"] as const,
} as const;

/**
 * Радиусы. colors.radius (12) остаётся базовым для мелких элементов,
 * игровые поверхности заметно круглее — это и даёт «пухлый» характер.
 */
export const radii = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 30,
  pill: 999,
} as const;

/**
 * Физическая кнопка: у корпуса есть тёмная нижняя грань, при нажатии
 * корпус проседает на pressDepth и грань схлопывается. На вебе грань
 * делается через boxShadow, на нативе — через отдельный слой под кнопкой
 * (RN не поддерживает несколько теней у одного View).
 */
export const chunky = {
  /** На сколько пикселей проседает кнопка при нажатии. */
  pressDepth: 5,
  /** Высота тёмной грани в покое. */
  edge: 6,
  /** Длительность нажатия и возврата. */
  duration: 130,
} as const;

/**
 * Тени всегда в цвете элемента, а не серые: цветная тень читается как
 * свечение и держит экран живым. Серая тень на светло-фиолетовом фоне
 * выглядит грязью.
 */
export function colorShadow(color: string, level: 1 | 2 | 3 = 2) {
  const cfg = {
    1: { offset: 4, radius: 12, opacity: 0.22, elevation: 3 },
    2: { offset: 8, radius: 20, opacity: 0.3, elevation: 6 },
    3: { offset: 14, radius: 30, opacity: 0.38, elevation: 10 },
  }[level];

  if (Platform.OS === "android") {
    // На Android shadowColor работает только начиная с API 28, поэтому
    // полагаемся на elevation, а цвет задаём там, где он поддерживается.
    return { elevation: cfg.elevation, shadowColor: color };
  }
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: cfg.offset },
    shadowOpacity: cfg.opacity,
    shadowRadius: cfg.radius,
  };
}

/**
 * Длительности анимаций. Ключевое правило: анимируем только transform и
 * opacity, иначе на слабом телефоне поплывёт. Отскок разрешён строго в
 * наградных моментах (медаль, новый уровень) — везде ещё он читается как
 * несерьёзность.
 */
export const timing = {
  /** Нажатие кнопки, чип, мгновенный отклик. */
  press: 130,
  /** Реакция на ответ в тренажёре, появление подсказки. */
  react: 300,
  /** Ошибка: короткий шейк по X. */
  shake: 200,
  /** Раскрытие панели, переход между слайдами. */
  panel: 400,
  /** Заполнение полосы XP и кольца цели. */
  progress: 700,
  /** Наградный момент: медаль, новый уровень. */
  reward: 800,
  /** Появление списка: база плюс задержка на элемент. */
  listBase: 300,
  listStagger: 40,
  /** Максимум элементов со стаггером — дальше без задержки. */
  listStaggerMax: 8,
} as const;

/**
 * Типографика. Заголовки, числа и игровые надписи — Unbounded (широкий
 * характерный гротеск с кириллицей). Тело и таблицы — Manrope.
 * Шрифты подключаются в app/_layout.tsx через @expo-google-fonts.
 * Пока шрифты не загружены, RN подставит системный — верстка не ломается.
 */
export const fonts = {
  display: "Unbounded_900Black",
  displayBold: "Unbounded_800ExtraBold",
  displaySemi: "Unbounded_700Bold",
  text: "Manrope_500Medium",
  textBold: "Manrope_700Bold",
  textHeavy: "Manrope_800ExtraBold",
} as const;

/**
 * Шкала кегля. Контраст между ступенями не меньше 1.3 — промежуточные
 * размеры не плодим, иначе иерархия становится мутной.
 */
export const type = {
  screen: { fontSize: 27, lineHeight: 28, letterSpacing: -0.9 },
  section: { fontSize: 16, lineHeight: 20, letterSpacing: -0.3 },
  number: { fontSize: 26, lineHeight: 26, letterSpacing: -1 },
  body: { fontSize: 16, lineHeight: 25 },
  small: { fontSize: 13, lineHeight: 19 },
  label: { fontSize: 11, lineHeight: 14, letterSpacing: 1.3 },
} as const;

/** Шаг сетки 4pt. Отступы между смысловыми группами вдвое крупнее внутренних. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

const theme = { accents, gradients, radii, chunky, colorShadow, timing, fonts, type, space };
export default theme;
