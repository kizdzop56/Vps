import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/contexts/AuthContext";
import authStorage from "@/utils/authStorage";

const SEEN_KEY = "calendar_custom_req_seen_at";
const POLL_MS  = 20_000;

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

async function fetchCustomRequests(): Promise<{ id: number; createdAt: string }[]> {
  const token = await authStorage.getItem("auth_token");
  const res = await fetch(`${BASE_URL}/api/calendar/custom-requests`, {
    headers: { Authorization: `Bearer ${token ?? ""}` },
  });
  if (!res.ok) return [];
  return res.json();
}

interface CalendarBadgeContextValue {
  unreadCount: number;
  markSeen: () => Promise<void>;
}

const CalendarBadgeContext = createContext<CalendarBadgeContextValue>({
  unreadCount: 0,
  markSeen: async () => {},
});

export function CalendarBadgeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher" || user?.role === "admin";

  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenRef = useRef<string | null>(null);

  const computeUnread = useCallback(async () => {
    if (!isTeacher) { setUnreadCount(0); return; }

    if (lastSeenRef.current === null) {
      lastSeenRef.current = await AsyncStorage.getItem(SEEN_KEY) ?? new Date(0).toISOString();
    }

    const rows = await fetchCustomRequests().catch(() => []);
    const seenAt = lastSeenRef.current ?? new Date(0).toISOString();
    const count = rows.filter((r) => r.createdAt > seenAt).length;
    setUnreadCount(count);
  }, [isTeacher]);

  const markSeen = useCallback(async () => {
    const now = new Date().toISOString();
    lastSeenRef.current = now;
    await AsyncStorage.setItem(SEEN_KEY, now);
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    computeUnread();
    const id = setInterval(computeUnread, POLL_MS);
    return () => clearInterval(id);
  }, [computeUnread]);

  return (
    <CalendarBadgeContext.Provider value={{ unreadCount, markSeen }}>
      {children}
    </CalendarBadgeContext.Provider>
  );
}

export function useCalendarBadge() {
  return useContext(CalendarBadgeContext);
}
