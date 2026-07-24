// Native fallback: the animated WebGL prismatic burst is web-only.
// On iOS/Android the hero keeps its static dark background.
export type PrismaticBurstProps = {
  intensity?: number;
  speed?: number;
  animationType?: "rotate" | "rotate3d";
  colors?: string[];
  distort?: number;
  rayCount?: number;
  resolutionScale?: number;
};

export default function PrismaticBurst(_props: PrismaticBurstProps) {
  return null;
}
