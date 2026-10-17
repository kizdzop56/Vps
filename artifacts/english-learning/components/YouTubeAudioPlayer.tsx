import React from "react";
import { ActivityIndicator, Platform, Text, useWindowDimensions, View } from "react-native";
import { NativeVideoPlayer } from "@/components/MediaViewerModal";

/** Extract a valid YouTube video id from the supported public URL formats. */
export function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.match(/^\/([A-Za-z0-9_-]{6,20})\/?$/)?.[1] ?? null;
    if (!["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) return null;
    if (url.pathname === "/watch") return /^[A-Za-z0-9_-]{6,20}$/.test(url.searchParams.get("v") ?? "") ? url.searchParams.get("v") : null;
    return url.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{6,20})\/?$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function isYouTubeUrl(value: string): boolean {
  return youtubeVideoId(value) !== null;
}

/**
 * YouTube does not expose a direct audio-file URL for ordinary embeds. On web,
 * keep YouTube's own player and controls, but crop the video picture out of view
 * so the student sees only the compact playback controls. The video is still
 * streamed by YouTube; this only hides its picture, it does not extract audio.
 */
export function YouTubeAudioPlayer({ url, title }: { url: string; title?: string }) {
  const { width: windowWidth } = useWindowDimensions();
  const id = youtubeVideoId(url);
  if (!id) return <Text style={{ color: "#fff", fontSize: 13 }}>Некорректная ссылка YouTube</Text>;

  const playerWidth = Math.max(260, Math.min(windowWidth - 64, 900));
  const playerHeight = Math.round(playerWidth * 9 / 16);
  const controlsHeight = 64;
  const embedUrl = `https://www.youtube-nocookie.com/embed/${id}?controls=1&playsinline=1&rel=0&iv_load_policy=3`;

  if (Platform.OS !== "web") {
    return (
      <View style={{ height: 190, borderRadius: 12, overflow: "hidden", backgroundColor: "#111" }}>
        <NativeVideoPlayer uri={embedUrl} />
        <Text style={{ color: "#fff", fontSize: 11, paddingHorizontal: 8, paddingBottom: 5 }}>
          YouTube: используйте кнопку воспроизведения. {title ?? ""}
        </Text>
      </View>
    );
  }

  return (
    <View
      accessibilityLabel={`Аудио из YouTube: ${title ?? "задание"}`}
      style={{ height: controlsHeight, width: "100%", overflow: "hidden", borderRadius: 12, backgroundColor: "#171717" }}
    >
      {/* @ts-ignore web-only iframe */}
      <iframe
        title={`Аудио из YouTube: ${title ?? "задание"}`}
        src={embedUrl}
        allow="autoplay; encrypted-media; picture-in-picture"
        style={{
          position: "absolute",
          left: 0,
          top: -(playerHeight - controlsHeight),
          width: "100%",
          height: playerHeight,
          border: 0,
        }}
      />
    </View>
  );
}
