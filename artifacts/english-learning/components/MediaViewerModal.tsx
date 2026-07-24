import React from "react";
import {
  Modal, View, TouchableOpacity, Platform, ActivityIndicator, Text,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type MediaKind = "video" | "audio" | "other";

type Props = {
  url: string | null;
  kind: MediaKind;
  title?: string;
  onClose: () => void;
};

export function toEmbeddableUrl(url: string): { isYoutube: boolean; embedUrl: string } {
  const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");
  const embedUrl = isYoutube
    ? url.replace("watch?v=", "embed/").replace("youtu.be/", "www.youtube.com/embed/")
    : url;
  return { isYoutube, embedUrl };
}

export function MediaViewerModal({ url, kind, title, onClose }: Props) {
  const insets = useSafeAreaInsets();

  if (!url) return null;

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  const { isYoutube, embedUrl } = toEmbeddableUrl(fullUrl);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)" }}>
        <TouchableOpacity
          onPress={onClose}
          style={{
            position: "absolute",
            top: insets.top + (Platform.OS === "web" ? 12 : 16),
            right: 16,
            zIndex: 20,
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: "rgba(255,255,255,0.18)",
            justifyContent: "center", alignItems: "center",
          }}
        >
          <Feather name="x" size={22} color="#fff" />
        </TouchableOpacity>

        {!!title && (
          <Text
            numberOfLines={1}
            style={{
              position: "absolute",
              top: insets.top + (Platform.OS === "web" ? 14 : 18),
              left: 16, right: 64,
              zIndex: 20,
              color: "#fff", fontSize: 14, fontWeight: "700",
            }}
          >
            {title}
          </Text>
        )}

        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 }}>
          {kind === "video" ? (
            isYoutube ? (
              Platform.OS === "web" ? (
                <View style={{ width: "100%", maxWidth: 720, aspectRatio: 16 / 9, borderRadius: 14, overflow: "hidden" }}>
                  {/* @ts-ignore web-only iframe */}
                  <iframe
                    src={embedUrl}
                    style={{ width: "100%", height: "100%", border: "none" }}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                </View>
              ) : (
                <View style={{ width: "100%", maxWidth: 720, aspectRatio: 16 / 9, borderRadius: 14, overflow: "hidden", backgroundColor: "#000" }}>
                  <WebMediaFallback url={embedUrl} />
                </View>
              )
            ) : Platform.OS === "web" ? (
              // @ts-ignore web-only video element
              <video
                src={fullUrl}
                controls
                autoPlay
                playsInline
                // @ts-ignore vendor-prefixed attr some mobile browsers still check
                webkit-playsinline="true"
                style={{ width: "100%", maxWidth: 720, maxHeight: "80vh", borderRadius: 14, backgroundColor: "#000" }}
              />
            ) : (
              <NativeVideoPlayer uri={fullUrl} />
            )
          ) : kind === "audio" ? (
            <View style={{ width: "100%", maxWidth: 480, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 16, padding: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#6366f1", justifyContent: "center", alignItems: "center" }}>
                  <Feather name="headphones" size={18} color="#fff" />
                </View>
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Аудио</Text>
              </View>
              {Platform.OS === "web" ? (
                // @ts-ignore web-only audio element
                <audio src={fullUrl} controls autoPlay style={{ width: "100%" }} />
              ) : (
                <NativeAudioPlayer uri={fullUrl} />
              )}
            </View>
          ) : Platform.OS === "web" ? (
            <View style={{ width: "100%", maxWidth: 800, height: "82%", borderRadius: 14, overflow: "hidden", backgroundColor: "#fff" }}>
              {/* @ts-ignore web-only iframe — generic file/link preview */}
              <iframe src={fullUrl} style={{ width: "100%", height: "100%", border: "none" }} />
            </View>
          ) : (
            <WebMediaFallback url={fullUrl} />
          )}
        </View>
      </View>
    </Modal>
  );
}

export function NativeVideoPlayer({ uri }: { uri: string }) {
  const [Comp, setComp] = React.useState<any>(null);
  React.useEffect(() => {
    let mounted = true;
    import("expo-av").then((mod) => { if (mounted) setComp(() => mod.Video); }).catch(() => {});
    return () => { mounted = false; };
  }, []);
  if (!Comp) return <ActivityIndicator color="#fff" />;
  return (
    <Comp
      source={{ uri }}
      style={{ width: "100%", height: "100%" }}
      useNativeControls
      resizeMode="contain"
      shouldPlay
    />
  );
}

export function NativeAudioPlayer({ uri }: { uri: string }) {
  const [playing, setPlaying] = React.useState(false);
  const soundRef = React.useRef<any>(null);

  React.useEffect(() => {
    let mounted = true;
    import("expo-av").then(async (mod) => {
      const { sound } = await mod.Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      if (!mounted) { sound.unloadAsync(); return; }
      soundRef.current = sound;
      setPlaying(true);
    }).catch(() => {});
    return () => {
      mounted = false;
      soundRef.current?.unloadAsync?.();
    };
  }, [uri]);

  const toggle = async () => {
    const sound = soundRef.current;
    if (!sound) return;
    const status = await sound.getStatusAsync();
    if (status.isPlaying) { await sound.pauseAsync(); setPlaying(false); }
    else { await sound.playAsync(); setPlaying(true); }
  };

  return (
    <TouchableOpacity
      onPress={toggle}
      style={{ backgroundColor: "#6366f1", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
    >
      <Feather name={playing ? "pause" : "play"} size={20} color="#fff" />
    </TouchableOpacity>
  );
}

function WebMediaFallback({ url }: { url: string }) {
  return (
    <View style={{ alignItems: "center", gap: 10 }}>
      <ActivityIndicator color="#fff" />
      <Text style={{ color: "#fff", fontSize: 13, textAlign: "center" }}>{url}</Text>
    </View>
  );
}
