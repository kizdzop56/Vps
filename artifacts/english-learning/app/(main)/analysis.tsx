// Вкладка «Анализ» у учителя: по каждому ученику — актуальное состояние учёбы и
// короткий список того, на что смотреть на следующем уроке.
//
// Раньше здесь были четыре полоски со средним баллом за всё время. По ним нельзя
// готовиться к уроку: непонятно, свежие ли данные, растёт ученик или падает, что
// с лексикой и какие ошибки повторяются. Теперь карточка собирается из данных
// /api/students/:id/analysis, а приоритеты считает сервер (правила — в
// artifacts/api-server/src/lib/studentAnalysis.ts).
//
// Подсказки «i» рядом с блоками объясняют нюансы: какие работы попадают в
// процент, как считается динамика, чем «просрочено» отличается от дедлайна.
import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  TouchableOpacity, Platform, RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import authStorage from "@/utils/authStorage";
import { AnimatedAvatar } from "@/components/AnimatedAvatar";
import { InfoHint, ANALYSIS_HINTS } from "@/components/InfoHint";
import {
  fetchStudentAnalysis,
  FRESHNESS_STYLE,
  MIN_SKILL_SAMPLE,
  SEVERITY_STYLE,
  SKILL_COLORS,
  SKILL_ICONS,
  SKILL_LABELS,
  formatMinutes,
  plural,
  relativeDays,
  type SkillStat,
  type StudentAnalysis,
} from "@/hooks/useStudentAnalysis";

const BASE = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

type TeacherStudent = {
  id: number;
  name: string;
  surname?: string | null;
  username: string;
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarUrl?: string | null;
  knowledgeLevel: string | null;
};

async function fetchTeacherStudents(): Promise<TeacherStudent[]> {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE}/api/connections/teacher/students`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token ?? ""}` },
  });
  if (res.status === 204) return [];
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Ошибка ${res.status}`);
  return data as TeacherStudent[];
}

function displayName(s: { username: string; name?: string | null; surname?: string | null }): string {
  const full = [s.name, s.surname].filter(Boolean).join(" ");
  return full ? `${s.username} (${full})` : s.username;
}

// ── Мелкие блоки ────────────────────────────────────────────────────────────

/** Плашка «насколько свежие данные» — первое, что должен увидеть учитель. */
function FreshnessBadge({ analysis }: { analysis: StudentAnalysis }) {
  const style = FRESHNESS_STYLE[analysis.freshness];
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 5,
      backgroundColor: style.bg, borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 4,
    }}>
      <Feather name={style.icon as any} size={11} color={style.color} />
      <Text style={{ fontSize: 11, fontWeight: "800", color: style.color }}>{style.label}</Text>
    </View>
  );
}

/** Пункт фокуса: цветная плашка с заголовком и пояснением «что делать». */
function FocusRow({ item, colors }: { item: StudentAnalysis["focus"][number]; colors: any }) {
  const style = SEVERITY_STYLE[item.severity];
  return (
    <View style={{
      flexDirection: "row", gap: 10,
      backgroundColor: style.bg, borderRadius: 12,
      padding: 12, borderLeftWidth: 3, borderLeftColor: style.color,
    }}>
      <Feather name={item.icon as any} size={16} color={style.color} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontWeight: "800", color: "#1e293b", marginBottom: 3 }}>
          {item.title}
        </Text>
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: "#475569" }}>
          {item.detail}
        </Text>
      </View>
    </View>
  );
}

/** Заголовок блока внутри карточки + подсказка. */
function BlockTitle({
  title, colors, hint,
}: { title: string; colors: any; hint: { title: string; summary: string; points: readonly string[] } }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10 }}>
      <Text style={{ fontSize: 12, fontWeight: "800", color: colors.mutedForeground, letterSpacing: 0.4, textTransform: "uppercase" }}>
        {title}
      </Text>
      <InfoHint title={hint.title} summary={hint.summary} points={[...hint.points]} size={16} />
    </View>
  );
}

/** Стрелка динамики: важен не балл, а направление. */
function TrendChip({ skill }: { skill: SkillStat }) {
  if (skill.trend === "up" || skill.trend === "down") {
    const up = skill.trend === "up";
    const color = up ? "#16a34a" : "#dc2626";
    const delta = Math.abs(Math.round(skill.delta ?? 0));
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
        <Feather name={up ? "arrow-up-right" : "arrow-down-right"} size={11} color={color} />
        <Text style={{ fontSize: 11, fontWeight: "800", color }}>{delta}%</Text>
      </View>
    );
  }
  return null;
}

function SkillsBlock({ skills, colors }: { skills: SkillStat[]; colors: any }) {
  const withData = skills.filter((s) => s.count > 0);
  if (withData.length === 0) {
    return (
      <Text style={{ fontSize: 12.5, color: colors.mutedForeground, paddingVertical: 6 }}>
        Проверенных работ пока нет — навыки появятся после первой проверки.
      </Text>
    );
  }

  return (
    <View style={{ gap: 11 }}>
      {withData.map((skill) => {
        const color = SKILL_COLORS[skill.type];
        const pct = skill.avgScore ?? 0;
        const lowSample = skill.count < MIN_SKILL_SAMPLE;
        return (
          <View key={skill.type}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 6 }}>
              <Feather name={SKILL_ICONS[skill.type] as any} size={12} color={color} />
              <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.foreground }}>
                {SKILL_LABELS[skill.type]}
              </Text>
              {lowSample ? (
                <Text style={{ fontSize: 10.5, color: colors.mutedForeground }}>мало данных</Text>
              ) : null}
              <View style={{ flex: 1 }} />
              <TrendChip skill={skill} />
              <Text style={{ fontSize: 13, fontWeight: "900", color, minWidth: 38, textAlign: "right" }}>
                {pct}%
              </Text>
            </View>
            <View style={{ height: 7, backgroundColor: colors.muted, borderRadius: 4, overflow: "hidden" }}>
              <View style={{
                height: 7, width: `${Math.min(100, pct)}%` as any,
                backgroundColor: lowSample ? color + "70" : color, borderRadius: 4,
              }} />
            </View>
            <Text style={{ fontSize: 10.5, color: colors.mutedForeground, marginTop: 3 }}>
              {skill.count} {plural(skill.count, "работа", "работы", "работ")}
              {skill.recentAvg !== null && skill.prevAvg !== null
                ? ` · последние ${skill.recentAvg}% против ${skill.prevAvg}%`
                : ""}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Числовая плитка: значение + подпись. */
function Stat({ value, label, color, colors }: { value: string; label: string; color?: string; colors: any }) {
  return (
    <View style={{ flex: 1, minWidth: 74 }}>
      <Text style={{ fontSize: 18, fontWeight: "900", color: color ?? colors.foreground }}>{value}</Text>
      <Text style={{ fontSize: 10.5, color: colors.mutedForeground, marginTop: 1 }}>{label}</Text>
    </View>
  );
}

function VocabularyBlock({ vocab, colors }: { vocab: StudentAnalysis["vocabulary"]; colors: any }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 10 }}>
        <Stat value={String(vocab.learned)} label="выучено" color="#16a34a" colors={colors} />
        <Stat
          value={String(vocab.dueNow)}
          label="просрочено"
          color={vocab.dueNow > 0 ? "#ea580c" : undefined}
          colors={colors}
        />
        <Stat
          value={String(vocab.lapsed)}
          label="забыто"
          color={vocab.lapsed > 0 ? "#dc2626" : undefined}
          colors={colors}
        />
        <Stat
          value={vocab.accuracy === null ? "—" : `${vocab.accuracy}%`}
          label="точность"
          colors={colors}
        />
      </View>

      <Text style={{ fontSize: 11.5, color: colors.mutedForeground }}>
        За неделю: {vocab.learnedLast7} новых {plural(vocab.learnedLast7, "слово", "слова", "слов")},
        {" "}{vocab.reviewsLast7} {plural(vocab.reviewsLast7, "повторение", "повторения", "повторений")}
      </Text>

      {vocab.decks.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: colors.mutedForeground }}>
            ВЫДАННЫЕ КОЛОДЫ
          </Text>
          {vocab.decks.map((deck) => {
            const pct = deck.total > 0 ? Math.round((deck.learned / deck.total) * 100) : 0;
            return (
              <View key={deck.deckId} style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 13 }}>{deck.emoji ?? "📘"}</Text>
                  <Text style={{ flex: 1, fontSize: 12.5, fontWeight: "700", color: colors.foreground }} numberOfLines={1}>
                    {deck.title}
                  </Text>
                  {deck.assignedByMe ? (
                    <View style={{ backgroundColor: colors.primary + "16", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 9.5, fontWeight: "800", color: colors.primary }}>от вас</Text>
                    </View>
                  ) : null}
                  <Text style={{ fontSize: 11.5, fontWeight: "800", color: colors.mutedForeground }}>
                    {deck.learned}/{deck.total}
                  </Text>
                </View>
                <View style={{ height: 5, backgroundColor: colors.muted, borderRadius: 3, overflow: "hidden" }}>
                  <View style={{ height: 5, width: `${pct}%` as any, backgroundColor: colors.primary, borderRadius: 3 }} />
                </View>
                {deck.due > 0 ? (
                  <Text style={{ fontSize: 10.5, color: "#ea580c" }}>
                    {deck.due} {plural(deck.due, "карточка", "карточки", "карточек")} ждёт повторения
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function AssignmentsBlock({ data, colors }: { data: StudentAnalysis["assignments"]; colors: any }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 10 }}>
        <Stat value={String(data.total)} label="выдано" colors={colors} />
        <Stat
          value={String(data.awaitingReview)}
          label="ждут проверки"
          color={data.awaitingReview > 0 ? "#dc2626" : undefined}
          colors={colors}
        />
        <Stat
          value={String(data.notStarted)}
          label="не начато"
          color={data.notStarted > 0 ? "#ea580c" : undefined}
          colors={colors}
        />
        <Stat
          value={data.avgScoreLast14 === null ? "—" : `${data.avgScoreLast14}%`}
          label="балл за 2 недели"
          colors={colors}
        />
      </View>
      {data.notStarted > 0 && data.oldestNotStartedDays !== null ? (
        <Text style={{ fontSize: 11.5, color: colors.mutedForeground }}>
          Самое старое неначатое выдано {data.oldestNotStartedDays}{" "}
          {plural(data.oldestNotStartedDays, "день", "дня", "дней")} назад
        </Text>
      ) : null}
    </View>
  );
}

function MistakesBlock({ mistakes, colors }: { mistakes: StudentAnalysis["mistakes"]; colors: any }) {
  if (mistakes.length === 0) {
    return (
      <Text style={{ fontSize: 12.5, color: colors.mutedForeground }}>
        Повторяющихся ошибок нет — в проверенных работах промахи не совпадают.
      </Text>
    );
  }
  return (
    <View style={{ gap: 9 }}>
      {mistakes.map((m, i) => (
        <View key={i} style={{
          backgroundColor: colors.muted, borderRadius: 10, padding: 10, gap: 3,
        }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
            <Text style={{ flex: 1, fontSize: 12.5, fontWeight: "700", color: colors.foreground, lineHeight: 18 }}>
              {m.questionText}
            </Text>
            {m.count > 1 ? (
              <View style={{ backgroundColor: "#fee2e2", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: "900", color: "#dc2626" }}>×{m.count}</Text>
              </View>
            ) : null}
          </View>
          {m.correctAnswer ? (
            <Text style={{ fontSize: 11.5, color: colors.mutedForeground }}>
              Верно: <Text style={{ color: "#16a34a", fontWeight: "700" }}>{m.correctAnswer}</Text>
              {m.lastStudentAnswer ? (
                <>
                  {"  ·  "}Ответил: <Text style={{ color: "#dc2626", fontWeight: "700" }}>{m.lastStudentAnswer}</Text>
                </>
              ) : null}
            </Text>
          ) : null}
          {m.assignmentTitle ? (
            <Text style={{ fontSize: 10.5, color: colors.mutedForeground }}>{m.assignmentTitle}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ── Карточка ученика ────────────────────────────────────────────────────────

function StudentCard({ student, colors }: { student: TeacherStudent; colors: any }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  // Каждый ученик грузится своим запросом: список появляется сразу, карточки
  // дозаполняются по мере ответа, а react-query кеширует результат между
  // переходами по вкладкам.
  const q = useQuery({
    queryKey: ["student-analysis", student.id],
    queryFn: () => fetchStudentAnalysis(student.id),
    staleTime: 60_000,
  });

  const analysis = q.data;

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.card, borderRadius: 20, padding: 16,
      marginBottom: 14,
      shadowColor: "#7c3aed", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1, shadowRadius: 12, elevation: 4,
    },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 14 },
  });

  return (
    <View style={styles.card}>
      {/* Шапка: аватар + имя + уровень. Тап — на профиль ученика. */}
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
        onPress={() => router.push(`/(main)/student/${student.id}` as any)}
        activeOpacity={0.7}
      >
        <AnimatedAvatar
          size={46}
          avatarColor={student.avatarColor ?? "#6366f1"}
          avatarEmoji={student.avatarEmoji}
          avatarUrl={student.avatarUrl}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15.5, fontWeight: "800", color: colors.foreground }} numberOfLines={1}>
            {displayName(student)}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
            {analysis ? <FreshnessBadge analysis={analysis} /> : null}
            {analysis?.student.cefrLevel ? (
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>
                {analysis.student.cefrLevel}
              </Text>
            ) : null}
            {analysis ? (
              <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                был {relativeDays(analysis.activity.daysSinceActive)}
              </Text>
            ) : null}
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>

      <View style={styles.divider} />

      {q.isLoading ? (
        <ActivityIndicator color={colors.primary} size="small" style={{ paddingVertical: 14 }} />
      ) : q.isError || !analysis ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
          <Feather name="wifi-off" size={14} color={colors.mutedForeground} />
          <Text style={{ flex: 1, fontSize: 12.5, color: colors.mutedForeground }}>
            Не удалось загрузить анализ.
          </Text>
          <TouchableOpacity onPress={() => q.refetch()} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.primary }}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Фокус — главное. Виден без раскрытия карточки. */}
          <BlockTitle title="Фокус на следующий урок" colors={colors} hint={ANALYSIS_HINTS.focus} />
          <View style={{ gap: 8 }}>
            {analysis.focus.map((item) => (
              <FocusRow key={item.id} item={item} colors={colors} />
            ))}
          </View>

          {/* Время — короткой строкой, без раскрытия. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
            <Feather name="clock" size={12} color={colors.mutedForeground} />
            <Text style={{ fontSize: 11.5, color: colors.mutedForeground }}>
              Сегодня {formatMinutes(analysis.activity.minutesToday)} · за неделю{" "}
              {formatMinutes(analysis.activity.minutesWeek)} (было{" "}
              {formatMinutes(analysis.activity.minutesPrevWeek)})
            </Text>
            <InfoHint
              title={ANALYSIS_HINTS.freshness.title}
              summary={ANALYSIS_HINTS.freshness.summary}
              points={[...ANALYSIS_HINTS.freshness.points]}
              size={16}
            />
          </View>

          {/* Подробности прячем: на экране может быть много учеников. */}
          <TouchableOpacity
            onPress={() => setExpanded((v) => !v)}
            activeOpacity={0.7}
            style={{
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
              marginTop: 14, paddingVertical: 9,
              backgroundColor: colors.muted, borderRadius: 12,
            }}
          >
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.foreground }}>
              {expanded ? "Свернуть подробности" : "Подробности по навыкам и словам"}
            </Text>
            <Feather name={expanded ? "chevron-up" : "chevron-down"} size={15} color={colors.foreground} />
          </TouchableOpacity>

          {expanded ? (
            <View style={{ marginTop: 6 }}>
              <View style={styles.divider} />
              <BlockTitle title="Навыки" colors={colors} hint={ANALYSIS_HINTS.skills} />
              <SkillsBlock skills={analysis.skills} colors={colors} />

              <View style={styles.divider} />
              <BlockTitle title="Слова" colors={colors} hint={ANALYSIS_HINTS.vocabulary} />
              <VocabularyBlock vocab={analysis.vocabulary} colors={colors} />

              <View style={styles.divider} />
              <BlockTitle title="Задания" colors={colors} hint={ANALYSIS_HINTS.assignments} />
              <AssignmentsBlock data={analysis.assignments} colors={colors} />

              <View style={styles.divider} />
              <BlockTitle title="Повторяющиеся ошибки" colors={colors} hint={ANALYSIS_HINTS.mistakes} />
              <MistakesBlock mistakes={analysis.mistakes} colors={colors} />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

// ── Экран ───────────────────────────────────────────────────────────────────

export default function AnalysisScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const studentsQ = useQuery({
    queryKey: ["teacher-students-analysis"],
    queryFn: fetchTeacherStudents,
    staleTime: 60_000,
  });

  // При возврате на вкладку помечаем данные устаревшими, но не дёргаем сеть
  // немедленно: react-query сам обновит то, что действительно просрочено.
  useFocusEffect(useCallback(() => {
    qc.invalidateQueries({ queryKey: ["teacher-students-analysis"] });
    qc.invalidateQueries({ queryKey: ["student-analysis"] });
  }, [qc]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.refetchQueries({ queryKey: ["teacher-students-analysis"] }),
        qc.refetchQueries({ queryKey: ["student-analysis"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20, paddingBottom: 14,
    },
    title: { fontSize: 26, fontWeight: "800", color: colors.foreground },
    subtitle: { fontSize: 13.5, color: colors.mutedForeground, marginTop: 2 },
    scroll: { paddingHorizontal: 20, paddingBottom: insets.bottom + 90 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingBottom: 80, paddingHorizontal: 30 },
    empty: { fontSize: 15, color: colors.mutedForeground, textAlign: "center" },
  });

  const students = studentsQ.data ?? [];

  if (studentsQ.isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={styles.title}>Анализ</Text>
          <InfoHint
            title="Как работает эта вкладка"
            summary="По каждому ученику приложение само собирает актуальное состояние учёбы и оставляет короткий список того, что стоит разобрать на следующем уроке."
            points={[
              "Данные обновляются при каждом открытии вкладки. Потяните список вниз, чтобы пересчитать принудительно.",
              "Сначала читайте плашку активности: если ученик давно не заходил, все проценты описывают прошлое, а не сегодняшний уровень.",
              "Блок «Фокус» — готовый план: срочное сверху. Он учитывает и вашу работу тоже, например непроверенные задания.",
              "Кнопка «Подробности» раскрывает навыки, слова, задания и повторяющиеся ошибки. У каждого блока есть своя подсказка «i».",
              "Выводы строятся по правилам, а не по ощущениям: пороги одинаковы для всех учеников, поэтому карточки можно сравнивать между собой.",
            ]}
            size={20}
          />
        </View>
        <Text style={styles.subtitle}>
          Актуальное состояние и что разобрать на уроке
        </Text>
      </View>

      {studentsQ.isError ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>⚠️</Text>
          <Text style={styles.empty}>Не удалось загрузить список учеников.</Text>
          <TouchableOpacity
            onPress={() => studentsQ.refetch()}
            style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Повторить</Text>
          </TouchableOpacity>
        </View>
      ) : students.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 48 }}>📊</Text>
          <Text style={styles.empty}>
            Нет принятых учеников.{"\n"}Добавьте учеников на вкладке «Ученики».
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {students.map((student) => (
            <StudentCard key={student.id} student={student} colors={colors} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
