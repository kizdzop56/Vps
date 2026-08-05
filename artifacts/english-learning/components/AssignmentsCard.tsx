// ─────────────────────────────────────────────────────────────────────────────
// Плитка «Мои задания» и разбор результатов по нажатию.
//
// Раньше это была плоская белая карточка: кольца по типам заданий и четыре
// строки легенды. Рядом с объёмной плиткой времени она читалась как
// недоделанная, а нажатие ничего не давало — хотя первый вопрос к такому
// блоку простой: «что у меня получается хуже всего».
//
// ── Объём ───────────────────────────────────────────────────────────────────
// Нижняя грань + проседание корпуса при нажатии, как у ChunkyButton и
// StudyTimeCard. Тело светлое, а не залитое градиентом: пара «задания + время»
// должна оставаться парой из ДВУХ разных плиток, а не двух одинаковых
// фиолетовых прямоугольников.
//
// ── Разбор ──────────────────────────────────────────────────────────────────
// Данные берём те, что экран уже загрузил: категории
// (GET /students/:id/category-stats) и список сдач. Отдельного запроса ради
// этого окна заводить незачем.
//
// Что показываем и почему:
//   • средний балл и сколько работ сдано — общая картина одной строкой;
//   • полосы по типам — видно просадку: «Тесты 42%» находится мгновенно,
//     а по кольцам это приходилось угадывать;
//   • разбивка по качеству — сколько работ на отлично, сколько надо повторить;
//   • последние пять сдач — «что я сдал вчера» без ухода в другой раздел.
//
// Полосы растут от нуля при открытии: заполнение показывает величину лучше,
// чем готовая полоска, которую глаз считывает как статичную картинку.
//
// ── ЧУЖОЙ ПРОФИЛЬ ───────────────────────────────────────────────────────────
// В чужом профиле список сдач недоступен: сервер отдаёт только сводку по
// категориям. Поэтому итог (средний балл и число проверенных работ) считается
// из категорий — среднее взвешивается по количеству работ в каждой. Блоки,
// которым нужны сами сдачи («Как решаешь», «Последние работы»), в этом случае
// просто не рисуются: раньше вместо них показывалась заглушка «Работ пока
// нет», хотя работы у человека были.
//
// ── Закрытие ────────────────────────────────────────────────────────────────
// Кнопка «Закрыть» стоит ВНУТРИ прокрутки, последним элементом. Раньше она
// была закреплена в подвале окна, и белая полоса под ней перекрывала конец
// разбора. Теперь подвала нет: кнопка едет вместе с содержимым.
//
// Крестик в шапке тоже остался — до кнопки внизу длинного списка ещё нужно
// долистать.
//
// ── ГРАБЛИ ──────────────────────────────────────────────────────────────────
// 1. НЕ вкладывать <Text> в <Text>: в Safari это роняет весь экран
//    («Cannot set indexed properties on this object»).
// 2. useNativeDriver только не в вебе: там нативного драйвера нет.
// 3. Ширину и высоту нативный драйвер не анимирует вовсе — для полос всегда
//    useNativeDriver: false, независимо от платформы.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, Pressable, Modal, StyleSheet, Animated, Easing, Platform, ScrollView,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton, SectionLabel } from "@/components/ui/GameKit";
import { AssignmentRingsChart, type CategoryStat } from "@/components/AssignmentRingsChart";
import { accents, radii, timing } from "@/constants/theme";

const NATIVE_DRIVER = Platform.OS !== "web";

/** Высота нижней грани и глубина нажатия. */
const EDGE = 6;

/** Заполнение шкалы: достаточно, чтобы увидеть рост, и не успевает надоесть. */
const FILL_MS = 700;
const FILL_STEP_MS = 70;

const TYPE_LABELS: Record<string, string> = {
  text_test: "Тесты",
  audio: "Аудирование",
  reading: "Чтение",
  video: "Видео",
  free_form: "Свободные",
};

const TYPE_COLORS: Record<string, string> = {
  text_test: "#8b5cf6",
  audio: "#6366f1",
  reading: "#d946ef",
  video: "#ec4899",
  free_form: "#a855f7",
};

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 14) return forms[2];
  const last = abs % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function shortDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? ""}`;
}

/** Крестик закрытия в шапке окна. */
export function SheetClose({ onPress, colors }: { onPress: () => void; colors: any }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Закрыть"
      style={({ pressed }) => [
        {
          width: 36, height: 36, borderRadius: 13,
          alignItems: "center", justifyContent: "center",
          backgroundColor: colors.muted,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Glyph name="close" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

/**
 * Полоса, которая заполняется от нуля.
 *
 * Ключ анимации — `run`: он меняется при каждом открытии окна, поэтому шкала
 * растёт заново, а не остаётся заполненной с прошлого раза.
 */
function GrowBar({
  percent, color, track, delay = 0, run,
}: {
  percent: number;
  color: string;
  track: string;
  delay?: number;
  run: number;
}) {
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    width.setValue(0);
    const anim = Animated.timing(width, {
      toValue: 1,
      duration: FILL_MS,
      delay,
      easing: Easing.out(Easing.cubic),
      // Ширина нативным драйвером не анимируется ни на одной платформе.
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [run, percent, delay, width]);

  return (
    <View style={[s.barTrack, { backgroundColor: track }]}>
      <Animated.View
        style={[
          s.barFill,
          {
            backgroundColor: color,
            width: width.interpolate({
              inputRange: [0, 1],
              outputRange: ["0%", `${Math.max(percent, 2)}%`],
            }),
          },
        ]}
      />
    </View>
  );
}

/** Одна сдача. Поля читаем мягко: разные эндпоинты называют их по-разному. */
export interface SubmissionLike {
  score?: number | null;
  submittedAt?: string;
  pointsEarned?: number | null;
  title?: string | null;
  assignmentTitle?: string | null;
  type?: string | null;
  assignmentType?: string | null;
  status?: string | null;
}

export interface AssignmentsCardProps {
  /** Результаты по типам заданий. */
  stats: CategoryStat[];
  /** Список сдач ученика — из него считаются итоги и «последние работы». */
  submissions?: SubmissionLike[];
  /** Можно ли открыть разбор. */
  canOpen?: boolean;
  /** Растёт при каждом входе на экран — кольца вычерчиваются заново. */
  replay?: number;
  /** Заголовок плитки и окна: в чужом профиле это не «мои» задания. */
  title?: string;
  style?: any;
}

export function AssignmentsCard({
  stats, submissions = [], canOpen = true, replay = 0, title = "Мои задания", style,
}: AssignmentsCardProps) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  // Растёт при каждом открытии: по нему шкалы внутри стартуют заново.
  const [run, setRun] = useState(0);
  const press = useRef(new Animated.Value(0)).current;

  const setPress = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: timing.press, easing: Easing.out(Easing.quad),
      useNativeDriver: NATIVE_DRIVER,
    }).start();

  const openSheet = () => {
    setRun((n) => n + 1);
    setOpen(true);
  };

  return (
    <View style={[{ flex: 1, paddingBottom: EDGE }, style]}>
      <View style={[s.edge, { backgroundColor: "#c9bdf0" }]} />

      <Animated.View style={{ flex: 1, transform: [{ translateY: press }] }}>
        <Pressable
          onPress={canOpen ? openSheet : undefined}
          onPressIn={canOpen ? () => setPress(EDGE) : undefined}
          onPressOut={canOpen ? () => setPress(0) : undefined}
          disabled={!canOpen}
          accessibilityRole={canOpen ? "button" : undefined}
          accessibilityLabel={canOpen ? "Открыть разбор заданий" : undefined}
          style={[s.body, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <SectionLabel>{title}</SectionLabel>
          <AssignmentRingsChart stats={stats} colors={colors} replay={replay} />

          {canOpen && (
            <View style={[s.hint, { backgroundColor: colors.primary + "14" }]}>
              <Glyph name="chart" size={11} color={colors.primary} />
              <Text style={[s.hintText, { color: colors.primary }]}>Статистика</Text>
              <Glyph name="chevron" size={11} color={colors.primary} />
            </View>
          )}
        </Pressable>
      </Animated.View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setOpen(false)}>
          <Pressable style={[s.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
            <View style={[s.handle, { backgroundColor: colors.border }]} />

            <View style={s.sheetHead}>
              <Text style={[s.sheetTitle, { color: colors.foreground }]}>{title}</Text>
              <SheetClose onPress={() => setOpen(false)} colors={colors} />
            </View>

            {/* Кнопка едет вместе с содержимым: закреплённый подвал перекрывал
                конец разбора белой полосой. */}
            <ScrollView showsVerticalScrollIndicator={false}>
              <AssignmentsBreakdown
                stats={stats}
                submissions={submissions}
                colors={colors}
                run={run}
              />
              <ChunkyButton
                label="Закрыть"
                icon="check"
                onPress={() => setOpen(false)}
                style={{ marginTop: 18 }}
              />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Содержимое разбора ──────────────────────────────────────────────────────

function AssignmentsBreakdown({
  stats, submissions, colors, run,
}: {
  stats: CategoryStat[];
  submissions: SubmissionLike[];
  colors: any;
  run: number;
}) {
  const data = useMemo(() => {
    const scored = submissions.filter((r) => typeof r.score === "number");

    // Разбивка по качеству. Пороги те же, что у цвета балла на карточках
    // заданий: 70 и 85, чтобы «зелёная зона» означала одно и то же везде.
    const great = scored.filter((r) => (r.score ?? 0) >= 85).length;
    const good = scored.filter((r) => (r.score ?? 0) >= 70 && (r.score ?? 0) < 85).length;
    const weak = scored.filter((r) => (r.score ?? 0) < 70).length;

    const recent = [...submissions]
      .filter((r) => !!r.submittedAt)
      .sort((a, b) => new Date(b.submittedAt!).getTime() - new Date(a.submittedAt!).getTime())
      .slice(0, 5);

    const points = submissions.reduce((sum, r) => sum + (r.pointsEarned ?? 0), 0);
    const pending = stats.reduce((sum, s) => sum + (s.pending ?? 0), 0);

    // Категория с худшим средним — то, ради чего этот экран и открывают.
    const rated = stats.filter((s) => s.count > 0 && typeof s.avgScore === "number");
    const weakest = rated.length > 1
      ? rated.reduce((min, s) => ((s.avgScore ?? 0) < (min.avgScore ?? 0) ? s : min))
      : null;

    // Итог считаем из сдач, если они есть. В чужом профиле их не отдают —
    // тогда берём сводку по категориям и взвешиваем среднее по количеству
    // работ, иначе редкий тип с одной пятёркой перетянет весь итог.
    const statCount = rated.reduce((sum, s) => sum + s.count, 0);
    const statAverage = statCount > 0
      ? Math.round(rated.reduce((sum, s) => sum + (s.avgScore ?? 0) * s.count, 0) / statCount)
      : null;

    const checked = scored.length > 0 ? scored.length : statCount;
    const average = scored.length > 0
      ? Math.round(scored.reduce((sum, r) => sum + (r.score ?? 0), 0) / scored.length)
      : statAverage;

    return { scored, checked, average, great, good, weak, recent, points, pending, rated, weakest };
  }, [stats, submissions]);

  const tint = (score: number) =>
    score >= 85 ? colors.success : score >= 70 ? accents.amber : colors.destructive;

  // Пусто — только когда работ действительно нет. Раньше условие смотрело на
  // список сдач, и чужой профиль всегда показывал заглушку.
  if (data.checked === 0 && data.pending === 0) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 34, gap: 12 }}>
        <View style={[s.emptyIcon, { backgroundColor: colors.primary + "14" }]}>
          <Glyph name="tray" size={30} color={colors.primary} />
        </View>
        <Text style={[s.emptyTitle, { color: colors.foreground }]}>Работ пока нет</Text>
        <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
          Сдай первое задание — здесь появятся баллы, средний результат и разбор по типам.
        </Text>
      </View>
    );
  }

  const sortedRated = [...data.rated].sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));

  return (
    <View style={{ gap: 16 }}>
      {/* Общая картина */}
      <View style={[s.hero, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "26" }]}>
        <Text style={[s.heroLabel, { color: colors.primary }]}>Средний балл</Text>
        <Text style={[
          s.heroValue,
          { color: data.average === null ? colors.mutedForeground : tint(data.average) },
        ]}>
          {data.average === null ? "—" : `${data.average}%`}
        </Text>
        <Text style={[s.heroNote, { color: colors.mutedForeground }]}>
          {data.checked} {plural(data.checked, ["проверенная работа", "проверенные работы", "проверенных работ"])}
          {data.points > 0 ? ` · +${data.points} очков` : ""}
        </Text>
      </View>

      {/* На проверке — отдельной строкой: это не результат, а ожидание. */}
      {data.pending > 0 && (
        <View style={[s.pending, { backgroundColor: accents.amber + "1f" }]}>
          <Glyph name="clock" size={14} color="#8a5a00" />
          <Text style={s.pendingText}>
            {data.pending} {plural(data.pending, ["работа ждёт", "работы ждут", "работ ждут"])} проверки учителя
          </Text>
        </View>
      )}

      {/* Полосы по типам: просадка видна сразу, в кольцах её приходилось искать */}
      {sortedRated.length > 0 && (
        <View>
          <Text style={[s.blockLabel, { color: colors.mutedForeground }]}>По типам заданий</Text>
          <View style={{ gap: 11 }}>
            {sortedRated.map((stat, i) => {
              const color = TYPE_COLORS[stat.type] ?? colors.primary;
              const pct = Math.max(0, Math.min(100, stat.avgScore ?? 0));
              return (
                <View key={stat.type}>
                  <View style={s.barHead}>
                    <Text style={[s.barName, { color: colors.foreground }]} numberOfLines={1}>
                      {TYPE_LABELS[stat.type] ?? stat.type}
                    </Text>
                    <Text style={[s.barCount, { color: colors.mutedForeground }]}>
                      {stat.count} {plural(stat.count, ["работа", "работы", "работ"])}
                    </Text>
                    <Text style={[s.barPct, { color }]}>{pct}%</Text>
                  </View>
                  <GrowBar
                    percent={pct}
                    color={color}
                    track={colors.muted}
                    delay={i * FILL_STEP_MS}
                    run={run}
                  />
                </View>
              );
            })}
          </View>

          {!!data.weakest && (data.weakest.avgScore ?? 0) < 70 && (
            <Text style={[s.advice, { color: colors.mutedForeground }]}>
              Слабее всего идёт «{TYPE_LABELS[data.weakest.type] ?? data.weakest.type}» — попроси
              учителя дать ещё таких заданий.
            </Text>
          )}
        </View>
      )}

      {/* Качество работ. Нужны сами сдачи — в чужом профиле блока не будет. */}
      {data.scored.length > 0 && (
        <View>
          <Text style={[s.blockLabel, { color: colors.mutedForeground }]}>Как решаешь</Text>
          <View style={s.grid}>
            {[
              { label: "Отлично", note: "85% и выше", value: data.great, color: colors.success },
              { label: "Хорошо", note: "70–84%", value: data.good, color: accents.amber },
              { label: "Повторить", note: "ниже 70%", value: data.weak, color: colors.destructive },
            ].map((q) => (
              <View
                key={q.label}
                style={[s.tile, { backgroundColor: colors.muted, borderColor: colors.border }]}
              >
                <Text style={[s.tileValue, { color: q.value > 0 ? q.color : colors.mutedForeground }]}>
                  {q.value}
                </Text>
                <Text style={[s.tileLabel, { color: colors.foreground }]}>{q.label}</Text>
                <Text style={[s.tileNote, { color: colors.mutedForeground }]}>{q.note}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Последние работы */}
      {data.recent.length > 0 && (
        <View>
          <Text style={[s.blockLabel, { color: colors.mutedForeground }]}>Последние работы</Text>
          <View style={[s.list, { borderColor: colors.border }]}>
            {data.recent.map((r, i) => {
              const score = typeof r.score === "number" ? r.score : null;
              const type = r.type ?? r.assignmentType ?? null;
              const name = r.title ?? r.assignmentTitle ?? (type ? TYPE_LABELS[type] ?? "Задание" : "Задание");
              return (
                <View
                  key={`${r.submittedAt}-${i}`}
                  style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.rowName, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
                    <Text style={[s.rowDate, { color: colors.mutedForeground }]}>
                      {shortDate(r.submittedAt ?? "")}
                      {type ? ` · ${TYPE_LABELS[type] ?? type}` : ""}
                    </Text>
                  </View>
                  {score === null ? (
                    <Text style={[s.rowWait, { color: colors.mutedForeground }]}>на проверке</Text>
                  ) : (
                    <Text style={[s.rowScore, { color: tint(score) }]}>{score}%</Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  edge: {
    position: "absolute", left: 0, right: 0, top: EDGE, bottom: 0,
    borderRadius: radii.md,
  },
  body: {
    flex: 1, borderRadius: radii.md, borderWidth: 1, padding: 14,
    shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16, shadowRadius: 15, elevation: 4,
  },
  hint: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    marginTop: 11, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 5,
  },
  hintText: { fontSize: 10.5, fontWeight: "800" },

  overlay: { flex: 1, backgroundColor: "#00000070", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    paddingTop: 12, paddingHorizontal: 20, paddingBottom: 20, maxHeight: "88%",
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  sheetTitle: { flex: 1, fontSize: 19, fontWeight: "900", letterSpacing: -0.4 },

  hero: { borderRadius: radii.md, borderWidth: 1, padding: 16 },
  heroLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  heroValue: {
    fontSize: 32, fontWeight: "900", letterSpacing: -1.2, marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  heroNote: { fontSize: 12.5, fontWeight: "600", marginTop: 4 },

  pending: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: radii.sm, paddingHorizontal: 12, paddingVertical: 10,
  },
  pendingText: { flex: 1, fontSize: 12.5, fontWeight: "800", color: "#8a5a00" },

  blockLabel: {
    fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase",
    marginBottom: 10,
  },
  barHead: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 5 },
  barName: { flex: 1, fontSize: 13.5, fontWeight: "800" },
  barCount: { fontSize: 11, fontWeight: "600", fontVariant: ["tabular-nums"] },
  barPct: { fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },
  barTrack: { height: 9, borderRadius: radii.pill, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: radii.pill },
  advice: { fontSize: 12, fontWeight: "600", lineHeight: 17, marginTop: 11 },

  grid: { flexDirection: "row", gap: 8 },
  tile: {
    flex: 1, borderRadius: radii.sm + 2, borderWidth: 1,
    paddingVertical: 12, paddingHorizontal: 10, alignItems: "center",
  },
  tileValue: { fontSize: 23, fontWeight: "900", fontVariant: ["tabular-nums"] },
  tileLabel: { fontSize: 11.5, fontWeight: "800", marginTop: 3 },
  tileNote: { fontSize: 10, fontWeight: "600", marginTop: 1 },

  list: { borderRadius: radii.sm + 2, borderWidth: 1, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, paddingVertical: 11 },
  rowName: { fontSize: 13.5, fontWeight: "800" },
  rowDate: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  rowScore: { fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"] },
  rowWait: { fontSize: 11.5, fontWeight: "700" },

  emptyIcon: {
    width: 58, height: 58, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 15.5, fontWeight: "900" },
  emptyText: { fontSize: 13, fontWeight: "600", lineHeight: 19, textAlign: "center", maxWidth: 34 * 8 },
});

export default AssignmentsCard;
