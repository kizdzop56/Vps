import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, Platform, Image, Alert, KeyboardAvoidingView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import authStorage from "@/utils/authStorage";

const BASE = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string, opts?: RequestInit) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Ошибка сервера");
  return data;
}

// Загрузка файла (фото/аудио) через тот же multipart-роут, что и остальные
// вложения приложения. Имя файла с правильным расширением обязательно — сервер
// определяет Content-Type по нему при отдаче через res.sendFile.
async function uploadFile(blob: Blob, filename: string, kind: "image" | "audio"): Promise<string> {
  const token = await authStorage.getItem("auth_token");
  const form = new FormData();
  form.append("file", blob, filename);
  const res = await fetch(`${BASE}/api/upload/${kind}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token ?? ""}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки файла");
  return data.url as string;
}

type ChatUser = {
  id: number; name: string; username: string; role: string;
  avatarEmoji: string | null; avatarColor: string | null; avatarUrl?: string | null;
  isOnline?: boolean;
};

type ChatMessage = {
  id: number;
  conversationId: number;
  senderId: number;
  text: string | null;
  attachmentUrl: string | null;
  attachmentType: "image" | "audio" | null;
  createdAt: string;
};

function AudioBubble({ url, mine }: { url: string; mine: boolean }) {
  const colors = useColors();
  const [playing, setPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const toggle = useCallback(async () => {
    try {
      if (playing && soundRef.current) {
        await soundRef.current.stopAsync();
        setPlaying(false);
        return;
      }
      const { sound } = await Audio.Sound.createAsync({ uri: `${BASE}${url}` });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) setPlaying(false);
      });
      setPlaying(true);
      await sound.playAsync();
    } catch {
      setPlaying(false);
    }
  }, [playing, url]);

  useEffect(() => () => { soundRef.current?.unloadAsync().catch(() => {}); }, []);

  return (
    <TouchableOpacity onPress={toggle} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 }}>
      <Feather name={playing ? "pause" : "play"} size={20} color={mine ? "#fff" : colors.primary} />
      <View style={{ height: 4, width: 90, borderRadius: 2, backgroundColor: mine ? "rgba(255,255,255,0.6)" : colors.border }} />
      <Feather name="mic" size={16} color={mine ? "#fff" : colors.mutedForeground} />
    </TouchableOpacity>
  );
}

export default function ChatScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const otherId = Number(userId);
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [other, setOther] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const mediaRecorderRef = useRef<any>(null);
  const webChunksRef = useRef<BlobPart[]>([]);

  const load = useCallback(async (initial = false) => {
    try {
      const data = await apiFetch(`/api/messages/with/${otherId}`);
      setOther(data.otherUser);
      setMessages(data.messages);
      setError(null);
    } catch (e: any) {
      if (initial) setError(e.message ?? "Не удалось открыть чат");
    } finally {
      if (initial) setLoading(false);
    }
  }, [otherId]);

  useEffect(() => { load(true); }, [load]);

  // Лёгкий поллинг, чтобы входящие сообщения появлялись почти сразу.
  useEffect(() => {
    const t = setInterval(() => load(false), 4000);
    return () => clearInterval(t);
  }, [load]);

  const doSend = useCallback(async (payload: { text?: string; attachmentUrl?: string; attachmentType?: "image" | "audio" }) => {
    setSending(true);
    try {
      const msg = await apiFetch(`/api/messages/with/${otherId}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setMessages((prev) => [...prev, msg]);
    } catch (e: any) {
      Alert.alert("Не удалось отправить", e.message ?? "Попробуйте ещё раз");
    } finally {
      setSending(false);
    }
  }, [otherId]);

  const sendText = useCallback(async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    await doSend({ text: t });
  }, [text, doSend]);

  const pickPhoto = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
    });
    if (result.canceled || !result.assets?.[0]) return;
    try {
      setSending(true);
      const blob = await (await fetch(result.assets[0].uri)).blob();
      const url = await uploadFile(blob, "photo.jpg", "image");
      await doSend({ attachmentUrl: url, attachmentType: "image" });
    } catch (e: any) {
      Alert.alert("Не удалось отправить фото", e.message ?? "Попробуйте ещё раз");
    } finally {
      setSending(false);
    }
  }, [doSend]);

  // ── Запись голосового сообщения ─────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new (window as any).MediaRecorder(stream);
        webChunksRef.current = [];
        mr.ondataavailable = (e: any) => { if (e.data.size > 0) webChunksRef.current.push(e.data); };
        mr.start();
        mediaRecorderRef.current = mr;
        setRecording(true);
        return;
      }
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) { Alert.alert("Нет доступа к микрофону"); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setRecording(true);
    } catch {
      Alert.alert("Не удалось начать запись");
      setRecording(false);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      setRecording(false);
      setSending(true);
      let blob: Blob;
      let filename: string;
      if (Platform.OS === "web") {
        const mr = mediaRecorderRef.current;
        if (!mr) return;
        blob = await new Promise<Blob>((resolve) => {
          mr.onstop = () => resolve(new Blob(webChunksRef.current, { type: "audio/webm" }));
          mr.stop();
          mr.stream.getTracks().forEach((tr: any) => tr.stop());
        });
        filename = "voice.webm";
      } else {
        const rec = recordingRef.current;
        if (!rec) return;
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        if (!uri) return;
        blob = await (await fetch(uri)).blob();
        filename = "voice.m4a";
      }
      const url = await uploadFile(blob, filename, "audio");
      await doSend({ attachmentUrl: url, attachmentType: "audio" });
    } catch (e: any) {
      Alert.alert("Не удалось отправить голосовое", e.message ?? "Попробуйте ещё раз");
    } finally {
      setSending(false);
      recordingRef.current = null;
      mediaRecorderRef.current = null;
    }
  }, [doSend]);

  const renderItem = useCallback(({ item }: { item: ChatMessage }) => {
    const mine = item.senderId === user?.id;
    return (
      <View style={{ flexDirection: "row", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8, paddingHorizontal: 12 }}>
        <View style={{
          maxWidth: "78%",
          backgroundColor: mine ? colors.primary : colors.card,
          borderRadius: 16,
          borderBottomRightRadius: mine ? 4 : 16,
          borderBottomLeftRadius: mine ? 16 : 4,
          borderWidth: mine ? 0 : 1,
          borderColor: colors.border,
          padding: item.attachmentType === "image" ? 4 : 10,
        }}>
          {item.attachmentType === "image" && item.attachmentUrl && (
            <Image
              source={{ uri: `${BASE}${item.attachmentUrl}` }}
              style={{ width: 200, height: 200, borderRadius: 12 }}
              resizeMode="cover"
            />
          )}
          {item.attachmentType === "audio" && item.attachmentUrl && (
            <AudioBubble url={item.attachmentUrl} mine={mine} />
          )}
          {!!item.text && (
            <Text style={{ fontSize: 15, color: mine ? "#fff" : colors.foreground, marginTop: item.attachmentUrl ? 6 : 0 }}>
              {item.text}
            </Text>
          )}
          <Text style={{ fontSize: 10, color: mine ? "rgba(255,255,255,0.75)" : colors.mutedForeground, marginTop: 4, textAlign: "right" }}>
            {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      </View>
    );
  }, [user?.id, colors]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Feather name="lock" size={40} color={colors.mutedForeground} />
        <Text style={{ fontSize: 15, color: colors.foreground, marginTop: 12, textAlign: "center" }}>{error}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Назад</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 12,
        flexDirection: "row", alignItems: "center", gap: 10,
        backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="chevron-left" size={26} color={colors.foreground} />
        </TouchableOpacity>
        {other && (
          <>
            <View style={{ position: "relative" }}>
              <AnimatedAvatar size={38} avatarColor={other.avatarColor ?? "#6366f1"} avatarEmoji={other.avatarEmoji} avatarUrl={other.avatarUrl} />
              {other.isOnline && (
                <View style={{ position: "absolute", bottom: 0, right: 0, width: 11, height: 11, borderRadius: 6, backgroundColor: "#22c55e", borderWidth: 2, borderColor: colors.card }} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{other.name}</Text>
              <Text style={{ fontSize: 12, color: other.isOnline ? "#16a34a" : colors.mutedForeground }}>
                {other.isOnline ? "В сети" : `@${other.username}`}
              </Text>
            </View>
          </>
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          data={messages}
          keyExtractor={(m) => String(m.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingVertical: 12, flexGrow: 1, justifyContent: "flex-end" }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 40 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>Пока нет сообщений. Напишите первым!</Text>
            </View>
          }
        />

        {/* Input bar */}
        <View style={{
          flexDirection: "row", alignItems: "center", gap: 8,
          paddingHorizontal: 10, paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border,
        }}>
          <TouchableOpacity onPress={pickPhoto} disabled={sending || recording} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="image" size={24} color={recording ? colors.mutedForeground : colors.primary} />
          </TouchableOpacity>

          {recording ? (
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#e11d48" }} />
              <Text style={{ color: colors.foreground, fontSize: 14 }}>Идёт запись…</Text>
            </View>
          ) : (
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Сообщение…"
              placeholderTextColor={colors.mutedForeground}
              style={{
                flex: 1, backgroundColor: colors.background, borderRadius: 20,
                paddingHorizontal: 14, paddingVertical: Platform.OS === "web" ? 10 : 8,
                fontSize: 15, color: colors.foreground, borderWidth: 1, borderColor: colors.border,
              }}
              onSubmitEditing={sendText}
              editable={!sending}
            />
          )}

          {text.trim().length > 0 && !recording ? (
            <TouchableOpacity onPress={sendText} disabled={sending} style={{ backgroundColor: colors.primary, borderRadius: 22, width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <Feather name="send" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={recording ? stopRecording : startRecording}
              disabled={sending}
              style={{ backgroundColor: recording ? "#e11d48" : colors.primary, borderRadius: 22, width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Feather name={recording ? "check" : "mic"} size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
