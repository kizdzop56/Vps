import React from "react";
import { AnimatedMascotImage, POSE_RATIO } from "@/components/AnimatedMascotImage";

/** Пропорция обычной, вертикальной позы: ширина к высоте. */
export const MASCOT_RATIO = POSE_RATIO.wave;

/**
 * Маскот не должен становиться меньше этого, даже если места совсем нет: ниже
 * начинается не персонаж, а иконка.
 */
const MIN_HEIGHT = 190;

/** Шире этого не растим: на планшете зверь во весь экран уже не мил, а странен. */
const MAX_WIDTH = 460;

/**
 * Размер маскота в окне.
 *
 * ЗАЧЕМ. Раньше оба окна ограничивали высоту долей экрана — 44 % в окне реплики
 * и 50 % в подсказке по вкладке. Доли взяты на глаз, и маскот выходил одинаково
 * мелким на любом телефоне, независимо от того, сколько места реально свободно:
 * в окне реплики он занимал меньше трети ширины при почти пустом экране.
 *
 * Считаем наоборот: сколько нужно тому, что стоит НИЖЕ маскота (имя, пузырь с
 * репликой, кнопка), столько и резервируем, остальное отдаём персонажу. Ради
 * него окно и открывается.
 *
 * @param reserved сколько пикселей по вертикали занимает всё под маскотом,
 *   вместе с отступами окна. Лучше слегка переоценить: недобор режет текст, а
 *   перебор всего лишь чуть уменьшает картинку.
 */
export function mascotBox(opts: {
  W: number;
  H: number;
  reserved: number;
  /** Ширина к высоте. Для «лежит» она другая — см. POSE_RATIO. */
  ratio?: number;
}): { width: number; height: number } {
  const ratio = opts.ratio ?? MASCOT_RATIO;

  let width = Math.min(opts.W - 12, MAX_WIDTH);
  let height = Math.round(width / ratio);

  const maxHeight = Math.max(MIN_HEIGHT, Math.round(opts.H - opts.reserved));
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height * ratio);
  }
  return { width, height };
}

interface Props {
  width: number;
  height: number;
}

export function WavingMascot({ width, height }: Props) {
  return <AnimatedMascotImage pose="wave" width={width} height={height} />;
}
