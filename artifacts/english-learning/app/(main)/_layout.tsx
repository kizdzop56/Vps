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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlacementTest } from "@/components/PlacementTest";
import { fc, apiFetch } from "@/hooks/useFlashcards";

export const SESSION_START_KEY = "timer_session_start";

const BASE_URL = process.env["EXPO_PUBLIC_DOMAIN"]
  ? `https://${process.env["EXPO_PUBLIC_DOMAIN"]}`
  : "";

function StudentTimerManager() {
  const tokenRef = useRef<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionActiveRef = useRef(false);

  const rawPost = useCallback((path: string): Promise<void> => {
    const token = tokenRef.current;
    if (!token) return Promise.resolve();
    return fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      keepalive: true,
    }).then(() => undefined).catch(() => undefined);
  }, []);

  const startNow = useCallback(() => {
    if (sessionActiveRef.current) return;
    sessionActiveRef.current = true;
    AsyncStorage.setItem(SESSION_START_KEY, String(Date.now()));
    void rawPost("/api/time-tracking/start").then(() => rawPost("/api/users/ping"));
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

const TAB_SEEN_PREFIX = "tab_first_visit_v2_";
const GUIDE_TABS = new Set<string>(Object.keys(TAB_GUIDE_CONTENT));

interface CustomTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
  onFirstVisit: (tabName: TabGuideTab, navigateFn: () => void) => void;
  userId: number;
  /** Список вкладок, гайд которых уже показан (загружен с сервера). */
  seenGuides: Set<string>;
  /** true — данные с сервера получены и можно показывать гайды. */
  seenGuidesLoaded: boolean;
}

function CustomTabBar({
  state, descriptors, navigation,
  onFirstVisit, userId, seenGuides, seenGuidesLoaded,
}: CustomTabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const currentRouteName = state.routes[state.index]?.name ?? "";
  const hideTabBar = [
    "assignment/[id]",
    "submission-review/[id]",
    "flashcards/study/[deckId]",
    "flashcards/placement",
    "chat/[userId]",
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

            if (GUIDE_TABS.has(tabName)) {
              // Пока серверные данные ещё грузятся — просто навигируем,
              // не показываем гайд (чтобы не показать его повторно).
              if (!seenGuidesLoaded) {
                navigateToTab();
                return;
              }
              // Основная проверка: видел ли уже этот гайд (сервер)?
              if (!seenGuides.has(tabName)) {
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
  const qc = useQueryClient();

  const isStudentRole = user?.role === "student";
  const placementSettingsQ = useQuery({
    queryKey: ["fc-settings"],
    queryFn: fc.getSettings,
    enabled: !!user && isStudentRole,
    // Настройки меняются редко (пользователь явно что-то меняет).
    // 10 минут не перезапрашивать при переходах между вкладками.
    staleTime: 10 * 60_000,
  });

  // Список просмотренных гайдов — хранится на сервере, чтобы не сбрасываться
  // при очистке localStorage или входе с другого устройства.
  const onboardingSeenQ = useQuery({
    queryKey: ["onboarding-seen"],
    queryFn: () => apiFetch<{ seen: string[] }>("/api/users/onboarding-seen"),
    enabled: !!user,
    staleTime: Infinity, // меняется только при явном invalidate после закрытия гайда
  });
  const seenGuides = new Set<string>(onboardingSeenQ.data?.seen ?? []);
  const seenGuidesLoaded = onboardingSeenQ.isSuccess;

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
    const tab = guideState.tabName;

    if (tab && user?.id) {
      // Записываем на сервер — основное хранилище.
      apiFetch("/api/users/onboarding-seen", {
        method: "POST",
        body: JSON.stringify({ tab }),
      }).catch(() => {});
      // Локальный кэш — быстрый фолбэк на случай медленного ответа сервера.
      authStorage.setItem(`${TAB_SEEN_PREFIX}${user.id}_${tab}`, "1").catch(() => {});
      // Обновляем кэш React Query, чтобы следующее нажатие на вкладку уже
      // видело актуальный список без лишнего запроса на сервер.
      qc.setQueryData<{ seen: string[] }>(["onboarding-seen"], (old) => ({
        seen: [...(old?.seen ?? []), tab],
      }));
    }

    setGuideState({ visible: false, tabName: null, navigateFn: null });
    if (nav) setTimeout(nav, 150);
  }, [guideState.navigateFn, guideState.tabName, user?.id, qc]);

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

  const needsPlacement = !!placementSettingsQ.data && !placementSettingsQ.data.placementDone;
  const showPlacement = isStudent && needsPlacement;

  return (
    <>
      {isStudent && <StudentTimerManager />}
      <Tabs
        tabBar={(props) => (
          <CustomTabBar
            {...props}
            onFirstVisit={handleFirstVisit}
            userId={user.id}
            seenGuides={seenGuides}
            seenGuidesLoaded={seenGuidesLoaded}
          />
        )}
        screenOptions={{
          headerShown: false,
          ...({ contentStyle: { backgroundColor: "transparent" } } as object),
        }}
      >
        <Tabs.Screen
          name="assignments"
          options={isParent
            ? { href: null }
            : {
                title: "Задания",
                tabBarIcon: ({ color }) => <Feather name="book-open" size={22} color={color} />,
              }
          }
        />

        <Tabs.Screen
          name="progress"
          options={isParent
            ? { title: "Успеваемость", tabBarIcon: ({ color }) => <Feather name="trending-up" size={22} color={color} /> }
            : { href: null }
          }
        />

        <Tabs.Screen
          name="flashcards"
          options={isStudent
            ? { title: "Слова", tabBarIcon: ({ color }) => <Feather name="layers" size={22} color={color} /> }
            : { href: null }
          }
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
          name="friends"
          options={isTeacher
            ? {
                title: "Друзья",
                tabBarIcon: ({ color }) => <Feather name="message-circle" size={22} color={color} />,
              }
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

        <Tabs.Screen name="chat/[userId]" options={{ href: null }} />
        <Tabs.Screen name="student/[id]" options={{ href: null }} />
        <Tabs.Screen name="assignment/[id]" options={{ href: null }} />
        <Tabs.Screen name="create-assignment" options={{ href: null }} />
        <Tabs.Screen name="friend/[id]" options={{ href: null }} />
        <Tabs.Screen name="teacher-results/[id]" options={{ href: null }} />
        <Tabs.Screen name="submission-review/[id]" options={{ href: null }} />
        <Tabs.Screen name="flashcards/study/[deckId]" options={{ href: null }} />
        <Tabs.Screen name="flashcards/session" options={{ href: null }} />
        <Tabs.Screen name="flashcards/hard" options={{ href: null }} />
        <Tabs.Screen name="flashcards/marathon" options={{ href: null }} />
        <Tabs.Screen name="flashcards/placement" options={{ href: null }} />
        <Tabs.Screen name="flashcards/stats" options={{ href: null }} />
        <Tabs.Screen name="flashcards/new-deck" options={{ href: null }} />
        <Tabs.Screen name="flashcards/deck/[id]" options={{ href: null }} />
        <Tabs.Screen name="flashcards/preview/[id]" options={{ href: null }} />
      </Tabs>

      {showPlacement && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.background }}>
          <PlacementTest onDone={() => {
            qc.invalidateQueries({ queryKey: ["fc-settings"] });
            placementSettingsQ.refetch();
          }} />
        </View>
      )}

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
