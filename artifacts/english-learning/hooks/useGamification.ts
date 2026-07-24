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
  dailyGoalMinutes: number;
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
}

export interface DailyLoginResult {
  alreadyClaimed: boolean;
  loginStreak: number;
  totalPoints: number;
  xpLevel: number;
  pointsAwarded: number;
  bonusPoints?: number;
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

  const updateDailyGoal = useCallback(async (minutes: number) => {
    try {
      await apiFetch("/api/gamification/daily-goal", { method: "PATCH", body: JSON.stringify({ minutes }) });
      setStats((prev) => prev ? { ...prev, dailyGoalMinutes: minutes } : prev);
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
    updateDailyGoal,
    unlockAchievements,
    saveMascotName,
    showToast,
    hideToast,
  };
}
