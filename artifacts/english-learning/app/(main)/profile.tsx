// Экран «Профиль»: шапка-герой со счётчиками и полосой опыта, блок «О себе»
// с интересами, цель дня, успеваемость, витрина наград и друзья.
//
// Эмодзи интерфейса не используются — значки рисует собственный набор
// (components/ui/Glyph.tsx). ИСКЛЮЧЕНИЕ: аватар-эмодзи. Его выбирает сам
// ученик, это его лицо в приложении, а не наша иконка.
//
// Крупные блоки вынесены в компоненты:
//   ProfileHero      — шапка (components/ui/ProfileHero.tsx), общая с чужим
//                      профилем app/(main)/friend/[id].tsx;
//   AboutCard        — «О себе» + интересы (components/AboutCard.tsx);
//   DailyQuests      — цель дня (components/DailyQuests.tsx);
//   ScoreCard        — средний балл с переключателем периода
//                      (components/ScoreCard.tsx);
//   AssignmentsCard  — плитка заданий с разбором результатов
//                      (components/AssignmentsCard.tsx);
//   StudyTimeCard    — плитка времени с живыми часами и разбором по дням
//                      (components/StudyTimeCard.tsx);
//   FriendsSheet     — лист связей ученика: учитель, друзья, добавление по
//                      коду (components/FriendsSheet.tsx);
//   NotificationCenter — история уведомлений за колокольчиком в шапке
//                      (components/NotificationCenter.tsx);
//   LevelUpCelebration — окно нового уровня
//                      (components/LevelUpCelebration.tsx).
//
// ── «Друзья» больше не вкладка панели ────────────────────────────────────────
// Раньше у учителя был отдельный нижний таб «Друзья» (app/(main)/friends.tsx),
// а у родителя не было вообще никакого входа в друзей. Теперь и учитель, и
// родитель попадают туда кнопкой прямо здесь, в «Действиях» — тот же приём,
// что уже был у ученика (кнопка «Мои друзья» ниже, только у ученика это лист
// FriendsSheet поверх этого же экрана, а не отдельный маршрут). Точка
// непрочитанных сообщений на кнопке берётся из того же MessagesBadgeContext,
// который раньше питал иконку вкладки в панели.
//
// Все карточки статистики устроены одинаково: нижняя грань и графики, которые
// вырастают от нуля при появлении. Плоских карточек рядом с объёмными на этом
// экране быть не должно — одна такая сразу читается как недоделанная.
// Проседает при нажатии только то, что реально открывается: задания и время.
//
// ── ВИТРИНА НАГРАД ──────────────────────────────────────────────────────────
// Витрина здесь ОДНА на все темы, включая рейды. Медали за рейд раньше жили
// своим блоком во вкладке события; теперь они обычные медали каталога
// (constants/raidAchievements.ts), и показатели для них передаются вместе с
// остальными — см. оба объекта AchievementStats ниже. Забыть их там означает
// «медаль есть в каталоге, но не выдаётся никогда»: выдачу инициирует клиент,
// сервер только проверяет условие.
//
// ── НОВЫЙ УРОВЕНЬ ───────────────────────────────────────────────────────────
// Повышение показывается окном с крупной полосой опыта и свечением. Здесь же
// решается, КОГДА его показать, и это сложнее, чем кажется.
//
// Очки начисляются не тут: в словах, в грамматике, в разговоре, за вход и за
// цель дня. Профиль узнаёт о повышении задним числом — при следующем открытии
// вкладки. Поэтому «показать при повышении» здесь невозможно; можно только
// «показать то, чего ученик ещё не видел».
//
// Отсюда УВИДЕННЫЙ уровень хранится на устройстве (AsyncStorage, ключ на
// каждого пользователя свой). Правила простые:
//   • записи нет — это первый запуск, запоминаем текущий уровень и МОЛЧИМ,
//     иначе окно вылезало бы каждому при первом входе;
//   • записанный уровень меньше текущего — показываем окно и обновляем запись;
//   • равен или больше — ничего не делаем.
//
// Такой порядок переживает и перезагрузку страницы, и повышение сразу на два
// уровня: окно всё равно покажется один раз и назовёт оба номера.
//
// ── Колокольчик ─────────────────────────────────────────────────────────────
// Счётчик непрочитанного берётся тем же запросом, что и всплывающие окна в
// макете вкладок: ключ react-query общий, поэтому лишнего похода на сервер не
// появляется. Только у ученика — у учителя эта лента всегда была бы пустой.
//
// ── Повтор анимаций ─────────────────────────────────────────────────────────
// Профиль — вкладка, а не отдельный экран: при уходе он не размонтируется, и
// анимации внутри карточек играли ровно один раз за сессию. Поэтому здесь
// живёт счётчик replay: он растёт на КАЖДОМ фокусе экрана и передаётся в
// карточки, которые по его изменению запускают свои шкалы с нуля.
// Важно: внутри интервала обновления данных он не растёт — иначе графики
// дёргались бы сами по себе раз в минуту.
//
// ── Нижний отступ ───────────────────────────────────────────────────────────
// Панель вкладок плавающая и лежит ПОВЕРХ содержимого. Отступ снизу берётся
// из screenBottom(insets), где её высота посчитана один раз
// (constants/layout.ts): иначе последний блок экрана уезжает под панель, и
// докрутить его нечем.
//
// Все кнопки экрана — ChunkyButton из GameKit, включая выход из аккаунта
// (тон danger).
//
// Очки за цель дня: карточка сама просит их выдать (onClaim), как только день
// сходится, а признак «уже получено» приходит с сервера в
// gamStats.dailyGoalClaimedToday. Начисляет сервер и только один раз в сутки —
// см. POST /gamification/daily-goal/claim.
//
// Счётчики в шапке передаются списком: у своего профиля это «слов выучено» и
// «дней подряд», у чужого — «очков» и «заданий» (чужую статистику по словам
// сервер не отдаёт).
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView,
  Platform, AppState, Modal, FlatList, Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import { useRouter, useFocusEffect } from "expo-router";
import { useGetStudentSubmissions, useGetStudentTimeStats } from "@workspace/api-client-react";
import { getUnlockedAchievements, getLockedAchievements, type AchievementStats } from "@/constants/achievements";
import { getXpProgress } from "@/constants/xpLevels";
import AsyncStorage from "@react-native-async-storage/async-storage";
import authStorage from "@/utils/authStorage";
import { AchievementsShowcase } from "@/components/AchievementsShowcase";
import { MascotModal, getMascotMessage } from "@/components/Mascot";
import { AchievementToast } from "@/components/AchievementToast";
import { LevelUpCelebration } from "@/components/LevelUpCelebration";
import { DailyQuests } from "@/components/DailyQuests";
import { AboutCard } from "@/components/AboutCard";
import { ScoreCard } from "@/components/ScoreCard";
import { StudyTimeCard } from "@/components/StudyTimeCard";
import { AssignmentsCard } from "@/components/AssignmentsCard";
import { FriendsSheet } from "@/components/FriendsSheet";
import { NotificationBell } from "@/components/NotificationBell";
import { NotificationCenter } from "@/components/NotificationCenter";
import { type CategoryStat } from "@/components/AssignmentRingsChart";
import { useGamification, type GamificationStats } from "@/hooks/useGamification";
import { useNotifications } from "@/hooks/useNotifications";
import { useMessagesBadge } from "@/contexts/MessagesBadgeContext";
import { Glyph } from "@/components/ui/Glyph";
import { ProfileHero } from "@/components/ui/ProfileHero";
import { ChunkyButton, SectionLabel } from "@/components/ui/GameKit";
import { buildDailyPlan } from "@/utils/dailyQuests";
import { accents, radii } from "@/constants/theme";
import { screenBottom, screenTop } from "@/constants/layout";
import type { RaidAchievementFields } from "@/constants/raidAchievements";

/**
 * Показатели рейда для медалей.
 *
 * Отдельной функцией, потому что нужны в ДВУХ местах: в проверке «что уже
 * заслужено» и в витрине, которая рисует полосы прогресса. Пока это был просто
 * список полей, второе место про них забывали, и полосы стояли на нуле у
 * медалей, которые уже выданы.
 */
function raidFields(stats: GamificationStats | null): RaidAchievementFields {
  return {
    raidDamage: stats?.raidDamage ?? 0,
    raidHits: stats?.raidHits ?? 0,
    raidCrits: stats?.raidCrits ?? 0,
    raidBestCombo: stats?.raidBestCombo ?? 0,
    raidWins: stats?.raidWins ?? 0,
    raidLastHits: stats?.raidLastHits ?? 0,
    raidBosses: stats?.raidBosses ?? [],
  };
}

/**
 * Возраст из даты рождения.
 *
 * Запасной путь: обычно возраст лежит в users.age — его считает и сохраняет
 * регистрация. Дата рождения есть не у всех: ученику, которого завёл учитель,
 * её никто не вводил, а у аккаунтов старше шага «когда у вас день рождения»
 * она пустая. Поэтому сначала берётся age, и только если его нет — считаем
 * из даты.
 */
function calcAge(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age > 0 ? age : null;
}

function ageWord(n: number): string {
  if (n >= 11 && n <= 14) return `${n} лет`;
  const mod = n % 10;
  if (mod === 1) return `${n} год`;
  if (mod >= 2 && mod <= 4) return `${n} года`;
  return `${n} лет`;
}

/** Русское склонение по числу. */
function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 14) return forms[2];
  const last = abs % 10;
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

const ROLE_LABELS: Record<string, string> = {
  student: "Ученик", parent: "Родитель", teacher: "Учитель", admin: "Администратор",
};

const AVATAR_EMOJIS = [
  "🦁","🐯","🐻","🐼","🦊","🐸","🦅","🦋","🐬","🦄",
  "🐲","🦝","🦉","🐺","🐮","🐷","🐙","🦀","🐧","🦜",
  "🌟","🚀","⚡","🎯","🎸","🎨","🏆","💎","🔥","🌈",
];
const AVATAR_COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#e11d48",
  "#a855f7","#d946ef","#4338ca","#6d28d9",
  "#818cf8","#f59e0b","#64748b","#1e293b",
];

type StatsPeriod = "week" | "month" | "all";
const PERIODS: { key: StatsPeriod; label: string; days: number | null }[] = [
  { key: "week", label: "Неделя", days: 7 },
  { key: "month", label: "Месяц", days: 30 },
  { key: "all", label: "Всё время", days: null },
];

const SESSION_START_KEY = "timer_session_start";

/** Как часто перезапрашивать прогресс задач дня, пока экран открыт. */
const PLAN_REFRESH_MS = 60_000;

/**
 * Ключ, под которым лежит последний УВИДЕННЫЙ уровень.
 *
 * На каждого пользователя свой: на одном телефоне занимаются и брат, и сестра,
 * и чужое повышение показывать нельзя.
 */
function seenLevelKey(userId: number): string {
  return `xp_level_seen_${userId}`;
}

function useLiveTimer() {
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncFromStorage = useCallback(async () => {
    const stored = await AsyncStorage.getItem(SESSION_START_KEY);
    const initial = stored ? Math.floor((Date.now() - Number(stored)) / 1000) : 0;
    setSeconds(Math.max(0, initial));
  }, []);

  const startTicking = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }, []);

  const stopTicking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    syncFromStorage().then(startTicking);

    if (Platform.OS === "web" && typeof document !== "undefined") {
      const onVisibility = () => {
        if (document.hidden) {
          stopTicking();
        } else {
          syncFromStorage().then(startTicking);
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        stopTicking();
      };
    }

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        syncFromStorage().then(startTicking);
      } else {
        stopTicking();
      }
    });

    return () => {
      appStateSub.remove();
      stopTicking();
    };
  }, [syncFromStorage, startTicking, stopTicking]);

  return seconds;
}

function AvatarPickerModal({
  visible, onClose, currentEmoji, currentColor, onSave,
}: {
  visible: boolean;
  onClose: () => void;
  currentEmoji: string;
  currentColor: string;
  onSave: (emoji: string, color: string) => void;
}) {
  const colors = useColors();
  const [emoji, setEmoji] = useState(currentEmoji);
  const [color, setColor] = useState(currentColor);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: 24 }}>
          <Text style={{ fontSize: 19, fontWeight: "900", color: colors.foreground, marginBottom: 16 }}>
            Выбери аватар
          </Text>

          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <View style={{
              width: 84, height: 84, borderRadius: 28, backgroundColor: color,
              justifyContent: "center", alignItems: "center",
              shadowColor: color, shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
            }}>
              <Text style={{ fontSize: 42 }}>{emoji}</Text>
            </View>
          </View>

          <SectionLabel>Аватар</SectionLabel>
          <FlatList
            data={AVATAR_EMOJIS}
            numColumns={8}
            keyExtractor={(e) => e}
            style={{ maxHeight: 120, marginBottom: 16 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => setEmoji(item)}
                style={{
                  flex: 1, aspectRatio: 1, justifyContent: "center", alignItems: "center",
                  borderRadius: 10, margin: 2,
                  backgroundColor: item === emoji ? colors.primary + "20" : "transparent",
                  borderWidth: item === emoji ? 2 : 0,
                  borderColor: colors.primary,
                }}
              >
                <Text style={{ fontSize: 24 }}>{item}</Text>
              </TouchableOpacity>
            )}
          />

          <SectionLabel>Цвет фона</SectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {AVATAR_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setColor(c)}
                  style={{
                    width: 36, height: 36, borderRadius: 18, backgroundColor: c,
                    borderWidth: c === color ? 3 : 0, borderColor: colors.foreground,
                  }}
                />
              ))}
            </View>
          </ScrollView>

          <ChunkyButton label="Сохранить" icon="check" onPress={() => { onSave(emoji, color); onClose(); }} />
          <TouchableOpacity onPress={onClose} style={{ paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ fontSize: 15, color: colors.mutedForeground }}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const BASE = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function apiFetch(path: string, opts?: RequestInit) {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Ошибка сервера");
  return data;
}

export default function ProfileScreen() {
  const colors = useColors();
  const { user, logout, updateUser } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const sessionSeconds = useLiveTimer();
  const { unreadTotal } = useMessagesBadge();

  const [avatarEmoji, setAvatarEmoji] = useState(user?.avatarEmoji ?? "🦁");
  const [avatarColor, setAvatarColor] = useState(user?.avatarColor ?? "#6366f1");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [bio, setBio] = useState(user?.bio ?? "");
  const [bioLoaded, setBioLoaded] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);
  const [username] = useState(user?.username ?? "");
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [period, setPeriod] = useState<StatsPeriod>("all");
  /**
   * Счётчик показов экрана. Растёт при каждом фокусе профиля и передаётся в
   * карточки: по его изменению шкалы, кольца и столбики стартуют с нуля.
   * Без него анимации играли один раз за сессию — вкладка живёт в памяти.
   */
  const [replay, setReplay] = useState(0);
  /** Какое повышение показываем. null — окна нет. */
  const [levelUp, setLevelUp] = useState<{ from: number; to: number } | null>(null);
  /**
   * Последний увиденный уровень. Держим и в памяти, и в хранилище: в памяти —
   * чтобы не читать диск на каждом обновлении статистики, в хранилище — чтобы
   * пережить перезагрузку.
   */
  const seenLevel = useRef<number | null>(null);
  const [teacherRequests, setTeacherRequests] = useState<Array<{
    requestId: number;
    teacher: { id: number; name: string; username: string; avatarEmoji: string | null; avatarColor: string | null; role: string };
  }>>([]);

  const {
    stats: gamStats, toastAchievement,
    loadStats, claimDailyLogin, claimDailyGoal, unlockAchievements, hideToast, updateDailyGoal,
  } = useGamification();

  const [mascotVisible, setMascotVisible] = useState(false);
  const [mascotMsg, setMascotMsg] = useState({ message: "", mood: "wave" as any });
  const [dailyLoginShown, setDailyLoginShown] = useState(false);

  const isStudent = user?.role === "student";
  const isTeacher = isTeacherOrAdmin(user?.role ?? "");

  // Тот же запрос, что кормит всплывающие окна в макете вкладок: ключ
  // react-query общий, поэтому второго похода на сервер не появляется.
  const { unreadCount } = useNotifications(isStudent);

  useEffect(() => {
    if (!user?.id) return;
    authStorage.getItem("auth_token").then((token) => {
      fetch(`${BASE}/api/users/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.bio !== undefined && !bioLoaded) {
            setBio(data.bio ?? "");
            setBioLoaded(true);
          }
        })
        .catch(() => { /* silent */ });
    });
  }, [user?.id]);

  // Интересы лежат отдельно от профиля (см. routes/interests.ts): их правит
  // только сам ученик, и подмешивать массив в общий PATCH профиля не нужно.
  const loadInterests = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await apiFetch(`/api/users/${user.id}/interests`);
      setInterests(Array.isArray(data?.interests) ? data.interests : []);
    } catch { /* silent */ }
  }, [user?.id]);

  useEffect(() => { loadInterests(); }, [loadInterests]);

  const saveInterests = useCallback(async (nextList: string[]) => {
    if (!user?.id) return;
    const prev = interests;
    setInterests(nextList); // оптимистично: метки должны реагировать мгновенно
    try {
      const data = await apiFetch(`/api/users/${user.id}/interests`, {
        method: "PUT",
        body: JSON.stringify({ interests: nextList }),
      });
      if (Array.isArray(data?.interests)) setInterests(data.interests);
    } catch {
      setInterests(prev);
      Alert.alert("Не удалось сохранить", "Проверьте интернет-соединение и попробуйте снова.");
    }
  }, [user?.id, interests]);

  useEffect(() => {
    if (!isStudent) return;
    const load = async () => {
      try {
        const token = await authStorage.getItem("auth_token");
        const headers = { Authorization: `Bearer ${token}` };

        const [friendsRes, teacherRes] = await Promise.all([
          fetch(`${BASE}/api/connections/friends`, { headers }),
          fetch(`${BASE}/api/connections/student/teacher-requests`, { headers }),
        ]);

        if (friendsRes.ok) {
          const data: Array<{ status: string; direction: string }> = await friendsRes.json();
          const count = Array.isArray(data)
            ? data.filter((f) => f.status === "pending" && f.direction === "received").length
            : 0;
          setPendingCount(count);
        }
        if (teacherRes.ok) {
          const data = await teacherRes.json();
          setTeacherRequests(Array.isArray(data) ? data : []);
        }
      } catch { /* silent */ }
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [isStudent]);

  const { data: submissions } = useGetStudentSubmissions(
    user?.id || 0,
    { query: { enabled: isStudent && !!user?.id } as any }
  );
  const { data: timeStats, dataUpdatedAt: timeStatsAt } = useGetStudentTimeStats(
    user?.id || 0,
    { query: { enabled: isStudent && !!user?.id, refetchInterval: 10_000 } as any }
  );

  const submissionRows: any[] = Array.isArray(submissions) ? (submissions as any[]) : [];
  const completedCount = submissionRows.length;
  const totalMinutes = timeStats?.totalMinutes ?? 0;
  const todaySeconds = timeStats && timeStatsAt
    ? Math.max(0, Math.floor((timeStats.todayMinutes ?? 0) * 60 + (Date.now() - timeStatsAt) / 1000))
    : sessionSeconds;

  /**
   * Секунды за сегодня для цели дня: максимум из серверного значения и живого
   * счётчика. Сервер знает о времени в других вкладках, таймер — о секундах,
   * которые сервер ещё не успел учесть.
   *
   * Именно СЕКУНДЫ, а не минуты: кольцо цели считает процент из них и растёт
   * по проценту. По целым минутам при цели в 20 минут оно стояло на месте, а
   * потом прыгало сразу на 5 %.
   */
  const liveTodaySeconds = React.useMemo(
    () => Math.max((gamStats?.todayMinutes ?? 0) * 60, Math.max(0, Math.floor(todaySeconds))),
    [gamStats?.todayMinutes, todaySeconds],
  );

  /** Целые минуты: их показывает заголовок «19 из 20 минут». */
  const liveTodayMinutes = Math.floor(liveTodaySeconds / 60);

  /**
   * Успеваемость за выбранный период: сам балл, балл за предыдущий такой же
   * отрезок и оценки последних работ.
   *
   * Зачем предыдущий отрезок: «29 %» не отвечает на вопрос «я стал лучше?».
   * Сравнение с прошлой неделей отвечает. Для «всего времени» сравнивать не с
   * чем календарно, поэтому там первая половина работ против второй — это
   * честный ответ на тот же вопрос.
   *
   * Зачем список оценок: одинаковый средний балл бывает у ровного ученика
   * (60-60-60) и у скачущего (30-90-60). Столбики показывают разницу, средний
   * балл — нет.
   */
  const periodScore = React.useMemo(() => {
    const days = PERIODS.find((p) => p.key === period)?.days ?? null;

    const withTime = submissionRows
      .map((r) => ({ score: r.score as number | null, at: new Date(r.submittedAt).getTime() }))
      .filter((r) => typeof r.score === "number" && Number.isFinite(r.at))
      .sort((a, b) => a.at - b.at);

    const avg = (list: { score: number | null }[]) =>
      list.length === 0
        ? null
        : Math.round(list.reduce((sum, r) => sum + (r.score ?? 0), 0) / list.length);

    if (days === null) {
      // «Всё время»: делим историю пополам. Одна работа — сравнивать нечего.
      const half = Math.floor(withTime.length / 2);
      return {
        average: avg(withTime),
        previous: withTime.length >= 4 ? avg(withTime.slice(0, half)) : null,
        recent: withTime.slice(-8).map((r) => r.score as number),
      };
    }

    const now = Date.now();
    const from = now - days * 86400000;
    const prevFrom = from - days * 86400000;

    const current = withTime.filter((r) => r.at >= from);
    const previous = withTime.filter((r) => r.at >= prevFrom && r.at < from);

    return {
      average: avg(current),
      previous: avg(previous),
      recent: current.slice(-8).map((r) => r.score as number),
    };
  }, [submissions, period]);

  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const loadCategoryStats = useCallback(async () => {
    if (!isStudent || !user?.id) return;
    try {
      const data = await apiFetch(`/api/students/${user.id}/category-stats`);
      setCategoryStats(Array.isArray(data) ? data : []);
    } catch {
      setCategoryStats([]);
    }
  }, [isStudent, user?.id]);

  useEffect(() => { loadCategoryStats(); }, [loadCategoryStats, completedCount]);

  const [wordStats, setWordStats] = useState({
    totalLearned: 0, wordsToday: 0, learnedToday: 0, dailyWordGoal: 10,
  });
  const loadWordStats = useCallback(async () => {
    if (!isStudent) return;
    try {
      const data = await apiFetch("/api/flashcards/stats");
      setWordStats({
        totalLearned: Number(data?.totalLearned) || 0,
        wordsToday: Number(data?.wordsToday) || 0,
        learnedToday: Number(data?.learnedToday) || 0,
        dailyWordGoal: Number(data?.dailyWordGoal) || 10,
      });
    } catch { /* задачи по словам просто не покажут прогресс */ }
  }, [isStudent]);

  // Пока экран открыт, прогресс задач подтягивается сам: профиль — вкладка,
  // он не размонтируется, и без опроса галочки появлялись бы только после
  // перехода на другую вкладку и обратно.
  //
  // Здесь же поднимается replay: КАЖДЫЙ вход на экран заново проигрывает
  // графики. Внутри интервала его трогать нельзя — иначе шкалы сбрасывались бы
  // сами по себе раз в минуту прямо под носом у читающего.
  useFocusEffect(
    useCallback(() => {
      if (!isStudent) return;
      setReplay((n) => n + 1);
      const refresh = () => {
        loadStats();
        loadCategoryStats();
        loadWordStats();
      };
      refresh();
      const interval = setInterval(refresh, PLAN_REFRESH_MS);
      return () => clearInterval(interval);
    }, [isStudent, loadStats, loadCategoryStats, loadWordStats])
  );

  useEffect(() => {
    if (!isStudent || dailyLoginShown) return;
    const runDailyLogin = async () => {
      const result = await claimDailyLogin();
      if (!result) return;
      setDailyLoginShown(true);
      if (!result.alreadyClaimed) {
        const msg = getMascotMessage("daily_login", {
          streak: result.loginStreak,
          points: result.pointsAwarded,
          nextPoints: result.nextPoints,
          streakReset: result.streakReset,
        });
        setMascotMsg(msg);
        setMascotVisible(true);
      }
    };
    runDailyLogin();
  }, [isStudent, dailyLoginShown, claimDailyLogin]);

  useEffect(() => {
    if (!gamStats || !isStudent) return;
    const stats: AchievementStats = {
      completedAssignments: gamStats.completedAssignments,
      totalPoints: gamStats.totalPoints,
      knowledgeLevel: user?.knowledgeLevel ?? null,
      totalTimeMinutes: gamStats.totalTimeMinutes,
      voiceChatSessions: gamStats.voiceChatSessions,
      loginStreak: gamStats.loginStreak,
      perfectScoreCount: gamStats.perfectScoreCount,
      xpLevel: gamStats.xpLevel,
      earlyBirdSessions: gamStats.earlyBirdSessions,
      // Раздел «Учёба»: без этих полей медали grammar_*, forms_*, phrases_* и
      // tenses_* не выдались бы никогда — сервер их проверяет, но просит о
      // выдаче именно клиент.
      grammarSolved: gamStats.grammarSolved,
      verbFormsMastered: gamStats.verbFormsMastered,
      tensesMastered: gamStats.tensesMastered,
      sentencesBuilt: gamStats.sentencesBuilt,
      // Рейды: то же самое для медалей raidhits_*, raiddamage_*, raidcombo_*,
      // raidlast_*, raidbosses_* и пяти медалей за конкретных боссов.
      ...raidFields(gamStats),
    };
    const unlcked = getUnlockedAchievements(stats).map(a => a.id);
    const newOnes = unlcked.filter(id => !gamStats.unlockedAchievementIds.includes(id));
    if (newOnes.length > 0) {
      unlockAchievements(newOnes);
    }
  }, [gamStats, isStudent, user?.knowledgeLevel, unlockAchievements]);

  const achievementStats: AchievementStats = React.useMemo(() => ({
    completedAssignments: gamStats?.completedAssignments ?? 0,
    totalPoints: gamStats?.totalPoints ?? 0,
    knowledgeLevel: user?.knowledgeLevel ?? null,
    totalTimeMinutes: gamStats?.totalTimeMinutes ?? 0,
    voiceChatSessions: gamStats?.voiceChatSessions ?? 0,
    loginStreak: gamStats?.loginStreak ?? 0,
    perfectScoreCount: gamStats?.perfectScoreCount ?? 0,
    xpLevel: gamStats?.xpLevel ?? 1,
    earlyBirdSessions: gamStats?.earlyBirdSessions ?? 0,
    // Показатели раздела «Учёба». На СВОЁМ профиле они есть всегда, поэтому
    // ноль здесь означает «ещё не занимался», а не «данных нет».
    grammarSolved: gamStats?.grammarSolved ?? 0,
    verbFormsMastered: gamStats?.verbFormsMastered ?? 0,
    tensesMastered: gamStats?.tensesMastered ?? 0,
    sentencesBuilt: gamStats?.sentencesBuilt ?? 0,
    // Рейды: по ним витрина рисует полосы «урона нанесено» и «комбо», а медали
    // за боссов показывает как факт без полосы.
    ...raidFields(gamStats),
  }), [gamStats, user?.knowledgeLevel]);

  const unlocked = React.useMemo(() => getUnlockedAchievements(achievementStats), [achievementStats]);
  const locked = React.useMemo(() => getLockedAchievements(achievementStats), [achievementStats]);

  const dailyPlan = React.useMemo(() => {
    if (!gamStats) return null;
    return buildDailyPlan({
      todayMinutes: liveTodayMinutes,
      // Секунды нужны кольцу: по ним оно растёт по проценту, а не рывками.
      todaySeconds: liveTodaySeconds,
      activeGoalMinutes: gamStats.dailyGoalMinutes,
      selectedGoalMinutes: gamStats.nextDailyGoalMinutes ?? gamStats.dailyGoalMinutes,
      todayCompletions: gamStats.todayCompletions ?? 0,
      todayVoiceSessions: gamStats.todayVoiceSessions ?? 0,
      wordsToday: wordStats.wordsToday,
      learnedToday: wordStats.learnedToday,
      dailyWordGoal: wordStats.dailyWordGoal,
      // Задачи по разделу «Учёба». Счётчики приходят с сервера тем же запросом,
      // что и остальные: отдельного похода за ними нет.
      grammarToday: gamStats.grammarToday ?? 0,
      verbFormsToday: gamStats.verbFormsToday ?? 0,
    });
  }, [gamStats, wordStats, liveTodayMinutes, liveTodaySeconds]);

  const xp = gamStats?.totalPoints ?? 0;
  const xpProgress = getXpProgress(xp);
  const currentLevel = xpProgress.current.level;

  /**
   * Не пропустить повышение.
   *
   * Уровень считается из очков на клиенте (getXpProgress), а не берётся из
   * gamStats.xpLevel: на экране показывается именно это число, и окно должно
   * говорить о том же, что шапка.
   *
   * Правила и причина, по которой увиденный уровень хранится на устройстве, —
   * в шапке файла.
   */
  useEffect(() => {
    if (!isStudent || !gamStats || !user?.id) return;
    const key = seenLevelKey(user.id);
    let alive = true;

    (async () => {
      try {
        if (seenLevel.current === null) {
          const stored = await AsyncStorage.getItem(key);
          if (!alive) return;
          if (stored === null) {
            // Первая встреча с этим аккаунтом: молча запоминаем, где он сейчас.
            seenLevel.current = currentLevel;
            await AsyncStorage.setItem(key, String(currentLevel));
            return;
          }
          const parsed = Number(stored);
          seenLevel.current = Number.isFinite(parsed) ? parsed : currentLevel;
        }

        const seen = seenLevel.current ?? currentLevel;
        if (currentLevel > seen) {
          seenLevel.current = currentLevel;
          await AsyncStorage.setItem(key, String(currentLevel));
          if (alive) setLevelUp({ from: seen, to: currentLevel });
        }
      } catch {
        // Хранилище недоступно — просто не показываем окно. Ронять профиль из-за
        // праздничной анимации нельзя.
      }
    })();

    return () => { alive = false; };
  }, [isStudent, gamStats, user?.id, currentLevel]);

  const respondToTeacherRequest = async (requestId: number, accept: boolean) => {
    try {
      const token = await authStorage.getItem("auth_token");
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (accept) {
        await fetch(`${BASE}/api/connections/student/teacher-requests/${requestId}/accept`, {
          method: "PATCH", headers,
        });
      } else {
        await fetch(`${BASE}/api/connections/student/teacher-requests/${requestId}`, {
          method: "DELETE", headers,
        });
      }
      setTeacherRequests((prev) => prev.filter((r) => r.requestId !== requestId));
    } catch { /* silent */ }
  };

  const saveProfile = async (patch: { avatarEmoji?: string; avatarColor?: string; avatarUrl?: string | null; bio?: string; username?: string }): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    try {
      const token = await authStorage.getItem("auth_token");
      const res = await fetch(`${BASE}/api/users/${user.id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return false;
      await updateUser(patch);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarSave = async (emoji: string, color: string) => {
    setAvatarMenuOpen(false);
    const prevEmoji = avatarEmoji;
    const prevColor = avatarColor;
    const prevUrl = avatarUrl;
    setAvatarEmoji(emoji);
    setAvatarColor(color);
    setAvatarUrl(null);
    const ok = await saveProfile({ avatarEmoji: emoji, avatarColor: color, avatarUrl: null });
    if (!ok) {
      setAvatarEmoji(prevEmoji);
      setAvatarColor(prevColor);
      setAvatarUrl(prevUrl);
      Alert.alert("Не удалось сохранить", "Проверьте интернет-соединение и попробуйте снова.");
    }
  };

  const handlePhotoUpload = async () => {
    setAvatarMenuOpen(false);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const prevUrl = avatarUrl;
    setSaving(true);
    try {
      const actions: ImageManipulator.Action[] = [];
      if (asset.width && asset.height && asset.width !== asset.height) {
        const size = Math.min(asset.width, asset.height);
        actions.push({
          crop: {
            originX: Math.round((asset.width - size) / 2),
            originY: Math.round((asset.height - size) / 2),
            width: size,
            height: size,
          },
        });
      }
      actions.push({ resize: { width: 256, height: 256 } });
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        actions,
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: false }
      );
      const blobRes = await fetch(manipulated.uri);
      const blob = await blobRes.blob();
      if (blob.size > 500_000) {
        setAvatarUrl(prevUrl);
        Alert.alert("Фото слишком большое", "Попробуйте выбрать другое изображение.");
        return;
      }
      const token = await authStorage.getItem("auth_token");

      const presignedRes = await fetch(`${BASE}/api/storage/request-upload-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify({
          name: "avatar.jpg",
          size: blob.size,
          contentType: "image/jpeg",
        }),
      });
      const presignedData = await presignedRes.json().catch(() => ({}));
      if (!presignedRes.ok) {
        throw new Error(presignedData.error ?? "Ошибка получения ссылки для загрузки");
      }
      const { uploadURL, objectPath } = presignedData as {
        uploadURL: string;
        objectPath: string;
      };

      const uploadTarget = uploadURL.startsWith("http")
        ? uploadURL
        : `${BASE}${uploadURL}`;
      const uploadRes = await fetch(uploadTarget, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      });
      if (!uploadRes.ok) throw new Error("Ошибка загрузки файла на сервер");

      const serveUrl = `${BASE}/api/storage${objectPath}?kind=image`;
      setAvatarUrl(serveUrl);
      const ok = await saveProfile({ avatarUrl: serveUrl });
      if (!ok) {
        setAvatarUrl(prevUrl);
        Alert.alert(
          "Не удалось сохранить фото",
          "Попробуйте выбрать фото меньшего размера или другое изображение."
        );
      }
    } catch {
      setAvatarUrl(prevUrl);
      Alert.alert("Не удалось сохранить фото", "Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePhoto = async () => {
    setAvatarMenuOpen(false);
    const prevUrl = avatarUrl;
    setAvatarUrl(null);
    const ok = await saveProfile({ avatarUrl: null });
    if (!ok) {
      setAvatarUrl(prevUrl);
      Alert.alert("Не удалось сохранить", "Проверьте интернет-соединение и попробуйте снова.");
    }
  };

  /**
   * Выход с подтверждением. На вебе Alert.alert не показывает кнопки, поэтому
   * там используется window.confirm — иначе выход происходил бы молча.
   */
  const handleLogout = useCallback(() => {
    if (Platform.OS === "web") {
      if (window.confirm("Выйти из аккаунта?")) logout();
      return;
    }
    Alert.alert(
      "Выйти из аккаунта?",
      "Вы уверены, что хотите выйти из профиля?",
      [
        { text: "Отмена", style: "cancel" },
        { text: "Выйти", style: "destructive", onPress: logout },
      ],
      { cancelable: true }
    );
  }, [logout]);

  if (!user) return null;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    // Панель вкладок плавает поверх содержимого: без этого отступа последний
    // блок экрана оказывается под ней.
    scroll: { paddingBottom: screenBottom(insets) },

    section: { paddingHorizontal: 20, marginBottom: 16 },

    row: {
      flexDirection: "row", alignItems: "center", gap: 14,
      backgroundColor: colors.card, borderRadius: radii.md, padding: 16,
      marginBottom: 10, borderWidth: 1, borderColor: colors.border,
      shadowColor: accents.violetDeep, shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.13, shadowRadius: 14, elevation: 3,
    },
    rowText: { flex: 1, fontSize: 15, fontWeight: "800", color: colors.foreground },
  });

  // Возраст: сначала готовое число из базы, дата рождения — запасной путь.
  // Раньше считали только из даты, и у всех, кому её не вводили (ученики от
  // учителя, старые аккаунты), метка возраста просто не появлялась.
  const age = user.age ?? calcAge(user.dateOfBirth);
  const streak = gamStats?.loginStreak ?? 0;
  const isParent = user.role === "parent";

  return (
    <View style={s.container}>
      <AvatarPickerModal
        visible={avatarPickerOpen}
        onClose={() => setAvatarPickerOpen(false)}
        currentEmoji={avatarEmoji}
        currentColor={avatarColor}
        onSave={handleAvatarSave}
      />
      {isStudent && (
        <FriendsSheet
          visible={friendsOpen}
          onClose={() => setFriendsOpen(false)}
          onOpenFriend={(id) => router.push(`/(main)/friend/${id}` as any)}
          onOpenChat={(id) => router.push(`/(main)/chat/${id}?back=${encodeURIComponent("/(main)/profile")}` as any)}
          inviteCode={user.inviteCode}
        />
      )}

      {isStudent && (
        <NotificationCenter
          visible={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
        />
      )}

      <AchievementToast achievement={toastAchievement} onHide={hideToast} />

      <MascotModal
        visible={mascotVisible}
        mood={mascotMsg.mood}
        message={mascotMsg.message}
        mascotName={gamStats?.mascotName ?? "Снежа"}
        onClose={() => setMascotVisible(false)}
      />

      {/* Новый уровень. Стоит ПОСЛЕ окна маскота намеренно: если в один вход
          пришлись и приветствие за серию, и повышение, наверху должно быть
          повышение — оно случается редко. */}
      <LevelUpCelebration
        visible={!!levelUp}
        fromLevel={levelUp?.from ?? 1}
        toLevel={levelUp?.to ?? 1}
        onClose={() => setLevelUp(null)}
      />

      <Modal visible={avatarMenuOpen} transparent animationType="slide" onRequestClose={() => setAvatarMenuOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "#00000066", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, padding: 24, paddingBottom: 36 }}>
            <Text style={{ fontSize: 19, fontWeight: "900", color: colors.foreground, marginBottom: 20 }}>Сменить аватар</Text>
            <TouchableOpacity
              onPress={handlePhotoUpload}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderRadius: radii.sm + 2, backgroundColor: colors.primary + "12", paddingHorizontal: 16, marginBottom: 10 }}
            >
              <Glyph name="camera" size={20} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.primary }}>Загрузить фото из галереи</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setAvatarMenuOpen(false); setAvatarPickerOpen(true); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderRadius: radii.sm + 2, backgroundColor: colors.muted, paddingHorizontal: 16, marginBottom: 10 }}
            >
              <Glyph name="face" size={20} color={colors.foreground} />
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground }}>Выбрать аватар</Text>
            </TouchableOpacity>
            {avatarUrl && (
              <TouchableOpacity
                onPress={handleRemovePhoto}
                style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderRadius: radii.sm + 2, backgroundColor: colors.destructive + "12", paddingHorizontal: 16, marginBottom: 10 }}
              >
                <Glyph name="trash" size={20} color={colors.destructive} />
                <Text style={{ fontSize: 16, fontWeight: "800", color: colors.destructive }}>Удалить фото</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setAvatarMenuOpen(false)} style={{ paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ fontSize: 15, color: colors.mutedForeground }}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <ProfileHero
          name={user.name}
          username={username}
          avatarEmoji={avatarEmoji}
          avatarColor={avatarColor}
          avatarUrl={avatarUrl}
          saving={saving}
          onEditAvatar={() => setAvatarMenuOpen(true)}
          roleLabel={ROLE_LABELS[user.role] ?? user.role}
          ageLabel={age !== null ? ageWord(age) : null}
          bell={isStudent
            ? (
              <NotificationBell
                count={unreadCount}
                onPress={() => setNotificationsOpen(true)}
              />
            )
            : undefined}
          level={isStudent && gamStats
            ? { number: xpProgress.current.level, title: xpProgress.current.title }
            : null}
          stats={isStudent && gamStats
            ? [
                {
                  icon: "cards",
                  value: wordStats.totalLearned,
                  label: `${plural(wordStats.totalLearned, ["слово", "слова", "слов"])} выучено`,
                },
                {
                  icon: "flame",
                  value: streak,
                  label: `${plural(streak, ["день", "дня", "дней"])} подряд`,
                },
              ]
            : null}
          xp={isStudent && gamStats
            ? {
                current: xp,
                nextAt: xpProgress.next?.xpRequired ?? null,
                nextTitle: xpProgress.next?.title ?? null,
                nextLevel: xpProgress.next?.level ?? null,
                percent: xpProgress.progressPercent,
              }
            : null}
          paddingTop={screenTop(insets)}
        />

        {isStudent && teacherRequests.length > 0 && (
          <View style={{ marginHorizontal: 20, marginBottom: 12 }}>
            <SectionLabel>Заявки от учителей · {teacherRequests.length}</SectionLabel>
            {teacherRequests.map((req) => (
              <View key={req.requestId} style={{
                flexDirection: "row", alignItems: "center", gap: 12,
                backgroundColor: colors.card, borderRadius: radii.md, padding: 14,
                borderWidth: 1, borderColor: colors.border, marginBottom: 10,
                shadowColor: colors.primary, shadowOffset: { width: 0, height: 5 },
                shadowOpacity: 0.14, shadowRadius: 14, elevation: 3,
              }}>
                <View style={{
                  width: 46, height: 46, borderRadius: 16,
                  backgroundColor: req.teacher.avatarColor ?? "#6366f1",
                  justifyContent: "center", alignItems: "center",
                }}>
                  {req.teacher.avatarEmoji
                    ? <Text style={{ fontSize: 22 }}>{req.teacher.avatarEmoji}</Text>
                    : <Glyph name="cap" size={22} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground }}>
                    {req.teacher.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground }}>хочет добавить вас как ученика</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={() => respondToTeacherRequest(req.requestId, false)}
                    style={{ backgroundColor: colors.destructive + "1f", borderRadius: 9, padding: 9 }}
                  >
                    <Glyph name="close" size={16} color={colors.destructive} />
                  </Pressable>
                  <Pressable
                    onPress={() => respondToTeacherRequest(req.requestId, true)}
                    style={{ backgroundColor: colors.primary, borderRadius: 9, padding: 9 }}
                  >
                    <Glyph name="check" size={16} color="#fff" />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* «О себе» + интересы. Стоит сразу под шапкой: сначала знакомство
            с человеком, потом дела на сегодня. */}
        <AboutCard
          bio={bio}
          onSaveBio={(value) => { setBio(value); saveProfile({ bio: value }); }}
          interests={interests}
          onSaveInterests={saveInterests}
        />

        {isStudent && dailyPlan && (
          <View style={s.section}>
            <DailyQuests
              plan={dailyPlan}
              goalMinutes={gamStats?.nextDailyGoalMinutes ?? gamStats?.dailyGoalMinutes ?? 15}
              claimed={gamStats?.dailyGoalClaimedToday ?? false}
              onClaim={claimDailyGoal}
              onGoalChange={updateDailyGoal}
              replay={replay}
            />
          </View>
        )}

        {isStudent && (
          <>
            <ScoreCard
              average={periodScore.average}
              previousAverage={periodScore.previous}
              recentScores={periodScore.recent}
              periods={PERIODS}
              period={period}
              onPeriodChange={setPeriod}
              replay={replay}
              style={s.section}
            />

            {/* Пара плиток: задания и время. Обе объёмные и обе открывают
                разбор — разной физики у соседей быть не должно. */}
            <View style={s.section}>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "stretch" }}>
                <AssignmentsCard stats={categoryStats} submissions={submissionRows} replay={replay} />

                <StudyTimeCard
                  studentId={user.id}
                  totalMinutes={gamStats?.totalTimeMinutes ?? totalMinutes}
                  todaySeconds={todaySeconds}
                />
              </View>
            </View>

            <AchievementsShowcase
              unlocked={unlocked}
              locked={locked}
              showLocked={true}
              stats={achievementStats}
              title="Витрина наград"
            />

            <View style={s.section}>
              <SectionLabel>Друзья</SectionLabel>
              <ChunkyButton
                label="Мои друзья"
                sublabel={pendingCount > 0
                  ? `${pendingCount} новых заявок · добавляй по коду`
                  : "Добавляй друзей по коду и смотри их очки"}
                icon="users"
                chevron
                tone={pendingCount > 0 ? "warm" : "primary"}
                onPress={() => setFriendsOpen(true)}
              />
            </View>
          </>
        )}

        {(isTeacher || isParent) && (
          <View style={s.section}>
            <SectionLabel>Действия</SectionLabel>

            {isTeacher && (
              <ChunkyButton
                label="Создать задание"
                sublabel="Тест, аудирование, чтение, видео или колода слов"
                icon="plus"
                chevron
                onPress={() => router.push("/(main)/create-assignment" as any)}
                style={{ marginBottom: 10 }}
              />
            )}

            {/* «Друзья» больше не вкладка панели — см. шапку файла. Точка
                непрочитанного берётся из того же MessagesBadgeContext, который
                раньше кормил счётчик на иконке вкладки. */}
            <ChunkyButton
              label="Друзья"
              sublabel={unreadTotal > 0
                ? `${unreadTotal} ${unreadTotal === 1 ? "новое сообщение" : "новых сообщений"}`
                : "Переписка с учениками, родителями и друзьями"}
              icon="chat"
              chevron
              tone={unreadTotal > 0 ? "warm" : "primary"}
              onPress={() => router.push("/(main)/friends" as any)}
              style={{ marginBottom: 10 }}
            />

            <TouchableOpacity activeOpacity={0.85} style={s.row} onPress={() => router.push("/(main)/students" as any)}>
              <View style={{
                width: 42, height: 42, borderRadius: radii.sm,
                backgroundColor: colors.primary + "18",
                alignItems: "center", justifyContent: "center",
              }}>
                <Glyph name="users" size={20} color={colors.primary} />
              </View>
              <Text style={s.rowText}>{isParent ? "Мои дети" : "Все ученики"}</Text>
              <Glyph name="chevron" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}

        {/* Выход — такая же физическая кнопка, как остальные, только красная. */}
        <View style={{ paddingHorizontal: 20 }}>
          <ChunkyButton
            label="Выйти из аккаунта"
            icon="logout"
            tone="danger"
            onPress={handleLogout}
          />
        </View>
      </ScrollView>
    </View>
  );
}
