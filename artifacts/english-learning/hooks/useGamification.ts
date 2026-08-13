import { useState, useCallback, useRef } from "react";
import authStorage from "@/utils/authStorage";
import type { Achievement } from "@/constants/achievements";

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
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Ошибка сервера");
  return data;
}

export interface GamificationStats {
  totalPoints: number;
  xpLevel: number;
  /** Цель, которая действует сегодня. */
  dailyGoalMinutes: number;
  /** Выбранная цель, которая вступит в силу завтра. */
  nextDailyGoalMinutes: number;
  /** Награда за сегодняшний день уже получена. */
  dailyGoalClaimedToday: boolean;
  loginStreak: number;
  lastLoginDate: string | null;
  todayMinutes: number;
  todayCompletions: number;
  todayVoiceSessions: number;
  voiceChatSessions: number;
  perfectScoreCount: number;
  completedAssignments: number;
  earlyBirdSessions: number;
  unlockedAchievementIds: string[];
  totalTimeMinutes: number;
  mascotName: string;

  // ── Раздел «Учёба» ──
  // За всё время — из них считаются медали grammar_*, forms_*, phrases_*,
  // tenses_*. За сегодня — из них собирается цель дня.
  /** Верных ответов во всех режимах раздела. */
  grammarSolved: number;
  /** Глаголов, чьи три формы ученик знает наизусть. */
  verbFormsMastered: number;
  /** Времён, отработанных до устойчивого результата. */
  tensesMastered: number;
  /** Верно собранных предложений. */
  sentencesBuilt: number;
  /** Ответов в разделе сегодня — любой режим. */
  grammarToday: number;
  /** Разных глаголов, чьи формы трогали сегодня. */
  verbFormsToday: number;

  // ── Рейды ──
  // Итоги всех рейдов за всё время. Раньше по ним рисовался отдельный блок
  // медалей во вкладке «Рейд»; теперь это обычные медали витрины наград, и
  // считаются они здесь же, вместе с остальными.
  /** Суммарный урон по боссам. */
  raidDamage: number;
  /** Сколько ударов нанесено. */
  raidHits: number;
  /** Из них критических. */
  raidCrits: number;
  /** Самая длинная серия верных ответов в бою. */
  raidBestCombo: number;
  /** В скольких побеждённых рейдах реально участвовал. */
  raidWins: number;
  /** Сколько раз добил босса последним ударом. */
  raidLastHits: number;
  /** Ключи побеждённых боссов: golem, dragon, phantom, elemental, titan. */
  raidBosses: string[];
}

/**
 * Ответ POST /gamification/daily-login.
 *
 * Очки за вход зависят от длины серии: 5 за каждый её день, потолок 50.
 * nextPoints — сколько дадут завтра, если прийти снова; это единственный
 * честный повод вернуться, поэтому маскот его и называет.
 */
export interface DailyLoginResult {
  alreadyClaimed: boolean;
  loginStreak: number;
  totalPoints: number;
  xpLevel: number;
  pointsAwarded: number;
  /** Награда за завтрашний день при непрерывной серии. */
  nextPoints?: number;
  /** Серия оборвалась из-за пропуска и началась заново. */
  streakReset?: boolean;
  leveledUp?: boolean;
}

/** Ответ POST /gamification/daily-goal/claim. */
export interface DailyGoalClaimResult {
  alreadyClaimed: boolean;
  /** Сколько очков реально начислено. 0 — день ещё не закрыт. */
  awarded: number;
  /** Сколько положено за полностью закрытый день. */
  reward?: number;
  /** Что осталось сделать, по мнению СЕРВЕРА. */
  pending?: { kind: string; current: number; target: number }[];
  totalPoints: number;
  xpLevel: number;
  leveledUp?: boolean;
}

export function useGamification() {
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [dailyLoginResult, setDailyLoginResult] = useState<DailyLoginResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [toastAchievement, setToastAchievement] = useState<Achievement | null>(null);
  const toastQueue = useRef<Achievement[]>([]);
  const toastActive = useRef(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await apiFetch("/api/gamification/stats");
      // migrate old default name
      const data: GamificationStats = {
        ...raw,
        nextDailyGoalMinutes: raw.nextDailyGoalMinutes ?? raw.dailyGoalMinutes,
        dailyGoalClaimedToday: raw.dailyGoalClaimedToday ?? false,
        // Показатели раздела «Учёба» приехали позже остальных: со старого
        // сервера они не придут вовсе, и без запасного нуля медали считались бы
        // по undefined.
        grammarSolved: raw.grammarSolved ?? 0,
        verbFormsMastered: raw.verbFormsMastered ?? 0,
        tensesMastered: raw.tensesMastered ?? 0,
        sentencesBuilt: raw.sentencesBuilt ?? 0,
        grammarToday: raw.grammarToday ?? 0,
        verbFormsToday: raw.verbFormsToday ?? 0,
        // Рейдовые итоги — та же история: пока сервер не обновлён, их нет, а
        // медали должны считаться по нулям, а не по undefined.
        raidDamage: raw.raidDamage ?? 0,
        raidHits: raw.raidHits ?? 0,
        raidCrits: raw.raidCrits ?? 0,
        raidBestCombo: raw.raidBestCombo ?? 0,
        raidWins: raw.raidWins ?? 0,
        raidLastHits: raw.raidLastHits ?? 0,
        raidBosses: Array.isArray(raw.raidBosses) ? raw.raidBosses : [],
        mascotName: (raw.mascotName === "Оливер" || raw.mascotName === "Oliver" || !raw.mascotName)
          ? "Снежа"
          : raw.mascotName,
      };
      setStats(data);
      return data;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const claimDailyLogin = useCallback(async (): Promise<DailyLoginResult | null> => {
    try {
      const data = await apiFetch("/api/gamification/daily-login", { method: "POST" });
      setDailyLoginResult(data);
      if (data?.totalPoints !== undefined) {
        setStats((prev) => prev ? { ...prev, totalPoints: data.totalPoints, xpLevel: data.xpLevel, loginStreak: data.loginStreak } : prev);
      }
      return data;
    } catch {
      return null;
    }
  }, []);

  /**
   * Забрать очки за полностью закрытую цель дня.
   *
   * Вызывать можно свободно: сервер сам решает, положены ли очки, и выдаёт их
   * не больше одного раза в сутки. Клиент не считает награду и не показывает
   * её как начисленную до ответа — раньше цифры на карточке вообще ни к чему
   * не приводили, и это было хуже всего.
   */
  const claimDailyGoal = useCallback(async (): Promise<DailyGoalClaimResult | null> => {
    try {
      const data = await apiFetch("/api/gamification/daily-goal/claim", { method: "POST" });
      if (data?.awarded > 0 || data?.alreadyClaimed) {
        setStats((prev) => prev ? {
          ...prev,
          totalPoints: data.totalPoints ?? prev.totalPoints,
          xpLevel: data.xpLevel ?? prev.xpLevel,
          dailyGoalClaimedToday: true,
        } : prev);
      }
      return data;
    } catch {
      return null;
    }
  }, []);

  const updateDailyGoal = useCallback(async (minutes: number) => {
    try {
      const data = await apiFetch("/api/gamification/daily-goal", { method: "PATCH", body: JSON.stringify({ minutes }) });
      setStats((prev) => prev ? {
        ...prev,
        // Сегодняшняя цель не меняется: новая применяется только завтра.
        nextDailyGoalMinutes: data?.nextDailyGoalMinutes ?? minutes,
      } : prev);
    } catch { /* silent */ }
  }, []);

  const unlockAchievements = useCallback(async (achievementIds: string[]) => {
    try {
      const data = await apiFetch("/api/gamification/achievements/unlock", {
        method: "POST",
        body: JSON.stringify({ achievementIds }),
      });
      return data?.unlocked as string[] ?? [];
    } catch {
      return [];
    }
  }, []);

  const saveMascotName = useCallback(async (name: string) => {
    try {
      await apiFetch("/api/gamification/mascot-name", { method: "PATCH", body: JSON.stringify({ name }) });
      setStats((prev) => prev ? { ...prev, mascotName: name } : prev);
    } catch { /* silent */ }
  }, []);

  const showToast = useCallback((achievement: Achievement) => {
    toastQueue.current.push(achievement);
    if (toastActive.current) return;

    const showNext = () => {
      const next = toastQueue.current.shift();
      if (!next) { toastActive.current = false; return; }
      toastActive.current = true;
      setToastAchievement(next);
    };
    showNext();
  }, []);

  const hideToast = useCallback(() => {
    setToastAchievement(null);
    setTimeout(() => {
      const next = toastQueue.current.shift();
      if (next) { setToastAchievement(next); }
      else { toastActive.current = false; }
    }, 300);
  }, []);

  return {
    stats,
    loading,
    dailyLoginResult,
    toastAchievement,
    loadStats,
    claimDailyLogin,
    claimDailyGoal,
    updateDailyGoal,
    unlockAchievements,
    saveMascotName,
    showToast,
    hideToast,
  };
}
