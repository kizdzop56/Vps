// ─────────────────────────────────────────────────────────────────────────────
// Живая аудиодорожка записи.
//
// Показывает, СЛЫШИТ ли приложение ученика. Без неё во время произношения на
// экране была только надпись «Идёт запись»: молчание из-за выключенного
// микрофона и молчание из-за того, что ребёнок не решается заговорить,
// выглядели совершенно одинаково.
//
// Рисунок тот же, что у плеера аудиозаданий (components/InlineMediaPlayer):
// ряд узких скруглённых столбиков, фиолетовый градиент. Но здесь дорожка
// живая — полоски едут справа налево, как в диктофоне: новый замер приходит
// справа, старые уезжают.
//
// ── Откуда берётся громкость ────────────────────────────────────────────────
// Web Audio AnalyserNode поверх собственного getUserMedia. Распознавание речи
// свой поток не отдаёт, поэтому приходится открывать второй — браузеры это
// разрешают, оба слушают один микрофон.
//
// Если поток не дали (нет разрешения, нет Web Audio, натив) — НЕ рисуем
// выдуманную громкость. Вместо неё идёт спокойная волна ожидания: она честно
// сообщает «запись идёт», но не притворяется замером звука.
//
// ── Почему не Animated ──────────────────────────────────────────────────────
// Высота столбика — layout-свойство, нативным драйвером не анимируется, а
// тридцать параллельных JS-анимаций дороже, чем один setState на кадр выборки.
// Частота намеренно низкая (SAMPLE_MS): дорожка должна читаться, а не мельтешить.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { View, Platform } from "react-native";
import { accents, radii } from "@/constants/theme";

/** Сколько столбиков в дорожке. */
const BARS = 34;

/** Как часто берём замер. 11 кадров в секунду: видно движение, но не рябит. */
const SAMPLE_MS = 90;

const BAR_W = 3;
const MIN_H = 4;
const MAX_H = 34;

/** Цвета концов градиента: тихо — светлая лаванда, громко — фиолет бренда. */
const QUIET = "#c4b5fd";
const LOUD = accents.violetDeep;

/** Смешивает два hex-цвета. t = 0 → c1, t = 1 → c2. */
function mix(c1: string, c2: string, t: number): string {
  const parse = (s: string) => parseInt(s.slice(1), 16);
  const a = parse(c1);
  const b = parse(c2);
  const ch = (shift: number) => {
    const v1 = (a >> shift) & 0xff;
    const v2 = (b >> shift) & 0xff;
    return Math.round(v1 + (v2 - v1) * t).toString(16).padStart(2, "0");
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/**
 * Замер громкости с микрофона, 0…1.
 *
 * Возвращает функцию чтения, а не состояние: перерисовывать компонент на
 * каждый кадр анализатора незачем, выборку делает сам VoiceWave.
 */
function useMicLevel(active: boolean): () => number | null {
  const levelRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!active || Platform.OS !== "web") {
      levelRef.current = null;
      return;
    }

    const w = globalThis as any;
    const AudioCtx = w.AudioContext ?? w.webkitAudioContext;
    const media = w.navigator?.mediaDevices;
    if (!AudioCtx || !media?.getUserMedia) return;

    let stopped = false;
    let raf = 0;
    let ctx: any = null;
    let stream: any = null;

    media.getUserMedia({ audio: true })
      .then((s: any) => {
        if (stopped) {
          s.getTracks().forEach((t: any) => t.stop());
          return;
        }
        stream = s;
        ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(s);
        const analyser = ctx.createAnalyser();
        // 512 точек — компромисс: хватает на устойчивый RMS и не грузит поток.
        analyser.fftSize = 512;
        source.connect(analyser);

        const buf = new Uint8Array(analyser.fftSize);

        const tick = () => {
          if (stopped) return;
          analyser.getByteTimeDomainData(buf);
          // RMS отклонения от середины (128). Пиковое значение прыгает от
          // щелчков, среднеквадратичное ведёт себя как громкость на слух.
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const d = (buf[i]! - 128) / 128;
            sum += d * d;
          }
          const rms = Math.sqrt(sum / buf.length);
          // Речь в среднем даёт RMS около 0.05–0.25, поэтому шкалу растягиваем:
          // без множителя дорожка почти не шевелилась бы.
          levelRef.current = Math.min(1, rms * 4.5);
          raf = w.requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => {
        // Микрофон не дали. Дорожка перейдёт в режим ожидания — врать про
        // громкость нельзя.
        levelRef.current = null;
      });

    return () => {
      stopped = true;
      levelRef.current = null;
      if (raf) { try { w.cancelAnimationFrame(raf); } catch { /* no-op */ } }
      // Поток обязательно закрываем: иначе индикатор записи в браузере горит
      // и после ухода с карточки.
      try { stream?.getTracks?.().forEach((t: any) => t.stop()); } catch { /* no-op */ }
      try { ctx?.close?.(); } catch { /* no-op */ }
    };
  }, [active]);

  return React.useCallback(() => levelRef.current, []);
}

export interface VoiceWaveProps {
  /** Идёт ли запись. false — дорожка замирает. */
  active: boolean;
  width?: number;
}

export function VoiceWave({ active, width }: VoiceWaveProps) {
  const readLevel = useMicLevel(active);
  const [bars, setBars] = React.useState<number[]>(() => new Array(BARS).fill(0));
  /** Номер замера: по нему строится волна ожидания. */
  const tick = React.useRef(0);

  React.useEffect(() => {
    if (!active) {
      setBars(new Array(BARS).fill(0));
      tick.current = 0;
      return;
    }

    const id = setInterval(() => {
      tick.current += 1;
      const measured = readLevel();
      // Замера нет — спокойная волна ожидания. Амплитуда заведомо маленькая,
      // чтобы её нельзя было принять за громкую речь.
      const next = measured ?? 0.18 + Math.sin(tick.current * 0.55) * 0.1;
      setBars((prev) => [...prev.slice(1), Math.max(0, Math.min(1, next))]);
    }, SAMPLE_MS);

    return () => clearInterval(id);
  }, [active, readLevel]);

  return (
    <View
      // Дорожка декоративная: скринридеру она ничего не сообщает, состояние
      // записи уже объявлено подписью и кнопкой.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: width ?? "100%",
        height: MAX_H + 6,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 4,
      }}
    >
      {bars.map((v, i) => (
        <View
          key={i}
          style={{
            width: BAR_W,
            height: MIN_H + v * (MAX_H - MIN_H),
            borderRadius: radii.pill,
            // Тихие полоски светлее, громкие насыщеннее: высоту на глаз
            // сравнивать трудно, цвет добавляет вторую подсказку.
            backgroundColor: v > 0.02 ? mix(QUIET, LOUD, v) : "rgba(160,140,220,0.35)",
          }}
        />
      ))}
    </View>
  );
}

export default VoiceWave;
