import React, { useRef, useState } from "react";
import { View, Text, Platform, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  toEmbeddableUrl,
  NativeVideoPlayer,
  NativeAudioPlayer,
  type MediaKind,
} from "./MediaViewerModal";

const PRIMARY    = "#7c3aed";
const AUDIO_BG   = "#cbb8ef";
const WAVE_START = "#6d28d9";
const WAVE_END   = "#c4b5fd";
const TEXT_MUTED = "#94a3b8";
const BORDER     = "#e2e8f0";
const SLATE      = "#64748b";

function lerpColor(c1: string, c2: string, t: number) {
  const h = (s: string) => parseInt(s.slice(1), 16);
  const r1 = (h(c1) >> 16) & 0xff, g1 = (h(c1) >> 8) & 0xff, b1 = h(c1) & 0xff;
  const r2 = (h(c2) >> 16) & 0xff, g2 = (h(c2) >> 8) & 0xff, b2 = h(c2) & 0xff;
  const r = Math.round(r1 + (r2 - r1) * t).toString(16).padStart(2, "0");
  const g = Math.round(g1 + (g2 - g1) * t).toString(16).padStart(2, "0");
  const b = Math.round(b1 + (b2 - b1) * t).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function formatAudioTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  url: string;
  kind: MediaKind;
  height?: number;
  style?: any;
  title?: string;
};

export function InlineMediaPlayer({ url, kind, height = 200, style, title }: Props) {
  // Leave absolute http(s), same-origin relative ("/api/..."), blob: and data:
  // URLs untouched — prefixing them with "https://" produces broken sources
  // (e.g. "https:///api/storage/..." on same-origin deployments).
  const fullUrl = /^(https?:|blob:|data:|\/)/.test(url) ? url : `https://${url}`;
  const { isYoutube, embedUrl } = toEmbeddableUrl(fullUrl);

  // ── Audio waveform state (web only; native uses NativeAudioPlayer) ──
  const audioRef            = useRef<HTMLAudioElement | null>(null);
  const [audioPlaying,      setAudioPlaying]      = useState(false);
  const [audioCurrentTime,  setAudioCurrentTime]  = useState(0);
  const [audioDuration,     setAudioDuration]      = useState(0);
  const [audioSpeed,        setAudioSpeed]         = useState(1);

  function toggleAudio() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) { el.play(); setAudioPlaying(true); }
    else           { el.pause(); setAudioPlaying(false); }
  }
  function replayAudio() {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    el.play();
    setAudioPlaying(true);
  }
  function toggleAudioSpeed() {
    const el = audioRef.current;
    if (!el) return;
    const next = audioSpeed === 1 ? 0.5 : 1;
    el.playbackRate = next;
    setAudioSpeed(next);
  }

  // ── Video ──────────────────────────────────────────────────────────
  if (kind === "video") {
    return (
      <View style={[{ borderRadius: 10, overflow: "hidden", height, backgroundColor: "#000" }, style]}>
        {isYoutube ? (
          Platform.OS === "web" ? (
            /* @ts-ignore */
            <iframe
              src={embedUrl}
              style={{ width: "100%", height: "100%", border: "none" }}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <NativeVideoPlayer uri={embedUrl} />
          )
        ) : Platform.OS === "web" ? (
          /* @ts-ignore */
          <video
            src={fullUrl}
            controls
            playsInline
            webkit-playsinline="true"
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <NativeVideoPlayer uri={fullUrl} />
        )}
      </View>
    );
  }

  // ── Audio waveform (matches student player) ────────────────────────
  if (kind === "audio") {
    return (
      <View style={[{ borderRadius: 14, backgroundColor: "#fff", padding: 14, borderWidth: 1, borderColor: "#ede9fe" }, style]}>
        {Platform.OS === "web" && (
          /* @ts-ignore */
          <audio
            ref={audioRef}
            src={fullUrl}
            style={{ display: "none" }}
            onEnded={() => setAudioPlaying(false)}
            onLoadedMetadata={(e: any) => setAudioDuration(e.target.duration)}
            onTimeUpdate={(e: any) => setAudioCurrentTime(e.target.currentTime)}
          />
        )}

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity
            style={{ borderRadius: 24, overflow: "hidden" }}
            onPress={Platform.OS === "web" ? toggleAudio : undefined}
          >
            <LinearGradient
              colors={[PRIMARY, "#a78bfa"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center" }}
            >
              <Feather name={audioPlaying ? "pause" : "play"} size={20} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 32, width: "100%" }}>
              {Array.from({ length: 30 }).map((_, i) => {
                const fraction = audioDuration ? audioCurrentTime / audioDuration : 0;
                const played   = i / 30 < fraction;
                return (
                  <View
                    key={i}
                    style={{
                      width: 3, borderRadius: 2,
                      height: 6 + Math.abs(Math.sin(i * 0.7 + 1) * 14),
                      backgroundColor: played ? lerpColor(WAVE_START, WAVE_END, i / 30) : BORDER,
                    }}
                  />
                );
              })}
            </View>
          </View>

          <Text style={{ fontSize: 12, color: PRIMARY, fontWeight: "600", minWidth: 36 }}>
            {audioDuration ? formatAudioTime(audioDuration) : "—:——"}
          </Text>
        </View>

        {Platform.OS === "web" ? (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
              onPress={replayAudio}
            >
              <Feather name="refresh-cw" size={12} color={SLATE} />
              <Text style={{ fontSize: 12, color: SLATE, fontWeight: "600" }}>Слушать снова</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
                audioSpeed === 0.5 && { backgroundColor: PRIMARY + "20", borderWidth: 1.5, borderColor: PRIMARY },
              ]}
              onPress={toggleAudioSpeed}
            >
              <Feather name="zap" size={12} color={audioSpeed === 0.5 ? PRIMARY : SLATE} />
              <Text style={[{ fontSize: 12, fontWeight: "600", color: SLATE }, audioSpeed === 0.5 && { color: PRIMARY }]}>
                {audioSpeed === 1 ? "1x" : "0.5x"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <NativeAudioPlayer uri={fullUrl} />
        )}
      </View>
    );
  }

  // ── Other attachment ───────────────────────────────────────────────
  return (
    Platform.OS === "web" ? (
      <View style={[{ borderRadius: 10, overflow: "hidden", backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0" }, style]}>
        {/* @ts-ignore */}
        <iframe src={fullUrl} style={{ width: "100%", height, border: "none", display: "block" }} />
      </View>
    ) : (
      <View style={[{ backgroundColor: "#ede9fe", borderRadius: 14, borderWidth: 1, borderColor: "#8b5cf640", padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }, style]}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#8b5cf620", justifyContent: "center", alignItems: "center" }}>
          <Feather name="paperclip" size={24} color="#8b5cf6" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#5b21b6" }}>Прикреплённый файл</Text>
          <Text style={{ fontSize: 12, color: "#7c3aed", marginTop: 2 }}>{title ?? ""}</Text>
        </View>
      </View>
    )
  );
}
