// Native fallback: the animated WebGL veil is web-only.
// On iOS/Android the hero keeps its static gradient background.
export type DarkVeilProps = {
  hueShift?: number;
  noiseIntensity?: number;
  scanlineIntensity?: number;
  speed?: number;
  scanlineFrequency?: number;
  warpAmount?: number;
  resolutionScale?: number;
};

export default function DarkVeil(_props: DarkVeilProps) {
  return null;
}
