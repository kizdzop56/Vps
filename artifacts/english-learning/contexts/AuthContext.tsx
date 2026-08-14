import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import authStorage from "@/utils/authStorage";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { queryClient } from "@/app/_layout";

export type KnowledgeLevel =
  | "starter"
  | "beginner"
  | "elementary"
  | "intermediate"
  | "upper_intermediate";

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  surname?: string | null;
  role: "student" | "parent" | "admin" | "teacher";
  age: number | null;
  dateOfBirth: string | null;
  knowledgeLevel: KnowledgeLevel | null;
  email?: string | null;
  emailVerified?: boolean;
  totalPoints: number;
  totalTimeMinutes?: number;
  avatarEmoji?: string;
  avatarColor?: string;
  avatarUrl?: string | null;
  bio?: string;
  inviteCode?: string;
  createdAt: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Токен для API-клиента ────────────────────────────────────────────
  //
  // ПОЧЕМУ РЕФ, А НЕ "useEffect(() => setAuthTokenGetter(() => token), [token])".
  //
  // Раньше геттер обновлялся именно так. Проблема: React выполняет эффекты
  // дочерних компонентов РАНЬШЕ эффекта родителя в одном и том же коммите.
  // Когда сессия восстанавливается из хранилища, setToken(...) и setUser(...)
  // вызываются в одном тике — и в этом же ре-рендере экран профиля переводит
  // свои react-query хуки (useGetStudentSubmissions, useGetStudentTimeStats)
  // из enabled=false в enabled=true. Эффект самого запроса (дочерний)
  // срабатывает раньше эффекта AuthProvider (родительского), поэтому фетч
  // уходил с ЕЩЁ СТАРЫМ геттером (до его обновления) — без Authorization
  // заголовка. Результат — гарантированный 401 на первом запросе после
  // восстановления сессии (см. E2E: /profile и /history).
  //
  // Ref обновляется СИНХРОННО, в момент вызова applyToken — до всякого
  // рендера и до всяких эффектов. Геттер регистрируется один раз и просто
  // читает текущее значение рефа, поэтому от порядка эффектов больше не
  // зависит вообще.
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    setAuthTokenGetter(() => tokenRef.current);
  }, []);

  const applyToken = useCallback((next: string | null) => {
    tokenRef.current = next;
    setToken(next);
  }, []);

  useEffect(() => {
    const loadAuth = async () => {
      try {
        const storedToken = await authStorage.getItem("auth_token");
        const storedUser = await authStorage.getItem("auth_user");
        if (storedToken && storedUser) {
          const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
            ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
            : "";
          try {
            const res = await fetch(`${BASE_URL}/api/auth/me`, {
              headers: { Authorization: `Bearer ${storedToken}` },
            });
            if (res.ok) {
              const freshUser = await res.json();
              // Keep the session alive regardless of emailVerified.
              // The routing layer (index.tsx) redirects unverified users to the
              // confirm-email screen if needed. Force-clearing a valid token here
              // was logging every user out on each app restart when emailVerified
              // was false (which was the case for all teacher-created accounts).
              await authStorage.setItem("auth_user", JSON.stringify(freshUser));
              applyToken(storedToken);
              setUser(freshUser);
            } else if (res.status === 401) {
              // Token invalid or expired — clear session
              await authStorage.removeItem("auth_token");
              await authStorage.removeItem("auth_user");
            } else {
              // Server error (502/503/etc) — keep cached session
              applyToken(storedToken);
              setUser(JSON.parse(storedUser));
            }
          } catch {
            // Network error — keep cached session
            applyToken(storedToken);
            setUser(JSON.parse(storedUser));
          }
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    };
    loadAuth();
  }, [applyToken]);

  const login = useCallback(async (newToken: string, newUser: AuthUser) => {
    await authStorage.setItem("auth_token", newToken);
    await authStorage.setItem("auth_user", JSON.stringify(newUser));
    // Invalidate stale cache so data is refetched after login (keeps old values visible while loading)
    queryClient.invalidateQueries();
    applyToken(newToken);
    setUser(newUser);
  }, [applyToken]);

  const updateUser = useCallback(async (patch: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      authStorage.setItem("auth_user", JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const logout = useCallback(async () => {
    // End session and mark offline BEFORE clearing token (token must be valid for these requests)
    if (tokenRef.current) {
      const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
        ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
        : "";
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${tokenRef.current}` };
      try {
        await Promise.all([
          fetch(`${BASE_URL}/api/time-tracking/end`, { method: "POST", headers }),
          fetch(`${BASE_URL}/api/users/offline`, { method: "POST", headers }),
        ]);
      } catch { /* silent */ }
    }
    await authStorage.removeItem("auth_token");
    await authStorage.removeItem("auth_user");
    applyToken(null);
    setUser(null);
  }, [applyToken]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// Helper to check if user has teacher/admin privileges
export function isTeacherOrAdmin(role: string): boolean {
  return role === "teacher" || role === "admin";
}

// Knowledge level metadata
export const LEVEL_META: Record<KnowledgeLevel, { labelRu: string; label: string; color: string; ageRange: string }> = {
  starter:            { labelRu: "Стартовый",   label: "Starter",           color: "#8b5cf6", ageRange: "5–6 лет" },
  beginner:           { labelRu: "Начинающий",  label: "Beginner",          color: "#06b6d4", ageRange: "7–9 лет" },
  elementary:         { labelRu: "Элементарный",label: "Elementary",        color: "#10b981", ageRange: "10–12 лет" },
  intermediate:       { labelRu: "Средний",     label: "Intermediate",      color: "#f59e0b", ageRange: "13–15 лет" },
  upper_intermediate: { labelRu: "Продвинутый", label: "Upper Intermediate", color: "#ef4444", ageRange: "16–18 лет" },
};
