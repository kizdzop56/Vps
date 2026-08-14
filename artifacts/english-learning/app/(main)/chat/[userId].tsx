// Экран переписки 1:1.
//
// ── Точка «не прочитано получателем» на СВОИХ сообщениях ────────────────────
// Сервер уже проставляет messagesTable.readAt, когда собеседник открывает эту
// же переписку у себя (см. api-server/src/routes/messaging.ts,
// GET /messages/with/:id помечает читанными сообщения ДРУГОГО участника) и
// уже возвращает readAt в ответе — просто клиентский тип его не объявлял, и
// поле никуда не шло. Теперь на СВОИХ (mine) сообщениях, пока readAt пустой,
// в углу пузыря (внизу, у отправленного времени) горит маленькая точка; как
// только собеседник откроет чат у себя, ближайший опрос (раз в 4 секунды, см.
// load ниже) вернёт readAt — и точка сама пропадёт. Чужие сообщения точку
// никогда не показывают: это не «прочитано мной», а «прочитано ТЕМ, кому мы
// писали» — обратная связь имеет смысл только на исходящих.
//
// ── Онлайн / был в сети — над именем в шапке ─────────────────────────────────
// Раньше офлайн-собеседник показывал просто «@username» — это не отвечает на
// вопрос «стоит ли ждать ответа прямо сейчас». lastSeenText ниже — тот же
// текст и те же пороги, что уже показывает список учеников (см.
// app/(main)/students.tsx), продублирован по тому же принципу, что и другие
// мелкие утилиты в этом кодовой базе: одна и та же функция не стоит того,
// чтобы тянуть её через общий модуль.
//
// Показывает ТОЧНОЕ время последнего появления («сегодня в 20:06», «вчера в
// 14:19», «3 мар в 09:15»), а не расплывчатое «был N дней назад» — точная
// метка отвечает на вопрос «когда именно», расплывчатая нет. «Ещё не заходил»
// теперь только для аккаунтов, у которых lastSeenAt в принципе не было ни
// разу — раньше это же сообщение ошибочно показывалось и тем, кто активно
// пользуется приложением, просто вышел из аккаунта: POST /users/offline
// обнулял lastSeenAt на каждом логауте, стирая единственную запись «когда
// видели в последний раз» (см. фикс в api-server/src/routes/users.ts).
//
// ── Кнопки объёмные, сообщения — нет ────────────────────────────────────────
// Фото/микрофон/отправка были плоскими Feather-иконками без всякого веса —
// на фоне остального приложения, где почти каждая нажимаемая поверхность
// имеет нижнюю грань и проседает при нажатии (см. constants/theme.ts →
// chunky), это смотрелось недоделанным. ChunkyCircleButton оборачивает именно
// эти три кнопки. Пузыри сообщений трогать не просили — они остаются
// плоскими, как и были.
//
// ── ГРАБЛИ: голосовые сообщения были подписаны неверным форматом ────────────
// startRecording создавал `new MediaRecorder(stream)` БЕЗ mimeType — браузер
// сам выбирал то, что реально умеет писать (это зависит от браузера: Safari,
// например, вообще не умеет webm и пишет во что-то своё). А stopRecording
// это игнорировал: Blob получал ЖЁСТКО прописанный `type: "audio/webm"` и имя
// файла всегда заканчивалось на `.webm`, независимо от того, что браузер
// РЕАЛЬНО записал. Расширение/заявленный тип файла не совпадали с настоящими
// байтами — и <audio> на приёме совершенно справедливо отказывался играть
// контейнер, который не может опознать: это и есть NotSupportedError
// («The operation is not supported»).
//
// Теперь: при старте записи явно выбирается ПОДДЕРЖИВАЕМЫЙ браузером mimeType
// через MediaRecorder.isTypeSupported (сначала webm/opus, потом ogg, потом
// mp4 — родной формат Safari), а при остановке берётся СОБСТВЕННЫЙ отчёт
// рекордера о том, что он реально записал (mr.mimeType), и по нему уже
// подбираются правильные тип Blob и расширение файла — вместо того чтобы
// подписывать что угодно как webm. Голосовые, отправленные ДО этого фикса,
// могут остаться неисправимо подписанными неверно — чинится только запись
// вперёд.
//
// ── Фото и видео нельзя было открыть на весь экран (ГРАБЛИ) ─────────────────
// Картинка рисовалась фиксированным квадратом 200×200 без единого обработчика
// нажатия — увеличить её было решительно нечем. Видео в чате не поддерживалось
// вовсе: приложение уже умеет показывать медиа на весь экран (ImageZoomModal —
// пинч-зум фото, MediaViewerModal — плеер видео/аудио с обычными контролами),
// просто чат никогда не был к ним подключён. Теперь подключён: тап по фото
// открывает ImageZoomModal, тап по видео — MediaViewerModal в режиме video.
//
// ── Видео теперь можно отправлять ────────────────────────────────────────────
// pickPhoto переименован в pickMedia: выбор идёт из галереи с mediaTypes
// ['images', 'videos'], видео загружается через уже существующий
// /api/upload/video, а тип вложения 'video' добавлен в перечисление на
// сервере (message_attachment_type) и в схеме БД — см. соответствующие коммиты
// в lib/db/src/schema/messaging.ts, api-server/src/lib/ensureSchema.ts и
// api-server/src/routes/messaging.ts.
//
// ── ГРАБЛИ: возврат из чата ───────────────────────────────────────────────────
// Этот экран и все, кто его открывает (friends.tsx, students.tsx, Профиль
// через FriendsSheet), лежат как плоские скрытые «вкладки-соседи» ОДНОГО и
// того же Tabs-навигатора (см. _layout.tsx), а не как вложенный стек. У
// router.back() между такими соседями нет настоящей истории — он надёжно
// приземляется на первый объявленный таб панели («Задания»), а не туда, откуда
// реально пришли. Поэтому все места, что открывают чат, передают явный адрес
// возврата параметром `back`, а кнопка «назад» здесь делает router.replace на
// него, а не router.back(). Нет параметра (например, старая ссылка) —
// откатываемся в «Профиль»: это единственное место, куда попадает вообще
// каждая роль.
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Pressable, FlatList,
  ActivityIndicator, Platform, Image, Alert, KeyboardAvoidingView,
  Animated, Easing,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { ImageZoomModal } from "@/components/ImageZoomModal";
import { MediaViewerModal } from "@/components/MediaViewerModal";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import authStorage from "@/utils/authStorage";
import { accents, chunky } from "@/constants/theme";
import { useMessagesBadge } from "@/contexts/MessagesBadgeContext";

const BASE = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

/** Куда возвращаться, если вызывающий экран не передал явный адрес. */
const DEFAULT_BACK = "/(main)/profile";

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

// Загрузка файла (фото/аудио/видео) через тот же multipart-роут, что и
// остальные вложения приложения. Имя файла с правильным расширением
// обязательно — сервер определяет Content-Type по нему при отдаче через
// res.sendFile.
async function uploadFile(blob: Blob, filename: string, kind: "image" | "audio" | "video"): Promise<string> {
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

/**
 * Первый реально поддерживаемый браузером формат записи звука. Порядок
 * значим: webm/opus почти везде на десктопе и Android, ogg — редкий, но
 * дешёвый запасной, mp4 — родной формат Safari (там webm не поддерживается
 * вовсе). Возвращает undefined, если браузер вообще не даёт проверить (тогда
 * MediaRecorder создаётся без явного mimeType, а его СОБСТВЕННЫЙ выбор потом
 * читается через mr.mimeType в stopRecording).
 */
const AUDIO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function pickSupportedAudioMime(): string | undefined {
  const MR = (typeof window !== "undefined" ? (window as any).MediaRecorder : undefined);
  if (!MR?.isTypeSupported) return undefined;
  return AUDIO_MIME_CANDIDATES.find((t) => {
    try { return MR.isTypeSupported(t); } catch { return false; }
  });
}

/** Расширение файла по реальному mimeType записи — должно совпадать с содержимым. */
function extensionForAudioMime(mime: string): string {
  if (mime.includes("mp4") || mime.includes("aac") || mime.includes("m4a")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
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
  attachmentType: "image" | "audio" | "video" | null;
  createdAt: string;
  /** Когда получатель прочитал сообщение. null — ещё не прочитано; тогда на
      СВОЁМ (mine) сообщении в углу горит точка, см. renderItem ниже. */
  readAt: string | null;
};

/** Два аргумента одной календарной даты (без времени), для сравнения дней. */
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * «Был в сети» словами — тот же текст и пороги, что на карточке ученика
 * (см. app/(main)/students.tsx), продублирован здесь по тому же принципу, что
 * и другие мелкие утилиты в этом кодовой базе.
 *
 * Показывает ТОЧНОЕ время последнего появления, а не расплывчатое «N дней
 * назад»: «когда именно» — вопрос, на который отвечает часовой пояс
 * устройства, а не прикидка в днях.
 *
 * «Ещё не заходил» — только когда lastSeenAt в принципе пуст (аккаунт,
 * который правда ни разу не открывал приложение). Раньше это сообщение
 * ошибочно показывалось и активным пользователям сразу после выхода из
 * аккаунта — см. фикс POST /users/offline на сервере.
 */
function lastSeenText(lastSeenAt: string | null | undefined, isOnline: boolean | undefined): string {
  if (isOnline) return "в сети";
  if (!lastSeenAt) return "ещё не заходил";
  const seen = new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) return "ещё не заходил";

  const now = new Date();
  const time = seen.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (sameDay(seen, now)) return `был в сети сегодня в ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(seen, yesterday)) return `был в сети вчера в ${time}`;

  const dateLabel = seen.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    ...(seen.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
  return `был в сети ${dateLabel} в ${time}`;
}

/**
 * Голосовое сообщение. Звук на вебе — обычный HTML <audio> (тот же приём, что
 * в components/InlineMediaPlayer.tsx), на нативе — expo-av. Игра play()
 * обёрнута в try/catch: если файл всё же не воспроизведётся (например,
 * старое голосовое, записанное до фикса формата — см. шапку файла), кнопка
 * просто не переключится в «playing», без падения экрана.
 */
function AudioBubble({ url, mine }: { url: string; mine: boolean }) {
  const colors = useColors();
  const [playing, setPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const fullUrl = `${BASE}${url}`;

  const toggle = useCallback(async () => {
    if (Platform.OS === "web") {
      const el = webAudioRef.current;
      if (!el) return;
      if (el.paused) {
        try {
          await el.play();
          setPlaying(true);
        } catch {
          setPlaying(false);
        }
      } else {
        el.pause();
        setPlaying(false);
      }
      return;
    }
    try {
      if (playing && soundRef.current) {
        await soundRef.current.stopAsync();
        setPlaying(false);
        return;
      }
      const { sound } = await Audio.Sound.createAsync({ uri: fullUrl });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) setPlaying(false);
      });
      setPlaying(true);
      await sound.playAsync();
    } catch {
      setPlaying(false);
    }
  }, [playing, fullUrl]);

  useEffect(() => () => {
    if (Platform.OS !== "web") soundRef.current?.unloadAsync().catch(() => {});
  }, []);

  return (
    <TouchableOpacity onPress={toggle} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 }}>
      {Platform.OS === "web" && (
        // @ts-ignore web-only audio element: скрытый, управляем им сами через
        // кнопку play/pause выше — тот же приём, что в InlineMediaPlayer.tsx.
        <audio
          ref={webAudioRef}
          src={fullUrl}
          style={{ display: "none" }}
          onEnded={() => setPlaying(false)}
        />
      )}
      <Feather name={playing ? "pause" : "play"} size={20} color={mine ? "#fff" : colors.primary} />
      <View style={{ height: 4, width: 90, borderRadius: 2, backgroundColor: mine ? "rgba(255,255,255,0.6)" : colors.border }} />
      <Feather name="mic" size={16} color={mine ? "#fff" : colors.mutedForeground} />
    </TouchableOpacity>
  );
}

/**
 * Превью видео внутри пузыря. На вебе — беззвучный <video> с preload="metadata"
 * (браузер сам покажет первый кадр как постер), поверх него значок play. На
 * нативе полноценного превью без доп. библиотеки нет — тёмный квадрат с тем же
 * значком, сам плеер открывается по тапу через MediaViewerModal.
 */
function VideoBubble({ url, onOpen }: { url: string; onOpen: () => void }) {
  const fullUrl = `${BASE}${url}`;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel="Открыть видео"
      style={{
        width: 200, height: 200, borderRadius: 12, overflow: "hidden",
        backgroundColor: "#000", alignItems: "center", justifyContent: "center",
      }}
    >
      {Platform.OS === "web" && (
        // @ts-ignore web-only video element — только беззвучное превью, тап
        // открывает настоящий плеер в MediaViewerModal.
        <video
          src={fullUrl}
          muted
          playsInline
          preload="metadata"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      <View style={{
        position: "absolute", width: 46, height: 46, borderRadius: 23,
        backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center",
      }}>
        <Feather name="play" size={20} color="#fff" />
      </View>
    </Pressable>
  );
}

/**
 * Круглая кнопка входной панели (фото/видео, микрофон/отправить) с нижней
 * гранью и просадкой при нажатии — тем же приёмом, что у ChunkyButton в
 * остальном приложении (см. constants/theme.ts → chunky). Просили сделать
 * объёмными именно кнопки, а не переписку — поэтому пузыри сообщений эту
 * обёртку не используют и остаются плоскими.
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
  const { userId, back: backParam } = useLocalSearchParams<{ userId: string; back?: string }>();
  const otherId = Number(userId);
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { refresh: refreshUnreadBadge } = useMessagesBadge();

  // Явный адрес возврата — см. «ГРАБЛИ: возврат из чата» в шапке файла.
  const goBack = useCallback(() => {
    const dest = typeof backParam === "string" && backParam ? decodeURIComponent(backParam) : DEFAULT_BACK;
    router.replace(dest as any);
  }, [backParam, router]);

  const [other, setOther] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);

  // Полноэкранный просмотр: фото — через ImageZoomModal (пинч-зум), видео —
  // через MediaViewerModal (нормальный плеер с перемоткой). См. «Фото и видео
  // нельзя было открыть на весь экран» в шапке файла.
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [openVideo, setOpenVideo] = useState<string | null>(null);

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

  const doSend = useCallback(async (payload: { text?: string; attachmentUrl?: string; attachmentType?: "image" | "audio" | "video" }) => {
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

  /**
   * Выбор фото ИЛИ видео из галереи. Раньше пикер принимал только
   * mediaTypes: Images — видео нельзя было выбрать физически. См. «Видео
   * теперь можно отправлять» в шапке файла.
   */
  const pickMedia = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.6,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const isVideo = asset.type === "video";
    try {
      setSending(true);
      const blob = await (await fetch(asset.uri)).blob();
      if (isVideo) {
        const ext = asset.uri.split(".").pop()?.split("?")[0]?.toLowerCase() || "mp4";
        const url = await uploadFile(blob, `video.${ext}`, "video");
        await doSend({ attachmentUrl: url, attachmentType: "video" });
      } else {
        const url = await uploadFile(blob, "photo.jpg", "image");
        await doSend({ attachmentUrl: url, attachmentType: "image" });
      }
    } catch (e: any) {
      Alert.alert(
        isVideo ? "Не удалось отправить видео" : "Не удалось отправить фото",
        e.message ?? "Попробуйте ещё раз",
      );
    } finally {
      setSending(false);
    }
  }, [doSend]);

  // ── Запись голосового сообщения ─────────────────────────────────────
  //
  // См. «ГРАБЛИ: голосовые сообщения были подписаны неверным форматом» в
  // шапке файла — mimeType выбирается ЯВНО и заранее проверенным браузером
  // (pickSupportedAudioMime), а не угадывается постфактум.
  const startRecording = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const preferred = pickSupportedAudioMime();
        const mr = preferred
          ? new (window as any).MediaRecorder(stream, { mimeType: preferred })
          : new (window as any).MediaRecorder(stream);
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
        // mr.mimeType — то, что браузер РЕАЛЬНО записал (даже если mimeType не
        // задавался явно при создании). Раньше здесь стоял жёстко прописанный
        // "audio/webm" вне зависимости от факта — см. шапку файла.
        const actualMime: string = mr.mimeType || "audio/webm";
        blob = await new Promise<Blob>((resolve) => {
          mr.onstop = () => resolve(new Blob(webChunksRef.current, { type: actualMime }));
          mr.stop();
          mr.stream.getTracks().forEach((tr: any) => tr.stop());
        });
        filename = `voice.${extensionForAudioMime(actualMime)}`;
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
            padding: item.attachmentType === "image" || item.attachmentType === "video" ? 4 : 10,
          }}>
            {item.attachmentType === "image" && item.attachmentUrl && (
              <Pressable onPress={() => setZoomImage(`${BASE}${item.attachmentUrl}`)}>
                <Image
                  source={{ uri: `${BASE}${item.attachmentUrl}` }}
                  style={{ width: 200, height: 200, borderRadius: 12 }}
                  resizeMode="cover"
                />
              </Pressable>
            )}
            {item.attachmentType === "video" && item.attachmentUrl && (
              <VideoBubble
                url={item.attachmentUrl}
                onOpen={() => setOpenVideo(`${BASE}${item.attachmentUrl}`)}
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
              readAt пустой. Внизу пузыря, у времени отправки — по месту стоит
              рядом с этой же строкой. Пропадает сама на ближайшем опросе, см.
              шапку файла. */}
          {mine && !item.readAt && (
            <View style={{
              position: "absolute", bottom: -3, right: -3,
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
        <TouchableOpacity onPress={goBack} style={{ marginTop: 20, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}>
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
        <TouchableOpacity onPress={goBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
              {/* Онлайн или точное время, когда был в сети последний раз — см. шапку файла. */}
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
            onPress={pickMedia}
            disabled={sending || recording}
            background={colors.card}
            edgeColor="rgba(160,140,220,0.35)"
            accessibilityLabel="Прикрепить фото или видео"
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

      <ImageZoomModal uri={zoomImage} onClose={() => setZoomImage(null)} />
      <MediaViewerModal url={openVideo} kind="video" onClose={() => setOpenVideo(null)} />
    </View>
  );
}
