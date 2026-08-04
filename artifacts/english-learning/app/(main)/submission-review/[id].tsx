// Разбор сданной работы: медиа задания, итоговый балл, ответ ученика по
// свободной форме и разбор по вопросам (сначала ошибки, потом верные).
//
// Эмодзи в интерфейсе не используются: значки — глифы из своего набора.
// Цвета берутся из палитры, поэтому экран не выпадает из общей гаммы.
import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
  ActivityIndicator, Platform, Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import authStorage from "@/utils/authStorage";
import { ImageZoomModal } from "@/components/ImageZoomModal";
import { MediaViewerModal, type MediaKind } from "@/components/MediaViewerModal";
import { InlineMediaPlayer } from "@/components/InlineMediaPlayer";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { Pill, SectionLabel } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";

// Палитра аудиоплеера — из фирменной гаммы, не из зашитых значений.
const AUDIO_PRIMARY = accents.violetDeep;
const AUDIO_BG      = "#e9defc";
const WAVE_START    = accents.violetDeep;
const WAVE_END      = "#c4b5fd";
const WAVE_IDLE     = "rgba(160,140,220,0.35)";

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

/** Оценка словами: процент сам по себе ничего не говорит ребёнку. */
function scoreVerdict(score: number): string {
  if (score >= 85) return "отлично";
  if (score >= 70) return "хорошо";
  if (score >= 50) return "нужна практика";
  return "стоит повторить";
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
// Цвета и значки типов — те же, что на «Заданиях», «Анализе» и в «Истории».
const TYPE_COLORS: Record<string, string> = {
  text_test: "#8b5cf6", audio: "#6366f1", reading: "#d946ef", video: "#ec4899", free_form: "#f59e0b",
};
const TYPE_ICONS: Record<string, GlyphName> = {
  text_test: "pen", audio: "sound", reading: "book", video: "video", free_form: "note",
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
    headerTitle: { fontSize: 19, fontWeight: "900", letterSpacing: -0.3, color: colors.foreground, flex: 1 },
    scroll: { paddingHorizontal: 20, paddingBottom: insets.bottom + 40 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 14, paddingHorizontal: 32 },
    summaryCard: {
      backgroundColor: colors.card, borderRadius: radii.lg - 4, padding: 20,
      borderWidth: 1, borderColor: colors.border, marginBottom: 20,
      shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 18, elevation: 5,
    },
    scoreRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
    bigScore: { fontSize: 48, fontWeight: "900", letterSpacing: -2, fontVariant: ["tabular-nums"] },
    statsRow: { flexDirection: "row", gap: 12 },
    stat: { flex: 1, alignItems: "center", backgroundColor: colors.muted, borderRadius: radii.sm, padding: 11, gap: 2 },
    statVal: { fontSize: 19, fontWeight: "900", color: colors.foreground, fontVariant: ["tabular-nums"] },
    statLabel: { fontSize: 11, color: colors.mutedForeground, fontWeight: "600" },
    answerCard: {
      borderRadius: radii.sm + 2, padding: 14, marginBottom: 10,
      borderWidth: 1.5,
    },
    questionNum: { fontSize: 11, fontWeight: "800", marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.8 },
    questionText: { fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8, lineHeight: 20 },
    answerRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    answerLabel: { fontSize: 12, fontWeight: "700" },
    answerText: { fontSize: 13, flex: 1 },
    // Плашка «увеличить» поверх картинки.
    zoomHint: {
      position: "absolute", bottom: 8, right: 8,
      backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 5,
      flexDirection: "row", alignItems: "center", gap: 4,
    },
  });

  if (loading) return (
    <View style={[s.container, s.center]}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );

  if (error || !data) return (
    <View style={[s.container, s.center]}>
      <View style={{
        width: 72, height: 72, borderRadius: radii.lg,
        backgroundColor: colors.destructive + "14",
        borderWidth: 1, borderColor: colors.destructive + "33",
        alignItems: "center", justifyContent: "center",
        transform: [{ rotate: "-4deg" }],
      }}>
        <Glyph name="alert" size={34} color={colors.destructive} />
      </View>
      <Text style={{ color: colors.mutedForeground, textAlign: "center", fontSize: 14, lineHeight: 20 }}>
        {error || "Не удалось загрузить"}
      </Text>
    </View>
  );

  // Цвет балла в фирменной гамме: зелёного в палитре нет намеренно.
  const scoreColor = data.score >= 70 ? colors.success : data.score >= 50 ? accents.amber : colors.destructive;
  const type = data.assignment?.type ?? "";
  const color = TYPE_COLORS[type] ?? colors.primary;
  const wrong = data.answers.filter(a => !a.isCorrect);
  const correct = data.answers.filter(a => a.isCorrect);

  return (
    <View style={s.container}>
      <ImageZoomModal uri={zoomImg} onClose={() => setZoomImg(null)} />
      <MediaViewerModal url={mediaModal?.url ?? null} kind={mediaModal?.kind ?? "other"} onClose={() => setMediaModal(null)} />
      <View style={s.header}>
        {/* Стрелка «назад» — тот же chevron, развёрнутый на 180°. */}
        <Pressable
          style={{ width: 36, height: 36, justifyContent: "center", alignItems: "center" }}
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityLabel="Назад"
        >
          <View style={{ transform: [{ rotate: "180deg" }] }}>
            <Glyph name="chevron" size={22} color={colors.foreground} />
          </View>
        </Pressable>
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
            style={{ borderRadius: radii.sm + 2, overflow: "hidden", marginBottom: 16, borderWidth: 1, borderColor: color + "40" }}
          >
            <Image
              source={{ uri: data.assignment.imageUrl }}
              style={{ width: "100%", height: 200, backgroundColor: "#000" }}
              resizeMode="contain"
            />
            <View style={s.zoomHint}>
              <Glyph name="search" size={12} color="#fff" />
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
              <View style={{ backgroundColor: AUDIO_BG, borderRadius: radii.md, padding: 14, marginBottom: 16, gap: 8 }}>
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
                    activeOpacity={0.85}
                    onPress={Platform.OS === "web" ? toggleAudio : () => openInModal("audio")}
                    accessibilityLabel={audioPlaying ? "Пауза" : "Слушать"}
                  >
                    <LinearGradient
                      colors={[AUDIO_PRIMARY, "#a78bfa"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center" }}
                    >
                      {/* Пауза — две полосы, воспроизведение — треугольник. */}
                      {audioPlaying ? (
                        <View style={{ flexDirection: "row", gap: 4 }}>
                          <View style={{ width: 5, height: 18, borderRadius: 2, backgroundColor: "#fff" }} />
                          <View style={{ width: 5, height: 18, borderRadius: 2, backgroundColor: "#fff" }} />
                        </View>
                      ) : (
                        <Glyph name="play" size={20} color="#fff" />
                      )}
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
                  <Text style={{ fontSize: 12, color: AUDIO_PRIMARY, fontWeight: "800", minWidth: 38, fontVariant: ["tabular-nums"] }}>
                    {audioDuration ? formatAudioTime(audioDuration) : "—:——"}
                  </Text>
                </View>
                {/* Controls row */}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <TouchableOpacity
                    onPress={Platform.OS === "web" ? replayAudio : () => openInModal("audio")}
                    activeOpacity={0.85}
                    style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 7, paddingHorizontal: 11, backgroundColor: "rgba(255,255,255,0.5)", borderRadius: radii.sm - 2 }}
                  >
                    <Glyph name="repeat" size={12} color={AUDIO_PRIMARY} />
                    <Text style={{ fontSize: 13, color: AUDIO_PRIMARY, fontWeight: "700" }}>Слушать снова</Text>
                  </TouchableOpacity>
                  {Platform.OS === "web" && (
                    <TouchableOpacity
                      onPress={toggleAudioSpeed}
                      activeOpacity={0.85}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 5,
                        paddingVertical: 7, paddingHorizontal: 11, borderRadius: radii.sm - 2,
                        backgroundColor: audioSpeed === 0.5 ? AUDIO_PRIMARY + "22" : "rgba(255,255,255,0.5)",
                        borderWidth: audioSpeed === 0.5 ? 1.5 : 0, borderColor: AUDIO_PRIMARY,
                      }}
                    >
                      <Glyph name="spark" size={12} color={AUDIO_PRIMARY} />
                      <Text style={{ fontSize: 13, fontWeight: "800", color: AUDIO_PRIMARY, fontVariant: ["tabular-nums"] }}>
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
            const videoColor = TYPE_COLORS["video"]!;
            return (
              <View style={{
                backgroundColor: videoColor + "12", borderRadius: radii.sm + 2, padding: 14, marginBottom: 16,
                borderWidth: 1, borderColor: videoColor + "40", gap: 8,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Glyph name="video" size={16} color={videoColor} />
                  <Text style={{ fontSize: 14, fontWeight: "800", color: videoColor }}>Видео к заданию</Text>
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

        {/* Summary card. Тень в цвете балла: сильная и слабая работа
            различаются раньше, чем прочитан процент. */}
        <View style={[s.summaryCard, { shadowColor: scoreColor }]}>
          <View style={s.scoreRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <Glyph name={TYPE_ICONS[type] ?? "note"} size={14} color={color} />
                <Text style={{ fontSize: 13, fontWeight: "700", color }}>
                  {TYPE_LABELS[type] ?? "Задание"}
                </Text>
              </View>
              <Text style={[s.bigScore, { color: scoreColor }]}>{data.score}%</Text>
              {/* Процент сам по себе ничего не говорит — подписываем словами. */}
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.mutedForeground, marginTop: 2 }}>
                {scoreVerdict(data.score)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 7 }}>
              <Pill text={`+${data.pointsEarned}`} icon="star" tone="soft" color={accents.magenta} />
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>
                {new Date(data.submittedAt).toLocaleDateString("ru-RU")}
              </Text>
            </View>
          </View>

          <View style={s.statsRow}>
            <View style={s.stat}>
              <Text style={[s.statVal, { color: colors.success }]}>{data.correctCount}</Text>
              <Text style={s.statLabel}>Правильно</Text>
            </View>
            <View style={s.stat}>
              <Text style={[s.statVal, { color: colors.destructive }]}>{data.totalQuestions - data.correctCount}</Text>
              <Text style={s.statLabel}>Ошибок</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statVal}>{data.totalQuestions}</Text>
              <Text style={s.statLabel}>Всего</Text>
            </View>
          </View>
        </View>

        {/* Free-form student answer block */}
        {type === "free_form" && (
          <View style={{ marginBottom: 20 }}>
            <SectionLabel>Ответ ученика</SectionLabel>
            {data.status === "pending" ? (
              <View style={{
                backgroundColor: colors.warning + "10", borderRadius: radii.sm + 2, padding: 14,
                borderWidth: 1, borderColor: colors.warning + "40", gap: 8,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <Glyph name="clock" size={16} color={colors.warning} />
                  <Text style={{ fontSize: 13, fontWeight: "800", color: colors.warning }}>Ожидает оценки учителя</Text>
                </View>
                {!!data.textAnswer && (
                  <View style={{ backgroundColor: colors.card, borderRadius: radii.sm - 2, padding: 12, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 20 }}>{data.textAnswer}</Text>
                  </View>
                )}
                {!!data.attachmentUrl && (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setZoomImg(data.attachmentUrl!)}
                    style={{ borderRadius: radii.sm, overflow: "hidden", borderWidth: 1, borderColor: colors.warning + "40" }}
                  >
                    <Image source={{ uri: data.attachmentUrl }} style={{ width: "100%", height: 200 }} resizeMode="cover" />
                    <View style={s.zoomHint}>
                      <Glyph name="search" size={12} color="#fff" />
                    </View>
                  </TouchableOpacity>
                )}
                {!data.textAnswer && !data.attachmentUrl && (
                  <Text style={{ fontSize: 13, color: colors.mutedForeground }}>Ученик не приложил текст или фото</Text>
                )}
              </View>
            ) : (
              <View style={{
                backgroundColor: colors.success + "10", borderRadius: radii.sm + 2, padding: 14,
                borderWidth: 1, borderColor: colors.success + "40", gap: 8,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <Glyph name="check" size={16} color={colors.success} />
                  <Text style={{ fontSize: 13, fontWeight: "800", color: colors.success }}>Проверено учителем</Text>
                </View>
                {!!data.textAnswer && (
                  <View style={{ backgroundColor: colors.card, borderRadius: radii.sm - 2, padding: 12, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 20 }}>{data.textAnswer}</Text>
                  </View>
                )}
                {!!data.attachmentUrl && (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setZoomImg(data.attachmentUrl!)}
                    style={{ borderRadius: radii.sm, overflow: "hidden", borderWidth: 1, borderColor: colors.success + "40" }}
                  >
                    <Image source={{ uri: data.attachmentUrl }} style={{ width: "100%", height: 200 }} resizeMode="cover" />
                    <View style={s.zoomHint}>
                      <Glyph name="search" size={12} color="#fff" />
                    </View>
                  </TouchableOpacity>
                )}
                {!!data.teacherFeedback && (
                  <View style={{
                    backgroundColor: colors.primary + "10", borderRadius: radii.sm - 2, padding: 12,
                    borderWidth: 1, borderColor: colors.primary + "33",
                  }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Glyph name="chat" size={13} color={colors.primary} />
                      <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.8 }}>
                        Комментарий учителя
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 19 }}>{data.teacherFeedback}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Ошибки идут первыми: разбирать нужно именно их. */}
        {wrong.length > 0 && (
          <>
            <SectionLabel>Ошибки · {wrong.length}</SectionLabel>
            {wrong.map((a) => (
              <View key={a.id} style={[s.answerCard, {
                backgroundColor: colors.destructive + "0e", borderColor: colors.destructive + "44",
              }]}>
                <Text style={[s.questionNum, { color: colors.destructive }]}>Вопрос {data.answers.indexOf(a) + 1}</Text>
                <Text style={s.questionText}>{a.questionText}</Text>
                <View style={s.answerRow}>
                  <View style={{ marginTop: 1 }}>
                    <Glyph name="close" size={15} color={colors.destructive} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.answerLabel, { color: colors.destructive }]}>Ваш ответ</Text>
                    <Text style={[s.answerText, { color: colors.destructive }]}>{a.studentAnswer}</Text>
                  </View>
                </View>
                <View style={[s.answerRow, { marginTop: 8 }]}>
                  <View style={{ marginTop: 1 }}>
                    <Glyph name="check" size={15} color={colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.answerLabel, { color: colors.success }]}>Правильный ответ</Text>
                    <Text style={[s.answerText, { color: colors.success }]}>{a.correctAnswer}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Correct answers */}
        {correct.length > 0 && (
          <View style={{ marginTop: wrong.length > 0 ? 16 : 0 }}>
            <SectionLabel>Правильные · {correct.length}</SectionLabel>
            {correct.map((a) => (
              <View key={a.id} style={[s.answerCard, {
                backgroundColor: colors.success + "0e", borderColor: colors.success + "40",
              }]}>
                <Text style={[s.questionNum, { color: colors.success }]}>Вопрос {data.answers.indexOf(a) + 1}</Text>
                <Text style={s.questionText}>{a.questionText}</Text>
                <View style={s.answerRow}>
                  <View style={{ marginTop: 1 }}>
                    <Glyph name="check" size={15} color={colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.answerLabel, { color: colors.success }]}>Ответ</Text>
                    <Text style={[s.answerText, { color: colors.success }]}>{a.studentAnswer}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {data.answers.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 12 }}>
            <View style={{
              width: 64, height: 64, borderRadius: radii.md + 4,
              backgroundColor: colors.primary + "12",
              borderWidth: 1, borderColor: colors.primary + "28",
              alignItems: "center", justifyContent: "center",
              transform: [{ rotate: "-4deg" }],
            }}>
              <Glyph name="tray" size={30} color={colors.primary} />
            </View>
            <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: "center" }}>
              Подробные ответы недоступны для этого задания
            </Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
}
