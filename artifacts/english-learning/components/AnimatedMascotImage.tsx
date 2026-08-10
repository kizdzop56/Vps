// ─────────────────────────────────────────────────────────────────────────────
// Картинка маскота в нужной позе.
//
// ── Кеш на диске, а не в памяти ──────────────────────────────────────────────
// Картинки поз весят по 700–900 КБ. С cachePolicy="memory" кеш живёт только до
// перезагрузки страницы, поэтому на телефоне с медленной сетью каждое открытие
// окна маскота заново тянуло почти мегабайт — зверь появлялся частями или не
// успевал нарисоваться вовсе.
//
// "memory-disk" переживает перезагрузку: картинка скачивается один раз за всё
// время жизни браузерного кеша.
//
// ── Почему нет анимации проявления ──────────────────────────────────────────
// Была: transition={180}. expo-image на вебе рисует картинку с opacity 0 и
// анимирует её к единице ПО СОБЫТИЮ ЗАГРУЗКИ. Если событие не пришло — а на iOS
// Safari картинка из кэша декодируется синхронно, и событие теряется, — картинка
// остаётся прозрачной: файл загружен, место занято, зверя нет.
//
// Это и был «маскот не прорисовывается». Проявление здесь ничего не давало:
// окно и так выезжает целиком, вместе с маскотом.
//
// ── Ожидание видно ──────────────────────────────────────────────────────────
// Пока картинка идёт по сети, на её месте мягкая плашка с индикатором. Пустота
// на этом месте неотличима от поломки, а на 3G она держится секунды.
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { Image } from "expo-image";

export type MascotPose =
  | "wave" | "celebrate" | "think" | "happy" | "excited"
  | "curious" | "point" | "laugh" | "sit" | "lie";

/**
 * Пропорция позы: ШИРИНА, делённая на высоту.
 *
 * Почти все позы вертикальные (9/16), «лежит» — единственная горизонтальная.
 * Экспортируется, потому что размер маскота считают окна (Mascot, TabGuide), и
 * второй список пропорций рядом с этим рано или поздно разошёлся бы.
 */
export const POSE_RATIO: Record<MascotPose, number> = {
  wave: 9/16, celebrate: 9/16, think: 9/16, happy: 9/16, excited: 9/16,
  curious: 9/16, point: 9/16, laugh: 9/16, sit: 9/16, lie: 16/9,
};

const SRC: Record<MascotPose, any> = {
  wave:      require("../assets/images/mascot_full.png"),
  celebrate: require("../assets/images/mascot_full_celebrate.png"),
  think:     require("../assets/images/mascot_full_think.png"),
  happy:     require("../assets/images/mascot_happy.png"),
  excited:   require("../assets/images/mascot_excited.png"),
  curious:   require("../assets/images/mascot_curious.png"),
  point:     require("../assets/images/mascot_point.png"),
  laugh:     require("../assets/images/mascot_laugh.png"),
  sit:       require("../assets/images/mascot_sit.png"),
  lie:       require("../assets/images/mascot_lie.png"),
};

/**
 * Через сколько снимать плашку ожидания, даже если событие загрузки не пришло.
 *
 * Страховка от той же беды, что и с transition: событие может потеряться, а
 * спиннер под уже нарисованным зверем — это хуже, чем отсутствие спиннера.
 */
const WAIT_GIVE_UP_MS = 5000;

interface Props {
  pose?:   MascotPose;
  width?:  number;
  height?: number;
  style?:  any;
}

export function AnimatedMascotImage({ pose = "wave", width = 200, height, style }: Props) {
  const imgW = width;
  const imgH = height ?? Math.round(width / POSE_RATIO[pose]);

  const [waiting, setWaiting] = React.useState(true);
  /** Одна повторная попытка: на мобильной сети запрос отваливается сам по себе. */
  const [attempt, setAttempt] = React.useState(0);

  // Новая поза — новая загрузка. Без сброса плашка осталась бы снятой от
  // предыдущей картинки, и ожидание снова стало бы невидимым.
  React.useEffect(() => {
    setWaiting(true);
    setAttempt(0);
  }, [pose]);

  React.useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setWaiting(false), WAIT_GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [waiting, attempt]);

  return (
    <View style={[{ width: imgW, height: imgH }, style]}>
      {waiting && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
            borderRadius: 28,
            backgroundColor: "rgba(168,85,247,0.10)",
            alignItems: "center", justifyContent: "center",
          }}
        >
          <ActivityIndicator color="#c084fc" />
        </View>
      )}
      <Image
        // Ключ меняется при повторной попытке: без этого expo-image считает
        // источник тем же самым и заново не запрашивает.
        key={`${pose}-${attempt}`}
        source={SRC[pose]}
        style={{ width: imgW, height: imgH }}
        contentFit="contain"
        // Диск, а не только память: иначе каждая перезагрузка страницы = новая
        // загрузка почти мегабайта, и на медленной сети маскот не прорисуется.
        cachePolicy="memory-disk"
        priority="high"
        // onLoadEnd, а не onLoad: срабатывает и на успехе, и на ошибке, поэтому
        // плашка не залипает на неудачной загрузке.
        onLoadEnd={() => setWaiting(false)}
        onError={() => setAttempt((a) => (a === 0 ? 1 : a))}
      />
    </View>
  );
}
