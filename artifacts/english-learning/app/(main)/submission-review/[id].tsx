import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import authStorage from "@/utils/authStorage";
import { ImageZoomModal } from "@/components/ImageZoomModal";
import { MediaViewerModal, type MediaKind } from "@/components/MediaViewerModal";
import { InlineMediaPlayer } from "@/components/InlineMediaPlayer";

const AUDIO_PRIMARY = "#7c3aed";
const AUDIO_BG      = "#cbb8ef";
const WAVE_START    = "#6d28d9";
const WAVE_END      = "#c4b5fd";
const WAVE_IDLE     = "#e2e8f0";
const TEXT_MUTED    = "#94a3b8";
const SLATE         = "#475569";

function lerpColor(c1: string, c2: string, t: number): string {
  const h = (s: string) => parseInt(s.slice(1), 16);
  const r1 = (h(c1) >> 16) & 0xff, g1 = (h(c1) >> 8) & 0xff, b1 = h(c1) & 0xff;
  const r2 = (h(c2) >> 16) & 0xff, g2 = (h(c2) >> 8) & 0xff, b2 = h(c2) & 0xff;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function formatAudioTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const BASE = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token ?? ""}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Ошибка сервера");
  return data;
}

const TYPE_LABELS: Record<string, string> = {
  text_test: "Тест", audio: "Аудирование", reading: "Чтение", video: "Видео", free_form: "Свободный ответ",
};
const TYPE_COLORS: Record<string, string> = {
  text_test: "#8b5cf6", audio: "#6366f1", reading: "#6366f1", video: "#ec4899", free_form: "#ec4899",
};

type Answer = {
  id: number;
  questionId: number;
  studentAnswer: string;
  isCorrect: boolean;
  correctAnswer: string;
  questionText: string;
};

type ReviewData = {
  id: number;
  score: number;
  correctCount: number;
  totalQuestions: number;
  pointsEarned: number;
  submittedAt: string;
  textAnswer: string | null;
  attachmentUrl: string | null;
  status: string | null;
  teacherFeedback: string | null;
  assignment: { id: number; title: string; type: string; points: number; mediaUrl: string | null; imageUrl: string | null } | null;
  answers: Answer[];
};

export default function SubmissionReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const submissionId = parseInt(id || "0", 10);
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [zoomImg, setZoomImg] = useState<string | null>(null);
  const [mediaModal, setMediaModal] = useState<{ url: string; kind: MediaKind } | null>(null);

  // Audio player state (mirrors assignment/[id].tsx)
  const audioRef = useRef<any>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioSpeed, setAudioSpeed] = useState<1 | 0.5>(1);

  const toggleAudio = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = audioSpeed;
    if (audioPlaying) { el.pause(); setAudioPlaying(false); }
    else { el.play().catch(() => {}); setAudioPlaying(true); }
  }, [audioPlaying, audioSpeed]);

  const replayAudio = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    el.playbackRate = audioSpeed;
    el.play().catch(() => {});
    setAudioPlaying(true);
  }, [audioSpeed]);

  const toggleAudioSpeed = useCallback(() => {
    const next: 1 | 0.5 = audioSpeed === 1 ? 0.5 : 1;
    setAudioSpeed(next);
    const el = audioRef.current;
    if (el) el.playbackRate = next;
  }, [audioSpeed]);

  useEffect(() => {
    apiFetch(`/api/submissions/${submissionId}/review`)
      .then(setData)
      .catch((e: Error) => setError(
        e.message === "Forbidden"
          ? "Нет доступа. Возможно, ваша сессия устарела — выйдите и войдите снова."
          : e.message
      ))
      .finally(() => setLoading(false));
  }, [submissionId]);

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 12,
      flexDirection: "row", alignItems: "center", gap: 12,
    },
    headerTitle: { fontSize: 18, fontWeight: "800", color: colors.foreground, flex: 1 },
    scroll: { paddingHorizontal: 20, paddingBottom: insets.bottom + 40 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
    summaryCard: {
      backgroundColor: colors.card, borderRadius: 20, padding: 20,
      borderWidth: 1, borderColor: colors.border, marginBottom: 20,
    },
    scoreRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
    bigScore: { fontSize: 48, fontWeight: "900" },
    statsRow: { flexDirection: "row", gap: 12 },
    stat: { flex: 1, alignItems: "center", backgroundColor: colors.muted, borderRadius: 12, padding: 10, gap: 2 },
    statVal: { fontSize: 18, fontWeight: "800", color: colors.foreground },
    statLabel: { fontSize: 11, color: colors.mutedForeground },
    sectionTitle: {
      fontSize: 12, fontWeight: "700", color: colors.mutedForeground,
      textTransform: "uppercase", letterSpacing: 0.6,
      marginBottom: 10,
    },
    answerCard: {
      borderRadius: 14, padding: 14, marginBottom: 10,
      borderWidth: 1.5,
    },
    questionNum: { fontSize: 11, fontWeight: "700", marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 },
    questionText: { fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 8, lineHeight: 20 },
    answerRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    answerLabel: { fontSize: 12, fontWeight: "600" },
    answerText: { fontSize: 13, flex: 1 },
  });

  if (loading) return (
    <View style={[s.container, s.center]}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );

  if (error || !data) return (
    <View style={[s.container, s.center]}>
      <Text style={{ fontSize: 40 }}>😕</Text>
      <Text style={{ color: colors.mutedForeground }}>{error || "Не удалось загрузить"}</Text>
    </View>
  );

  const scoreColor = data.score >= 70 ? "#6366f1" : data.score >= 40 ? "#ec4899" : "#e11d48";
  const color = TYPE_COLORS[data.assignment?.type ?? ""] ?? colors.primary;
  const wrong = data.answers.filter(a => !a.isCorrect);
  const correct = data.answers.filter(a => a.isCorrect);

  return (
    <View style={s.container}>
      <ImageZoomModal uri={zoomImg} onClose={() => setZoomImg(null)} />
      <MediaViewerModal url={mediaModal?.url ?? null} kind={mediaModal?.kind ?? "other"} onClose={() => setMediaModal(null)} />
      <View style={s.header}>
        <TouchableOpacity
          style={{ width: 36, height: 36, justifyContent: "center", alignItems: "center" }}
          onPress={() => router.back()}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={2}>
          {data.assignment?.title ?? "Задание"}
        </Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Assignment media */}
        {data.assignment?.imageUrl ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setZoomImg(data.assignment!.imageUrl!)}
            style={{ borderRadius: 14, overflow: "hidden", marginBottom: 16, borderWidth: 1, borderColor: color + "40" }}
          >
            <Image
              source={{ uri: data.assignment.imageUrl }}
              style={{ width: "100%", height: 200, backgroundColor: "#000" }}
              resizeMode="contain"
            />
            <View style={{
              position: "absolute", bottom: 8, right: 8,
              backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8,
              paddingHorizontal: 8, paddingVertical: 4,
              flexDirection: "row", alignItems: "center", gap: 4,
            }}>
              <Feather name="zoom-in" size={12} color="#fff" />
            </View>
          </TouchableOpacity>
        ) : null}

        {data.assignment?.mediaUrl ? (() => {
          const mUrl = data.assignment!.mediaUrl!;
          const aType = data.assignment!.type;

          // Assignment type takes priority over URL format.
          // An "audio" assignment must NEVER show a video player
          // even if the teacher uploaded a .mp4 file as the audio source.
          const isAudioUrl = (u: string) =>
            u.includes("kind=audio") || /\.(mp3|m4a|wav|ogg|aac)(\?|$)/i.test(u) || u.includes("/upload/audio");
          const isVideoUrl = (u: string) =>
            u.includes("kind=video") || u.includes("youtube") || u.includes("youtu.be") ||
            /\.(mp4|mov|webm|avi)(\?|$)/i.test(u) || u.includes("/upload/video") || u.includes("/api/storage/objects/");

          const isAudio = (aType === "audio" || (aType !== "video" && aType !== "text_test" && isAudioUrl(mUrl)));
          const isVideo = !isAudio && (aType === "video" || aType === "text_test" || isVideoUrl(mUrl));

          const openInModal = (kind: MediaKind) => setMediaModal({ url: mUrl, kind });

          // ── Audio assignment: full waveform player (same design as quiz screen) ──
          if (isAudio) {
            return (
              <View style={{ backgroundColor: AUDIO_BG, borderRadius: 16, padding: 14, marginBottom: 16, gap: 8 }}>
                {/* Hidden web audio element */}
                {Platform.OS === "web" && (
                  // @ts-ignore
                  <audio
                    ref={audioRef}
                    src={mUrl}
                    style={{ display: "none" }}
                    onEnded={() => setAudioPlaying(false)}
                    onLoadedMetadata={(e: any) => setAudioDuration(e.target.duration)}
                    onTimeUpdate={(e: any) => setAudioCurrentTime(e.target.currentTime)}
                  />
                )}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  {/* Play/Pause button */}
                  <TouchableOpacity
                    style={{ borderRadius: 24, overflow: "hidden" }}
                    onPress={Platform.OS === "web" ? toggleAudio : () => openInModal("audio")}
                  >
                    <LinearGradient
                      colors={[AUDIO_PRIMARY, "#a78bfa"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center" }}
                    >
                      <Feather name={audioPlaying ? "pause" : "play"} size={20} color="#fff" />
                    </LinearGradient>
                  </TouchableOpacity>
                  {/* Waveform bars */}
                  <View style={{ flex: 1 }}>
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
                              backgroundColor: played ? lerpColor(WAVE_START, WAVE_END, i / 30) : WAVE_IDLE,
                            }}
                          />
                        );
                      })}
                    </View>
                  </View>
                  {/* Duration */}
                  <Text style={{ fontSize: 12, color: AUDIO_PRIMARY, fontWeight: "800", minWidth: 36 }}>
                    {audioDuration ? formatAudioTime(audioDuration) : "—:——"}
                  </Text>
                </View>
                {/* Controls row */}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <TouchableOpacity
                    onPress={Platform.OS === "web" ? replayAudio : () => openInModal("audio")}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "rgba(255,255,255,0.45)", borderRadius: 10 }}
                  >
                    <Feather name="refresh-cw" size={12} color={SLATE} />
                    <Text style={{ fontSize: 13, color: SLATE, fontWeight: "600" }}>Слушать снова</Text>
                  </TouchableOpacity>
                  {Platform.OS === "web" && (
                    <TouchableOpacity
                      onPress={toggleAudioSpeed}
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: audioSpeed === 0.5 ? AUDIO_PRIMARY + "20" : "rgba(255,255,255,0.45)", borderWidth: audioSpeed === 0.5 ? 1.5 : 0, borderColor: AUDIO_PRIMARY }}
                    >
                      <Feather name="zap" size={12} color={audioSpeed === 0.5 ? AUDIO_PRIMARY : SLATE} />
                      <Text style={{ fontSize: 13, fontWeight: "600", color: audioSpeed === 0.5 ? AUDIO_PRIMARY : SLATE }}>
                        {audioSpeed === 1 ? "1x" : "0.5x"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }

          // ── Video assignment ──
          if (isVideo) {
            return (
              <View style={{ backgroundColor: "#fce7f3", borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#ec489940", gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name="video" size={16} color="#ec4899" />
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#9d174d" }}>Видео к заданию</Text>
                </View>
                <InlineMediaPlayer url={mUrl} kind="video" height={200} />
              </View>
            );
          }

          // ── Other attachment ──
          return (
            <View style={{ marginBottom: 16 }}>
              <InlineMediaPlayer url={mUrl} kind="other" height={200} />
            </View>
          );
        })() : null}

        {/* Summary card */}
        <View style={s.summaryCard}>
          <View style={s.scoreRow}>
            <View>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 4 }}>
                {TYPE_LABELS[data.assignment?.type ?? ""] ?? "Задание"}
              </Text>
              <Text style={[s.bigScore, { color: scoreColor }]}>{data.score}%</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <View style={{ backgroundColor: "#fce7f3", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: "#9d174d" }}>+{data.pointsEarned} ⭐</Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                {new Date(data.submittedAt).toLocaleDateString("ru-RU")}
              </Text>
            </View>
          </View>

          <View style={s.statsRow}>
            <View style={s.stat}>
              <Text style={[s.statVal, { color: "#6366f1" }]}>{data.correctCount}</Text>
              <Text style={s.statLabel}>Правильно</Text>
            </View>
            <View style={s.stat}>
              <Text style={[s.statVal, { color: "#e11d48" }]}>{data.totalQuestions - data.correctCount}</Text>
              <Text style={s.statLabel}>Ошибок</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statVal}>{data.totalQuestions}</Text>
              <Text style={s.statLabel}>Всего</Text>
            </View>
          </View>
        </View>

        {/* Free-form student answer block */}
        {data.assignment?.type === "free_form" && (
          <View style={{ marginBottom: 20 }}>
            <Text style={s.sectionTitle}>Ответ ученика</Text>
            {data.status === "pending" ? (
              <View style={{ backgroundColor: "#fdf4ff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#ec489940", gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <Feather name="clock" size={16} color="#ec4899" />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#9d174d" }}>Ожидает оценки учителя</Text>
                </View>
                {!!data.textAnswer && (
                  <View style={{ backgroundColor: "#fff", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#ec489920" }}>
                    <Text style={{ fontSize: 14, color: "#1f2937", lineHeight: 20 }}>{data.textAnswer}</Text>
                  </View>
                )}
                {!!data.attachmentUrl && (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setZoomImg(data.attachmentUrl!)}
                    style={{ borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#ec489940" }}
                  >
                    <Image source={{ uri: data.attachmentUrl }} style={{ width: "100%", height: 200 }} resizeMode="cover" />
                    <View style={{ position: "absolute", bottom: 8, right: 8, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Feather name="zoom-in" size={12} color="#fff" />
                    </View>
                  </TouchableOpacity>
                )}
                {!data.textAnswer && !data.attachmentUrl && (
                  <Text style={{ fontSize: 13, color: "#9d174d" }}>Ученик не приложил текст или фото</Text>
                )}
              </View>
            ) : (
              <View style={{ backgroundColor: "#eef2ff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#a5b4fc", gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <Feather name="check-circle" size={16} color="#6366f1" />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#3730a3" }}>Проверено учителем</Text>
                </View>
                {!!data.textAnswer && (
                  <View style={{ backgroundColor: "#fff", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#a5b4fc" }}>
                    <Text style={{ fontSize: 14, color: "#1f2937", lineHeight: 20 }}>{data.textAnswer}</Text>
                  </View>
                )}
                {!!data.attachmentUrl && (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setZoomImg(data.attachmentUrl!)}
                    style={{ borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#a5b4fc" }}
                  >
                    <Image source={{ uri: data.attachmentUrl }} style={{ width: "100%", height: 200 }} resizeMode="cover" />
                    <View style={{ position: "absolute", bottom: 8, right: 8, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Feather name="zoom-in" size={12} color="#fff" />
                    </View>
                  </TouchableOpacity>
                )}
                {!!data.teacherFeedback && (
                  <View style={{ backgroundColor: "#eef2ff", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#a5b4fc" }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#3730a3", marginBottom: 3 }}>Комментарий учителя</Text>
                    <Text style={{ fontSize: 13, color: "#312e81", lineHeight: 19 }}>{data.teacherFeedback}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Mistakes first */}
        {wrong.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Ошибки · {wrong.length}</Text>
            {wrong.map((a, i) => (
              <View key={a.id} style={[s.answerCard, {
                backgroundColor: "#fff1f2", borderColor: "#fda4af",
              }]}>
                <Text style={[s.questionNum, { color: "#e11d48" }]}>Вопрос {data.answers.indexOf(a) + 1}</Text>
                <Text style={s.questionText}>{a.questionText}</Text>
                <View style={s.answerRow}>
                  <Feather name="x-circle" size={15} color="#e11d48" style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.answerLabel, { color: "#e11d48" }]}>Ваш ответ</Text>
                    <Text style={[s.answerText, { color: "#e11d48" }]}>{a.studentAnswer}</Text>
                  </View>
                </View>
                <View style={[s.answerRow, { marginTop: 8 }]}>
                  <Feather name="check-circle" size={15} color="#6366f1" style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.answerLabel, { color: "#6366f1" }]}>Правильный ответ</Text>
                    <Text style={[s.answerText, { color: "#6366f1" }]}>{a.correctAnswer}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Correct answers */}
        {correct.length > 0 && (
          <>
            <Text style={[s.sectionTitle, { marginTop: wrong.length > 0 ? 16 : 0 }]}>
              Правильные · {correct.length}
            </Text>
            {correct.map((a) => (
              <View key={a.id} style={[s.answerCard, {
                backgroundColor: "#eef2ff", borderColor: "#a5b4fc",
              }]}>
                <Text style={[s.questionNum, { color: "#6366f1" }]}>Вопрос {data.answers.indexOf(a) + 1}</Text>
                <Text style={s.questionText}>{a.questionText}</Text>
                <View style={s.answerRow}>
                  <Feather name="check-circle" size={15} color="#6366f1" style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.answerLabel, { color: "#6366f1" }]}>Ответ</Text>
                    <Text style={[s.answerText, { color: "#6366f1" }]}>{a.studentAnswer}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {data.answers.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
            <Feather name="info" size={36} color={colors.mutedForeground} />
            <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: "center" }}>
              Подробные ответы недоступны для этого задания
            </Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
}
