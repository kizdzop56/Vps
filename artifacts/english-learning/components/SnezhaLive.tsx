// ─────────────────────────────────────────────────────────────────────────────
// ЖИВАЯ СНЕЖА: снежный леопард, нарисованный путями, с покадровой мимикой.
//
// ── Почему вектор, а не картинки ────────────────────────────────────────────
// Мимика — это кадры. Рот в речи меняется 8-10 раз в секунду, и картинками это
// означало бы десятки файлов на каждое состояние, каждый со своим шансом на
// кривую вырезку фона. Мы уже проходили это на mascot_full.png: у празднующей
// позы вырезало ЖИВОТ и внутренность РТА, потому что фон убирали по цвету, а
// живот и рот — такие же светлые замкнутые области (см. шапку
// AnimatedMascotImage.tsx).
//
// У путей этой болезни нет по построению: закрашено ровно то, что закрашено.
// Плюс рот, уши, зрачки и дыхание получают ЧИСЛОВЫЕ параметры, а значит кадры
// задаются таблицей, а не рисуются заново.
//
// Картинка mascot_full.png остаётся во всех окнах и подсказках: она подробнее.
// Эта Снежа — для разговора, где важна не детализация, а то, что персонаж
// реагирует на происходящее.
//
// ── Откуда объём ────────────────────────────────────────────────────────────
// Плоская заливка выглядела бы наклейкой. Объём собран так же, как в рисованной
// мультипликации:
//   • радиальные градиенты на голове и корпусе — свет сверху слева;
//   • отдельный слой тени в нижнем правом углу силуэта;
//   • блик на макушке и два блика в каждом глазу;
//   • тёмная обводка одной толщины по всему силуэту;
//   • мягкая тень на полу — без неё персонаж висит в воздухе.
//
// ── Кадры, а не пружины ─────────────────────────────────────────────────────
// Состояние переключает ТАБЛИЦУ КАДРОВ, каждый кадр — набор чисел (подъём
// головы, наклон, поворот ушей, форма рта, глаза, зрачки). Один таймер тикает,
// индекс идёт по кругу.
//
// Так сделано намеренно: для дыхания плавная интерполяция годится, а для речи
// нет — губы должны ЩЁЛКАТЬ между формами, иначе получается рыба, открывающая
// рот в замедленной съёмке. Рисованная мультипликация «на двойках» работает
// ровно так же, и 8-10 кадров в секунду для этого достаточно.
//
// ── Что и когда происходит ──────────────────────────────────────────────────
//   idle   — стоит и дышит: корпус чуть растёт, голова поднимается и опадает,
//            ухо иногда дёргается;
//   listen — слушает: уши вперёд, голова набок, зрачки шире, редкий кивок;
//   speak  — говорит: рот идёт по формам с речевым ритмом и паузами на границах
//            слов, голова покачивается в такт;
//   think  — ждёт ответа: взгляд уходит вверх в сторону, глаза прищурены,
//            дыхание реже.
//
// Моргание живёт отдельно от состояний: это свои три кадра (прищур, закрыто,
// прищур), которые накладываются поверх любого состояния по расписанию. Внутри
// таблиц его нет намеренно — иначе в каждой пришлось бы держать копию.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, {
  Defs, RadialGradient, LinearGradient, Stop, ClipPath,
  G, Path, Ellipse, Circle,
} from "react-native-svg";

/** Что Снежа делает прямо сейчас. */
export type SnezhaState = "idle" | "listen" | "speak" | "think";

/** Пропорция рисунка: ширина к высоте. Нужна экранам для расчёта места. */
export const SNEZHA_ASPECT = 320 / 400;

// ── Палитра ─────────────────────────────────────────────────────────────────
//
// Взята с рисунка Снежи, а не из темы приложения: это шерсть зверя, а не
// поверхность интерфейса. Общее с продуктом одно — фиолетовые глаза.
const C = {
  line: "#3b2836",
  furLight: "#fbfafc",
  furMid: "#dedae6",
  furDark: "#b9b3c6",
  white: "#ffffff",
  whiteShade: "#ece9f2",
  spot: "#565061",
  spotSoft: "#6b6577",
  earPink: "#f3a7b7",
  earPinkDeep: "#e5899d",
  nose: "#ef92a6",
  noseLine: "#cd6d84",
  pad: "#f1a2b0",
  irisTop: "#c4b5fd",
  irisMid: "#8b5cf6",
  irisDeep: "#5b21b6",
  pupil: "#2a1533",
  mouth: "#b3384f",
  tongue: "#f28fa2",
  shadow: "#4c1d95",
} as const;

// ── Кадр ────────────────────────────────────────────────────────────────────

type EyeState = "open" | "half" | "closed";

/**
 * Форма рта. Ноль — закрытая улыбка, дальше по раскрытию.
 *
 * Формы речевые: узкая щель, средняя, широкая и круглая «о». Точной фонетики
 * тут быть не может — расшифровки своей реплики у клиента нет, звук приходит
 * готовым файлом. Но глаз читает совпадение по РИТМУ, а не по буквам, поэтому
 * чередование форм с паузами убедительнее одной открытой.
 */
type MouthShape = 0 | 1 | 2 | 3 | 4 | 5;

type Frame = {
  /** Вертикальный масштаб корпуса: вдох. Растёт от земли, а не от центра. */
  breath: number;
  /** Подъём головы, px. Отрицательное — вверх. */
  headY: number;
  /** Наклон головы, градусы. */
  tilt: number;
  /** Поворот ушей, градусы. Минус — вперёд, к зрителю. */
  earL: number;
  earR: number;
  eyes: EyeState;
  mouth: MouthShape;
  /** Масштаб зрачка: внимание расширяет. */
  pupil: number;
  /** Смещение зрачка, px: направление взгляда. */
  pupilX: number;
  pupilY: number;
};

const BASE: Frame = {
  breath: 1, headY: 0, tilt: 0, earL: 0, earR: 0,
  eyes: "open", mouth: 0, pupil: 1, pupilX: 0, pupilY: 0,
};

function frames(list: Partial<Frame>[]): Frame[] {
  return list.map((f) => ({ ...BASE, ...f }));
}

// ── ДЫШИТ (12 кадров по 140 мс, цикл 1.7 с) ────────────────────────────────
//
// Вдох длиннее выдоха, как у настоящего дыхания. Голова идёт за корпусом с
// отставанием на кадр: если поднимать одновременно, зверь выглядит цельным
// куском, который дёрнули за нитку.
//
// В кадрах 8-9 дёргается левое ухо. Это единственное, что отличает «дышит» от
// «замер»: живое существо не бывает неподвижным целую секунду.
const IDLE = frames([
  { breath: 1.000, headY: 0 },
  { breath: 1.008, headY: 0 },
  { breath: 1.016, headY: -0.6 },
  { breath: 1.023, headY: -1.2 },
  { breath: 1.029, headY: -1.8 },
  { breath: 1.032, headY: -2.2 },
  { breath: 1.030, headY: -2.4 },
  { breath: 1.024, headY: -2.0 },
  { breath: 1.016, headY: -1.4, earL: -7 },
  { breath: 1.009, headY: -0.8, earL: -3 },
  { breath: 1.003, headY: -0.3 },
  { breath: 1.000, headY: 0 },
]);

// ── СЛУШАЕТ (10 кадров по 130 мс) ──────────────────────────────────────────
//
// Три признака внимания, и нужны все три:
//   уши развёрнуты ВПЕРЁД — у кошачьих это буквально «слушаю»;
//   голова НАБОК — поза вопроса, знакомая по собакам и детям;
//   зрачки ШИРЕ — сосредоточенность.
//
// В кадрах 4-5 ухо дёргается сильнее, будто поймала звук. Без этого поза
// красивая, но мёртвая — а держится она всё время, пока ученик говорит.
const LISTEN = frames([
  { breath: 1.000, headY: 0,    tilt: -4.5, earL: -14, earR: 12, pupil: 1.16, pupilY: -1 },
  { breath: 1.008, headY: -0.8, tilt: -5.5, earL: -16, earR: 14, pupil: 1.18, pupilY: -1 },
  { breath: 1.016, headY: -1.6, tilt: -6.5, earL: -17, earR: 15, pupil: 1.20, pupilY: -1.5 },
  { breath: 1.020, headY: -2.0, tilt: -7.0, earL: -17, earR: 16, pupil: 1.20, pupilY: -1.5 },
  { breath: 1.018, headY: -1.6, tilt: -6.5, earL: -25, earR: 16, pupil: 1.22, pupilX: -1 },
  { breath: 1.012, headY: -1.0, tilt: -5.5, earL: -22, earR: 15, pupil: 1.22, pupilX: -1 },
  { breath: 1.006, headY: -0.4, tilt: -4.5, earL: -15, earR: 14, pupil: 1.18 },
  { breath: 1.002, headY: 0.2,  tilt: -4.0, earL: -14, earR: 13, pupil: 1.16 },
  { breath: 1.000, headY: 0.4,  tilt: -4.0, earL: -14, earR: 12, pupil: 1.16, pupilY: 1 },
  { breath: 1.000, headY: 0.2,  tilt: -4.5, earL: -14, earR: 12, pupil: 1.16 },
]);

// ── ГОВОРИТ (16 кадров по 105 мс, цикл 1.7 с) ──────────────────────────────
//
// Главное здесь — НУЛИ. Рот, открывающийся ровным маятником, читается как
// жующая рыба. Речь состоит из слов, между словами рот смыкается — поэтому в
// последовательности стоят закрытые кадры (3, 10), а рисунок раскрытия
// неровный: 1-3-2, 2-4-3, 3-2.
//
// Голова опускается на самых открытых кадрах: челюсть тянет её вниз. Наклон
// качается на ±2.5° — говорящий не держит голову в тисках.
//
// Уши слегка отведены назад: у кошачьих это спокойная болтовня, а не
// настороженность.
const SPEAK = frames([
  { mouth: 1, headY: 0,    tilt: 0.0,  earL: -3, earR: 3, breath: 1.000 },
  { mouth: 3, headY: -1.5, tilt: 1.0,  earL: -4, earR: 4, breath: 1.006 },
  { mouth: 2, headY: -1.0, tilt: 1.8,  earL: -4, earR: 4, breath: 1.012 },
  { mouth: 0, headY: 0,    tilt: 2.4,  earL: -3, earR: 3, breath: 1.016 },
  { mouth: 2, headY: -0.8, tilt: 2.0,  earL: -2, earR: 2, breath: 1.018 },
  { mouth: 4, headY: -1.8, tilt: 1.2,  earL: -2, earR: 2, breath: 1.016 },
  { mouth: 3, headY: -1.6, tilt: 0.4,  earL: -3, earR: 3, breath: 1.010 },
  { mouth: 1, headY: -0.4, tilt: -0.6, earL: -4, earR: 4, breath: 1.004 },
  { mouth: 3, headY: -1.6, tilt: -1.6, earL: -4, earR: 4, breath: 1.000 },
  { mouth: 2, headY: -1.0, tilt: -2.2, earL: -3, earR: 3, breath: 1.004 },
  { mouth: 0, headY: 0,    tilt: -2.5, earL: -2, earR: 2, breath: 1.010 },
  { mouth: 1, headY: -0.6, tilt: -2.0, earL: -2, earR: 2, breath: 1.016 },
  { mouth: 4, headY: -1.8, tilt: -1.2, earL: -3, earR: 3, breath: 1.018 },
  { mouth: 2, headY: -1.2, tilt: -0.4, earL: -4, earR: 4, breath: 1.014 },
  { mouth: 3, headY: -1.6, tilt: 0.4,  earL: -4, earR: 4, breath: 1.008 },
  { mouth: 5, headY: -0.6, tilt: 0.8,  earL: -3, earR: 3, breath: 1.002 },
]);

// ── ЖДЁТ ОТВЕТА (12 кадров по 160 мс) ──────────────────────────────────────
//
// Взгляд уходит вверх и в сторону — знак «соображаю», понятный без подписи.
// Состояние нужно потому, что ожидание сервера длится секунды, и всё это время
// Снежа не должна выглядеть так же, как в покое: иначе непонятно, дошла ли
// реплика вообще.
const THINK = frames([
  { breath: 1.000, headY: 0,    tilt: 3.0, earL: 4, earR: -9,  eyes: "half", pupilX: 3,   pupilY: -4 },
  { breath: 1.006, headY: -0.6, tilt: 3.5, earL: 4, earR: -10, eyes: "half", pupilX: 3.5, pupilY: -4 },
  { breath: 1.014, headY: -1.2, tilt: 4.0, earL: 5, earR: -10, eyes: "half", pupilX: 4,   pupilY: -4.5 },
  { breath: 1.020, headY: -1.8, tilt: 4.5, earL: 5, earR: -11, eyes: "half", pupilX: 4,   pupilY: -4.5 },
  { breath: 1.024, headY: -2.0, tilt: 4.5, earL: 5, earR: -11, eyes: "half", pupilX: 3.5, pupilY: -4 },
  { breath: 1.022, headY: -1.8, tilt: 4.0, earL: 4, earR: -10, eyes: "half", pupilX: 2.5, pupilY: -3.5 },
  { breath: 1.016, headY: -1.4, tilt: 3.5, earL: 4, earR: -9,  eyes: "half", pupilX: 2,   pupilY: -3 },
  { breath: 1.010, headY: -1.0, tilt: 3.0, earL: 3, earR: -9,  eyes: "half", pupilX: 2.5, pupilY: -3.5 },
  { breath: 1.004, headY: -0.6, tilt: 2.5, earL: 3, earR: -8,  eyes: "half", pupilX: 3,   pupilY: -4 },
  { breath: 1.000, headY: -0.2, tilt: 2.5, earL: 4, earR: -8,  eyes: "half", pupilX: 3.5, pupilY: -4 },
  { breath: 1.000, headY: 0,    tilt: 2.8, earL: 4, earR: -9,  eyes: "half", pupilX: 3.5, pupilY: -4.5 },
  { breath: 1.000, headY: 0,    tilt: 3.0, earL: 4, earR: -9,  eyes: "half", pupilX: 3,   pupilY: -4 },
]);

const REEL: Record<SnezhaState, Frame[]> = {
  idle: IDLE, listen: LISTEN, speak: SPEAK, think: THINK,
};

/** Длина кадра. Речь быстрее всех, раздумье медленнее. */
const TICK: Record<SnezhaState, number> = {
  idle: 140, listen: 130, speak: 105, think: 160,
};

// ── МОРГАНИЕ (3 кадра, поверх любого состояния) ────────────────────────────
//
// Расписание считается от номера тика, а не хранится в состоянии: лишняя
// переменная тут ничего не добавляет, а перерисовку вызывает.
//
// Два разных периода (29 и 47 тиков) дают неровный ритм. Один период читается
// как метроном: глаз ловит регулярность и перестаёт верить.
const BLINK: EyeState[] = ["half", "closed", "half"];

function blinkAt(tick: number): EyeState | null {
  const a = tick % 29;
  if (a < BLINK.length) return BLINK[a]!;
  const b = tick % 47;
  if (b < BLINK.length) return BLINK[b]!;
  return null;
}

// ── Формы рта ───────────────────────────────────────────────────────────────
//
// Раскрытие задано полуосями: так кадр остаётся числами, а не ещё одним путём,
// который надо перерисовывать при каждой правке рта.
const MOUTH: Record<MouthShape, { rx: number; ry: number }> = {
  0: { rx: 0,  ry: 0  },
  1: { rx: 12, ry: 7  },
  2: { rx: 15, ry: 11 },
  3: { rx: 18, ry: 16 },
  4: { rx: 11, ry: 13 },
  5: { rx: 13, ry: 8  },
};

// ── Силуэты ─────────────────────────────────────────────────────────────────
//
// Вынесены в константы, потому что каждый нужен дважды: как заливка и как
// область отсечения для розеток. Две копии пути рано или поздно разъедутся.
const HEAD_PATH =
  "M160 40 C112 40 74 72 68 116 C62 152 82 186 118 200 " +
  "C132 206 148 208 160 208 C172 208 188 206 202 200 " +
  "C238 186 258 152 252 116 C246 72 208 40 160 40 Z";

const BODY_PATH =
  "M160 188 C118 188 96 214 88 252 C78 292 66 320 74 340 " +
  "C82 358 110 363 140 361 L180 361 " +
  "C210 363 238 358 246 340 C254 320 242 292 232 252 " +
  "C224 214 202 188 160 188 Z";

const CHEST_PATH =
  "M160 206 C130 206 110 228 108 258 C106 288 122 322 160 342 " +
  "C198 322 214 288 212 258 C210 228 190 206 160 206 Z";

/** Розетки на голове. Отсекаются силуэтом, поэтому за край не вылезут. */
const HEAD_SPOTS: [number, number, number, number][] = [
  [146, 62, 4.5, 6.5], [160, 56, 4, 6], [174, 62, 4.5, 6.5],
  [134, 74, 4, 6], [186, 74, 4, 6], [160, 76, 3.5, 5],
  [114, 96, 8, 5.5], [206, 96, 8, 5.5],
  [88, 110, 7, 9], [232, 110, 7, 9],
  [80, 140, 10, 8], [240, 140, 10, 8],
  [92, 170, 9, 7], [228, 170, 9, 7],
  [104, 192, 7, 5.5], [216, 192, 7, 5.5],
];

/** Розетки на корпусе. Белая грудь рисуется поверх и часть скрывает. */
const BODY_SPOTS: [number, number, number, number][] = [
  [98, 238, 13, 10], [222, 236, 13, 10],
  [84, 282, 14, 11], [236, 280, 14, 11],
  [92, 320, 12, 9], [228, 318, 12, 9],
  [78, 258, 9, 7], [242, 256, 9, 7],
];

interface Props {
  state?: SnezhaState;
  width?: number;
  /** Остановить кадры: экран не виден или движение сейчас лишнее. */
  still?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SnezhaLive({ state = "idle", width = 140, still = false, style }: Props) {
  const height = Math.round(width / SNEZHA_ASPECT);

  // Уникальный хвост для id градиентов. Без него два экземпляра на одной
  // странице делят одни id, и второй забирает градиенты первого.
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");

  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (still) return;
    const id = setInterval(() => setTick((t) => (t + 1) % 100000), TICK[state]);
    return () => clearInterval(id);
  }, [state, still]);

  const reel = REEL[state];
  const f = reel[tick % reel.length]!;
  // Кадр состояния важнее расписания моргания: в раздумье глаза уже прищурены.
  const blink = still ? null : blinkAt(tick);
  const eyes: EyeState = f.eyes !== "open" ? f.eyes : (blink ?? "open");

  const eyeParts = [
    { cx: 122, sign: 1 },
    { cx: 198, sign: -1 },
  ] as const;

  const whiskers = [
    "M132 166 C112 160 96 156 82 154",
    "M130 174 C110 172 92 171 78 172",
    "M132 182 C114 187 100 192 88 199",
    "M188 166 C208 160 224 156 238 154",
    "M190 174 C210 172 228 171 242 172",
    "M188 182 C206 187 220 192 232 199",
  ];

  const { rx: mrx, ry: mry } = MOUTH[f.mouth];
  const mcy = 174 + mry * 0.55;

  return (
    <View style={[{ width, height }, style]}>
      <Svg width={width} height={height} viewBox="0 0 320 400">
        <Defs>
          <RadialGradient id={`fur${uid}`} cx="36%" cy="26%" r="78%">
            <Stop offset="0" stopColor={C.furLight} />
            <Stop offset="0.55" stopColor={C.furMid} />
            <Stop offset="1" stopColor={C.furDark} />
          </RadialGradient>
          <RadialGradient id={`body${uid}`} cx="38%" cy="18%" r="82%">
            <Stop offset="0" stopColor={C.furLight} />
            <Stop offset="0.6" stopColor={C.furMid} />
            <Stop offset="1" stopColor={C.furDark} />
          </RadialGradient>
          <LinearGradient id={`chest${uid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.white} />
            <Stop offset="1" stopColor={C.whiteShade} />
          </LinearGradient>
          <RadialGradient id={`iris${uid}`} cx="38%" cy="28%" r="72%">
            <Stop offset="0" stopColor={C.irisTop} />
            <Stop offset="0.5" stopColor={C.irisMid} />
            <Stop offset="1" stopColor={C.irisDeep} />
          </RadialGradient>
          <LinearGradient id={`ear${uid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.earPink} />
            <Stop offset="1" stopColor={C.earPinkDeep} />
          </LinearGradient>
          <ClipPath id={`headClip${uid}`}>
            <Path d={HEAD_PATH} />
          </ClipPath>
          <ClipPath id={`bodyClip${uid}`}>
            <Path d={BODY_PATH} />
          </ClipPath>
        </Defs>

        {/* Тень на полу. Дышит вместе со зверем, но в противофазе: на вдохе он
            приподнимается, и тень поджимается. */}
        <Ellipse
          cx={160}
          cy={374}
          rx={100 - (f.breath - 1) * 260}
          ry={14}
          fill={C.shadow}
          opacity={0.16}
        />

        {/* ── Хвост, за корпусом ──
            Двойной штрих: тёмный шире, светлый уже. Так обводка получается
            сама, без отдельного замкнутого контура. */}
        <G>
          <Path
            d="M246 300 C276 308 290 326 282 348 C274 368 240 378 200 368"
            stroke={C.line}
            strokeWidth={40}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M246 300 C276 308 290 326 282 348 C274 368 240 378 200 368"
            stroke={C.furMid}
            strokeWidth={33}
            strokeLinecap="round"
            fill="none"
          />
          <Ellipse cx={281} cy={330} rx={8} ry={7} fill={C.spot} />
          <Ellipse cx={272} cy={356} rx={9} ry={7} fill={C.spot} />
          {/* Кончик заметно темнее: примета снежного леопарда. */}
          <Ellipse cx={208} cy={368} rx={22} ry={17} fill={C.line} />
          <Ellipse cx={208} cy={366} rx={18} ry={13} fill={C.spot} />
        </G>

        {/* ── Корпус: дышит ──
            Масштаб по вертикали с началом у земли (y = 361). Если растить от
            центра, зверь на вдохе уезжает в пол. */}
        <G transform={`translate(0 361) scale(1 ${f.breath}) translate(0 -361)`}>
          <Path d={BODY_PATH} fill={`url(#body${uid})`} stroke={C.line} strokeWidth={4} />

          <G clipPath={`url(#bodyClip${uid})`}>
            {BODY_SPOTS.map(([cx, cy, rx, ry], i) => (
              <Ellipse key={`bs${i}`} cx={cx} cy={cy} rx={rx} ry={ry} fill={C.spot} />
            ))}
            {/* Тень по правому борту: округлость там, где силуэт уходит от света. */}
            <Ellipse cx={252} cy={300} rx={64} ry={90} fill={C.shadow} opacity={0.1} />
          </G>

          {/* Передние лапы тем же двойным штрихом, что хвост. */}
          <Path d="M120 292 L116 342" stroke={C.line} strokeWidth={46} strokeLinecap="round" fill="none" />
          <Path d="M120 292 L116 342" stroke={C.furMid} strokeWidth={39} strokeLinecap="round" fill="none" />
          <Path d="M200 292 L204 342" stroke={C.line} strokeWidth={46} strokeLinecap="round" fill="none" />
          <Path d="M200 292 L204 342" stroke={C.furMid} strokeWidth={39} strokeLinecap="round" fill="none" />

          {/* Белая грудь поверх лап: она их и должна перекрывать сверху. */}
          <Path d={CHEST_PATH} fill={`url(#chest${uid})`} stroke={C.line} strokeWidth={3.4} />
          {/* Две пряди: без них грудь выглядит пластиковой вставкой. */}
          <Path d="M136 248 C142 272 148 302 160 322" stroke={C.whiteShade} strokeWidth={3} fill="none" strokeLinecap="round" />
          <Path d="M184 248 C178 272 172 302 160 322" stroke={C.whiteShade} strokeWidth={3} fill="none" strokeLinecap="round" />

          {/* Левая лапа развёрнута подушечками к зрителю: после хвоста это
              самая узнаваемая деталь. */}
          <Ellipse cx={114} cy={350} rx={30} ry={17} fill={C.white} stroke={C.line} strokeWidth={3.6} />
          <Ellipse cx={114} cy={354} rx={13} ry={7.5} fill={C.pad} />
          <Circle cx={98} cy={343} r={4.6} fill={C.pad} />
          <Circle cx={108} cy={339} r={4.8} fill={C.pad} />
          <Circle cx={120} cy={339} r={4.8} fill={C.pad} />
          <Circle cx={130} cy={343} r={4.6} fill={C.pad} />

          {/* Правая стоит нормально: два развёрнутых веера подряд читались бы
              как ошибка рисунка. */}
          <Ellipse cx={206} cy={350} rx={30} ry={17} fill={C.white} stroke={C.line} strokeWidth={3.6} />
          <Path
            d="M196 340 L195 350 M206 338 L206 350 M216 340 L217 350"
            stroke={C.line}
            strokeWidth={2.4}
            opacity={0.45}
            strokeLinecap="round"
            fill="none"
          />
        </G>

        {/* ── Голова: поднимается на вдохе и наклоняется ──
            Точка вращения — шея (160, 206), а не центр головы: голова
            поворачивается на шее, иначе она плавает отдельно от тела. */}
        <G transform={`translate(0 ${f.headY}) rotate(${f.tilt} 160 206)`}>

          {/* Уши за головой: так их основание не нужно стыковать с силуэтом. */}
          <G transform={`rotate(${f.earL} 112 78)`}>
            <Path
              d="M104 80 C90 52 84 28 92 22 C102 16 124 34 138 58 C124 62 112 70 104 80 Z"
              fill={`url(#fur${uid})`}
              stroke={C.line}
              strokeWidth={4}
            />
            <Path
              d="M108 74 C97 52 94 34 99 30 C106 26 120 40 130 58 C120 62 113 68 108 74 Z"
              fill={`url(#ear${uid})`}
            />
            {/* Шерсть в ухе у снежного леопарда белая и торчит. */}
            <Path d="M104 64 C112 59 120 57 127 59" stroke={C.white} strokeWidth={3.4} fill="none" strokeLinecap="round" />
            <Path d="M106 72 C114 66 122 63 129 65" stroke={C.white} strokeWidth={3} fill="none" strokeLinecap="round" />
          </G>

          <G transform={`rotate(${f.earR} 208 78)`}>
            <Path
              d="M216 80 C230 52 236 28 228 22 C218 16 196 34 182 58 C196 62 208 70 216 80 Z"
              fill={`url(#fur${uid})`}
              stroke={C.line}
              strokeWidth={4}
            />
            <Path
              d="M212 74 C223 52 226 34 221 30 C214 26 200 40 190 58 C200 62 207 68 212 74 Z"
              fill={`url(#ear${uid})`}
            />
            <Path d="M216 64 C208 59 200 57 193 59" stroke={C.white} strokeWidth={3.4} fill="none" strokeLinecap="round" />
            <Path d="M214 72 C206 66 198 63 191 65" stroke={C.white} strokeWidth={3} fill="none" strokeLinecap="round" />
          </G>

          <Path d={HEAD_PATH} fill={`url(#fur${uid})`} stroke={C.line} strokeWidth={4.2} />

          <G clipPath={`url(#headClip${uid})`}>
            {HEAD_SPOTS.map(([cx, cy, rx, ry], i) => (
              <Ellipse key={`hs${i}`} cx={cx} cy={cy} rx={rx} ry={ry} fill={C.spot} />
            ))}
            {/* Тень справа снизу и блик на макушке: пара, которая делает голову
                шаром, а не кругом. */}
            <Ellipse cx={236} cy={176} rx={62} ry={62} fill={C.shadow} opacity={0.11} />
            <Ellipse cx={122} cy={72} rx={44} ry={24} fill={C.white} opacity={0.34} />
          </G>

          {/* ── Глаза ── */}
          {eyeParts.map(({ cx, sign }) => {
            const cy = 124;
            if (eyes === "closed") {
              // Закрытый глаз — не сплюснутый открытый, а своя дуга: так
              // моргание выглядит мягким, а не поломкой рисунка.
              return (
                <Path
                  key={`eye${cx}`}
                  d={`M${cx - 24} ${cy - 4} C${cx - 14} ${cy + 14} ${cx + 14} ${cy + 14} ${cx + 24} ${cy - 6}`}
                  stroke={C.line}
                  strokeWidth={5.5}
                  strokeLinecap="round"
                  fill="none"
                />
              );
            }
            const squash = eyes === "half" ? 0.5 : 1;
            return (
              <G
                key={`eye${cx}`}
                transform={`translate(${cx} ${cy}) scale(1 ${squash}) translate(${-cx} ${-cy})`}
              >
                <Ellipse cx={cx} cy={cy} rx={26} ry={28} fill={C.line} />
                <Ellipse cx={cx} cy={cy} rx={23} ry={25} fill={`url(#iris${uid})`} />
                <Ellipse cx={cx} cy={cy} rx={19} ry={21} fill="none" stroke={C.irisTop} strokeWidth={2.2} opacity={0.75} />
                <Ellipse
                  cx={cx + f.pupilX * sign}
                  cy={cy + 2 + f.pupilY}
                  rx={11 * f.pupil}
                  ry={14 * f.pupil}
                  fill={C.pupil}
                />
                {/* Два блика в разных углах: один читается как наклейка. */}
                <Circle cx={cx - 8 * sign} cy={cy - 11} r={6.4} fill={C.white} />
                <Circle cx={cx + 9 * sign} cy={cy + 12} r={3.6} fill={C.white} opacity={0.85} />
                <Circle cx={cx + 11 * sign} cy={cy - 14} r={2} fill={C.white} opacity={0.9} />
              </G>
            );
          })}

          {/* Ресницы поверх глаза: у Снежи они заметные, это половина взгляда. */}
          <Path d="M96 112 C102 92 142 90 148 114" stroke={C.line} strokeWidth={6.5} strokeLinecap="round" fill="none" />
          <Path d="M148 110 L157 100" stroke={C.line} strokeWidth={5} strokeLinecap="round" fill="none" />
          <Path d="M224 112 C218 92 178 90 172 114" stroke={C.line} strokeWidth={6.5} strokeLinecap="round" fill="none" />
          <Path d="M172 110 L163 100" stroke={C.line} strokeWidth={5} strokeLinecap="round" fill="none" />

          {/* ── Морда ── */}
          <Ellipse cx={160} cy={176} rx={46} ry={27} fill={C.white} stroke={C.line} strokeWidth={3} />

          {/* Переносица двумя короткими линиями: без неё нос приклеен. */}
          <Path d="M150 136 C152 128 156 124 160 122" stroke={C.line} strokeWidth={3} opacity={0.3} fill="none" strokeLinecap="round" />
          <Path d="M170 136 C168 128 164 124 160 122" stroke={C.line} strokeWidth={3} opacity={0.3} fill="none" strokeLinecap="round" />
          <Path
            d="M160 137 C147 137 139 141 139 148 C139 157 152 166 160 166 C168 166 181 157 181 148 C181 141 173 137 160 137 Z"
            fill={C.nose}
            stroke={C.noseLine}
            strokeWidth={2.6}
          />
          <Ellipse cx={152} cy={144} rx={5} ry={3} fill={C.white} opacity={0.5} />

          {/* ── Рот: тот самый кадр ──
              Порядок важен: сначала полость, потом язык и клыки, и только затем
              линия губы — она обводит рот поверх всего. */}
          {mrx === 0 ? (
            <Path
              d="M138 172 C146 184 157 184 160 173 C163 184 174 184 182 172"
              stroke={C.line}
              strokeWidth={4.5}
              strokeLinecap="round"
              fill="none"
            />
          ) : (
            <G>
              <Ellipse cx={160} cy={mcy} rx={mrx} ry={mry} fill={C.mouth} stroke={C.line} strokeWidth={3.2} />
              <Ellipse cx={160} cy={mcy + mry * 0.34} rx={mrx * 0.7} ry={mry * 0.42} fill={C.tongue} />
              {/* Клыки только на широком раскрытии: на узком они превращают
                  речь в оскал. */}
              {mry >= 11 && (
                <G>
                  <Path d={`M${160 - mrx * 0.52} ${mcy - mry + 1} l 5 0 l -2.5 6 z`} fill={C.white} />
                  <Path d={`M${160 + mrx * 0.52} ${mcy - mry + 1} l -5 0 l 2.5 6 z`} fill={C.white} />
                </G>
              )}
              <Path
                d={`M138 172 C146 180 156 180 160 ${mcy - mry} C164 180 174 180 182 172`}
                stroke={C.line}
                strokeWidth={4}
                strokeLinecap="round"
                fill="none"
              />
            </G>
          )}

          {/* Точки от усов. */}
          <G opacity={0.5}>
            <Circle cx={138} cy={166} r={1.8} fill={C.spotSoft} />
            <Circle cx={132} cy={174} r={1.8} fill={C.spotSoft} />
            <Circle cx={140} cy={181} r={1.8} fill={C.spotSoft} />
            <Circle cx={182} cy={166} r={1.8} fill={C.spotSoft} />
            <Circle cx={188} cy={174} r={1.8} fill={C.spotSoft} />
            <Circle cx={180} cy={181} r={1.8} fill={C.spotSoft} />
          </G>

          {/* Усы двойным штрихом: тёмный снизу даёт им читаемость на светлой
              морде, белый сверху — сам волос. */}
          <G stroke={C.line} strokeWidth={4} opacity={0.28} fill="none" strokeLinecap="round">
            {whiskers.map((d, i) => <Path key={`wd${i}`} d={d} />)}
          </G>
          <G stroke={C.white} strokeWidth={2.2} fill="none" strokeLinecap="round">
            {whiskers.map((d, i) => <Path key={`wl${i}`} d={d} />)}
          </G>
        </G>
      </Svg>
    </View>
  );
}

export default SnezhaLive;
