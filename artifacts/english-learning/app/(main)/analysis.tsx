// Экран «Анализ» — учительский. По каждому ученику показывает средний балл,
// разбор по видам заданий и, главное, готовые рекомендации: что не так и что
// с этим делать.
//
// ── ДВА СЛОЯ ВЫВОДОВ, И ЭТО НАМЕРЕННО ────────────────────────────────────────
// 1. Правила (utils/insights.ts). Считаются мгновенно и локально, без ключей и
//    сети, вывод воспроизводим и проверяем по цифрам рядом. Видят только цифры:
//    «аудирование просело», «работа ждёт проверки».
// 2. Нейросеть (GET /api/analysis/ai). Читает САМИ ОШИБКИ — неверные ответы и
//    формулировки ошибок из диалогов — и говорит, какая тема провалена и что
//    задать на этой неделе. Правилом такое не опишешь: для этого надо читать
//    ответы, а не проценты.
//
// Первый слой всегда на месте, даже когда модель недоступна. Второй стоит
// сверху и подписан, чтобы учитель знал, чей это вывод.
//
// Разбор от модели ПЛАТНЫЙ и медленный, поэтому сервер держит его в кэше и
// пересчитывает, только когда данные изменились (или по кнопке «Обновить»).
// Экран запрашивает его при открытии и по свайпу, но НЕ по таймеру.
//
// Данные цифр живые: перезапрос при каждом открытии вкладки, по свайпу вниз и
// раз в 30 секунд, пока экран открыт.
//
// Оформление сдержаннее ученических экранов: те же плитки с цветной тенью,
// но без наклонов и игровых эффектов. Эмодзи не используются — значки видов
// заданий рисует TypeArt, остальные иконки берутся из своего набора глифов.
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Pressable, Platform, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useColors } from "@/hooks/useColors";
import authStorage from "@/utils/authStorage";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { TypeArt } from "@/components/ui/TypeArt";
import { Pill, SectionLabel } from "@/components/ui/GameKit";
import { accents, radii } from "@/constants/theme";
import { formatDue } from "@/utils/dueDate";
import {
  studentInsights, classSummary, overallScore, typeLabel,
  type CategoryStat, type Insight, type InsightTone,
} from "@/utils/insights";

const BASE = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token ?? ""}` },
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);
  return data;
}

const TYPE_COLORS: Record<string, string> = {
  text_test: "#8b5cf6", audio: "#6366f1", reading: "#d946ef", video: "#ec4899", free_form: "#f59e0b",
};
const TYPE_LABELS: Record<string, string> = {
  text_test: "Тест", audio: "Аудирование", reading: "Чтение", video: "Видео", free_form: "Свободный ответ",
};

/** Значок рекомендации по тону. */
const TONE_ICONS: Record<InsightTone, GlyphName> = {
  urgent: "alert",
  attention: "target",
  good: "spark",
  info: "help",
};

/** Как часто обновляются цифры, пока экран открыт. Разбора это не касается. */
const POLL_MS = 30_000;

type Student = {
  id: number; name: string; surname?: string | null; username: string; avatarEmoji: string | null;
  avatarColor: string | null; avatarUrl?: string | null; knowledgeLevel: string | null;
};
type StudentWithStats = Student & {
  stats: CategoryStat[];
  loading: boolean;
  /** Просроченные назначения этого ученика: считается по teacher-results. */
  overdue: number;
};

/** Разбор от модели: сводка по классу, общие советы и советы по ученикам. */
type AiAdvice = { studentId: number; name: string; verdict: string; advice: string[] };
type AiReport = { summary: string; focus: string[]; students: AiAdvice[] };
type AiState = {
  report: AiReport | null;
  loading: boolean;
  /** Почему разбора нет. Пусто — всё в порядке. */
  problem: string;
  generatedAt: string | null;
  /** Показан прошлый разбор: свежий не собрался. */
  stale: boolean;
};

/** Цвет балла в фирменной гамме: зелёного в палитре нет намеренно. */
function scoreColor(score: number, colors: any): string {
  if (score >= 70) return colors.success;
  if (score >= 50) return accents.amber;
  return colors.destructive;
}

export default function AnalysisScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [students, setStudents] = useState<StudentWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [ai, setAi] = useState<AiState>({
    report: null, loading: true, problem: "", generatedAt: null, stale: false,
  });

  /**
   * Разбор от модели. force — кнопка «Обновить разбор»: пересобрать сейчас,
   * не дожидаясь, пока изменятся данные.
   *
   * По таймеру НЕ вызывается: это запрос к платной модели, и опрашивать её
   * каждые полминуты нельзя. Сервер к тому же держит кэш и на неизменных
   * данных вернёт прежний разбор.
   */
  const loadAi = useCallback(async (force = false) => {
    setAi((prev) => ({ ...prev, loading: true, problem: "" }));
    try {
      const data = await apiFetch(`/api/analysis/ai${force ? "?force=1" : ""}`);
      if (data?.ok) {
        setAi({
          report: data.report ?? null,
          loading: false,
          problem: "",
          generatedAt: data.generatedAt ?? null,
          stale: data.stale === true,
        });
      } else {
        setAi({
          report: null,
          loading: false,
          problem: data?.detail ?? "Разбор недоступен",
          generatedAt: null,
          stale: false,
        });
      }
    } catch (e: any) {
      setAi({
        report: null,
        loading: false,
        problem: e?.message ?? "Разбор не загрузился",
        generatedAt: null,
        stale: false,
      });
    }
  }, []);

  /**
   * silent — фоновое обновление по таймеру: без спиннера и без сброса списка,
   * иначе экран мигал бы каждые полминуты прямо под руками у учителя.
   */
  const loadData = useCallback(async (mode: "initial" | "refresh" | "silent" = "initial") => {
    if (mode === "refresh") setRefreshing(true);
    else if (mode === "initial") setIsLoading(true);

    try {
      const raw: Student[] = await apiFetch("/api/connections/teacher/students");

      // Просроченные задания берём из общего списка результатов: он уже
      // содержит dueAt и признак сдачи, отдельный запрос не нужен.
      let overdueBy = new Map<number, number>();
      try {
        const results: any[] = await apiFetch("/api/assignments/teacher-results");
        overdueBy = results.reduce((acc: Map<number, number>, r: any) => {
          if (r.submission) return acc;
          if (formatDue(r.dueAt).urgency !== "overdue") return acc;
          acc.set(r.studentId, (acc.get(r.studentId) ?? 0) + 1);
          return acc;
        }, new Map<number, number>());
      } catch {
        // Без этих данных рекомендации просто не упомянут просрочки.
      }

      if (mode !== "silent") {
        setStudents(raw.map((s) => ({ ...s, stats: [], loading: true, overdue: overdueBy.get(s.id) ?? 0 })));
        setIsLoading(false);
      }

      // Статистика по каждому ученику — параллельно, экран не ждёт самого
      // медленного запроса последовательно.
      const updated: StudentWithStats[] = await Promise.all(
        raw.map(async (s) => {
          try {
            const stats: CategoryStat[] = await apiFetch(`/api/students/${s.id}/category-stats`);
            return { ...s, stats: stats ?? [], loading: false, overdue: overdueBy.get(s.id) ?? 0 };
          } catch {
            return { ...s, stats: [], loading: false, overdue: overdueBy.get(s.id) ?? 0 };
          }
        })
      );
      setStudents(updated);
      setUpdatedAt(new Date());
    } catch {
      if (mode !== "silent") setIsLoading(false);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData("initial"); }, [loadData]);
  useEffect(() => { loadAi(false); }, [loadAi]);
  useFocusEffect(useCallback(() => { loadData("silent"); }, [loadData]));

  // Автообновление, пока экран открыт: учитель проверяет работы в соседней
  // вкладке и возвращается сюда — цифры и советы должны быть уже свежими.
  const loadRef = useRef(loadData);
  loadRef.current = loadData;
  useEffect(() => {
    const timer = setInterval(() => { loadRef.current("silent"); }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  // Мгновенное обновление при возврате во вкладку браузера.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") loadRef.current("silent");
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const summary = classSummary(
    students.map((s) => ({ stats: s.stats, signals: { overdue: s.overdue } })),
  );

  /** Совет модели по конкретному ученику. */
  const aiFor = (id: number): AiAdvice | undefined =>
    ai.report?.students.find((s) => s.studentId === id);

  // Сортировка «кому нужна помощь»: сначала те, у кого есть срочное (работы на
  // проверке, просрочки), затем по возрастанию среднего балла, в конце — те,
  // у кого работ ещё нет. Порядок с сервера — порядок добавления, он бесполезен.
  const ordered = [...students].sort((a, b) => {
    const urgentA = a.overdue > 0 || a.stats.some((s) => (s.pending ?? 0) > 0) ? 1 : 0;
    const urgentB = b.overdue > 0 || b.stats.some((s) => (s.pending ?? 0) > 0) ? 1 : 0;
    if (urgentA !== urgentB) return urgentB - urgentA;
    const scoreA = overallScore(a.stats);
    const scoreB = overallScore(b.stats);
    if (scoreA === null && scoreB === null) return 0;
    if (scoreA === null) return 1;
    if (scoreB === null) return -1;
    return scoreA - scoreB;
  });

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 16,
    },
    title: { fontSize: 28, fontWeight: "900", letterSpacing: -0.6, color: colors.foreground },
    subtitle: { fontSize: 14, color: colors.mutedForeground, marginTop: 3, lineHeight: 20 },
    scroll: { paddingHorizontal: 20, paddingBottom: insets.bottom + 90 },
    // Лента из трёх чисел одной поверхностью: три отдельные карточки-близнеца
    // выглядели как список, хотя это одна мысль — состояние класса.
    strip: {
      flexDirection: "row", backgroundColor: colors.card,
      borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
      overflow: "hidden", marginBottom: 14,
      shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.13, shadowRadius: 15, elevation: 3,
    },
    stripCell: { flex: 1, paddingVertical: 13, paddingHorizontal: 8, alignItems: "center" },
    stripDivider: { width: 1, backgroundColor: colors.border },
    stripNum: { fontSize: 21, fontWeight: "900", letterSpacing: -0.5, fontVariant: ["tabular-nums"], color: colors.foreground },
    stripLabel: {
      fontSize: 10, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase",
      color: colors.mutedForeground, marginTop: 6,
    },
    // Цветная тень вместо серой: на светло-фиолетовом фоне серая читается грязью.
    card: {
      backgroundColor: colors.card, borderRadius: radii.lg - 4, padding: 18,
      marginBottom: 16, borderWidth: 1, borderColor: colors.border,
      shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.14, shadowRadius: 16, elevation: 4,
    },
    studentRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
    name: { fontSize: 16, fontWeight: "800", color: colors.foreground },
    sub: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
    bigScore: { fontSize: 26, fontWeight: "900", letterSpacing: -1, fontVariant: ["tabular-nums"] },
    bigLabel: {
      fontSize: 9.5, fontWeight: "800", letterSpacing: 0.9, textTransform: "uppercase",
      color: colors.mutedForeground, marginTop: 3,
    },
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 14, paddingBottom: 80, paddingHorizontal: 32 },
    empty: { fontSize: 15, color: colors.mutedForeground, textAlign: "center", lineHeight: 21 },
    divider: { height: 1, backgroundColor: colors.border, marginBottom: 14 },
    // Разбор модели: отдельная поверхность в цвете бренда. Он должен читаться
    // как чужой голос, а не как ещё одна наша плашка.
    aiCard: {
      backgroundColor: colors.primary + "0d",
      borderRadius: radii.md, borderWidth: 1, borderColor: colors.primary + "33",
      padding: 15, marginBottom: 16,
    },
    aiHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    aiTitle: { flex: 1, fontSize: 15, fontWeight: "900", color: colors.foreground },
    aiText: { fontSize: 13.5, lineHeight: 21, color: colors.foreground },
    aiBullet: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 9 },
    aiBulletText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.foreground },
    aiFoot: { fontSize: 11, color: colors.mutedForeground, marginTop: 12, fontVariant: ["tabular-nums"] },
  });

  /** Тон рекомендации → цвет. Красный только для срочного. */
  const toneColor = (tone: InsightTone) =>
    tone === "urgent" ? colors.destructive
      : tone === "attention" ? accents.amber
        : tone === "good" ? colors.success
          : colors.primary;

  /**
   * Карточка рекомендации: значок, фраза и действие второй строкой.
   * Заливка слабая, рамка в цвет тона — сплошной цветной блок в списке из
   * трёх советов давит и мешает читать сами цифры.
   */
  const renderInsight = (ins: Insight, key: string | number) => {
    const tint = toneColor(ins.tone);
    return (
      <View
        key={key}
        style={{
          flexDirection: "row", alignItems: "flex-start", gap: 10,
          backgroundColor: tint + "0f", borderWidth: 1, borderColor: tint + "33",
          borderRadius: radii.sm + 2, padding: 12, marginBottom: 8,
        }}
      >
        <View style={{ marginTop: 1 }}>
          <Glyph name={TONE_ICONS[ins.tone]} size={16} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.foreground, lineHeight: 19 }}>
            {ins.text}
          </Text>
          {!!ins.action && (
            <Text style={{ fontSize: 12.5, color: colors.mutedForeground, marginTop: 3, lineHeight: 18 }}>
              {ins.action}
            </Text>
          )}
        </View>
      </View>
    );
  };

  /** Разбор по видам заданий. Значок тот же, что на экране «Задания». */
  const renderBreakdown = (stats: CategoryStat[]) => {
    if (stats.length === 0) return (
      <View style={{ alignItems: "center", paddingVertical: 16, gap: 9 }}>
        <Glyph name="tray" size={26} color={colors.mutedForeground} />
        <Text style={{ fontSize: 13, color: colors.mutedForeground, textAlign: "center" }}>
          Нет данных — ученик ещё не выполнял заданий
        </Text>
      </View>
    );

    return (
      <View style={{ gap: 11 }}>
        {stats.map((stat) => {
          const color = TYPE_COLORS[stat.type] ?? colors.primary;
          const pct = stat.avgScore ?? 0;
          const hasData = stat.count > 0 && stat.avgScore !== null;
          const pending = stat.pending ?? 0;
          return (
            <View key={stat.type}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                  <TypeArt type={stat.type} size={24} />
                  <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.foreground }}>
                    {TYPE_LABELS[stat.type] ?? stat.type}
                  </Text>
                  {hasData && (
                    <Text style={{ fontSize: 11, color: colors.mutedForeground, fontVariant: ["tabular-nums"] }}>
                      · {stat.count}
                    </Text>
                  )}
                  {/* Работы на проверке видно прямо в строке: цифра рядом
                      объясняет, почему средний балл выглядит неполным. */}
                  {pending > 0 && <Pill text={`${pending} на проверке`} tone="warn" />}
                </View>
                {hasData ? (
                  <Text style={{ fontSize: 13.5, fontWeight: "900", color, fontVariant: ["tabular-nums"] }}>{pct}%</Text>
                ) : (
                  <Text style={{ fontSize: 12, color: colors.mutedForeground }}>нет данных</Text>
                )}
              </View>
              <View style={{ height: 8, backgroundColor: colors.muted, borderRadius: 4, overflow: "hidden" }}>
                {hasData && (
                  <View style={{ height: 8, width: `${pct}%` as any, backgroundColor: color, borderRadius: 4 }} />
                )}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  /** Разбор от модели по классу: сводка и что делать на этой неделе. */
  const renderAiBlock = () => {
    if (ai.loading && !ai.report) {
      return (
        <View style={styles.aiCard}>
          <View style={styles.aiHead}>
            <Glyph name="spark" size={17} color={colors.primary} />
            <Text style={styles.aiTitle}>Разбор от нейросети</Text>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.mutedForeground }}>
            Читает работы и ошибки учеников. Это занимает несколько секунд.
          </Text>
        </View>
      );
    }

    if (!ai.report) {
      // Разбора нет — это не поломка экрана: рекомендации по правилам ниже
      // работают всегда. Поэтому тихая плашка, а не красная ошибка.
      return (
        <View style={styles.aiCard}>
          <View style={styles.aiHead}>
            <Glyph name="spark" size={17} color={colors.mutedForeground} />
            <Text style={[styles.aiTitle, { color: colors.mutedForeground }]}>Разбор от нейросети</Text>
            <Pressable onPress={() => loadAi(true)} hitSlop={8} accessibilityLabel="Повторить">
              <Glyph name="repeat" size={16} color={colors.primary} />
            </Pressable>
          </View>
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.mutedForeground }}>
            {ai.problem || "Пока недоступен"}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.aiCard}>
        <View style={styles.aiHead}>
          <Glyph name="spark" size={17} color={colors.primary} />
          <Text style={styles.aiTitle}>Разбор от нейросети</Text>
          {ai.loading
            ? <ActivityIndicator size="small" color={colors.primary} />
            : (
              <Pressable onPress={() => loadAi(true)} hitSlop={8} accessibilityLabel="Обновить разбор">
                <Glyph name="repeat" size={16} color={colors.primary} />
              </Pressable>
            )}
        </View>

        {!!ai.report.summary && <Text style={styles.aiText}>{ai.report.summary}</Text>}

        {ai.report.focus.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Text style={{
              fontSize: 11, fontWeight: "800", letterSpacing: 1,
              textTransform: "uppercase", color: colors.mutedForeground,
            }}>
              Что делать на этой неделе
            </Text>
            {ai.report.focus.map((line, i) => (
              <View key={`focus-${i}`} style={styles.aiBullet}>
                <View style={{ marginTop: 2 }}>
                  <Glyph name="target" size={14} color={colors.primary} />
                </View>
                <Text style={styles.aiBulletText}>{line}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.aiFoot}>
          {ai.stale
            ? "Показан прошлый разбор: свежий собрать не удалось"
            : "Собран по всем результатам и ошибкам. Обновляется, когда появляются новые работы"}
        </Text>
      </View>
    );
  };

  /** Совет модели внутри карточки ученика. */
  const renderAiAdvice = (advice: AiAdvice) => (
    <View style={{
      backgroundColor: colors.primary + "0d",
      borderRadius: radii.sm + 2, borderWidth: 1, borderColor: colors.primary + "33",
      padding: 12, marginBottom: 8,
    }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ marginTop: 1 }}>
          <Glyph name="spark" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          {!!advice.verdict && (
            <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.foreground, lineHeight: 19 }}>
              {advice.verdict}
            </Text>
          )}
          {advice.advice.map((line, i) => (
            <Text
              key={`adv-${i}`}
              style={{ fontSize: 12.5, lineHeight: 18, color: colors.mutedForeground, marginTop: 4 }}
            >
              {`• ${line}`}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );

  if (isLoading) return (
    <View style={[styles.container, styles.center]}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Анализ</Text>
        <Text style={styles.subtitle}>
          {summary.average === null
            ? "Работ пока нет — как только ученики начнут сдавать, здесь появятся рекомендации"
            : summary.weakest
              ? `Класс держит ${summary.average}%. Слабее всего идёт ${typeLabel(summary.weakest.type)}: ${summary.weakest.score}%.`
              : `Класс держит ${summary.average}%.`}
        </Text>
      </View>

      {students.length === 0 ? (
        <View style={styles.center}>
          <Glyph name="chart" size={48} color={colors.mutedForeground} />
          <Text style={styles.empty}>
            Нет принятых учеников.{"\n"}Добавьте учеников на вкладке «Ученики».
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { loadData("refresh"); loadAi(false); }}
            />
          }
        >
          {/* Состояние класса тремя числами */}
          <View style={styles.strip}>
            <View style={styles.stripCell}>
              <Text style={[styles.stripNum, summary.average !== null && { color: scoreColor(summary.average, colors) }]}>
                {summary.average === null ? "—" : `${summary.average}%`}
              </Text>
              <Text style={styles.stripLabel}>Класс</Text>
            </View>
            <View style={styles.stripDivider} />
            <View style={styles.stripCell}>
              <Text style={[styles.stripNum, summary.behind > 0 && { color: colors.destructive }]}>
                {summary.behind}
              </Text>
              <Text style={styles.stripLabel}>Отстают</Text>
            </View>
            <View style={styles.stripDivider} />
            <View style={styles.stripCell}>
              <Text style={[styles.stripNum, summary.pending > 0 && { color: accents.amber }]}>
                {summary.pending}
              </Text>
              <Text style={styles.stripLabel}>На проверке</Text>
            </View>
          </View>

          {/* Разбор от модели идёт первым: он объясняет причину, а плашки ниже
              говорят, что горит прямо сейчас. */}
          {renderAiBlock()}

          {/* Рекомендации по классу целиком */}
          {summary.insights.length > 0 && (
            <>
              <SectionLabel>Что сделать сейчас</SectionLabel>
              {summary.insights.map((ins, i) => renderInsight(ins, `class-${i}`))}
            </>
          )}

          <SectionLabel style={{ marginTop: 18 }}>
            По ученикам · {ordered.length}
          </SectionLabel>

          {ordered.map((student) => {
            const overall = overallScore(student.stats);
            const insightsList = student.loading
              ? []
              : studentInsights(student.stats, { overdue: student.overdue });
            const advice = aiFor(student.id);
            return (
              <View key={student.id} style={styles.card}>
                {/* Шапка карточки — переход в профиль ученика */}
                <TouchableOpacity
                  style={styles.studentRow}
                  onPress={() => router.push(`/(main)/student/${student.id}` as any)}
                  activeOpacity={0.7}
                >
                  <AnimatedAvatar
                    size={48}
                    avatarColor={student.avatarColor ?? "#6366f1"}
                    avatarEmoji={student.avatarEmoji}
                    avatarUrl={student.avatarUrl}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {student.username}{student.name || student.surname ? ` (${[student.name, student.surname].filter(Boolean).join(" ")})` : ""}
                    </Text>
                    {student.knowledgeLevel ? (
                      <Text style={styles.sub}>{student.knowledgeLevel}</Text>
                    ) : null}
                  </View>
                  {/* Средний балл крупно: главный ориентир, к кому идти первым. */}
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.bigScore, { color: overall === null ? colors.mutedForeground : scoreColor(overall, colors) }]}>
                      {overall === null ? "—" : `${overall}%`}
                    </Text>
                    <Text style={styles.bigLabel}>средний</Text>
                  </View>
                  <Glyph name="chevron" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>

                {/* Сначала разбор модели: он про причину ошибок. Ниже правила —
                    они про срочное: проверить работу, напомнить о просрочке. */}
                {!!advice && renderAiAdvice(advice)}

                {insightsList.map((ins, i) => renderInsight(ins, `${student.id}-${i}`))}

                {(insightsList.length > 0 || !!advice) && <View style={{ height: 4 }} />}
                <View style={styles.divider} />

                {student.loading ? (
                  <ActivityIndicator color={colors.primary} size="small" style={{ paddingVertical: 16 }} />
                ) : (
                  renderBreakdown(student.stats)
                )}
              </View>
            );
          })}

          {/* Время обновления: видно, что цифры живые, а не с прошлой недели. */}
          {updatedAt && (
            <Text style={{
              fontSize: 11, color: colors.mutedForeground, textAlign: "center",
              marginTop: 4, fontVariant: ["tabular-nums"],
            }}>
              Обновлено в {String(updatedAt.getHours()).padStart(2, "0")}:{String(updatedAt.getMinutes()).padStart(2, "0")}
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}
