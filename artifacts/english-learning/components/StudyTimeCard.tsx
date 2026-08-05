// ─────────────────────────────────────────────────────────────────────────────
// Плитка учебного времени и разбор статистики по нажатию.
//
// Раньше здесь была плоская фиолетовая заливка с иконкой часов и двумя числами:
// «всего» и «сегодня». Нажатие не делало ничего, хотя первый вопрос к такому
// счётчику — «а вчера сколько было».
//
// ── Объём ───────────────────────────────────────────────────────────────────
// У плитки есть нижняя грань (тёмный слой под корпусом) — тот же приём, что у
// физических кнопок в GameKit. При нажатии корпус проседает ровно на высоту
// грани, поэтому нажатие чувствуется как нажатие настоящей клавиши. Сверху
// добавлен блик, снизу — затемнение: без них градиент выглядит наклейкой.
//
// ── Часы ────────────────────────────────────────────────────────────────────
// Вместо статичной иконки — работающий циферблат с текущим временем.
// Секундная стрелка крутится через Animated.loop (трансформ, без ре-рендеров),
// минутная и часовая обновляются состоянием раз в 15 секунд.
//
// Циферблат намеренно без цифр: 12 засечек, три стрелки, круг. На 62 пикселях
// цифры превратились бы в грязь.
//
// ── Разбор ──────────────────────────────────────────────────────────────────
// Данные берём из GET /students/:id/time/summary. Считает их сервер: правила
// подсчёта времени нетривиальные (брошенная сессия засчитывается только по
// подтверждённому heartbeat), и на клиенте они бы разошлись с профилем.
//
// Столбики недели вырастают от нуля при открытии: высота читается как
// величина, а не как готовая картинка.
//
// ── Закрытие ────────────────────────────────────────────────────────────────
// Одна кнопка «Закрыть», ЛИПКАЯ: она лежит поверх окна и прижата к низу
// экрана, поэтому доступна на любой прокрутке. Раньше кнопка ехала вместе с
// содержимым, и до неё нужно было долистать весь разбор.
//
// Закреплённой белой полосы под ней нет: кнопка висит над содержимым, а под
// ней короткая растяжка от прозрачного к фону окна. Место под кнопку выделено
// отступом внизу прокрутки, поэтому последняя строка разбора не обрезается.
//
// Крестик из шапки убран: две кнопки для одного действия — лишний элемент.
// Тап по затемнению по-прежнему закрывает.
//
// ── ГРАБЛИ ──────────────────────────────────────────────────────────────────
// 1. НЕ вкладывать <Text> в <Text>: в Safari это роняет весь экран целиком
//    («Cannot set indexed properties on this object»). Разные кегли в одной
//    строке — два соседних Text во View с flexDirection: "row".
// 2. НЕ ставить useNativeDriver: true без проверки платформы. В вебе нативного
//    драйвера нет, анимация идёт на requestAnimationFrame, а свёрнутая вкладка
//    его останавливает — и цикл сам уже не оживает (см. AnalogClock).
// 3. Высоту и ширину нативный драйвер не анимирует ни на одной платформе:
//    у столбиков всегда useNativeDriver: false.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, Pressable, Modal, StyleSheet, Animated, Easing, Platform, AppState,
  ActivityIndicator, ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import authStorage from "@/utils/authStorage";
import { Glyph } from "@/components/ui/Glyph";
import { ChunkyButton } from "@/components/ui/GameKit";
import { accents, radii, timing } from "@/constants/theme";

/** В вебе нативного драйвера нет: там анимации всегда идут на JS. */
const NATIVE_DRIVER = Platform.OS !== "web";

/** Рост столбиков при открытии окна. */
const FILL_MS = 700;
const FILL_STEP_MS = 55;

/** Липкая кнопка: её высота вместе с гранью и растяжка над ней. */
const STICKY_H = 62;
const STICKY_FADE = 28;

const BASE = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Ошибка сервера");
  return data;
}

/** Ответ GET /students/:id/time/summary. */
interface TimeSummary {
  totalMinutes: number;
  todayMinutes: number;
  yesterdayMinutes: number;
  weekMinutes: number;
  prevWeekMinutes: number;
  avgActiveDayMinutes: number;
  avgCalendarDayMinutes: number;
  activeDays: number;
  averageWindowDays: number;
  bestDay: { date: string; minutes: number } | null;
  streakDays: number;
  daily: { date: string; minutes: number }[];
}

// ── Форматирование ──────────────────────────────────────────────────────────

function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 14) return forms[2];
  const last = abs % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/** «3 ч 31 мин», «16 мин», «меньше минуты». */
function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return "меньше минуты";
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} мин`;
  if (rest === 0) return `${h} ч`;
  return `${h} ч ${rest} мин`;
}

/** Короткая форма для плотных мест: «3 ч 31 м», «16 м», «0». */
function formatShort(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return "0";
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} м`;
  if (rest === 0) return `${h} ч`;
  return `${h} ч ${rest} м`;
}

/** Живой счётчик за сегодня: «16 мин 58 с». */
function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин ${String(s).padStart(2, "0")} с`;
  return `${s} с`;
}

const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** Разбор «YYYY-MM-DD» вручную: new Date(строка) уводит дату на день из-за UTC. */
function parseDayKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

function weekdayOf(key: string): string {
  const { y, m, d } = parseDayKey(key);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? "";
}

function shortDate(key: string): string {
  const { m, d } = parseDayKey(key);
  return `${d} ${MONTHS[m - 1] ?? ""}`;
}

// ── Циферблат ───────────────────────────────────────────────────────────────

/**
 * Минималистичные работающие часы.
 *
 * Секундная стрелка — Animated.loop на 60 секунд: за оборот значение проходит
 * 0→1, а стартовый угол берётся из текущей секунды, поэтому стрелка сразу
 * стоит правильно и переход через минуту незаметен (360° ≡ 0°).
 *
 * Минутная и часовая пересчитываются из состояния раз в 15 секунд: анимация
 * длиной в час или двенадцать заметно уплывала бы, а точность здесь важнее
 * непрерывности — на глаз движение этих стрелок всё равно не видно.
 *
 * ПОЧЕМУ ЕСТЬ ПЕРЕЗАПУСК. В вебе анимация идёт на requestAnimationFrame, и
 * свёрнутая вкладка его замораживает. Сама она после этого не оживает: часы
 * так и стояли, пока страницу не перезагрузишь. Поэтому при возврате во
 * вкладку (или в приложение) цикл поднимается заново, а стартовый угол берётся
 * от текущей секунды — стрелка встаёт на своё место мгновенно, без доезда.
 */
function AnalogClock({ size = 62 }: { size?: number }) {
  const [now, setNow] = useState(() => new Date());
  // Стартовая секунда цикла. Меняется при каждом перезапуске, поэтому это
  // состояние, а не ref, вычисленный один раз при монтировании.
  const [startSecond, setStartSecond] = useState(
    () => new Date().getSeconds() + new Date().getMilliseconds() / 1000,
  );
  // Счётчик пробуждений: его изменение перезапускает анимацию.
  const [wake, setWake] = useState(0);
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const d = new Date();
    setNow(d);
    setStartSecond(d.getSeconds() + d.getMilliseconds() / 1000);

    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 60_000,
        easing: Easing.linear,
        useNativeDriver: NATIVE_DRIVER,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [wake, spin]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Возврат во вкладку или в приложение — поднимаем цикл заново.
  useEffect(() => {
    const revive = () => setWake((n) => n + 1);

    if (Platform.OS === "web" && typeof document !== "undefined") {
      const onVisibility = () => { if (!document.hidden) revive(); };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("focus", revive);
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("focus", revive);
      };
    }

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") revive();
    });
    return () => sub.remove();
  }, []);

  const minuteAngle = (now.getMinutes() + now.getSeconds() / 60) * 6;
  const hourAngle = ((now.getHours() % 12) + now.getMinutes() / 60) * 30;

  const secondRotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: [`${startSecond * 6}deg`, `${startSecond * 6 + 360}deg`],
  });

  const c = size / 2;
  const face = size / 2 - 1;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={face} fill="rgba(255,255,255,0.14)" />
        <Circle cx={c} cy={c} r={face} stroke="rgba(255,255,255,0.42)" strokeWidth={1.6} fill="none" />
        {Array.from({ length: 12 }).map((_, i) => {
          const quarter = i % 3 === 0;
          const angle = (i * 30 * Math.PI) / 180;
          const outer = face - 3.5;
          const inner = outer - (quarter ? 6 : 3);
          return (
            <Line
              key={i}
              x1={c + Math.sin(angle) * inner}
              y1={c - Math.cos(angle) * inner}
              x2={c + Math.sin(angle) * outer}
              y2={c - Math.cos(angle) * outer}
              stroke={quarter ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)"}
              strokeWidth={quarter ? 2 : 1.4}
              strokeLinecap="round"
            />
          );
        })}
      </Svg>

      {/* Стрелки: каждая лежит в квадрате на весь циферблат, поэтому поворот
          происходит вокруг центра часов, а не вокруг центра самой стрелки. */}
      <View style={[StyleSheet.absoluteFillObject, { transform: [{ rotate: `${hourAngle}deg` }] }]}>
        <View style={{
          position: "absolute", left: c - 1.7, top: size * 0.3, width: 3.4, height: c - size * 0.3,
          borderRadius: 2, backgroundColor: "#ffffff",
        }} />
      </View>
      <View style={[StyleSheet.absoluteFillObject, { transform: [{ rotate: `${minuteAngle}deg` }] }]}>
        <View style={{
          position: "absolute", left: c - 1.2, top: size * 0.17, width: 2.4, height: c - size * 0.17,
          borderRadius: 1.5, backgroundColor: "#ffffff",
        }} />
      </View>
      <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ rotate: secondRotate }] }]}>
        <View style={{
          position: "absolute", left: c - 0.7, top: size * 0.12, width: 1.4, height: c - size * 0.12 + 4,
          borderRadius: 1, backgroundColor: accents.gold,
        }} />
      </Animated.View>
      <View style={{
        position: "absolute", left: c - 2.6, top: c - 2.6, width: 5.2, height: 5.2,
        borderRadius: 3, backgroundColor: "#ffffff",
      }} />
    </View>
  );
}

// ── Плитка ──────────────────────────────────────────────────────────────────

/** Высота нижней грани и глубина нажатия. Совпадают: корпус садится на грань. */
const EDGE = 6;

export interface StudyTimeCardProps {
  /** Чьё время показываем. Нужен для запроса разбора. */
  studentId: number;
  /** Всего минут — уже загружено экраном, чтобы плитка не ждала запроса. */
  totalMinutes: number;
  /** Живой счётчик за сегодня, в секундах. */
  todaySeconds: number;
  /** Можно ли открыть разбор. У чужого профиля доступ есть не всем. */
  canOpen?: boolean;
  style?: any;
}

export function StudyTimeCard({
  studentId, totalMinutes, todaySeconds, canOpen = true, style,
}: StudyTimeCardProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<TimeSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Растёт при каждом открытии: по нему столбики стартуют заново.
  const [run, setRun] = useState(0);
  const press = useRef(new Animated.Value(0)).current;

  const setPress = (to: number) =>
    Animated.timing(press, {
      toValue: to, duration: timing.press, easing: Easing.out(Easing.quad),
      useNativeDriver: NATIVE_DRIVER,
    }).start();

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setError("");
    try {
      setSummary(await apiFetch(`/api/students/${studentId}/time/summary`));
    } catch (e: any) {
      setError(e?.message || "Не удалось загрузить статистику");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  const openSheet = () => {
    setRun((n) => n + 1);
    setOpen(true);
    load();
  };

  // Липкая кнопка стоит на этой высоте, а прокрутка получает её же отступом.
  const stickyBottom = 16 + insets.bottom;

  return (
    <View style={[{ flex: 1, paddingBottom: EDGE }, style]}>
      {/* Нижняя грань: она и даёт объём. Видна в покое, скрывается при нажатии. */}
      <View style={s.edge} />

      <Animated.View style={{ flex: 1, transform: [{ translateY: press }] }}>
        <Pressable
          onPress={canOpen ? openSheet : undefined}
          onPressIn={canOpen ? () => setPress(EDGE) : undefined}
          onPressOut={canOpen ? () => setPress(0) : undefined}
          disabled={!canOpen}
          accessibilityRole={canOpen ? "button" : undefined}
          accessibilityLabel={canOpen ? "Открыть статистику времени" : undefined}
          style={{ flex: 1 }}
        >
          <LinearGradient
            colors={["#a855f7", "#7c3aed", "#6d28d9"]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={s.body}
          >
            {/* Блик сверху и затемнение снизу: без них плитка выглядит плоской
                наклейкой, сколько градиента в неё ни залей. */}
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(255,255,255,0.26)", "rgba(255,255,255,0)"]}
              style={s.gloss}
            />
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(0,0,0,0)", "rgba(23,8,56,0.22)"]}
              style={s.shade}
            />
            <View pointerEvents="none" style={s.blob} />

            <View style={{ alignItems: "center", gap: 9 }}>
              <AnalogClock size={62} />
              <Text style={s.total} numberOfLines={1}>{formatMinutes(totalMinutes)}</Text>
              <Text style={s.today} numberOfLines={1}>
                Сегодня: {formatSeconds(todaySeconds)}
              </Text>
              {canOpen && (
                <View style={s.hint}>
                  <Glyph name="chart" size={11} color="rgba(255,255,255,0.82)" />
                  <Text style={s.hintText}>Статистика</Text>
                  <Glyph name="chevron" size={11} color="rgba(255,255,255,0.82)" />
                </View>
              )}
            </View>
          </LinearGradient>
        </Pressable>
      </Animated.View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setOpen(false)}>
          <Pressable style={[s.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
            <View style={[s.handle, { backgroundColor: colors.border }]} />

            <View style={s.sheetHead}>
              <Text style={[s.sheetTitle, { color: colors.foreground }]}>Время в приложении</Text>
            </View>

            {loading && !summary ? (
              <View style={{ paddingVertical: 48, alignItems: "center" }}>
                <ActivityIndicator color={colors.primary} size="large" />
              </View>
            ) : error ? (
              <View style={{ paddingVertical: 28, alignItems: "center", gap: 12 }}>
                <Glyph name="alert" size={34} color={colors.mutedForeground} />
                <Text style={{ fontSize: 13.5, color: colors.mutedForeground, textAlign: "center" }}>
                  {error}
                </Text>
                <ChunkyButton label="Повторить" icon="repeat" onPress={load} style={{ alignSelf: "stretch" }} />
                <View style={{ height: STICKY_H }} />
              </View>
            ) : summary ? (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: stickyBottom + STICKY_H + STICKY_FADE }}
              >
                <SummaryBody summary={summary} colors={colors} run={run} />
              </ScrollView>
            ) : null}

            {/* Растяжка под кнопкой: содержимое уезжает под неё затуханием, а
                не обрывом. Клики не перехватывает. */}
            <LinearGradient
              pointerEvents="none"
              colors={[colors.card + "00", colors.card]}
              style={[s.fade, { bottom: stickyBottom + STICKY_H - 6 }]}
            />

            {/* Липкая кнопка: одна на всё окно, всегда на одном месте. */}
            <View style={[s.sticky, { bottom: stickyBottom }]}>
              <ChunkyButton label="Закрыть" tone="dark" center onPress={() => setOpen(false)} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Содержимое разбора ──────────────────────────────────────────────────────

/**
 * Столбик дня, вырастающий от нуля.
 *
 * `run` меняется при каждом открытии окна, поэтому анимация играет заново, а не
 * остаётся доигранной с прошлого раза.
 */
function GrowBar({
  height, color, delay, run,
}: {
  height: number;
  color: string;
  delay: number;
  run: number;
}) {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    value.setValue(0);
    const anim = Animated.timing(value, {
      toValue: height,
      duration: FILL_MS,
      delay,
      easing: Easing.out(Easing.cubic),
      // Высоту нативный драйвер не анимирует ни на одной платформе.
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [run, height, delay, value]);

  return <Animated.View style={[s.bar, { height: value, backgroundColor: color }]} />;
}

function SummaryBody({
  summary, colors, run,
}: {
  summary: TimeSummary;
  colors: any;
  run: number;
}) {
  const diff = summary.todayMinutes - summary.yesterdayMinutes;
  const week = summary.daily.slice(-7);
  const max = Math.max(1, ...week.map((d) => d.minutes));
  const todayKey = week.length > 0 ? week[week.length - 1]!.date : "";
  const weekDiff = summary.weekMinutes - summary.prevWeekMinutes;

  // Сравнение с вчера. Ноль вчера — не «минус», а отдельный случай: писать
  // «на 16 минут больше, чем вчера» после дня без занятий бессмысленно.
  let deltaText: string;
  let deltaTone: "up" | "down" | "flat";
  if (summary.yesterdayMinutes < 1 && summary.todayMinutes >= 1) {
    deltaText = "вчера занятий не было";
    deltaTone = "up";
  } else if (Math.abs(diff) < 1) {
    deltaText = "столько же, сколько вчера";
    deltaTone = "flat";
  } else if (diff > 0) {
    deltaText = `на ${formatMinutes(diff)} больше, чем вчера`;
    deltaTone = "up";
  } else {
    deltaText = `на ${formatMinutes(-diff)} меньше, чем вчера`;
    deltaTone = "down";
  }

  const deltaColor = deltaTone === "up" ? "#8a5a00" : colors.mutedForeground;
  const deltaBg = deltaTone === "up" ? accents.gold + "2e" : colors.muted;

  const tiles = [
    {
      icon: "calendar" as const,
      label: "За эту неделю",
      value: formatShort(summary.weekMinutes),
      note: summary.prevWeekMinutes < 1
        ? "первая неделя"
        : weekDiff >= 0
          ? `+${formatShort(weekDiff)} к прошлой`
          : `−${formatShort(-weekDiff)} к прошлой`,
    },
    {
      icon: "chart" as const,
      label: "В среднем",
      value: formatShort(summary.avgActiveDayMinutes),
      note: `за день занятий · ${summary.activeDays} ${plural(summary.activeDays, ["день", "дня", "дней"])} из ${summary.averageWindowDays}`,
    },
    {
      icon: "trophy" as const,
      label: "Лучший день",
      value: summary.bestDay ? formatShort(summary.bestDay.minutes) : "—",
      note: summary.bestDay ? shortDate(summary.bestDay.date) : "пока нет данных",
    },
    {
      icon: "flame" as const,
      label: "Подряд",
      value: `${summary.streakDays}`,
      note: summary.streakDays === 0
        ? "начни сегодня"
        : `${plural(summary.streakDays, ["день", "дня", "дней"])} без пропусков`,
    },
  ];

  return (
    <View style={{ gap: 16 }}>
      {/* Главное число дня */}
      <View style={[s.hero, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "26" }]}>
        <Text style={[s.heroLabel, { color: colors.primary }]}>Сегодня</Text>
        <Text style={[s.heroValue, { color: colors.foreground }]}>{formatMinutes(summary.todayMinutes)}</Text>
        <View style={[s.delta, { backgroundColor: deltaBg }]}>
          <Glyph
            name={deltaTone === "up" ? "trendUp" : deltaTone === "down" ? "trendDown" : "clock"}
            size={13}
            color={deltaColor}
          />
          <Text style={[s.deltaText, { color: deltaColor }]}>{deltaText}</Text>
        </View>
      </View>

      {/* Столбики за неделю. Сегодняшний — золотой: своё место в ряду видно
          раньше, чем прочитаны подписи. */}
      <View>
        <Text style={[s.blockLabel, { color: colors.mutedForeground }]}>Последние 7 дней</Text>
        <View style={s.chart}>
          {week.map((d, i) => {
            const isToday = d.date === todayKey;
            const h = d.minutes < 1 ? 3 : Math.max(6, Math.round((d.minutes / max) * 84));
            return (
              <View key={d.date} style={s.barCol}>
                <Text style={[s.barValue, { color: isToday ? accents.amber : colors.mutedForeground }]}>
                  {d.minutes < 1 ? "" : formatShort(d.minutes)}
                </Text>
                <View style={[s.barTrack, { backgroundColor: colors.muted }]}>
                  <GrowBar
                    height={h}
                    delay={i * FILL_STEP_MS}
                    run={run}
                    color={d.minutes < 1
                      ? colors.border
                      : isToday ? accents.gold : colors.primary}
                  />
                </View>
                <Text style={[s.barDay, { color: isToday ? colors.primary : colors.mutedForeground }]}>
                  {weekdayOf(d.date)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Четыре цифры о привычке, а не о сегодняшнем дне */}
      <View style={s.grid}>
        {tiles.map((t) => (
          <View
            key={t.label}
            style={[s.tile, { backgroundColor: colors.muted, borderColor: colors.border }]}
          >
            <View style={s.tileHead}>
              <Glyph name={t.icon} size={13} color={colors.primary} />
              <Text style={[s.tileLabel, { color: colors.mutedForeground }]}>{t.label}</Text>
            </View>
            <Text style={[s.tileValue, { color: colors.foreground }]}>{t.value}</Text>
            <Text style={[s.tileNote, { color: colors.mutedForeground }]} numberOfLines={2}>{t.note}</Text>
          </View>
        ))}
      </View>

      <View style={[s.totalRow, { borderTopColor: colors.border }]}>
        <Glyph name="clock" size={15} color={colors.mutedForeground} />
        <Text style={[s.totalLabel, { color: colors.mutedForeground }]}>Всего в приложении</Text>
        <Text style={[s.totalValue, { color: colors.foreground }]}>{formatMinutes(summary.totalMinutes)}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  edge: {
    position: "absolute", left: 0, right: 0, top: EDGE, bottom: 0,
    borderRadius: radii.md, backgroundColor: "#4c1d95",
  },
  body: {
    flex: 1, borderRadius: radii.md, padding: 14,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
    shadowColor: "#6d28d9", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.34, shadowRadius: 18, elevation: 7,
  },
  gloss: { position: "absolute", left: 0, right: 0, top: 0, height: "46%" },
  shade: { position: "absolute", left: 0, right: 0, bottom: 0, height: "38%" },
  blob: {
    position: "absolute", width: 150, height: 150, borderRadius: 75,
    top: -82, right: -52, backgroundColor: "rgba(255,255,255,0.12)",
  },
  total: {
    fontSize: 22, fontWeight: "900", color: "#ffffff",
    letterSpacing: -0.6, textAlign: "center", fontVariant: ["tabular-nums"],
  },
  today: {
    fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.82)",
    textAlign: "center", fontVariant: ["tabular-nums"],
  },
  hint: {
    flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 4,
  },
  hintText: { fontSize: 10.5, fontWeight: "800", color: "#ffffff" },

  overlay: { flex: 1, backgroundColor: "#00000070", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    paddingTop: 12, paddingHorizontal: 20, maxHeight: "88%",
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  sheetTitle: { flex: 1, fontSize: 19, fontWeight: "900", letterSpacing: -0.4 },

  // Липкая кнопка и растяжка под ней.
  sticky: { position: "absolute", left: 20, right: 20 },
  fade: { position: "absolute", left: 0, right: 0, height: STICKY_FADE + 6 },

  hero: { borderRadius: radii.md, borderWidth: 1, padding: 16, alignItems: "flex-start" },
  heroLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  heroValue: {
    fontSize: 32, fontWeight: "900", letterSpacing: -1.2, marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  delta: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10,
    borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5,
  },
  deltaText: { fontSize: 12, fontWeight: "800" },

  blockLabel: {
    fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase",
    marginBottom: 10,
  },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  barCol: { flex: 1, alignItems: "center", gap: 5 },
  barValue: { fontSize: 9, fontWeight: "800", fontVariant: ["tabular-nums"] },
  barTrack: {
    width: "100%", height: 84, borderRadius: 8,
    justifyContent: "flex-end", overflow: "hidden",
  },
  bar: { width: "100%", borderRadius: 8 },
  barDay: { fontSize: 10.5, fontWeight: "800" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    flexGrow: 1, flexBasis: "46%", minWidth: 132,
    borderRadius: radii.sm + 2, borderWidth: 1, padding: 12,
  },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  tileLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
  tileValue: {
    fontSize: 21, fontWeight: "900", letterSpacing: -0.6, marginTop: 6,
    fontVariant: ["tabular-nums"],
  },
  tileNote: { fontSize: 11, fontWeight: "600", marginTop: 2, lineHeight: 15 },

  totalRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingTop: 14, borderTopWidth: 1,
  },
  totalLabel: { flex: 1, fontSize: 13, fontWeight: "700" },
  totalValue: { fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"] },
});

export default StudyTimeCard;
