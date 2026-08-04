// Экран «Анализ» — учительский. По каждому ученику показывает средний балл,
// разбор по видам заданий и, главное, готовые рекомендации: что не так и что
// с этим делать.
//
// Раньше экран выдавал только проценты: пять полос на ученика, вывод учитель
// делал сам. Теперь тот же набор цифр проходит через набор правил
// (utils/insights.ts) и превращается в короткие фразы. Правила, а не языковая
// модель: считается мгновенно и локально, вывод воспроизводим и проверяем по
// цифрам, которые лежат рядом на том же экране.
//
// Данные живые: перезапрос при каждом открытии вкладки, по свайпу вниз и раз в
// 30 секунд, пока экран открыт. Рекомендации пересчитываются вместе с ними.
//
// Оформление сдержаннее ученических экранов: те же плитки с цветной тенью,
// но без наклонов и игровых эффектов. Эмодзи не используются — значки видов
// заданий рисует TypeArt, остальные иконки берутся из своего набора глифов.
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Platform, RefreshControl,
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

/** Как часто обновляются данные, пока экран открыт. */
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData("refresh")} />}
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

                {/* Рекомендации идут ДО графика: сначала вывод, потом цифры,
                    на которых он основан. Обратный порядок заставлял учителя
                    каждый раз делать вывод самому. */}
                {insightsList.map((ins, i) => renderInsight(ins, `${student.id}-${i}`))}

                {insightsList.length > 0 && <View style={{ height: 4 }} />}
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
