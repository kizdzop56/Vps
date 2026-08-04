// ─────────────────────────────────────────────────────────────────────────────
// Экран прохождения задания.
//
// Один экран обслуживает все пять типов (тест, аудирование, чтение, видео,
// свободный ответ), три роли (ученик, учитель, результат) и таймер с
// автосдачей. Логика загрузки, отправки, таймера и загрузки фото не менялась —
// переписан только разбор.
//
// Что было не так:
//  • Сверху висела одинокая цифра «1» — номер вопроса без подписи, а сам тип
//    задания шёл капслоком отдельной строкой. Все пять типов выглядели
//    одинаково, отличаясь только этой надписью.
//  • Снизу плавал пузырь с процентом. Он перекрывал ответы, дублировал
//    название задания и показывал «0%» — цифру, которая ученику ничего не
//    говорит: важно не сколько процентов, а сколько вопросов осталось.
//  • Вопрос лежал на глухой сиреневой плашке, текст на ней тонул.
//  • Варианты ответа были строками с радиокружком — не выглядели нажимаемыми.
//
// Что стало:
//  • Шапка в одну строку: выход, чип с иконкой типа и названием, таймер.
//    Иконка типа — та же, что на карточке в списке заданий.
//  • Лестница шагов вверху: по полоске на вопрос, видно пройденное и
//    оставшееся. Место внизу экрана освободилось.
//  • Номер вопроса стал кружком слева от текста, а не отдельной цифрой.
//  • Варианты — клавиши с буквой и физической нижней гранью, как ChunkyButton
//    в разделе «Слова».
//  • У каждого типа своя сцена: тёмный плеер с волной, кадр видео, раскрытый
//    текст для чтения, поле со счётчиком символов.
//
// Значки — из собственного набора (components/ui/Glyph.tsx), эмодзи нет.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
  ActivityIndicator, Platform, Alert, TextInput, Image, Animated, Easing,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { ImageZoomModal } from "@/components/ImageZoomModal";
import { MediaViewerModal, type MediaKind } from "@/components/MediaViewerModal";
import { InlineMediaPlayer } from "@/components/InlineMediaPlayer";
import ConfirmModal from "@/components/ConfirmModal";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import authStorage from "@/utils/authStorage";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { accents, gradients, radii, chunky } from "@/constants/theme";

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

/** Ответ API может прийти не массивом — не даём этому уронить рендер. */
function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
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
  dueAt?: string | null;
  questions: Question[];
};

/**
 * Оформление типа задания: подпись, значок и градиент значка.
 * Цвета совпадают с карточками в списке заданий и с TypeArt — тип узнаётся
 * по одному и тому же значку на всех экранах.
 */
const TYPE_META: Record<string, { label: string; icon: GlyphName; grad: readonly string[] }> = {
  text_test: { label: "Тест",             icon: "check", grad: ["#8b5cf6", accents.indigoDeep] },
  audio:     { label: "Аудирование",      icon: "sound", grad: ["#6366f1", accents.indigoDeep] },
  reading:   { label: "Чтение",           icon: "book",  grad: [accents.magenta, "#a855f7"] },
  video:     { label: "Видео",            icon: "video", grad: ["#ec4899", accents.magenta] },
  free_form: { label: "Свободный ответ",  icon: "pen",   grad: [accents.amber, accents.gold] },
};

function typeMeta(type: string) {
  return TYPE_META[type] ?? { label: type, icon: "note" as GlyphName, grad: ["#8b5cf6", accents.indigoDeep] };
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Русское склонение по числу. */
function plural(n: number, forms: [string, string, string]) {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 14) return forms[2];
  const last = abs % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

// ─── Палитра экрана ──────────────────────────────────────────────────────────
// Фон прозрачный: сквозь него светит общий градиент приложения (_layout.tsx),
// тот же, что на вкладке «Задания».
const QUIZ_BG = "transparent";
const CARD_BG = "#ffffff";
const PRIMARY = "#7c3aed";
const PRIMARY_DARK = accents.violetDeep;
const SUCCESS = "#a855f7";
const DANGER = "#e11d48";
const TEXT_DARK = "#1e1b4b";
const TEXT_MID = "#4b5563";
const TEXT_MUTED = "#8b83a8";
const BORDER = "#e6e2f2";
const EDGE = "#ddd7ec";

// ═══════════════════════════════════════════════════════════════════════════
// Мелкие детали разбора
// ═══════════════════════════════════════════════════════════════════════════

/** Круглая кнопка шапки: выход, назад. */
function RoundBtn({ icon, onPress, flip }: { icon: GlyphName; onPress: () => void; flip?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.roundBtn, pressed && { transform: [{ scale: 0.93 }] }]}
      accessibilityRole="button"
      accessibilityLabel={flip ? "Назад" : "Закрыть"}
      hitSlop={8}
    >
      <View style={flip ? { transform: [{ rotate: "180deg" }] } : undefined}>
        <Glyph name={icon} size={17} color={TEXT_MID} />
      </View>
    </Pressable>
  );
}

/**
 * Чип типа задания. Занимает середину шапки и несёт две строки: чем это
 * является (тип) и что именно решаем (название). Раньше название висело
 * в плавающем пузыре внизу экрана, а тип — капслоком в пустоте.
 */
function TypeChip({ type, title }: { type: string; title: string }) {
  const meta = typeMeta(type);
  return (
    <View style={s.typeChip}>
      <LinearGradient
        colors={meta.grad as unknown as string[]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={s.typeChipIcon}
      >
        <Glyph name={meta.icon} size={15} color="#fff" />
      </LinearGradient>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.typeChipLabel} numberOfLines={1}>{meta.label}</Text>
        <Text style={s.typeChipSub} numberOfLines={1}>{title}</Text>
      </View>
    </View>
  );
}

/**
 * Лестница шагов: по полоске на вопрос.
 *
 * Показывает не процент, а количество: «вопрос 3 из 5, осталось 3». Процент
 * абстрактен, а число оставшихся вопросов ученик может сопоставить с тем,
 * сколько он готов ещё просидеть.
 */
function StepLadder({
  total, index, answered, submitted, rightNote,
}: {
  total: number;
  index: number;
  answered: number;
  submitted?: boolean;
  /** Своя подпись справа вместо «осталось N». */
  rightNote?: string;
}) {
  const left = Math.max(0, total - index - 1);
  return (
    <View style={s.ladder}>
      <View style={s.ladderBars}>
        {Array.from({ length: total }, (_, i) => {
          const done = submitted || i < index;
          const now = !submitted && i === index;
          return (
            <View key={i} style={s.ladderBar}>
              {done && (
                <LinearGradient
                  colors={["#6366f1", "#a855f7"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              )}
              {now && (
                <LinearGradient
                  colors={["#a855f7", accents.magenta]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "45%" }}
                />
              )}
            </View>
          );
        })}
      </View>
      <View style={s.ladderMeta}>
        <Text style={s.ladderLeft}>
          {total === 1 ? "Одно задание" : `Вопрос ${Math.min(index + 1, total)} из ${total}`}
        </Text>
        <Text style={s.ladderRight}>
          {rightNote ?? (left === 0 ? "последний" : `осталось ${left}`)}
        </Text>
      </View>
    </View>
  );
}

/** Заголовок вопроса: номер кружком слева, текст справа. */
function QuestionHead({ n, text }: { n: number; text: string }) {
  return (
    <View style={s.qRow}>
      <LinearGradient
        colors={["#8b5cf6", "#6366f1"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={s.qNum}
      >
        <Text style={s.qNumText}>{n}</Text>
      </LinearGradient>
      <Text style={s.qText}>{text}</Text>
    </View>
  );
}

/**
 * Вариант ответа как физическая клавиша.
 *
 * Нижняя грань — отдельный слой под корпусом (в RN у View не бывает двух
 * теней), при нажатии корпус проседает ровно на её высоту. Буква слева вместо
 * радиокружка: она заодно даёт вариантам имена, на которые можно ссылаться.
 */
function OptionKey({
  letter, text, state, disabled, onPress,
}: {
  letter: string;
  text: string;
  state: "idle" | "selected" | "correct" | "wrong";
  disabled?: boolean;
  onPress: () => void;
}) {
  const press = useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: chunky.duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== "web",
    }).start();

  const skin = {
    idle:     { border: BORDER,  fill: CARD_BG,   edge: EDGE,          key: "#f1eefb", keyText: TEXT_MID, text: TEXT_DARK,    weight: "600" as const },
    selected: { border: "#8b5cf6", fill: "#f6f2ff", edge: PRIMARY_DARK, key: "",        keyText: "#fff",   text: PRIMARY_DARK, weight: "800" as const },
    correct:  { border: SUCCESS,   fill: "#f7f0ff", edge: PRIMARY_DARK, key: "",        keyText: "#fff",   text: PRIMARY_DARK, weight: "800" as const },
    wrong:    { border: DANGER,    fill: "#fff1f3", edge: "#9f1239",    key: "",        keyText: "#fff",   text: DANGER,       weight: "800" as const },
  }[state];

  const filledKey = state !== "idle";

  return (
    <View style={{ marginBottom: 9 }}>
      <View style={[s.optEdge, { backgroundColor: skin.edge }]} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={disabled ? undefined : onPress}
          onPressIn={() => !disabled && set(4)}
          onPressOut={() => set(0)}
          accessibilityRole="radio"
          accessibilityState={{ selected: state !== "idle", disabled: !!disabled }}
          accessibilityLabel={`Вариант ${letter}. ${text}`}
          style={[s.opt, { borderColor: skin.border, backgroundColor: skin.fill }]}
        >
          {filledKey ? (
            <LinearGradient
              colors={state === "wrong"
                ? [DANGER, "#9f1239"]
                : state === "correct"
                  ? ["#a855f7", "#8b5cf6"]
                  : ["#8b5cf6", "#6366f1"]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={s.optKey}
            >
              <Text style={[s.optKeyText, { color: "#fff" }]}>{letter}</Text>
            </LinearGradient>
          ) : (
            <View style={[s.optKey, { backgroundColor: skin.key, borderWidth: 1.5, borderColor: BORDER }]}>
              <Text style={[s.optKeyText, { color: skin.keyText }]}>{letter}</Text>
            </View>
          )}

          <Text style={[s.optText, { color: skin.text, fontWeight: skin.weight }]}>{text}</Text>

          {state === "selected" && <Glyph name="check" size={17} color={PRIMARY_DARK} />}
        </Pressable>
      </Animated.View>
      <View style={{ height: 4 }} />
    </View>
  );
}

/** Крупная кнопка внизу экрана. Тот же физический приём, что у ChunkyButton. */
function Cta({
  label, icon, onPress, disabled, busy,
}: {
  label: string;
  icon?: GlyphName;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  const press = useRef(new Animated.Value(0)).current;
  const set = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: chunky.duration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== "web",
    }).start();

  const off = disabled || busy;

  return (
    <View>
      <View style={[s.ctaEdge, { backgroundColor: off ? "#cdc7dd" : accents.indigoDeep }]} />
      <Animated.View style={{ transform: [{ translateY: press }] }}>
        <Pressable
          onPress={off ? undefined : onPress}
          onPressIn={() => !off && set(chunky.pressDepth)}
          onPressOut={() => set(0)}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: !!off }}
        >
          <LinearGradient
            colors={(off ? ["#ded9ea", "#d0cae0"] : gradients.action) as unknown as string[]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={s.cta}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={[s.ctaText, off && { color: "#8b83a8" }]}>{label}</Text>
                {icon && <Glyph name={icon} size={18} color={off ? "#8b83a8" : "#fff"} />}
              </>
            )}
          </LinearGradient>
        </Pressable>
      </Animated.View>
      <View style={{ height: chunky.edge }} />
    </View>
  );
}

/** Плитка со стандартной цветной тенью. */
function Plate({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[s.plate, style]}>{children}</View>;
}

// ═══════════════════════════════════════════════════════════════════════════

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

  // Пошаговая навигация
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  // Текст для чтения раскрыт сразу: прятать его за «нажмите, чтобы раскрыть»
  // означало заставлять ученика открывать то, без чего вопрос не решается.
  const [readingExpanded, setReadingExpanded] = useState(true);

  // Свободный ответ
  const [freeFormText, setFreeFormText] = useState("");
  const [freeFormAttachment, setFreeFormAttachment] = useState<string | null>(null);
  const [freeFormUploading, setFreeFormUploading] = useState(false);
  const [freeFormFocused, setFreeFormFocused] = useState(false);

  // Таймер
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerExpired, setTimerExpired] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSubmitRef = useRef(false);
  const answersRef = useRef<Record<number, string>>({});

  // Аудио (веб — скрытый <audio>)
  const audioRef = useRef<any>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioSpeed, setAudioSpeed] = useState(1);
  // Сколько раз прослушано целиком: ученику полезно знать, что попыток
  // сколько угодно, а учителю в будущем — сколько их понадобилось.
  const [audioPlays, setAudioPlays] = useState(0);

  const isTeacherRole = user?.role === "teacher" || user?.role === "admin";
  const isStudent = user?.role === "student";

  // Загрузка задания
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

  // Таймер
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
        const answerList = asArray<Question>(assignment.questions).map((q: Question) => ({
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

      // Веб (боевой деплой — Expo web): presigned PUT в объектное хранилище.
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
        // Без настроенного хранилища сервер отдаёт ОТНОСИТЕЛЬНУЮ ссылку на свой
        // local-put — дополняем её BASE_URL.
        const uploadTarget = uploadURL.startsWith("http")
          ? uploadURL
          : `${BASE_URL}${uploadURL}`;
        const uploadRes = await fetch(uploadTarget, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: blob,
        });
        if (!uploadRes.ok) throw new Error("Ошибка загрузки файла на сервер");
        setFreeFormAttachment(`${BASE_URL}/api/storage${objectPath}?kind=image`);
      } else {
        // Нативный фолбэк (в вебе не используется): multer multipart.
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
    const questions = asArray<Question>(assignment?.questions);
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

  // ─── Загрузка ──────────────────────────────────────────────────────────────
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
        <View style={{ paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <RoundBtn icon="chevron" flip onPress={() => router.back()} />
          <Text style={s.headerTitle}>Задание</Text>
        </View>
        <View style={s.stateBox}>
          <LinearGradient
            colors={["#8b5cf6", accents.indigoDeep]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={s.stateBadge}
          >
            <Glyph name="alert" size={28} color="#fff" />
          </LinearGradient>
          <Text style={s.stateTitle}>Не удалось открыть</Text>
          <Text style={s.stateText}>{fetchError ?? "Задание не найдено"}</Text>
          <View style={{ alignSelf: "stretch", marginTop: 6 }}>
            <Cta
              label="Попробовать снова"
              icon="repeat"
              onPress={() => {
                setIsLoading(true);
                setFetchError(null);
                apiFetch(`/api/assignments/${assignmentId}`)
                  .then(setAssignment)
                  .catch((e: Error) => setFetchError(e.message))
                  .finally(() => setIsLoading(false));
              }}
            />
          </View>
        </View>
      </View>
    );
  }

  const questions = asArray<Question>(assignment.questions);
  const mediaUrl = assignment.mediaUrl || (assignment.type !== "reading" ? assignment.content : null);
  const textContent = assignment.type === "reading" ? assignment.content : null;
  const imageUrl = assignment.imageUrl;
  const meta = typeMeta(assignment.type);

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

  const skipAudio = () => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.min((el.currentTime ?? 0) + 10, el.duration ?? 0);
  };

  const toggleAudioSpeed = () => {
    const next = audioSpeed === 1 ? 0.5 : 1;
    setAudioSpeed(next);
    const el = audioRef.current;
    if (el) el.playbackRate = next;
  };

  const formatAudioTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const ss = Math.floor(sec % 60);
    return `${m}:${ss.toString().padStart(2, "0")}`;
  };

  const hasTimer = isStudent && !!assignment.timeLimitMinutes && !submitted;
  const timerWarning = timeLeft !== null && timeLeft < 60;
  const timerDanger = timeLeft !== null && timeLeft < 30;
  const inputsDisabled = submitted || timerExpired;

  // ═════════════════ УЧИТЕЛЬ: обычная прокрутка с ответами ═════════════════
  if (isTeacherRole) {
    return (
      <View style={{ flex: 1, backgroundColor: QUIZ_BG }}>
        <ImageZoomModal uri={zoomImg} onClose={() => setZoomImg(null)} />
        <MediaViewerModal url={mediaModal?.url ?? null} kind={mediaModal?.kind ?? "other"} title={mediaModal?.title} onClose={() => setMediaModal(null)} />

        <View style={[s.topBar, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}>
          <RoundBtn icon="chevron" flip onPress={() => router.back()} />
          <TypeChip type={assignment.type} title={assignment.title} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 120, paddingTop: 14, gap: 12 }}>
          <Plate style={{ padding: 14 }}>
            <Text style={s.assignTitle}>{assignment.title}</Text>
            {!!assignment.description?.trim() && (
              <Text style={[s.bodyText, { marginBottom: 10 }]}>{assignment.description}</Text>
            )}
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <View style={[s.badge, { backgroundColor: "#ede9fe" }]}>
                <Text style={[s.badgeText, { color: PRIMARY }]}>{meta.label}</Text>
              </View>
              <View style={[s.badge, { backgroundColor: "#fce7f3" }]}>
                <Glyph name="star" size={11} color="#9d174d" />
                <Text style={[s.badgeText, { color: "#9d174d" }]}>
                  {assignment.points > 0 ? `${assignment.points} очков` : "Баллы по проверке"}
                </Text>
              </View>
              {questions.length > 0 && (
                <View style={[s.badge, { backgroundColor: "#e0e7ff" }]}>
                  <Text style={[s.badgeText, { color: accents.indigoDeep }]}>
                    {questions.length} {plural(questions.length, ["вопрос", "вопроса", "вопросов"])}
                  </Text>
                </View>
              )}
            </View>
          </Plate>

          {imageUrl && (
            <TouchableOpacity onPress={() => setZoomImg(imageUrl)} activeOpacity={0.9} style={[s.plate, { padding: 0, overflow: "hidden" }]}>
              <Image source={{ uri: imageUrl }} style={{ width: "100%", height: 200 }} resizeMode="cover" />
            </TouchableOpacity>
          )}

          {textContent && (
            <Plate style={{ padding: 14 }}>
              <Text style={s.sectionTitle}>Текст для чтения</Text>
              <Text style={s.bodyText}>{textContent}</Text>
            </Plate>
          )}
          {showAudioBlock && mediaUrl && (
            <Plate style={{ padding: 14 }}>
              <InlineMediaPlayer url={mediaUrl} kind="audio" title={assignment.title} />
            </Plate>
          )}
          {showVideoBlock && mediaUrl && (
            <Plate style={{ padding: 14 }}>
              <InlineMediaPlayer url={mediaUrl} kind="video" height={200} title={assignment.title} />
            </Plate>
          )}
          {showOtherBlock && mediaUrl && (
            <Plate style={{ padding: 14 }}>
              <InlineMediaPlayer url={mediaUrl} kind="other" height={200} title={assignment.title} />
            </Plate>
          )}

          {questions.length > 0 && (
            <View>
              <Text style={[s.lbl, { marginBottom: 10, marginTop: 4 }]}>Вопросы и верные ответы</Text>
              {questions.map((q, i) => (
                <Plate key={q.id} style={{ padding: 14, marginBottom: 10 }}>
                  <View style={s.qRow}>
                    <View style={[s.qNum, { backgroundColor: "#ede9fe" }]}>
                      <Text style={[s.qNumText, { color: PRIMARY_DARK }]}>{i + 1}</Text>
                    </View>
                    <Text style={[s.qText, { fontSize: 15 }]}>{q.text}</Text>
                  </View>
                  {Array.isArray(q.options) && q.options.length > 0 ? (
                    <View style={{ marginTop: 10, gap: 7 }}>
                      {q.options.map((opt, oi) => {
                        const right = opt === q.correctAnswer;
                        return (
                          <View
                            key={oi}
                            style={{
                              flexDirection: "row", alignItems: "center", gap: 9,
                              paddingVertical: 8, paddingHorizontal: 11, borderRadius: radii.sm,
                              backgroundColor: right ? "#f6f2ff" : "#f7f6fb",
                              borderWidth: 1.5, borderColor: right ? SUCCESS : "transparent",
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: "900", color: right ? PRIMARY_DARK : TEXT_MUTED, width: 14 }}>
                              {String.fromCharCode(65 + oi)}
                            </Text>
                            <Text style={{ flex: 1, fontSize: 13.5, color: right ? PRIMARY_DARK : TEXT_MID, fontWeight: right ? "800" : "500" }}>
                              {opt}
                            </Text>
                            {right && <Glyph name="check" size={15} color={SUCCESS} />}
                          </View>
                        );
                      })}
                    </View>
                  ) : q.correctAnswer ? (
                    <View style={{ marginTop: 10, backgroundColor: "#f6f2ff", borderRadius: radii.sm, padding: 11, borderWidth: 1.5, borderColor: SUCCESS }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: TEXT_MUTED, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>
                        Верный ответ
                      </Text>
                      <Text style={{ color: PRIMARY_DARK, fontWeight: "800", fontSize: 14 }}>{q.correctAnswer}</Text>
                    </View>
                  ) : null}
                </Plate>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ═════════════════ РЕЗУЛЬТАТ ═════════════════
  if (submitted && result) {
    const isFreeForm = assignment.type === "free_form";
    const score = result.score ?? 0;
    const passed = score >= 70;
    const ringSize = 116;
    const stroke = 11;
    const r = (ringSize - stroke) / 2;
    const circumference = 2 * Math.PI * r;
    const results = asArray<any>(result.results);

    return (
      <View style={{ flex: 1, backgroundColor: QUIZ_BG }}>
        <ImageZoomModal uri={zoomImg} onClose={() => setZoomImg(null)} />
        <MediaViewerModal url={mediaModal?.url ?? null} kind={mediaModal?.kind ?? "other"} title={mediaModal?.title} onClose={() => setMediaModal(null)} />

        <View style={[s.topBar, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16) }]}>
          <RoundBtn icon="chevron" flip onPress={() => router.back()} />
          <Text style={s.headerTitle}>Результат</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: insets.bottom + 30, gap: 12 }}>
          {/* Кольцо вместо цифры в кружке: доля читается формой, а не только
              числом, и одинаково понятна на любом балле. */}
          <LinearGradient
            colors={[accents.violetDeep, accents.indigoDeep, "#7e22ce"]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={s.resultHero}
          >
            <View style={{ width: ringSize, height: ringSize, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Svg width={ringSize} height={ringSize} style={{ position: "absolute" }}>
                <Circle
                  cx={ringSize / 2} cy={ringSize / 2} r={r}
                  stroke="rgba(255,255,255,0.22)" strokeWidth={stroke} fill="none"
                />
                <Circle
                  cx={ringSize / 2} cy={ringSize / 2} r={r}
                  stroke={isFreeForm ? accents.gold : passed ? "#e9d5ff" : "#fda4af"}
                  strokeWidth={stroke} fill="none" strokeLinecap="round"
                  strokeDasharray={`${circumference}`}
                  strokeDashoffset={circumference * (1 - (isFreeForm ? 1 : score / 100))}
                  transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                />
              </Svg>
              {isFreeForm
                ? <Glyph name="check" size={40} color="#fff" />
                : <Text style={s.ringValue}>{score}%</Text>}
            </View>

            <Text style={s.resultTitle}>
              {isFreeForm ? "Ответ отправлен" : passed ? "Отлично!" : "Можно лучше"}
            </Text>
            <Text style={s.resultSub}>
              {isFreeForm
                ? "Учитель проверит и поставит баллы"
                : `${result.correctCount} из ${result.totalQuestions} ${plural(result.totalQuestions ?? 0, ["правильный", "правильных", "правильных"])} · «${assignment.title}»`}
            </Text>

            {result.pointsEarned > 0 && (
              <LinearGradient
                colors={[accents.gold, accents.amber]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.earned}
              >
                <Glyph name="star" size={15} color="#42200a" />
                <Text style={s.earnedText}>+{result.pointsEarned} очков</Text>
              </LinearGradient>
            )}

            {timerExpired && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
                <Glyph name="clock" size={13} color="rgba(255,255,255,0.75)" />
                <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: "600" }}>
                  Сдано автоматически по истечении времени
                </Text>
              </View>
            )}
          </LinearGradient>

          {!isFreeForm && questions.length > 0 && results.length > 0 && (
            <>
              <Text style={s.lbl}>Разбор ответов</Text>
              {questions.map((q, i) => {
                const qr = results.find((x: any) => x.questionId === q.id);
                const correct = !!qr?.isCorrect;
                return (
                  <Plate key={q.id} style={{ padding: 13, flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                    <View style={[s.revMark, { backgroundColor: correct ? SUCCESS : DANGER }]}>
                      <Glyph name={correct ? "check" : "close"} size={13} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.revQ}>{i + 1}. {q.text}</Text>
                      <Text style={[s.revA, { color: correct ? PRIMARY_DARK : DANGER }]}>
                        {correct ? (answers[q.id] || "Верно") : `Вы ответили: ${answers[q.id] || "(пусто)"}`}
                      </Text>
                      {!correct && !!qr?.correctAnswer && (
                        <Text style={s.revFix}>Правильно: {qr.correctAnswer}</Text>
                      )}
                    </View>
                  </Plate>
                );
              })}
            </>
          )}

          <View style={{ marginTop: 6 }}>
            <Cta label="К списку заданий" icon="arrowRight" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </View>
    );
  }

  // ═════════════════ УЧЕНИК: пошаговое прохождение ═════════════════
  const isFreeForm = assignment.type === "free_form";
  const currentQ = isFreeForm ? null : questions[currentQuestionIndex];
  const isLastStep = isFreeForm ? true : currentQuestionIndex >= questions.length - 1;
  const currentAnswered = currentQ ? !!answers[currentQ.id]?.trim() : false;
  const answeredCount = questions.filter(q => !!answers[q.id]?.trim()).length;
  const freeFormReady = !!freeFormText.trim() || !!freeFormAttachment;

  const goNext = () => {
    if (!isLastStep) {
      setCurrentQuestionIndex(i => i + 1);
    } else {
      handleSubmitPressed();
    }
  };

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 16);

  const ctaLabel = isFreeForm
    ? (freeFormReady ? "Отправить учителю" : "Напишите ответ")
    : !currentAnswered
      ? "Выберите ответ"
      : isLastStep
        ? "Завершить и отправить"
        : "Следующий вопрос";

  const ctaIcon: GlyphName | undefined = isFreeForm
    ? (freeFormReady ? "send" : undefined)
    : !currentAnswered
      ? undefined
      : isLastStep ? "send" : "arrowRight";

  return (
    <View style={{ flex: 1, backgroundColor: QUIZ_BG }}>
      <ImageZoomModal uri={zoomImg} onClose={() => setZoomImg(null)} />
      <MediaViewerModal url={mediaModal?.url ?? null} kind={mediaModal?.kind ?? "other"} title={mediaModal?.title} onClose={() => setMediaModal(null)} />
      <ConfirmModal
        visible={showUnansweredModal}
        title="Не все вопросы отвечены"
        message={`Вы оставили без ответа ${unansweredCount} ${plural(unansweredCount, ["вопрос", "вопроса", "вопросов"])}. Отправить с пустыми полями?`}
        confirmText="Отправить всё равно"
        cancelText="Вернуться и ответить"
        onConfirm={() => { setShowUnansweredModal(false); handleSubmit(); }}
        onCancel={() => setShowUnansweredModal(false)}
      />
      <ConfirmModal
        visible={showExitModal}
        title="Выйти из задания?"
        message="Задание будет завершено и отправлено учителю с текущими ответами. Продолжить его позже нельзя."
        confirmText="Завершить"
        cancelText="Остаться"
        onConfirm={() => { setShowExitModal(false); handleSubmit(); }}
        onCancel={() => setShowExitModal(false)}
      />

      {/* ── Шапка: выход, тип задания, таймер ──
          Раньше здесь была одинокая цифра, крестик висел отдельно поверх
          экрана, а тип шёл капслоком строкой ниже. */}
      <View style={[s.topBar, { paddingTop: topPad }]}>
        <RoundBtn icon="close" onPress={() => setShowExitModal(true)} />
        <TypeChip type={assignment.type} title={assignment.title} />
        {hasTimer && timeLeft !== null && (
          <View style={[
            s.timer,
            timerDanger
              ? { backgroundColor: "rgba(225,29,72,0.13)", borderColor: "rgba(225,29,72,0.4)" }
              : timerWarning
                ? { backgroundColor: "rgba(245,158,11,0.16)", borderColor: "rgba(245,158,11,0.45)" }
                : null,
          ]}>
            <Glyph name="clock" size={13} color={timerDanger ? DANGER : timerWarning ? "#b45309" : PRIMARY_DARK} />
            <Text style={[s.timerText, { color: timerDanger ? DANGER : timerWarning ? "#b45309" : PRIMARY_DARK }]}>
              {formatTime(timeLeft)}
            </Text>
          </View>
        )}
      </View>

      {/* ── Лестница шагов ── */}
      <StepLadder
        total={isFreeForm ? 1 : Math.max(questions.length, 1)}
        index={isFreeForm ? 0 : currentQuestionIndex}
        answered={answeredCount}
        rightNote={isFreeForm ? (assignment.points > 0 ? `${assignment.points} очков` : "проверит учитель") : undefined}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {timerExpired && !submitted && (
          <View style={s.expired}>
            <Glyph name="clock" size={18} color={DANGER} />
            <Text style={s.expiredText}>
              {submitting ? "Ответы отправляются…" : "Время вышло"}
            </Text>
          </View>
        )}

        {/* ── Задание от учителя ──
            Для свободного ответа это единственная постановка задачи, поэтому
            блок называется «Задание», а не безымянное «Описание». */}
        {!!assignment.description?.trim() && (
          <Plate style={{ padding: 14, marginBottom: 12 }}>
            <Text style={[s.lbl, { marginBottom: 7 }]}>{isFreeForm ? "Задание" : "Описание"}</Text>
            <Text style={isFreeForm ? s.taskText : s.bodyText}>{assignment.description}</Text>
            {isFreeForm && (
              <View style={{ flexDirection: "row", gap: 7, marginTop: 11, flexWrap: "wrap" }}>
                <View style={[s.badge, { backgroundColor: "rgba(251,191,36,0.22)" }]}>
                  <Glyph name="star" size={11} color="#92400e" />
                  <Text style={[s.badgeText, { color: "#92400e" }]}>
                    {assignment.points > 0 ? `${assignment.points} очков после проверки` : "Баллы после проверки"}
                  </Text>
                </View>
              </View>
            )}
          </Plate>
        )}

        {/* ── Аудио ──
            Тёмная карта: плеер — главный объект экрана, а не строка над
            вопросом. На белом фоне он терялся среди остальных карточек. */}
        {showAudioBlock && (
          <LinearGradient
            colors={[accents.violetDeep, accents.indigoDeep]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={s.audio}
          >
            {Platform.OS === "web" && mediaUrl && (
              // @ts-ignore — веб-элемент внутри RN-дерева
              <audio
                ref={audioRef}
                src={mediaUrl}
                style={{ display: "none" }}
                onEnded={() => { setAudioPlaying(false); setAudioPlays(n => n + 1); }}
                onLoadedMetadata={(e: any) => setAudioDuration(e.target.duration)}
                onTimeUpdate={(e: any) => setAudioCurrentTime(e.target.currentTime)}
              />
            )}

            <View style={{ flexDirection: "row", alignItems: "center", gap: 13 }}>
              <Pressable
                onPress={Platform.OS === "web" ? toggleAudio : openMedia}
                style={({ pressed }) => [s.play, pressed && { transform: [{ scale: 0.93 }] }]}
                accessibilityRole="button"
                accessibilityLabel={audioPlaying ? "Пауза" : "Слушать"}
              >
                <View style={audioPlaying ? undefined : { marginLeft: 3 }}>
                  <Glyph name={audioPlaying ? "pause" : "play"} size={20} color={accents.violetDeep} />
                </View>
              </Pressable>

              {/* Волна: высоты детерминированы формулой, а не случайны — иначе
                  рисунок прыгал бы на каждом ре-рендере во время проигрывания. */}
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", height: 38, gap: 2.5 }}>
                {Array.from({ length: 30 }).map((_, i) => {
                  const fraction = audioDuration ? audioCurrentTime / audioDuration : 0;
                  const played = i / 30 < fraction;
                  return (
                    <View
                      key={i}
                      style={{
                        flex: 1, borderRadius: 2,
                        height: 7 + Math.abs(Math.sin(i * 0.62 + 1) * 22),
                        backgroundColor: played ? "#f0abfc" : "rgba(255,255,255,0.28)",
                      }}
                    />
                  );
                })}
              </View>

              <Text style={s.audioTime}>
                {audioDuration ? formatAudioTime(audioDuration) : "—:——"}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
              <Pressable style={s.gchip} onPress={Platform.OS === "web" ? replayAudio : openMedia}>
                <Glyph name="repeat" size={12} color="#fff" />
                <Text style={s.gchipText}>Сначала</Text>
              </Pressable>
              {Platform.OS === "web" && (
                <>
                  <Pressable
                    style={[s.gchip, audioSpeed === 0.5 && s.gchipOn]}
                    onPress={toggleAudioSpeed}
                  >
                    <Text style={[s.gchipText, audioSpeed === 0.5 && { color: accents.violetDeep }]}>
                      {audioSpeed === 1 ? "1×" : "0.5×"}
                    </Text>
                  </Pressable>
                  <Pressable style={s.gchip} onPress={skipAudio}>
                    <Glyph name="forward" size={12} color="#fff" />
                    <Text style={s.gchipText}>+10 с</Text>
                  </Pressable>
                </>
              )}
            </View>

            <Text style={s.audioHint}>
              {audioPlays > 0
                ? `Прослушано ${audioPlays} ${plural(audioPlays, ["раз", "раза", "раз"])} · слушайте сколько нужно`
                : "Слушать можно сколько угодно раз"}
            </Text>
          </LinearGradient>
        )}

        {/* ── Видео ── */}
        {showVideoBlock && mediaUrl && (
          <View style={s.videoWrap}>
            <InlineMediaPlayer url={mediaUrl} kind="video" height={200} title={assignment.title} />
          </View>
        )}

        {showOtherBlock && mediaUrl && (
          <Plate style={{ padding: 14, marginBottom: 12 }}>
            <InlineMediaPlayer url={mediaUrl} kind="other" height={200} title={assignment.title} />
          </Plate>
        )}

        {/* ── Текст для чтения ──
            Раскрыт по умолчанию: без него на вопрос не ответить. Свернуть
            можно, когда текст уже прочитан и мешает видеть варианты. */}
        {textContent && (
          <Plate style={{ padding: 14, marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 11 }}>
              <LinearGradient
                colors={[accents.magenta, "#a855f7"]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={s.readIcon}
              >
                <Glyph name="book" size={15} color="#fff" />
              </LinearGradient>
              <Text style={s.readTitle}>Текст</Text>
              <Text style={s.readCount}>
                {textContent.trim().split(/\s+/).length} {plural(textContent.trim().split(/\s+/).length, ["слово", "слова", "слов"])}
              </Text>
            </View>

            <Text
              style={s.readBody}
              numberOfLines={readingExpanded ? undefined : 4}
            >
              {textContent}
            </Text>

            <Pressable style={s.readMore} onPress={() => setReadingExpanded(e => !e)}>
              <Text style={s.readMoreText}>{readingExpanded ? "Свернуть текст" : "Показать весь текст"}</Text>
              <View style={{ transform: [{ rotate: readingExpanded ? "-90deg" : "90deg" }] }}>
                <Glyph name="chevron" size={14} color={PRIMARY_DARK} />
              </View>
            </Pressable>
          </Plate>
        )}

        {/* ── Картинка задания ── */}
        {imageUrl && (
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => setZoomImg(imageUrl)}
            style={[s.plate, { padding: 4, overflow: "hidden", marginBottom: 12 }]}
          >
            <Image source={{ uri: imageUrl }} style={{ width: "100%", height: 170, borderRadius: radii.sm + 2 }} resizeMode="cover" />
            <View style={s.zoomHint}>
              <Glyph name="search" size={12} color={TEXT_MID} />
              <Text style={{ fontSize: 11.5, color: TEXT_MID, fontWeight: "700" }}>Увеличить</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Вопрос ── */}
        {currentQ && <QuestionHead n={currentQuestionIndex + 1} text={currentQ.text} />}

        {/* ── Варианты или поле ответа ── */}
        {currentQ && (() => {
          const opts = Array.isArray(currentQ.options) ? currentQ.options : [];
          const selected = answers[currentQ.id];

          if (opts.length > 0) {
            return (
              <View style={{ marginTop: 14 }}>
                {opts.map((opt, oi) => (
                  <OptionKey
                    key={oi}
                    letter={String.fromCharCode(65 + oi)}
                    text={opt}
                    state={selected === opt ? "selected" : "idle"}
                    disabled={inputsDisabled}
                    onPress={() => setAnswers(prev => ({ ...prev, [currentQ.id]: opt }))}
                  />
                ))}
              </View>
            );
          }

          return (
            <TextInput
              style={[s.field, { marginTop: 14, minHeight: 96 }]}
              value={answers[currentQ.id] || ""}
              onChangeText={v => !inputsDisabled && setAnswers(prev => ({ ...prev, [currentQ.id]: v }))}
              placeholder={inputsDisabled ? "Время вышло" : "Ваш ответ…"}
              placeholderTextColor={TEXT_MUTED}
              editable={!inputsDisabled}
              multiline
              textAlignVertical="top"
              {...(Platform.OS === "web" ? { outlineWidth: 0 } as any : {})}
            />
          );
        })()}

        {/* ── Свободный ответ ── */}
        {isFreeForm && (
          <View>
            <View>
              <TextInput
                style={[
                  s.field,
                  { minHeight: 126, paddingBottom: 26 },
                  freeFormFocused && { borderColor: "#8b5cf6" },
                ]}
                value={freeFormText}
                onChangeText={setFreeFormText}
                onFocus={() => setFreeFormFocused(true)}
                onBlur={() => setFreeFormFocused(false)}
                placeholder="Напишите ответ…"
                placeholderTextColor={TEXT_MUTED}
                multiline
                textAlignVertical="top"
                maxLength={2000}
                editable={!inputsDisabled}
                {...(Platform.OS === "web" ? { outlineWidth: 0 } as any : {})}
              />
              {/* Счётчик символов: раньше поле молчало, и было непонятно,
                  ждут от тебя строчку или сочинение. */}
              <Text style={s.fieldCount}>{freeFormText.length} / 2000</Text>
            </View>

            <View style={{ flexDirection: "row", gap: 9, marginTop: 11, alignItems: "center", flexWrap: "wrap" }}>
              {freeFormAttachment && (
                <View>
                  <TouchableOpacity onPress={() => setZoomImg(freeFormAttachment)} activeOpacity={0.9}>
                    <Image source={{ uri: freeFormAttachment }} style={s.thumb} resizeMode="cover" />
                  </TouchableOpacity>
                  <Pressable style={s.thumbX} onPress={() => setFreeFormAttachment(null)} hitSlop={8}>
                    <Glyph name="close" size={11} color="#fff" />
                  </Pressable>
                </View>
              )}
              <Pressable
                style={s.attach}
                onPress={handleAttachPhoto}
                disabled={freeFormUploading || inputsDisabled}
              >
                {freeFormUploading ? (
                  <ActivityIndicator color={PRIMARY_DARK} size="small" />
                ) : (
                  <>
                    <Glyph name="camera" size={16} color={PRIMARY_DARK} />
                    <Text style={s.attachText}>
                      {freeFormAttachment ? "Заменить фото" : "Прикрепить фото"}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Нижняя кнопка ── */}
      {!inputsDisabled && (
        <View style={[s.foot, { paddingBottom: insets.bottom + 12 }]}>
          <Cta
            label={ctaLabel}
            icon={ctaIcon}
            busy={submitting}
            disabled={isFreeForm ? !freeFormReady : !currentAnswered}
            onPress={goNext}
          />
          {!isFreeForm && !currentAnswered && (
            <Text style={s.footNote}>Кнопка оживёт, как только выберете вариант</Text>
          )}
          {isFreeForm && freeFormReady && (
            <Text style={s.footNote}>Изменить ответ после отправки нельзя</Text>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Аварийный экран роута.
 *
 * Expo Router подхватывает экспорт с этим именем и показывает его вместо
 * белого экрана, если рендер упал. Тот же приём, что на вкладках «Задания» и
 * «Слова»: ошибка в одном задании не должна выглядеть как поломка приложения.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={[s.stateBox, { flex: 1, backgroundColor: QUIZ_BG }]}>
      <LinearGradient
        colors={["#8b5cf6", accents.indigoDeep]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={s.stateBadge}
      >
        <Glyph name="alert" size={28} color="#fff" />
      </LinearGradient>
      <Text style={s.stateTitle}>Задание не открылось</Text>
      <Text style={s.stateText}>{error?.message ?? "Неизвестная ошибка"}</Text>
      <View style={{ alignSelf: "stretch", marginTop: 6 }}>
        <Cta label="Попробовать снова" icon="repeat" onPress={retry} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // ── Шапка ──
  topBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingBottom: 2,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "900", color: TEXT_DARK, letterSpacing: -0.3 },
  roundBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER,
    alignItems: "center", justifyContent: "center",
    shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16, shadowRadius: 8, elevation: 3,
  },
  typeChip: {
    flex: 1, minWidth: 0,
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 7, paddingLeft: 8, paddingRight: 14,
    borderRadius: radii.pill,
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER,
    shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14, shadowRadius: 9, elevation: 3,
  },
  typeChipIcon: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  typeChipLabel: { fontSize: 13, fontWeight: "800", color: TEXT_DARK, letterSpacing: -0.1 },
  typeChipSub: { fontSize: 10.5, fontWeight: "600", color: TEXT_MUTED, marginTop: 2 },
  timer: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: radii.pill,
    backgroundColor: "rgba(139,92,246,0.13)",
    borderWidth: 1.5, borderColor: "rgba(139,92,246,0.3)",
  },
  timerText: { fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },

  // ── Лестница шагов ──
  ladder: { paddingHorizontal: 16, paddingTop: 14 },
  ladderBars: { flexDirection: "row", gap: 5 },
  ladderBar: {
    flex: 1, height: 6, borderRadius: radii.pill,
    backgroundColor: "rgba(139,92,246,0.18)", overflow: "hidden",
  },
  ladderMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 },
  ladderLeft: { fontSize: 12, fontWeight: "800", color: TEXT_MID, fontVariant: ["tabular-nums"] },
  ladderRight: { fontSize: 11.5, fontWeight: "700", color: TEXT_MUTED },

  // ── Плитка ──
  plate: {
    backgroundColor: CARD_BG, borderRadius: radii.md,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1, shadowRadius: 14, elevation: 3,
  },
  lbl: {
    fontSize: 10, fontWeight: "800", letterSpacing: 1.2,
    textTransform: "uppercase", color: TEXT_MUTED,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: TEXT_DARK, marginBottom: 6 },
  bodyText: { fontSize: 14, color: TEXT_MID, lineHeight: 21 },
  taskText: { fontSize: 15, fontWeight: "700", color: TEXT_DARK, lineHeight: 22, letterSpacing: -0.15 },
  assignTitle: { fontSize: 18, fontWeight: "900", color: TEXT_DARK, marginBottom: 6, letterSpacing: -0.3 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill,
  },
  badgeText: { fontSize: 11.5, fontWeight: "800" },

  // ── Вопрос ──
  qRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  qNum: {
    width: 34, height: 34, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.36, shadowRadius: 12, elevation: 5,
  },
  qNumText: { fontSize: 15, fontWeight: "900", color: "#fff", fontVariant: ["tabular-nums"] },
  qText: {
    flex: 1, fontSize: 16.5, fontWeight: "800", color: TEXT_DARK,
    lineHeight: 23, letterSpacing: -0.3, paddingTop: 4,
  },

  // ── Вариант-клавиша ──
  optEdge: { position: "absolute", left: 0, right: 0, top: 4, bottom: 0, borderRadius: 14 },
  opt: {
    flexDirection: "row", alignItems: "center", gap: 11,
    paddingVertical: 13, paddingHorizontal: 14,
    borderRadius: 14, borderWidth: 2,
  },
  optKey: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  optKeyText: { fontSize: 13, fontWeight: "900" },
  optText: { flex: 1, fontSize: 14.5, lineHeight: 20 },

  // ── Поля ввода ──
  field: {
    borderWidth: 2, borderColor: BORDER, borderRadius: radii.md,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 14.5, lineHeight: 21, color: TEXT_DARK,
    backgroundColor: CARD_BG,
    shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08, shadowRadius: 14, elevation: 2,
  },
  fieldCount: {
    position: "absolute", right: 13, bottom: 9,
    fontSize: 11, fontWeight: "700", color: TEXT_MUTED, fontVariant: ["tabular-nums"],
  },
  attach: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: radii.sm,
    backgroundColor: CARD_BG,
    borderWidth: 1.5, borderStyle: "dashed", borderColor: "rgba(139,92,246,0.45)",
  },
  attachText: { fontSize: 13, fontWeight: "800", color: PRIMARY_DARK },
  thumb: {
    width: 74, height: 74, borderRadius: radii.sm,
    borderWidth: 2, borderColor: CARD_BG,
  },
  thumbX: {
    position: "absolute", top: 3, right: 3,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "rgba(30,27,75,0.72)",
    alignItems: "center", justifyContent: "center",
  },

  // ── Аудио ──
  audio: {
    borderRadius: radii.md, padding: 15, marginBottom: 12,
    shadowColor: accents.indigoDeep, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.36, shadowRadius: 22, elevation: 8,
  },
  play: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#1e1b4b", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 14, elevation: 6,
  },
  audioTime: {
    fontSize: 11.5, fontWeight: "800", color: "rgba(255,255,255,0.8)",
    fontVariant: ["tabular-nums"], minWidth: 34, textAlign: "right",
  },
  gchip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.26)",
  },
  gchipOn: { backgroundColor: "#fff", borderColor: "#fff" },
  gchipText: { fontSize: 12, fontWeight: "800", color: "#fff" },
  audioHint: { marginTop: 11, fontSize: 11.5, fontWeight: "600", color: "rgba(255,255,255,0.7)", lineHeight: 16 },

  // ── Видео ──
  videoWrap: {
    borderRadius: radii.md, overflow: "hidden", marginBottom: 12,
    backgroundColor: "#1e1b4b",
    shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3, shadowRadius: 22, elevation: 7,
  },

  // ── Чтение ──
  readIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  readTitle: { fontSize: 13.5, fontWeight: "800", color: TEXT_DARK, letterSpacing: -0.1 },
  readCount: { marginLeft: "auto", fontSize: 11, fontWeight: "700", color: TEXT_MUTED },
  readBody: { fontSize: 14, lineHeight: 22.5, color: TEXT_MID },
  readMore: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: 11, paddingVertical: 9, borderRadius: radii.sm,
    backgroundColor: "rgba(139,92,246,0.1)",
  },
  readMoreText: { fontSize: 12.5, fontWeight: "800", color: PRIMARY_DARK },

  zoomHint: {
    position: "absolute", right: 12, bottom: 12,
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: radii.sm - 2,
  },

  // ── Время вышло ──
  expired: {
    flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12,
    backgroundColor: "#fff1f3", borderRadius: radii.md, padding: 14,
    borderWidth: 1.5, borderColor: "#fda4af",
  },
  expiredText: { flex: 1, fontSize: 14, fontWeight: "800", color: DANGER },

  // ── Нижняя кнопка ──
  foot: { paddingHorizontal: 16, paddingTop: 8 },
  ctaEdge: { position: "absolute", left: 0, right: 0, top: chunky.edge, bottom: 0, borderRadius: radii.md },
  cta: {
    borderRadius: radii.md, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9,
  },
  ctaText: { fontSize: 15.5, fontWeight: "900", color: "#fff", letterSpacing: -0.2 },
  footNote: { marginTop: 9, textAlign: "center", fontSize: 11.5, fontWeight: "600", color: TEXT_MUTED },

  // ── Результат ──
  resultHero: {
    borderRadius: radii.lg, paddingVertical: 26, paddingHorizontal: 18,
    alignItems: "center", overflow: "hidden",
    shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.4, shadowRadius: 30, elevation: 10,
  },
  ringValue: { fontSize: 29, fontWeight: "900", color: "#fff", letterSpacing: -1.2, fontVariant: ["tabular-nums"] },
  resultTitle: { fontSize: 21, fontWeight: "900", color: "#fff", letterSpacing: -0.5 },
  resultSub: { marginTop: 6, fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.78)", textAlign: "center", lineHeight: 19 },
  earned: {
    flexDirection: "row", alignItems: "center", gap: 7, marginTop: 14,
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: radii.pill,
    shadowColor: accents.amber, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 16, elevation: 6,
  },
  earnedText: { fontSize: 14, fontWeight: "900", color: "#42200a" },
  revMark: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 1 },
  revQ: { fontSize: 13, fontWeight: "800", color: TEXT_DARK, lineHeight: 18 },
  revA: { fontSize: 12.5, fontWeight: "800", marginTop: 3, lineHeight: 17 },
  revFix: { fontSize: 12.5, fontWeight: "600", color: TEXT_MID, marginTop: 2, lineHeight: 17 },

  // ── Пустые состояния ──
  stateBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 34, gap: 12 },
  stateBadge: {
    width: 66, height: 66, borderRadius: 22, alignItems: "center", justifyContent: "center",
    shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.36, shadowRadius: 22, elevation: 8,
  },
  stateTitle: { fontSize: 17, fontWeight: "900", color: TEXT_DARK, letterSpacing: -0.3 },
  stateText: { fontSize: 13.5, fontWeight: "600", color: TEXT_MID, textAlign: "center", lineHeight: 20 },
});
