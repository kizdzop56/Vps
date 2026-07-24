import { Redirect, Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { View, Text, TouchableOpacity, Platform, AppState, ActivityIndicator } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useColors } from "@/hooks/useColors";
import { useAuth, isTeacherOrAdmin } from "@/contexts/AuthContext";
import { useEffect, useRef, useCallback, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CalendarBadgeProvider, useCalendarBadge } from "@/contexts/CalendarBadgeContext";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import authStorage from "@/utils/authStorage";
import { TabGuide, TAB_GUIDE_CONTENT, type TabGuideTab } from "@/components/TabGuide";

export const SESSION_START_KEY = "timer_session_start";

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

function StudentTimerManager() {
  const tokenRef = useRef<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionActiveRef = useRef(false);

  const rawPost = useCallback((path: string) => {
    const token = tokenRef.current;
    if (!token) return;
    fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      keepalive: true,
    }).catch(() => {});
  }, []);

  const startNow = useCallback(() => {
    if (sessionActiveRef.current) return;
    sessionActiveRef.current = true;
    AsyncStorage.setItem(SESSION_START_KEY, String(Date.now()));
    rawPost("/api/time-tracking/start");
    rawPost("/api/users/ping");
  }, [rawPost]);

  const endNow = useCallback(() => {
    if (!sessionActiveRef.current) return;
    sessionActiveRef.current = false;
    AsyncStorage.removeItem(SESSION_START_KEY);
    rawPost("/api/time-tracking/end");
  }, [rawPost]);

  useEffect(() => {
    authStorage.getItem("auth_token").then((t) => {
      tokenRef.current = t;
      startNow();
    });

    heartbeatRef.current = setInterval(() => {
      const token = tokenRef.current;
      if (token && sessionActiveRef.current) {
        fetch(`${BASE_URL}/api/users/ping`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          keepalive: true,
        }).catch(() => {});
      }
    }, 60_000);

    if (Platform.OS === "web" && typeof document !== "undefined") {
      const onVisibilityChange = () => {
        if (document.hidden) endNow();
        else startNow();
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
      const onBeforeUnload = () => { endNow(); };
      window.addEventListener("beforeunload", onBeforeUnload);
      return () => {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("beforeunload", onBeforeUnload);
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        endNow();
      };
    }

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background" || nextState === "inactive") endNow();
      else if (nextState === "active") startNow();
    });

    return () => {
      appStateSub.remove();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      endNow();
    };
  }, []);

  return null;
}

function CalendarTabIcon({ color }: { color: string }) {
  const { unreadCount } = useCalendarBadge();
  return (
    <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
      <Feather name="calendar" size={22} color={color} />
      {unreadCount > 0 && (
        <View style={{
          position: "absolute", top: -4, right: -6,
          backgroundColor: "#e11d48", borderRadius: 8,
          minWidth: 16, height: 16, paddingHorizontal: 3,
          alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800", lineHeight: 14 }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </Text>
        </View>
      )}
    </View>
  );
}

// Storage key prefix for tab-first-visit tracking.
// Bump the version to re-show the guides after a redesign.
const TAB_SEEN_PREFIX = "tab_first_visit_v2_";

// Which tabs have a guide available
const GUIDE_TABS = new Set<string>(Object.keys(TAB_GUIDE_CONTENT));

interface CustomTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
  onFirstVisit: (tabName: TabGuideTab, navigateFn: () => void) => void;
  userId: number;
}

function CustomTabBar({ state, descriptors, navigation, onFirstVisit, userId }: CustomTabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // Hide the tab bar on full-screen quiz/detail screens
  const currentRouteName = state.routes[state.index]?.name ?? "";
  const hideTabBar = [
    "assignment/[id]",
    "submission-review/[id]",
  ].includes(currentRouteName);
  if (hideTabBar) return null;

  const visibleRoutes = state.routes.filter(
    (route: any) => descriptors[route.key].options.tabBarIcon !== undefined
  );

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: Math.max(insets.bottom, 8) + 8,
        left: 16,
        right: 16,
      }}
    >
      <View
        style={{
          backgroundColor: "rgba(255,255,255,0.62)",
          borderRadius: 28,
          paddingVertical: 8,
          paddingHorizontal: 4,
          flexDirection: "row",
          alignItems: "center",
          shadowColor: "#6366f1",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.18,
          shadowRadius: 20,
          elevation: 16,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.8)",
          ...(Platform.OS === "web"
            ? { backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }
            : {}),
        }}
      >
        {visibleRoutes.map((route: any) => {
          const { options } = descriptors[route.key];
          const isFocused = state.routes[state.index].key === route.key;

          const label =
            typeof options.tabBarLabel === "string"
              ? options.tabBarLabel
              : typeof options.title === "string"
              ? options.title
              : route.name;

          const navigateToTab = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onPress = async () => {
            if (isFocused) return;

            const tabName = route.name as TabGuideTab;

            // Only show guide for tabs that have content + not yet seen.
            // The "seen" flag is written when the guide is CLOSED (Понятно),
            // not here — so an interrupted guide shows again next time.
            if (GUIDE_TABS.has(tabName)) {
              const seenKey = `${TAB_SEEN_PREFIX}${userId}_${tabName}`;
              const seen = await AsyncStorage.getItem(seenKey);
              if (!seen) {
                onFirstVisit(tabName, navigateToTab);
                return;
              }
            }

            navigateToTab();
          };

          return (
            <TouchableOpacity
              key={route.key}
              style={{ flex: 1, alignItems: "center", gap: 3 }}
              onPress={onPress}
              activeOpacity={0.7}
            >
              {isFocused ? (
                <LinearGradient
                  colors={["#7c3aed", "#818cf8"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    borderRadius: 18,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 50,
                  }}
                >
                  {options.tabBarIcon?.({ color: "#ffffff", size: 22, focused: true })}
                </LinearGradient>
              ) : (
                <View
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 50,
                  }}
                >
                  {options.tabBarIcon?.({ color: colors.mutedForeground, size: 22, focused: false })}
                </View>
              )}
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: isFocused ? "700" : "500",
                  color: isFocused ? "#7c3aed" : colors.mutedForeground,
                  letterSpacing: 0.1,
                }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function MainLayoutInner() {
  const { user, isLoading } = useAuth();
  const colors = useColors();

  // State for the tab guide
  const [guideState, setGuideState] = useState<{
    visible: boolean;
    tabName: TabGuideTab | null;
    navigateFn: (() => void) | null;
  }>({ visible: false, tabName: null, navigateFn: null });

  const handleFirstVisit = useCallback((tabName: TabGuideTab, navigateFn: () => void) => {
    setGuideState({ visible: true, tabName, navigateFn });
  }, []);

  const handleGuideClose = useCallback(() => {
    const nav = guideState.navigateFn;
    // Mark the guide as seen only after the user actually closed it (Понятно) —
    // so it is shown once per user per tab and never again afterwards.
    if (guideState.tabName && user?.id) {
      AsyncStorage.setItem(`${TAB_SEEN_PREFIX}${user.id}_${guideState.tabName}`, "1").catch(() => {});
    }
    setGuideState({ visible: false, tabName: null, navigateFn: null });
    // Navigate after the modal begins to close
    if (nav) setTimeout(nav, 150);
  }, [guideState.navigateFn, guideState.tabName, user?.id]);

  // Wait for AuthProvider to finish restoring the session from storage before
  // deciding to redirect — otherwise a page refresh momentarily has `user === null`
  // (before the stored token is validated) and kicks the user back to login.
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  const isStudent = user.role === "student";
  const isTeacher = isTeacherOrAdmin(user.role);
  const isParent = user.role === "parent";

  return (
    <>
      {isStudent && <StudentTimerManager />}
      <Tabs
        tabBar={(props) => (
          <CustomTabBar
            {...props}
            onFirstVisit={handleFirstVisit}
            userId={user.id}
          />
        )}
        screenOptions={{
          headerShown: false,
          // Bottom-tabs typings don't declare contentStyle (it's a stack
          // option), but the runtime honors it on web — keep the behavior
          // while satisfying the type checker via an untyped spread.
          ...({ contentStyle: { backgroundColor: "transparent" } } as object),
        }}
      >
        <Tabs.Screen
          name="assignments"
          options={{
            title: "Задания",
            tabBarIcon: ({ color }) => <Feather name="book-open" size={22} color={color} />,
          }}
        />

        <Tabs.Screen name="history" options={{ href: null }} />

        <Tabs.Screen
          name="leaderboard"
          options={isStudent
            ? { title: "Рейтинг", tabBarIcon: ({ color }) => <Feather name="award" size={22} color={color} /> }
            : { href: null }
          }
        />

        <Tabs.Screen name="timer" options={{ href: null }} />

        <Tabs.Screen
          name="students"
          options={(isTeacher || isParent)
            ? {
                title: isParent ? "Дети" : "Ученики",
                tabBarIcon: ({ color }) => <Feather name="users" size={22} color={color} />,
              }
            : { href: null }
          }
        />

        <Tabs.Screen
          name="analysis"
          options={isTeacher
            ? { title: "Анализ", tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={22} color={color} /> }
            : { href: null }
          }
        />

        <Tabs.Screen
          name="calendar"
          options={(isTeacher || isStudent)
            ? { title: "Календарь", tabBarIcon: ({ color }) => <CalendarTabIcon color={color} /> }
            : { href: null }
          }
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: "Профиль",
            tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
          }}
        />

        <Tabs.Screen name="student/[id]" options={{ href: null }} />
        <Tabs.Screen name="assignment/[id]" options={{ href: null }} />
        <Tabs.Screen name="create-assignment" options={{ href: null }} />
        <Tabs.Screen name="friend/[id]" options={{ href: null }} />
        <Tabs.Screen name="teacher-results/[id]" options={{ href: null }} />
        <Tabs.Screen name="submission-review/[id]" options={{ href: null }} />
      </Tabs>

      {/* Preload mascot image so it appears instantly when TabGuide opens */}
      <ExpoImage
        source={require("@/assets/images/mascot_full.png")}
        style={{ width: 0, height: 0, opacity: 0, position: "absolute" }}
        cachePolicy="memory"
      />

      <TabGuide
        tabName={guideState.tabName}
        visible={guideState.visible}
        mascotName={isStudent ? "Снежа" : undefined}
        onClose={handleGuideClose}
      />
    </>
  );
}

export default function MainLayout() {
  return (
    <CalendarBadgeProvider>
      <MainLayoutInner />
    </CalendarBadgeProvider>
  );
}
