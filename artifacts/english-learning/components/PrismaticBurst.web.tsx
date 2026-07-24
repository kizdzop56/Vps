// Animated WebGL "prismatic burst" background (ported from React Bits PrismaticBurst).
// Web-only implementation — see PrismaticBurst.tsx for the native fallback.
import React, { useRef, useEffect } from "react";
import { Renderer, Program, Mesh, Triangle, Texture } from "ogl";
import type { PrismaticBurstProps } from "./PrismaticBurst";

const vertex = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform vec2  uResolution;
uniform float uTime;

uniform float uIntensity;
uniform float uSpeed;
uniform int   uAnimType;
uniform int   uColorCount;
uniform float uDistort;
uniform vec2  uOffset;
uniform sampler2D uGradient;
uniform float uNoiseAmount;
uniform int   uRayCount;

float hash21(vec2 p){
    p = floor(p);
    float f = 52.9829189 * fract(dot(p, vec2(0.065, 0.005)));
    return fract(f);
}

mat2 rot30(){ return mat2(0.8, -0.5, 0.5, 0.8); }

float layeredNoise(vec2 fragPx){
    vec2 p = mod(fragPx + vec2(uTime * 30.0, -uTime * 21.0), 1024.0);
    vec2 q = rot30() * p;
    float n = 0.0;
    n += 0.40 * hash21(q);
    n += 0.25 * hash21(q * 2.0 + 17.0);
    n += 0.20 * hash21(q * 4.0 + 47.0);
    n += 0.10 * hash21(q * 8.0 + 113.0);
    n += 0.05 * hash21(q * 16.0 + 191.0);
    return n;
}

vec3 rayDir(vec2 frag, vec2 res, vec2 offset, float dist){
    float focal = res.y * max(dist, 1e-3);
    return normalize(vec3(2.0 * (frag - offset) - res, focal));
}

float edgeFade(vec2 frag, vec2 res, vec2 offset){
    vec2 toC = frag - 0.5 * res - offset;
    float r = length(toC) / (0.5 * min(res.x, res.y));
    float x = clamp(r, 0.0, 1.0);
    float q = x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
    float s = q * 0.5;
    s = pow(s, 1.5);
    float tail = 1.0 - pow(1.0 - s, 2.0);
    s = mix(s, tail, 0.2);
    float dn = (layeredNoise(frag * 0.15) - 0.5) * 0.0015 * s;
    return clamp(s + dn, 0.0, 1.0);
}

mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,-s, 0.0,s,c); }
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.0,s, 0.0,1.0,0.0, -s,0.0,c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c,-s,0.0, s,c,0.0, 0.0,0.0,1.0); }

vec3 sampleGradient(float t){
    t = clamp(t, 0.0, 1.0);
    return texture(uGradient, vec2(t, 0.5)).rgb;
}

vec2 rot2(vec2 v, float a){
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c) * v;
}

float bendAngle(vec3 q, float t){
    float a = 0.8 * sin(q.x * 0.55 + t * 0.6)
            + 0.7 * sin(q.y * 0.50 - t * 0.5)
            + 0.6 * sin(q.z * 0.60 + t * 0.7);
    return a;
}

void main(){
    vec2 frag = gl_FragCoord.xy;
    float t = uTime * uSpeed;
    float jitterAmp = 0.1 * clamp(uNoiseAmount, 0.0, 1.0);
    vec3 dir = rayDir(frag, uResolution, uOffset, 1.0);
    float marchT = 0.0;
    vec3 col = vec3(0.0);
    float n = layeredNoise(frag);
    vec4 c = cos(t * 0.2 + vec4(0.0, 33.0, 11.0, 0.0));
    mat2 M2 = mat2(c.x, c.y, c.z, c.w);
    float amp = clamp(uDistort, 0.0, 50.0) * 0.15;

    mat3 rot3dMat = mat3(1.0);
    if(uAnimType == 1){
      vec3 ang = vec3(t * 0.31, t * 0.21, t * 0.17);
      rot3dMat = rotZ(ang.z) * rotY(ang.y) * rotX(ang.x);
    }

    for (int i = 0; i < 44; ++i) {
        vec3 P = marchT * dir;
        P.z -= 2.0;
        float rad = length(P);
        vec3 Pl = P * (10.0 / max(rad, 1e-6));

        if(uAnimType == 0){
            Pl.xz *= M2;
        } else {
            Pl = rot3dMat * Pl;
        }

        float stepLen = min(rad - 0.3, n * jitterAmp) + 0.1;

        float grow = smoothstep(0.35, 3.0, marchT);
        float a1 = amp * grow * bendAngle(Pl * 0.6, t);
        float a2 = 0.5 * amp * grow * bendAngle(Pl.zyx * 0.5 + 3.1, t * 0.9);
        vec3 Pb = Pl;
        Pb.xz = rot2(Pb.xz, a1);
        Pb.xy = rot2(Pb.xy, a2);

        float rayPattern = smoothstep(
            0.5, 0.7,
            sin(Pb.x + cos(Pb.y) * cos(Pb.z)) *
            sin(Pb.z + sin(Pb.y) * cos(Pb.x + t))
        );

        if (uRayCount > 0) {
            float ang = atan(Pb.y, Pb.x);
            float comb = 0.5 + 0.5 * cos(float(uRayCount) * ang);
            comb = pow(comb, 3.0);
            rayPattern *= smoothstep(0.15, 0.95, comb);
        }

        vec3 spectralDefault = 1.0 + vec3(
            cos(marchT * 3.0 + 0.0),
            cos(marchT * 3.0 + 1.0),
            cos(marchT * 3.0 + 2.0)
        );

        float saw = fract(marchT * 0.25);
        float tRay = saw * saw * (3.0 - 2.0 * saw);
        vec3 userGradient = 2.0 * sampleGradient(tRay);
        vec3 spectral = (uColorCount > 0) ? userGradient : spectralDefault;
        vec3 base = (0.05 / (0.4 + stepLen))
                  * smoothstep(5.0, 0.0, rad)
                  * spectral;

        col += base * rayPattern;
        marchT += stepLen;
    }

    col *= edgeFade(frag, uResolution, uOffset);
    col *= uIntensity;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function hexToRgb01(hex: string): [number, number, number] {
  let h = hex.trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 3) {
    h = h[0]! + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const intVal = parseInt(h, 16);
  if (isNaN(intVal) || (h.length !== 6 && h.length !== 8)) return [1, 1, 1];
  return [
    ((intVal >> 16) & 255) / 255,
    ((intVal >> 8) & 255) / 255,
    (intVal & 255) / 255,
  ];
}

export default function PrismaticBurst({
  intensity = 2,
  speed = 0.5,
  animationType = "rotate3d",
  colors,
  distort = 0,
  rayCount = 0,
  resolutionScale = 1,
}: PrismaticBurstProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const colorsKey = JSON.stringify(colors ?? []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    let renderer: InstanceType<typeof Renderer>;
    let gl: any;
    let mesh: InstanceType<typeof Mesh>;
    let program: InstanceType<typeof Program>;
    try {
      renderer = new Renderer({
        dpr: Math.min(window.devicePixelRatio || 1, 2),
        canvas,
        alpha: false,
        antialias: false,
      });
      gl = renderer.gl;
      if (!gl) return; // WebGL unavailable — keep the static background underneath

      const parsed: string[] = JSON.parse(colorsKey);
      let gradientTex: InstanceType<typeof Texture>;
      if (parsed.length > 0) {
        const capped = parsed.slice(0, 64);
        const data = new Uint8Array(capped.length * 4);
        capped.forEach((c, i) => {
          const [r, g, b] = hexToRgb01(c);
          data[i * 4 + 0] = Math.round(r * 255);
          data[i * 4 + 1] = Math.round(g * 255);
          data[i * 4 + 2] = Math.round(b * 255);
          data[i * 4 + 3] = 255;
        });
        gradientTex = new Texture(gl, {
          image: data,
          width: capped.length,
          height: 1,
          generateMipmaps: false,
          flipY: false,
        });
      } else {
        gradientTex = new Texture(gl, {
          image: new Uint8Array([255, 255, 255, 255]),
          width: 1,
          height: 1,
          generateMipmaps: false,
          flipY: false,
        });
      }
      gradientTex.minFilter = gl.LINEAR;
      gradientTex.magFilter = gl.LINEAR;
      gradientTex.wrapS = gl.CLAMP_TO_EDGE;
      gradientTex.wrapT = gl.CLAMP_TO_EDGE;

      const geometry = new Triangle(gl);
      program = new Program(gl, {
        vertex,
        fragment,
        uniforms: {
          uResolution: { value: [1, 1] },
          uTime: { value: 0 },
          uIntensity: { value: intensity },
          uSpeed: { value: speed },
          uAnimType: { value: animationType === "rotate" ? 0 : 1 },
          uColorCount: { value: parsed.length },
          uDistort: { value: distort },
          uOffset: { value: [0, 0] },
          uGradient: { value: gradientTex },
          uNoiseAmount: { value: 0.8 },
          uRayCount: { value: Math.max(0, Math.floor(rayCount)) },
        },
      });
      mesh = new Mesh(gl, { geometry, program });
    } catch {
      return; // WebGL unavailable — keep the static background underneath
    }

    const resize = () => {
      const w = parent.clientWidth || 1;
      const h = parent.clientHeight || 1;
      renderer.setSize(w * resolutionScale, h * resolutionScale);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      program.uniforms["uResolution"]!.value = [
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
      ];
    };

    window.addEventListener("resize", resize);
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();

    const start = performance.now();
    let frame = 0;

    const loop = () => {
      program.uniforms["uTime"]!.value = (performance.now() - start) / 1000;
      renderer.render({ scene: mesh });
      frame = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      observer.disconnect();
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    };
  }, [intensity, speed, animationType, colorsKey, distort, rayCount, resolutionScale]);

  return React.createElement("canvas", {
    ref,
    style: {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      display: "block",
    },
  });
}
