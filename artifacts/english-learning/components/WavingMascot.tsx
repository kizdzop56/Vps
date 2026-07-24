import React from "react";
import { AnimatedMascotImage } from "@/components/AnimatedMascotImage";

export const MASCOT_RATIO = 9 / 16;

interface Props {
  width: number;
  height: number;
}

export function WavingMascot({ width, height }: Props) {
  return <AnimatedMascotImage pose="wave" width={width} height={height} />;
}
