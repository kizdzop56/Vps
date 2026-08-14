// Экран переписки 1:1.
//
// ── Точка «не прочитано получателем» на СВОИХ сообщениях ────────────────────
// Сервер уже проставляет messagesTable.readAt, когда собеседник открывает эту
// же переписку у себя (см. api-server/src/routes/messaging.ts,
// GET /messages/with/:id помечает читанными сообщения ДРУГОГО участника) и
// уже возвращает readAt в ответе — просто клиентский тип его не объявлял, и
// поле никуда не шло. Теперь на СВОИХ (mine) сообщениях, пока readAt пустой,
// в углу пузыря горит маленькая точка; как только собеседник откроет чат у
// себя, ближайший опрос (раз в 4 секунды, см. load ниже) вернёт readAt — и
// точка сама пропадёт. Чужие сообщения точку никогда не показывают: это не
// «прочитано мной», а «прочитано ТЕМ, кому мы писали» — обратная связь имеет
// смысл только на исходящих.
//
// ── Онлайн / был в сети — над именем в шапке ─────────────────────────────────
// Раньше офлайн-собеседник показывал просто «@username» — это не отвечает на
// вопрос «стоит ли ждать ответа прямо сейчас». lastSeenText ниже — тот же
// текст и те же пороги, что уже показывает список учеников (см.
// app/(main)/students.tsx), продублирован по тому же принципу, что и другие
// мелкие утилиты в этом кодовой базе: одна и та же пятистрочная функция не
// стоит того, чтобы тянуть её через общий модуль.
//
// ── Кнопки объёмные, сообщения — нет ────────────────────────────────────────
// Фото/микрофон/отправка были плоскими Feather-иконками без всякого веса —
// на фоне остального приложения, где почти каждая нажимаемая поверхность
// имеет нижнюю грань и проседает при нажатии (см. constants/theme.ts →
// chunky), это смотрелось недоделанным. Новый ChunkyCircleButton оборачивает
// именно эти три кнопки. Пузыри сообщений трогать не просили — они остаются
// плоскими, как и были.
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, Platform, Image, Alert, KeyboardAvoidingView,
  Animated, Easing,
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
import { accents, chunky } from "@/constants/theme";
import { useMessagesBadge } from "@/contexts/MessagesBadgeContext";

const BASE = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string, opts?: RequestInit) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    // Без no-store браузер на web отдаёт закэшированный ответ на повторные
    // GET-запросы поллинга, и новые сообщения не появляются — чат "не работает".
    cache: "no-store",
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
  lastSeenAt?: string | null;
};

type ChatMessage = {
  id: number;
  conversationId: number;
  senderId: number;
  text: string | null;
  attachmentUrl: string | null;
  attachmentType: "image" | "audio" | null;
  createdAt: string;
  /** Когда получатель прочитал сообщение. null — ещё не прочитано; тогда на
      СВОЁМ (mine) сообщении в углу горит точка, см. renderItem ниже. */
  readAt: string | null;
};

/**
 * «Был в сети» словами — тот же текст и пороги, что на карточке ученика
 * (см. app/(main)/students.tsx), продублирован здесь по тому же принципу, что
 * и другие мелкие утилиты в этом кодовой базе.
 */
function lastSeenText(lastSeenAt: string | null | undefined, isOnline: boolean | undefined): string {
  if (isOnline) return "в сети";
  if (!lastSeenAt) return "ещё не заходил";
  const seen = new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) return "ещё не заходил";
  const days = Math.floor((Date.now() - seen.getTime()) / 86400000);
  if (days <= 0) return "был сегодня";
  if (days === 1) return "был вчера";
  if (days < 7) return `был ${days} дня назад`;
  if (days < 30) return `не заходил ${days} дней`;
  return "не заходил больше месяца";
}

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

/**
 * Круглая кнопка входной панели (фото, микрофон/отправить) с нижней гранью и
 * просадкой при нажатии — тем же приёмом, что у ChunkyButton в остальном
 * приложении (см. constants/theme.ts → chunky). Просили сделать объёмными
 * именно кнопки, а не переписку — поэтому пузыри сообщений эту обёртку не
 * используют и остаются плоскими.
 */
function ChunkyCircleButton({
  onPress, disabled, background, edgeColor, size = 44, children, accessibilityLabel,
}: {
  onPress?: () => void;
  disabled?: boolean;
  background: string;
  /** Цвет нижней грани — обычно тёмная версия background. */
  edgeColor: string;
  size?: number;
  children: React.ReactNode;
  accessibilityLabel?: string;
}) {
  const press = useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: chunky.duration,
      easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== "web",
    }).start();

  return (
    <View style={{ opacity: disabled ? 0.5 : 1 }}>
      <View style={{
        position: "absolute", top: chunky.pressDepth,
        width: size, height: size, borderRadius: size / 2, backgroundColor: edgeColor,
      }} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <TouchableOpacity
          onPress={disabled ? undefined : onPress}
          onPressIn={() => !disabled && set(chunky.pressDepth)}
          onPressOut={() => set(0)}
          disabled={disabled}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          style={{
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: background,
            alignItems: "center", justifyContent: "center",
          }}
        >
          {children}
        </TouchableOpacity>
      </Animated.View>
      <View style={{ height: chunky.pressDepth }} />
    </View>
  );
}

export default function ChatScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const otherId = Number(userId);
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { refresh: refreshUnreadBadge } = useMessagesBadge();

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
      // Открытие чата отмечает входящие сообщения прочитанными на сервере —
      // просим общий счётчик (иконка вкладки «Друзья», точка на карточке
      // собеседника) обновиться сразу, а не ждать своего опроса до 15 секунд.
      if (initial) refreshUnreadBadge();
    } catch (e: any) {
      if (initial) setError(e.message ?? "Не удалось открыть чат");
    } finally {
      if (initial) setLoading(false);
    }
  }, [otherId, refreshUnreadBadge]);

  useEffect(() => { load(true); }, [load]);

  // Лёгкий поллинг, чтобы входящие сообщения появлялись почти сразу — и заодно
  // чтобы точка «не прочитано получателем» на своих сообщениях сама погасла,
  // как только собеседник откроет этот же чат у себя.
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
        <View style={{ position: "relative", maxWidth: "78%" }}>
          <View style={{
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
          {/* Точка «не прочитано получателем» — только на своих сообщениях, пока
              readAt пустой. Пропадает сама на ближайшем опросе, см. шапку файла. */}
          {mine && !item.readAt && (
            <View style={{
              position: "absolute", top: -3, right: -3,
              width: 9, height: 9, borderRadius: 5,
              backgroundColor: accents.magenta,
              borderWidth: 1.5, borderColor: colors.background,
            }} />
          )}
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
                <View style={{ position: "absolute", bottom: 0, right: 0, width: 11, height: 11, borderRadius: 6, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.card }} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground }}>{other.name}</Text>
              {/* Онлайн или когда был в сети последний раз — см. шапку файла. */}
              <Text style={{ fontSize: 12, fontWeight: other.isOnline ? "700" : "400", color: other.isOnline ? colors.success : colors.mutedForeground }}>
                {lastSeenText(other.lastSeenAt, other.isOnline)}
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
          <ChunkyCircleButton
            onPress={pickPhoto}
            disabled={sending || recording}
            background={colors.card}
            edgeColor="rgba(160,140,220,0.35)"
            accessibilityLabel="Прикрепить фото"
          >
            <Feather name="image" size={20} color={recording ? colors.mutedForeground : colors.primary} />
          </ChunkyCircleButton>

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
            <ChunkyCircleButton
              onPress={sendText}
              disabled={sending}
              background={colors.primary}
              edgeColor={accents.indigoDeep}
              accessibilityLabel="Отправить сообщение"
            >
              <Feather name="send" size={20} color="#fff" />
            </ChunkyCircleButton>
          ) : (
            <ChunkyCircleButton
              onPress={recording ? stopRecording : startRecording}
              disabled={sending}
              background={recording ? "#e11d48" : colors.primary}
              edgeColor={recording ? "#9f1239" : accents.indigoDeep}
              accessibilityLabel={recording ? "Остановить запись" : "Записать голосовое сообщение"}
            >
              <Feather name={recording ? "check" : "mic"} size={20} color="#fff" />
            </ChunkyCircleButton>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
