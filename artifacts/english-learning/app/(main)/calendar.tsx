// Календарь занятий: слоты учителя, записи учеников, запросы своего времени
// и история проведённых уроков.
//
// Эмодзи в интерфейсе не используются: в пустых состояниях, предупреждениях и
// на кнопках подтверждения стоят глифы из своего набора. Аватары учеников
// приходят из профиля (avatarEmoji) — там, где картинки нет, показываем первую
// букву имени, а не подставляем случайный символ.
//
// Оформление собрано из GameKit: физические кнопки и вкладки, карточки с
// цветной тенью в цвете статуса, пилюли. Логика экрана не менялась.
//
// Статус слота раньше показывался цветной полосой слева (borderLeftWidth: 4).
// Приём убран по всему экрану: полоса на карточке читается как след от
// вёрстки, а не как смысл, и на узком экране съедает место под текст. Теперь
// статус несут сама карточка (лёгкая заливка и рамка в цвете статуса), точка
// слева и пилюля справа — те же три сигнала, но без лишней геометрии.
//
// Наклоны тоже убраны — как на «Заданиях», «Учениках», «Анализе» и «Профиле».
//
// Новое: карточка ближайшего занятия над сеткой. Главный вопрос к календарю —
// «когда у меня следующий урок», и раньше ответ на него приходилось искать,
// листая дни. Теперь он первым же блоком, вместе с кнопкой перехода на нужный
// день.
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
import { ChunkyButton, Pill, SectionLabel } from "@/components/ui/GameKit";
import { accents, gradients, radii } from "@/constants/theme";

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
const MONTH_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
// Полные названия месяцев — заголовок месячной сетки.
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

/** Первая буква имени для аватара без картинки. Пропускаем знаки и пробелы. */
function initialOf(name?: string | null, fallback = "У") {
  const m = (name ?? "").match(/[\p{L}\p{N}]/u);
  return (m?.[0] ?? fallback).toUpperCase();
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

// Цвета точек занятости в сетке месяца. Совпадают с палитрой:
// success / warning / primary из constants/colors.ts.
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

  // Обзор месяца: все слоты (без параметра date) — нужен только для точек
  // занятости в сетке и подсказки «ближайшие дни со слотами».
  const [monthSlots, setMonthSlots] = useState<(TeacherSlot | StudentSlot)[]>([]);
  // Первое число отображаемого месяца.
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

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

  // ── Занятость по дням (для сетки месяца) ────────────────────────────
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
   * Главный вопрос к календарю — «когда у меня следующий урок». Раньше ответ
   * приходилось искать перелистыванием дней: сетка показывает точки, но не
   * говорит, какая из них ближайшая. Ищем среди уже загруженных слотов месяца,
   * лишнего запроса не нужно.
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
    header: {
      flexDirection: "row", alignItems: "center",
      paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 12,
    },
    headerTitle: { flex: 1, fontSize: 28, fontWeight: "900", letterSpacing: -0.6, color: colors.foreground },

    tabRow: {
      flexDirection: "row", marginHorizontal: 16, marginBottom: 8, gap: 10,
    },
    tab: {
      flex: 1, paddingVertical: 11, borderRadius: radii.sm + 2, alignItems: "center",
      flexDirection: "row", justifyContent: "center", gap: 6,
      backgroundColor: "rgba(255,255,255,0.35)",
      borderWidth: 1, borderColor: "rgba(255,255,255,0.5)",
    },
    // Активная вкладка приподнята: тот же физический приём, что у кнопок.
    tabActive: {
      backgroundColor: colors.card,
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28, shadowRadius: 10, elevation: 6,
      borderColor: "transparent",
    },
    tabText: { fontSize: 13, fontWeight: "700", color: colors.mutedForeground },
    tabTextActive: { color: colors.primary, fontWeight: "800" },
    badge: {
      backgroundColor: colors.destructive, borderRadius: 9,
      minWidth: 18, height: 18, justifyContent: "center", alignItems: "center", paddingHorizontal: 4,
    },
    badgeText: { fontSize: 10, fontWeight: "900", color: "#fff", fontVariant: ["tabular-nums"] },

    // ── Ближайшее занятие ──
    // Заливка градиентом бренда: это не «ещё одна карточка в списке», а ответ
    // на главный вопрос экрана, и он должен читаться первым.
    nextCard: {
      borderRadius: radii.lg, padding: 16, marginBottom: 14,
      flexDirection: "row", alignItems: "center", gap: 14,
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 7 },
      shadowOpacity: 0.34, shadowRadius: 18, elevation: 7,
    },
    nextIcon: {
      width: 50, height: 50, borderRadius: radii.md,
      backgroundColor: "rgba(255,255,255,0.22)",
      alignItems: "center", justifyContent: "center",
    },
    nextLabel: {
      fontSize: 10.5, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase",
      color: "rgba(255,255,255,0.75)",
    },
    nextWhen: { fontSize: 19, fontWeight: "900", letterSpacing: -0.4, color: "#fff", marginTop: 3 },
    nextWho: { fontSize: 12.5, color: "rgba(255,255,255,0.85)", marginTop: 3 },

    // ── Месячная сетка ──
    monthCard: {
      backgroundColor: colors.card, borderRadius: radii.lg, padding: 14, marginBottom: 14,
      borderWidth: 1, borderColor: colors.border,
      shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.14, shadowRadius: 16, elevation: 5,
    },
    monthHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
    monthTitle: { flex: 1, fontSize: 19, fontWeight: "900", letterSpacing: -0.3, color: colors.foreground },
    monthNavBtn: {
      width: 34, height: 34, borderRadius: radii.sm, alignItems: "center", justifyContent: "center",
      backgroundColor: colors.muted,
    },
    todayBtn: {
      paddingHorizontal: 12, height: 34, borderRadius: radii.sm,
      alignItems: "center", justifyContent: "center",
      backgroundColor: colors.primary + "14",
    },
    todayBtnText: { fontSize: 12, fontWeight: "800", color: colors.primary },
    weekRow: { flexDirection: "row", marginBottom: 4 },
    weekHeadCell: { flex: 1, alignItems: "center", paddingBottom: 6 },
    weekHeadText: { fontSize: 11, fontWeight: "800", color: colors.mutedForeground, letterSpacing: 0.4 },
    dayCell: {
      flex: 1, aspectRatio: 1, marginHorizontal: 2, borderRadius: radii.sm + 2,
      alignItems: "center", justifyContent: "center", overflow: "hidden",
    },
    dayCellFilled: { backgroundColor: colors.muted },
    dayCellToday: { borderWidth: 1.5, borderColor: colors.primary },
    // Выбранный день светится в цвете бренда — он главный объект экрана.
    dayCellActive: {
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.42, shadowRadius: 10, elevation: 6,
    },
    // Числа календаря — табличные: колонки дней стоят ровно.
    dayNum: { fontSize: 16, fontWeight: "700", color: colors.foreground, fontVariant: ["tabular-nums"] },
    dayNumMuted: { color: colors.mutedForeground },
    dayNumActive: { color: "#fff", fontWeight: "900" },
    dotRow: { flexDirection: "row", gap: 3, marginTop: 4, height: 6, alignItems: "center" },
    dot: { width: 6, height: 6, borderRadius: 3 },
    legendRow: {
      flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 12, paddingTop: 12,
      borderTopWidth: 1, borderTopColor: colors.border,
    },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendText: { fontSize: 11, color: colors.mutedForeground, fontWeight: "700" },

    // ── Счётчики по выбранному дню (без даты — она видна в сетке) ──
    dayCard: {
      backgroundColor: colors.card, borderRadius: radii.md, padding: 12, marginBottom: 12,
      borderWidth: 1, borderColor: colors.border,
      flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8,
      shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1, shadowRadius: 12, elevation: 2,
    },

    scroll: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 120 },
    historyLabel: {
      fontSize: 11, fontWeight: "800", color: colors.mutedForeground,
      textAlign: "center", marginVertical: 14, letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    filterChip: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: radii.pill,
      backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    },
    filterChipActive: {
      backgroundColor: colors.primary + "18", borderColor: colors.primary,
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.22, shadowRadius: 8, elevation: 3,
    },
    filterChipText: { fontSize: 12, fontWeight: "700", color: colors.mutedForeground },
    filterChipTextActive: { color: colors.primary },
    emptyBox: { alignItems: "center", paddingVertical: 28, gap: 12 },
    // Плашка под глиф вместо крупного эмодзи. Стоит ровно: наклон убран
    // вместе с остальными наклонами в проекте.
    emptyIcon: {
      width: 66, height: 66, borderRadius: radii.md + 4, alignItems: "center", justifyContent: "center",
      backgroundColor: colors.primary + "12", borderWidth: 1, borderColor: colors.primary + "28",
    },
    emptyText: { fontSize: 15, color: colors.mutedForeground, textAlign: "center", lineHeight: 22 },

    // Предупреждение в модалках: иконка плюс текст вместо символа ⚠.
    warnRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 6, marginBottom: 10, paddingHorizontal: 8,
    },
    warnText: { fontSize: 13, fontWeight: "700", flexShrink: 1 },

    // Карточка слота. Статус несут заливка, рамка и тень в цвете статуса —
    // цветной полосы слева больше нет (см. комментарий к файлу).
    slotCard: {
      borderRadius: radii.md, borderWidth: 1.5,
      backgroundColor: colors.card, marginBottom: 12, overflow: "hidden",
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.15, shadowRadius: 14, elevation: 5,
    },
    slotTop: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
    slotDot: { width: 12, height: 12, borderRadius: 6 },
    slotTime: { flex: 1, fontSize: 17, fontWeight: "800", color: colors.foreground, fontVariant: ["tabular-nums"] },
    slotSub: { fontSize: 12, color: colors.mutedForeground, marginTop: 1 },

    bookingRow: {
      flexDirection: "row", alignItems: "center", gap: 10,
      paddingHorizontal: 14, paddingVertical: 11,
      borderTopWidth: 1, borderTopColor: colors.border,
    },
    bookingName: { fontWeight: "800", fontSize: 14, color: colors.foreground },
    bookingNote: { fontSize: 12, color: colors.mutedForeground, marginTop: 2, fontStyle: "italic" },

    btnRow: { flexDirection: "row", gap: 8 },
    // Кнопки ответа на заявку: внутри глифы, поэтому квадрат и центрирование.
    btnConfirm: {
      paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.sm - 2,
      backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
    },
    btnReject: {
      paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.sm - 2,
      backgroundColor: colors.destructive, alignItems: "center", justifyContent: "center",
    },
    btnCancel: {
      paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.sm - 2,
      borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.muted,
    },
    btnText: { fontSize: 13, fontWeight: "800", color: "#fff" },
    btnTextGray: { fontSize: 13, fontWeight: "800", color: colors.mutedForeground },

    addBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
      borderRadius: radii.md, borderWidth: 2, borderStyle: "dashed", borderColor: colors.primary,
      padding: 16, marginTop: 4,
    },
    addBtnText: { fontSize: 15, fontWeight: "800", color: colors.primary },

    jumpChip: {
      flexDirection: "row", alignItems: "center", gap: 6,
      paddingHorizontal: 12, paddingVertical: 9, borderRadius: radii.sm,
      backgroundColor: colors.primary + "12", borderWidth: 1, borderColor: colors.primary + "40",
    },
    jumpChipText: { fontSize: 12, fontWeight: "800", color: colors.primary },

    statusLabel: { fontSize: 12, fontWeight: "800" },

    // Modals
    overlay: { flex: 1, backgroundColor: "#00000070", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg,
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

    // Request / booking cards. Как и слоты — без полосы слева.
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

    // Аватар без картинки: буква в круге вместо случайного эмодзи.
    letterAvatar: { justifyContent: "center", alignItems: "center" },
    letterAvatarText: { color: "#fff", fontWeight: "900" },
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

  /** Пустое состояние: глиф в плашке плюс поясняющий текст. */
  const renderEmpty = (glyph: GlyphName, text: string, tone: "primary" | "success" = "primary") => (
    <View style={s.emptyBox}>
      <View style={[
        s.emptyIcon,
        tone === "success" && { backgroundColor: colors.success + "14", borderColor: colors.success + "30" },
      ]}>
        <Glyph name={glyph} size={30} color={tone === "success" ? colors.success : colors.primary} />
      </View>
      <Text style={s.emptyText}>{text}</Text>
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
    <View style={[s.letterAvatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg ?? colors.primary }]}>
      <Text style={[s.letterAvatarText, { fontSize: Math.round(size * 0.44) }]}>{initialOf(name)}</Text>
    </View>
  );

  // ── Ближайшее занятие ───────────────────────────────────────────────
  const renderNextLesson = () => {
    if (!nextLesson) return null;
    const who = isTeacherRole
      ? ((nextLesson as TeacherSlot).bookings ?? []).find((b) => b.status === "confirmed")?.studentName ?? "Ученик"
      : (nextLesson as StudentSlot).teacherName ?? "Учитель";
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          const d = new Date(nextLesson.date + "T00:00:00");
          setMonthAnchor(new Date(d.getFullYear(), d.getMonth(), 1));
          setSelectedDate(nextLesson.date);
        }}
      >
        <LinearGradient
          colors={gradients.action as unknown as string[]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={s.nextCard}
        >
          <View style={s.nextIcon}>
            <Glyph name="calendar" size={24} color="#ffffff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.nextLabel}>Ближайшее занятие</Text>
            <Text style={s.nextWhen}>
              {humanDay(nextLesson.date)} в {nextLesson.startTime}
            </Text>
            <Text style={s.nextWho}>
              {isTeacherRole ? `с ${who}` : who} · до {nextLesson.endTime}
            </Text>
          </View>
          <Glyph name="chevron" size={20} color="#ffffff" />
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  // ── Месячная сетка ──────────────────────────────────────────────────
  const renderMonthCalendar = () => {
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
      <View style={s.monthCard}>
        <View style={s.monthHead}>
          {/* Стрелка назад — тот же chevron, развёрнутый на 180°. */}
          <TouchableOpacity
            style={[s.monthNavBtn, !canGoBack && { opacity: 0.35 }]}
            onPress={() => canGoBack && shiftMonth(-1)}
            disabled={!canGoBack}
            accessibilityLabel="Предыдущий месяц"
          >
            <View style={{ transform: [{ rotate: "180deg" }] }}>
              <Glyph name="chevron" size={18} color={colors.foreground} />
            </View>
          </TouchableOpacity>
          <Text style={s.monthTitle}>{MONTH_FULL[month]} {year}</Text>
          <TouchableOpacity
            style={s.todayBtn}
            onPress={() => {
              setMonthAnchor(new Date(now.getFullYear(), now.getMonth(), 1));
              setSelectedDate(today);
            }}
          >
            <Text style={s.todayBtnText}>Сегодня</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.monthNavBtn} onPress={() => shiftMonth(1)} accessibilityLabel="Следующий месяц">
            <Glyph name="chevron" size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <View style={s.weekRow}>
          {WEEK_HEAD.map((w) => (
            <View key={w} style={s.weekHeadCell}><Text style={s.weekHeadText}>{w}</Text></View>
          ))}
        </View>

        {weeks.map((week, wi) => (
          <View key={wi} style={s.weekRow}>
            {week.map((date, di) => {
              if (!date) return <View key={`e-${di}`} style={s.dayCell} />;
              const meta = dayMeta[date] ?? EMPTY_META;
              const hasAnything = meta.free + meta.pending + meta.lesson > 0;
              const active = date === selectedDate;
              const isToday = date === today;
              const isPastDay = date < today;
              return (
                <TouchableOpacity
                  key={date}
                  activeOpacity={0.75}
                  onPress={() => setSelectedDate(date)}
                  style={[
                    s.dayCell,
                    hasAnything && !active && s.dayCellFilled,
                    isToday && !active && s.dayCellToday,
                    active && s.dayCellActive,
                    isPastDay && !active && { opacity: 0.4 },
                  ]}
                >
                  {/* Заливка выбранного дня градиентом бренда, а не плоским цветом. */}
                  {active && (
                    <LinearGradient
                      colors={gradients.action as unknown as string[]}
                      start={{ x: 0.1, y: 0 }}
                      end={{ x: 0.9, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <Text style={[
                    s.dayNum,
                    (di >= 5 || isPastDay) && s.dayNumMuted,
                    active && s.dayNumActive,
                  ]}>
                    {new Date(date + "T00:00:00").getDate()}
                  </Text>
                  <View style={s.dotRow}>
                    {meta.lesson > 0 && (
                      <View style={[s.dot, { backgroundColor: active ? "#fff" : DOT_LESSON }]} />
                    )}
                    {meta.pending > 0 && (
                      <View style={[s.dot, { backgroundColor: active ? "#ffffffcc" : DOT_PENDING }]} />
                    )}
                    {meta.free > 0 && (
                      <View style={[s.dot, { backgroundColor: active ? "#ffffff99" : DOT_FREE }]} />
                    )}
                  </View>
                </TouchableOpacity>
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
      </View>
    );
  };

  // ── Счётчики по выбранному дню ──────────────────────────────────────
  // Дату не печатаем: выбранный день и так подсвечен в сетке выше.
  const renderDaySummary = () => {
    const chips: { icon: GlyphName; color: string; text: string }[] = [];
    if (selectedMeta.free > 0)    chips.push({ icon: "target", color: DOT_FREE,    text: `${selectedMeta.free} свободно` });
    if (selectedMeta.pending > 0) chips.push({ icon: "clock",  color: DOT_PENDING, text: `${selectedMeta.pending} ожидает` });
    if (selectedMeta.lesson > 0)  chips.push({ icon: "check",  color: DOT_LESSON,  text: `${selectedMeta.lesson} занятие` });

    // Нечего показать — не рисуем пустую рамку.
    if (chips.length === 0 && selectedMeta.past === 0) return null;

    return (
      <View style={s.dayCard}>
        {chips.map((c) => (
          <Pill key={c.text} text={c.text} icon={c.icon} tone="soft" color={c.color} />
        ))}
        {selectedMeta.past > 0 && (
          <Text style={{ fontSize: 11, color: colors.mutedForeground, marginLeft: "auto", fontVariant: ["tabular-nums"] }}>
            завершено: {selectedMeta.past}
          </Text>
        )}
      </View>
    );
  };

  // Подсказка «где слоты есть» — чтобы пустой день не был пустым экраном.
  const renderJumpHints = () => {
    if (nextBusyDates.length === 0) return null;
    return (
      <View style={{ marginBottom: 16 }}>
        <SectionLabel>Ближайшие дни со слотами</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {nextBusyDates.map((date) => {
            const m = dayMeta[date] ?? EMPTY_META;
            return (
              <TouchableOpacity
                key={date}
                style={s.jumpChip}
                activeOpacity={0.8}
                onPress={() => {
                  const d = new Date(date + "T00:00:00");
                  setMonthAnchor(new Date(d.getFullYear(), d.getMonth(), 1));
                  setSelectedDate(date);
                }}
              >
                <Glyph name="chevron" size={13} color={colors.primary} />
                <Text style={s.jumpChipText}>
                  {formatDateWithDay(date)} · {m.free + m.pending + m.lesson}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  // ── Reusable slot card (teacher) ────────────────────────────────────
  const renderTeacherSlotCard = (slot: TeacherSlot, dimmed = false) => {
    const pending = slot.bookings.filter((b) => b.status === "pending");
    const confirmed = slot.bookings.find((b) => b.status === "confirmed");
    const isBusy = !!confirmed;
    // Цвет статуса: занятие — фиолетовый success, ожидание — розовый,
    // свободный слот — индиго. Карточка целиком окрашивается в этот цвет
    // (рамка, лёгкая заливка, тень) — см. statusSkin.
    const accent = isBusy ? colors.success : pending.length > 0 ? colors.warning : colors.primary;
    const dotColor = dimmed ? colors.mutedForeground : accent;
    return (
      <View
        key={slot.id}
        style={[s.slotCard, statusSkin(accent, dimmed), dimmed && { opacity: 0.55 }]}
      >
        <View style={s.slotTop}>
          <View style={[s.slotDot, { backgroundColor: dotColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.slotTime}>{slot.startTime} – {slot.endTime}</Text>
            <Text style={s.slotSub}>
              {dimmed ? "Завершён" : isBusy ? "Занято" : "Свободно"}
            </Text>
          </View>
          {!dimmed && pending.length > 0 && (
            <View style={s.badge}><Text style={s.badgeText}>{pending.length}</Text></View>
          )}
          <Pressable
            onPress={() => handleDeleteSlot(slot.id)}
            hitSlop={8}
            style={{ padding: 4 }}
            accessibilityLabel="Удалить слот"
          >
            <Glyph name="trash" size={17} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {confirmed && (
          <View style={s.bookingRow}>
            <Glyph name="check" size={16} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={s.bookingName}>{confirmed.studentName ?? "Ученик"}</Text>
              {confirmed.note ? <Text style={s.bookingNote}>«{confirmed.note}»</Text> : null}
            </View>
            <Text style={[s.statusLabel, { color: colors.success }]}>Подтверждено</Text>
          </View>
        )}

        {!dimmed && pending.map((b) => (
          <View key={b.id} style={s.bookingRow}>
            <Glyph name="user" size={16} color={colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={s.bookingName}>{b.studentName ?? "Ученик"}</Text>
              {b.note ? <Text style={s.bookingNote}>«{b.note}»</Text> : null}
            </View>
            <View style={s.btnRow}>
              {/* Раньше внутри стояли символы ✓ и ✗ — они рисуются шрифтом ОС
                  и на Android выглядят иначе, чем на iOS. Теперь глифы. */}
              <TouchableOpacity
                style={s.btnConfirm}
                activeOpacity={0.85}
                onPress={() => handleRespond(b.id, "confirmed")}
                accessibilityLabel="Подтвердить запись"
              >
                <Glyph name="check" size={15} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.btnReject}
                activeOpacity={0.85}
                onPress={() => handleRespond(b.id, "rejected")}
                accessibilityLabel="Отклонить запись"
              >
                <Glyph name="close" size={15} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {!dimmed && !isBusy && pending.length === 0 && (
          <TouchableOpacity
            activeOpacity={0.8}
            style={{
              flexDirection: "row", alignItems: "center", gap: 7,
              paddingHorizontal: 14, paddingVertical: 11,
              borderTopWidth: 1, borderTopColor: colors.border,
            }}
            onPress={() => handleOpenAssign(slot)}
          >
            <Glyph name="userPlus" size={15} color={colors.primary} />
            <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "800" }}>Назначить ученика</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ── Teacher: schedule tab ───────────────────────────────────────────
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
        {renderMonthCalendar()}
        {renderDaySummary()}

        {active.length === 0 && past.length === 0 && (
          <>
            {renderEmpty("calendar", `Нет слотов на ${formatDate(selectedDate)}\nДобавьте время для занятий`)}
            {renderJumpHints()}
          </>
        )}
        {active.length === 0 && past.length > 0 &&
          renderEmpty("check", "Все занятия сегодня завершены", "success")}

        {active.map((slot) => renderTeacherSlotCard(slot, false))}

        <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(true)} activeOpacity={0.8}>
          <Glyph name="plus" size={18} color={colors.primary} />
          <Text style={s.addBtnText}>Добавить слот</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // ── Teacher: requests tab ───────────────────────────────────────────
  const renderTeacherRequests = () => {
    const totalCount = bookings.length + customRequests.length;
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {totalCount === 0 && renderEmpty("tray", "Нет новых запросов")}

        {/* Regular slot bookings */}
        {bookings.map((b) => (
          <View key={`sb-${b.id}`} style={[s.reqCard, statusSkin(colors.primary)]}>
            <View style={s.reqTop}>
              <View style={[s.reqAvatar, { backgroundColor: colors.primary + "20" }]}>
                <Glyph name="user" size={18} color={colors.primary} />
              </View>
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
                <Text style={s.btnText}>Отклонить</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Custom time requests from students */}
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
                <Text style={s.btnText}>Отклонить</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  };

  // ── Student: schedule tab ───────────────────────────────────────────
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
        {renderMonthCalendar()}
        {renderDaySummary()}

        {active.length === 0 && past.length === 0 && (
          <>
            {renderEmpty("calendar", `Нет доступных слотов на ${formatDate(selectedDate)}`)}
            {renderJumpHints()}
          </>
        )}
        {active.length === 0 && past.length > 0 &&
          renderEmpty("check", "Все занятия сегодня завершены", "success")}

        {active.map((slot) => {
          const meta = STATUS_CFG[slot.status];
          return (
            <View key={slot.id} style={[s.slotCard, statusSkin(meta.color)]}>
              <View style={s.slotTop}>
                <View style={[s.slotDot, { backgroundColor: meta.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.slotTime}>{slot.startTime} – {slot.endTime}</Text>
                  {slot.teacherName && <Text style={s.slotSub}>{slot.teacherName}</Text>}
                </View>
                <Pill text={meta.label} icon={meta.icon} tone="soft" color={meta.color} />
              </View>

              {slot.status === "available" && (
                <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                  <ChunkyButton label="Записаться" icon="check" onPress={() => setBookSlot(slot)} />
                </View>
              )}

              {slot.status === "pending" && slot.myBookingId && (
                <TouchableOpacity
                  style={[s.btnCancel, { margin: 12, marginTop: 0, alignItems: "center" }]}
                  activeOpacity={0.85}
                  onPress={() => handleCancelBooking(slot.myBookingId!)}
                >
                  <Text style={s.btnTextGray}>Отменить запрос</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* Button to request custom time */}
        <TouchableOpacity
          style={[s.addBtn, { borderColor: colors.success }]}
          activeOpacity={0.8}
          onPress={handleOpenCustomReq}
        >
          <Glyph name="clock" size={18} color={colors.success} />
          <Text style={[s.addBtnText, { color: colors.success }]}>Предложить своё время</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // ── Student: my bookings tab ────────────────────────────────────────
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
      // Rejected bookings always shown prominently, never treated as generic "Завершено"
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
        {/* Filter chips */}
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
          bookingFilter === "all"
            ? "Нет записей\nПерейдите в расписание и запишитесь к учителю"
            : "Нет записей с таким статусом",
        )}

        {upcoming.map((b) => renderBookingCard(b, false))}

        {past.length > 0 && (
          <>
            <Text style={s.historyLabel}>История занятий</Text>
            {past.map((b) => renderBookingCard(b, true))}
          </>
        )}

        {/* Custom time requests sent by student */}
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

  // ── Teacher: history tab ────────────────────────────────────────────
  const renderTeacherHistory = () => {
    if (historyLoading) {
      return <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} size="large" />;
    }

    // Group by month
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
          "История уроков пуста\nПодтверждённые занятия появятся здесь",
        )}

        {monthKeys.map((mk) => (
          <View key={mk}>
            <Text style={[s.historyLabel, { marginTop: 8 }]}>{monthLabel(mk)}</Text>
            {grouped[mk].map((item) => {
              const isPast = item.date < todayStr() || (item.date === todayStr() && item.endTime <= `${new Date().getHours().toString().padStart(2,"0")}:${new Date().getMinutes().toString().padStart(2,"0")}`);
              // Проведённый урок — фиолетовый success, запланированный — индиго.
              const accent = isPast ? colors.success : colors.primary;
              const statusLabel = isPast ? "Проведён" : "Запланирован";
              return (
                <View key={item.id} style={[s.slotCard, statusSkin(accent)]}>
                  <View style={s.slotTop}>
                    <View style={[s.slotDot, { backgroundColor: accent }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.slotTime}>{item.startTime} – {item.endTime}</Text>
                      <Text style={s.slotSub}>{formatDateWithDay(item.date)}</Text>
                    </View>
                    <Text style={[s.statusLabel, { color: accent }]}>{statusLabel}</Text>
                  </View>
                  {item.confirmedBookings.map((b) => {
                    const displayName = b.studentName && b.studentSurname
                      ? `${b.studentName} ${b.studentSurname}`
                      : b.studentName ?? b.studentUsername ?? "Ученик";
                    return (
                      <View key={b.bookingId} style={[s.bookingRow, { marginTop: 4 }]}>
                        {/* Аватар из буквы имени вместо эмодзи-заглушки. */}
                        {renderLetterAvatar(displayName, b.studentColor, 32)}
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={s.bookingName}>{displayName}</Text>
                          {b.studentUsername ? <Text style={[s.bookingNote, { color: colors.mutedForeground }]}>@{b.studentUsername}</Text> : null}
                          {b.note ? <Text style={s.bookingNote}>«{b.note}»</Text> : null}
                        </View>
                        <Glyph name={isPast ? "check" : "target"} size={16} color={accent} />
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
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

          {/* Time pickers row */}
          <View style={{ flexDirection: "row", justifyContent: "space-around", marginBottom: 20 }}>
            {/* Start time */}
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

            {/* Divider */}
            <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 4 }} />

            {/* End time */}
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

          {/* Teacher selector */}
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

          {/* Time pickers */}
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
            <View style={{ alignItems: "center", paddingVertical: 24, gap: 12 }}>
              <View style={s.emptyIcon}>
                <Glyph name="users" size={30} color={colors.primary} />
              </View>
              <Text style={{ color: colors.mutedForeground, fontSize: 14, textAlign: "center" }}>
                Нет подключённых учеников.{"\n"}Сначала добавьте ученика.
              </Text>
            </View>
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

  return (
    <View style={s.container}>
      {renderAddSlotModal()}
      {renderCustomReqModal()}
      {renderBookModal()}
      {renderAssignModal()}
      <ConfirmModal
        visible={deleteSlotId !== null}
        title="Удалить слот?"
        message="Вы действительно хотите удалить этот слот?"
        confirmText="Удалить"
        destructive
        onConfirm={doDeleteSlot}
        onCancel={() => setDeleteSlotId(null)}
      />

      <View style={s.header}>
        <Text style={s.headerTitle}>Календарь</Text>
      </View>

      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tab, activeTab === "schedule" && s.tabActive]}
          activeOpacity={0.85}
          onPress={() => setActiveTab("schedule")}
        >
          <Glyph name="calendar" size={14} color={activeTab === "schedule" ? colors.primary : colors.mutedForeground} />
          <Text style={[s.tabText, activeTab === "schedule" && s.tabTextActive]}>Расписание</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, activeTab === "requests" && s.tabActive]}
          activeOpacity={0.85}
          onPress={() => { setActiveTab("requests"); loadBookings(); loadCustomRequests(); if (isTeacherRole) markSeen(); }}
        >
          <Glyph name={isTeacherRole ? "tray" : "cards"} size={14} color={activeTab === "requests" ? colors.primary : colors.mutedForeground} />
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
            <Glyph name="book" size={14} color={activeTab === "history" ? colors.primary : colors.mutedForeground} />
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
