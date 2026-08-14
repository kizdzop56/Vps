// Экран «Успеваемость» — родительский. Показывает полную картину по ребёнку:
// средний балл и тренд, автоматические выводы, разбор по видам заданий,
// динамику результатов, историю занятий с учителем, время в приложении,
// словарный запас и историю сданных работ.
//
// Оформление сдержаннее ученических экранов: те же плитки с цветной тенью и
// физические кнопки из GameKit, но без наклонов, бликов и игровых эффектов —
// родителю нужны цифры, а не награды. Эмодзи не используются: значки рисует
// собственный набор глифов (components/ui/Glyph.tsx).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
  ActivityIndicator, Platform, RefreshControl, useWindowDimensions,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle, Line, Path, Rect, Text as SvgText,
  Defs, LinearGradient as SvgGradient, Stop,
} from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import authStorage from "@/utils/authStorage";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { ChunkyButton, Pill, SectionLabel } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Ошибка ${res.status}`);
  return data;
}

// ── Типы ответов API ──────────────────────────────────────────────────
type Child = {
  id: number;
  name: string | null;
  username: string;
  knowledgeLevel: string | null;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarUrl?: string | null;
  totalPoints: number;
};

type Profile = {
  id: number;
  username: string;
  name: string | null;
  surname: string | null;
  age: number | null;
  knowledgeLevel: string | null;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
  totalPoints: number;
  totalTimeMinutes: number;
  completedAssignments: number;
  averageScore: number | null;
  lastSeenAt: string | null;
  isOnline: boolean;
};

type Submission = {
  submissionId: number;
  score: number;
  correctCount: number;
  totalQuestions: number;
  pointsEarned: number;
  submittedAt: string;
  assignmentId: number | null;
  title: string | null;
  type: string | null;
  points: number | null;
};

type CategoryStat = { type: string; avgScore: number | null; count: number };

type TimeSession = {
  id: number;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
};

type TimeStats = {
  totalMinutes: number;
  todayMinutes: number;
  weekMinutes: number;
  sessions: TimeSession[];
};

type FlashcardStats = {
  totalLearned: number;
  totalWords: number;
  totalReviews: number;
  accuracy: number;
  placementLevel: string | null;
};

/** Подтверждённая бронь слота = проведённое (или предстоящее) занятие. */
type Lesson = {
  bookingId: number;
  slotId: number;
  date: string;      // "YYYY-MM-DD"
  startTime: string; // "15:00"
  endTime: string;   // "16:00"
  note: string | null;
  teacherName: string | null;
  teacherSurname: string | null;
  teacherUsername: string | null;
};

type ChildReport = {
  profile: Profile | null;
  submissions: Submission[];
  categoryStats: CategoryStat[];
  time: TimeStats | null;
  flashcards: FlashcardStats | null;
  lessons: Lesson[];
};

// ── Справочники ───────────────────────────────────────────────────────
const SCALE_LABELS: Record<string, string> = {
  text_test: "Тесты",
  audio: "Аудирование",
  reading: "Чтение",
  video: "Видео",
  free_form: "Свободный ответ",
};
const SCALE_COLORS: Record<string, string> = {
  text_test: "#8b5cf6",
  audio: "#6366f1",
  reading: "#d946ef",
  video: "#ec4899",
  free_form: "#f59e0b",
};
/** Значки видов заданий — из собственного набора, а не из Feather. */
const SCALE_ICONS: Record<string, GlyphName> = {
  text_test: "pen",
  audio: "sound",
  reading: "book",
  video: "video",
  free_form: "note",
};
const KNOWLEDGE_LABELS: Record<string, string> = {
  starter: "Стартовый",
  beginner: "Начинающий",
  elementary: "Элементарный",
  intermediate: "Средний",
  upper_intermediate: "Продвинутый",
};
const WEEKDAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

// ── Утилиты ───────────────────────────────────────────────────────────
function formatMinutes(mins: number): string {
  const total = Math.max(0, Math.round(mins));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

/** Оценка балла словами — чтобы родителю было понятно без процентов. */
function scoreVerdict(score: number): string {
  if (score >= 85) return "отлично";
  if (score >= 70) return "хорошо";
  if (score >= 50) return "нужна практика";
  return "требует внимания";
}

/**
 * Цвет балла. Зелёного в палитре нет намеренно: «хорошо» здесь фиолетовый
 * (colors.success = #8b5cf6), средний результат — янтарь, слабый — розовый
 * destructive. Так экран остаётся в фирменной гамме и не спорит с брендом.
 */
function scoreColor(score: number, colors: { success: string; destructive: string }): string {
  if (score >= 70) return colors.success;
  if (score >= 50) return accents.amber;
  return colors.destructive;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Минуты в приложении по каждому из последних 7 дней (включая сегодня). */
function buildWeekActivity(sessions: TimeSession[]): { label: string; key: string; minutes: number }[] {
  const buckets = new Map<string, number>();
  for (const s of sessions) {
    const started = new Date(s.startedAt);
    if (Number.isNaN(started.getTime())) continue;
    const ended = s.endedAt ? new Date(s.endedAt) : new Date();
    const minutes = s.endedAt
      ? Math.max(0, (ended.getTime() - started.getTime()) / 60000)
      : Math.max(0, s.durationMinutes ?? 0);
    const key = dayKey(started);
    buckets.set(key, (buckets.get(key) ?? 0) + minutes);
  }

  const days: { label: string; key: string; minutes: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = dayKey(d);
    days.push({
      label: WEEKDAY_SHORT[d.getDay()] ?? "",
      key,
      minutes: Math.round(buckets.get(key) ?? 0),
    });
  }
  return days;
}

/** Сколько дней подряд ребёнок заходил в приложение (считая сегодня/вчера). */
function computeStreak(sessions: TimeSession[]): number {
  const active = new Set<string>();
  for (const s of sessions) {
    const d = new Date(s.startedAt);
    if (!Number.isNaN(d.getTime())) active.add(dayKey(d));
  }
  if (active.size === 0) return 0;

  const cursor = new Date();
  // Серия не рвётся, если сегодня ещё не заходил, но заходил вчера.
  if (!active.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (active.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const diff = Date.now() - then.getTime();
  return Math.floor(diff / 86_400_000);
}

/** "15:30" → 930 минут от полуночи. */
function parseHM(time: string): number {
  const [h, m] = time.split(":");
  const hh = Number(h);
  const mm = Number(m ?? 0);
  if (!Number.isFinite(hh)) return 0;
  return hh * 60 + (Number.isFinite(mm) ? mm : 0);
}

/** Длительность занятия в минутах по времени слота. */
function lessonMinutes(lesson: Lesson): number {
  const dur = parseHM(lesson.endTime) - parseHM(lesson.startTime);
  return dur > 0 ? dur : 0;
}

/** "2026-07-28" → "28 июля". */
function formatLessonDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function pluralDays(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

function pluralLessons(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return "занятий";
  if (mod10 === 1) return "занятие";
  if (mod10 >= 2 && mod10 <= 4) return "занятия";
  return "занятий";
}

/**
 * Сводка по занятиям: считаем ДНИ, в которые было хотя бы одно занятие
 * (а не количество слотов) — родителя интересует регулярность.
 * Будущие слоты в «отзанимался» не попадают, но идут в «следующее занятие».
 */
function summarizeLessons(lessons: Lesson[]): {
  daysWeek: number;
  daysMonth: number;
  lessonsWeek: number;
  lessonsMonth: number;
  totalPast: number;
  totalMinutes: number;
  last: Lesson | null;
  next: Lesson | null;
  /** Проведённые занятия, от новых к старым — для списка на экране. */
  past: Lesson[];
} {
  const now = new Date();
  const todayKey = dayKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const keyDaysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return dayKey(d);
  };
  // Окна включают сегодня: неделя = сегодня и 6 предыдущих дней.
  const weekStartKey = keyDaysAgo(6);
  const monthStartKey = keyDaysAgo(29);

  const isPast = (l: Lesson) =>
    l.date < todayKey || (l.date === todayKey && parseHM(l.endTime) <= nowMinutes);

  const past = lessons.filter(isPast);
  const upcoming = lessons.filter((l) => !isPast(l));

  const daysIn = (fromKey: string) => {
    const set = new Set<string>();
    for (const l of past) if (l.date >= fromKey && l.date <= todayKey) set.add(l.date);
    return set.size;
  };
  const countIn = (fromKey: string) =>
    past.filter((l) => l.date >= fromKey && l.date <= todayKey).length;

  // past отсортирован от новых к старым (сортировка на сервере), upcoming — наоборот.
  const sortedUpcoming = [...upcoming].sort(
    (a, b) => a.date.localeCompare(b.date) || parseHM(a.startTime) - parseHM(b.startTime)
  );

  return {
    daysWeek: daysIn(weekStartKey),
    daysMonth: daysIn(monthStartKey),
    lessonsWeek: countIn(weekStartKey),
    lessonsMonth: countIn(monthStartKey),
    totalPast: past.length,
    totalMinutes: past.reduce((sum, l) => sum + lessonMinutes(l), 0),
    last: past[0] ?? null,
    next: sortedUpcoming[0] ?? null,
    past,
  };
}

/** Имя учителя для подписи занятия: имя+фамилия, иначе ник. */
function teacherLabel(lesson: Lesson): string {
  const full = [lesson.teacherName, lesson.teacherSurname].filter(Boolean).join(" ").trim();
  return full || lesson.teacherUsername || "";
}

// ── График динамики среднего балла ────────────────────────────────────
function ScoreTrendChart({
  points, width, colors,
}: {
  points: { score: number; date: string }[];
  width: number;
  colors: any;
}) {
  const H = 150;
  const PAD_L = 30;
  const PAD_R = 10;
  const PAD_T = 12;
  const PAD_B = 24;
  const innerW = Math.max(10, width - PAD_L - PAD_R);
  const innerH = H - PAD_T - PAD_B;

  if (points.length < 2) {
    return (
      <View style={{ paddingVertical: 24, alignItems: "center", gap: 10 }}>
        <Glyph name="chart" size={30} color={colors.mutedForeground} />
        <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
          График появится после двух выполненных заданий
        </Text>
      </View>
    );
  }

  const x = (i: number) => PAD_L + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (score: number) => PAD_T + innerH - (Math.max(0, Math.min(100, score)) / 100) * innerH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${x(points.length - 1).toFixed(1)} ${(PAD_T + innerH).toFixed(1)} L${x(0).toFixed(1)} ${(PAD_T + innerH).toFixed(1)} Z`;

  const firstDate = new Date(points[0]!.date);
  const lastDate = new Date(points[points.length - 1]!.date);
  const fmtDate = (d: Date) =>
    Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

  return (
    <Svg width={width} height={H}>
      <Defs>
        {/* Заливка под линией угасает книзу — линия читается чётче. */}
        <SvgGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#a855f7" stopOpacity={0.32} />
          <Stop offset="1" stopColor="#6366f1" stopOpacity={0.02} />
        </SvgGradient>
        <SvgGradient id="trendLine" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#6366f1" />
          <Stop offset="1" stopColor={accents.magenta} />
        </SvgGradient>
      </Defs>

      {/* Сетка и подписи шкалы */}
      {[0, 50, 100].map((tick) => (
        <React.Fragment key={tick}>
          <Line
            x1={PAD_L}
            y1={y(tick)}
            x2={PAD_L + innerW}
            y2={y(tick)}
            stroke={colors.border}
            strokeWidth={1}
            strokeDasharray={tick === 0 ? undefined : "4 4"}
          />
          <SvgText x={0} y={y(tick) + 4} fontSize={10} fill={colors.mutedForeground}>
            {`${tick}%`}
          </SvgText>
        </React.Fragment>
      ))}

      {/* Область под линией */}
      <Path d={areaPath} fill="url(#trendFill)" />
      <Path d={linePath} stroke="url(#trendLine)" strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />

      {/* Точки */}
      {points.map((p, i) => (
        <Circle
          key={`${p.date}-${i}`}
          cx={x(i)}
          cy={y(p.score)}
          r={points.length > 14 ? 2.5 : 4}
          fill="#ffffff"
          stroke={scoreColor(p.score, colors)}
          strokeWidth={2}
        />
      ))}

      {/* Даты по краям */}
      <SvgText x={PAD_L} y={H - 6} fontSize={10} fill={colors.mutedForeground}>
        {fmtDate(firstDate)}
      </SvgText>
      <SvgText x={PAD_L + innerW} y={H - 6} fontSize={10} fill={colors.mutedForeground} textAnchor="end">
        {fmtDate(lastDate)}
      </SvgText>
    </Svg>
  );
}

// ── График времени в приложении за 7 дней ────────────────────────────
function WeekActivityChart({
  days, width, colors,
}: {
  days: { label: string; key: string; minutes: number }[];
  width: number;
  colors: any;
}) {
  const H = 120;
  const PAD_B = 22;
  const PAD_T = 16;
  const innerH = H - PAD_B - PAD_T;
  const slot = width / Math.max(1, days.length);
  const barW = Math.min(28, slot * 0.52);
  const max = Math.max(15, ...days.map((d) => d.minutes));

  return (
    <Svg width={width} height={H}>
      <Defs>
        <SvgGradient id="weekBar" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#a855f7" />
          <Stop offset="1" stopColor="#6366f1" />
        </SvgGradient>
        {/* Сегодняшний столбец теплее остальных — глаз находит его сразу. */}
        <SvgGradient id="weekBarToday" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={accents.magenta} />
          <Stop offset="1" stopColor="#ec4899" />
        </SvgGradient>
      </Defs>
      {days.map((d, i) => {
        const cx = slot * i + slot / 2;
        const h = Math.max(d.minutes > 0 ? 4 : 2, (d.minutes / max) * innerH);
        const isToday = i === days.length - 1;
        const fill = d.minutes === 0 ? colors.muted : isToday ? "url(#weekBarToday)" : "url(#weekBar)";
        return (
          <React.Fragment key={d.key}>
            {d.minutes > 0 && (
              <SvgText x={cx} y={PAD_T + innerH - h - 5} fontSize={9} fontWeight="700" fill={colors.mutedForeground} textAnchor="middle">
                {d.minutes >= 60 ? `${Math.round((d.minutes / 60) * 10) / 10}ч` : `${d.minutes}м`}
              </SvgText>
            )}
            <Rect
              x={cx - barW / 2}
              y={PAD_T + innerH - h}
              width={barW}
              height={h}
              rx={Math.min(7, barW / 2)}
              fill={fill}
              opacity={d.minutes === 0 ? 0.7 : 1}
            />
            <SvgText
              x={cx}
              y={H - 6}
              fontSize={10}
              fontWeight={isToday ? "800" : "500"}
              fill={isToday ? "#ec4899" : colors.mutedForeground}
              textAnchor="middle"
            >
              {d.label}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// ── Успеваемость по шкалам ────────────────────────────────────────────
function ScaleBars({
  stats, average, colors,
}: {
  stats: CategoryStat[];
  average: number | null;
  colors: any;
}) {
  const hasAny = stats.some((s) => s.count > 0);
  if (!hasAny) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 18, gap: 10 }}>
        <Glyph name="tray" size={30} color={colors.mutedForeground} />
        <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
          Пока нет выполненных заданий — шкалы заполнятся автоматически
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 15 }}>
      {stats.map((stat) => {
        const color = SCALE_COLORS[stat.type] ?? colors.primary;
        const has = stat.count > 0 && stat.avgScore !== null;
        const pct = Math.max(0, Math.min(100, stat.avgScore ?? 0));
        return (
          <View key={stat.type}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 7, gap: 9 }}>
              {/* Значок вида задания в плашке своего цвета: строки различимы
                  по цвету раньше, чем прочитан текст. */}
              <View style={{
                width: 26, height: 26, borderRadius: 8,
                backgroundColor: color + "1f",
                alignItems: "center", justifyContent: "center",
              }}>
                <Glyph name={SCALE_ICONS[stat.type] ?? "pen"} size={14} color={color} />
              </View>
              <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.foreground, flex: 1 }}>
                {SCALE_LABELS[stat.type] ?? stat.type}
              </Text>
              {has ? (
                <>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>
                    {stat.count} {stat.count === 1 ? "задание" : "заданий"}
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: "900", color, minWidth: 44, textAlign: "right", fontVariant: ["tabular-nums"] }}>
                    {pct}%
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>нет данных</Text>
              )}
            </View>

            <View style={{ height: 10, backgroundColor: colors.muted, borderRadius: 5, overflow: "hidden", position: "relative" }}>
              {has && (
                <View style={{ height: 10, width: `${pct}%` as any, backgroundColor: color, borderRadius: 5 }} />
              )}
              {/* Отметка среднего балла ребёнка — видно, какая шкала выбивается */}
              {average !== null && (
                <View
                  style={{
                    position: "absolute",
                    left: `${Math.max(0, Math.min(100, average))}%` as any,
                    top: -2,
                    width: 2,
                    height: 14,
                    backgroundColor: colors.foreground,
                    opacity: 0.35,
                  }}
                />
              )}
            </View>

            {has && (
              <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 4 }}>
                {scoreVerdict(pct)}
              </Text>
            )}
          </View>
        );
      })}

      {average !== null && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
          <View style={{ width: 2, height: 12, backgroundColor: colors.foreground, opacity: 0.35 }} />
          <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
            — средний балл по всем заданиям ({average}%)
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Экран ─────────────────────────────────────────────────────────────
export default function ProgressScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Вкладка только для родителей. Флаг вычисляется здесь и используется как
  // условие для ВСЕХ сетевых эффектов ниже — раньше проверка роли была только
  // в JSX (см. "if (user && user.role !== 'parent') return ..." в конце
  // компонента), а хуки/эффекты успевали отработать до неё. loadChildren()
  // дёргала /api/connections/parent/children для любого залогиненного
  // пользователя, и студент на этой вкладке гарантированно ловил 403 —
  // именно это увидел E2E-прогон на экране /progress.
  const isParent = user?.role === "parent";

  const [children, setChildren] = useState<Child[]>([]);
  const [activeChildId, setActiveChildId] = useState<number | null>(null);
  const [report, setReport] = useState<ChildReport | null>(null);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [showAllLessons, setShowAllLessons] = useState(false);

  // Ширина графиков = ширина окна минус отступы скролла (20+20) и карточки (18+18).
  // Тот же приём, что на экране статистики карточек, но через хук —
  // на web график перерисовывается при изменении размера окна.
  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = Math.max(220, windowWidth - 40 - 36);

  const loadChildren = useCallback(async () => {
    if (!isParent) { setLoadingChildren(false); return; }
    try {
      const list: Child[] = await apiFetch("/api/connections/parent/children");
      setChildren(list ?? []);
      setActiveChildId((prev) => {
        if (prev !== null && (list ?? []).some((c) => c.id === prev)) return prev;
        return list && list.length > 0 ? list[0]!.id : null;
      });
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить список детей");
    } finally {
      setLoadingChildren(false);
    }
  }, [isParent]);

  const loadReport = useCallback(async (childId: number, silent = false) => {
    if (!isParent) return;
    if (!silent) setLoadingReport(true);
    try {
      const [profile, submissions, categoryStats, time, flashcards, lessons] = await Promise.all([
        apiFetch(`/api/users/${childId}`).catch(() => null),
        apiFetch(`/api/students/${childId}/submissions`).catch(() => []),
        apiFetch(`/api/students/${childId}/category-stats`).catch(() => []),
        apiFetch(`/api/students/${childId}/time`).catch(() => null),
        apiFetch(`/api/flashcards/stats?studentId=${childId}`).catch(() => null),
        apiFetch(`/api/students/${childId}/lessons`).catch(() => []),
      ]);
      setReport({
        profile: profile ?? null,
        submissions: Array.isArray(submissions) ? submissions : [],
        categoryStats: Array.isArray(categoryStats) ? categoryStats : [],
        time: time ?? null,
        flashcards: flashcards ?? null,
        lessons: Array.isArray(lessons) ? lessons : [],
      });
    } finally {
      setLoadingReport(false);
    }
  }, [isParent]);

  useEffect(() => { loadChildren(); }, [loadChildren]);

  useEffect(() => {
    setShowAllHistory(false);
    setShowAllLessons(false);
    if (isParent && activeChildId !== null) loadReport(activeChildId);
    else setReport(null);
  }, [isParent, activeChildId, loadReport]);

  // Возврат на вкладку — обновляем цифры (время в приложении меняется постоянно).
  useFocusEffect(
    useCallback(() => {
      if (isParent && activeChildId !== null) loadReport(activeChildId, true);
    }, [isParent, activeChildId, loadReport])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadChildren();
    if (isParent && activeChildId !== null) await loadReport(activeChildId, true);
    setRefreshing(false);
  }, [loadChildren, loadReport, isParent, activeChildId]);

  // ── Производные метрики ────────────────────────────────────────────
  const derived = useMemo(() => {
    const subs = report?.submissions ?? [];
    // API отдаёт от новых к старым — для графика нужен хронологический порядок.
    const chronological = [...subs].reverse();

    const avgScore = subs.length > 0
      ? Math.round(subs.reduce((sum, s) => sum + s.score, 0) / subs.length)
      : report?.profile?.averageScore ?? null;

    // Тренд: последние 5 заданий против предыдущих 5.
    const recent = subs.slice(0, 5);
    const previous = subs.slice(5, 10);
    const mean = (arr: Submission[]) =>
      arr.length > 0 ? arr.reduce((s, x) => s + x.score, 0) / arr.length : null;
    const recentAvg = mean(recent);
    const prevAvg = mean(previous);
    const trend = recentAvg !== null && prevAvg !== null ? Math.round(recentAvg - prevAvg) : null;

    const scored = (report?.categoryStats ?? []).filter((s) => s.count > 0 && s.avgScore !== null);
    const sorted = [...scored].sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));
    const best = sorted[0] ?? null;
    const worst = sorted.length > 1 ? sorted[sorted.length - 1]! : null;

    const sessions = report?.time?.sessions ?? [];
    const week = buildWeekActivity(sessions);
    const streak = computeStreak(sessions);
    const activeDaysThisWeek = week.filter((d) => d.minutes > 0).length;

    const totalCorrect = subs.reduce((s, x) => s + (x.correctCount ?? 0), 0);
    const totalQuestions = subs.reduce((s, x) => s + (x.totalQuestions ?? 0), 0);

    const lastSubmission = subs[0] ?? null;
    const idleDays = daysSince(lastSubmission?.submittedAt ?? null);

    const lessons = summarizeLessons(report?.lessons ?? []);

    return {
      chronological, avgScore, trend, recentAvg, best, worst, week, streak,
      activeDaysThisWeek, totalCorrect, totalQuestions, lastSubmission, idleDays,
      lessons,
    };
  }, [report]);

  // ── Автоматические выводы для родителя ─────────────────────────────
  const insights = useMemo(() => {
    const out: { icon: GlyphName; tone: "good" | "warn" | "info"; text: string }[] = [];
    const subs = report?.submissions ?? [];

    // Без заданий выводов по баллам нет — но занятия, время в приложении
    // и словарный запас показываем всё равно, они могут быть.
    if (subs.length === 0) {
      out.push({
        icon: "compass",
        tone: "info",
        text: "Ребёнок ещё не выполнил ни одного задания. Как только появится первый результат, здесь будет разбор по баллам.",
      });
    }

    if (derived.trend !== null && derived.trend >= 5) {
      out.push({ icon: "trendUp", tone: "good", text: `Результаты растут: +${derived.trend} п.п. за последние 5 заданий.` });
    } else if (derived.trend !== null && derived.trend <= -5) {
      out.push({ icon: "trendDown", tone: "warn", text: `Результаты снижаются: ${derived.trend} п.п. за последние 5 заданий. Стоит обсудить, что стало сложнее.` });
    } else if (derived.trend !== null) {
      out.push({ icon: "chart", tone: "info", text: "Результаты стабильны — резких изменений за последние задания нет." });
    }

    if (derived.best && derived.best.avgScore !== null) {
      out.push({
        icon: "trophy",
        tone: "good",
        text: `Лучше всего даётся «${SCALE_LABELS[derived.best.type] ?? derived.best.type}» — ${derived.best.avgScore}%. Есть за что похвалить.`,
      });
    }
    if (derived.worst && derived.worst.avgScore !== null && derived.worst.avgScore < 70) {
      out.push({
        icon: "alert",
        tone: "warn",
        text: `Слабое место — «${SCALE_LABELS[derived.worst.type] ?? derived.worst.type}» (${derived.worst.avgScore}%). Здесь нужна дополнительная практика.`,
      });
    }

    if (derived.streak >= 3) {
      out.push({ icon: "flame", tone: "good", text: `Занимается ${derived.streak} ${derived.streak === 1 ? "день" : "дней"} подряд — привычка формируется.` });
    }
    if (derived.activeDaysThisWeek > 0) {
      const weekMins = report?.time?.weekMinutes ?? 0;
      out.push({
        icon: "clock",
        tone: derived.activeDaysThisWeek >= 3 ? "good" : "info",
        text: `За последние 7 дней заходил ${derived.activeDaysThisWeek} ${derived.activeDaysThisWeek === 1 ? "день" : "дней"} и провёл в приложении ${formatMinutes(weekMins)}.`,
      });
    } else {
      out.push({ icon: "clock", tone: "warn", text: "На этой неделе ребёнок ещё не заходил в приложение." });
    }

    if (derived.idleDays !== null && derived.idleDays >= 7) {
      out.push({ icon: "calendar", tone: "warn", text: `Последнее задание выполнено ${derived.idleDays} дней назад — перерыв затянулся.` });
    }

    const ls = derived.lessons;
    if (ls.totalPast > 0) {
      out.push({
        icon: "calendar",
        tone: ls.daysWeek > 0 ? "good" : "info",
        text: `Занятия с учителем: ${ls.daysWeek} ${pluralDays(ls.daysWeek)} за неделю и ${ls.daysMonth} ${pluralDays(ls.daysMonth)} за месяц.`,
      });
    }

    const fc = report?.flashcards;
    if (fc && fc.totalWords > 0) {
      out.push({
        icon: "cards",
        tone: fc.accuracy >= 70 ? "good" : "info",
        text: `Слова: выучено ${fc.totalLearned} из ${fc.totalWords}, точность ответов ${fc.accuracy}%.`,
      });
    }

    if (derived.totalQuestions > 0) {
      out.push({
        icon: "check",
        tone: "info",
        text: `Всего верных ответов ${derived.totalCorrect} из ${derived.totalQuestions}.`,
      });
    }

    return out;
  }, [report, derived]);

  const activeChild = children.find((c) => c.id === activeChildId) ?? null;
  const profile = report?.profile ?? null;
  const displayName = profile
    ? [profile.name, profile.surname].filter(Boolean).join(" ") || profile.username
    : activeChild
    ? activeChild.name || activeChild.username
    : "";

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    title: { fontSize: 28, fontWeight: "900", letterSpacing: -0.6, color: colors.foreground },
    subtitle: { fontSize: 14, color: colors.mutedForeground, marginTop: 2 },
    scroll: { paddingHorizontal: 20, paddingBottom: insets.bottom + 100 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingHorizontal: 32, paddingBottom: 80 },
    // Карточка: цветная тень вместо серой — на светло-фиолетовом фоне серая
    // читается грязью. Рамка добавлена, чтобы край не растворялся.
    card: {
      backgroundColor: colors.card,
      borderRadius: radii.lg - 4,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      marginBottom: 16,
      shadowColor: accents.violetDeep,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.14,
      shadowRadius: 16,
      elevation: 4,
    },
    sectionTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2, color: colors.foreground },
    sectionHint: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
    statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
    statCard: {
      flex: 1,
      minWidth: "44%",
      backgroundColor: colors.card,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      alignItems: "center",
      gap: 5,
      shadowColor: accents.violetDeep,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.13,
      shadowRadius: 14,
      elevation: 4,
    },
    statValue: { fontSize: 25, fontWeight: "900", letterSpacing: -0.8, color: colors.foreground, fontVariant: ["tabular-nums"] },
    statLabel: { fontSize: 12, color: colors.mutedForeground, textAlign: "center" },
    badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radii.pill, backgroundColor: colors.muted },
    badgeText: { fontSize: 12, color: colors.mutedForeground, fontWeight: "600" },
    historyRow: {
      backgroundColor: "rgba(243,240,255,0.6)",
      borderRadius: radii.sm,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
    },
    empty: { fontSize: 13, color: colors.mutedForeground, textAlign: "center", paddingVertical: 18 },
  });

  // Вкладка только для родителей — на всякий случай мягкая заглушка.
  if (user && !isParent) {
    return (
      <View style={[styles.container, styles.center]}>
        <Glyph name="lock" size={38} color={colors.mutedForeground} />
        <Text style={[styles.empty, { fontSize: 15 }]}>
          Эта вкладка доступна только родителям.
        </Text>
      </View>
    );
  }

  if (loadingChildren) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.center]}>
        <Glyph name="alert" size={38} color={colors.destructive} />
        <Text style={[styles.empty, { fontSize: 15 }]}>{error}</Text>
        <TouchableOpacity
          onPress={() => { setLoadingChildren(true); loadChildren(); }}
          style={{ backgroundColor: colors.primary, borderRadius: radii.sm, paddingHorizontal: 18, paddingVertical: 11 }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Повторить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (children.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Успеваемость</Text>
          <Text style={styles.subtitle}>Полная картина по вашему ребёнку</Text>
        </View>
        <View style={styles.center}>
          <Glyph name="users" size={54} color={colors.mutedForeground} />
          <Text style={[styles.empty, { fontSize: 15 }]}>
            Пока не добавлен ни один ребёнок.{"\n"}Добавьте его на вкладке «Дети» — и здесь появится полный анализ успеваемости.
          </Text>
          <ChunkyButton
            label="Добавить ребёнка"
            icon="plus"
            onPress={() => router.push("/(main)/students" as any)}
            style={{ alignSelf: "stretch" }}
          />
        </View>
      </View>
    );
  }

  const avg = derived.avgScore;
  const trend = derived.trend;
  const fc = report?.flashcards ?? null;
  const time = report?.time ?? null;
  const history = showAllHistory ? report?.submissions ?? [] : (report?.submissions ?? []).slice(0, 6);

  // Занятия: сводка + список проведённых (сервер отдаёт от новых к старым).
  const lessonsInfo = derived.lessons;
  const pastLessons = lessonsInfo.past;
  const visibleLessons = showAllLessons ? pastLessons : pastLessons.slice(0, 5);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Успеваемость</Text>
        <Text style={styles.subtitle}>
          {children.length > 1 ? "Полный анализ по каждому ребёнку" : `Полная картина по ${displayName || "ребёнку"}`}
        </Text>
      </View>

      {/* Переключатель детей */}
      {children.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 12 }}
        >
          {children.map((child) => {
            const active = child.id === activeChildId;
            return (
              <TouchableOpacity
                key={child.id}
                onPress={() => setActiveChildId(child.id)}
                activeOpacity={0.8}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 8,
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill,
                  backgroundColor: active ? colors.primary : colors.card,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  // Активный ребёнок слегка приподнят — тот же приём, что у
                  // переключателей в рейтинге.
                  ...(active ? {
                    shadowColor: colors.primary,
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    elevation: 4,
                  } : {}),
                }}
              >
                <View style={{ width: 24, height: 24, overflow: "hidden", borderRadius: 12 }}>
                  <View style={{ position: "absolute", left: -8, top: -8 }}>
                    <AnimatedAvatar
                      size={24}
                      avatarColor={child.avatarColor ?? "#6366f1"}
                      avatarEmoji={child.avatarEmoji}
                      avatarUrl={child.avatarUrl}
                    />
                  </View>
                </View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: active ? "#fff" : colors.foreground }}>
                  {child.name || child.username}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loadingReport ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* ── Главная карточка: кто, средний балл, тренд ── */}
          <View style={styles.card}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <AnimatedAvatar
                size={56}
                avatarColor={profile?.avatarColor ?? activeChild?.avatarColor ?? "#6366f1"}
                avatarEmoji={profile?.avatarEmoji ?? activeChild?.avatarEmoji ?? null}
                avatarUrl={profile?.avatarUrl ?? activeChild?.avatarUrl ?? null}
                onlineDot={profile?.isOnline ?? false}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>
                  {displayName}
                </Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 3 }}>
                  {profile?.isOnline
                    ? "сейчас в приложении"
                    : profile?.lastSeenAt
                    ? `был(а) в сети ${new Date(profile.lastSeenAt).toLocaleDateString("ru-RU")}`
                    : "давно не заходил(а)"}
                </Text>
              </View>
              <Pressable
                onPress={() => activeChildId !== null && router.push(`/(main)/chat/${activeChildId}` as any)}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", gap: 6,
                  backgroundColor: colors.primary, borderRadius: radii.sm,
                  paddingHorizontal: 12, paddingVertical: 9,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Glyph name="chat" size={15} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>Написать</Text>
              </Pressable>
            </View>

            {/* Средний балл крупно + тренд */}
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, marginTop: 18 }}>
              <Text style={{
                fontSize: 46, fontWeight: "900", letterSpacing: -2, lineHeight: 50,
                fontVariant: ["tabular-nums"],
                color: avg !== null ? scoreColor(avg, colors) : colors.mutedForeground,
              }}>
                {avg !== null ? `${avg}%` : "—"}
              </Text>
              <View style={{ flex: 1, paddingBottom: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "800", color: colors.foreground }}>Средний балл</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                  {avg !== null ? scoreVerdict(avg) : "нет выполненных заданий"}
                </Text>
              </View>
              {trend !== null && trend !== 0 && (
                <View
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 5,
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill,
                    backgroundColor: (trend > 0 ? colors.success : colors.destructive) + "1a",
                    marginBottom: 6,
                  }}
                >
                  <Glyph name={trend > 0 ? "trendUp" : "trendDown"} size={14} color={trend > 0 ? colors.success : colors.destructive} />
                  <Text style={{
                    fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"],
                    color: trend > 0 ? colors.success : colors.destructive,
                  }}>
                    {trend > 0 ? `+${trend}` : trend} п.п.
                  </Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              {profile?.age ? (
                <View style={styles.badge}><Text style={styles.badgeText}>{profile.age} лет</Text></View>
              ) : null}
              {profile?.knowledgeLevel && KNOWLEDGE_LABELS[profile.knowledgeLevel] ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Уровень: {KNOWLEDGE_LABELS[profile.knowledgeLevel]}</Text>
                </View>
              ) : null}
              <Pill
                text={`CEFR: ${fc?.placementLevel ?? "тест не пройден"}`}
                icon="rank"
                tone="soft"
                color={colors.primary}
              />
              {derived.streak > 0 && (
                // Серия дней — единственный «наградный» элемент на родительском
                // экране: огонь глифом, без эмодзи.
                <Pill
                  text={`${derived.streak} ${derived.streak === 1 ? "день" : "дней"} подряд`}
                  icon="flame"
                  tone="gold"
                />
              )}
            </View>
          </View>

          {/* ── Ключевые цифры ── */}
          <View style={styles.statsGrid}>
            <StatBox styles={styles} icon="check" tint={colors.success} value={String(report?.submissions.length ?? 0)} label="Выполнено заданий" />
            <StatBox styles={styles} icon="star" tint={accents.magenta} value={String(profile?.totalPoints ?? activeChild?.totalPoints ?? 0)} label="Очков (XP)" />
            <StatBox styles={styles} icon="clock" tint={colors.primary} value={formatMinutes(time?.totalMinutes ?? profile?.totalTimeMinutes ?? 0)} label="Всего в приложении" />
            <StatBox
              styles={styles}
              icon="target"
              tint={accents.amber}
              value={derived.totalQuestions > 0
                ? `${Math.round((derived.totalCorrect / derived.totalQuestions) * 100)}%`
                : "—"}
              label="Верных ответов"
            />
          </View>

          {/* ── Что важно знать ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Что важно знать</Text>
            <Text style={styles.sectionHint}>Автоматический разбор по данным приложения</Text>
            <View style={{ gap: 10, marginTop: 14 }}>
              {insights.map((ins, i) => {
                // Тон в фирменной гамме: хорошо — фиолетовый, внимание — янтарь,
                // нейтрально — индиго. Зелёного в палитре нет намеренно.
                const tint = ins.tone === "good" ? colors.success : ins.tone === "warn" ? accents.amber : colors.primary;
                return (
                  <View
                    key={`${ins.text}-${i}`}
                    style={{
                      flexDirection: "row", gap: 11, alignItems: "flex-start",
                      backgroundColor: tint + "12", borderRadius: radii.sm,
                      padding: 12,
                      borderLeftWidth: 3, borderLeftColor: tint,
                    }}
                  >
                    <View style={{ marginTop: 1 }}>
                      <Glyph name={ins.icon} size={16} color={tint} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: colors.foreground }}>
                      {ins.text}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── Успеваемость по всем шкалам ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Успеваемость по шкалам</Text>
            <Text style={styles.sectionHint}>Средний балл по каждому виду заданий</Text>
            <View style={{ marginTop: 16 }}>
              <ScaleBars stats={report?.categoryStats ?? []} average={avg} colors={colors} />
            </View>
          </View>

          {/* ── Динамика ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Динамика результатов</Text>
            <Text style={styles.sectionHint}>Балл за каждое выполненное задание по порядку</Text>
            <View style={{ marginTop: 12 }}>
              <ScoreTrendChart
                points={derived.chronological.slice(-20).map((s) => ({ score: s.score, date: s.submittedAt }))}
                width={chartWidth}
                colors={colors}
              />
            </View>
          </View>

          {/* ── История занятий (по слотам календаря) ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>История занятий</Text>
            <Text style={styles.sectionHint}>Занятия с учителем по расписанию</Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              {[
                { label: `${pluralDays(lessonsInfo.daysWeek)} за неделю`, value: lessonsInfo.daysWeek, sub: `${lessonsInfo.lessonsWeek} ${pluralLessons(lessonsInfo.lessonsWeek)}`, color: accents.magenta },
                { label: `${pluralDays(lessonsInfo.daysMonth)} за месяц`, value: lessonsInfo.daysMonth, sub: `${lessonsInfo.lessonsMonth} ${pluralLessons(lessonsInfo.lessonsMonth)}`, color: colors.primary },
              ].map((item) => (
                <View
                  key={item.label}
                  style={{ flex: 1, backgroundColor: item.color + "12", borderRadius: radii.md - 4, padding: 14, alignItems: "center", gap: 2 }}
                >
                  <Text style={{ fontSize: 30, fontWeight: "900", letterSpacing: -1, color: item.color, lineHeight: 34, fontVariant: ["tabular-nums"] }}>
                    {item.value}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>{item.label}</Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{item.sub}</Text>
                </View>
              ))}
            </View>

            {lessonsInfo.totalPast === 0 ? (
              <Text style={styles.empty}>
                {(report?.lessons.length ?? 0) > 0
                  ? "Занятия назначены, но ещё не прошли"
                  : "Занятий пока не было — они появятся, когда учитель запишет ребёнка в расписание"}
              </Text>
            ) : (
              <View style={{ gap: 8, marginTop: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Glyph name="check" size={14} color={colors.success} />
                  <Text style={{ fontSize: 13, color: colors.foreground }}>
                    Всего проведено: <Text style={{ fontWeight: "800" }}>{lessonsInfo.totalPast} {pluralLessons(lessonsInfo.totalPast)}</Text>
                    {lessonsInfo.totalMinutes > 0 ? ` · ${formatMinutes(lessonsInfo.totalMinutes)}` : ""}
                  </Text>
                </View>
                {lessonsInfo.last && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Glyph name="clock" size={14} color={colors.mutedForeground} />
                    <Text style={{ fontSize: 13, color: colors.foreground }}>
                      Последнее: {formatLessonDate(lessonsInfo.last.date)}, {lessonsInfo.last.startTime}–{lessonsInfo.last.endTime}
                      {teacherLabel(lessonsInfo.last) ? ` · ${teacherLabel(lessonsInfo.last)}` : ""}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {lessonsInfo.next && (
              <View
                style={{
                  flexDirection: "row", alignItems: "center", gap: 9, marginTop: 12,
                  backgroundColor: colors.primary + "12", borderRadius: radii.sm, padding: 12,
                }}
              >
                <Glyph name="calendar" size={15} color={colors.primary} />
                <Text style={{ flex: 1, fontSize: 13, color: colors.foreground }}>
                  Следующее занятие: <Text style={{ fontWeight: "800" }}>
                    {formatLessonDate(lessonsInfo.next.date)}, {lessonsInfo.next.startTime}–{lessonsInfo.next.endTime}
                  </Text>
                  {teacherLabel(lessonsInfo.next) ? ` · ${teacherLabel(lessonsInfo.next)}` : ""}
                </Text>
              </View>
            )}

            {pastLessons.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <SectionLabel>Проведённые занятия</SectionLabel>
                {visibleLessons.map((lesson) => (
                  <View
                    key={lesson.bookingId}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 10,
                      paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border,
                    }}
                  >
                    <View
                      style={{
                        width: 36, height: 36, borderRadius: 10,
                        backgroundColor: colors.primary + "14",
                        alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <Glyph name="book" size={15} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>
                        {formatLessonDate(lesson.date)}
                      </Text>
                      {teacherLabel(lesson) ? (
                        <Text style={{ fontSize: 11, color: colors.mutedForeground, marginTop: 1 }}>
                          {teacherLabel(lesson)}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 12, fontWeight: "800", color: colors.foreground, fontVariant: ["tabular-nums"] }}>
                        {lesson.startTime}–{lesson.endTime}
                      </Text>
                      {lessonMinutes(lesson) > 0 && (
                        <Text style={{ fontSize: 11, color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>
                          {formatMinutes(lessonMinutes(lesson))}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}

                {pastLessons.length > 5 && (
                  <ExpandRow
                    colors={colors}
                    open={showAllLessons}
                    onPress={() => setShowAllLessons((v) => !v)}
                    label={showAllLessons ? "Свернуть" : `Показать все (${pastLessons.length})`}
                  />
                )}
              </View>
            )}
          </View>

          {/* ── Время в приложении ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Время в приложении</Text>
            <Text style={styles.sectionHint}>Сколько ребёнок реально занимался</Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              {[
                { label: "Сегодня", value: time?.todayMinutes ?? 0, color: accents.magenta },
                { label: "За неделю", value: time?.weekMinutes ?? 0, color: colors.primary },
                { label: "Всего", value: time?.totalMinutes ?? profile?.totalTimeMinutes ?? 0, color: accents.indigoDeep },
              ].map((item) => (
                <View
                  key={item.label}
                  style={{ flex: 1, backgroundColor: item.color + "12", borderRadius: radii.md - 4, padding: 12, alignItems: "center", gap: 2 }}
                >
                  <Text style={{ fontSize: 17, fontWeight: "900", color: item.color, fontVariant: ["tabular-nums"] }}>
                    {formatMinutes(item.value)}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{item.label}</Text>
                </View>
              ))}
            </View>

            <View style={{ marginTop: 16 }}>
              <WeekActivityChart days={derived.week} width={chartWidth} colors={colors} />
              <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center", marginTop: 4 }}>
                Активность за последние 7 дней
              </Text>
            </View>
          </View>

          {/* ── Флеш-карточки ── */}
          {fc && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Словарный запас</Text>
              <Text style={styles.sectionHint}>Работа с карточками слов</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                {[
                  { icon: "check" as GlyphName, color: colors.success, value: String(fc.totalLearned), label: "Выучено слов" },
                  { icon: "book" as GlyphName, color: colors.primary, value: String(fc.totalWords), label: "Слов в изучении" },
                  { icon: "repeat" as GlyphName, color: accents.magenta, value: String(fc.totalReviews), label: "Повторений" },
                  { icon: "target" as GlyphName, color: accents.amber, value: `${fc.accuracy}%`, label: "Точность" },
                ].map((item) => (
                  <View
                    key={item.label}
                    style={{ flex: 1, minWidth: "44%", backgroundColor: item.color + "12", borderRadius: radii.md - 4, padding: 12, alignItems: "center", gap: 4 }}
                  >
                    <Glyph name={item.icon} size={18} color={item.color} />
                    <Text style={{ fontSize: 21, fontWeight: "900", letterSpacing: -0.6, color: colors.foreground, fontVariant: ["tabular-nums"] }}>{item.value}</Text>
                    <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: "center" }}>{item.label}</Text>
                  </View>
                ))}
              </View>
              {fc.totalWords > 0 && (
                <View style={{ marginTop: 14 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Прогресс по словам</Text>
                    <Text style={{ fontSize: 12, fontWeight: "800", color: colors.foreground, fontVariant: ["tabular-nums"] }}>
                      {Math.round((fc.totalLearned / fc.totalWords) * 100)}%
                    </Text>
                  </View>
                  <View style={{ height: 10, backgroundColor: colors.muted, borderRadius: 5, overflow: "hidden" }}>
                    <View
                      style={{
                        height: 10,
                        width: `${Math.min(100, Math.round((fc.totalLearned / fc.totalWords) * 100))}%` as any,
                        backgroundColor: colors.success,
                        borderRadius: 5,
                      }}
                    />
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── История выполненных заданий ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              История заданий{(report?.submissions.length ?? 0) > 0 ? ` (${report?.submissions.length})` : ""}
            </Text>
            <Text style={styles.sectionHint}>Что ребёнок сдал и с каким результатом</Text>

            <View style={{ marginTop: 14 }}>
              {history.length === 0 ? (
                <Text style={styles.empty}>Ещё нет выполненных заданий</Text>
              ) : (
                history.map((sub) => {
                  const color = SCALE_COLORS[sub.type ?? ""] ?? colors.primary;
                  const sc = scoreColor(sub.score, colors);
                  return (
                    <View key={sub.submissionId} style={styles.historyRow}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <Glyph name={SCALE_ICONS[sub.type ?? ""] ?? "pen"} size={15} color={color} />
                        <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>
                          {sub.title ?? "Задание"}
                        </Text>
                        <Text style={{ fontSize: 16, fontWeight: "900", color: sc, fontVariant: ["tabular-nums"] }}>{sub.score}%</Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: color + "15" }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color }}>
                            {SCALE_LABELS[sub.type ?? ""] ?? sub.type ?? "Задание"}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>
                          {sub.correctCount}/{sub.totalQuestions} верно
                        </Text>
                        {sub.pointsEarned > 0 && (
                          <Text style={{ fontSize: 12, color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>
                            +{sub.pointsEarned} XP
                          </Text>
                        )}
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginLeft: "auto" as any, fontVariant: ["tabular-nums"] }}>
                          {new Date(sub.submittedAt).toLocaleDateString("ru-RU")}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {(report?.submissions.length ?? 0) > 6 && (
              <ExpandRow
                colors={colors}
                open={showAllHistory}
                onPress={() => setShowAllHistory((v) => !v)}
                label={showAllHistory ? "Свернуть" : `Показать все (${report?.submissions.length})`}
              />
            )}
          </View>

          {/* Ссылка на полный профиль ребёнка */}
          {activeChildId !== null && (
            <Pressable
              onPress={() => router.push(`/(main)/student/${activeChildId}` as any)}
              style={({ pressed }) => ({
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9,
                paddingVertical: 15, borderRadius: radii.md,
                borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Glyph name="user" size={16} color={colors.primary} />
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.primary }}>
                Открыть профиль ребёнка
              </Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

/** Счётчик в сетке ключевых цифр. */
function StatBox({
  styles, icon, tint, value, label,
}: {
  styles: any;
  icon: GlyphName;
  tint: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={{
        width: 32, height: 32, borderRadius: 10,
        backgroundColor: tint + "1f",
        alignItems: "center", justifyContent: "center",
      }}>
        <Glyph name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Строка «Показать все / Свернуть» со стрелкой, которая поворачивается. */
function ExpandRow({
  colors, open, onPress, label,
}: {
  colors: any;
  open: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", justifyContent: "center",
        gap: 7, paddingVertical: 11, opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontSize: 14, fontWeight: "800", color: colors.primary }}>{label}</Text>
      {/* chevron вниз — свёрнуто, вверх — раскрыто. */}
      <View style={{ transform: [{ rotate: open ? "-90deg" : "90deg" }] }}>
        <Glyph name="chevron" size={16} color={colors.primary} />
      </View>
    </Pressable>
  );
}
