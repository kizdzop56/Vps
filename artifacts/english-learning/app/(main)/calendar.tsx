// Календарь занятий: слоты учителя, записи учеников, запросы своего времени
// и история проведённых уроков.
//
// Эмодзи в интерфейсе не используются: в пустых состояниях, предупреждениях и
// на кнопках подтверждения стоят глифы из своего набора. Аватары учеников
// приходят из профиля — там, где картинки нет, показываем первую букву имени.
//
// Оформление собрано из GameKit: физические кнопки и вкладки, карточки с
// цветной тенью в цвете статуса, пилюли. Логика экрана не менялась.
//
// Что переделано в разборе:
//  • Месячная сетка занимала пол-экрана при каждом заходе, а сами занятия
//    начинались за сгибом. Теперь наверху полоса из семи дней, а месяц
//    выезжает снизу по кнопке — он нужен, чтобы прыгнуть на другую дату,
//    а не чтобы смотреть на него постоянно.
//  • Заголовок «Календарь» дублировал подпись вкладки внизу экрана. Вместо
//    него — выбранная дата и день недели.
//  • Слоты стояли одинаковыми плитками, время пряталось внутри карточки.
//    Теперь время отдельной колонкой слева: видна вертикаль дня и промежутки
//    между уроками.
//  • Появилась линия «сейчас» — отсечка текущего момента внутри дня.
//  • Свободный слот рисуется пунктиром: занятое и незанятое различаются
//    формой, а не подписью мелким шрифтом.
//  • Верхний отступ берётся из constants/layout.ts. Раньше здесь было
//    insets.top + 67: лишние 67 пикселей оставляли над заголовком пустую
//    полосу примерно в восьмую часть экрана.
//
// Цветная полоса слева у карточек (borderLeftWidth: 4) убрана ещё раньше:
// полоса читается как след от вёрстки, а не как смысл. Статус несут заливка,
// рамка и пилюля. Наклоны тоже убраны — как на остальных вкладках.
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
  ActivityIndicator, TextInput, RefreshControl, Modal, Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import authStorage from "@/utils/authStorage";
import ConfirmModal from "@/components/ConfirmModal";
import { useCalendarBadge } from "@/contexts/CalendarBadgeContext";
import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { ChunkyButton, Pill } from "@/components/ui/GameKit";
import { accents, gradients, radii } from "@/constants/theme";
import { screenTop } from "@/constants/layout";

// ── API helper ────────────────────────────────────────────────────────
const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string, options?: RequestInit) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE_URL}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token ?? ""}`,
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────
type SlotBooking = {
  id: number; slotId: number; studentId: number;
  studentName: string | null; status: string; note: string | null;
};
type TeacherSlot = {
  id: number; teacherId: number; date: string;
  startTime: string; endTime: string; bookings: SlotBooking[];
};
type StudentSlot = {
  id: number; teacherId: number; teacherName: string | null;
  date: string; startTime: string; endTime: string;
  status: "available" | "pending" | "confirmed_me" | "unavailable";
  myBookingId: number | null;
};
type BookingRow = {
  id: number; slotId: number; status: string; note: string | null;
  createdAt: string; date: string | null; startTime: string | null; endTime: string | null;
  studentName?: string | null; teacherName?: string | null;
};
type CustomRequest = {
  id: number; studentId: number; teacherId: number;
  date: string; startTime: string; endTime: string;
  note: string | null; status: string; createdAt: string;
  studentName?: string | null; teacherName?: string | null;
};
type TeacherBasic = { id: number; name: string | null; username: string };
type LessonHistoryItem = {
  id: number; teacherId: number; date: string; startTime: string; endTime: string;
  confirmedBookings: {
    bookingId: number; slotId: number; studentId: number;
    studentName: string | null; studentSurname: string | null; studentUsername: string | null;
    studentEmoji: string | null; studentColor: string | null;
    note: string | null;
  }[];
};

// ── Date / time helpers ───────────────────────────────────────────────
const DAY_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const DAY_FULL = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MONTH_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
/** Родительный падеж — для строки «4 августа». */
const MONTH_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
const MONTH_FULL = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
// Неделя начинается с понедельника — как в русских календарях.
const WEEK_HEAD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayStr() { return localDateStr(); }

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}
function formatDateWithDay(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}, ${DAY_SHORT[d.getDay()]}`;
}

/**
 * Человеческая подпись дня: «сегодня», «завтра» или дата с днём недели.
 * Нужна карточке ближайшего занятия — «завтра в 17:00» читается быстрее,
 * чем «5 авг, Ср, 17:00».
 */
function humanDay(dateStr: string): string {
  const today = todayStr();
  if (dateStr === today) return "сегодня";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateStr === localDateStr(tomorrow)) return "завтра";
  return formatDateWithDay(dateStr);
}

/** «сегодня» / «завтра» / «вторник» — подпись под крупной датой в шапке. */
function dayCaption(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const weekday = DAY_FULL[d.getDay()];
  const today = todayStr();
  if (dateStr === today) return `${weekday} · сегодня`;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateStr === localDateStr(tomorrow)) return `${weekday} · завтра`;
  return weekday;
}

/** Первая буква имени для аватара без картинки. Пропускаем знаки и пробелы. */
function initialOf(name?: string | null, fallback = "У") {
  const m = (name ?? "").match(/[\p{L}\p{N}]/u);
  return (m?.[0] ?? fallback).toUpperCase();
}

/** Понедельник недели, в которую попадает дата. */
function weekStart(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00");
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

/** Семь дат недели, начиная с понедельника. */
function buildWeek(anchor: string): string[] {
  const start = weekStart(anchor);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return localDateStr(d);
  });
}

/**
 * Сетка месяца: массив недель по 7 ячеек, null — «чужой» день (до 1-го или
 * после последнего числа). Смещение считается от понедельника:
 * getDay() отдаёт 0 для воскресенья, поэтому (getDay() + 6) % 7.
 */
function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(localDateStr(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ── Past-slot helper ──────────────────────────────────────────────────
function isPastSlot(date: string, endTime: string): boolean {
  const now = new Date();
  const todayLocal = localDateStr(now);
  if (date < todayLocal) return true;
  if (date > todayLocal) return false;
  const [h, m] = endTime.split(":").map(Number);
  const slotEnd = new Date();
  slotEnd.setHours(h, m, 0, 0);
  return slotEnd <= now;
}

/** «через 12 минут» / «идёт сейчас» — подпись у ближайшего слота дня. */
function untilLabel(date: string, startTime: string, endTime: string): string | null {
  if (date !== todayStr()) return null;
  const now = new Date();
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (nowMin >= startMin && nowMin < endMin) return "идёт сейчас";
  const diff = startMin - nowMin;
  if (diff <= 0 || diff > 180) return null;
  if (diff < 60) return `через ${diff} мин`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m === 0 ? `через ${h} ч` : `через ${h} ч ${m} мин`;
}

// Wheel picker data
const HOURS   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const WHEEL_ITEM_H = 52;
const WHEEL_VISIBLE = 5;

// ── WheelColumn ───────────────────────────────────────────────────────
// Scrollable drum-roll column — iOS style
type WheelColumnProps = {
  items: string[]; value: string; onChange: (v: string) => void;
  fg: string; muted: string; hlColor: string;
};
function WheelColumn({ items, value, onChange, fg, muted, hlColor }: WheelColumnProps) {
  const ref        = useRef<ScrollView>(null);
  const lastY      = useRef(0);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localVal, setLocalVal] = useState(value);

  const scrollTo = (i: number, animated = true) =>
    ref.current?.scrollTo({ y: i * WHEEL_ITEM_H, animated });

  useEffect(() => {
    const i = items.indexOf(value);
    if (i >= 0) setTimeout(() => scrollTo(i, false), 50);
  }, []);

  // Re-sync the wheel when `value` is changed externally (e.g. auto-advance
  // after adding a slot), not just from the user's own scroll gesture.
  useEffect(() => {
    if (value === localVal) return;
    const i = items.indexOf(value);
    if (i >= 0) {
      setLocalVal(value);
      scrollTo(i, false);
    }
  }, [value]);

  const commit = (y: number) => {
    const i = Math.max(0, Math.min(Math.round(y / WHEEL_ITEM_H), items.length - 1));
    scrollTo(i, true);
    setLocalVal(items[i]);
    onChange(items[i]);
  };

  const handleScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    lastY.current = y;
    // Live visual highlight
    const i = Math.max(0, Math.min(Math.round(y / WHEEL_ITEM_H), items.length - 1));
    if (items[i] !== localVal) setLocalVal(items[i]);
    // Debounce-commit after 160ms without scroll
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => commit(lastY.current), 160);
  };

  const handleScrollEnd = (e: any) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commit(e.nativeEvent.contentOffset.y);
  };

  return (
    <View style={{ width: 70, height: WHEEL_ITEM_H * WHEEL_VISIBLE, overflow: "hidden" }}>
      {/* Selection highlight bar */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: WHEEL_ITEM_H * 2, height: WHEEL_ITEM_H,
          left: 0, right: 0, zIndex: 1,
          backgroundColor: hlColor,
          borderRadius: radii.sm - 2,
        }}
      />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingVertical: WHEEL_ITEM_H * 2 }}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
      >
        {items.map((item, i) => {
          const sel = item === localVal;
          return (
            <TouchableOpacity
              key={item}
              style={{ height: WHEEL_ITEM_H, justifyContent: "center", alignItems: "center" }}
              onPress={() => { setLocalVal(item); onChange(item); scrollTo(i); }}
              activeOpacity={0.7}
            >
              {/* Табличные цифры: при прокрутке колонка не «дышит» по ширине. */}
              <Text style={{
                fontSize: sel ? 28 : 20,
                fontWeight: sel ? "800" : "500",
                color: sel ? fg : muted,
                opacity: sel ? 1 : 0.55,
                fontVariant: ["tabular-nums"],
              }}>
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Статусы слота для ученика. Значки — из собственного набора: цвет управляется
// темой, вид одинаков на iOS, Android и в вебе.
const STATUS_CFG: Record<string, { label: string; color: string; icon: GlyphName }> = {
  available:    { label: "Свободно",  color: "#6366f1", icon: "target" },
  pending:      { label: "Ожидает",   color: "#ec4899", icon: "clock"  },
  confirmed_me: { label: "Записан",   color: "#8b5cf6", icon: "check"  },
  unavailable:  { label: "Занято",    color: "#e11d48", icon: "close"  },
};
const BOOKING_CFG: Record<string, { label: string; color: string; icon: GlyphName }> = {
  pending:   { label: "Ожидает",      color: "#ec4899", icon: "clock" },
  confirmed: { label: "Подтверждено", color: "#8b5cf6", icon: "check" },
  rejected:  { label: "Отклонено",    color: "#e11d48", icon: "close" },
};

// Цвета точек занятости. Совпадают с палитрой: success / warning / primary.
const DOT_LESSON  = "#8b5cf6"; // занятие подтверждено
const DOT_PENDING = "#ec4899"; // есть заявка в ожидании
const DOT_FREE    = "#6366f1"; // есть свободный слот

// Сколько дней в месяце занимает один день сетки — для сводки по дню.
type DayMeta = { free: number; pending: number; lesson: number; past: number };
const EMPTY_META: DayMeta = { free: 0, pending: 0, lesson: 0, past: 0 };

// ── Component ─────────────────────────────────────────────────────────
export default function CalendarScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isTeacherRole = user?.role === "teacher" || user?.role === "admin";
  const { markSeen } = useCalendarBadge();

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [slots, setSlots] = useState<TeacherSlot[] | StudentSlot[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"schedule" | "requests" | "history">("schedule");
  const [lessonHistory, setLessonHistory] = useState<LessonHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Обзор месяца: все слоты (без параметра date) — нужен для точек занятости
  // в полосе недели, в сетке месяца и для карточки ближайшего занятия.
  const [monthSlots, setMonthSlots] = useState<(TeacherSlot | StudentSlot)[]>([]);
  // Первое число месяца, открытого в модалке.
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  // Сетка месяца открывается по кнопке: в обычном режиме хватает недели.
  const [showMonth, setShowMonth] = useState(false);

  // Delete confirm
  const [deleteSlotId, setDeleteSlotId] = useState<number | null>(null);
  const scheduleScrollRef = useRef<import("react-native").ScrollView>(null);

  // Bookings filter (student)
  const [bookingFilter, setBookingFilter] = useState<"all" | "pending" | "confirmed" | "rejected">("all");

  // Add-slot modal (teacher)
  const [showAdd, setShowAdd] = useState(false);
  const [addStartH, setAddStartH] = useState("09");
  const [addStartM, setAddStartM] = useState("00");
  const [addEndH, setAddEndH] = useState("10");
  const [addEndM, setAddEndM] = useState("00");
  const [saving, setSaving] = useState(false);

  // Book-slot modal (student)
  const [bookSlot, setBookSlot] = useState<StudentSlot | null>(null);
  const [bookNote, setBookNote] = useState("");
  const [booking, setBooking] = useState(false);

  // Custom time request (student)
  const [customRequests, setCustomRequests] = useState<CustomRequest[]>([]);
  const [showCustomReq, setShowCustomReq] = useState(false);
  const [crTeachers, setCrTeachers] = useState<TeacherBasic[]>([]);
  const [crTeacherId, setCrTeacherId] = useState<number | null>(null);
  const [crStartH, setCrStartH] = useState("09");
  const [crStartM, setCrStartM] = useState("00");
  const [crEndH, setCrEndH] = useState("10");
  const [crEndM, setCrEndM] = useState("00");
  const [crNote, setCrNote] = useState("");
  const [crSaving, setCrSaving] = useState(false);
  const [crError, setCrError] = useState<string | null>(null);

  // Assign student modal (teacher)
  const [assignSlot, setAssignSlot] = useState<TeacherSlot | null>(null);
  const [assignStudents, setAssignStudents] = useState<{ id: number; name: string | null; surname: string | null; username: string; avatarEmoji: string | null; avatarColor: string | null }[]>([]);
  const [assignStudentId, setAssignStudentId] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // ── Data loading ────────────────────────────────────────────────────
  const loadSlots = useCallback(async (date: string) => {
    const data = await apiFetch(`/api/calendar/slots?date=${date}`).catch(() => []);
    setSlots(data);
  }, []);

  // Тот же роут без date отдаёт все слоты (учителю — свои, ученику — от
  // сегодня и дальше), поэтому обзор месяца не требует отдельного эндпоинта.
  const loadMonthSlots = useCallback(async () => {
    const data = await apiFetch("/api/calendar/slots").catch(() => []);
    setMonthSlots(Array.isArray(data) ? data : []);
  }, []);

  const loadBookings = useCallback(async () => {
    const data = await apiFetch("/api/calendar/bookings").catch(() => []);
    setBookings(data);
  }, []);

  const loadCustomRequests = useCallback(async () => {
    const data = await apiFetch("/api/calendar/custom-requests").catch(() => []);
    setCustomRequests(data);
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const data = await apiFetch("/api/calendar/history").catch(() => []);
    setLessonHistory(data);
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadSlots(selectedDate), loadMonthSlots(), loadBookings(), loadCustomRequests()])
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadSlots(selectedDate); }, [selectedDate]);

  // Refresh every time this screen comes into focus (e.g. switching tabs,
  // coming back from another screen, or right after a teacher adds a
  // student) so newly available slots/connections show up immediately
  // instead of waiting on the polling interval below.
  useFocusEffect(
    useCallback(() => {
      loadSlots(selectedDate);
      loadMonthSlots();
      loadBookings();
      loadCustomRequests();
    }, [selectedDate, loadSlots, loadMonthSlots, loadBookings, loadCustomRequests]),
  );

  // Auto-refresh every 10 s so past slots disappear and new ones/connections
  // appear without needing a manual tab switch.
  useEffect(() => {
    const id = setInterval(() => {
      loadSlots(selectedDate);
      loadMonthSlots();
      loadBookings();
      loadCustomRequests();
    }, 10_000);
    return () => clearInterval(id);
  }, [selectedDate, loadSlots, loadMonthSlots, loadBookings, loadCustomRequests]);

  // Also refresh when browser tab becomes visible (web)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        loadSlots(selectedDate);
        loadMonthSlots();
        loadBookings();
        loadCustomRequests();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
      return () => document.removeEventListener("visibilitychange", onVisible);
    }
  }, [selectedDate, loadSlots, loadMonthSlots, loadBookings, loadCustomRequests]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const tasks: Promise<any>[] = [loadSlots(selectedDate), loadMonthSlots(), loadBookings(), loadCustomRequests()];
    if (activeTab === "history") tasks.push(loadHistory());
    await Promise.all(tasks);
    setRefreshing(false);
  }, [selectedDate, loadSlots, loadMonthSlots, loadBookings, loadCustomRequests, loadHistory, activeTab]);

  // ── Занятость по дням ───────────────────────────────────────────────
  // Каждый слот попадает ровно в одну корзину: прошедший / занятие /
  // ожидает / свободен — иначе точки в ячейке врали бы о состоянии дня.
  const dayMeta = useMemo(() => {
    const map: Record<string, DayMeta> = {};
    for (const slot of monthSlots) {
      const acc = map[slot.date] ?? { free: 0, pending: 0, lesson: 0, past: 0 };
      if (isPastSlot(slot.date, slot.endTime)) {
        acc.past += 1;
      } else if (isTeacherRole) {
        const list = (slot as TeacherSlot).bookings ?? [];
        if (list.some((b) => b.status === "confirmed")) acc.lesson += 1;
        else if (list.some((b) => b.status === "pending")) acc.pending += 1;
        else acc.free += 1;
      } else {
        const st = (slot as StudentSlot).status;
        if (st === "confirmed_me") acc.lesson += 1;
        else if (st === "pending") acc.pending += 1;
        else if (st === "available") acc.free += 1;
        else acc.past += 1; // unavailable — занято другим учеником, для меня не слот
      }
      map[slot.date] = acc;
    }
    return map;
  }, [monthSlots, isTeacherRole]);

  /**
   * Ближайшее подтверждённое занятие.
   *
   * Главный вопрос к календарю — «когда у меня следующий урок». Ищем среди уже
   * загруженных слотов месяца, лишнего запроса не нужно.
   */
  const nextLesson = useMemo(() => {
    const upcoming = monthSlots
      .filter((slot) => {
        if (isPastSlot(slot.date, slot.endTime)) return false;
        if (isTeacherRole) {
          return ((slot as TeacherSlot).bookings ?? []).some((b) => b.status === "confirmed");
        }
        return (slot as StudentSlot).status === "confirmed_me";
      })
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    return upcoming[0] ?? null;
  }, [monthSlots, isTeacherRole]);

  // Ближайшие дни, где что-то есть — подсказка вместо пустого экрана.
  const nextBusyDates = useMemo(() => {
    return Object.entries(dayMeta)
      .filter(([date, m]) => date > selectedDate && (m.free + m.pending + m.lesson) > 0)
      .map(([date]) => date)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 3);
  }, [dayMeta, selectedDate]);

  const selectedMeta = dayMeta[selectedDate] ?? EMPTY_META;
  const weekDates = useMemo(() => buildWeek(selectedDate), [selectedDate]);

  /** Перейти на дату: синхронизируем и неделю, и месяц в модалке. */
  const goToDate = useCallback((date: string) => {
    const d = new Date(date + "T00:00:00");
    setMonthAnchor(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelectedDate(date);
    setShowMonth(false);
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────
  const handleAddSlot = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await apiFetch("/api/calendar/slots", {
        method: "POST",
        body: JSON.stringify({ date: selectedDate, startTime: `${addStartH}:${addStartM}`, endTime: `${addEndH}:${addEndM}` }),
      });
      setShowAdd(false);
      // Advance the picker to start right after this slot's end time,
      // so re-opening "Добавить слот" doesn't offer the same (now taken) time again.
      setAddStartH(addEndH);
      setAddStartM(addEndM);
      const nextEndTotal = (Number(addEndH) * 60 + Number(addEndM) + 60) % (24 * 60);
      setAddEndH(String(Math.floor(nextEndTotal / 60)).padStart(2, "0"));
      setAddEndM(String(nextEndTotal % 60).padStart(2, "0"));
      await Promise.all([loadSlots(selectedDate), loadMonthSlots()]);
      // Defer scroll until after React re-renders with the new slot
      setTimeout(() => scheduleScrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
    } catch (e: any) { Alert.alert("Ошибка", e.message); }
    finally { setSaving(false); }
  };

  const handleDeleteSlot = (slotId: number) => setDeleteSlotId(slotId);

  const doDeleteSlot = async () => {
    if (!deleteSlotId) return;
    await apiFetch(`/api/calendar/slots/${deleteSlotId}`, { method: "DELETE" }).catch(() => {});
    setDeleteSlotId(null);
    await Promise.all([loadSlots(selectedDate), loadMonthSlots()]);
  };

  const handleBookSlot = async () => {
    if (!bookSlot || booking) return;
    setBooking(true);
    try {
      await apiFetch(`/api/calendar/slots/${bookSlot.id}/book`, {
        method: "POST",
        body: JSON.stringify({ note: bookNote.trim() || undefined }),
      });
      setBookSlot(null); setBookNote("");
      await Promise.all([loadSlots(selectedDate), loadMonthSlots(), loadBookings()]);
    } catch (e: any) { Alert.alert("Ошибка", e.message); }
    finally { setBooking(false); }
  };

  const handleCancelBooking = async (bookingId: number) => {
    await apiFetch(`/api/calendar/bookings/${bookingId}`, { method: "DELETE" }).catch(() => {});
    await Promise.all([loadSlots(selectedDate), loadMonthSlots(), loadBookings()]);
  };

  const handleRespond = async (bookingId: number, status: "confirmed" | "rejected") => {
    try {
      await apiFetch(`/api/calendar/bookings/${bookingId}`, {
        method: "PATCH", body: JSON.stringify({ status }),
      });
      await Promise.all([loadSlots(selectedDate), loadMonthSlots(), loadBookings(), loadCustomRequests()]);
    } catch (e: any) { /* silent on web */ }
  };

  const handleRespondCustom = async (requestId: number, status: "confirmed" | "rejected") => {
    try {
      await apiFetch(`/api/calendar/custom-requests/${requestId}`, {
        method: "PATCH", body: JSON.stringify({ status }),
      });
      await Promise.all([loadSlots(selectedDate), loadMonthSlots(), loadBookings(), loadCustomRequests()]);
    } catch (e: any) { /* silent on web */ }
  };

  const handleOpenCustomReq = async () => {
    const teachers = await apiFetch("/api/connections/student/teachers").catch(() => []);
    setCrTeachers(teachers);
    if (teachers.length > 0) setCrTeacherId(teachers[0].id);
    setCrStartH("09"); setCrStartM("00"); setCrEndH("10"); setCrEndM("00"); setCrNote("");
    setShowCustomReq(true);
  };

  const handleSendCustomReq = async () => {
    if (!crTeacherId || crSaving) return;
    const startTime = `${crStartH}:${crStartM}`;
    const endTime   = `${crEndH}:${crEndM}`;
    if (endTime <= startTime) return;
    setCrSaving(true);
    setCrError(null);
    try {
      await apiFetch("/api/calendar/custom-requests", {
        method: "POST",
        body: JSON.stringify({ teacherId: crTeacherId, date: selectedDate, startTime, endTime, note: crNote.trim() || undefined }),
      });
      setShowCustomReq(false);
      await loadCustomRequests();
      setActiveTab("requests");
    } catch (e: any) {
      setCrError(e?.message ?? "Не удалось отправить запрос. Убедитесь, что вы подключены к учителю.");
    } finally { setCrSaving(false); }
  };

  const handleOpenAssign = async (slot: TeacherSlot) => {
    setAssignSlot(slot);
    setAssignStudentId(null);
    setAssignError(null);
    const students = await apiFetch("/api/connections/teacher/students").catch(() => []);
    setAssignStudents(students);
  };

  const handleAssign = async () => {
    if (!assignSlot || !assignStudentId || assigning) return;
    setAssigning(true);
    setAssignError(null);
    try {
      await apiFetch(`/api/calendar/slots/${assignSlot.id}/assign`, {
        method: "POST",
        body: JSON.stringify({ studentId: assignStudentId }),
      });
      setAssignSlot(null);
      await Promise.all([loadSlots(selectedDate), loadMonthSlots(), loadHistory()]);
      setActiveTab("history");
    } catch (e: any) {
      setAssignError(e?.message ?? "Не удалось назначить ученика");
    } finally { setAssigning(false); }
  };

  // ── Styles ──────────────────────────────────────────────────────────
  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    // ── Шапка ──
    // Заголовка «Календарь» нет: вкладка уже подписана в нижней панели, а
    // место наверху дороже. Здесь выбранная дата и главное действие.
    header: {
      flexDirection: "row", alignItems: "flex-start", gap: 12,
      paddingTop: screenTop(insets),
      paddingHorizontal: 18, paddingBottom: 2,
    },
    headDate: { fontSize: 26, fontWeight: "900", letterSpacing: -0.8, color: colors.foreground },
    headCaption: { fontSize: 12.5, fontWeight: "700", color: colors.mutedForeground, marginTop: 5 },
    headBtnEdge: {
      position: "absolute", left: 0, right: 0, top: 4, bottom: 0, borderRadius: radii.pill,
    },
    headBtn: {
      flexDirection: "row", alignItems: "center", gap: 7,
      paddingHorizontal: 15, paddingVertical: 11, borderRadius: radii.pill,
    },
    headBtnText: { fontSize: 13, fontWeight: "900", color: "#fff" },

    // ── Вкладки ──
    tabRow: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 12, gap: 6 },
    tab: {
      flex: 1, paddingVertical: 10, borderRadius: radii.sm + 2, alignItems: "center",
      flexDirection: "row", justifyContent: "center", gap: 6,
      backgroundColor: "rgba(255,255,255,0.5)",
      borderWidth: 1, borderColor: colors.border,
    },
    tabActive: {
      backgroundColor: colors.card, borderColor: "transparent",
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.24, shadowRadius: 11, elevation: 5,
    },
    tabText: { fontSize: 13, fontWeight: "700", color: colors.mutedForeground },
    tabTextActive: { color: accents.violetDeep, fontWeight: "800" },
    badge: {
      backgroundColor: colors.destructive, borderRadius: 9,
      minWidth: 18, height: 18, justifyContent: "center", alignItems: "center", paddingHorizontal: 4,
    },
    badgeText: { fontSize: 10, fontWeight: "900", color: "#fff", fontVariant: ["tabular-nums"] },

    // ── Ближайшее занятие ──
    nextCard: {
      borderRadius: radii.lg, padding: 15, marginBottom: 14,
      flexDirection: "row", alignItems: "center", gap: 13,
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.36, shadowRadius: 20, elevation: 7,
      overflow: "hidden",
    },
    nextIcon: {
      width: 48, height: 48, borderRadius: radii.md,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center", justifyContent: "center",
    },
    nextLabel: {
      fontSize: 10, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase",
      color: "rgba(255,255,255,0.72)",
    },
    nextWhen: { fontSize: 18, fontWeight: "900", letterSpacing: -0.4, color: "#fff", marginTop: 4 },
    nextWho: { fontSize: 12, color: "rgba(255,255,255,0.82)", marginTop: 4 },

    // ── Полоса недели ──
    weekCard: {
      backgroundColor: colors.card, borderRadius: radii.lg,
      paddingVertical: 12, paddingHorizontal: 10, marginBottom: 14,
      borderWidth: 1, borderColor: colors.border,
      shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.11, shadowRadius: 15, elevation: 4,
    },
    weekHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, paddingBottom: 11 },
    weekMonth: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.foreground, letterSpacing: -0.1 },
    monthBtn: {
      flexDirection: "row", alignItems: "center", gap: 5,
      paddingHorizontal: 11, paddingVertical: 6, borderRadius: radii.pill,
      backgroundColor: colors.primary + "1a",
    },
    monthBtnText: { fontSize: 11.5, fontWeight: "800", color: accents.violetDeep },
    weekRow: { flexDirection: "row", gap: 4 },
    // Высота ячейки фиксирована: иначе выбранный день с заливкой выглядел
    // выше соседних, и полоса недели «прыгала» при переключении.
    dayCell: {
      flex: 1, height: 62, borderRadius: 14,
      alignItems: "center", justifyContent: "center", overflow: "hidden",
    },
    dayW: { fontSize: 10.5, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.3 },
    dayN: { fontSize: 17, fontWeight: "800", color: colors.foreground, marginTop: 5, fontVariant: ["tabular-nums"] },
    dotRow: { flexDirection: "row", gap: 2.5, height: 5, marginTop: 5, alignItems: "center" },
    dot: { width: 5, height: 5, borderRadius: 2.5 },

    // ── Сводка дня ──
    summary: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7, marginBottom: 13 },
    summaryDone: { marginLeft: "auto", fontSize: 11.5, fontWeight: "700", color: colors.mutedForeground, fontVariant: ["tabular-nums"] },

    // ── Строка расписания ──
    // Время отдельной колонкой: видна вертикаль дня и промежутки между уроками.
    slotRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
    slotTimeCol: { width: 46, paddingTop: 13, alignItems: "flex-end" },
    slotFrom: { fontSize: 14, fontWeight: "800", color: colors.foreground, fontVariant: ["tabular-nums"] },
    slotTo: { fontSize: 11, fontWeight: "600", color: colors.mutedForeground, marginTop: 4, fontVariant: ["tabular-nums"] },

    card: {
      flex: 1, borderRadius: radii.md, borderWidth: 1.5, padding: 12,
      backgroundColor: colors.card,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12, shadowRadius: 13, elevation: 3,
    },
    cardRow: { flexDirection: "row", alignItems: "center", gap: 9 },
    cardWho: { fontSize: 14.5, fontWeight: "800", color: colors.foreground },
    cardMeta: { fontSize: 12, fontWeight: "600", color: colors.mutedForeground, marginTop: 3 },
    cardNote: {
      fontSize: 12.5, color: colors.mutedForeground, fontStyle: "italic",
      marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border,
    },
    avatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    avatarText: { color: "#fff", fontWeight: "900", fontSize: 14 },

    acts: {
      flexDirection: "row", gap: 8, marginTop: 10, paddingTop: 10,
      borderTopWidth: 1, borderTopColor: colors.border,
    },
    act: { flex: 1, paddingVertical: 10, borderRadius: radii.sm, alignItems: "center" },
    actText: { fontSize: 13, fontWeight: "800" },

    // ── Линия «сейчас» ──
    nowLine: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, marginTop: 2 },
    nowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: accents.magenta },
    nowText: { fontSize: 10.5, fontWeight: "900", color: accents.magenta, letterSpacing: 0.5, fontVariant: ["tabular-nums"] },
    nowRule: { flex: 1, height: 1.5, backgroundColor: accents.magenta + "55", borderRadius: 1 },

    scroll: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 120 },
    historyLabel: {
      fontSize: 11, fontWeight: "800", color: colors.mutedForeground,
      textAlign: "center", marginVertical: 14, letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    filterChip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill,
      backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    },
    filterChipActive: {
      backgroundColor: colors.primary + "18", borderColor: colors.primary,
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.22, shadowRadius: 8, elevation: 3,
    },
    filterChipText: { fontSize: 12.5, fontWeight: "700", color: colors.mutedForeground },
    filterChipTextActive: { color: colors.primary },

    emptyBox: { alignItems: "center", paddingVertical: 28, gap: 11, paddingHorizontal: 24 },
    emptyIcon: {
      width: 62, height: 62, borderRadius: 20, alignItems: "center", justifyContent: "center",
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 9 },
      shadowOpacity: 0.32, shadowRadius: 20, elevation: 7,
    },
    emptyTitle: { fontSize: 16, fontWeight: "900", color: colors.foreground, letterSpacing: -0.3, textAlign: "center" },
    emptyText: { fontSize: 13, fontWeight: "600", color: colors.mutedForeground, textAlign: "center", lineHeight: 19 },

    warnRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 6, marginBottom: 10, paddingHorizontal: 8,
    },
    warnText: { fontSize: 13, fontWeight: "700", flexShrink: 1 },

    addBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
      borderRadius: radii.md, borderWidth: 2, borderStyle: "dashed", borderColor: colors.primary,
      padding: 15, marginTop: 4,
    },
    addBtnText: { fontSize: 15, fontWeight: "800", color: colors.primary },

    jumpChip: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill,
      backgroundColor: colors.primary + "14", borderWidth: 1, borderColor: colors.primary + "40",
    },
    jumpChipText: { fontSize: 12, fontWeight: "800", color: accents.violetDeep },

    statusLabel: { fontSize: 12, fontWeight: "800" },

    // ── Модалки ──
    overlay: { flex: 1, backgroundColor: "#00000070", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
      paddingTop: 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24,
    },
    handle: {
      width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
      alignSelf: "center", marginBottom: 18,
    },
    sheetTitle: { fontSize: 19, fontWeight: "900", letterSpacing: -0.3, color: colors.foreground, marginBottom: 18 },
    timeLabel: {
      fontSize: 11, fontWeight: "800", color: colors.mutedForeground, marginBottom: 12,
      textTransform: "uppercase", letterSpacing: 1, textAlign: "center",
    },
    wheelRow: { flexDirection: "row", alignItems: "center" },
    wheelColon: { fontSize: 32, fontWeight: "800", color: colors.foreground, marginHorizontal: 2, lineHeight: WHEEL_ITEM_H * WHEEL_VISIBLE },
    noteInput: {
      borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.sm,
      padding: 12, fontSize: 14, color: colors.foreground,
      backgroundColor: colors.muted, minHeight: 64, textAlignVertical: "top", marginBottom: 10,
    },
    errorBox: {
      backgroundColor: colors.destructive + "12", borderRadius: radii.sm, padding: 11, marginBottom: 10,
      borderWidth: 1, borderColor: colors.destructive + "44",
      flexDirection: "row", alignItems: "center", gap: 9,
    },

    // ── Сетка месяца в модалке ──
    monthHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
    monthTitle: { flex: 1, fontSize: 17, fontWeight: "900", letterSpacing: -0.35, color: colors.foreground, textAlign: "center" },
    monthNav: {
      width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center",
      backgroundColor: colors.muted,
    },
    mWeekRow: { flexDirection: "row" },
    mHeadCell: { flex: 1, alignItems: "center", paddingBottom: 8 },
    mHeadText: { fontSize: 10, fontWeight: "800", color: colors.mutedForeground },
    mCell: {
      flex: 1, aspectRatio: 1, margin: 1.5, borderRadius: 12,
      alignItems: "center", justifyContent: "center", overflow: "hidden",
    },
    mCellFilled: { backgroundColor: colors.muted },
    mNum: { fontSize: 14, fontWeight: "700", color: colors.foreground, fontVariant: ["tabular-nums"] },
    mNumActive: { color: "#fff", fontWeight: "900" },
    legendRow: {
      flexDirection: "row", gap: 14, marginTop: 14, paddingTop: 13,
      borderTopWidth: 1, borderTopColor: colors.border,
    },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendText: { fontSize: 11, color: colors.mutedForeground, fontWeight: "700" },

    // ── Карточки запросов / записей ──
    reqCard: {
      borderRadius: radii.md, borderWidth: 1.5,
      backgroundColor: colors.card, marginBottom: 12, padding: 14, gap: 10,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.13, shadowRadius: 14, elevation: 4,
    },
    reqTop: { flexDirection: "row", alignItems: "center", gap: 12 },
    reqAvatar: {
      width: 40, height: 40, borderRadius: radii.sm, justifyContent: "center", alignItems: "center",
    },
    reqName: { flex: 1, fontSize: 15, fontWeight: "800", color: colors.foreground },
    reqTime: { fontSize: 12, color: colors.mutedForeground, marginTop: 2, fontVariant: ["tabular-nums"] },
    reqNote: { fontSize: 13, color: colors.mutedForeground, fontStyle: "italic" },
    btnRow: { flexDirection: "row", gap: 8 },
    btnConfirm: {
      paddingHorizontal: 14, paddingVertical: 11, borderRadius: radii.sm,
      backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
    },
    btnReject: {
      paddingHorizontal: 14, paddingVertical: 11, borderRadius: radii.sm,
      backgroundColor: colors.destructive + "18", alignItems: "center", justifyContent: "center",
    },
    btnText: { fontSize: 13, fontWeight: "800", color: "#fff" },
    btnTextDanger: { fontSize: 13, fontWeight: "800", color: colors.destructive },
  });

  /**
   * Оформление карточки по цвету статуса: рамка, лёгкая заливка и тень.
   * Вынесено в одно место, чтобы статус везде выглядел одинаково и чтобы
   * цветную полосу слева нельзя было случайно вернуть.
   */
  const statusSkin = (color: string, muted = false) => ({
    borderColor: muted ? colors.border : color + "55",
    backgroundColor: muted ? colors.card : color + "0a",
    shadowColor: muted ? accents.violetDeep : color,
  });

  /** Пустое состояние: глиф в градиентной плашке плюс текст. */
  const renderEmpty = (glyph: GlyphName, title: string, text?: string) => (
    <View style={s.emptyBox}>
      <LinearGradient
        colors={gradients.action as unknown as string[]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={s.emptyIcon}
      >
        <Glyph name={glyph} size={27} color="#ffffff" />
      </LinearGradient>
      <Text style={s.emptyTitle}>{title}</Text>
      {!!text && <Text style={s.emptyText}>{text}</Text>}
    </View>
  );

  /** Предупреждение в модалке. */
  const renderWarn = (text: string, color: string) => (
    <View style={s.warnRow}>
      <Glyph name="alert" size={15} color={color} />
      <Text style={[s.warnText, { color }]}>{text}</Text>
    </View>
  );

  /** Аватар из буквы имени: используется, когда картинки профиля нет. */
  const renderLetterAvatar = (name: string | null | undefined, bg: string | null, size: number) => (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg ?? colors.primary }]}>
      <Text style={[s.avatarText, { fontSize: Math.round(size * 0.44) }]}>{initialOf(name)}</Text>
    </View>
  );

  // ── Ближайшее занятие ───────────────────────────────────────────────
  const renderNextLesson = () => {
    if (!nextLesson) return null;
    const who = isTeacherRole
      ? ((nextLesson as TeacherSlot).bookings ?? []).find((b) => b.status === "confirmed")?.studentName ?? "Ученик"
      : (nextLesson as StudentSlot).teacherName ?? "Учитель";
    return (
      <TouchableOpacity activeOpacity={0.9} onPress={() => goToDate(nextLesson.date)}>
        <LinearGradient
          colors={gradients.action as unknown as string[]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={s.nextCard}
        >
          <View style={s.nextIcon}>
            <Glyph name="calendar" size={23} color="#ffffff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.nextLabel}>Ближайшее занятие</Text>
            <Text style={s.nextWhen}>{humanDay(nextLesson.date)} в {nextLesson.startTime}</Text>
            <Text style={s.nextWho}>
              {isTeacherRole ? `с ${who}` : who} · до {nextLesson.endTime}
            </Text>
          </View>
          <Glyph name="chevron" size={19} color="#ffffff" />
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  // ── Полоса недели ───────────────────────────────────────────────────
  // Заменяет месячную сетку в обычном режиме: почти всегда нужна ближайшая
  // неделя, а квадрат из 35 чисел занимал пол-экрана при каждом заходе.
  const renderWeekStrip = () => {
    const today = todayStr();
    const anchor = new Date(selectedDate + "T00:00:00");
    return (
      <View style={s.weekCard}>
        <View style={s.weekHead}>
          <Text style={s.weekMonth}>{MONTH_FULL[anchor.getMonth()]} {anchor.getFullYear()}</Text>
          <Pressable
            style={({ pressed }) => [s.monthBtn, pressed && { opacity: 0.8 }]}
            onPress={() => {
              setMonthAnchor(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
              setShowMonth(true);
            }}
          >
            <Glyph name="calendar" size={12} color={accents.violetDeep} />
            <Text style={s.monthBtnText}>Месяц</Text>
          </Pressable>
        </View>

        <View style={s.weekRow}>
          {weekDates.map((date, i) => {
            const meta = dayMeta[date] ?? EMPTY_META;
            const active = date === selectedDate;
            const isToday = date === today;
            const isPastDay = date < today;
            const d = new Date(date + "T00:00:00");
            return (
              <Pressable
                key={date}
                onPress={() => setSelectedDate(date)}
                style={[
                  s.dayCell,
                  isToday && !active && { borderWidth: 1.5, borderColor: colors.primary + "70" },
                  isPastDay && !active && { opacity: 0.42 },
                  active && {
                    shadowColor: colors.primary, shadowOffset: { width: 0, height: 5 },
                    shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
                  },
                ]}
              >
                {active && (
                  <LinearGradient
                    colors={gradients.action as unknown as string[]}
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 0.9, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <Text style={[s.dayW, active && { color: "rgba(255,255,255,0.75)" }]}>{WEEK_HEAD[i]}</Text>
                <Text style={[
                  s.dayN,
                  active && { color: "#fff", fontWeight: "900" },
                  !active && isToday && { color: accents.violetDeep },
                ]}>
                  {d.getDate()}
                </Text>
                <View style={s.dotRow}>
                  {meta.lesson > 0 && <View style={[s.dot, { backgroundColor: active ? "#fff" : DOT_LESSON }]} />}
                  {meta.pending > 0 && <View style={[s.dot, { backgroundColor: active ? "#ffffffcc" : DOT_PENDING }]} />}
                  {meta.free > 0 && <View style={[s.dot, { backgroundColor: active ? "#ffffff99" : DOT_FREE }]} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  // ── Сводка дня ──────────────────────────────────────────────────────
  const renderDaySummary = () => {
    const chips: { icon: GlyphName; color: string; text: string }[] = [];
    if (selectedMeta.lesson > 0)  chips.push({ icon: "check",  color: DOT_LESSON,  text: `${selectedMeta.lesson} занятие` });
    if (selectedMeta.pending > 0) chips.push({ icon: "clock",  color: DOT_PENDING, text: `${selectedMeta.pending} ожидает` });
    if (selectedMeta.free > 0)    chips.push({ icon: "target", color: DOT_FREE,    text: `${selectedMeta.free} свободно` });

    if (chips.length === 0 && selectedMeta.past === 0) return null;

    return (
      <View style={s.summary}>
        {chips.map((c) => (
          <Pill key={c.text} text={c.text} icon={c.icon} tone="soft" color={c.color} />
        ))}
        {selectedMeta.past > 0 && (
          <Text style={s.summaryDone}>завершено: {selectedMeta.past}</Text>
        )}
      </View>
    );
  };

  /** Отсечка текущего момента внутри дня. */
  const renderNowLine = () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    return (
      <View style={s.nowLine}>
        <View style={s.nowDot} />
        <Text style={s.nowText}>{hh}:{mm}</Text>
        <View style={s.nowRule} />
      </View>
    );
  };

  // Подсказка «где слоты есть» — чтобы пустой день не был тупиком.
  const renderJumpHints = () => {
    if (nextBusyDates.length === 0) return null;
    return (
      <View style={{ alignItems: "center", marginTop: -4, marginBottom: 14 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, justifyContent: "center" }}>
          {nextBusyDates.map((date) => {
            const m = dayMeta[date] ?? EMPTY_META;
            return (
              <Pressable
                key={date}
                style={({ pressed }) => [s.jumpChip, pressed && { opacity: 0.8 }]}
                onPress={() => goToDate(date)}
              >
                <Glyph name="chevron" size={12} color={accents.violetDeep} />
                <Text style={s.jumpChipText}>
                  {formatDateWithDay(date)} · {m.free + m.pending + m.lesson}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  /** Обёртка строки расписания: колонка времени слева, карточка справа. */
  const renderSlotRow = (startTime: string, endTime: string, card: React.ReactNode, key: React.Key) => (
    <View key={key} style={s.slotRow}>
      <View style={s.slotTimeCol}>
        <Text style={s.slotFrom}>{startTime}</Text>
        <Text style={s.slotTo}>{endTime}</Text>
      </View>
      {card}
    </View>
  );

  // ── Слот учителя ────────────────────────────────────────────────────
  const renderTeacherSlotCard = (slot: TeacherSlot, dimmed = false) => {
    const pending = slot.bookings.filter((b) => b.status === "pending");
    const confirmed = slot.bookings.find((b) => b.status === "confirmed");
    const isBusy = !!confirmed;
    const accent = isBusy ? colors.success : pending.length > 0 ? colors.warning : colors.primary;
    const until = untilLabel(slot.date, slot.startTime, slot.endTime);

    const card = (
      <View style={[
        s.card,
        statusSkin(accent, dimmed),
        dimmed && { opacity: 0.5 },
        // Свободный слот — пунктир без заливки: пустое место должно выглядеть
        // пустым, а не такой же плотной карточкой, как занятое.
        !dimmed && !isBusy && pending.length === 0 && {
          borderStyle: "dashed", backgroundColor: "transparent",
          shadowOpacity: 0, elevation: 0,
        },
      ]}>
        <View style={s.cardRow}>
          {confirmed
            ? renderLetterAvatar(confirmed.studentName, null, 34)
            : pending.length > 0
              ? renderLetterAvatar(pending[0].studentName, colors.warning, 34)
              : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.cardWho, !isBusy && pending.length === 0 && { color: colors.mutedForeground }]} numberOfLines={1}>
              {confirmed?.studentName ?? (pending.length > 0 ? pending[0].studentName ?? "Ученик" : "Никто не записан")}
            </Text>
            <Text style={s.cardMeta}>
              {dimmed ? "урок прошёл"
                : until ? until
                : isBusy ? "занятие подтверждено"
                : pending.length > 0 ? `${pending.length} заявк${pending.length === 1 ? "а" : "и"}`
                : "окно открыто для учеников"}
            </Text>
          </View>
          <Pill
            text={dimmed ? "Завершён" : isBusy ? "Занятие" : pending.length > 0 ? "Заявка" : "Свободно"}
            tone="soft"
            color={dimmed ? colors.mutedForeground : accent}
          />
          <Pressable onPress={() => handleDeleteSlot(slot.id)} hitSlop={8} accessibilityLabel="Удалить слот">
            <Glyph name="trash" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {!!confirmed?.note && <Text style={s.cardNote}>«{confirmed.note}»</Text>}

        {/* Заявки решаются прямо здесь: раньше ради двух кнопок приходилось
            уходить на вкладку «Запросы» и терять контекст дня. */}
        {!dimmed && pending.map((b) => (
          <View key={b.id}>
            {!!b.note && <Text style={s.cardNote}>«{b.note}»</Text>}
            <View style={s.acts}>
              <Pressable
                style={({ pressed }) => [s.act, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
                onPress={() => handleRespond(b.id, "confirmed")}
              >
                <Text style={[s.actText, { color: "#fff" }]}>Подтвердить</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.act, { backgroundColor: colors.destructive + "18" }, pressed && { opacity: 0.85 }]}
                onPress={() => handleRespond(b.id, "rejected")}
              >
                <Text style={[s.actText, { color: colors.destructive }]}>Отклонить</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {!dimmed && !isBusy && pending.length === 0 && (
          <Pressable
            style={({ pressed }) => [
              s.act,
              { backgroundColor: colors.primary + "14", marginTop: 10 },
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => handleOpenAssign(slot)}
          >
            <Text style={[s.actText, { color: accents.violetDeep }]}>Назначить ученика</Text>
          </Pressable>
        )}
      </View>
    );

    return renderSlotRow(slot.startTime, slot.endTime, card, slot.id);
  };

  // ── Слот ученика ────────────────────────────────────────────────────
  const renderStudentSlotCard = (slot: StudentSlot, dimmed = false) => {
    const meta = STATUS_CFG[slot.status];
    const until = untilLabel(slot.date, slot.startTime, slot.endTime);
    const isFree = slot.status === "available";

    const card = (
      <View style={[
        s.card,
        statusSkin(meta.color, dimmed),
        dimmed && { opacity: 0.5 },
        !dimmed && isFree && {
          borderStyle: "dashed", backgroundColor: "transparent",
          shadowOpacity: 0, elevation: 0,
        },
      ]}>
        <View style={s.cardRow}>
          {!isFree && renderLetterAvatar(slot.teacherName, null, 34)}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.cardWho, isFree && { color: colors.mutedForeground }]} numberOfLines={1}>
              {slot.teacherName ?? "Учитель"}
            </Text>
            <Text style={s.cardMeta}>
              {dimmed ? "урок прошёл"
                : until ? until
                : isFree ? "окно для записи"
                : slot.status === "pending" ? "ждём ответа учителя"
                : "вы записаны"}
            </Text>
          </View>
          <Pill text={meta.label} tone="soft" color={dimmed ? colors.mutedForeground : meta.color} />
        </View>

        {!dimmed && isFree && (
          <View style={{ marginTop: 10 }}>
            <ChunkyButton label="Записаться" icon="check" onPress={() => setBookSlot(slot)} />
          </View>
        )}

        {!dimmed && slot.status === "pending" && slot.myBookingId && (
          <Pressable
            style={({ pressed }) => [
              s.act, { backgroundColor: colors.muted, borderWidth: 1.5, borderColor: colors.border, marginTop: 10 },
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => handleCancelBooking(slot.myBookingId!)}
          >
            <Text style={[s.actText, { color: colors.mutedForeground }]}>Отменить запрос</Text>
          </Pressable>
        )}
      </View>
    );

    return renderSlotRow(slot.startTime, slot.endTime, card, slot.id);
  };

  /**
   * День расписания: прошедшие слоты, линия «сейчас», предстоящие.
   * Линия рисуется только сегодня и только если день реально разделён.
   */
  const renderDaySchedule = (
    past: (TeacherSlot | StudentSlot)[],
    active: (TeacherSlot | StudentSlot)[],
    renderCard: (slot: any, dimmed: boolean) => React.ReactNode,
  ) => {
    const isToday = selectedDate === todayStr();
    return (
      <>
        {past.map((slot) => renderCard(slot, true))}
        {isToday && past.length > 0 && active.length > 0 && renderNowLine()}
        {active.map((slot) => renderCard(slot, false))}
      </>
    );
  };

  // ── Учитель: расписание ─────────────────────────────────────────────
  const renderTeacherSchedule = () => {
    const daySlots = slots as TeacherSlot[];
    const active = daySlots.filter((sl) => !isPastSlot(sl.date, sl.endTime));
    const past   = daySlots.filter((sl) =>  isPastSlot(sl.date, sl.endTime));
    return (
      <ScrollView
        ref={scheduleScrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {renderNextLesson()}
        {renderWeekStrip()}
        {renderDaySummary()}

        {daySlots.length === 0 && (
          <>
            {renderEmpty("calendar", `На ${formatDate(selectedDate)} слотов нет`, "Добавьте время, и ученики смогут записаться")}
            {renderJumpHints()}
          </>
        )}
        {daySlots.length > 0 && active.length === 0 && past.length > 0 &&
          renderEmpty("check", "Все занятия завершены", "На этот день больше ничего не запланировано")}

        {renderDaySchedule(past, active, (slot, dimmed) => renderTeacherSlotCard(slot as TeacherSlot, dimmed))}

        <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)} activeOpacity={0.8}>
          <Glyph name="plus" size={17} color={colors.primary} />
          <Text style={s.addBtnText}>Добавить слот</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // ── Учитель: запросы ────────────────────────────────────────────────
  const renderTeacherRequests = () => {
    const totalCount = bookings.length + customRequests.length;
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {totalCount === 0 && renderEmpty("tray", "Новых запросов нет", "Заявки учеников появятся здесь")}

        {bookings.map((b) => (
          <View key={`sb-${b.id}`} style={[s.reqCard, statusSkin(colors.primary)]}>
            <View style={s.reqTop}>
              {renderLetterAvatar(b.studentName, null, 40)}
              <View style={{ flex: 1 }}>
                <Text style={s.reqName}>{b.studentName ?? "Ученик"}</Text>
                <Text style={s.reqTime}>{formatDateWithDay(b.date)}, {b.startTime} – {b.endTime}</Text>
              </View>
            </View>
            {b.note ? <Text style={s.reqNote}>«{b.note}»</Text> : null}
            <View style={s.btnRow}>
              <TouchableOpacity style={[s.btnConfirm, { flex: 1 }]} activeOpacity={0.85} onPress={() => handleRespond(b.id, "confirmed")}>
                <Text style={s.btnText}>Подтвердить</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btnReject, { flex: 1 }]} activeOpacity={0.85} onPress={() => handleRespond(b.id, "rejected")}>
                <Text style={s.btnTextDanger}>Отклонить</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {customRequests.length > 0 && bookings.length > 0 && (
          <Text style={s.historyLabel}>Запросы своего времени</Text>
        )}
        {customRequests.map((cr) => (
          <View key={`cr-${cr.id}`} style={[s.reqCard, statusSkin(colors.success)]}>
            <View style={s.reqTop}>
              <View style={[s.reqAvatar, { backgroundColor: colors.success + "20" }]}>
                <Glyph name="clock" size={18} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.reqName}>{cr.studentName ?? "Ученик"}</Text>
                <Text style={s.reqTime}>{formatDateWithDay(cr.date)}, {cr.startTime} – {cr.endTime}</Text>
                <Text style={[s.reqTime, { color: colors.success, fontSize: 11, fontWeight: "700" }]}>Предлагает своё время</Text>
              </View>
            </View>
            {cr.note ? <Text style={s.reqNote}>«{cr.note}»</Text> : null}
            <View style={s.btnRow}>
              <TouchableOpacity style={[s.btnConfirm, { flex: 1 }]} activeOpacity={0.85} onPress={() => handleRespondCustom(cr.id, "confirmed")}>
                <Text style={s.btnText}>Принять</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btnReject, { flex: 1 }]} activeOpacity={0.85} onPress={() => handleRespondCustom(cr.id, "rejected")}>
                <Text style={s.btnTextDanger}>Отклонить</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  };

  // ── Ученик: расписание ──────────────────────────────────────────────
  const renderStudentSchedule = () => {
    const daySlots = slots as StudentSlot[];
    const active = daySlots.filter((sl) => !isPastSlot(sl.date, sl.endTime));
    const past   = daySlots.filter((sl) =>  isPastSlot(sl.date, sl.endTime));
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {renderNextLesson()}
        {renderWeekStrip()}
        {renderDaySummary()}

        {daySlots.length === 0 && (
          <>
            {renderEmpty(
              "calendar",
              `На ${formatDate(selectedDate)} окон нет`,
              "Учитель ещё не открыл время на этот день. Можно предложить своё.",
            )}
            {renderJumpHints()}
          </>
        )}
        {daySlots.length > 0 && active.length === 0 && past.length > 0 &&
          renderEmpty("check", "Все занятия завершены", "На этот день больше ничего не запланировано")}

        {renderDaySchedule(past, active, (slot, dimmed) => renderStudentSlotCard(slot as StudentSlot, dimmed))}

        <TouchableOpacity
          style={[s.addBtn, { borderColor: colors.success }]}
          activeOpacity={0.8}
          onPress={handleOpenCustomReq}
        >
          <Glyph name="clock" size={17} color={colors.success} />
          <Text style={[s.addBtnText, { color: colors.success }]}>Предложить своё время</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // ── Ученик: мои записи ──────────────────────────────────────────────
  const renderStudentBookings = () => {
    const FILTERS: { key: "all"|"pending"|"confirmed"|"rejected"; label: string }[] = [
      { key: "all",      label: "Все"         },
      { key: "pending",  label: "В ожидании"  },
      { key: "confirmed",label: "Выполнено"   },
      { key: "rejected", label: "Отклонённые" },
    ];

    const sorted = [...bookings].sort((a, b) => {
      const da = (a.date ?? "") + (a.startTime ?? "");
      const db = (b.date ?? "") + (b.startTime ?? "");
      return da.localeCompare(db);
    });

    const filtered = bookingFilter === "all"
      ? sorted
      : sorted.filter((b) => b.status === bookingFilter);

    const upcoming = filtered.filter((b) => !isPastSlot(b.date ?? "", b.endTime ?? ""));
    const past     = filtered.filter((b) =>  isPastSlot(b.date ?? "", b.endTime ?? ""));

    const renderBookingCard = (b: BookingRow, isPast: boolean) => {
      const cfg = BOOKING_CFG[b.status];
      const isRejected = b.status === "rejected";
      const cardColor = isRejected ? colors.destructive : isPast ? colors.border : (cfg?.color ?? colors.border);
      const iconColor = isRejected ? colors.destructive : isPast ? colors.mutedForeground : (cfg?.color ?? colors.primary);
      const statusLabel = isRejected ? "Отклонено" : isPast ? "Завершено" : (cfg?.label ?? b.status);
      const statusColor = isRejected ? colors.destructive : isPast ? colors.mutedForeground : (cfg?.color ?? colors.mutedForeground);
      return (
        <View
          key={b.id}
          style={[
            s.reqCard,
            statusSkin(cardColor, isPast && !isRejected),
            isPast && !isRejected && { opacity: 0.5 },
          ]}
        >
          <View style={s.reqTop}>
            <View style={[s.reqAvatar, { backgroundColor: iconColor + "20" }]}>
              <Glyph name={cfg?.icon ?? "calendar"} size={18} color={iconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.reqName}>{b.teacherName ?? "Учитель"}</Text>
              <Text style={s.reqTime}>{formatDateWithDay(b.date)}, {b.startTime} – {b.endTime}</Text>
            </View>
            <Text style={[s.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          {b.note ? <Text style={s.reqNote}>«{b.note}»</Text> : null}
          {isRejected && (
            <Text style={{ fontSize: 12, color: colors.destructive, fontStyle: "italic" }}>
              Учитель отклонил вашу запись
            </Text>
          )}
        </View>
      );
    };

    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {FILTERS.map((f) => {
              const active = bookingFilter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setBookingFilter(f.key)}
                  activeOpacity={0.85}
                  style={[s.filterChip, active && s.filterChipActive]}
                >
                  <Text style={[s.filterChipText, active && s.filterChipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {upcoming.length === 0 && past.length === 0 && renderEmpty(
          "cards",
          bookingFilter === "all" ? "Записей пока нет" : "Нет записей с таким статусом",
          bookingFilter === "all" ? "Откройте расписание и запишитесь к учителю" : undefined,
        )}

        {upcoming.map((b) => renderBookingCard(b, false))}

        {past.length > 0 && (
          <>
            <Text style={s.historyLabel}>История занятий</Text>
            {past.map((b) => renderBookingCard(b, true))}
          </>
        )}

        {bookingFilter === "all" && customRequests.length > 0 && (
          <>
            <Text style={s.historyLabel}>Предложения своего времени</Text>
            {customRequests.map((cr) => {
              const isPastCr = isPastSlot(cr.date, cr.endTime);
              const isRejCr = cr.status === "rejected";
              const crColor = cr.status === "confirmed"
                ? colors.primary
                : isRejCr ? colors.destructive : colors.success;
              const crLabel = cr.status === "confirmed" ? "Принято" : isRejCr ? "Отклонено" : "Ожидает";
              return (
                <View
                  key={`cr-${cr.id}`}
                  style={[
                    s.reqCard,
                    statusSkin(crColor, isPastCr && !isRejCr),
                    isPastCr && !isRejCr && { opacity: 0.5 },
                  ]}
                >
                  <View style={s.reqTop}>
                    <View style={[s.reqAvatar, { backgroundColor: crColor + "20" }]}>
                      <Glyph name="clock" size={18} color={crColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.reqName}>{cr.teacherName ?? "Учитель"}</Text>
                      <Text style={s.reqTime}>{formatDateWithDay(cr.date)}, {cr.startTime} – {cr.endTime}</Text>
                      <Text style={[s.reqTime, { fontSize: 11, color: colors.success, fontWeight: "700" }]}>Мой запрос на время</Text>
                    </View>
                    <Text style={[s.statusLabel, { color: crColor }]}>{crLabel}</Text>
                  </View>
                  {cr.note ? <Text style={s.reqNote}>«{cr.note}»</Text> : null}
                  {isRejCr && (
                    <Text style={{ fontSize: 12, color: colors.destructive, fontStyle: "italic" }}>
                      Учитель отклонил ваш запрос на время
                    </Text>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    );
  };

  // ── Учитель: история ────────────────────────────────────────────────
  const renderTeacherHistory = () => {
    if (historyLoading) {
      return <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} size="large" />;
    }

    const grouped: Record<string, LessonHistoryItem[]> = {};
    for (const item of lessonHistory) {
      const d = new Date(item.date + "T00:00:00");
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    }
    const monthKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    const monthLabel = (key: string) => {
      const [y, m] = key.split("-");
      return `${MONTH_SHORT[Number(m) - 1]} ${y}`;
    };

    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {lessonHistory.length === 0 && renderEmpty(
          "book",
          "История пуста",
          "Подтверждённые занятия появятся здесь",
        )}

        {monthKeys.map((mk) => (
          <View key={mk}>
            <Text style={[s.historyLabel, { marginTop: 8 }]}>{monthLabel(mk)}</Text>
            {grouped[mk].map((item) => {
              const isPast = isPastSlot(item.date, item.endTime);
              const accent = isPast ? colors.success : colors.primary;
              const statusLabel = isPast ? "Проведён" : "Запланирован";
              const card = (
                <View style={[s.card, statusSkin(accent)]}>
                  <View style={s.cardRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardWho}>{formatDateWithDay(item.date)}</Text>
                      <Text style={s.cardMeta}>
                        {item.confirmedBookings.length} {item.confirmedBookings.length === 1 ? "ученик" : "ученика"}
                      </Text>
                    </View>
                    <Pill text={statusLabel} tone="soft" color={accent} />
                  </View>
                  {item.confirmedBookings.map((b) => {
                    const displayName = b.studentName && b.studentSurname
                      ? `${b.studentName} ${b.studentSurname}`
                      : b.studentName ?? b.studentUsername ?? "Ученик";
                    return (
                      <View key={b.bookingId} style={[s.cardRow, { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }]}>
                        {renderLetterAvatar(displayName, b.studentColor, 32)}
                        <View style={{ flex: 1 }}>
                          <Text style={s.cardWho}>{displayName}</Text>
                          {b.studentUsername ? <Text style={s.cardMeta}>@{b.studentUsername}</Text> : null}
                          {b.note ? <Text style={[s.cardMeta, { fontStyle: "italic" }]}>«{b.note}»</Text> : null}
                        </View>
                        <Glyph name={isPast ? "check" : "target"} size={16} color={accent} />
                      </View>
                    );
                  })}
                </View>
              );
              return renderSlotRow(item.startTime, item.endTime, card, item.id);
            })}
          </View>
        ))}
      </ScrollView>
    );
  };

  // ── Модалка месяца ──────────────────────────────────────────────────
  // Открывается кнопкой из полосы недели: нужна, чтобы прыгнуть на далёкую
  // дату, а не чтобы висеть на экране всё время.
  const renderMonthModal = () => {
    const year = monthAnchor.getFullYear();
    const month = monthAnchor.getMonth();
    const weeks = buildMonthGrid(year, month);
    const today = todayStr();
    const now = new Date();
    // Назад не листаем дальше текущего месяца: в прошлом слот всё равно
    // нельзя ни создать, ни занять (см. isInPast на сервере).
    const canGoBack = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth());
    const shiftMonth = (delta: number) => setMonthAnchor(new Date(year, month + delta, 1));

    return (
      <Modal visible={showMonth} transparent animationType="slide" onRequestClose={() => setShowMonth(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowMonth(false)}>
          <TouchableOpacity style={s.sheet} activeOpacity={1}>
            <View style={s.handle} />

            <View style={s.monthHead}>
              <Pressable
                style={[s.monthNav, !canGoBack && { opacity: 0.35 }]}
                onPress={() => canGoBack && shiftMonth(-1)}
                disabled={!canGoBack}
                accessibilityLabel="Предыдущий месяц"
              >
                <View style={{ transform: [{ rotate: "180deg" }] }}>
                  <Glyph name="chevron" size={17} color={colors.foreground} />
                </View>
              </Pressable>
              <Text style={s.monthTitle}>{MONTH_FULL[month]} {year}</Text>
              <Pressable style={s.monthNav} onPress={() => shiftMonth(1)} accessibilityLabel="Следующий месяц">
                <Glyph name="chevron" size={17} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={s.mWeekRow}>
              {WEEK_HEAD.map((w) => (
                <View key={w} style={s.mHeadCell}><Text style={s.mHeadText}>{w}</Text></View>
              ))}
            </View>

            {weeks.map((week, wi) => (
              <View key={wi} style={s.mWeekRow}>
                {week.map((date, di) => {
                  if (!date) return <View key={`e-${di}`} style={s.mCell} />;
                  const meta = dayMeta[date] ?? EMPTY_META;
                  const hasAnything = meta.free + meta.pending + meta.lesson > 0;
                  const active = date === selectedDate;
                  const isToday = date === today;
                  const isPastDay = date < today;
                  return (
                    <Pressable
                      key={date}
                      onPress={() => goToDate(date)}
                      style={[
                        s.mCell,
                        hasAnything && !active && s.mCellFilled,
                        isToday && !active && { borderWidth: 1.5, borderColor: colors.primary },
                        isPastDay && !active && { opacity: 0.4 },
                      ]}
                    >
                      {active && (
                        <LinearGradient
                          colors={gradients.action as unknown as string[]}
                          start={{ x: 0.1, y: 0 }}
                          end={{ x: 0.9, y: 1 }}
                          style={StyleSheet.absoluteFill}
                        />
                      )}
                      <Text style={[s.mNum, active && s.mNumActive]}>
                        {new Date(date + "T00:00:00").getDate()}
                      </Text>
                      <View style={[s.dotRow, { marginTop: 4, height: 5 }]}>
                        {meta.lesson > 0 && <View style={[s.dot, { width: 4, height: 4, backgroundColor: active ? "#fff" : DOT_LESSON }]} />}
                        {meta.pending > 0 && <View style={[s.dot, { width: 4, height: 4, backgroundColor: active ? "#ffffffcc" : DOT_PENDING }]} />}
                        {meta.free > 0 && <View style={[s.dot, { width: 4, height: 4, backgroundColor: active ? "#ffffff99" : DOT_FREE }]} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <View style={s.legendRow}>
              <View style={s.legendItem}>
                <View style={[s.dot, { backgroundColor: DOT_LESSON }]} />
                <Text style={s.legendText}>Занятие</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.dot, { backgroundColor: DOT_PENDING }]} />
                <Text style={s.legendText}>Ожидает</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.dot, { backgroundColor: DOT_FREE }]} />
                <Text style={s.legendText}>Свободно</Text>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  // ── Add-slot modal (teacher) ────────────────────────────────────────
  const addStart = `${addStartH}:${addStartM}`;
  const addEnd   = `${addEndH}:${addEndM}`;
  const addBlocked = addEnd <= addStart || isPastSlot(selectedDate, addEnd);
  const renderAddSlotModal = () => (
    <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowAdd(false)}>
        <TouchableOpacity style={s.sheet} activeOpacity={1}>
          <View style={s.handle} />
          <Text style={s.sheetTitle}>Добавить слот — {formatDate(selectedDate)}</Text>

          <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 20 }}>
            <View style={{ alignItems: "center" }}>
              <Text style={s.timeLabel}>Начало</Text>
              <View style={s.wheelRow}>
                <WheelColumn
                  items={HOURS} value={addStartH} onChange={setAddStartH}
                  fg={colors.foreground} muted={colors.mutedForeground}
                  hlColor={colors.primary + "28"}
                />
                <Text style={s.wheelColon}>:</Text>
                <WheelColumn
                  items={MINUTES} value={addStartM} onChange={setAddStartM}
                  fg={colors.foreground} muted={colors.mutedForeground}
                  hlColor={colors.primary + "28"}
                />
              </View>
            </View>

            <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 4 }} />

            <View style={{ alignItems: "center" }}>
              <Text style={s.timeLabel}>Конец</Text>
              <View style={s.wheelRow}>
                <WheelColumn
                  items={HOURS} value={addEndH} onChange={setAddEndH}
                  fg={colors.foreground} muted={colors.mutedForeground}
                  hlColor={colors.primary + "28"}
                />
                <Text style={s.wheelColon}>:</Text>
                <WheelColumn
                  items={MINUTES} value={addEndM} onChange={setAddEndM}
                  fg={colors.foreground} muted={colors.mutedForeground}
                  hlColor={colors.primary + "28"}
                />
              </View>
            </View>
          </View>

          {addEnd <= addStart && renderWarn(`Конец раньше начала: ${addStart} → ${addEnd}`, colors.destructive)}
          {addEnd > addStart && isPastSlot(selectedDate, addEnd) &&
            renderWarn("Это время уже прошло — слот не сохранится", colors.warning)}

          {saving ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <ChunkyButton
              label="Добавить слот"
              sublabel={`${addStart} – ${addEnd}`}
              icon="plus"
              disabled={addBlocked}
              onPress={handleAddSlot}
              style={{ marginTop: 4 }}
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  // ── Custom time request modal (student) ────────────────────────────
  const crStart = `${crStartH}:${crStartM}`;
  const crEnd   = `${crEndH}:${crEndM}`;
  const crBlocked = crEnd <= crStart || isPastSlot(selectedDate, crEnd) || !crTeacherId;
  const renderCustomReqModal = () => (
    <Modal visible={showCustomReq} transparent animationType="slide" onRequestClose={() => setShowCustomReq(false)}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowCustomReq(false)}>
        <TouchableOpacity style={s.sheet} activeOpacity={1}>
          <View style={s.handle} />
          <Text style={s.sheetTitle}>Предложить своё время{"\n"}{formatDate(selectedDate)}</Text>

          {crTeachers.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {crTeachers.map((t) => {
                  const active = crTeacherId === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      onPress={() => setCrTeacherId(t.id)}
                      activeOpacity={0.85}
                      style={[s.filterChip, active && { backgroundColor: colors.success + "20", borderColor: colors.success }]}
                    >
                      <Text style={[s.filterChipText, active && { color: colors.success }]}>{t.name ?? t.username}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}
          {crTeachers.length === 0 && (
            <Text style={{ color: colors.mutedForeground, textAlign: "center", marginBottom: 16 }}>
              Нет подключённых учителей
            </Text>
          )}
          {crTeachers.length === 1 && (
            <Text style={{ color: colors.mutedForeground, marginBottom: 12, fontSize: 14 }}>
              Учитель: {crTeachers[0].name ?? crTeachers[0].username}
            </Text>
          )}

          <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 16 }}>
            <View style={{ alignItems: "center" }}>
              <Text style={s.timeLabel}>Начало</Text>
              <View style={s.wheelRow}>
                <WheelColumn items={HOURS}   value={crStartH} onChange={setCrStartH} fg={colors.foreground} muted={colors.mutedForeground} hlColor={colors.success + "28"} />
                <Text style={s.wheelColon}>:</Text>
                <WheelColumn items={MINUTES} value={crStartM} onChange={setCrStartM} fg={colors.foreground} muted={colors.mutedForeground} hlColor={colors.success + "28"} />
              </View>
            </View>
            <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 4 }} />
            <View style={{ alignItems: "center" }}>
              <Text style={s.timeLabel}>Конец</Text>
              <View style={s.wheelRow}>
                <WheelColumn items={HOURS}   value={crEndH} onChange={setCrEndH} fg={colors.foreground} muted={colors.mutedForeground} hlColor={colors.success + "28"} />
                <Text style={s.wheelColon}>:</Text>
                <WheelColumn items={MINUTES} value={crEndM} onChange={setCrEndM} fg={colors.foreground} muted={colors.mutedForeground} hlColor={colors.success + "28"} />
              </View>
            </View>
          </View>

          {crEnd <= crStart && renderWarn(`Конец раньше начала: ${crStart} → ${crEnd}`, colors.destructive)}
          {crEnd > crStart && isPastSlot(selectedDate, crEnd) &&
            renderWarn("Это время уже прошло — выберите будущее время", colors.warning)}

          <Text style={[s.timeLabel, { marginBottom: 8 }]}>Сообщение учителю (необязательно)</Text>
          <TextInput
            style={s.noteInput}
            placeholder="Например: хочу разобрать Present Perfect..."
            placeholderTextColor={colors.mutedForeground}
            value={crNote} onChangeText={setCrNote}
            multiline returnKeyType="done"
          />

          {crError && (
            <View style={s.errorBox}>
              <Glyph name="alert" size={16} color={colors.destructive} />
              <Text style={{ color: colors.destructive, fontSize: 13, flex: 1 }}>{crError}</Text>
            </View>
          )}

          {crSaving ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <ActivityIndicator color={colors.success} />
            </View>
          ) : (
            <ChunkyButton
              label="Отправить запрос"
              sublabel={`${crStart} – ${crEnd}`}
              icon="send"
              disabled={crBlocked}
              onPress={handleSendCustomReq}
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  // ── Book-slot modal (student) ───────────────────────────────────────
  const renderBookModal = () => (
    <Modal visible={!!bookSlot} transparent animationType="slide" onRequestClose={() => setBookSlot(null)}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setBookSlot(null)}>
        <TouchableOpacity style={s.sheet} activeOpacity={1}>
          <View style={s.handle} />
          <Text style={s.sheetTitle}>
            Запись на {formatDate(bookSlot?.date ?? null)}{"\n"}{bookSlot?.startTime} – {bookSlot?.endTime}
          </Text>
          <Text style={[s.timeLabel, { marginBottom: 8 }]}>Сообщение учителю (необязательно)</Text>
          <TextInput
            style={s.noteInput}
            placeholder="Например: хочу разобрать Present Perfect..."
            placeholderTextColor={colors.mutedForeground}
            value={bookNote} onChangeText={setBookNote}
            multiline returnKeyType="done"
          />
          {booking ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <ChunkyButton label="Отправить запрос" icon="send" onPress={handleBookSlot} />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  const renderAssignModal = () => (
    <Modal visible={!!assignSlot} transparent animationType="slide" onRequestClose={() => setAssignSlot(null)}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setAssignSlot(null)}>
        <TouchableOpacity style={s.sheet} activeOpacity={1}>
          <View style={s.handle} />
          <Text style={s.sheetTitle}>
            Назначить ученика{"\n"}{assignSlot?.startTime} – {assignSlot?.endTime} · {formatDate(assignSlot?.date ?? null)}
          </Text>

          {assignStudents.length === 0 ? (
            renderEmpty("users", "Нет подключённых учеников", "Сначала добавьте ученика в разделе «Ученики»")
          ) : (
            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {assignStudents.map((st) => {
                const selected = st.id === assignStudentId;
                const displayName = st.name && st.surname
                  ? `${st.name} ${st.surname}`
                  : st.name ?? st.username;
                return (
                  <TouchableOpacity
                    key={st.id}
                    activeOpacity={0.85}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 12,
                      padding: 12, borderRadius: radii.sm + 2, marginBottom: 8,
                      backgroundColor: selected ? colors.primary + "18" : colors.muted,
                      borderWidth: 1.5, borderColor: selected ? colors.primary : "transparent",
                    }}
                    onPress={() => setAssignStudentId(st.id)}
                  >
                    {renderLetterAvatar(displayName, st.avatarColor, 38)}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>{displayName}</Text>
                      <Text style={{ fontSize: 12, color: colors.mutedForeground }}>@{st.username}</Text>
                    </View>
                    {selected && <Glyph name="check" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {assignError && (
            <View style={[s.errorBox, { marginTop: 8 }]}>
              <Glyph name="alert" size={16} color={colors.destructive} />
              <Text style={{ color: colors.destructive, fontSize: 13, flex: 1 }}>{assignError}</Text>
            </View>
          )}

          {assignStudents.length > 0 && (
            assigning ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <ChunkyButton
                label="Назначить"
                icon="userPlus"
                disabled={!assignStudentId}
                onPress={handleAssign}
                style={{ marginTop: 12 }}
              />
            )
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  const pendingCount = isTeacherRole ? bookings.length + customRequests.length : 0;
  const headDateObj = new Date(selectedDate + "T00:00:00");

  return (
    <View style={s.container}>
      {renderAddSlotModal()}
      {renderCustomReqModal()}
      {renderBookModal()}
      {renderAssignModal()}
      {renderMonthModal()}
      <ConfirmModal
        visible={deleteSlotId !== null}
        title="Удалить слот?"
        message="Вы действительно хотите удалить этот слот?"
        confirmText="Удалить"
        destructive
        onConfirm={doDeleteSlot}
        onCancel={() => setDeleteSlotId(null)}
      />

      {/* ── Шапка: дата вместо слова «Календарь» ── */}
      <View style={s.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.headDate}>
            {headDateObj.getDate()} {MONTH_GEN[headDateObj.getMonth()]}
          </Text>
          <Text style={s.headCaption}>{dayCaption(selectedDate)}</Text>
        </View>

        {/* Главное действие роли — сразу в шапке, а не в конце прокрутки. */}
        {activeTab === "schedule" && (
          <View>
            <View style={[s.headBtnEdge, { backgroundColor: accents.indigoDeep }]} />
            <Pressable onPress={() => (isTeacherRole ? setShowAdd(true) : handleOpenCustomReq())}>
              <LinearGradient
                colors={gradients.action as unknown as string[]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={s.headBtn}
              >
                <Glyph name="plus" size={14} color="#fff" />
                <Text style={s.headBtnText}>{isTeacherRole ? "Слот" : "Своё время"}</Text>
              </LinearGradient>
            </Pressable>
            <View style={{ height: 4 }} />
          </View>
        )}
      </View>

      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tab, activeTab === "schedule" && s.tabActive]}
          activeOpacity={0.85}
          onPress={() => setActiveTab("schedule")}
        >
          <Glyph name="calendar" size={13} color={activeTab === "schedule" ? accents.violetDeep : colors.mutedForeground} />
          <Text style={[s.tabText, activeTab === "schedule" && s.tabTextActive]}>Расписание</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, activeTab === "requests" && s.tabActive]}
          activeOpacity={0.85}
          onPress={() => { setActiveTab("requests"); loadBookings(); loadCustomRequests(); if (isTeacherRole) markSeen(); }}
        >
          <Glyph name={isTeacherRole ? "tray" : "cards"} size={13} color={activeTab === "requests" ? accents.violetDeep : colors.mutedForeground} />
          <Text style={[s.tabText, activeTab === "requests" && s.tabTextActive]}>
            {isTeacherRole ? "Запросы" : "Мои записи"}
          </Text>
          {pendingCount > 0 && <View style={s.badge}><Text style={s.badgeText}>{pendingCount}</Text></View>}
        </TouchableOpacity>
        {isTeacherRole && (
          <TouchableOpacity
            style={[s.tab, activeTab === "history" && s.tabActive]}
            activeOpacity={0.85}
            onPress={() => { setActiveTab("history"); loadHistory(); }}
          >
            <Glyph name="book" size={13} color={activeTab === "history" ? accents.violetDeep : colors.mutedForeground} />
            <Text style={[s.tabText, activeTab === "history" && s.tabTextActive]}>История</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading
        ? <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} size="large" />
        : activeTab === "schedule"
          ? isTeacherRole ? renderTeacherSchedule() : renderStudentSchedule()
          : activeTab === "history" && isTeacherRole
            ? renderTeacherHistory()
            : isTeacherRole ? renderTeacherRequests() : renderStudentBookings()
      }
    </View>
  );
}
