import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Alert, TextInput, Image, Animated,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { ImageZoomModal } from "@/components/ImageZoomModal";
import { MediaViewerModal, type MediaKind } from "@/components/MediaViewerModal";
import { InlineMediaPlayer } from "@/components/InlineMediaPlayer";
import ConfirmModal from "@/components/ConfirmModal";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import authStorage from "@/utils/authStorage";

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string, options?: RequestInit) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);
  return data;
}

type Question = {
  id: number;
  text: string;
  options: string[] | null;
  correctAnswer: string | null;
  orderIndex: number;
};

type AssignmentDetail = {
  id: number;
  title: string;
  description: string;
  type: string;
  points: number;
  ageMin: number;
  ageMax: number;
  content: string | null;
  mediaUrl: string | null;
  imageUrl: string | null;
  isDraft: boolean;
  timeLimitMinutes: number | null;
  questions: Question[];
};

const TYPE_LABELS: Record<string, string> = {
  text_test: "Тест",
  audio: "Аудирование",
  reading: "Чтение",
  video: "Видео",
  free_form: "Свободный ответ",
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Colour palette (light quiz theme) ───────────────────────────────────────
// Transparent so the app-wide gradient (same as the Задания tab) shows through.
const QUIZ_BG = "transparent";
const CARD_BG = "#ffffff";
const PRIMARY = "#7c3aed";
const PRIMARY_LIGHT = "#f5f3ff";
const PRIMARY_DARK = "#6d28d9";
const ORANGE = "#ec4899";
const AUDIO_BG = "#cbb8ef";
const QUESTION_BG = "#d3c2f2";
const WAVE_START = "#6d28d9";
const WAVE_END = "#c4b5fd";
const lerpColor = (c1: string, c2: string, t: number) => {
  const clamp = Math.max(0, Math.min(1, t));
  const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = p(c1);
  const [r2, g2, b2] = p(c2);
  const r = Math.round(r1 + (r2 - r1) * clamp);
  const g = Math.round(g1 + (g2 - g1) * clamp);
  const b = Math.round(b1 + (b2 - b1) * clamp);
  return `rgb(${r}, ${g}, ${b})`;
};
const SUCCESS = "#818cf8";
const DANGER = "#e11d48";
const TEXT_DARK = "#1e1b4b";
const TEXT_MID = "#4b5563";
const TEXT_MUTED = "#94a3b8";
const BORDER = "#e2e8f0";
const SLATE = "#64748b";

export default function AssignmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const assignmentId = parseInt(id || "0", 10);
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [mediaModal, setMediaModal] = useState<{ url: string; kind: MediaKind; title?: string } | null>(null);
  const [showUnansweredModal, setShowUnansweredModal] = useState(false);
  const [unansweredCount, setUnansweredCount] = useState(0);
  const [showExitModal, setShowExitModal] = useState(false);

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Step-by-step navigation
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [readingExpanded, setReadingExpanded] = useState(false);

  // Плавная анимация полосы прогресса — заполняется ПОСЛЕ ответа на вопрос.
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Free-form
  const [freeFormText, setFreeFormText] = useState("");
  const [freeFormAttachment, setFreeFormAttachment] = useState<string | null>(null);
  const [freeFormUploading, setFreeFormUploading] = useState(false);

  // Timer
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerExpired, setTimerExpired] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSubmitRef = useRef(false);
  const answersRef = useRef<Record<number, string>>({});

  // Audio player (web only — hidden <audio> element)
  const audioRef = useRef<any>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioSpeed, setAudioSpeed] = useState(1);

  const isTeacherRole = user?.role === "teacher" || user?.role === "admin";
  const isStudent = user?.role === "student";

  // Load assignment
  useEffect(() => {
    if (!assignmentId) return;
    setAssignment(null);
    setAnswers({});
    setSubmitted(false);
    setResult(null);
    setIsLoading(true);
    setFetchError(null);
    setTimeLeft(null);
    setTimerExpired(false);
    setCurrentQuestionIndex(0);
    autoSubmitRef.current = false;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    apiFetch(`/api/assignments/${assignmentId}`)
      .then(setAssignment)
      .catch((e: Error) => setFetchError(e.message))
      .finally(() => setIsLoading(false));
  }, [assignmentId]);

  // Timer
  useEffect(() => {
    if (!assignment || !isStudent || submitted) return;
    if (!assignment.timeLimitMinutes) return;
    const totalSeconds = assignment.timeLimitMinutes * 60;
    setTimeLeft(totalSeconds);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!); timerRef.current = null;
          setTimerExpired(true); return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [assignment?.id, isStudent]);

  const handleSubmit = useCallback(async (forcedAnswers?: Record<number, string>) => {
    if (!assignment || submitting) return;
    setSubmitting(true);
    const currentAnswers = forcedAnswers ?? answers;
    try {
      let data: any;
      if (assignment.type === "free_form") {
        data = await apiFetch(`/api/assignments/${assignmentId}/submit`, {
          method: "POST",
          body: JSON.stringify({ textAnswer: freeFormText, attachmentUrl: freeFormAttachment }),
        });
      } else {
        const answerList = (assignment.questions || []).map((q: Question) => ({
          questionId: q.id,
          answer: currentAnswers[q.id] || "",
        }));
        data = await apiFetch(`/api/assignments/${assignmentId}/submit`, {
          method: "POST",
          body: JSON.stringify({ answers: answerList }),
        });
      }
      setResult(data);
      setSubmitted(true);
    } catch (e: any) {
      Alert.alert("Ошибка отправки", e.message ?? "Не удалось отправить. Попробуйте снова.");
    } finally {
      setSubmitting(false);
    }
  }, [assignment, answers, assignmentId, submitting, freeFormText, freeFormAttachment]);

  const handleAttachPhoto = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Нет доступа", "Разрешите доступ к галерее.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setFreeFormUploading(true);
    try {
      const token = await authStorage.getItem("auth_token");
      const filename = asset.uri.split("/").pop() || "photo.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const ext = match ? match[1] : "jpg";
      const contentType = `image/${ext === "jpg" ? "jpeg" : ext}`;

      // Web (the VPS deployment is Expo web): GCS presigned PUT for persistence.
      if (Platform.OS === "web") {
        const blobRes = await fetch(asset.uri);
        const blob = await blobRes.blob();
        const presignedRes = await fetch(`${BASE_URL}/api/storage/request-upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
          body: JSON.stringify({ name: filename, size: blob.size, contentType }),
        });
        const presignedData = await presignedRes.json();
        if (!presignedRes.ok) throw new Error(presignedData.error ?? "Ошибка получения URL загрузки");
        const { uploadURL, objectPath } = presignedData as { uploadURL: string; objectPath: string };
        const uploadRes = await fetch(uploadURL, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: blob,
        });
        if (!uploadRes.ok) throw new Error("Ошибка загрузки файла на сервер");
        setFreeFormAttachment(`${BASE_URL}/api/storage${objectPath}?kind=image`);
      } else {
        // Native fallback (not used by the VPS web deployment): multer multipart
        // — kept so the native app still builds/works. Files land on disk only.
        const form = new FormData();
        form.append("file", { uri: asset.uri, name: filename, type: contentType } as any);
        const uploadRes = await fetch(`${BASE_URL}/api/upload/image`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token ?? ""}` },
          body: form,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error ?? "Ошибка загрузки");
        setFreeFormAttachment(uploadData.url);
      }
    } catch (e: any) {
      Alert.alert("Не удалось загрузить фото", e.message ?? "Попробуйте снова.");
    } finally {
      setFreeFormUploading(false);
    }
  }, []);

  const handleSubmitPressed = useCallback(() => {
    if (assignment?.type === "free_form") {
      if (!freeFormText.trim() && !freeFormAttachment) {
        Alert.alert("Добавьте ответ", "Напишите текст ответа или прикрепите фото.");
        return;
      }
      handleSubmit();
      return;
    }
    const questions = assignment?.questions ?? [];
    if (questions.length === 0) { handleSubmit(); return; }
    const empty = questions.filter((q: Question) => !answers[q.id]?.trim());
    if (empty.length === 0) {
      handleSubmit();
    } else {
      setUnansweredCount(empty.length);
      setShowUnansweredModal(true);
    }
  }, [assignment, answers, handleSubmit, freeFormText, freeFormAttachment]);

  useEffect(() => { answersRef.current = answers; }, [answers]);

  useEffect(() => {
    if (timerExpired && !submitted && !autoSubmitRef.current) {
      autoSubmitRef.current = true;
      handleSubmit(answersRef.current);
    }
  }, [timerExpired]);

  // Плавно догоняем полосу прогресса до текущего значения. Значение зависит от
  // числа отвеченных вопросов, поэтому эффект срабатывает ПОСЛЕ ответа (когда
  // меняется answers) — полоса растёт после ответа, а не до него.
  useEffect(() => {
    const qs = assignment?.questions ?? [];
    const answered = qs.filter(q => !!answers[q.id]?.trim()).length;
    const pct = submitted ? 100 : qs.length > 0 ? (answered / qs.length) * 100 : 0;
    Animated.timing(progressAnim, {
      toValue: pct,
      duration: 450,
      useNativeDriver: false, // анимируем width (layout-свойство)
    }).start();
  }, [assignment, answers, submitted, progressAnim]);

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: QUIZ_BG, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={PRIMARY} size="large" />
      </View>
    );
  }

  if (fetchError || !assignment) {
    return (
      <View style={{ flex: 1, backgroundColor: QUIZ_BG }}>
        <View style={{ paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()} style={s.iconBtn}>
            <Feather name="arrow-left" size={20} color={SLATE} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Задание</Text>
        </View>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40 }}>
          <Feather name="alert-circle" size={40} color={DANGER} />
          <Text style={{ marginTop: 12, fontSize: 15, color: TEXT_MID, textAlign: "center" }}>{fetchError ?? "Задание не найдено"}</Text>
          <TouchableOpacity
            style={{ marginTop: 16, backgroundColor: PRIMARY, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
            onPress={() => { setIsLoading(true); setFetchError(null); apiFetch(`/api/assignments/${assignmentId}`).then(setAssignment).catch((e: Error) => setFetchError(e.message)).finally(() => setIsLoading(false)); }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Повторить</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const questions = assignment.questions || [];
  const mediaUrl = assignment.mediaUrl || (assignment.type !== "reading" ? assignment.content : null);
  const textContent = assignment.type === "reading" ? assignment.content : null;
  const imageUrl = assignment.imageUrl;

  const isAudioUrl = (url: string) => url.includes("kind=audio") || /\.(mp3|m4a|wav|ogg|aac)(\?|$)/i.test(url) || url.includes("/upload/audio") || url.includes("/upload/student-recording");
  const isVideoUrl = (url: string) => url.includes("kind=video") || url.includes("youtube") || url.includes("youtu.be") || /\.(mp4|mov|webm|avi)(\?|$)/i.test(url) || url.includes("/upload/video") || url.includes("/api/storage/objects/");
  const showVideoBlock = !!mediaUrl && (assignment.type === "video" || assignment.type === "text_test" || (assignment.type !== "audio" && !isAudioUrl(mediaUrl) && isVideoUrl(mediaUrl)));
  const showAudioBlock = !!mediaUrl && (assignment.type === "audio" || (assignment.type !== "video" && assignment.type !== "text_test" && !showVideoBlock && isAudioUrl(mediaUrl)));
  const showOtherBlock = !!mediaUrl && !showVideoBlock && !showAudioBlock;

  const openMedia = () => {
    if (!mediaUrl) return;
    const kind: MediaKind = showVideoBlock ? "video" : showAudioBlock ? "audio" : "other";
    setMediaModal({ url: mediaUrl, kind, title: assignment.title });
  };

  const toggleAudio = () => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = audioSpeed;
    if (audioPlaying) {
      el.pause();
      setAudioPlaying(false);
    } else {
      el.play().catch(() => {});
      setAudioPlaying(true);
    }
  };

  const replayAudio = () => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    el.playbackRate = audioSpeed;
    el.play().catch(() => {});
    setAudioPlaying(true);
  };

  const toggleAudioSpeed = () => {
    const next = audioSpeed === 1 ? 0.5 : 1;
    setAudioSpeed(next);
    const el = audioRef.current;
    if (el) el.playbackRate = next;
  };

  const formatAudioTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const hasTimer = isStudent && !!assignment.timeLimitMinutes && !submitted;
  const timerWarning = timeLeft !== null && timeLeft < 60;
  const timerDanger = timeLeft !== null && timeLeft < 30;
  const timerColor = timerDanger ? DANGER : timerWarning ? ORANGE : SUCCESS;
  const inputsDisabled = submitted || timerExpired;

  const totalSteps = questions.length > 0 ? questions.length : 1;
  const answeredCount = questions.filter(q => !!answers[q.id]?.trim()).length;
  const progressPct = submitted ? 100 : questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;

  // ─── TEACHER VIEW: classic scroll layout ─────────────────────────────────
  if (isTeacherRole) {
    return (
      <View style={{ flex: 1, backgroundColor: QUIZ_BG }}>
        <ImageZoomModal uri={zoomImg} onClose={() => setZoomImg(null)} />
        <MediaViewerModal url={mediaModal?.url ?? null} kind={mediaModal?.kind ?? "other"} title={mediaModal?.title} onClose={() => setMediaModal(null)} />
        {/* Header */}
        <View style={[s.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color={SLATE} />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>{assignment.title}</Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 120, gap: 12 }}>
          {/* Info */}
          <View style={s.card}>
            <Text style={s.assignTitle}>{assignment.title}</Text>
            {!!assignment.description?.trim() && (
              <Text style={[s.bodyText, { marginBottom: 10 }]}>{assignment.description}</Text>
            )}
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <View style={[s.badge, { backgroundColor: "#ede9fe" }]}>
                <Text style={[s.badgeText, { color: PRIMARY }]}>{TYPE_LABELS[assignment.type] ?? assignment.type}</Text>
              </View>
              <View style={[s.badge, { backgroundColor: "#fce7f3" }]}>
                <Feather name="star" size={11} color="#9d174d" />
                <Text style={[s.badgeText, { color: "#9d174d" }]}>{assignment.points > 0 ? `${assignment.points} очков` : "Баллы по проверке"}</Text>
              </View>
            </View>
          </View>
          {/* Image */}
          {imageUrl && (
            <TouchableOpacity onPress={() => setZoomImg(imageUrl)} style={[s.card, { padding: 0, overflow: "hidden" }]} activeOpacity={0.9}>
              <Image source={{ uri: imageUrl }} style={{ width: "100%", height: 200, borderRadius: 14 }} resizeMode="cover" />
            </TouchableOpacity>
          )}
          {/* Media */}
          {textContent && <View style={s.card}><Text style={s.sectionTitle}>Текст для чтения</Text><Text style={s.bodyText}>{textContent}</Text></View>}
          {showAudioBlock && mediaUrl && (
            <View style={s.card}>
              <InlineMediaPlayer url={mediaUrl} kind="audio" title={assignment.title} />
            </View>
          )}
          {showVideoBlock && mediaUrl && (
            <View style={s.card}>
              <InlineMediaPlayer url={mediaUrl} kind="video" height={200} title={assignment.title} />
            </View>
          )}
          {showOtherBlock && mediaUrl && (
            <View style={s.card}>
              <InlineMediaPlayer url={mediaUrl} kind="other" height={200} title={assignment.title} />
            </View>
          )}
          {/* Questions — teacher sees correct answers */}
          {questions.length > 0 && (
            <View>
              <Text style={[s.sectionTitle, { marginBottom: 10 }]}>Вопросы</Text>
              {questions.map((q, i) => (
                <View key={q.id} style={[s.card, { marginBottom: 10 }]}>
                  <Text style={[s.bodyText, { fontWeight: "600", color: TEXT_DARK, marginBottom: 8 }]}>{i + 1}. {q.text}</Text>
                  {q.correctAnswer && (
                    <View style={{ backgroundColor: "#eef2ff", borderRadius: 10, padding: 10, borderWidth: 1.5, borderColor: SUCCESS }}>
                      <Text style={{ color: SUCCESS, fontWeight: "600", fontSize: 14 }}>✓ {q.correctAnswer}</Text>
                    </View>
                  )}
                  {Array.isArray(q.options) && q.options.map((opt, oi) => (
                    <View key={oi} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: opt === q.correctAnswer ? SUCCESS : BORDER }} />
                      <Text style={{ fontSize: 13, color: opt === q.correctAnswer ? SUCCESS : TEXT_MID, fontWeight: opt === q.correctAnswer ? "600" : "400" }}>{opt}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ─── SUBMITTED RESULT SCREEN ─────────────────────────────────────────────
  if (submitted && result) {
    const isFreeForm = assignment.type === "free_form";
    const score = result.score ?? 0;
    const passed = score >= 70;

    return (
      <View style={{ flex: 1, backgroundColor: QUIZ_BG }}>
        <ImageZoomModal uri={zoomImg} onClose={() => setZoomImg(null)} />
        <MediaViewerModal url={mediaModal?.url ?? null} kind={mediaModal?.kind ?? "other"} title={mediaModal?.title} onClose={() => setMediaModal(null)} />
        <View style={[s.header, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color={SLATE} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Результат</Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 120 }}>
          {/* Score card */}
          <View style={[s.card, { alignItems: "center", paddingVertical: 30, marginBottom: 16 }]}>
            <View style={{
              width: 90, height: 90, borderRadius: 45, marginBottom: 16,
              backgroundColor: passed ? "#eef2ff" : "#fff1f2",
              borderWidth: 3, borderColor: passed ? SUCCESS : DANGER,
              justifyContent: "center", alignItems: "center",
            }}>
              <Text style={{ fontSize: 28, fontWeight: "900", color: passed ? SUCCESS : DANGER }}>
                {isFreeForm ? "✓" : `${score}%`}
              </Text>
            </View>
            <Text style={{ fontSize: 20, fontWeight: "800", color: TEXT_DARK, marginBottom: 4 }}>
              {isFreeForm ? "Ответ отправлен!" : passed ? "Отлично!" : "Можно лучше!"}
            </Text>
            {!isFreeForm && (
              <Text style={{ fontSize: 14, color: TEXT_MID, marginBottom: 14 }}>
                {result.correctCount}/{result.totalQuestions} правильных ответов
              </Text>
            )}
            {result.pointsEarned > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fce7f3", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}>
                <Feather name="star" size={15} color="#9d174d" />
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#9d174d" }}>+{result.pointsEarned} очков!</Text>
              </View>
            )}
            {isFreeForm && (
              <Text style={{ fontSize: 13, color: TEXT_MUTED, textAlign: "center", marginTop: 8, lineHeight: 19 }}>
                Баллы начислятся после проверки учителем
              </Text>
            )}
            {timerExpired && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
                <Feather name="clock" size={13} color={TEXT_MUTED} />
                <Text style={{ fontSize: 12, color: TEXT_MUTED }}>Сдано автоматически по истечении времени</Text>
              </View>
            )}
          </View>

          {/* Per-question results */}
          {!isFreeForm && questions.length > 0 && result.results && (
            <View>
              <Text style={[s.sectionTitle, { marginBottom: 10 }]}>Ответы</Text>
              {questions.map((q, i) => {
                const qr = result.results.find((r: any) => r.questionId === q.id);
                const correct = qr?.isCorrect;
                return (
                  <View key={q.id} style={[s.card, { marginBottom: 10, borderWidth: 1.5, borderColor: correct ? SUCCESS + "60" : DANGER + "60" }]}>
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: correct ? SUCCESS : DANGER, justifyContent: "center", alignItems: "center", marginTop: 1 }}>
                        <Feather name={correct ? "check" : "x"} size={13} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: TEXT_DARK, marginBottom: 4 }}>{i + 1}. {q.text}</Text>
                        <Text style={{ fontSize: 12, color: correct ? SUCCESS : DANGER, fontWeight: "600" }}>
                          {correct ? "Верно!" : `Ваш ответ: ${answers[q.id] || "(пусто)"}`}
                        </Text>
                        {!correct && qr?.correctAnswer && (
                          <Text style={{ fontSize: 12, color: TEXT_MID, marginTop: 2 }}>
                            Правильно: {qr.correctAnswer}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <TouchableOpacity
            style={[s.nextBtn, { marginTop: 8 }]}
            onPress={() => router.back()}
          >
            <Text style={s.nextBtnText}>Вернуться к заданиям</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ─── STEP-BY-STEP STUDENT QUIZ ────────────────────────────────────────────
  const isFreeForm = assignment.type === "free_form";
  const currentQ = isFreeForm ? null : questions[currentQuestionIndex];
  const isLastStep = isFreeForm ? true : currentQuestionIndex >= questions.length - 1;
  const currentAnswered = currentQ ? !!answers[currentQ.id]?.trim() : false;

  const goNext = () => {
    if (!isLastStep) {
      setCurrentQuestionIndex(i => i + 1);
    } else {
      handleSubmitPressed();
    }
  };

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 16);

  return (
    <View style={{ flex: 1, backgroundColor: QUIZ_BG }}>
      <ImageZoomModal uri={zoomImg} onClose={() => setZoomImg(null)} />
      <MediaViewerModal url={mediaModal?.url ?? null} kind={mediaModal?.kind ?? "other"} title={mediaModal?.title} onClose={() => setMediaModal(null)} />
      <ConfirmModal
        visible={showUnansweredModal}
        title="Не все вопросы отвечены"
        message={`Вы оставили без ответа ${unansweredCount} ${unansweredCount === 1 ? "вопрос" : unansweredCount < 5 ? "вопроса" : "вопросов"}. Отправить с пустыми полями?`}
        confirmText="Отправить всё равно"
        cancelText="Вернуться и ответить"
        onConfirm={() => { setShowUnansweredModal(false); handleSubmit(); }}
        onCancel={() => setShowUnansweredModal(false)}
      />
      <ConfirmModal
        visible={showExitModal}
        title="Выйти из теста?"
        message="Если вы выйдете сейчас, тест будет завершён и отправлен на проверку с текущими ответами. Продолжить его позже будет нельзя."
        confirmText="Завершить"
        cancelText="Остаться"
        onConfirm={() => { setShowExitModal(false); handleSubmit(); }}
        onCancel={() => setShowExitModal(false)}
      />

      {/* ── Floating exit button — sits higher, above the step-counter row ── */}
      <TouchableOpacity
        style={[s.floatingCloseBtn, { top: insets.top + (Platform.OS === "web" ? 20 : 8) }]}
        onPress={() => setShowExitModal(true)}
      >
        <Feather name="x" size={18} color={SLATE} />
      </TouchableOpacity>

      {/* ── Top bar ── */}
      <View style={[s.topBar, { paddingTop: topPad }]}>
        <View style={{ width: 36 }} />

        {/* Номер вопроса убран — прогресс показывает полоса внизу экрана */}
        <Text style={s.stepCounter}>
          {isFreeForm ? assignment.title : ""}
        </Text>

        {hasTimer && timeLeft !== null ? (
          <View style={[s.timerBadge, { borderColor: timerColor + "50", backgroundColor: timerColor + "15" }]}>
            <Feather name="clock" size={13} color={timerColor} />
            <Text style={[s.timerText, { color: timerColor }]}>{formatTime(timeLeft)}</Text>
          </View>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {/* ── Type label ── */}
      <Text style={s.typeLabel}>{TYPE_LABELS[assignment.type] ?? assignment.type}</Text>

      {/* ── Scrollable content ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Timer expired banner */}
        {timerExpired && !submitted && (
          <View style={{ backgroundColor: "#fff1f2", borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: "#fda4af", marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Feather name="clock" size={18} color={DANGER} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: DANGER, flex: 1 }}>
              {submitting ? "Ответы отправляются…" : "Время вышло!"}
            </Text>
          </View>
        )}

        {/* ── Description card (only if the teacher added one) ── */}
        {!!assignment.description?.trim() && (
          <View style={[s.card, { marginBottom: 12 }]}>
            <Text style={[s.sectionTitle, { marginBottom: 6 }]}>Описание</Text>
            <Text style={s.bodyText}>{assignment.description}</Text>
          </View>
        )}

        {/* ── Audio player card ── */}
        {showAudioBlock && (
          <View style={[s.card, { marginBottom: 12, backgroundColor: AUDIO_BG }]}>
            {/* Hidden web audio element — no controls */}
            {Platform.OS === "web" && mediaUrl && (
              // @ts-ignore
              <audio
                ref={audioRef}
                src={mediaUrl}
                style={{ display: "none" }}
                onEnded={() => setAudioPlaying(false)}
                onLoadedMetadata={(e: any) => setAudioDuration(e.target.duration)}
                onTimeUpdate={(e: any) => setAudioCurrentTime(e.target.currentTime)}
              />
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <TouchableOpacity
                style={{ borderRadius: 24, overflow: "hidden" }}
                onPress={Platform.OS === "web" ? toggleAudio : openMedia}
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
                {/* Waveform bars — purple gradient for played portion, grey for rest — stretched to fill available width */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 32, width: "100%" }}>
                  {Array.from({ length: 30 }).map((_, i) => {
                    const fraction = audioDuration ? audioCurrentTime / audioDuration : 0;
                    const played = i / 30 < fraction;
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
              <Text style={{ fontSize: 12, color: TEXT_MUTED, fontWeight: "600", minWidth: 36 }}>
                {audioDuration ? formatAudioTime(audioDuration) : "—:——"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                style={[s.chipBtn]}
                onPress={Platform.OS === "web" ? replayAudio : openMedia}
              >
                <Feather name="refresh-cw" size={12} color={SLATE} />
                <Text style={s.chipBtnText}>Слушать снова</Text>
              </TouchableOpacity>
              {Platform.OS === "web" && (
                <TouchableOpacity
                  style={[s.chipBtn, audioSpeed === 0.5 && { backgroundColor: PRIMARY + "20", borderWidth: 1.5, borderColor: PRIMARY }]}
                  onPress={toggleAudioSpeed}
                >
                  <Feather name="zap" size={12} color={audioSpeed === 0.5 ? PRIMARY : SLATE} />
                  <Text style={[s.chipBtnText, audioSpeed === 0.5 && { color: PRIMARY }]}>{audioSpeed === 1 ? "1x" : "0.5x"}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ── Video card ── */}
        {showVideoBlock && mediaUrl && (
          <View style={[s.card, { marginBottom: 12 }]}>
            <InlineMediaPlayer url={mediaUrl} kind="video" height={200} />
          </View>
        )}

        {/* ── Attached file card (unrecognized type) ── */}
        {showOtherBlock && mediaUrl && (
          <View style={[s.card, { marginBottom: 12 }]}>
            <InlineMediaPlayer url={mediaUrl} kind="other" height={200} title={assignment.title} />
          </View>
        )}

        {/* ── Reading text card (collapsible) ── */}
        {textContent && (
          <View style={[s.card, { marginBottom: 12 }]}>
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }} onPress={() => setReadingExpanded(e => !e)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "#e0e7ff", justifyContent: "center", alignItems: "center" }}>
                  <Feather name="book-open" size={14} color={SUCCESS} />
                </View>
                <Text style={[s.sectionTitle, { marginBottom: 0 }]}>Текст для чтения</Text>
              </View>
              <Feather name={readingExpanded ? "chevron-up" : "chevron-down"} size={16} color={SLATE} />
            </TouchableOpacity>
            {readingExpanded && (
              <Text style={[s.bodyText, { marginTop: 12, lineHeight: 22 }]}>{textContent}</Text>
            )}
            {!readingExpanded && (
              <Text style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 6 }}>Нажмите, чтобы раскрыть текст</Text>
            )}
          </View>
        )}

        {/* ── Assignment image ── */}
        {imageUrl && (
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => setZoomImg(imageUrl)}
            style={[s.card, { padding: 4, overflow: "hidden", marginBottom: 12, borderWidth: 1.5, borderColor: BORDER }]}
          >
            <Image
              source={{ uri: imageUrl }}
              style={{ width: "100%", height: 160, borderRadius: 10 }}
              resizeMode="cover"
            />
            <View style={{ position: "absolute", bottom: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.9)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
              <Feather name="maximize-2" size={11} color={SLATE} />
              <Text style={{ fontSize: 11, color: SLATE, fontWeight: "600" }}>Увеличить</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Current question card ── */}
        {currentQ && (
          <View style={[s.card, { marginBottom: 12, backgroundColor: QUESTION_BG }]}>
            {/* Solid colour instead of the background-clip gradient hack: the
                gradient text caused ghost/duplicate rendering artifacts in
                iOS Safari when the question card scrolls. */}
            <Text style={[s.questionText, Platform.OS === "web" && { color: "#4c1d95" }]}>
              {currentQ.text}
            </Text>
          </View>
        )}

        {/* ── Answer options ── */}
        {currentQ && (() => {
          const hasOptions = Array.isArray(currentQ.options) && currentQ.options.length > 0;
          const selected = answers[currentQ.id];

          if (hasOptions) {
            return (
              <View style={{ gap: 10, marginBottom: 12 }}>
                {(currentQ.options as string[]).map((opt, oi) => {
                  const isSelected = selected === opt;
                  return (
                    <TouchableOpacity
                      key={oi}
                      onPress={() => !inputsDisabled && setAnswers(prev => ({ ...prev, [currentQ.id]: opt }))}
                      activeOpacity={inputsDisabled ? 1 : 0.7}
                      style={[s.optionBtn, {
                        borderColor: isSelected ? PRIMARY : BORDER,
                        backgroundColor: isSelected ? "#ede9fe" : CARD_BG,
                        shadowColor: isSelected ? PRIMARY : "#000",
                        shadowOpacity: isSelected ? 0.12 : 0.04,
                        shadowRadius: isSelected ? 8 : 4,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: isSelected ? 4 : 1,
                      }]}
                    >
                      <View style={[s.optionRadio, {
                        borderColor: isSelected ? PRIMARY : "#cbd5e1",
                        backgroundColor: isSelected ? PRIMARY : "transparent",
                      }]}>
                        {isSelected && <Feather name="check" size={12} color="#fff" />}
                      </View>
                      <Text style={[s.optionText, { color: isSelected ? PRIMARY_DARK : TEXT_DARK, fontWeight: isSelected ? "600" : "400" }]}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          }

          // Text answer
          return (
            <TextInput
              style={[s.textInput, { marginBottom: 12 }]}
              value={answers[currentQ.id] || ""}
              onChangeText={v => !inputsDisabled && setAnswers(prev => ({ ...prev, [currentQ.id]: v }))}
              placeholder={inputsDisabled ? "Время вышло" : "Ваш ответ..."}
              placeholderTextColor={TEXT_MUTED}
              editable={!inputsDisabled}
              multiline
              numberOfLines={3}
              {...(Platform.OS === "web" ? { outlineWidth: 0 } as any : {})}
            />
          );
        })()}

        {/* ── Free-form answer ── */}
        {isFreeForm && !isTeacherRole && (
          <View style={{ marginBottom: 12 }}>
            <TextInput
              style={[s.textInput, { minHeight: 120, textAlignVertical: "top", marginBottom: 10 }]}
              value={freeFormText}
              onChangeText={setFreeFormText}
              placeholder="Напишите ответ..."
              placeholderTextColor={TEXT_MUTED}
              multiline
              editable={!inputsDisabled}
              {...(Platform.OS === "web" ? { outlineWidth: 0 } as any : {})}
            />
            {freeFormAttachment ? (
              <View style={{ marginBottom: 10 }}>
                <TouchableOpacity onPress={() => setZoomImg(freeFormAttachment)} activeOpacity={0.9} style={{ borderRadius: 12, overflow: "hidden" }}>
                  <Image source={{ uri: freeFormAttachment }} style={{ width: "100%", height: 180, borderRadius: 12 }} resizeMode="cover" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setFreeFormAttachment(null)} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <Feather name="x-circle" size={14} color={DANGER} />
                  <Text style={{ fontSize: 13, color: DANGER, fontWeight: "600" }}>Убрать фото</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[s.chipBtn, { alignSelf: "flex-start", paddingVertical: 10, paddingHorizontal: 14 }]}
                onPress={handleAttachPhoto}
                disabled={freeFormUploading || inputsDisabled}
              >
                {freeFormUploading
                  ? <ActivityIndicator color={SLATE} size="small" />
                  : <><Feather name="camera" size={14} color={SLATE} /><Text style={s.chipBtnText}>Прикрепить фото</Text></>
                }
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Next / Submit button ── */}
        {!inputsDisabled && (
          <TouchableOpacity
            style={[s.nextBtn, { opacity: (!isFreeForm && !currentAnswered) ? 0.45 : 1 }]}
            onPress={goNext}
            disabled={submitting || (!isFreeForm && !currentAnswered)}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.nextBtnText}>
                  {isFreeForm
                    ? "Отправить ответ"
                    : isLastStep
                    ? "Завершить и отправить"
                    : "Следующий вопрос →"}
                </Text>
            }
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* ── Progress bubble ── */}
      <View style={[s.progressOuter, { bottom: insets.bottom + (Platform.OS === "web" ? 16 : 12) }]}>
        <View style={s.progressBubble}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 15 }}>📚</Text>
              {/* Solid colour — the background-clip gradient hack ghosted on iOS Safari */}
              <Text
                style={[s.progressLabel, Platform.OS === "web" && { color: "#6d28d9" }]}
                numberOfLines={1}
              >
                {assignment.title}
              </Text>
            </View>
            <Text style={s.progressPct}>{Math.round(progressPct)}%</Text>
          </View>
          <View style={s.progressTrack}>
            {/* Плавно анимируемая заливка — растёт после ответа на вопрос */}
            <Animated.View
              style={[s.progressFill, {
                width: progressAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: ["0%", "100%"],
                }),
              }]}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingBottom: 12,
  },
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 4,
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: TEXT_DARK, flex: 1 },
  stepCounter: { fontSize: 14, fontWeight: "600", color: TEXT_MID },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.07)",
    justifyContent: "center", alignItems: "center",
  },
  floatingCloseBtn: {
    position: "absolute", left: 16, zIndex: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#fff",
    justifyContent: "center", alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  typeLabel: {
    fontSize: 11, fontWeight: "700", color: PRIMARY, letterSpacing: 1.5,
    textTransform: "uppercase", paddingHorizontal: 16, marginBottom: 10, marginTop: 2,
  },
  timerBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4,
  },
  timerText: { fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] as any },
  card: {
    backgroundColor: CARD_BG, borderRadius: 16, padding: 14, marginBottom: 0,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 2,
  },
  assignTitle: { fontSize: 18, fontWeight: "800", color: TEXT_DARK, marginBottom: 6 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: TEXT_DARK, marginBottom: 4 },
  bodyText: { fontSize: 14, color: TEXT_MID, lineHeight: 21 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  badgeText: { fontSize: 12, fontWeight: "600" },
  mediaBtn: {
    borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  chipBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#f1f5f9", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  chipBtnText: { fontSize: 13, color: SLATE, fontWeight: "600" },
  questionText: { fontSize: 15, fontWeight: "700", color: TEXT_DARK, lineHeight: 22 },
  optionBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 2,
    backgroundColor: CARD_BG,
  },
  optionRadio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    justifyContent: "center", alignItems: "center",
  },
  optionText: { fontSize: 14, flex: 1, lineHeight: 20 },
  textInput: {
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: TEXT_DARK,
    backgroundColor: CARD_BG,
  },
  nextBtn: {
    backgroundColor: PRIMARY, borderRadius: 14,
    paddingVertical: 16, alignItems: "center",
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  nextBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  progressOuter: {
    position: "absolute",
    left: 16, right: 16,
  },
  progressBubble: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 12,
    shadowColor: "#7c3aed",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  progressLabel: { fontSize: 12, fontWeight: "600", color: TEXT_MID, maxWidth: 200 },
  progressPct: { fontSize: 12, fontWeight: "700", color: PRIMARY },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: "#ede9fe", overflow: "hidden" },
  progressFill: {
    height: "100%", borderRadius: 4,
    backgroundColor: ORANGE,
  },
});
